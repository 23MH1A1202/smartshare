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
    scanQrBtn: document.getElementById('scan-qr-btn'),
    qrScannerContainer: document.getElementById('qr-scanner-container'),
    qrVideo: document.getElementById('qr-video'),
    closeScannerBtn: document.getElementById('close-scanner-btn'),
    transferIconContainer: document.getElementById('transfer-icon-container'),
    transferEta: document.getElementById('transfer-eta'),
    nativeShareBtn: document.getElementById('native-share-btn'),
    installModal: document.getElementById('install-modal'),
    cancelInstallBtn: document.getElementById('cancel-install-btn'),
    confirmInstallBtn: document.getElementById('confirm-install-btn'),
    dontShowInstallCheck: document.getElementById('dont-show-install-check'),
    navInstallBtns: document.querySelectorAll('.nav-install-btn'),
    clipboardSyncBtn: document.getElementById('clipboard-sync-btn')
};

// 2. Export Theme Initializer
export function initializeTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;

    if (localStorage.theme === 'light' || (!('theme' in localStorage) && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlElement.classList.remove('dark');
    } else {
        htmlElement.classList.add('dark');
    }

    themeToggleBtn.addEventListener('click', () => {
        htmlElement.classList.toggle('dark');
        if (htmlElement.classList.contains('dark')) {
            localStorage.theme = 'dark';
        } else {
            localStorage.theme = 'light';
        }
    });
}

// 3. Export Toast Notification Helper (Minimalist UX)
export function showToast(message, type = "info") {
    const toast = document.createElement('div');
    const isError = type === "error";
    
    // Minimalist monochrome toast styling
    toast.className = `toast-enter flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl pointer-events-auto z-50 
        ${isError 
            ? 'bg-white dark:bg-[#111111] border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-bold' 
            : 'bg-black text-white dark:bg-white dark:text-black border-transparent font-bold tracking-wide'}`;

    const icon = isError 
        ? `<svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
        : `<svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;

    toast.innerHTML = `${icon} <span class="text-sm">${message}</span>`;
    UI.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
// 4. Export Status Dot Helper
export function setStatusDot(color) {
    const dot = document.getElementById('status-dot');
    if (!dot) return;
    dot.classList.remove('dot-blue', 'dot-green', 'dot-amber', 'dot-red');
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
