/* SmartShare motion layer: splash control, page/section transitions, ripples. Purely cosmetic - safe to remove. */
(() => {
    'use strict';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Splash ----------
    const splash = document.getElementById('ss-splash');
    const shownAt = performance.now();
    let splashGone = false;
    function hideSplash() {
        if (splashGone || !splash) return;
        splashGone = true;
        try { sessionStorage.setItem('ss_splash_seen', '1'); } catch (e) {}
        splash.classList.add('is-leaving');
        setTimeout(() => splash.remove(), 700);
    }
    if (splash) {
        const minShow = reduce ? 200 : 1500;
        const done = () => setTimeout(hideSplash, Math.max(0, minShow - (performance.now() - shownAt)));
        if (document.readyState === 'complete') done(); else window.addEventListener('load', done, { once: true });
        setTimeout(hideSplash, 4000); // never block the app
    }

    // ---------- Page / section enter animations ----------
    const SCREEN_ORDER = ['share', 'create', 'manage', 'faq', 'about', 'privacy', 'terms', 'admin-style'];
    let lastScreen = 'share';
    const replay = (el, cls, ms) => {
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        clearTimeout(el.__enterT);
        el.__enterT = setTimeout(() => el.classList.remove(cls), ms);
    };

    const panels = document.querySelectorAll('.screen-panel');
    const panelObserver = new MutationObserver((muts) => {
        for (const m of muts) {
            const el = m.target;
            const wasHidden = (m.oldValue || '').split(/\s+/).includes('hidden');
            if (!wasHidden || el.classList.contains('hidden')) continue;
            const id = el.dataset.screen;
            const dir = SCREEN_ORDER.indexOf(id) >= SCREEN_ORDER.indexOf(lastScreen) ? 1 : -1;
            el.style.setProperty('--enter-x', reduce ? '0px' : `${28 * dir}px`);
            lastScreen = id;
            if (!reduce) replay(el, 'screen-enter', 900);
        }
    });
    panels.forEach((p) => panelObserver.observe(p, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

    // Sections that appear/disappear inside a screen
    const POP = ['#initial-state', '#progress-area', '#success-area', '#clipboard-active-state', '#qr-wrapper', '#pairing-code-card', '#mobile-menu'];
    const STAGGER = ['#share-options', '#transfer-state'];
    const sectionObserver = new MutationObserver((muts) => {
        if (reduce) return;
        for (const m of muts) {
            const el = m.target;
            const wasHidden = (m.oldValue || '').split(/\s+/).includes('hidden');
            if (!wasHidden || el.classList.contains('hidden')) continue;
            if (el.matches(STAGGER.join(','))) replay(el, 'stagger-enter', 900);
            else replay(el, 'pop-enter', 700);
        }
    });
    [...POP, ...STAGGER].forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) sectionObserver.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });

    // ---------- Click ripple ----------
    if (!reduce) {
        document.addEventListener('pointerdown', (e) => {
            if (e.button > 0) return;
            const btn = e.target.closest && e.target.closest('button, .btn-ripple, [role="button"]');
            if (!btn || btn.disabled || btn.classList.contains('no-ripple')) return;
            if (btn.id === 'theme-toggle') return; // has its own wave
            const rect = btn.getBoundingClientRect();
            if (rect.width < 24 || rect.height < 24 || rect.width > 700) return; // skip tiny icons and full-width containers
            if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
            btn.classList.add('ss-ripple-host');
            const size = Math.max(rect.width, rect.height) * 2.2;
            const r = document.createElement('span');
            r.className = 'ss-ripple';
            const bg = getComputedStyle(btn).backgroundColor;
            const transparentBg = !bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
            if (transparentBg) r.classList.add('on-light');
            r.style.width = r.style.height = size + 'px';
            r.style.left = (e.clientX - rect.left - size / 2) + 'px';
            r.style.top = (e.clientY - rect.top - size / 2) + 'px';
            btn.appendChild(r);
            setTimeout(() => r.remove(), 700);
        }, { passive: true });
    }

    // ---------- Header shadow on scroll ----------
    const header = document.querySelector('header');
    if (header) {
        const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // ---------- Glass buttons: tag every button so the glass-brick style applies (also to buttons added later) ----------
    const GLASS_SKIP = '.nav-link, .footer-link, .nav-install-btn, [data-no-glass], #mode-p2p, #mode-cloud, #mode-clipboard';
    function tagGlass(root) {
        if (!root || root.nodeType !== 1) return;
        const list = root.matches && root.matches('button, label.btn-ripple') ? [root] : [];
        root.querySelectorAll && root.querySelectorAll('button, label.btn-ripple').forEach((el) => list.push(el));
        list.forEach((el) => {
            if (el.classList.contains('glass-btn') || el.matches(GLASS_SKIP)) return;
            el.classList.add('glass-btn');
            const cs = getComputedStyle(el);
            const clear = (!cs.backgroundColor || cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent') && cs.backgroundImage === 'none';
            if (clear) el.classList.add('glass-flat');
        });
    }
    tagGlass(document.body);
    let glassQueued = false;
    const glassNodes = new Set();
    new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) glassNodes.add(n); }));
        if (glassQueued || !glassNodes.size) return;
        glassQueued = true;
        requestAnimationFrame(() => { glassNodes.forEach(tagGlass); glassNodes.clear(); glassQueued = false; });
    }).observe(document.body, { childList: true, subtree: true });
})();
