// ==UserScript==
// @name         IG Clean — Health Check
// @namespace    ig-clean-healthcheck
// @version      1.2
// @description  Verifies IG Clean selectors still resolve; opens a GitHub PR when they break
// @author       Lukas Westholt
// @match        https://www.instagram.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/LukasWestholt/instagram-distraction-free-js/main/ig_clean_healthcheck.user.js
// @downloadURL  https://raw.githubusercontent.com/LukasWestholt/instagram-distraction-free-js/main/ig_clean_healthcheck.user.js
// ==/UserScript==

(function () {
    'use strict';

    const REPO = 'LukasWestholt/instagram-distraction-free-js';
    const BASE_BRANCH = 'main';
    const DOM_WAIT_MS = 8000; // wait for SPA to finish rendering
    const API_WAIT_MS = 15000; // extra wait to catch lazy feed responses
    const REPORT_KEY = 'ig_clean_health_last_report';

    // -------------------------------------------------------------------------
    // DOM checks — selector + page context + human description
    // -------------------------------------------------------------------------
    const isHome = location.pathname === '/';
    const isMobile = window.innerWidth < 768;

    const igConfig = (() => {
        try {
            return JSON.parse(localStorage.getItem('ig_clean_config')) || {};
        } catch (_) {
            return {};
        }
    })();

    const DOM_CHECKS = [
        {
            id: 'story_tray',
            selector: '[data-pagelet="story_tray"]',
            desc: 'Stories tray — used by hideStoriesBar and hideStoriesNotificationDots',
            active: isHome,
        },
        {
            id: 'dm_float',
            selector: '[data-pagelet="IGDChatTabsRootContentOffMsys"]',
            desc: 'Floating DM button — used by hideDMFloatingButton',
            active: isHome && isMobile,
        },
        {
            id: 'feed_articles',
            selector: 'main article',
            desc: 'Feed article elements — required for post scanning and session limit',
            active: isHome,
        },
        {
            id: 'nav_explore',
            selector: 'a[href="/explore/"]',
            desc: 'Explore nav link — used by disableExplore sidebar hiding',
            active: !location.pathname.startsWith('/explore'),
        },
        {
            id: 'nav_reels',
            selector: 'a[href="/reels/"]',
            desc: 'Reels nav link — used by disableReels sidebar hiding',
            active: !location.pathname.startsWith('/reels'),
        },
        {
            id: 'like_counts',
            selector: '[aria-label$=" likes"], [aria-label$=" like"], [aria-label*=" likes,"], [aria-label*=" views"]',
            desc: 'Like / view count elements still in DOM — JSON scrubbing ran but counts were not removed (CSS fallback also failed)',
            // JSON scrubbing nulls out count fields so React never renders these elements.
            // Absence of elements is a SUCCESS. Only flag if the JSON layer ran (feed seen)
            // AND count elements are still present, meaning both layers failed.
            active: isHome && igConfig.hideLikeCounts === true && sessionStorage.getItem('ig_clean_feed_seen') === '1',
            invert: true,
        },
        // Threads link is inside a "More apps from Meta" popup (role="dialog") that only
        // renders on click — never present at check time, so DOM-checking it always fails.
        // Hiding is CSS-based (a[href*="threads.com"]) and does not need a DOM check.
    ];

    // -------------------------------------------------------------------------
    // Runtime checks via sessionStorage signals set by the main script
    // -------------------------------------------------------------------------
    const RUNTIME_CHECKS = [
        {
            id: 'feed_timeline_key',
            sessionKey: 'ig_clean_feed_seen',
            desc: 'Feed timeline JSON key (`xdt_api__v1__feed__timeline__connection`) — required for all JSON-layer filters',
            active: () => isHome,
        },
        {
            id: 'fetch_hook',
            sessionKey: 'ig_clean_fetch_hooked',
            desc: 'fetch/XHR hook for error report suppression (`suppressErrorReports`) — hook was not installed',
            active: () => true,
        },
    ];

    // Also hook Response.prototype.json as a backup in case the main script
    // sets sessionStorage after our check runs (e.g. late pagination fetch).
    const _origJson = Response.prototype.json;
    Response.prototype.json = function () {
        return _origJson.call(this).then((data) => {
            if (
                data?.data?.xdt_api__v1__feed__timeline__connection ||
                data?.xdt_api__v1__feed__timeline__connection ||
                data?.result?.data?.xdt_api__v1__feed__timeline__connection
            ) {
                sessionStorage.setItem('ig_clean_feed_seen', '1');
            }
            return data;
        });
    };

    // -------------------------------------------------------------------------
    // GitHub helpers
    // -------------------------------------------------------------------------
    function ghFetch(method, path, body) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url: `https://api.github.com${path}`,
                headers: {
                    Authorization: `token ${GM_getValue('ig_clean_gh_token', '')}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'ig-clean-healthcheck',
                },
                data: body ? JSON.stringify(body) : undefined,
                onload: (r) => {
                    try {
                        resolve({ status: r.status, body: JSON.parse(r.responseText) });
                    } catch (_) {
                        resolve({ status: r.status, body: r.responseText });
                    }
                },
                onerror: reject,
            });
        });
    }

    function buildReport(today, domFailures, runtimeFailures) {
        const lines = [
            '# IG Clean — Selector Health Report',
            '',
            `**Detected:** ${new Date().toUTCString()}`,
            `**Page:** \`${location.pathname}\` (viewport: ${window.innerWidth}×${window.innerHeight})`,
            '',
        ];

        if (domFailures.length) {
            lines.push('## Broken DOM Selectors', '');
            lines.push(
                'These selectors returned no elements. Any CSS rule or DOM scan depending on them is silently broken.',
                ''
            );
            for (const f of domFailures) {
                lines.push(`- \`${f.selector}\`  `);
                lines.push(`  ${f.desc}`);
            }
            lines.push('');
        }

        if (runtimeFailures.length) {
            lines.push('## Runtime Hook / API Failures', '');
            lines.push(
                'These signals were missing from the session state. The indicated features are likely broken.',
                ''
            );
            for (const f of runtimeFailures) {
                lines.push(`- ${f.desc}`);
            }
            lines.push('');
        }

        lines.push('---', '_Auto-filed by [IG Clean Health Check](../ig_clean_healthcheck.user.js)_');
        return lines.join('\n');
    }

    async function createPR(domFailures, apiFailures) {
        const token = GM_getValue('ig_clean_gh_token', '');
        if (!token) {
            console.warn(
                '[IG-Health] No GitHub token set — cannot file PR.\n' +
                    'Save one with: IG_HEALTH.setToken("ghp_your_token_here")\n' +
                    'Token needs: Contents (read/write) + Pull requests (write) on the repo.'
            );
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const branch = `health/${today}`;

        // Bail if a PR for this branch already exists
        const existing = await ghFetch('GET', `/repos/${REPO}/pulls?head=LukasWestholt:${branch}&state=open`);
        if (Array.isArray(existing.body) && existing.body.length > 0) {
            console.log(`[IG-Health] PR already open for ${today}: ${existing.body[0].html_url}`);
            return;
        }

        // Get base SHA
        const refRes = await ghFetch('GET', `/repos/${REPO}/git/ref/heads/${BASE_BRANCH}`);
        const sha = refRes.body?.object?.sha;
        if (!sha) {
            console.error('[IG-Health] Could not read base branch SHA — check your token scope');
            return;
        }

        // Create branch (422 = already exists, harmless)
        const branchRes = await ghFetch('POST', `/repos/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha });
        if (branchRes.status !== 201 && branchRes.status !== 422) {
            console.error('[IG-Health] Branch creation failed:', branchRes);
            return;
        }

        // Build HEALTH.md content
        const report = buildReport(today, domFailures, apiFailures);
        const content = btoa(unescape(encodeURIComponent(report)));

        // Get existing HEALTH.md SHA on branch (needed to overwrite)
        let fileSha;
        const fileRes = await ghFetch('GET', `/repos/${REPO}/contents/HEALTH.md?ref=${branch}`);
        if (fileRes.status === 200) fileSha = fileRes.body?.sha;

        // Create / update HEALTH.md
        const putRes = await ghFetch('PUT', `/repos/${REPO}/contents/HEALTH.md`, {
            message: `health: broken selectors detected ${today}`,
            content,
            branch,
            ...(fileSha ? { sha: fileSha } : {}),
        });
        if (putRes.status !== 200 && putRes.status !== 201) {
            console.error('[IG-Health] Could not write HEALTH.md:', putRes);
            return;
        }

        // Open PR
        const prRes = await ghFetch('POST', `/repos/${REPO}/pulls`, {
            title: `[Health Check] Broken selectors detected — ${today}`,
            body: report,
            head: branch,
            base: BASE_BRANCH,
        });

        if (prRes.body?.html_url) {
            console.log(`[IG-Health] PR filed: ${prRes.body.html_url}`);
        } else {
            console.error('[IG-Health] PR creation failed:', prRes.body);
        }
    }

    // -------------------------------------------------------------------------
    // Main check runner
    // -------------------------------------------------------------------------
    async function runChecks() {
        const domFailures = [];
        for (const check of DOM_CHECKS) {
            if (!check.active) continue;
            const found = !!document.querySelector(check.selector);
            const broken = check.invert ? found : !found;
            if (broken) {
                console.warn(`[IG-Health] BROKEN — ${check.selector}\n  ${check.desc}`);
                domFailures.push(check);
            }
        }

        // Give the page extra time for lazy API calls and hook signals to appear
        await new Promise((r) => setTimeout(r, API_WAIT_MS - DOM_WAIT_MS));

        const runtimeFailures = [];
        for (const check of RUNTIME_CHECKS) {
            if (!check.active()) continue;
            if (sessionStorage.getItem(check.sessionKey) !== '1') {
                console.warn(`[IG-Health] BROKEN — ${check.id}\n  ${check.desc}`);
                runtimeFailures.push(check);
            }
        }

        // Log summary
        const total = domFailures.length + runtimeFailures.length;
        if (total === 0) {
            console.log('[IG-Health] ✓ All checks passed');
            return;
        }
        console.warn(`[IG-Health] ${total} check(s) failed — see above for details`);

        // Rate-limit: one PR per day
        const today = new Date().toISOString().slice(0, 10);
        if (GM_getValue(REPORT_KEY, '') === today) {
            console.warn('[IG-Health] Already reported today — skipping PR');
            return;
        }
        GM_setValue(REPORT_KEY, today);

        await createPR(domFailures, runtimeFailures);
    }

    // -------------------------------------------------------------------------
    // Entry point + public API
    // -------------------------------------------------------------------------
    setTimeout(runChecks, DOM_WAIT_MS);

    window.IG_HEALTH = {
        setToken: (t) => {
            GM_setValue('ig_clean_gh_token', t);
            console.log('[IG-Health] Token saved.');
        },
        getToken: () => GM_getValue('ig_clean_gh_token', '(not set)'),
        runNow: () => runChecks(),
        clearReport: () => {
            GM_setValue(REPORT_KEY, '');
            console.log('[IG-Health] Daily-report lock cleared.');
        },
    };

    console.log('[IG-Health] Loaded. Run IG_HEALTH.setToken("ghp_...") to enable GitHub PR filing.');
})();
