// ==UserScript==
// @name         Fuck Bing Search AD
// @name:zh-CN   Fuck Bing Search AD - Bing 搜索广告过滤
// @namespace    https://github.com/CX330-YCH/Fuck_Bing_Search_Ad
// @version      1.0.1
// @description  Remove Bing search ads, fake ad blocks, MSAN ads, and leftover separators.
// @description:zh-CN 删除 Bing 搜索广告、伪装广告、MSAN 广告和广告残留分隔线。
// @author       CX330-YCH
// @license      MIT
// @match        https://www.bing.com/search*
// @match        https://cn.bing.com/search*
// @match        https://bing.com/search*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/CX330-YCH/Fuck_Bing_Search_Ad
// @supportURL   https://github.com/CX330-YCH/Fuck_Bing_Search_Ad/issues
// @updateURL    https://raw.githubusercontent.com/CX330-YCH/Fuck_Bing_Search_Ad/main/Fuck_Bing_Search_Ad.user.js
// @downloadURL  https://raw.githubusercontent.com/CX330-YCH/Fuck_Bing_Search_Ad/main/Fuck_Bing_Search_Ad.user.js
// ==/UserScript==

(function () {
    'use strict';

    const APP_NAME = 'Fuck Bing Search AD';

    const ENABLE_LOG_PANEL = GM_getValue('enableLogPanel', false);
    const ENABLE_PERFORMANCE_MODE = GM_getValue('enablePerformanceMode', true);
    const ENABLE_AUTO_SKIP_EMPTY_AD_PAGE = GM_getValue('enableAutoSkipEmptyAdPage', true);

    GM_registerMenuCommand(ENABLE_LOG_PANEL ? '关闭 Log 面板' : '开启 Log 面板', () => {
        GM_setValue('enableLogPanel', !ENABLE_LOG_PANEL);
        alert(`${APP_NAME}：已${ENABLE_LOG_PANEL ? '关闭' : '开启'} Log 面板，刷新页面后生效`);
    });

    GM_registerMenuCommand(ENABLE_PERFORMANCE_MODE ? '关闭性能优化' : '开启性能优化', () => {
        GM_setValue('enablePerformanceMode', !ENABLE_PERFORMANCE_MODE);
        alert(`${APP_NAME}：已${ENABLE_PERFORMANCE_MODE ? '关闭' : '开启'}性能优化，刷新页面后生效`);
    });

    GM_registerMenuCommand(ENABLE_AUTO_SKIP_EMPTY_AD_PAGE ? '关闭自动跳过空广告页' : '开启自动跳过空广告页', () => {
        GM_setValue('enableAutoSkipEmptyAdPage', !ENABLE_AUTO_SKIP_EMPTY_AD_PAGE);
        alert(`${APP_NAME}：已${ENABLE_AUTO_SKIP_EMPTY_AD_PAGE ? '关闭' : '开启'}自动跳过空广告页，刷新页面后生效`);
    });

    GM_registerMenuCommand('重置广告统计', () => {
        GM_setValue('adTypeStats', { hit: {}, cleanup: {} });
        alert(`${APP_NAME}：广告统计已重置，刷新页面后生效`);
    });

    const MAX_LOG_LINES = 120;
    const SCAN_INTERVAL = ENABLE_PERFORMANCE_MODE ? 15000 : 3000;
    const OBSERVER_DEBOUNCE = ENABLE_PERFORMANCE_MODE ? 800 : 250;

    const MAX_AUTO_SKIP_PER_QUERY = 12;
    const MAX_AUTO_SKIP_FIRST = 120;
    const AUTO_SKIP_STATE_EXPIRE_MS = 10 * 60 * 1000;

    const PANEL_ID = 'fuck-bing-search-ad-log-panel';
    const WEB_SLUG_HIDE_STYLE_ID = 'fuck-bing-search-ad-web-slug-hide-style';
    const TOPW_SEPARATOR_HIDE_STYLE_ID = 'fuck-bing-search-ad-topw-separator-hide-style';

    let removedKeys = new Set();
    let scanCount = 0;
    let removeCount = 0;

    let logPanel;
    let logBody;
    let logBadge;

    let observer = null;
    let scanTimer = null;
    let isScanning = false;
    let lastNoDeleteLogTime = 0;
    let lastUrl = location.href;
    let autoSkipPending = false;

    const adSlugClasses = new Set();
    const webSlugClasses = new Set();
    const adLinkIds = new Set();

    let lastSlugSignature = '';
    let lastWebSlugCssKey = '';

    let adTypeStats = GM_getValue('adTypeStats', { hit: {}, cleanup: {} });
    let currentSessionStats = { hit: {}, cleanup: {} };

    if (!adTypeStats.hit || !adTypeStats.cleanup) {
        adTypeStats = { hit: adTypeStats || {}, cleanup: {} };
    }

    const REASON_TYPE_MAP = [
        { match: 'Bing 原生广告结果块', type: 'Bing 原生广告结果块', category: 'hit' },
        { match: 'initLinks aclick', type: 'initLinks aclick 伪装广告', category: 'hit' },
        { match: 'MSAN', type: 'MSAN 嵌入式广告', category: 'hit' },
        { match: 'AdSlug / acf-badge', type: 'AdSlug / acf-badge 广告标识', category: 'hit' },
        { match: 'WPT/slide 广告结构', type: 'WPT / slide 广告卡片', category: 'hit' },
        { match: '传统广告容器', type: '传统 b_ad 广告容器', category: 'hit' },
        { match: '广告子元素', type: '广告子链 / 多媒体广告结构', category: 'hit' },
        { match: '孤立 b_tpcn', type: '孤立品牌卡片广告', category: 'hit' },
        { match: 'init("广告")', type: '伪元素广告徽标', category: 'hit' },

        { match: '广告顶部残留分隔线', type: '广告顶部残留分隔线清理', category: 'cleanup' },
        { match: '清理空广告外壳', type: '空广告外壳清理', category: 'cleanup' },
        { match: '清理空白 WPT/slide', type: '空白 WPT / slide 占位清理', category: 'cleanup' },
        { match: 'WPT/slide 内仍含广告结构', type: 'WPT / slide 残留广告清理', category: 'cleanup' },
        { match: '自动跳过空广告页', type: '自动跳过空广告页', category: 'cleanup' }
    ];

    function getReasonMeta(reason) {
        const item = REASON_TYPE_MAP.find(rule => reason.includes(rule.match));
        return item ? { type: item.type, category: item.category } : { type: '其他广告 / 未分类', category: 'hit' };
    }

    function incrementAdTypeStats(reason) {
        const meta = getReasonMeta(reason);
        const { category, type } = meta;

        if (!adTypeStats[category]) adTypeStats[category] = {};
        if (!currentSessionStats[category]) currentSessionStats[category] = {};

        adTypeStats[category][type] = (adTypeStats[category][type] || 0) + 1;
        currentSessionStats[category][type] = (currentSessionStats[category][type] || 0) + 1;

        GM_setValue('adTypeStats', adTypeStats);
        return meta;
    }

    function formatStats(stats) {
        const entries = Object.entries(stats || {}).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return '暂无';
        return entries.map(([type, count]) => `${type}：${count}`).join(' ｜ ');
    }

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function formatSplitStats(stats) {
        return `
            广告命中统计：${escapeHtml(formatStats(stats?.hit || {}))}<br>
            清理动作统计：${escapeHtml(formatStats(stats?.cleanup || {}))}
        `;
    }

    function nowTime() {
        return new Date().toLocaleTimeString();
    }

    function shortText(el) {
        return (el?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 180);
    }

    function runWhenIdle(fn) {
        if (!ENABLE_PERFORMANCE_MODE) {
            fn();
            return;
        }

        if ('requestIdleCallback' in window) {
            requestIdleCallback(fn, { timeout: 1200 });
        } else {
            setTimeout(fn, 300);
        }
    }

    function ensureLogPanel() {
        if (!ENABLE_LOG_PANEL) return false;

        const existingPanel = document.getElementById(PANEL_ID);
        const existingBody = document.getElementById('fuck-bing-search-ad-log-body');

        if (existingPanel && existingBody && existingPanel.isConnected && existingBody.isConnected) {
            logPanel = existingPanel;
            logBody = existingBody;
            logBadge = document.getElementById('fuck-bing-search-ad-log-badge');
            return true;
        }

        logPanel = null;
        logBody = null;
        logBadge = null;

        createLogPanel();
        return !!document.getElementById(PANEL_ID);
    }

    function createLogPanel() {
        if (!ENABLE_LOG_PANEL) return;

        const existingPanel = document.getElementById(PANEL_ID);
        const existingBody = document.getElementById('fuck-bing-search-ad-log-body');

        if (existingPanel && existingBody && existingPanel.isConnected && existingBody.isConnected) {
            logPanel = existingPanel;
            logBody = existingBody;
            logBadge = document.getElementById('fuck-bing-search-ad-log-badge');
            return;
        }

        if (existingPanel) existingPanel.remove();

        logPanel = document.createElement('div');
        logPanel.id = PANEL_ID;
        logPanel.innerHTML = `
            <div id="fuck-bing-search-ad-log-header">
                <div>
                    <strong>${APP_NAME}</strong>
                    <span id="fuck-bing-search-ad-log-badge">运行中</span>
                </div>
                <button id="fuck-bing-search-ad-log-clear" type="button">清空</button>
            </div>
            <div id="fuck-bing-search-ad-log-summary">
                扫描：0 次 ｜ 删除：0 个 ｜ 性能优化：${ENABLE_PERFORMANCE_MODE ? '开' : '关'} ｜ 自动跳页：${ENABLE_AUTO_SKIP_EMPTY_AD_PAGE ? '开' : '关'}
            </div>
            <div id="fuck-bing-search-ad-type-stats">
                <strong>本页统计</strong><br>
                ${formatSplitStats(currentSessionStats)}
                <br><br>
                <strong>累计统计</strong><br>
                ${formatSplitStats(adTypeStats)}
            </div>
            <div id="fuck-bing-search-ad-log-body"></div>
        `;

        const oldStyle = document.getElementById('fuck-bing-search-ad-log-style');
        if (oldStyle) oldStyle.remove();

        const style = document.createElement('style');
        style.id = 'fuck-bing-search-ad-log-style';
        style.textContent = `
            #${PANEL_ID} {
                position: fixed;
                top: 90px;
                right: 16px;
                width: 500px;
                max-height: 72vh;
                z-index: 2147483647;
                background: rgba(24, 24, 24, 0.94);
                color: #e8e8e8;
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                overflow: hidden;
                backdrop-filter: blur(8px);
            }
            #fuck-bing-search-ad-log-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(255, 255, 255, 0.05);
            }
            #fuck-bing-search-ad-log-header strong {
                font-size: 13px;
                color: #fff;
            }
            #fuck-bing-search-ad-log-badge {
                display: inline-block;
                margin-left: 8px;
                padding: 2px 6px;
                border-radius: 999px;
                background: rgba(60, 180, 120, 0.22);
                color: #8ff0bd;
                font-size: 11px;
            }
            #fuck-bing-search-ad-log-clear {
                border: 0;
                border-radius: 6px;
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.12);
                color: #fff;
                cursor: pointer;
                font-size: 12px;
            }
            #fuck-bing-search-ad-log-summary {
                padding: 8px 12px;
                color: #bdbdbd;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            #fuck-bing-search-ad-type-stats {
                padding: 8px 12px;
                color: #d6d6d6;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                line-height: 1.5;
                word-break: break-word;
            }
            #fuck-bing-search-ad-type-stats strong {
                color: #ffffff;
            }
            #fuck-bing-search-ad-log-body {
                max-height: calc(72vh - 176px);
                overflow-y: auto;
                padding: 8px 10px;
                line-height: 1.45;
            }
            .fuck-bing-search-ad-log-line {
                padding: 6px 0;
                border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
                word-break: break-word;
            }
            .fuck-bing-search-ad-log-time {
                color: #8ab4f8;
                margin-right: 4px;
            }
            .fuck-bing-search-ad-log-scan {
                color: #bdbdbd;
            }
            .fuck-bing-search-ad-log-remove {
                color: #ffcb6b;
            }
            .fuck-bing-search-ad-log-error {
                color: #ff7b7b;
            }
        `;

        document.documentElement.appendChild(style);
        document.body.appendChild(logPanel);

        logBody = document.getElementById('fuck-bing-search-ad-log-body');
        logBadge = document.getElementById('fuck-bing-search-ad-log-badge');

        const clearButton = document.getElementById('fuck-bing-search-ad-log-clear');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (logBody) logBody.innerHTML = '';
                log('日志已清空', 'scan');
            });
        }
    }

    function updateSummary() {
        if (!ENABLE_LOG_PANEL) return;

        ensureLogPanel();

        const summary = document.getElementById('fuck-bing-search-ad-log-summary');
        if (summary) {
            summary.textContent = `扫描：${scanCount} 次 ｜ 删除：${removeCount} 个 ｜ 性能优化：${ENABLE_PERFORMANCE_MODE ? '开' : '关'} ｜ 自动跳页：${ENABLE_AUTO_SKIP_EMPTY_AD_PAGE ? '开' : '关'}`;
        }

        const statsBox = document.getElementById('fuck-bing-search-ad-type-stats');
        if (statsBox) {
            statsBox.innerHTML = `
                <strong>本页统计</strong><br>
                ${formatSplitStats(currentSessionStats)}
                <br><br>
                <strong>累计统计</strong><br>
                ${formatSplitStats(adTypeStats)}
            `;
        }
    }

    function log(message, type = 'scan') {
        if (!ENABLE_LOG_PANEL) return;

        if (!ensureLogPanel()) return;
        if (!logBody || !logBody.isConnected) return;

        const line = document.createElement('div');
        line.className = `fuck-bing-search-ad-log-line fuck-bing-search-ad-log-${type}`;
        line.innerHTML = `
            <span class="fuck-bing-search-ad-log-time">[${nowTime()}]</span>
            <span>${escapeHtml(message)}</span>
        `;

        logBody.prepend(line);

        while (logBody.children.length > MAX_LOG_LINES) {
            logBody.removeChild(logBody.lastChild);
        }

        updateSummary();
    }

    function refreshSlugClassMap(force = false) {
        const scripts = Array.from(document.scripts);

        let signature = '';

        if (ENABLE_PERFORMANCE_MODE) {
            signature = scripts
                .map(s => `${s.src || 'inline'}:${(s.textContent || '').length}`)
                .join('|');

            if (!force && signature === lastSlugSignature) {
                return;
            }

            lastSlugSignature = signature;
        }

        adSlugClasses.clear();
        webSlugClasses.clear();
        adLinkIds.clear();

        for (const script of scripts) {
            const text = script.textContent || '';

            const adRegex = /cHG2RldmnfGrgfR3aHkg\.init\(\s*"广告"\s*,\s*"([^"]+)"/g;
            let adMatch;
            while ((adMatch = adRegex.exec(text)) !== null) {
                adSlugClasses.add(adMatch[1]);
            }

            const webRegex = /cHG2RldmnfGrgfR3aHkg\.webInit\(\s*"([^"]+)"\s*,\s*"网页"/g;
            let webMatch;
            while ((webMatch = webRegex.exec(text)) !== null) {
                webSlugClasses.add(webMatch[1]);
            }

            const adRegexSingle = /cHG2RldmnfGrgfR3aHkg\.init\(\s*'广告'\s*,\s*'([^']+)'/g;
            let adMatchSingle;
            while ((adMatchSingle = adRegexSingle.exec(text)) !== null) {
                adSlugClasses.add(adMatchSingle[1]);
            }

            const webRegexSingle = /cHG2RldmnfGrgfR3aHkg\.webInit\(\s*'([^']+)'\s*,\s*'网页'/g;
            let webMatchSingle;
            while ((webMatchSingle = webRegexSingle.exec(text)) !== null) {
                webSlugClasses.add(webMatchSingle[1]);
            }

            const adLinkRegex = /initLinks\(\s*["']([^"']+)["']\s*,\s*["']https:\/\/www\.bing\.com\/aclick\?/g;
            let adLinkMatch;
            while ((adLinkMatch = adLinkRegex.exec(text)) !== null) {
                adLinkIds.add(adLinkMatch[1]);
            }

            const adLinkEscapedRegex = /initLinks\(\s*["']([^"']+)["']\s*,\s*["']https:\\\/\\\/www\.bing\.com\\\/aclick\?/g;
            let adLinkEscapedMatch;
            while ((adLinkEscapedMatch = adLinkEscapedRegex.exec(text)) !== null) {
                adLinkIds.add(adLinkEscapedMatch[1]);
            }
        }

        log(`徽标 class 映射刷新：广告 ${adSlugClasses.size} 个，网页 ${webSlugClasses.size} 个，广告链接 ${adLinkIds.size} 个`, 'scan');
    }

    function cssEscapeClassName(className) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(className);
        }
        return String(className).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function updateWebSlugHideStyle() {
        const cssKey = Array.from(webSlugClasses).sort().join('|');

        if (ENABLE_PERFORMANCE_MODE && cssKey === lastWebSlugCssKey) {
            return;
        }

        lastWebSlugCssKey = cssKey;

        let style = document.getElementById(WEB_SLUG_HIDE_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = WEB_SLUG_HIDE_STYLE_ID;
            document.documentElement.appendChild(style);
        }

        if (!webSlugClasses.size) {
            style.textContent = '';
            return;
        }

        style.textContent = Array.from(webSlugClasses)
            .map(cls => {
                const safeCls = cssEscapeClassName(cls);
                return `
                    p.${safeCls}::before {
                        content: none !important;
                        display: none !important;
                        width: 0 !important;
                        height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: 0 !important;
                    }
                `;
            })
            .join('\n');
    }

    function installTopwSeparatorHideStyle() {
        let style = document.getElementById(TOPW_SEPARATOR_HIDE_STYLE_ID);

        if (!style) {
            style = document.createElement('style');
            style.id = TOPW_SEPARATOR_HIDE_STYLE_ID;
            document.documentElement.appendChild(style);
        }

        style.textContent = `
            ol#b_topw.b_results_eml::before,
            ol#b_topw.b_results_eml::after,
            #b_topw.b_results_eml::before,
            #b_topw.b_results_eml::after {
                content: none !important;
                display: none !important;
                width: 0 !important;
                height: 0 !important;
                min-height: 0 !important;
                border: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                background: none !important;
                box-shadow: none !important;
            }

            ol#b_topw.b_results_eml,
            #b_topw.b_results_eml {
                border-top: 0 !important;
                border-bottom: 0 !important;
                box-shadow: none !important;
            }

            ol#b_topw.b_results_eml:empty,
            #b_topw.b_results_eml:empty {
                display: none !important;
                height: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                background: none !important;
                box-shadow: none !important;
            }
        `;
    }

    function getAdRemovalRoot(el) {
        if (!el) return null;

        return (
            el.closest('#adstop_gradiant_separator') ||
            el.closest('.b_results_lsep') ||
            el.closest('[id*="adstop"]') ||
            el.closest('.msan_ads_container') ||
            el.closest('[data-partnertag="Ads.EmbeddedMSANAdsBlock"]') ||
            el.closest('[data-partnertag*="MSAN"]') ||
            el.closest('[data-partnertag*="Ads.Embedded"]') ||
            el.closest('.embedded_ads_msan') ||
            el.closest('.msan_header_container') ||
            el.closest('.msan_info_container') ||
            el.closest('li.b_adTop') ||
            el.closest('li.b_adBottom') ||
            el.closest('li.b_adLastChild') ||
            el.closest('li.b_ad') ||
            el.closest('.slide.wptSld') ||
            el.closest('.b_wpt_bl') ||
            el.closest('li.b_algo') ||
            el.closest('#b_results > li') ||
            el.closest('#b_topw > li') ||
            el.closest('#b_context > li') ||
            el.closest('#b_rrat_cont > li') ||
            el.closest('li') ||
            el
        );
    }

    function elementPathKey(el) {
        if (!el) return '';
        return [
            el.tagName,
            el.id || '',
            el.className || '',
            el.getAttribute?.('data-bm') || '',
            el.getAttribute?.('iid') || '',
            shortText(el).slice(0, 80)
        ].join('|');
    }

    function removeElement(el, reason) {
        if (!el || !el.parentNode) return false;

        const key = reason + '|' + elementPathKey(el);
        if (removedKeys.has(key)) return false;
        removedKeys.add(key);

        const text = shortText(el);
        const reasonMeta = incrementAdTypeStats(reason);
        const reasonType = reasonMeta.type;
        const reasonCategory = reasonMeta.category === 'cleanup' ? '清理动作' : '广告命中';

        removeCount++;

        log(`删除元素 #${removeCount}｜分类：${reasonCategory}｜类型：${reasonType}｜原因：${reason}｜${text || '无可见文本'}`, 'remove');

        console.log(`[${APP_NAME} 已删除]`, {
            category: reasonMeta.category,
            type: reasonType,
            reason,
            text,
            element: el,
            currentSessionStats,
            totalStats: adTypeStats
        });

        el.remove();
        updateSummary();

        return true;
    }

    function removeAdBySignal(el, reason) {
        const root = getAdRemovalRoot(el);
        return removeElement(root, reason);
    }

    function getTopAlgoItems() {
        return Array.from(document.querySelectorAll('#b_results > li.b_algo, #b_topw > li.b_algo'));
    }

    function isBingNativeAdAlgo(li) {
        if (!li || !li.classList.contains('b_algo')) return false;

        const hasAdsHAttr = !!li.querySelector(
            'h2 a[h*=",Ads"], h2 a[h$="Ads"], a[h*=",Ads"], a[h$="Ads"]'
        );

        const hasAdDescription = !!li.querySelector('.b_ad_description');

        const hasAdSlug = !!li.querySelector(
            'acf-badge[data-style="AdSlug"], .ta-slug-pos-wrapper, .acf-ad-slug-pos-wrapper, .b_adSlug, .mma_smallcard_adSlug'
        );

        const hasInitLinksAd = Array.from(li.querySelectorAll('a[id]'))
            .some(a => adLinkIds.has(a.id));

        return hasAdsHAttr || hasAdDescription || hasAdSlug || hasInitLinksAd;
    }

    function isPureTpcnBrandCard(li) {
        if (!li) return false;

        const hasTpcn = li.querySelector(':scope > .b_tpcn') || li.querySelector(':scope > div.b_tpcn');
        const hasTilk = li.querySelector('.b_tpcn > a.tilk');
        const hasTpic = li.querySelector('.b_tpcn .tpic');
        const hasTptxt = li.querySelector('.b_tpcn .tptxt');
        const hasTptt = li.querySelector('.b_tpcn .tptt');

        if (!(hasTpcn && hasTilk && hasTpic && hasTptxt && hasTptt)) return false;

        const hasNormalResultBody =
            li.querySelector('.b_title') ||
            li.querySelector('h2') ||
            li.querySelector('.b_caption') ||
            li.querySelector('cite') ||
            li.querySelector('.b_imgcap_main') ||
            li.querySelector('.b_imgcap_altitle');

        if (hasNormalResultBody) return false;

        const directElementChildren = Array.from(li.children).filter(child => {
            const tag = child.tagName.toLowerCase();
            return tag !== 'style' && tag !== 'script';
        });

        return directElementChildren.length === 1 &&
            directElementChildren[0].classList.contains('b_tpcn');
    }

    function isSafePseudoAdCandidate(li, p) {
        if (!li || !p) return false;

        const inCaption = !!p.closest('.b_caption');
        if (!inCaption) return false;

        const classList = Array.from(p.classList);

        const hasWebSlugClass = classList.some(cls => webSlugClasses.has(cls));
        if (hasWebSlugClass) return false;

        const hasAdSlugClass = classList.some(cls => adSlugClasses.has(cls));
        if (!hasAdSlugClass) return false;

        const isImageCaptionResult =
            li.querySelector('.b_imgcap_altitle') ||
            li.querySelector('.b_imgcap_main') ||
            li.querySelector('.b_imgcap_img') ||
            li.querySelector('.captionMediaCard') ||
            li.querySelector('.wide_wideAlgo');

        if (isImageCaptionResult) return false;

        const isRichResult =
            li.querySelector('.b_rich') ||
            li.querySelector('.b_algo_group') ||
            li.querySelector('.b_widgetContainer') ||
            li.querySelector('.b_gobig_feedback');

        if (isRichResult) return false;

        const isSnippetLineClamp =
            p.classList.contains('b_lineclamp1') ||
            p.classList.contains('b_lineclamp2') ||
            p.classList.contains('b_lineclamp3') ||
            p.classList.contains('b_lineclamp4') ||
            classList.some(cls => cls.includes('b_lineclamp'));

        if (!isSnippetLineClamp) return false;

        let beforeStyle;
        try {
            beforeStyle = window.getComputedStyle(p, '::before');
        } catch {
            return false;
        }

        const content = beforeStyle.getPropertyValue('content');
        const display = beforeStyle.getPropertyValue('display');
        const visibility = beforeStyle.getPropertyValue('visibility');
        const opacity = parseFloat(beforeStyle.getPropertyValue('opacity')) || 1;

        const hasBeforeContent =
            content &&
            content !== 'none' &&
            content !== 'normal' &&
            content !== '""';

        if (!hasBeforeContent) return false;

        return display !== 'none' && visibility !== 'hidden' && opacity > 0;
    }

    function elementHasMeaningfulContent(el) {
        if (!el) return false;

        const text = (el.textContent || '').replace(/\s+/g, '').trim();
        if (text.length > 0) return true;

        return !!el.querySelector('img, a, button, [role="link"], [role="button"]');
    }

    function cleanupEmptyAdShells() {
        let count = 0;

        document.querySelectorAll(`
            #adstop_gradiant_separator,
            .b_results_lsep,
            [id*="adstop"][class*="b_results_lsep"],
            li.b_ad,
            li.b_adTop,
            li.b_adBottom,
            li.b_adLastChild,
            #b_results > li,
            #b_topw > li
        `).forEach(el => {
            if (!el.parentNode) return;

            if (
                el.id === 'adstop_gradiant_separator' ||
                el.classList.contains('b_results_lsep') ||
                (String(el.id || '').includes('adstop') && String(el.className || '').includes('b_results_lsep'))
            ) {
                if (removeElement(el, '广告顶部残留分隔线清理')) count++;
                return;
            }

            const className = String(el.className || '');

            const isAdLikeShell =
                className.includes('b_ad') ||
                el.querySelector('.b_ad, .b_adSlug, acf-badge[data-style="AdSlug"], .ta-slug-pos-wrapper, .acf-ad-slug-pos-wrapper');

            const hasNormalResult =
                el.querySelector('h2:not(.smallmma_ad_title), .b_title:not(.smallmma_ad_title), cite:not(.b_adurl), .b_algo') &&
                !className.includes('b_ad');

            const meaningful = elementHasMeaningfulContent(el);

            if (isAdLikeShell && !meaningful && !hasNormalResult) {
                if (removeElement(el, '清理空广告外壳')) count++;
            }
        });

        document.querySelectorAll('#b_topw .b_wpt_bl, #b_topw .slide.wptSld').forEach(el => {
            if (!el.parentNode) return;

            const hasAdInside = el.querySelector(
                '.b_ad, .b_adcard, .top_ads_magazine, .mma_acf_ad, acf-badge[data-style="AdSlug"], .b_adSlug'
            );

            const hasNormalWidget = el.querySelector(
                '.utilAns, .df_alsoAskCard, .kc_quickfacts, .b_split_cards_cont, .l_ecrd_hero, .b_imgcap_main, .b_title, .b_caption'
            );

            if (hasAdInside) {
                if (removeAdBySignal(el, 'WPT/slide 内仍含广告结构')) count++;
                return;
            }

            if (!elementHasMeaningfulContent(el) && !hasNormalWidget) {
                const root = el.closest('.slide.wptSld') || el;
                if (removeElement(root, '清理空白 WPT/slide 占位')) count++;
            }
        });

        return count;
    }

    function disconnectObserverDuringScan() {
        if (ENABLE_PERFORMANCE_MODE && observer) {
            observer.disconnect();
        }
    }

    function reconnectObserverAfterScan() {
        if (ENABLE_PERFORMANCE_MODE && observer && document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function getVisibleOrganicResultCount() {
        return Array.from(document.querySelectorAll('#b_results > li.b_algo, #b_topw > li.b_algo'))
            .filter(el => {
                if (!el.isConnected) return false;

                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;

                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            })
            .length;
    }

    function hasNoResultMessage() {
        const text = document.body?.textContent || '';
        return (
            text.includes('没有与此相关的结果') ||
            text.includes('沒有與此相關的結果') ||
            text.includes('No results found') ||
            text.includes('There are no results')
        );
    }

    function getQuerySkipKey() {
        const url = new URL(location.href);
        const query = url.searchParams.get('q') || '';
        const cc = url.searchParams.get('cc') || '';
        const setlang = url.searchParams.get('setlang') || '';
        const mkt = url.searchParams.get('mkt') || '';

        return `fuck-bing-search-ad-auto-skip:${query}:${cc}:${setlang}:${mkt}`;
    }

    function getCurrentFirstValue() {
        try {
            const url = new URL(location.href);
            return Number(url.searchParams.get('first') || '0') || 0;
        } catch {
            return 0;
        }
    }

    function loadAutoSkipState() {
        const key = getQuerySkipKey();

        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) {
                return { count: 0, firstList: [], hrefList: [], updatedAt: Date.now() };
            }

            const state = JSON.parse(raw);

            if (!state || typeof state !== 'object') throw new Error('invalid state');

            if (Date.now() - Number(state.updatedAt || 0) > AUTO_SKIP_STATE_EXPIRE_MS) {
                return { count: 0, firstList: [], hrefList: [], updatedAt: Date.now() };
            }

            return {
                count: Number(state.count || 0),
                firstList: Array.isArray(state.firstList) ? state.firstList : [],
                hrefList: Array.isArray(state.hrefList) ? state.hrefList : [],
                updatedAt: Number(state.updatedAt || Date.now())
            };
        } catch {
            return { count: 0, firstList: [], hrefList: [], updatedAt: Date.now() };
        }
    }

    function saveAutoSkipState(state) {
        const key = getQuerySkipKey();

        const safeState = {
            count: Number(state.count || 0),
            firstList: Array.from(new Set(state.firstList || [])).slice(-30),
            hrefList: Array.from(new Set(state.hrefList || [])).slice(-30),
            updatedAt: Date.now()
        };

        sessionStorage.setItem(key, JSON.stringify(safeState));
    }

    function findNextPageLink() {
        const candidates = [
            'a.sb_pagN',
            '.b_pag a.sb_pagN',
            'a[aria-label*="下一页"]',
            'a[title*="下一页"]',
            'a[aria-label*="下一頁"]',
            'a[title*="下一頁"]',
            'a[aria-label*="Next"]',
            'a[title*="Next"]'
        ];

        for (const selector of candidates) {
            const el = document.querySelector(selector);
            if (el && el.href) return el;
        }

        const links = Array.from(document.querySelectorAll('a[href*="first="]'));
        const currentUrl = new URL(location.href);
        const currentFirst = Number(currentUrl.searchParams.get('first') || '0');

        const nextLinks = links
            .map(a => {
                try {
                    const u = new URL(a.href, location.href);
                    return { a, first: Number(u.searchParams.get('first') || '0') };
                } catch {
                    return null;
                }
            })
            .filter(item => item && item.first > currentFirst)
            .sort((x, y) => x.first - y.first);

        return nextLinks[0]?.a || null;
    }

    function buildSyntheticNextPageUrl() {
        try {
            const url = new URL(location.href);

            const currentFirstRaw = url.searchParams.get('first');
            const currentFirst = Number(currentFirstRaw || '0');

            const nextFirst = (!Number.isFinite(currentFirst) || currentFirst <= 0)
                ? 10
                : currentFirst + 10;

            url.searchParams.set('first', String(nextFirst));
            url.searchParams.set('FORM', 'PERE');

            return url.href;
        } catch (e) {
            console.warn(`[${APP_NAME}] 构造下一页 URL 失败`, e);
            return null;
        }
    }

    function findNextPageTarget() {
        const link = findNextPageLink();

        if (link) {
            try {
                const u = new URL(link.href, location.href);
                return {
                    type: 'link',
                    el: link,
                    href: link.href,
                    first: Number(u.searchParams.get('first') || '0') || 0
                };
            } catch {
                return { type: 'link', el: link, href: link.href, first: 0 };
            }
        }

        const syntheticUrl = buildSyntheticNextPageUrl();

        if (syntheticUrl) {
            try {
                const u = new URL(syntheticUrl, location.href);
                return {
                    type: 'url',
                    href: syntheticUrl,
                    first: Number(u.searchParams.get('first') || '0') || 0
                };
            } catch {
                return { type: 'url', href: syntheticUrl, first: 0 };
            }
        }

        return null;
    }

    function maybeAutoSkipEmptyAdPage(removedThisScan, trigger) {
        if (!ENABLE_AUTO_SKIP_EMPTY_AD_PAGE) return;
        if (autoSkipPending) return;

        autoSkipPending = true;

        setTimeout(() => {
            autoSkipPending = false;

            const visibleOrganicCount = getVisibleOrganicResultCount();
            const noResult = hasNoResultMessage();

            if (!(visibleOrganicCount === 0 && (noResult || removedThisScan > 0))) return;

            const nextTarget = findNextPageTarget();

            if (!nextTarget) {
                log('当前页疑似全广告页，但未找到下一页按钮，也无法构造下一页地址', 'scan');
                return;
            }

            const state = loadAutoSkipState();
            const currentFirst = getCurrentFirstValue();
            const nextFirst = Number(nextTarget.first || 0);
            const nextHref = nextTarget.href || '';

            if (state.count >= MAX_AUTO_SKIP_PER_QUERY) {
                log(`已达到自动跳页连续上限 ${MAX_AUTO_SKIP_PER_QUERY}，停止自动跳页`, 'scan');
                return;
            }

            if (nextFirst > MAX_AUTO_SKIP_FIRST) {
                log(`下一页 first=${nextFirst} 已超过自动跳页最大深度 ${MAX_AUTO_SKIP_FIRST}，停止自动跳页`, 'scan');
                return;
            }

            if (nextHref && state.hrefList.includes(nextHref)) {
                log('检测到自动跳页 URL 重复，停止自动跳页，避免循环', 'scan');
                return;
            }

            if (nextFirst && state.firstList.includes(nextFirst)) {
                log(`检测到自动跳页 first=${nextFirst} 重复，停止自动跳页，避免循环`, 'scan');
                return;
            }

            if (nextFirst && currentFirst && nextFirst <= currentFirst) {
                log(`下一页 first=${nextFirst} 未大于当前 first=${currentFirst}，停止自动跳页`, 'scan');
                return;
            }

            state.count += 1;
            state.firstList.push(currentFirst);
            if (nextFirst) state.firstList.push(nextFirst);
            if (nextHref) state.hrefList.push(nextHref);
            saveAutoSkipState(state);

            incrementAdTypeStats('自动跳过空广告页');

            log(
                `当前页删除广告后无自然结果，自动跳转下一页｜连续第 ${state.count} 次｜currentFirst=${currentFirst}｜nextFirst=${nextFirst}｜方式：${nextTarget.type === 'link' ? '点击下一页' : '构造URL'}｜触发：${trigger}`,
                'remove'
            );

            if (nextTarget.type === 'link') {
                nextTarget.el.click();
            } else {
                location.href = nextTarget.href;
            }
        }, ENABLE_PERFORMANCE_MODE ? 650 : 300);
    }

    function removeBingAds(trigger = 'manual') {
        if (isScanning) return;

        isScanning = true;
        scanCount++;

        if (logBadge) logBadge.textContent = '扫描中';

        let removedThisScan = 0;

        disconnectObserverDuringScan();

        try {
            const forceRefreshClassMap = trigger.includes('URL变化') || trigger.includes('启动');

            refreshSlugClassMap(forceRefreshClassMap);
            updateWebSlugHideStyle();
            installTopwSeparatorHideStyle();

            document.querySelectorAll(`
                #adstop_gradiant_separator,
                .b_results_lsep,
                [id*="adstop"][class*="b_results_lsep"]
            `).forEach(el => {
                if (removeAdBySignal(el, '广告顶部残留分隔线 adstop_gradiant_separator 命中')) {
                    removedThisScan++;
                }
            });

            document.querySelectorAll(`
                .msan_ads_container,
                [data-partnertag="Ads.EmbeddedMSANAdsBlock"],
                [data-partnertag*="MSAN"],
                [data-partnertag*="Ads.Embedded"],
                .embedded_msan_ad_slug,
                .embedded_ads_msan,
                .msan_header_container,
                .msan_info_container,
                .embedded_header_label_lower,
                .b_adinfo
            `).forEach(el => {
                if (removeAdBySignal(el, 'MSAN 嵌入式广告命中')) {
                    removedThisScan++;
                }
            });

            document.querySelectorAll(`
                acf-badge[data-style="AdSlug"],
                .ta-slug-pos-wrapper,
                .acf-ad-slug-pos-wrapper,
                .b_adSlug,
                .mma_smallcard_adSlug
            `).forEach(el => {
                if (removeAdBySignal(el, 'AdSlug / acf-badge 广告标识命中')) {
                    removedThisScan++;
                }
            });

            getTopAlgoItems().forEach((li, index) => {
                if (index >= 20) return;

                if (isBingNativeAdAlgo(li)) {
                    if (
                        removeElement(
                            li,
                            `Bing 原生广告结果块命中，h Ads / b_ad_description / AdSlug / initLinks aclick，index=${index}`
                        )
                    ) {
                        removedThisScan++;
                    }
                }
            });

            document.querySelectorAll(`
                #b_topw .slide.wptSld .b_ad,
                #b_topw .slide.wptSld .b_adcard,
                #b_topw .slide.wptSld .top_ads_magazine,
                #b_topw .slide.wptSld .mma_acf_ad,
                #b_topw .slide.wptSld acf-badge[data-style="AdSlug"]
            `).forEach(el => {
                if (removeAdBySignal(el, 'WPT/slide 广告结构命中')) {
                    removedThisScan++;
                }
            });

            document.querySelectorAll(`
                li.b_ad,
                li.b_adTop,
                li.b_adBottom,
                li.b_adLastChild,
                .b_ad,
                .sb_add
            `).forEach(el => {
                if (removeAdBySignal(el, '传统广告容器 b_ad / sb_add')) {
                    removedThisScan++;
                }
            });

            document.querySelectorAll(`
                .b_adlabel,
                .b_ads1line,
                .ad_vsl,
                .ad_vslWiderClk,
                [class*="ad_vsl"],
                [class*="b_ads"],
                .smallmma_ad_title,
                .smallmma_ad_description,
                .mma_smallcard_txtimg_container,
                .mma_smallcard_titleDesc
            `).forEach(el => {
                if (removeAdBySignal(el, '广告子元素命中，向上删除结果块')) {
                    removedThisScan++;
                }
            });

            getTopAlgoItems().forEach((li, index) => {
                if (index >= 10) return;

                if (isPureTpcnBrandCard(li)) {
                    if (removeElement(li, `命中孤立 b_tpcn 品牌卡片结构，index=${index}`)) {
                        removedThisScan++;
                    }
                }
            });

            getTopAlgoItems().forEach((li, index) => {
                if (index >= 10) return;

                const targetPs = li.querySelectorAll(
                    '.b_caption p.b_lineclamp1, .b_caption p.b_lineclamp2, .b_caption p.b_lineclamp3, .b_caption p.b_lineclamp4, .b_caption p[class*="b_lineclamp"]'
                );

                targetPs.forEach(p => {
                    if (isSafePseudoAdCandidate(li, p)) {
                        if (
                            removeElement(
                                li,
                                `命中 init("广告") class 的 p.b_lineclamp::before，index=${index}`
                            )
                        ) {
                            removedThisScan++;
                        }
                    }
                });
            });

            removedThisScan += cleanupEmptyAdShells();

            if (removedThisScan > 0) {
                log(
                    `扫描完成：本轮删除 ${removedThisScan} 个｜触发：${trigger}｜本页广告命中：${formatStats(currentSessionStats.hit)}｜本页清理动作：${formatStats(currentSessionStats.cleanup)}`,
                    'remove'
                );
            } else {
                const now = Date.now();
                if (now - lastNoDeleteLogTime > 5000) {
                    log(`扫描完成：未发现可删除元素｜触发：${trigger}｜广告class=${adSlugClasses.size} 网页class=${webSlugClasses.size} 广告链接=${adLinkIds.size}`, 'scan');
                    lastNoDeleteLogTime = now;
                }
            }

            maybeAutoSkipEmptyAdPage(removedThisScan, trigger);

            if (logBadge) logBadge.textContent = '运行中';
        } catch (e) {
            log(`扫描出错：${e.message}`, 'error');
            console.error(`[${APP_NAME} Error]`, e);
        } finally {
            isScanning = false;
            updateSummary();
            reconnectObserverAfterScan();
        }
    }

    function scheduleScan(trigger) {
        if (scanTimer) clearTimeout(scanTimer);

        scanTimer = setTimeout(() => {
            runWhenIdle(() => {
                removeBingAds(trigger);
                scanTimer = null;
            });
        }, OBSERVER_DEBOUNCE);
    }

    function mutationIsOnlyLogPanel(mutations) {
        return mutations.every(mutation => {
            const target = mutation.target;
            if (!(target instanceof Element)) return false;

            return (
                target.id === PANEL_ID ||
                target.closest?.(`#${PANEL_ID}`) ||
                target.id === 'fuck-bing-search-ad-log-style' ||
                target.closest?.('#fuck-bing-search-ad-log-style') ||
                target.id === WEB_SLUG_HIDE_STYLE_ID ||
                target.closest?.(`#${WEB_SLUG_HIDE_STYLE_ID}`) ||
                target.id === TOPW_SEPARATOR_HIDE_STYLE_ID ||
                target.closest?.(`#${TOPW_SEPARATOR_HIDE_STYLE_ID}`)
            );
        });
    }

    function handleUrlChange() {
        if (location.href === lastUrl) return;

        if (ENABLE_LOG_PANEL) {
            setTimeout(() => ensureLogPanel(), 100);
            setTimeout(() => ensureLogPanel(), 800);
        }

        lastUrl = location.href;
        removedKeys = new Set();
        currentSessionStats = { hit: {}, cleanup: {} };
        autoSkipPending = false;

        log(`检测到 URL 变化，重置本页统计并重新扫描：${location.href}`, 'scan');

        scheduleScan('URL变化');

        if (ENABLE_PERFORMANCE_MODE) {
            setTimeout(() => runWhenIdle(() => removeBingAds('URL变化延迟 1200ms')), 1200);
            setTimeout(() => runWhenIdle(() => removeBingAds('URL变化延迟 3000ms')), 3000);
        } else {
            setTimeout(() => removeBingAds('URL变化延迟 500ms'), 500);
            setTimeout(() => removeBingAds('URL变化延迟 1500ms'), 1500);
            setTimeout(() => removeBingAds('URL变化延迟 3000ms'), 3000);
        }
    }

    function patchHistoryEvents() {
        const rawPushState = history.pushState;
        const rawReplaceState = history.replaceState;

        history.pushState = function () {
            const ret = rawPushState.apply(this, arguments);
            setTimeout(handleUrlChange, 0);
            return ret;
        };

        history.replaceState = function () {
            const ret = rawReplaceState.apply(this, arguments);
            setTimeout(handleUrlChange, 0);
            return ret;
        };

        window.addEventListener('popstate', () => {
            setTimeout(handleUrlChange, 0);
        });
    }

    function start() {
        installTopwSeparatorHideStyle();

        if (ENABLE_LOG_PANEL) {
            createLogPanel();
            setTimeout(() => ensureLogPanel(), 500);
            setTimeout(() => ensureLogPanel(), 1500);
        }

        patchHistoryEvents();

        if (ENABLE_PERFORMANCE_MODE) {
            runWhenIdle(() => removeBingAds('启动'));
            setTimeout(() => runWhenIdle(() => removeBingAds('启动延迟 1200ms')), 1200);
            setTimeout(() => runWhenIdle(() => removeBingAds('启动延迟 3000ms')), 3000);
        } else {
            removeBingAds('启动');
            setTimeout(() => removeBingAds('启动延迟 500ms'), 500);
            setTimeout(() => removeBingAds('启动延迟 1500ms'), 1500);
            setTimeout(() => removeBingAds('启动延迟 3000ms'), 3000);
        }

        observer = new MutationObserver((mutations) => {
            if (mutationIsOnlyLogPanel(mutations)) return;

            if (ENABLE_LOG_PANEL && !document.getElementById(PANEL_ID)) {
                ensureLogPanel();
            }

            handleUrlChange();
            scheduleScan('DOM变化');
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            handleUrlChange();

            if (ENABLE_LOG_PANEL && !document.getElementById(PANEL_ID)) {
                ensureLogPanel();
            }

            if (!document.getElementById(TOPW_SEPARATOR_HIDE_STYLE_ID)) {
                installTopwSeparatorHideStyle();
            }

            scheduleScan('定时扫描');
        }, SCAN_INTERVAL);
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
