 // ui.js

// 1. Export all DOM Elements
export const UI = {
    initial: document.getElementById('initial-state'),
    transfer: document.getElementById('transfer-state'),
    shareOptions: document.getElementById('share-options'),
    progressArea: document.getElementById('progress-area'),
    fileInput: document.getElementById('file-input'),
    receiveCodeInput: document.getElementById('receive-code-input'),
    receiveBtn: document.getElementById('receive-btn'),
    resetBtn: document.getElementById('reset-btn'),
    fileName: document.getElementById('file-name'),
    percentage: document.getElementById('percentage'),
    progressBar: document.getElementById('progress-bar'),
    statusText: document.getElementById('status-text'),
    progressText: document.getElementById('progress-text'),
    transferSpeed: document.getElementById('transfer-speed'),
    successArea: document.getElementById('success-area'),
    successText: document.getElementById('success-text'),
    qrContainer: document.getElementById('qr-container'),
    pairingCodeDisplay: document.getElementById('pairing-code-display'),
    copyLinkBtn: document.getElementById('copy-link-btn'),
    dropZone: document.getElementById('drop-zone'),
    toastContainer: document.getElementById('toast-container'),
    modeP2P: document.getElementById('mode-p2p'),
    modeCloud: document.getElementById('mode-cloud'),
    cloudSettings: document.getElementById('cloud-settings'),
    cloudExpire: document.getElementById('cloud-expire'),
    cloudLimit: document.getElementById('cloud-limit'),
    cloudCustomCode: document.getElementById('cloud-custom-code'),
    stagedFilesSection: document.getElementById('staged-files-section'),
    fileList: document.getElementById('file-list'),
    sendFilesBtn: document.getElementById('send-files-btn'),
    receiveSection: document.getElementById('receive-section'),
    cloudFilesList: document.getElementById('cloud-files-list'),
    fileUploadInner: document.getElementById('file-upload-inner'),
    modeClipboard: document.getElementById('mode-clipboard'),
    clipboardInitInner: document.getElementById('clipboard-init-inner'),
    startClipboardBtn: document.getElementById('start-clipboard-btn'),
    clipboardReceiveCode: document.getElementById('clipboard-receive-code'),
    clipboardReceiveBtn: document.getElementById('clipboard-receive-btn'),
    clipboardActiveState: document.getElementById('clipboard-active-state'),
    sharedTextpad: document.getElementById('shared-textpad'),
    copyClipboardBtn: document.getElementById('copy-clipboard-btn'),
    clearClipboardBtn: document.getElementById('clear-clipboard-btn'),
    clipboardDisconnectBtn: document.getElementById('clipboard-disconnect-btn'),
    navLinks: document.querySelectorAll('[data-screen-link]'),
    screenPanels: document.querySelectorAll('[data-screen]'),
    mainContent: document.querySelector('main'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileMenu: document.getElementById('mobile-menu'),
    refreshCloudLinks: document.getElementById('refresh-cloud-links'),
    myDeviceName: document.getElementById('my-device-name'),
    trustedDevicesContainer: document.getElementById('trusted-devices-container'),
    trustedDevicesList: document.getElementById('trusted-devices-list'),
    saveDevicePrompt: document.getElementById('save-device-prompt'),
    saveDeviceName: document.getElementById('save-device-name'),
    btnSaveDeviceYes: document.getElementById('btn-save-device-yes'),
    btnSaveDeviceNo: document.getElementById('btn-save-device-no'),
    p2pWarningSender: document.getElementById('p2p-warning-sender'),
    cloudSafeMsg: document.getElementById('cloud-safe-msg'),
    p2pWarningReceiver: document.getElementById('p2p-warning-receiver'),
    extendModal: document.getElementById('extend-modal'),
    extendMinsInput: document.getElementById('extend-mins-input'),
    cancelExtendBtn: document.getElementById('cancel-extend-btn'),
    confirmExtendBtn: document.getElementById('confirm-extend-btn'),
    renameDeviceModal: document.getElementById('rename-device-modal'),
    renameDeviceInput: document.getElementById('rename-device-input'),
    cancelRenameBtn: document.getElementById('cancel-rename-btn'),
    confirmRenameBtn: document.getElementById('confirm-rename-btn'),
    scanQrBtn: document.getElementById('scan-qr-btn'),
    qrScannerContainer: document.getElementById('qr-scanner-container'),
    qrVideo: document.getElementById('qr-video'),
    closeScannerBtn: document.getElementById('close-scanner-btn'),
    transferIconContainer: document.getElementById('transfer-icon-container'),
    transferEta: document.getElementById('transfer-eta'),
    nativeShareBtn: document.getElementById('native-share-btn'),
    navInstallBtns: document.querySelectorAll('.nav-install-btn'),
    clipboardSyncBtn: document.getElementById('clipboard-sync-btn')
};

// 2. Export Theme Initializer
const THEME_COLORS = { dark: '#09090b', light: '#fafaf9' };

// Keep the browser / Android status-bar colour in step with the active theme (even if it differs from the OS setting)
function syncThemeColorMeta() {
    const color = document.documentElement.classList.contains('dark') ? THEME_COLORS.dark : THEME_COLORS.light;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

export function initializeTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;

    if (localStorage.theme === 'light' || (!('theme' in localStorage) && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlElement.classList.remove('dark');
    } else {
        htmlElement.classList.add('dark');
    }
    syncThemeColorMeta();

    const applyTheme = () => {
        htmlElement.classList.toggle('dark');
        try { localStorage.theme = htmlElement.classList.contains('dark') ? 'dark' : 'light'; } catch (e) {}
        syncThemeColorMeta();
    };

    let switching = false;

    themeToggleBtn.addEventListener('click', () => {
        if (switching) return; // ignore taps while a wave is still travelling

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!document.startViewTransition || reduceMotion) { applyTheme(); return; }

        // Wave origin = centre of the toggle button
        const rect = themeToggleBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

        switching = true;
        htmlElement.classList.add('theme-switching'); // freezes per-element transitions so the snapshot is clean

        let transition;
        try {
            transition = document.startViewTransition(() => { applyTheme(); });
        } catch (err) {
            htmlElement.classList.remove('theme-switching');
            switching = false;
            applyTheme();
            return;
        }

        transition.ready.then(() => {
            const duration = 1000;
            const easing = 'cubic-bezier(0.4, 0.1, 0.2, 1)';
            const featherAware = window.CSS && CSS.supports && CSS.supports('mask-size', '0px');

            if (featherAware) {
                // Soft-edged circle: opaque inside 62% of the radius, fading to transparent at the rim
                const size = Math.ceil((2 * reach) / 0.62) + 40;
                document.documentElement.animate(
                    {
                        maskSize: ['0px 0px', `${size}px ${size}px`],
                        maskPosition: [`${x}px ${y}px`, `${x - size / 2}px ${y - size / 2}px`],
                        webkitMaskSize: ['0px 0px', `${size}px ${size}px`],
                        webkitMaskPosition: [`${x}px ${y}px`, `${x - size / 2}px ${y - size / 2}px`]
                    },
                    { duration, easing, fill: 'both', pseudoElement: '::view-transition-new(root)' }
                );
            } else {
                // Hard-edged circle fallback
                document.documentElement.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
                    { duration, easing, fill: 'both', pseudoElement: '::view-transition-new(root)' }
                );
            }

            // Little spin on the toggle itself
            try {
                themeToggleBtn.animate(
                    [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(200deg) scale(0.82)', offset: 0.45 }, { transform: 'rotate(360deg) scale(1)' }],
                    { duration: 650, easing: 'ease-in-out' }
                );
            } catch (err) {}
        }).catch(() => {});

        transition.finished.finally(() => {
            htmlElement.classList.remove('theme-switching');
            switching = false;
        });
    });
}

// 3. Export Toast Notification Helper
export function showToast(message, type = "info") {
    const toast = document.createElement('div');
    const isError = type === "error";
    toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
        isError ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200' 
                : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
    } backdrop-blur-md pointer-events-auto z-50`;
    toast.setAttribute('role', isError ? 'alert' : 'status');

    const icon = isError 
        ? `<svg class="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
        : `<svg class="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;

    toast.innerHTML = icon + ' <span class="text-sm font-medium"></span>';
    toast.querySelector('span').textContent = message; // textContent: never render peer-supplied text as HTML
    UI.toastContainer.appendChild(toast);

    // --- auto dismiss (errors stay a little longer), pausable while the user is touching it ---
    let removed = false;
    let timer = null;
    const remaining = { ms: isError ? 6000 : 4000, startedAt: Date.now() };
    const startTimer = () => { remaining.startedAt = Date.now(); timer = setTimeout(() => dismiss('fade'), remaining.ms); };
    const pauseTimer = () => { clearTimeout(timer); remaining.ms = Math.max(1200, remaining.ms - (Date.now() - remaining.startedAt)); };

    function dismiss(how, dir = 1) {
        if (removed) return;
        removed = true;
        clearTimeout(timer);
        if (how === 'swipe') {
            toast.style.transition = 'transform 0.22s ease-out, opacity 0.22s ease-out';
            toast.style.transform = `translateX(${dir * 120}%)`;
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 230);
        } else {
            toast.style.animation = '';
            toast.classList.replace('toast-enter', 'toast-exit');
            setTimeout(() => toast.remove(), 300);
        }
    }

    // --- swipe (left / right / up) or fling to push the notification aside ---
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, lastT = 0, lastX = 0, velocity = 0;
    toast.addEventListener('pointerdown', (e) => {
        if (removed) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; lastX = e.clientX; lastT = e.timeStamp; velocity = 0;
        toast.style.animation = 'none';            // stop the entry animation from overriding our transform
        toast.style.opacity = '1';
        toast.classList.add('toast-dragging');
        try { toast.setPointerCapture(e.pointerId); } catch (err) {}
        pauseTimer();
    });
    toast.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dx = e.clientX - startX;
        dy = Math.min(0, e.clientY - startY);      // only allow dragging upwards, not down
        const dt = e.timeStamp - lastT;
        if (dt > 0) velocity = (e.clientX - lastX) / dt;
        lastX = e.clientX; lastT = e.timeStamp;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        toast.style.transform = horizontal ? `translateX(${dx}px)` : `translateY(${dy}px)`;
        toast.style.opacity = String(Math.max(0.25, 1 - (horizontal ? Math.abs(dx) : Math.abs(dy)) / 260));
    });
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        toast.classList.remove('toast-dragging');
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        if (horizontal && (Math.abs(dx) > 70 || Math.abs(velocity) > 0.6)) { dismiss('swipe', dx < 0 ? -1 : 1); return; }
        if (!horizontal && Math.abs(dy) > 40) {
            removed = true; clearTimeout(timer);
            toast.style.transition = 'transform 0.22s ease-out, opacity 0.22s ease-out';
            toast.style.transform = 'translateY(-140%)'; toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 230);
            return;
        }
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { dismiss('fade'); return; } // a simple tap also closes it
        // not far enough: spring back
        toast.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        toast.style.transform = 'translate(0, 0)'; toast.style.opacity = '1';
        setTimeout(() => { toast.style.transition = ''; }, 220);
        startTimer();
    };
    toast.addEventListener('pointerup', endDrag);
    toast.addEventListener('pointercancel', endDrag);

    startTimer();
}

// 4. Export Status Dot Helper
export function setStatusDot(color) {
    const dot = document.getElementById('status-dot');
    if (!dot) return;
    dot.classList.remove('dot-cyan', 'dot-green', 'dot-amber', 'dot-red');
    dot.classList.add('dot-' + color);
}

// 5. Export Reset Button Helper
export function setResetButton(label, compact = false) {
    if (!UI.resetBtn) return;
    const resetLabel = UI.resetBtn.querySelector('.reset-label');
    if (resetLabel) resetLabel.innerText = label;
    UI.resetBtn.setAttribute('aria-label', label);
    UI.resetBtn.classList.toggle('compact', compact);
}
 