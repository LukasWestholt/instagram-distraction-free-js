// ==UserScript==
// @name         Instagram Distraction Free
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Remove Sponsored and Suggested posts from Instagram. Supports desktop and iOS/mobile.
// @author       Antigravity
// @match        *://*.instagram.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('[IG-Clean] v1.4 Script initialized. Hooking JSON.parse and Response.json...');

    const originalParse = JSON.parse;
    const originalResponseJson = Response.prototype.json;

    const isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

    // === CONFIGURATION ===
    const DEFAULT_CONFIG = {
        removeSponsored: true,
        blurSponsored: true,
        removeSuggested: true,
        blurSuggested: true,
        redirectToFollowing: true,
        disableExplore: true,
        disableReels: true
    };

    let config = (() => {
        try {
            return JSON.parse(localStorage.getItem('ig_clean_config')) || DEFAULT_CONFIG;
        } catch (_) {
            return DEFAULT_CONFIG;
        }
    })();

    function saveConfig() {
        localStorage.setItem('ig_clean_config', JSON.stringify(config));
    }

    let cleanedCount = { ads: 0, suggested: 0 };

    // === REDIRECTS ===
    const path = window.location.pathname;

    if (config.redirectToFollowing) {
        if (path === '/' && !window.location.search) {
            console.log('[IG-Clean] Redirecting to Following feed...');
            window.location.replace('/?variant=following');
        }
    }
    if (config.disableExplore) {
        if (path.startsWith('/explore/')) {
            console.log('[IG-Clean] Explore page disabled. Redirecting to home...');
            window.location.replace('/');
        }
    }
    if (config.disableReels) {
        if (path.startsWith('/reels/')) {
            console.log('[IG-Clean] Reels page disabled. Redirecting to home...');
            window.location.replace('/');
        }
    }

    // === SETTINGS UI ===
    function createSettingsUI() {
        if (localStorage.getItem('ig_clean_hidden') === 'true') {
            console.log('[IG-Clean] Settings button permanently hidden. Run igCleanShow() in console to restore.');
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'ig-clean-btn';
        btn.innerText = 'IG Clean';

        if (isMobile) {
            btn.style.cssText = [
                'position: fixed',
                'bottom: 24px',
                'right: 16px',
                'z-index: 9999',
                'background: #333',
                'color: white',
                'border: none',
                'padding: 12px 16px',
                'border-radius: 20px',
                'cursor: pointer',
                'opacity: 0.6',
                'font-size: 13px',
                'font-family: -apple-system, sans-serif',
                '-webkit-tap-highlight-color: transparent',
                'touch-action: manipulation',
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
                'position: fixed',
                'top: 0',
                'left: 0',
                'width: 100%',
                'height: 100%',
                'background: rgba(0,0,0,0.75)',
                'z-index: 10000',
                'display: flex',
                'justify-content: center',
                'align-items: flex-end',
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
                'background: #1c1c1e',
                'color: white',
                'padding: 20px 20px 40px',
                'border-radius: 16px 16px 0 0',
                'width: 100%',
                'max-width: 480px',
                'font-family: -apple-system, sans-serif',
                'box-sizing: border-box',
                'max-height: 85vh',
                'overflow-y: auto',
                '-webkit-overflow-scrolling: touch',
            ].join(';');

            const handle = document.createElement('div');
            handle.style.cssText = 'width:36px;height:4px;background:#555;border-radius:2px;margin:0 auto 16px;';
            modal.appendChild(handle);
        } else {
            modal.style.cssText = 'background: white; padding: 20px; border-radius: 8px; width: 340px; color: #000000 !important; font-family: sans-serif; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); position: relative;';
        }

        // Header row with title + ✕ close
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

        const title = document.createElement('h3');
        title.innerText = 'IG Distraction Free Settings';

        const closeX = document.createElement('button');
        closeX.innerText = '✕';
        closeX.title = 'Close';

        if (isMobile) {
            title.style.cssText = 'margin:0;font-size:17px;font-weight:600;color:white;';
            closeX.style.cssText = [
                'background: none',
                'border: none',
                'color: #888',
                'font-size: 18px',
                'cursor: pointer',
                'padding: 4px 8px',
                '-webkit-tap-highlight-color: transparent',
                'touch-action: manipulation',
            ].join(';');
        } else {
            title.style.cssText = 'margin: 0; color: black; font-size: 15px;';
            closeX.style.cssText = 'background: none; border: none; font-size: 16px; cursor: pointer; color: #555; line-height: 1; padding: 2px 6px; border-radius: 4px;';
            closeX.onmouseover = () => closeX.style.background = '#eee';
            closeX.onmouseout  = () => closeX.style.background = 'none';
        }

        closeX.addEventListener('click', () => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        });

        header.appendChild(title);
        header.appendChild(closeX);
        modal.appendChild(header);

        // Toggle factory — iOS switches on mobile, checkboxes on desktop
        const createToggle = (key, label) => {
            if (isMobile) {
                const row = document.createElement('label');
                row.style.cssText = [
                    'display: flex',
                    'align-items: center',
                    'justify-content: space-between',
                    'padding: 14px 0',
                    'border-bottom: 1px solid #333',
                    'cursor: pointer',
                    '-webkit-tap-highlight-color: transparent',
                    'touch-action: manipulation',
                ].join(';');

                const text = document.createElement('span');
                text.innerText = label;
                text.style.cssText = 'font-size:15px;color:white;flex:1;padding-right:12px;';

                const switchEl = document.createElement('div');
                switchEl.style.cssText = [
                    'width: 51px',
                    'height: 31px',
                    'border-radius: 16px',
                    'position: relative',
                    'flex-shrink: 0',
                    'transition: background 0.2s',
                    'background: ' + (config[key] ? '#34c759' : '#39393d'),
                ].join(';');

                const thumb = document.createElement('div');
                thumb.style.cssText = [
                    'width: 27px',
                    'height: 27px',
                    'border-radius: 50%',
                    'background: white',
                    'position: absolute',
                    'top: 2px',
                    'transition: left 0.2s',
                    'left: ' + (config[key] ? '22px' : '2px'),
                    'box-shadow: 0 1px 3px rgba(0,0,0,0.4)',
                ].join(';');
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
                    if (e.target !== input) {
                        input.checked = !input.checked;
                        input.dispatchEvent(new Event('change'));
                    }
                });

                return row;
            } else {
                const wrapper = document.createElement('div');
                wrapper.style.margin = '10px 0';
                wrapper.style.color = 'black';

                const labelEl = document.createElement('label');
                labelEl.style.cssText = 'display: flex; align-items: center; cursor: pointer; color: #000000 !important; font-size: 14px;';

                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = config[key];
                input.style.marginRight = '8px';
                input.onchange = (e) => {
                    config[key] = e.target.checked;
                    saveConfig();
                };

                labelEl.appendChild(input);
                labelEl.appendChild(document.createTextNode(label));
                wrapper.appendChild(labelEl);
                return wrapper;
            }
        };

        const section = (label) => {
            const el = document.createElement('div');
            if (isMobile) {
                el.innerText = label;
                el.style.cssText = 'font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 4px;';
            } else {
                const hr = document.createElement('hr');
                hr.style.margin = '10px 0';
                modal.appendChild(hr);
                return hr;
            }
            return el;
        };

        modal.appendChild(createToggle('removeSponsored', 'Remove Sponsored (Data Filter)'));
        modal.appendChild(createToggle('blurSponsored', 'Blur Sponsored (Fallback)'));

        if (isMobile) modal.appendChild(section('Suggestions'));
        else modal.appendChild(section());

        modal.appendChild(createToggle('removeSuggested', 'Remove Suggested (Data Filter)'));
        modal.appendChild(createToggle('blurSuggested', 'Blur Suggested (Fallback)'));

        if (isMobile) modal.appendChild(section('Navigation'));
        else modal.appendChild(section());

        modal.appendChild(createToggle('redirectToFollowing', 'Default to "Following" Feed'));
        modal.appendChild(createToggle('disableExplore', 'Disable Explore Page & Sidebar'));
        modal.appendChild(createToggle('disableReels', 'Disable Reels Page & Sidebar'));

        // Close & Reload button
        const closeBtn = document.createElement('button');
        closeBtn.innerText = isMobile ? 'Done' : 'Close & Reload';

        if (isMobile) {
            closeBtn.style.cssText = [
                'margin-top: 24px',
                'padding: 14px',
                'background: #0a84ff',
                'color: white',
                'border: none',
                'border-radius: 12px',
                'font-size: 16px',
                'font-weight: 600',
                'width: 100%',
                'cursor: pointer',
                '-webkit-tap-highlight-color: transparent',
                'touch-action: manipulation',
            ].join(';');
        } else {
            closeBtn.style.cssText = 'margin-top: 15px; padding: 8px 16px; background: #0095f6; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;';
        }

        closeBtn.addEventListener('click', () => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            window.location.reload();
        });
        modal.appendChild(closeBtn);

        // Separator before hide-forever section
        const sep3 = document.createElement('hr');
        sep3.style.cssText = isMobile ? 'border-color:#333;margin:20px 0 12px;' : 'margin: 12px 0 8px;';
        modal.appendChild(sep3);

        const dangerNote = document.createElement('p');
        dangerNote.innerText = 'Hide this button permanently (settings still apply). To restore, open the browser console and run: igCleanShow()';
        dangerNote.style.cssText = isMobile
            ? 'font-size:12px;color:#888;margin:0 0 10px;line-height:1.5;'
            : 'font-size: 11px; color: #888; margin: 0 0 8px; line-height: 1.4;';
        modal.appendChild(dangerNote);

        const hideBtn = document.createElement('button');
        hideBtn.innerText = 'Hide This Button Forever';

        if (isMobile) {
            hideBtn.style.cssText = [
                'padding: 12px',
                'background: transparent',
                'color: #ff453a',
                'border: 1.5px solid #ff453a',
                'border-radius: 12px',
                'font-size: 14px',
                'width: 100%',
                'cursor: pointer',
                '-webkit-tap-highlight-color: transparent',
                'touch-action: manipulation',
            ].join(';');
        } else {
            hideBtn.style.cssText = 'padding: 7px 16px; background: #fff; color: #e0245e; border: 1.5px solid #e0245e; border-radius: 4px; cursor: pointer; width: 100%; font-size: 13px;';
            hideBtn.onmouseover = () => { hideBtn.style.background = '#fff0f4'; };
            hideBtn.onmouseout  = () => { hideBtn.style.background = '#fff'; };
        }

        hideBtn.addEventListener('click', () => {
            localStorage.setItem('ig_clean_hidden', 'true');
            const floatingBtn = document.getElementById('ig-clean-btn');
            if (floatingBtn) floatingBtn.remove();
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            console.log('[IG-Clean] Settings button hidden. Run igCleanShow() in the console to restore it.');
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

    // === SIDEBAR HIDING ===
    function hideSidebarItems() {
        if (!config.disableExplore && !config.disableReels) return;

        const selectors = [];
        if (config.disableExplore) selectors.push('a[href="/explore/"]');
        if (config.disableReels) selectors.push('a[href="/reels/"]');
        if (selectors.length === 0) return;

        const links = document.querySelectorAll(selectors.join(', '));
        for (const link of links) {
            let container = link.closest('span[class*="html-span"]') || link.parentElement?.parentElement?.parentElement?.parentElement;
            if (!container) container = link.closest('div.x1n2onr6');

            if (container && !container.dataset.igCleanHidden) {
                container.style.display = 'none';
                container.dataset.igCleanHidden = 'true';
                console.log(`[IG-Clean] Hidden sidebar item: ${link.getAttribute('href')}`);
            }
        }
    }

    const runInitialSidebarScan = () => {
        setTimeout(hideSidebarItems, 500);
        setTimeout(hideSidebarItems, 2000);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInitialSidebarScan);
    } else {
        runInitialSidebarScan();
    }

    const sidebarObserver = new MutationObserver(() => {
        if (!sidebarObserver.scanScheduled) {
            sidebarObserver.scanScheduled = true;
            setTimeout(() => { hideSidebarItems(); sidebarObserver.scanScheduled = false; }, 500);
        }
    });

    const startSidebarObserver = () => {
        const sidebar = document.querySelector('nav[role="navigation"]') || document.querySelector('div[role="navigation"]')?.closest('div');
        if (sidebar) {
            sidebarObserver.observe(sidebar, { childList: true, subtree: true });
            console.log('[IG-Clean] Sidebar observer started');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startSidebarObserver);
    } else {
        setTimeout(startSidebarObserver, 100);
    }

    // === DATA FILTERING LOGIC ===

    function filterEdges(edges, contextName) {
        if (!Array.isArray(edges)) return edges;

        const originalLength = edges.length;
        const filtered = edges.filter(edge => {
            if (!edge || !edge.node) return true;
            const node = edge.node;

            if (config.removeSponsored) {
                if (node.ad) {
                    console.log(`[IG-Clean] Removing SPONSORED post (ad_id: ${node.ad.ad_id || 'unknown'})`);
                    cleanedCount.ads++;
                    return false;
                }
                if (node.media && (node.media.ad_id || node.media.is_sponsored === true || node.media.product_type === 'ad')) {
                    console.log(`[IG-Clean] Removing SPONSORED media (backup check)`);
                    cleanedCount.ads++;
                    return false;
                }
            }

            if (config.removeSuggested) {
                if (node.suggested_users) {
                    console.log(`[IG-Clean] Removing SUGGESTED USERS card`);
                    cleanedCount.suggested++;
                    return false;
                }
                if (node.explore_story) {
                    console.log(`[IG-Clean] Removing SUGGESTED POST (explore_story)`);
                    cleanedCount.suggested++;
                    return false;
                }
            }

            return true;
        });

        if (filtered.length < originalLength) {
            console.log(`[IG-Clean] Filtered ${contextName}: ${originalLength} -> ${filtered.length} edges`);
        }
        return filtered;
    }

    function filterFeedItems(feedItems, contextName) {
        if (!Array.isArray(feedItems)) return feedItems;

        const originalLength = feedItems.length;
        const filtered = feedItems.filter(item => {
            if (!item) return true;
            if (config.removeSponsored && item.ad) {
                console.log(`[IG-Clean] Removing SPONSORED from ${contextName}`);
                cleanedCount.ads++;
                return false;
            }
            if (config.removeSuggested) {
                if (item.suggested_users) {
                    console.log(`[IG-Clean] Removing SUGGESTED from ${contextName}`);
                    cleanedCount.suggested++;
                    return false;
                }
                if (item.explore_story) {
                    console.log(`[IG-Clean] Removing SUGGESTED POST from ${contextName}`);
                    cleanedCount.suggested++;
                    return false;
                }
            }
            return true;
        });

        if (filtered.length < originalLength) {
            console.log(`[IG-Clean] Filtered ${contextName}: ${originalLength} -> ${filtered.length} items`);
        }
        return filtered;
    }

    function deepCleanFeedData(obj, depth = 0, path = 'root') {
        if (!obj || typeof obj !== 'object' || depth > 10) return;

        if (obj.xdt_api__v1__feed__timeline__connection?.edges) {
            obj.xdt_api__v1__feed__timeline__connection.edges =
                filterEdges(obj.xdt_api__v1__feed__timeline__connection.edges, `Deep(${path})`);
        }

        if (config.removeSponsored && obj.xdt_injected_story_units?.ad_media_items?.length > 0) {
            const count = obj.xdt_injected_story_units.ad_media_items.length;
            console.log(`[IG-Clean] Found ${count} story ads at path: ${path}`);
            cleanedCount.ads += count;
            obj.xdt_injected_story_units.ad_media_items = [];
        }

        if (obj.data)   deepCleanFeedData(obj.data,   depth + 1, path + '.data');
        if (obj.result) deepCleanFeedData(obj.result, depth + 1, path + '.result');

        if (Array.isArray(obj.require)) {
            for (let i = 0; i < obj.require.length; i++) {
                const req = obj.require[i];
                if (Array.isArray(req)) {
                    for (let j = 0; j < req.length; j++) {
                        deepCleanFeedData(req[j], depth + 1, path + `.require[${i}][${j}]`);
                    }
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
                        if (group.feed_items) {
                            group.feed_items = filterFeedItems(group.feed_items, 'End of Feed');
                        }
                    }
                }
            }
        }

        if (config.removeSponsored && obj.data?.xdt_injected_story_units?.ad_media_items) {
            const count = obj.data.xdt_injected_story_units.ad_media_items.length;
            if (count > 0) {
                obj.data.xdt_injected_story_units.ad_media_items = [];
                cleanedCount.ads += count;
            }
        }

        if (obj.result?.data?.xdt_api__v1__feed__timeline__connection?.edges) {
            obj.result.data.xdt_api__v1__feed__timeline__connection.edges =
                filterEdges(obj.result.data.xdt_api__v1__feed__timeline__connection.edges, 'Preloaded Feed');
        }

        return obj;
    }

    JSON.parse = function (text, reviver) {
        const data = originalParse.call(JSON, text, reviver);
        try {
            if (data && typeof data === 'object') cleanFeedData(data);
        } catch (e) {
            console.error('[IG-Clean] Error in JSON.parse hook:', e);
        }
        return data;
    };

    Response.prototype.json = async function () {
        const data = await originalResponseJson.call(this);
        try {
            if (data && typeof data === 'object') cleanFeedData(data);
        } catch (e) {
            console.error('[IG-Clean] Error in Response.json hook:', e);
        }
        return data;
    };

    setInterval(() => {
        if (cleanedCount.ads > 0 || cleanedCount.suggested > 0) {
            console.log(`[IG-Clean] Stats - Removed ${cleanedCount.ads} ads, ${cleanedCount.suggested} suggested cards`);
        }
    }, 30000);

    // === VISUAL FALLBACK ===

    const SPONSORED_LABELS = new Set([
        'Sponsored', 'Sponzorováno', 'Patrocinado', 'Sponsorisé', 'Gesponsert',
        'Sponsorizzato', 'Gesponsord', 'Sponsrad', 'Sponsorowane', 'Реклама',
        'مُموَّل', '광고', 'スポンサー', '赞助内容', '贊助內容', 'Berbayar',
    ]);

    const SUGGESTED_LABELS = new Set([
        'Suggested for you', 'Suggested posts',
        'Navrhované pro vás', 'Návrhy pro vás',
        'Sugeridas para ti', 'Publicaciones sugeridas',
        'Suggestions pour vous',
        'Vorgeschlagene Beiträge',
        'Suggeriti per te',
        'Voorgesteld voor jou',
        'Föreslagna för dig',
        'Sugerowane dla ciebie',
        'Рекомендации для вас',
        'Sugestões para você',
        'اقتراحات لك',
        '회원님을 위한 추천',
        'あなたへのおすすめ',
        '为您推荐',
        'Disarankan untuk Anda',
        // Follow-button variants (checked separately against button role)
        'Follow', 'Sledovat', 'Seguir', 'Suivre', 'Folgen', 'Seguire',
        'Volgen', '팔로우', 'フォロー', '关注',
    ]);

    const FOLLOW_LABELS = new Set([
        'Follow', 'Sledovat', 'Seguir', 'Suivre', 'Folgen', 'Seguire',
        'Volgen', '팔로우', 'フォロー', '关注',
    ]);

    const style = document.createElement('style');
    style.textContent = `
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
    (document.head || document.documentElement).appendChild(style);

    const processedArticles = new WeakSet();

    function processArticle(article) {
        if (processedArticles.has(article)) return;
        processedArticles.add(article);

        if (article.querySelector('a[href^="https://www.facebook.com/ads/"]')) {
            blurArticle(article, 'ad-link');
            return;
        }

        for (const el of article.querySelectorAll('span, a, div[role="button"], button')) {
            const text = el.textContent?.trim();
            if (!text) continue;

            if (SPONSORED_LABELS.has(text)) {
                if (config.blurSponsored) { blurArticle(article, `Sponsored ("${text}")`); return; }
            }

            if (SUGGESTED_LABELS.has(text)) {
                if (FOLLOW_LABELS.has(text)) {
                    const isButton = el.getAttribute('role') === 'button' || el.tagName === 'BUTTON' || el.closest('[role="button"]');
                    if (!isButton) continue;
                }
                if (config.blurSuggested) { blurArticle(article, `Suggested ("${text}")`); return; }
            }
        }
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

    const runInitialScan = () => {
        setTimeout(() => scanForAdsInDOM(document), 1500);
        setTimeout(() => scanForAdsInDOM(document), 3500);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInitialScan);
    } else {
        runInitialScan();
    }

    const observer = new MutationObserver((mutations) => {
        if (!observer.scanScheduled) {
            observer.scanScheduled = true;
            setTimeout(() => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        node.tagName === 'ARTICLE' ? processArticle(node) : scanForAdsInDOM(node);
                    }
                }
                observer.scanScheduled = false;
            }, 500);
        }
    });

    const startObserver = () => {
        const mainContainer = document.querySelector('main') || document.body;
        observer.observe(mainContainer, { childList: true, subtree: true });
        console.log('[IG-Clean] Blur fallback observer started');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        setTimeout(startObserver, 100);
    }

})();
