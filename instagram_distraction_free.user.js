// ==UserScript==
// @name         Instagram Distraction Free
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Remove Sponsored and Suggested posts from Instagram. Supports desktop and iOS/mobile.
// @author       Antigravity
// @match        *://*.instagram.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('[IG-Clean] v2.0 initialized.');

    const originalParse = JSON.parse;
    const originalResponseJson = Response.prototype.json;

    const isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

    // === CONFIGURATION ===
    const DEFAULT_CONFIG = {
        // Sponsored
        removeSponsored: true,
        blurSponsored: true,
        // Suggested
        removeSuggested: true,
        blurSuggested: true,
        // Navigation
        redirectToFollowing: true,
        disableExplore: true,
        disableReels: true,
        hideThreadsNav: true,
        // Feed content
        hideNewPostsBanner: true,
        filterCollabPosts: false,
        filterAiContent: false,
        filterAddYours: false,
        // Interface
        hideDownloadAppBanner: true,
        hideBoostButtons: false,
        hideTabTitleBadge: true,
        hideLikeCounts: false,
        hideDMFloatingButton: false,
        hideStoriesBar: false,
        hideStoriesNotificationDots: false,
        // Privacy & limits
        suppressNotificationNag: true,
        suppressErrorReports: true,
        suppressSelfXSSWarning: true,
        blockDMReadReceipts: false,
        autoDismissCookieBanner: true,
        muteAutoplayVideo: false,
        hideActiveNow: false,
        sessionPostLimit: 0,
    };

    // Merge stored config with defaults so new keys get their defaults for existing users
    let config = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem('ig_clean_config'));
            return stored ? { ...DEFAULT_CONFIG, ...stored } : { ...DEFAULT_CONFIG };
        } catch (_) {
            return { ...DEFAULT_CONFIG };
        }
    })();

    function saveConfig() {
        localStorage.setItem('ig_clean_config', JSON.stringify(config));
    }

    let cleanedCount = { ads: 0, suggested: 0 };

    // === EARLY INTERCEPTS (before DOM) ===

    if (config.suppressNotificationNag) {
        try { Notification.requestPermission = () => Promise.resolve('default'); } catch (_) {}
    }

    if (config.suppressSelfXSSWarning) {
        // Instagram fires two console.log calls when devtools is open:
        //   "%cStop!" (big red CSS) + a paragraph about social engineering.
        // Useless noise for anyone who deliberately installed a userscript.
        const _origLog = console.log;
        console.log = function (...args) {
            const first = typeof args[0] === 'string' ? args[0] : '';
            if (first === '%cStop!' || first.includes('browser feature intended for developers') || first.includes('selfxss'))
                return;
            return _origLog.apply(console, args);
        };
    }

    // === FETCH / XHR INTERCEPTOR ===
    // Single hook handles all request-level blocking to avoid chaining multiple wrappers.
    ;(function () {
        const ERROR_PATH   = '/error/ig_web_error_reports/';
        // Identified from HAR: these two mutations mark DMs as read.
        // Matched via X-FB-Friendly-Name header (stable across doc_id changes).
        const READ_MUTATIONS = new Set([
            'useIGDMarkThreadAsReadMutation',
            'useIGDMarkThreadAsReadValidationMutation',
        ]);

        function getFriendlyName(init) {
            const h = init?.headers;
            if (!h) return '';
            if (h instanceof Headers) return h.get('X-FB-Friendly-Name') || '';
            return h['X-FB-Friendly-Name'] || h['x-fb-friendly-name'] || '';
        }

        const _origFetch = window.fetch;
        window.fetch = function (resource, init) {
            const url = resource instanceof Request ? resource.url : String(resource);

            if (config.suppressErrorReports && url.includes(ERROR_PATH))
                return Promise.resolve(new Response('', { status: 200 }));

            if (config.blockDMReadReceipts && url.includes('/api/graphql') &&
                READ_MUTATIONS.has(getFriendlyName(init))) {
                console.log('[IG-Clean] Blocked DM read receipt:', getFriendlyName(init));
                return Promise.resolve(new Response(JSON.stringify({ data: {} }), {
                    status: 200, headers: { 'Content-Type': 'application/json' },
                }));
            }

            return _origFetch.apply(this, arguments);
        };

        // XHR belt-and-suspenders (Instagram may fall back to XHR on some paths)
        const _origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._igUrl = String(url);
            return _origOpen.apply(this, [method, url, ...rest]);
        };
        const _origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (name === 'X-FB-Friendly-Name') this._igFriendlyName = value;
            return _origSetHeader.apply(this, arguments);
        };
        const _origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (...args) {
            if (config.suppressErrorReports && this._igUrl?.includes(ERROR_PATH)) return;
            if (config.blockDMReadReceipts && this._igUrl?.includes('/api/graphql') &&
                READ_MUTATIONS.has(this._igFriendlyName)) {
                console.log('[IG-Clean] Blocked DM read receipt (XHR):', this._igFriendlyName);
                return;
            }
            return _origSend.apply(this, args);
        };

        if (config.suppressErrorReports || config.blockDMReadReceipts)
            sessionStorage.setItem('ig_clean_fetch_hooked', '1');

        // Stub ReportingObserver so Instagram's JS-side report collection is a no-op.
        // NOTE: the browser's native Report-To mechanism sends outside JS — block that
        // at the network level: ||www.instagram.com/error/ig_web_error_reports/*
        if (config.suppressErrorReports) {
            try {
                window.ReportingObserver = class {
                    observe() {} disconnect() {} takeRecords() { return []; }
                };
            } catch (_) {}
        }
    })();

    // === REDIRECTS ===
    const path = window.location.pathname;

    if (config.redirectToFollowing && path === '/' && !window.location.search) {
        window.location.replace('/?variant=following');
    }
    if (config.disableExplore && path.startsWith('/explore/')) {
        window.location.replace('/');
    }
    if (config.disableReels && path.startsWith('/reels/')) {
        window.location.replace('/');
    }

    // === SETTINGS UI ===
    function createSettingsUI() {
        if (localStorage.getItem('ig_clean_hidden') === 'true') {
            console.log('[IG-Clean] Button hidden. Visit instagram.com/#ig-clean-show to restore.');
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'ig-clean-btn';
        btn.innerText = 'IG Clean';

        if (isMobile) {
            btn.style.cssText = [
                'position: fixed', 'bottom: 24px', 'right: 16px', 'z-index: 9999',
                'background: #333', 'color: white', 'border: none',
                'padding: 12px 16px', 'border-radius: 20px', 'cursor: pointer',
                'opacity: 0.6', 'font-size: 13px', 'font-family: -apple-system, sans-serif',
                '-webkit-tap-highlight-color: transparent', 'touch-action: manipulation',
            ].join(';');
            btn.addEventListener('touchstart', () => { btn.style.opacity = '1'; }, { passive: true });
            btn.addEventListener('touchend',   () => { btn.style.opacity = '0.6'; }, { passive: true });
        } else {
            btn.style.cssText = 'position: fixed; bottom: 20px; left: 20px; z-index: 9999; background: #333; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; opacity: 0.5; font-size: 12px;';
            btn.onmouseover = () => btn.style.opacity = '1';
            btn.onmouseout  = () => btn.style.opacity = '0.5';
        }

        btn.addEventListener('click', openModal);
        document.body.appendChild(btn);
    }

    function openModal() {
        const overlay = document.createElement('div');
        overlay.id = 'ig-clean-overlay';

        if (isMobile) {
            overlay.style.cssText = [
                'position: fixed', 'top: 0', 'left: 0', 'width: 100%', 'height: 100%',
                'background: rgba(0,0,0,0.75)', 'z-index: 10000',
                'display: flex', 'justify-content: center', 'align-items: flex-end',
            ].join(';');
        } else {
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center;';
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && document.body.contains(overlay)) document.body.removeChild(overlay);
        });

        const modal = document.createElement('div');

        if (isMobile) {
            modal.style.cssText = [
                'background: #1c1c1e', 'color: white', 'padding: 20px 20px 40px',
                'border-radius: 16px 16px 0 0', 'width: 100%', 'max-width: 480px',
                'font-family: -apple-system, sans-serif', 'box-sizing: border-box',
                'max-height: 85vh', 'overflow-y: auto', '-webkit-overflow-scrolling: touch',
            ].join(';');
            const handle = document.createElement('div');
            handle.style.cssText = 'width:36px;height:4px;background:#555;border-radius:2px;margin:0 auto 16px;';
            modal.appendChild(handle);
        } else {
            modal.style.cssText = 'background: white; padding: 20px; border-radius: 8px; width: 340px; color: #000 !important; font-family: sans-serif; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); position: relative;';
        }

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

        const title = document.createElement('h3');
        title.innerText = 'IG Distraction Free';

        const closeX = document.createElement('button');
        closeX.innerText = '✕';
        closeX.title = 'Close';

        if (isMobile) {
            title.style.cssText = 'margin:0;font-size:17px;font-weight:600;color:white;';
            closeX.style.cssText = 'background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px 8px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
        } else {
            title.style.cssText = 'margin:0;color:black;font-size:15px;';
            closeX.style.cssText = 'background:none;border:none;font-size:16px;cursor:pointer;color:#555;line-height:1;padding:2px 6px;border-radius:4px;';
            closeX.onmouseover = () => closeX.style.background = '#eee';
            closeX.onmouseout  = () => closeX.style.background = 'none';
        }

        closeX.addEventListener('click', () => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        });

        header.appendChild(title);
        header.appendChild(closeX);
        modal.appendChild(header);

        // Toggle factory
        const createToggle = (key, label) => {
            if (isMobile) {
                const row = document.createElement('label');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #333;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';

                const text = document.createElement('span');
                text.innerText = label;
                text.style.cssText = 'font-size:15px;color:white;flex:1;padding-right:12px;';

                const switchEl = document.createElement('div');
                switchEl.style.cssText = 'width:51px;height:31px;border-radius:16px;position:relative;flex-shrink:0;transition:background 0.2s;background:' + (config[key] ? '#34c759' : '#39393d') + ';';

                const thumb = document.createElement('div');
                thumb.style.cssText = 'width:27px;height:27px;border-radius:50%;background:white;position:absolute;top:2px;transition:left 0.2s;left:' + (config[key] ? '22px' : '2px') + ';box-shadow:0 1px 3px rgba(0,0,0,0.4);';
                switchEl.appendChild(thumb);

                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = config[key];
                input.style.cssText = 'position:absolute;opacity:0;width:0;height:0;';
                input.addEventListener('change', () => {
                    config[key] = input.checked;
                    saveConfig();
                    switchEl.style.background = input.checked ? '#34c759' : '#39393d';
                    thumb.style.left = input.checked ? '22px' : '2px';
                });

                row.appendChild(text);
                row.appendChild(switchEl);
                row.appendChild(input);
                row.addEventListener('click', (e) => {
                    if (e.target !== input) { input.checked = !input.checked; input.dispatchEvent(new Event('change')); }
                });
                return row;
            } else {
                const row = document.createElement('div');
                row.dataset.igRow = '1';
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:8px 0;padding:4px 0;cursor:pointer;user-select:none;pointer-events:auto;';

                const text = document.createElement('span');
                text.innerText = label;
                text.style.cssText = 'font-size:14px;color:#000;flex:1;padding-right:12px;pointer-events:none;';

                const track = document.createElement('div');
                track.style.cssText = 'width:42px;height:24px;border-radius:12px;position:relative;flex-shrink:0;transition:background 0.2s;background:' + (config[key] ? '#0095f6' : '#ccc') + ';pointer-events:none;';

                const thumb = document.createElement('div');
                thumb.style.cssText = 'width:20px;height:20px;border-radius:50%;background:white;position:absolute;top:2px;transition:left 0.2s;left:' + (config[key] ? '20px' : '2px') + ';box-shadow:0 1px 3px rgba(0,0,0,0.3);pointer-events:none;';
                track.appendChild(thumb);

                row.appendChild(text);
                row.appendChild(track);

                // Use mousedown so the event fires before Instagram's SPA router
                // intercepts the click. Stop propagation to prevent the overlay
                // from seeing it.
                row.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    config[key] = !config[key];
                    saveConfig();
                    track.style.background = config[key] ? '#0095f6' : '#ccc';
                    thumb.style.left = config[key] ? '20px' : '2px';
                });

                return row;
            }
        };

        const sectionLabel = (label) => {
            const el = document.createElement('div');
            el.innerText = label;
            if (isMobile) {
                el.style.cssText = 'font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 4px;';
            } else {
                el.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 4px;border-top:1px solid #eee;padding-top:10px;';
            }
            return el;
        };

        modal.appendChild(sectionLabel('Sponsored'));
        modal.appendChild(createToggle('removeSponsored', 'Remove Sponsored (Data Filter)'));
        modal.appendChild(createToggle('blurSponsored', 'Blur Sponsored (Fallback)'));

        modal.appendChild(sectionLabel('Suggested'));
        modal.appendChild(createToggle('removeSuggested', 'Remove Suggested (Data Filter)'));
        modal.appendChild(createToggle('blurSuggested', 'Blur Suggested (Fallback)'));

        modal.appendChild(sectionLabel('Navigation'));
        modal.appendChild(createToggle('redirectToFollowing', 'Default to "Following" Feed'));
        modal.appendChild(createToggle('disableExplore', 'Disable Explore Page & Sidebar'));
        modal.appendChild(createToggle('disableReels', 'Disable Reels Page & Sidebar'));
        modal.appendChild(createToggle('hideThreadsNav', 'Hide Threads Link in Sidebar'));

        modal.appendChild(sectionLabel('Feed Content'));
        modal.appendChild(createToggle('hideNewPostsBanner', 'Hide "New Posts" Banner'));
        modal.appendChild(createToggle('filterCollabPosts', 'Filter Collab / Partnership Posts'));
        modal.appendChild(createToggle('filterAiContent', 'Filter AI-Generated Posts'));
        modal.appendChild(createToggle('filterAddYours', 'Filter "Add Yours" Chain Posts'));

        modal.appendChild(sectionLabel('Stories'));
        modal.appendChild(createToggle('hideStoriesBar', 'Hide Stories Bar Entirely'));
        modal.appendChild(createToggle('hideStoriesNotificationDots', 'Hide Story Ring Notification Dots'));

        modal.appendChild(sectionLabel('Interface'));
        modal.appendChild(createToggle('hideDownloadAppBanner', 'Hide "Download App" Banner'));
        modal.appendChild(createToggle('hideBoostButtons', 'Hide "Boost Post" Upsell Buttons'));
        modal.appendChild(createToggle('hideTabTitleBadge', 'Strip Unread Count from Tab Title'));
        modal.appendChild(createToggle('hideLikeCounts', 'Hide Like & View Counts'));
        modal.appendChild(createToggle('hideDMFloatingButton', 'Hide Floating DM Button (Mobile)'));

        modal.appendChild(sectionLabel('Privacy & Limits'));
        modal.appendChild(createToggle('suppressNotificationNag', 'Suppress Notification Permission Nag'));
        modal.appendChild(createToggle('suppressSelfXSSWarning', 'Suppress "Stop!" Console Warning'));
        modal.appendChild(createToggle('suppressErrorReports', 'Block Error & Telemetry Reports'));
        modal.appendChild(createToggle('blockDMReadReceipts', 'Block DM Read Receipts ("Seen")'));
        modal.appendChild(createToggle('autoDismissCookieBanner', 'Auto-Dismiss Cookie Consent Banner'));
        modal.appendChild(createToggle('muteAutoplayVideo', 'Mute Autoplay Videos'));
        modal.appendChild(createToggle('hideActiveNow', 'Hide "Active Now" Presence Indicator'));

        // Session post limit — number input, not a toggle
        const limitRow = (() => {
            if (isMobile) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #333;';
                const text = document.createElement('span');
                text.innerText = 'Session Post Limit (0 = off)';
                text.style.cssText = 'font-size:15px;color:white;flex:1;padding-right:12px;';
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.max = '500';
                input.value = config.sessionPostLimit;
                input.style.cssText = 'width:60px;padding:6px;border-radius:8px;border:1px solid #555;background:#2c2c2e;color:white;font-size:15px;text-align:center;';
                input.onchange = () => { config.sessionPostLimit = parseInt(input.value) || 0; saveConfig(); };
                row.appendChild(text);
                row.appendChild(input);
                return row;
            } else {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'margin:10px 0;color:black;display:flex;align-items:center;gap:8px;font-size:14px;';
                wrapper.appendChild(document.createTextNode('Session Post Limit (0 = off)'));
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.max = '500';
                input.value = config.sessionPostLimit;
                input.style.cssText = 'width:55px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:14px;text-align:center;';
                input.onchange = () => { config.sessionPostLimit = parseInt(input.value) || 0; saveConfig(); };
                wrapper.appendChild(input);
                return wrapper;
            }
        })();
        modal.appendChild(limitRow);

        // Close & Reload
        const closeBtn = document.createElement('button');
        closeBtn.innerText = isMobile ? 'Done' : 'Close & Reload';
        if (isMobile) {
            closeBtn.style.cssText = 'margin-top:24px;padding:14px;background:#0a84ff;color:white;border:none;border-radius:12px;font-size:16px;font-weight:600;width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
        } else {
            closeBtn.style.cssText = 'margin-top:15px;padding:8px 16px;background:#0095f6;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;';
        }
        closeBtn.addEventListener('click', () => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            window.location.reload();
        });
        modal.appendChild(closeBtn);

        // Hide Forever
        const sep = document.createElement('hr');
        sep.style.cssText = isMobile ? 'border-color:#333;margin:20px 0 12px;' : 'margin:12px 0 8px;';
        modal.appendChild(sep);

        const dangerNote = document.createElement('p');
        dangerNote.innerText = 'Hide this button permanently (settings still apply). To restore, visit instagram.com/#ig-clean-show';
        dangerNote.style.cssText = isMobile
            ? 'font-size:12px;color:#888;margin:0 0 10px;line-height:1.5;'
            : 'font-size:11px;color:#888;margin:0 0 8px;line-height:1.4;';
        modal.appendChild(dangerNote);

        const hideBtn = document.createElement('button');
        hideBtn.innerText = 'Hide This Button Forever';
        if (isMobile) {
            hideBtn.style.cssText = 'padding:12px;background:transparent;color:#ff453a;border:1.5px solid #ff453a;border-radius:12px;font-size:14px;width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
        } else {
            hideBtn.style.cssText = 'padding:7px 16px;background:#fff;color:#e0245e;border:1.5px solid #e0245e;border-radius:4px;cursor:pointer;width:100%;font-size:13px;';
            hideBtn.onmouseover = () => { hideBtn.style.background = '#fff0f4'; };
            hideBtn.onmouseout  = () => { hideBtn.style.background = '#fff'; };
        }
        hideBtn.addEventListener('click', () => {
            localStorage.setItem('ig_clean_hidden', 'true');
            const floatingBtn = document.getElementById('ig-clean-btn');
            if (floatingBtn) floatingBtn.remove();
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        });
        modal.appendChild(hideBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    // === RESTORE TRIGGERS ===
    if (window.location.hash === '#ig-clean-show') {
        localStorage.removeItem('ig_clean_hidden');
        history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log('[IG-Clean] Settings button restored via URL trigger.');
    }

    window.igCleanShow = function () {
        localStorage.removeItem('ig_clean_hidden');
        console.log('[IG-Clean] Settings button restored. Reload the page to see it.');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createSettingsUI);
    } else {
        createSettingsUI();
    }

    // === SIDEBAR / NAV HIDING ===
    function hideSidebarItems() {
        const selectors = [];
        if (config.disableExplore) selectors.push('a[href="/explore/"]');
        if (config.disableReels)   selectors.push('a[href="/reels/"]');
        // Threads may appear as an internal or external link depending on Instagram version
        if (config.hideThreadsNav) selectors.push(
            'a[href="/threads/"]',
            'a[href="https://www.threads.net/"]',
            'a[href="https://www.threads.com/"]',
        );
        if (selectors.length === 0) return;

        for (const link of document.querySelectorAll(selectors.join(', '))) {
            let container = link.closest('span[class*="html-span"]') || link.parentElement?.parentElement?.parentElement?.parentElement;
            if (!container) container = link.closest('div.x1n2onr6');
            if (container && !container.dataset.igCleanHidden) {
                container.style.display = 'none';
                container.dataset.igCleanHidden = 'true';
            }
        }
    }

    // === CSS STYLES ===
    const buildDynamicCSS = () => {
        let css = `
            #ig-clean-overlay,
            #ig-clean-overlay * {
                pointer-events: auto !important;
                box-sizing: border-box;
            }
            #ig-clean-overlay [data-ig-row] {
                cursor: pointer !important;
            }
            .ig-clean-blurred {
                filter: blur(8px) !important;
                opacity: 0.3 !important;
                pointer-events: none !important;
                transition: filter 0.3s, opacity 0.3s;
            }
            .ig-clean-blurred::before {
                content: "Filtered";
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 1000;
                pointer-events: none;
            }
        `;

        if (config.hideLikeCounts) {
            // NOTE: These selectors are best-effort — Instagram's like count DOM varies.
            // If counts are still visible, open devtools, inspect the count element,
            // and share the aria-label or class with us to tune this.
            css += `
                [aria-label$=" likes"], [aria-label$=" like"],
                [aria-label*=" likes,"], [aria-label*=" views"] { display: none !important; }
            `;
        }

        if (config.hideStoriesNotificationDots) {
            // Story rings are <canvas> elements inside [data-pagelet="story_tray"] (confirmed from live DOM)
            css += `
                [data-pagelet="story_tray"] canvas { display: none !important; }
            `;
        }

        if (config.hideActiveNow) {
            // NOTE: Instagram's "Active now" indicator uses dynamic class names.
            // These selectors are best-effort and likely need tuning after testing.
            css += `
                [aria-label="Active now"], [title="Active now"],
                [aria-label*="Active"] span[style*="background"] { display: none !important; }
            `;
        }

        if (config.hideDMFloatingButton) {
            // Floating DM button on mobile — confirmed stable pagelet attribute from live DOM
            css += `
                [data-pagelet="IGDChatTabsRootContentOffMsys"] { display: none !important; }
            `;
        }

        return css;
    };

    const styleEl = document.createElement('style');
    styleEl.textContent = buildDynamicCSS();
    (document.head || document.documentElement).appendChild(styleEl);

    // === DOM FEATURE FUNCTIONS ===

    // Tab title badge — strip "(3) Instagram" → "Instagram"
    if (config.hideTabTitleBadge) {
        const stripBadge = () => {
            if (/^\(\d+\)/.test(document.title)) {
                document.title = document.title.replace(/^\(\d+\)\s*/, '');
            }
        };
        const observeTitle = () => {
            const titleEl = document.querySelector('title');
            if (titleEl) {
                new MutationObserver(stripBadge).observe(titleEl, { childList: true, characterData: true, subtree: true });
                stripBadge();
            }
        };
        document.readyState === 'loading'
            ? document.addEventListener('DOMContentLoaded', observeTitle)
            : observeTitle();
    }

    // Mute all video elements
    function muteVideos(root) {
        if (!config.muteAutoplayVideo) return;
        (root || document).querySelectorAll('video').forEach(v => { v.muted = true; });
    }

    // Auto-dismiss cookie / GDPR banner by clicking the decline button
    const COOKIE_DISMISS_TEXTS = new Set([
        // English
        'Decline optional cookies', 'Only allow essential cookies', 'Reject all',
        // German
        'Ablehnen', 'Nur notwendige Cookies zulassen', 'Alle ablehnen',
        // French
        'Refuser', 'Tout refuser',
        // Spanish
        'Rechazar', 'Rechazar todo',
        // Italian
        'Rifiuta', 'Rifiuta tutto',
        // Dutch
        'Weigeren', 'Alles weigeren',
        // Portuguese
        'Recusar', 'Recusar tudo',
        // Russian
        'Отклонить',
    ]);

    function autoDismissCookieBanner(root) {
        if (!config.autoDismissCookieBanner) return;
        for (const btn of (root || document).querySelectorAll('button')) {
            if (COOKIE_DISMISS_TEXTS.has(btn.textContent?.trim())) {
                btn.click();
                console.log('[IG-Clean] Auto-dismissed cookie banner');
                return;
            }
        }
    }

    // Hide "New Posts" / "See new posts" sticky banner
    // NOTE: Instagram renders this as a button or role="button" div. The text
    // varies ("New posts", "See new posts", "1 new post", etc.). If banners
    // still appear, open devtools, click the banner element, and share its
    // text content so we can add it here.
    function hideNewPostsBanner(root) {
        if (!config.hideNewPostsBanner) return;
        for (const el of (root || document).querySelectorAll('[role="button"], button')) {
            const text = el.textContent?.trim() || '';
            if (/^(\d+ )?new posts?$/i.test(text) || /^see new posts?$/i.test(text)) {
                const container = el.closest('[style*="position: fixed"]') || el.closest('[style*="position:fixed"]') || el.parentElement;
                if (container && !container.dataset.igCleanHidden) {
                    container.style.display = 'none';
                    container.dataset.igCleanHidden = 'true';
                    console.log('[IG-Clean] Hidden "New Posts" banner');
                }
            }
        }
    }

    // Hide "Download App" / "Open in app" banner (mobile web)
    // NOTE: The exact button text varies by region and Instagram version.
    // If the banner persists, share the button's visible text.
    function hideDownloadAppBanner(root) {
        if (!config.hideDownloadAppBanner) return;
        const TEXTS = new Set(['Open in app', 'Get the app', 'Install app', 'Open in Instagram', 'App öffnen', 'Ouvrir dans l\'app']);
        for (const el of (root || document).querySelectorAll('[role="button"], button, a')) {
            if (TEXTS.has(el.textContent?.trim())) {
                let banner = el.parentElement;
                // Walk up to find the top-level banner container (typically 2-4 levels up)
                for (let i = 0; i < 4; i++) {
                    if (!banner || banner === document.body) break;
                    const style = banner.getAttribute('style') || '';
                    if (style.includes('position: fixed') || style.includes('position:fixed') || banner.tagName === 'HEADER') break;
                    banner = banner.parentElement;
                }
                if (banner && banner !== document.body && !banner.dataset.igCleanHidden) {
                    banner.style.display = 'none';
                    banner.dataset.igCleanHidden = 'true';
                    console.log('[IG-Clean] Hidden "Download App" banner');
                }
            }
        }
    }

    // Hide "Boost Post" / Professional Dashboard upsell buttons
    // NOTE: These appear on post cards. The text varies; add more variants if
    // you still see upsell buttons after enabling this.
    const BOOST_TEXTS = new Set([
        'Boost post', 'Boost Post', 'Boost reel', 'Boost Reel',
        'View professional dashboard', 'View Professional Dashboard',
        'Get more reach', 'Promote',
    ]);

    function hideBoostButtons(root) {
        if (!config.hideBoostButtons) return;
        for (const el of (root || document).querySelectorAll('[role="button"], button')) {
            if (BOOST_TEXTS.has(el.textContent?.trim()) && !el.dataset.igCleanHidden) {
                el.style.display = 'none';
                el.dataset.igCleanHidden = 'true';
            }
        }
    }

    // Hide Stories bar — targets the stable data-pagelet attribute on the tray container
    function hideStoriesBar() {
        if (!config.hideStoriesBar) return;
        const tray = document.querySelector('[data-pagelet="story_tray"]');
        if (tray && !tray.dataset.igCleanHidden) {
            tray.style.display = 'none';
            tray.dataset.igCleanHidden = 'true';
            console.log('[IG-Clean] Hidden Stories bar');
        }
    }

    // Run all DOM scan features
    function runDomFeatures(root) {
        autoDismissCookieBanner(root);
        hideNewPostsBanner(root);
        hideDownloadAppBanner(root);
        hideBoostButtons(root);
        muteVideos(root);
    }

    // === SESSION POST LIMIT ===
    let sessionPostCount = 0;
    let limitShown = false;

    function checkSessionLimit() {
        const limit = config.sessionPostLimit;
        if (!limit || limit <= 0 || limitShown) return;
        sessionPostCount++;
        if (sessionPostCount >= limit) {
            limitShown = true;
            showSessionLimitWall(limit);
        }
    }

    function showSessionLimitWall(limit) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:99999;display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:-apple-system,sans-serif;';

        const box = document.createElement('div');
        box.style.cssText = 'text-align:center;color:white;padding:32px;max-width:320px;';

        const heading = document.createElement('h2');
        heading.textContent = `${limit} posts.`;
        heading.style.cssText = 'margin:0 0 8px;font-size:28px;font-weight:700;';

        const sub = document.createElement('p');
        sub.textContent = 'You set a limit. That\'s probably enough.';
        sub.style.cssText = 'color:#aaa;margin:0 0 32px;font-size:16px;line-height:1.5;';

        const continueBtn = document.createElement('button');
        continueBtn.textContent = 'Keep scrolling anyway';
        continueBtn.style.cssText = 'padding:12px 24px;background:transparent;color:#666;border:1px solid #444;border-radius:10px;font-size:14px;cursor:pointer;display:block;width:100%;';
        continueBtn.addEventListener('click', () => {
            overlay.remove();
            limitShown = false;
            sessionPostCount = 0;
        });

        box.appendChild(heading);
        box.appendChild(sub);
        box.appendChild(continueBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        console.log(`[IG-Clean] Session limit of ${limit} posts reached.`);
    }

    // === DATA FILTERING ===

    function filterEdges(edges, contextName) {
        if (!Array.isArray(edges)) return edges;
        // Signal to the health-check userscript that the feed timeline key is still valid
        if (edges.length > 0) sessionStorage.setItem('ig_clean_feed_seen', '1');
        const before = edges.length;

        const filtered = edges.filter(edge => {
            if (!edge?.node) return true;
            const node = edge.node;

            if (config.removeSponsored) {
                if (node.ad) { cleanedCount.ads++; return false; }
                if (node.media?.ad_id || node.media?.is_sponsored === true || node.media?.product_type === 'ad') {
                    cleanedCount.ads++; return false;
                }
            }

            if (config.removeSuggested) {
                if (node.suggested_users) { cleanedCount.suggested++; return false; }
                if (node.explore_story)   { cleanedCount.suggested++; return false; }
            }

            if (config.filterCollabPosts) {
                const producers = node.coauthor_producers ?? node.media?.coauthor_producers;
                if (Array.isArray(producers) && producers.length > 0) {
                    console.log('[IG-Clean] Removing COLLAB post');
                    return false;
                }
            }

            // ai_label_info.gen_ai_detection_method is non-null for AI posts.
            // Confirmed values from live HAR: "CLASSIFIER_SCORE_HIGH", "AI_CREATED".
            if (config.filterAiContent) {
                const aiInfo = node.ai_label_info ?? node.media?.ai_label_info;
                if (aiInfo?.gen_ai_detection_method) {
                    console.log('[IG-Clean] Removing AI post:', aiInfo.gen_ai_detection_method);
                    return false;
                }
            }

            // NOTE: 'Add Yours' sticker detection in main-feed posts is uncertain.
            // The sticker structure may differ from Stories stickers. Enable this
            // toggle and check the console — if nothing logs, the field name is wrong.
            if (config.filterAddYours) {
                const media = node.media || node;
                const stickers = media.story_bloks_stickers || media.stickers;
                if (Array.isArray(stickers) && stickers.some(s =>
                    s.type === 'add_yours' || s.bloks_sticker?.sticker_type === 'add_yours'
                )) {
                    console.log('[IG-Clean] Removing Add Yours post');
                    return false;
                }
            }

            return true;
        });

        if (filtered.length < before) {
            console.log(`[IG-Clean] ${contextName}: ${before} → ${filtered.length}`);
        }
        return filtered;
    }

    function filterFeedItems(feedItems, contextName) {
        if (!Array.isArray(feedItems)) return feedItems;
        const before = feedItems.length;
        const filtered = feedItems.filter(item => {
            if (!item) return true;
            if (config.removeSponsored && item.ad) { cleanedCount.ads++; return false; }
            if (config.removeSuggested) {
                if (item.suggested_users) { cleanedCount.suggested++; return false; }
                if (item.explore_story)   { cleanedCount.suggested++; return false; }
            }
            return true;
        });
        if (filtered.length < before) console.log(`[IG-Clean] ${contextName}: ${before} → ${filtered.length}`);
        return filtered;
    }

    function deepCleanFeedData(obj, depth = 0, path = 'root') {
        if (!obj || typeof obj !== 'object' || depth > 10) return;

        if (obj.xdt_api__v1__feed__timeline__connection?.edges) {
            obj.xdt_api__v1__feed__timeline__connection.edges =
                filterEdges(obj.xdt_api__v1__feed__timeline__connection.edges, `Deep(${path})`);
        }
        if (config.removeSponsored && obj.xdt_injected_story_units?.ad_media_items?.length > 0) {
            cleanedCount.ads += obj.xdt_injected_story_units.ad_media_items.length;
            obj.xdt_injected_story_units.ad_media_items = [];
        }

        if (obj.data)   deepCleanFeedData(obj.data,   depth + 1, path + '.data');
        if (obj.result) deepCleanFeedData(obj.result, depth + 1, path + '.result');

        if (Array.isArray(obj.require)) {
            for (let i = 0; i < obj.require.length; i++) {
                const req = obj.require[i];
                if (Array.isArray(req)) {
                    for (let j = 0; j < req.length; j++) deepCleanFeedData(req[j], depth + 1, path + `.require[${i}][${j}]`);
                }
            }
        }
        if (obj.__bbox) deepCleanFeedData(obj.__bbox, depth + 1, path + '.__bbox');
    }

    function cleanFeedData(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        deepCleanFeedData(obj);

        if (obj.data?.xdt_api__v1__feed__timeline__connection?.edges) {
            obj.data.xdt_api__v1__feed__timeline__connection.edges =
                filterEdges(obj.data.xdt_api__v1__feed__timeline__connection.edges, 'Main Feed');
        }
        if (obj.xdt_api__v1__feed__timeline__connection?.edges) {
            obj.xdt_api__v1__feed__timeline__connection.edges =
                filterEdges(obj.xdt_api__v1__feed__timeline__connection.edges, 'Feed (Pagination)');
        }

        if (obj.data?.xdt_api__v1__feed__timeline__connection?.edges) {
            for (const edge of obj.data.xdt_api__v1__feed__timeline__connection.edges) {
                const groups = edge?.node?.end_of_feed_demarcator?.group_set?.groups;
                if (Array.isArray(groups)) {
                    for (const group of groups) {
                        if (group.feed_items) group.feed_items = filterFeedItems(group.feed_items, 'End of Feed');
                    }
                }
            }
        }

        if (config.removeSponsored && obj.data?.xdt_injected_story_units?.ad_media_items) {
            const count = obj.data.xdt_injected_story_units.ad_media_items.length;
            if (count > 0) { obj.data.xdt_injected_story_units.ad_media_items = []; cleanedCount.ads += count; }
        }

        if (obj.result?.data?.xdt_api__v1__feed__timeline__connection?.edges) {
            obj.result.data.xdt_api__v1__feed__timeline__connection.edges =
                filterEdges(obj.result.data.xdt_api__v1__feed__timeline__connection.edges, 'Preloaded Feed');
        }

        return obj;
    }

    JSON.parse = function (text, reviver) {
        const data = originalParse.call(JSON, text, reviver);
        try { if (data && typeof data === 'object') cleanFeedData(data); }
        catch (e) { console.error('[IG-Clean] JSON.parse hook error:', e); }
        return data;
    };

    Response.prototype.json = async function () {
        const data = await originalResponseJson.call(this);
        try { if (data && typeof data === 'object') cleanFeedData(data); }
        catch (e) { console.error('[IG-Clean] Response.json hook error:', e); }
        return data;
    };

    setInterval(() => {
        if (cleanedCount.ads > 0 || cleanedCount.suggested > 0) {
            console.log(`[IG-Clean] Stats — ${cleanedCount.ads} ads, ${cleanedCount.suggested} suggested removed`);
        }
    }, 30000);

    // === VISUAL BLUR FALLBACK ===

    const SPONSORED_LABELS = new Set([
        'Sponsored', 'Sponzorováno', 'Patrocinado', 'Sponsorisé', 'Gesponsert',
        'Sponsorizzato', 'Gesponsord', 'Sponsrad', 'Sponsorowane', 'Реклама',
        'مُموَّل', '광고', 'スポンサー', '赞助内容', '贊助內容', 'Berbayar',
    ]);

    const SUGGESTED_LABELS = new Set([
        'Suggested for you', 'Suggested posts',
        'Navrhované pro vás', 'Návrhy pro vás',
        'Sugeridas para ti', 'Publicaciones sugeridas',
        'Suggestions pour vous', 'Vorgeschlagene Beiträge',
        'Suggeriti per te', 'Voorgesteld voor jou', 'Föreslagna för dig',
        'Sugerowane dla ciebie', 'Рекомендации для вас', 'Sugestões para você',
        'اقتراحات لك', '회원님을 위한 추천', 'あなたへのおすすめ', '为您推荐', 'Disarankan untuk Anda',
        'Follow', 'Sledovat', 'Seguir', 'Suivre', 'Folgen', 'Seguire', 'Volgen', '팔로우', 'フォロー', '关注',
    ]);

    const FOLLOW_LABELS = new Set([
        'Follow', 'Sledovat', 'Seguir', 'Suivre', 'Folgen', 'Seguire',
        'Volgen', '팔로우', 'フォロー', '关注',
    ]);

    const processedArticles = new WeakSet();

    function processArticle(article) {
        if (processedArticles.has(article)) return;
        processedArticles.add(article);

        checkSessionLimit();

        if (article.querySelector('a[href^="https://www.facebook.com/ads/"]')) {
            if (config.blurSponsored) { blurArticle(article, 'ad-link'); return; }
        }

        for (const el of article.querySelectorAll('span, a, div[role="button"], button')) {
            const text = el.textContent?.trim();
            if (!text) continue;

            if (SPONSORED_LABELS.has(text) && config.blurSponsored) {
                blurArticle(article, `Sponsored ("${text}")`); return;
            }

            if (SUGGESTED_LABELS.has(text)) {
                if (FOLLOW_LABELS.has(text)) {
                    const isButton = el.getAttribute('role') === 'button' || el.tagName === 'BUTTON' || el.closest('[role="button"]');
                    if (!isButton) continue;
                }
                if (config.blurSuggested) { blurArticle(article, `Suggested ("${text}")`); return; }
            }
        }

        if (config.hideBoostButtons) hideBoostButtons(article);
    }

    function blurArticle(article, reason) {
        if (!article.classList.contains('ig-clean-blurred')) {
            article.classList.add('ig-clean-blurred');
            article.style.position = 'relative';
            console.log(`[IG-Clean] Blurred: ${reason}`);
        }
    }

    function scanForAdsInDOM(root) {
        (root || document).querySelectorAll('article').forEach(processArticle);
    }

    // === STARTUP SCANS ===
    const runInitialScans = () => {
        setTimeout(() => {
            scanForAdsInDOM(document);
            runDomFeatures(document);
            hideSidebarItems();
            hideStoriesBar();
        }, 1500);
        setTimeout(() => {
            scanForAdsInDOM(document);
            runDomFeatures(document);
            hideSidebarItems();
        }, 3500);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInitialScans);
    } else {
        runInitialScans();
    }

    // === OBSERVERS ===
    const feedObserver = new MutationObserver((mutations) => {
        if (feedObserver.scheduled) return;
        feedObserver.scheduled = true;
        setTimeout(() => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'ARTICLE') {
                        processArticle(node);
                    } else {
                        scanForAdsInDOM(node);
                        runDomFeatures(node);
                    }
                }
            }
            feedObserver.scheduled = false;
        }, 500);
    });

    const sidebarObserver = new MutationObserver(() => {
        if (sidebarObserver.scheduled) return;
        sidebarObserver.scheduled = true;
        setTimeout(() => { hideSidebarItems(); sidebarObserver.scheduled = false; }, 500);
    });

    const startObservers = () => {
        const mainContainer = document.querySelector('main') || document.body;
        feedObserver.observe(mainContainer, { childList: true, subtree: true });

        const sidebar = document.querySelector('nav[role="navigation"]') || document.querySelector('div[role="navigation"]')?.closest('div');
        if (sidebar) sidebarObserver.observe(sidebar, { childList: true, subtree: true });

        console.log('[IG-Clean] Observers started');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObservers);
    } else {
        setTimeout(startObservers, 100);
    }

    // Watch document.body directly for cookie/modal dialogs — they are appended
    // outside <main> so the feed observer misses them.
    const startBodyObserver = () => {
        new MutationObserver(() => autoDismissCookieBanner(document))
            .observe(document.body, { childList: true });
    };
    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', startBodyObserver)
        : startBodyObserver();

})();