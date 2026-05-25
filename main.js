import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('Service Worker registered successfully!', reg))
            .catch((err) => console.error('Service Worker registration failed:', err));
    });
}

const firebaseConfig = {
    apiKey: "AIzaSyBXBbEt_OEwOuHtiM3ERDcLwUZpXyNVtzM",
    authDomain: "login-59720.firebaseapp.com",
    projectId: "login-59720",
    storageBucket: "login-59720.firebasestorage.app",
    messagingSenderId: "598332882697",
    appId: "1:598332882697:web:6f675adebeb816e64dddd8",
    measurementId: "G-36F4WTT681"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app); 
let myClipId = localStorage.getItem('smartshare_clip_id');
if (!myClipId) {
    myClipId = 'clip_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('smartshare_clip_id', myClipId);
}
let myClipName = localStorage.getItem('smartshare_clip_name') || 'Device-' + Math.floor(Math.random() * 1000);
let trustedDevices = JSON.parse(localStorage.getItem('smartshare_trusted_devices') || '[]');
let backgroundPeer = null; // Listens for trusted connections
let myOwnerId = localStorage.getItem('smartshare_owner_id');
if (!myOwnerId) {
    myOwnerId = 'owner_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('smartshare_owner_id', myOwnerId);
}

window.onerror = function(message) {
    showToast("Something went wrong: " + message, "error");
    return true; 
};

let transferMode = 'p2p'; 
let cloudTimerInterval = null;
let isCancelled = false; 
let isTransferComplete = false;

let p2pTransferState = { buffer: [], bytesReceived: 0, meta: null, targetId: null, isReconnecting: false, reconnectAttempts: 0 };
let reconnectTimer = null; 

let lastSpeedBytes = 0;
let lastSpeedTime = Date.now();

function initializeTheme() {
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

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme(); 

    const syncHeaderHeight = () => {
        const header = document.querySelector('header');
        if (header) {
            document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
        }
    };

    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('load', syncHeaderHeight);

    const UI = {
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
        btnSaveDeviceNo: document.getElementById('btn-save-device-no')
    };

    let peer = null;
    let currentConnection = null;
    let fileToSend = null;
    let connectionTimeout = null;
    let isTransferring = false;
    let selectedFiles = [];
    const resetLabel = UI.resetBtn ? UI.resetBtn.querySelector('.reset-label') : null;
    const baseTabClass = "flex-1 py-2.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-colors relative z-10 text-slate-500 dark:text-slate-400";
    const homeScreens = new Set(['share', 'create']);

    function setResetButton(label, compact = false) {
        if (!UI.resetBtn) return;
        if (resetLabel) resetLabel.innerText = label;
        UI.resetBtn.setAttribute('aria-label', label);
        UI.resetBtn.classList.toggle('compact', compact);
    }

    function setActiveScreen(screenId, { scroll = true, updateHistory = true } = {}) {
        if (!UI.screenPanels) return;
        const isHome = homeScreens.has(screenId);
        UI.screenPanels.forEach(panel => {
            const panelId = panel.dataset.screen;
            const shouldShow = isHome ? homeScreens.has(panelId) : panelId === screenId;
            panel.classList.toggle('hidden', !shouldShow);
        });
        UI.navLinks.forEach(link => {
            const target = link.dataset.screenLink;
            if (link.classList.contains('nav-link')) {
                link.classList.toggle('is-active', target === screenId);
            }
        });
        if (UI.mainContent) {
            UI.mainContent.classList.toggle('has-nav-gap', !isHome);
        }
        if (UI.mobileMenu) UI.mobileMenu.classList.add('hidden');
        if (screenId === 'manage') {
            loadCloudManager();
        } else {
            clearInterval(cloudTimerInterval);
        }
        if (updateHistory) {
            const currentScreen = window.history.state?.screen;
            if (currentScreen !== screenId) {
                const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                if (!window.history.state && screenId === 'share') {
                    window.history.replaceState({ screen: screenId }, '', url);
                } else {
                    window.history.pushState({ screen: screenId }, '', url);
                }
            }
        }
       if (scroll) {
            // Wait 10ms for the browser to finish hiding/showing sections 
            // before calculating the scroll position.
            setTimeout(() => {
                if (screenId === 'create') {
                    const targetPanel = document.querySelector(`[data-screen="${screenId}"]`);
                    if (targetPanel) {
                        targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                } else {
                    // Snap instantly to the absolute top for page changes
                    window.scrollTo(0, 0);
                }
            }, 10);
        }
    }

UI.myDeviceName.value = myClipName;
    UI.myDeviceName.addEventListener('change', (e) => {
        myClipName = e.target.value.trim() || 'Device-' + Math.floor(Math.random() * 1000);
        UI.myDeviceName.value = myClipName; // Reset UI if user left it blank
        localStorage.setItem('smartshare_clip_name', myClipName);
        
        // Broadcast the new name instantly if a connection is active
        if (currentConnection && currentConnection.open) {
            currentConnection.send({ type: 'device-info', id: myClipId, name: myClipName });
        }
    });


    // --- NATIVE PWA SHARE TARGET HANDLER ---
    if (window.location.search.includes('shared=true')) {
        window.history.replaceState(null, null, window.location.pathname); // Clean the URL
        handleIncomingShare();
    }

    async function handleIncomingShare() {
        try {
            const cache = await caches.open('shared-file-cache');
            const countResponse = await cache.match('/shared-file-count');
            
            if (countResponse) {
                const countStr = await countResponse.text();
                const count = parseInt(countStr, 10);
                
                let incomingFiles = [];
                for (let i = 0; i < count; i++) {
                    const response = await cache.match('/shared-file-' + i);
                    if (response) {
                        const blob = await response.blob();
                        const fileName = decodeURIComponent(response.headers.get('X-File-Name') || `Shared_File_${i}`);
                        incomingFiles.push(new File([blob], fileName, { type: blob.type }));
                        
                        // Delete the file from cache immediately to save storage space
                        await cache.delete('/shared-file-' + i); 
                    }
                }
                await cache.delete('/shared-file-count');
                
                if (incomingFiles.length > 0) {
                    // Inject files into the staging area
                    selectedFiles = incomingFiles;
                    switchMode('p2p');
                    renderFileList(); 
                    
                    // Auto-trigger the "Share Files" process so the QR code appears instantly
                    setTimeout(() => {
                        UI.sendFilesBtn.click();
                        showToast("File loaded from Gallery!", "success");
                    }, 400);
                }
            }
        } catch (err) {
            console.error("Failed to load shared file:", err);
            showToast("Failed to process shared files.", "error");
        }
    }
    
    function renderTrustedDevices() {
        UI.trustedDevicesList.innerHTML = '';
        if (trustedDevices.length === 0) {
            UI.trustedDevicesContainer.classList.add('hidden');
            UI.trustedDevicesContainer.classList.remove('flex');
            return;
        }
        
        UI.trustedDevicesContainer.classList.remove('hidden');
        UI.trustedDevicesContainer.classList.add('flex');

        trustedDevices.forEach((device, index) => {
            const div = document.createElement('div');
            // Wrapper is now a div, not a button, to prevent tap conflicts
            div.className = "flex items-center justify-between w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 rounded-xl p-1.5 pl-2 transition-all shadow-sm group";
            
            div.innerHTML = `
                <button class="connect-trusted-btn flex-1 flex items-center gap-3 truncate text-left py-1.5 outline-none" data-id="${device.id}" aria-label="Connect to ${device.name}">
                    <div class="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    </div>
                    <span class="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">${device.name}</span>
                </button>
                <div class="flex items-center gap-1 shrink-0 pr-1">
                    <button class="connect-trusted-btn hidden sm:flex items-center justify-center text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-1.5 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors uppercase tracking-wider" data-id="${device.id}">Connect</button>
                    
                    <button class="delete-trusted-btn text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors" data-index="${index}" aria-label="Remove device">
                        <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            `;
            
            UI.trustedDevicesList.appendChild(div);
        });

        // Add event listeners separately so taps don't bleed into each other
        document.querySelectorAll('.delete-trusted-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = e.currentTarget.getAttribute('data-index');
                trustedDevices.splice(idx, 1);
                localStorage.setItem('smartshare_trusted_devices', JSON.stringify(trustedDevices));
                renderTrustedDevices();
                showToast("Device removed", "info");
            });
        });

        document.querySelectorAll('.connect-trusted-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                startP2PClipboardReceive(id, true);
            });
        });
    }
    
    // Call it immediately
    renderTrustedDevices();
        // Update your navLinks click listener in main.js
    // Replace your existing navLinks listener in main.js
UI.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.stopPropagation(); // CRITICAL: Stop the click from hitting the document listener
        
        const target = link.dataset.screenLink;
        if (target) {
            setActiveScreen(target);
            // closeMobileMenu is already called by the specific mobile menu links
        }
    });
});

    window.addEventListener('popstate', (event) => {
        const targetScreen = event.state && event.state.screen ? event.state.screen : 'share';
        setActiveScreen(targetScreen, { scroll: false, updateHistory: false });
    });

    if (UI.mobileMenuBtn && UI.mobileMenu) {

    function openMobileMenu() {
        UI.mobileMenu.classList.remove(
            'hidden',
            'opacity-0',
            '-translate-y-3',
            'pointer-events-none'
        );

        requestAnimationFrame(() => {
            UI.mobileMenu.classList.remove('scale-95');
            UI.mobileMenu.classList.add(
                'opacity-100',
                'translate-y-0',
                'scale-100',
                'pointer-events-auto'
            );
        });
    }

    function closeMobileMenu() {
        UI.mobileMenu.classList.remove(
            'opacity-100',
            'translate-y-0',
            'scale-100',
            'pointer-events-auto'
        );

        UI.mobileMenu.classList.add(
            'opacity-0',
            '-translate-y-3',
            'scale-95',
            'pointer-events-none'
        );

        setTimeout(() => {
            if (
                UI.mobileMenu.classList.contains('opacity-0')
            ) {
                UI.mobileMenu.classList.add('hidden');
            }
        }, 320);
    }

    function toggleMobileMenu(e) {
        e.stopPropagation();

        if (
            UI.mobileMenu.classList.contains('hidden') ||
            UI.mobileMenu.classList.contains('opacity-0')
        ) {
            openMobileMenu();
        } else {
            closeMobileMenu();
        }
    }

    UI.mobileMenuBtn.addEventListener('click', toggleMobileMenu);

    const isMobileMenuOpen = () => (
        !UI.mobileMenu.classList.contains('hidden') &&
        !UI.mobileMenu.classList.contains('opacity-0')
    );

    const handleOutsideMenu = (e) => {
        if (!isMobileMenuOpen()) return;
        if (
            !UI.mobileMenu.contains(e.target) &&
            !UI.mobileMenuBtn.contains(e.target)
        ) {
            closeMobileMenu();
        }
    };

    document.addEventListener('pointerup', handleOutsideMenu);

    window.addEventListener('scroll', () => {
        if (isMobileMenuOpen()) {
            closeMobileMenu();
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            closeMobileMenu();
        }
    });

    document.querySelectorAll('#mobile-menu .nav-link').forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
}

    if (UI.refreshCloudLinks) {
        UI.refreshCloudLinks.addEventListener('click', loadCloudManager);
    }

    setActiveScreen('share', { scroll: false });
    setResetButton('Cancel', false);

    window.addEventListener('beforeunload', () => {
        isCancelled = true;
        if (currentConnection && currentConnection.open) {
            currentConnection.send({ type: 'transfer-cancelled' });
        }
    });

    window.addEventListener('offline', () => {
        if (isTransferring || p2pTransferState.bytesReceived > 0) {
            UI.statusText.innerText = "Internet disconnected! Transfer paused...";
            setStatusDot('red');
            if (UI.progressText) UI.progressText.innerText = "Paused...";
            if (UI.transferSpeed) UI.transferSpeed.innerText = "0.0 MB/s";
        }
    });

    window.addEventListener('online', () => {
        if (isTransferring || p2pTransferState.bytesReceived > 0) {
            UI.statusText.innerText = "Internet restored! Reconnecting...";
            setStatusDot('amber');
            if (UI.progressText) {
                UI.progressText.innerText = p2pTransferState.targetId ? "Reconnecting..." : "Waiting...";
            }
        }
        if (p2pTransferState.isReconnecting && !isCancelled) {
            attemptReconnect();
        }
    });

    function updateSendBtnText() {
        if (selectedFiles.length === 0) {
            UI.sendFilesBtn.innerText = transferMode === 'cloud' ? 'Create Link' : 'Share Files';
            return;
        }
        const count = selectedFiles.length;
        UI.sendFilesBtn.innerText = transferMode === 'cloud' ? `Create Link for ${count} File${count > 1 ? 's' : ''}` : `Share ${count} File${count > 1 ? 's' : ''}`;
    }

   function switchMode(mode) {
        transferMode = mode;
        document.querySelector('.mode-tabs').dataset.active = mode;
        
       [UI.modeP2P, UI.modeCloud, UI.modeClipboard].forEach((modeButton) => {
           modeButton.className = baseTabClass;
       });

        UI.fileUploadInner.classList.add('hidden');
        UI.fileUploadInner.classList.remove('flex');
        if(UI.clipboardInitInner) {
            UI.clipboardInitInner.classList.add('hidden');
            UI.clipboardInitInner.classList.remove('flex');
        }
        UI.cloudSettings.classList.add('hidden');

        if (mode === 'p2p') {
            UI.modeP2P.classList.add('text-indigo-600', 'dark:text-indigo-300');
            UI.modeP2P.classList.remove('text-slate-500', 'dark:text-slate-400');
            UI.fileUploadInner.classList.remove('hidden');
            UI.fileUploadInner.classList.add('flex');
        } else if (mode === 'cloud') {
            UI.modeCloud.classList.add('text-indigo-600', 'dark:text-indigo-300');
            UI.modeCloud.classList.remove('text-slate-500', 'dark:text-slate-400');
            UI.fileUploadInner.classList.remove('hidden');
            UI.fileUploadInner.classList.add('flex');
            UI.cloudSettings.classList.remove('hidden');
            UI.cloudSettings.classList.add('flex');
        } else if (mode === 'clipboard') {
            startClipboardListener();
            UI.modeClipboard.classList.add('text-violet-600', 'dark:text-violet-300');
            UI.modeClipboard.classList.remove('text-slate-500', 'dark:text-slate-400');
            UI.clipboardInitInner.classList.remove('hidden');
            UI.clipboardInitInner.classList.add('flex');
        }
        updateSendBtnText();
    }
    
    UI.modeP2P.addEventListener('click', () => switchMode('p2p'));
    UI.modeCloud.addEventListener('click', () => switchMode('cloud'));
    UI.modeClipboard.addEventListener('click', () => switchMode('clipboard'));

    function startClipboardListener() {
        if (backgroundPeer && !backgroundPeer.destroyed) return;
        
        backgroundPeer = new Peer(myClipId, {
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
        });
        
        backgroundPeer.on('connection', (conn) => {
            setupClipboardConnection(conn); // Auto-accept incoming trusted connections
        });
    }
    
    function showToast(message, type = "info") {
        const toast = document.createElement('div');
        const isError = type === "error";
        toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
            isError ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200' 
                    : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
        } backdrop-blur-md pointer-events-auto z-50`;

        const icon = isError 
            ? `<svg class="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
            : `<svg class="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;

        toast.innerHTML = `${icon} <span class="text-sm font-medium">${message}</span>`;
        UI.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.replace('toast-enter', 'toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function setStatusDot(color) {
        const dot = document.getElementById('status-dot');
        if (!dot) return;
        dot.classList.remove('dot-blue', 'dot-green', 'dot-amber', 'dot-red');
        dot.classList.add('dot-' + color);
    }

    function saveFileToLocalLedger(fileId) {
        let myLinks = JSON.parse(localStorage.getItem('smartshare_my_links') || '[]');
        if (!myLinks.includes(fileId)) {
            myLinks.push(fileId);
            localStorage.setItem('smartshare_my_links', JSON.stringify(myLinks));
        }
    }

    function removeFileFromLocalLedger(fileId) {
        let myLinks = JSON.parse(localStorage.getItem('smartshare_my_links') || '[]');
        myLinks = myLinks.filter(id => id !== fileId);
        localStorage.setItem('smartshare_my_links', JSON.stringify(myLinks));
    }

    async function purgeCloudFile(fileId, storagePath) {
        try {
            await deleteDoc(doc(db, "links", fileId));
        } catch (e) { }
    }

    async function loadCloudManager() {
        UI.cloudFilesList.innerHTML = `<p class="text-center text-sm text-slate-500 py-10">Fetching your files...</p>`;
        clearInterval(cloudTimerInterval);
        
        let myLinks = JSON.parse(localStorage.getItem('smartshare_my_links') || '[]');
        if (myLinks.length === 0) {
            UI.cloudFilesList.innerHTML = `<p class="text-center text-sm text-slate-500 py-10">You have no active shared links.</p>`;
            return;
        }

        let activeFiles = [];
        for (let i = 0; i < myLinks.length; i++) {
            const linkId = myLinks[i];
            try {
                const docSnap = await getDoc(doc(db, "links", linkId));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (Date.now() > data.expiresAt) {
                        await purgeCloudFile(linkId, data.storagePath);
                        removeFileFromLocalLedger(linkId);
                    } else {
                        data.id = linkId;
                        activeFiles.push(data);
                    }
                } else {
                    removeFileFromLocalLedger(linkId); 
                }
            } catch (e) { }
        }

        if (activeFiles.length === 0) {
            UI.cloudFilesList.innerHTML = `<p class="text-center text-sm text-slate-500 py-10">You have no active shared links.</p>`;
            return;
        }

        renderCloudManagerUI(activeFiles);

        cloudTimerInterval = setInterval(() => {
            activeFiles.forEach(file => {
                const timeEl = document.getElementById(`timer-${file.id}`);
                if (timeEl) {
                    const timeLeft = file.expiresAt - Date.now();
                    if (timeLeft <= 0) {
                        timeEl.innerText = "Expired";
                        timeEl.classList.add("text-red-500");
                        loadCloudManager(); 
                    } else {
                        timeEl.innerText = formatTimeLeft(timeLeft);
                    }
                }
            });
        }, 1000);
    }

    function formatTimeLeft(ms) {
        let totalSeconds = Math.floor(ms / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    function renderCloudManagerUI(files) {
        UI.cloudFilesList.innerHTML = '';
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = "cloud-file-card bg-slate-50/80 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 flex flex-col";
            let sizeText = (file.size / (1024 * 1024)).toFixed(2) + " MB";
            
            card.innerHTML = `
                <div class="flex flex-col w-full mb-3">
                    <div class="flex items-center justify-between gap-2 w-full mb-1.5">
                        <span class="text-xs font-mono bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-2 py-0.5 rounded-md">${file.id}</span>
                        <span class="font-semibold text-slate-800 dark:text-white text-sm truncate flex-1 text-right">${file.name}</span>
                    </div>
                    <div class="flex items-center justify-between w-full">
                        <span class="text-xs font-medium text-slate-500 bg-slate-200 dark:bg-slate-700/50 px-2 py-0.5 rounded-md">${sizeText}</span>
                        <div class="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span id="timer-${file.id}">${formatTimeLeft(file.expiresAt - Date.now())}</span>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 border-t border-slate-200 dark:border-slate-700/50 pt-3">
                    <button class="copy-link-manager-btn flex items-center justify-center text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 py-2 rounded-xl transition-all" data-id="${file.id}">Copy Link</button>
                    <button class="extend-btn flex items-center justify-center text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 py-2 rounded-xl transition-all" data-id="${file.id}">Extend Time</button>
                    <button class="delete-cloud-btn flex items-center justify-center text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 py-2 rounded-xl transition-all" data-id="${file.id}" data-path="${file.storagePath}">Delete</button>
                </div>
            `;
            UI.cloudFilesList.appendChild(card);
        });

        document.querySelectorAll('.copy-link-manager-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const cleanUrl = window.location.href.split('?')[0].split('#')[0];
                navigator.clipboard.writeText(`${cleanUrl}?c=${id}`);
                showToast("Link copied to clipboard!", "success");
            });
        });

        document.querySelectorAll('.extend-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                let mins = prompt("How many extra minutes? (Max: 60)", "15");
                if (mins === null) return; 
                mins = parseInt(mins, 10);
                if (isNaN(mins) || mins <= 0 || mins > 60) {
                    showToast("Please enter a valid number from 1 to 60.", "error");
                    return;
                }
                e.target.innerText = "...";
                try {
                    const docRef = doc(db, "links", id);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        const newTime = snap.data().expiresAt + (mins * 60 * 1000);
                        await updateDoc(docRef, { expiresAt: newTime });
                        showToast(`Time successfully extended by ${mins} minutes!`, "success");
                        loadCloudManager();
                    }
                } catch(err) {
                    showToast("Could not extend time.", "error");
                    e.target.innerText = "Extend Time";
                }
            });
        });

        document.querySelectorAll('.delete-cloud-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                const path = e.target.getAttribute('data-path');
                e.target.innerText = "...";
                await purgeCloudFile(id, path);
                removeFileFromLocalLedger(id);
                showToast("File securely removed.", "info");
                loadCloudManager();
            });
        });
    }

    function renderFileList() {
        UI.fileList.innerHTML = '';
        
        if (selectedFiles.length === 0) {
            UI.stagedFilesSection.classList.add('hidden');
            UI.stagedFilesSection.classList.remove('flex');
            UI.fileInput.value = '';
            updateSendBtnText();
            return;
        }

        UI.stagedFilesSection.classList.remove('hidden');
        UI.stagedFilesSection.classList.add('flex');

        selectedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = "file-item-enter flex items-center justify-between bg-white/60 dark:bg-slate-800/50 backdrop-blur-md p-3 rounded-3xl border border-white/70 dark:border-slate-700/50 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-slate-800/70 hover:shadow-md group";
            li.style.setProperty('--stagger', index);
            
            let sizeText = (file.size / (1024 * 1024)).toFixed(2) + " MB";
            if (file.size < 1024 * 1024) sizeText = (file.size / 1024).toFixed(2) + " KB";
            
            let mediaPreview = '';
            const objectUrl = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
                mediaPreview = `<img src="${objectUrl}" class="w-full h-full object-cover">`;
            } else if (file.type.startsWith('video/')) {
                mediaPreview = `<video src="${objectUrl}#t=0.001" class="w-full h-full object-cover" preload="metadata" muted playsinline></video>`;
            } else {
                mediaPreview = `<svg class="w-6 h-6 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;
            }

            li.innerHTML = `
                <div class="flex items-center w-[85%]">
                    <div class="w-11 h-11 shrink-0 rounded-[14px] overflow-hidden bg-white/60 dark:bg-slate-800/60 flex items-center justify-center mr-3 border border-white/40 dark:border-slate-700/40 shadow-inner">
                        ${mediaPreview}
                    </div>
                    <div class="flex flex-col truncate pr-2 text-left w-full">
                        <span class="text-slate-800 dark:text-slate-200 font-semibold truncate tracking-tight text-[15px] leading-tight mb-0.5">${file.name}</span>
                        <span class="text-[13px] text-slate-500 font-medium">${sizeText}</span>
                    </div>
                </div>
                <button class="delete-file-btn text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all p-2.5 rounded-2xl shrink-0 opacity-80 group-hover:opacity-100" data-index="${index}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            UI.fileList.appendChild(li);
        });

        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                selectedFiles.splice(index, 1);
                renderFileList();
            });
        });

        updateSendBtnText();
    }

    function resetApp() {
        isCancelled = true;
        clearTimeout(connectionTimeout);
        clearTimeout(reconnectTimer);
        
        try {
            if (currentConnection && currentConnection.open) {
                // Check if transfer is NOT complete before sending cancel
                if (!isTransferComplete) {
                    currentConnection.send({ type: 'transfer-cancelled' });
                }
                setTimeout(() => {
                    if (currentConnection) currentConnection.close();
                    if (peer) peer.destroy();
                }, 50);
            } else {
                if (currentConnection) currentConnection.close();
                if (peer) peer.destroy();
            }
        } catch (e) { }
        localStorage.removeItem('p2p_active_id'); // Clear the persisted ID
        peer = null; currentConnection = null; fileToSend = null; isTransferring = false;
        isTransferComplete = false; // Reset the flag here
        selectedFiles = [];
        p2pTransferState = { buffer: [], bytesReceived: 0, meta: null, targetId: null, isReconnecting: false, reconnectAttempts: 0 };

        lastSpeedBytes = 0;
        lastSpeedTime = Date.now();
        if (UI.transferSpeed) UI.transferSpeed.innerText = '';

        UI.fileInput.value = '';
        UI.receiveCodeInput.value = '';
        UI.cloudCustomCode.value = '';

        if(UI.clipboardReceiveCode) UI.clipboardReceiveCode.value = '';
        if(UI.clipboardActiveState) {
            UI.clipboardActiveState.classList.add('hidden');
            UI.clipboardActiveState.classList.remove('flex');
        }
        if(UI.sharedTextpad) UI.sharedTextpad.value = '';
        
        if (window.location.hash) {
            window.history.replaceState(null, null, window.location.pathname);
        }

        UI.transfer.classList.add('hidden');
        UI.transfer.classList.remove('flex');
        UI.initial.classList.remove('hidden');
        UI.initial.classList.add('flex');

        UI.progressArea.classList.add('hidden');
        UI.shareOptions.classList.add('hidden');
        UI.successArea.classList.add('hidden');
        UI.successArea.classList.remove('flex');
        updateProgress(0, 100);

        renderFileList();

        setResetButton("Cancel", false);
        UI.fileName.innerText = "Waiting...";
        UI.statusText.innerText = "Getting ready...";
    }

    UI.resetBtn.addEventListener('click', resetApp);

    function generateShortCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    function handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (let i = 0; i < fileList.length; i++) {
            selectedFiles.push(fileList[i]);
        }
        renderFileList();
    }

    UI.sendFilesBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;
        let finalFile = selectedFiles[0];

        if (selectedFiles.length > 1) {
            showTransferScreen("Multiple Files", "Packing files together... Please wait.");
            UI.progressArea.classList.remove('hidden');
            if(UI.progressText) UI.progressText.innerText = "Zipping...";
            
            try {
                const zip = new JSZip();
                for (let i = 0; i < selectedFiles.length; i++) {
                    zip.file(selectedFiles[i].name, selectedFiles[i]);
                }
                const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
                    updateProgress(metadata.percent, 100);
                });
                
                UI.progressArea.classList.add('hidden');
                UI.progressBar.style.width = "0%";
                UI.percentage.innerText = "0%";
                
                finalFile = new File([zipBlob], "SmartShare_Files.zip", { type: "application/zip" });
            } catch (error) {
                showToast("Failed to pack files.", "error");
                resetApp();
                return;
            }
        }

        if (transferMode === 'cloud') {
            startCloudTransfer(finalFile);
        } else {
            startP2PTransfer(finalFile);
        }
    });

    async function startCloudTransfer(file) {
        isCancelled = false;
        
        // --- 1. CLOUDINARY FREE TIER SIZE CHECK ---
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');
        
        const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB in bytes
        const MAX_OTHER_SIZE = 10 * 1024 * 1024;  // 10 MB in bytes

        if (isVideo && file.size > MAX_VIDEO_SIZE) {
            showToast("Video too large! The maximum size is 100 MB.", "error");
            resetApp();
            return;
        } else if (!isVideo && file.size > MAX_OTHER_SIZE) {
            const typeName = isImage ? "Image" : "File";
            showToast(`${typeName} too large! The maximum size is 10 MB.`, "error");
            resetApp();
            return;
        }
        // ------------------------------------------

        showTransferScreen(file.name, "Preparing link share...");
        UI.progressArea.classList.remove('hidden');

        lastSpeedBytes = 0;
        lastSpeedTime = Date.now();

        let rawCode = UI.cloudCustomCode.value.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        const fileId = rawCode || generateShortCode();

        if (rawCode) {
            try {
                const docSnap = await getDoc(doc(db, "links", fileId));
                if (docSnap.exists()) {
                    showToast("That custom word is already taken!", "error");
                    resetApp();
                    return;
                }
            } catch(e) { }
        }

        // --- CLOUDINARY UPLOAD LOGIC ---
        const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dt4hut2hm/auto/upload"; 
        const CLOUDINARY_PRESET = "smartshare_preset"; 

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", CLOUDINARY_PRESET);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', CLOUDINARY_URL, true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                updateProgress(e.loaded, e.total);
                UI.statusText.innerText = `Uploading securely to Cloud...`;
                if(UI.progressText) UI.progressText.innerText = "Uploading...";
            }
        };

        xhr.onerror = () => {
            showToast("Upload failed: Please check your internet connection.", "error");
            resetApp();
        };

        xhr.onload = async () => {
            if (xhr.status === 200 || xhr.status === 201) {
                const response = JSON.parse(xhr.responseText);
                const downloadURL = response.secure_url;

                try {
                    UI.statusText.innerText = `Generating your secure link...`;
                    if (UI.transferSpeed) UI.transferSpeed.innerText = '';

                    let expireMs = 60 * 60 * 1000; 
                    if (UI.cloudExpire.value === '10m') expireMs = 10 * 60 * 1000;
                    else if (UI.cloudExpire.value === '1h') expireMs = 60 * 60 * 1000;
                    else if (UI.cloudExpire.value === '4h') expireMs = 4 * 60 * 60 * 1000;

                    const isOneTime = UI.cloudLimit.value === 'one-time';

                    await setDoc(doc(db, "links", fileId), {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        url: downloadURL,
                        storagePath: response.public_id,
                        expiresAt: Date.now() + expireMs,
                        isOneTime: isOneTime,
                        createdAt: Date.now(),
                        ownerId: myOwnerId
                    });

                    saveFileToLocalLedger(fileId);

                    const cleanUrl = window.location.href.split('?')[0].split('#')[0];
                    const transferUrl = `${cleanUrl}?c=${fileId}`;

                    UI.progressArea.classList.add('hidden');
                    UI.qrContainer.innerHTML = "";
                    new QRCode(UI.qrContainer, { text: transferUrl, width: 150, height: 150, colorDark: "#020617", colorLight: "#ffffff" });

                    UI.pairingCodeDisplay.innerText = fileId;
                    UI.shareOptions.classList.remove('hidden');
                    UI.statusText.innerText = "Ready! You can safely close this page now.";
                    setResetButton("Close", true);
                    setStatusDot('green');

                    UI.copyLinkBtn.onclick = () => {
                        navigator.clipboard.writeText(transferUrl);
                        showToast("Link copied to clipboard!", "success");
                    };
                } catch (err) {
                    console.error("Firestore Error:", err);
                    showToast("Database Error: " + err.message, "error");
                    resetApp();
                }
            } else {
                showToast("Cloud Upload Failed. The file might be corrupted or rejected.", "error");
                resetApp();
            }
        };

        xhr.send(formData);
    }

    function setupPeerErrorHandling(peerInstance) {
        peerInstance.on('disconnected', () => {
            if (!isCancelled && (isTransferring || fileToSend || p2pTransferState.bytesReceived > 0)) {
                peerInstance.reconnect();
            }
        });

        peerInstance.on('error', (err) => {
            if (isCancelled) return;
            clearTimeout(connectionTimeout);
            
            if (err.type === 'network' || err.type === 'disconnected' || err.type === 'webrtc') {
                if (isTransferring || fileToSend || p2pTransferState.bytesReceived > 0) {
                    return; 
                }
            }

            if (err.type === 'peer-unavailable' && p2pTransferState.isReconnecting) {
                reconnectTimer = setTimeout(attemptReconnect, 3000);
                return;
            }

            let errMsg = "An unknown network error occurred.";
            switch(err.type) {
                case 'peer-unavailable': errMsg = "Code not found, or the sender left."; break;
                case 'network':
                case 'disconnected': errMsg = "Lost connection to the network."; break;
                case 'webrtc': errMsg = "Connection blocked. Check your firewall or VPN."; break;
            }
            showToast(errMsg, "error");
            resetApp();
        });
    }

    function startP2PTransfer(file) {
        if (!file) return;
        isCancelled = false;
        

        fileToSend = file;
        let roomCode = localStorage.getItem('p2p_active_id');
        if (!roomCode) {
            roomCode = generateShortCode();
            localStorage.setItem('p2p_active_id', roomCode);
        }

        showTransferScreen(file.name, "Setting up secure connection...");
        
        // --- 10 Minute Auto-Expiry Timer ---
        const sessionTimer = setTimeout(() => {
            if (!isTransferring && !currentConnection) {
                showToast("P2P session expired due to inactivity.", "info");
                resetApp();
            }
        }, 10 * 60 * 1000);
        
        peer = new Peer(roomCode, {
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            if (currentConnection || isTransferring) {
                return;
            }

            const cleanUrl = window.location.href.split('?')[0].split('#')[0];
            const transferUrl = `${cleanUrl}#${id}`;
            UI.qrContainer.innerHTML = "";
            new QRCode(UI.qrContainer, { text: transferUrl, width: 150, height: 150, colorDark: "#020617", colorLight: "#ffffff" });
            localStorage.setItem('p2p_active_id', id);
            UI.pairingCodeDisplay.innerText = id;
            UI.shareOptions.classList.remove('hidden');
            UI.statusText.innerText = "Waiting for the other person to join...";
            setStatusDot('amber');
            UI.copyLinkBtn.onclick = () => {
                navigator.clipboard.writeText(transferUrl);
                showToast("Link copied to clipboard!", "success");
            };
        });

        peer.on('connection', (conn) => {
            clearTimeout(sessionTimer);
            currentConnection = conn;
            isTransferring = true;
            
            UI.shareOptions.classList.add('hidden');
            UI.progressArea.classList.remove('hidden');
            if(UI.progressText) UI.progressText.innerText = "Sending...";
            
            const mbSize = (fileToSend.size / (1024 * 1024)).toFixed(2);
            UI.statusText.innerText = `Sending (${mbSize} MB)...`;
            setStatusDot('green');

            conn.on('data', (payload) => {
                if (payload.type === 'transfer-complete') {
                    isTransferring = false;
                    isTransferComplete = true; // Add this line
                    UI.progressArea.classList.add('hidden');
                    UI.successArea.classList.remove('hidden');
                    UI.successArea.classList.add('flex');
                    UI.successText.innerText = "Sent";
                    UI.statusText.innerText = "File sent successfully!";
                    setResetButton("Close", true);
                    if (UI.transferSpeed) UI.transferSpeed.innerText = '';
                    setStatusDot('green');
                    showToast("Transfer Complete!", "success");
                
                } else if (payload.type === 'transfer-cancelled') {
                    showToast("The receiver cancelled the transfer.", "error");
                    resetApp();

                } else if (payload.type === 'ack') {
                    if (payload.bytesReceived === 0) {
                        lastSpeedBytes = 0;
                        lastSpeedTime = Date.now();
                    }

                    if (UI.statusText.innerText.includes("Reconnecting") || UI.statusText.innerText.includes("paused") || UI.statusText.innerText.includes("Restored")) {
                        const mbSize = (fileToSend.size / (1024 * 1024)).toFixed(2);
                        UI.statusText.innerText = `Sending (${mbSize} MB)...`;
                        if (UI.progressText) UI.progressText.innerText = "Sending...";
                        setStatusDot('green');
                    }
                    
                    updateProgress(payload.bytesReceived, fileToSend.size);
                    if (payload.bytesReceived < fileToSend.size) {
                        sendNextChunk(conn, fileToSend, payload.bytesReceived);
                    }
                
                } else if (payload.type === 'resume') {
                    UI.shareOptions.classList.add('hidden');
                    const mbSize = (fileToSend.size / (1024 * 1024)).toFixed(2);
                    UI.statusText.innerText = `Sending (${mbSize} MB)...`;
                    if (UI.progressText) UI.progressText.innerText = "Sending...";
                    setStatusDot('green');
                    
                    lastSpeedBytes = payload.offset;
                    lastSpeedTime = Date.now();

                    updateProgress(payload.offset, fileToSend.size);
                    sendNextChunk(conn, fileToSend, payload.offset);
                }
            });

            conn.on('open', () => {
                conn.send({ type: 'metadata', name: fileToSend.name, size: fileToSend.size, fileType: fileToSend.type });
            });

            conn.on('close', () => {
                if (isCancelled) return;
                if (isTransferring) {
                    UI.statusText.innerText = "Connection lost! Waiting for receiver to auto-reconnect...";
                    if (UI.transferSpeed) UI.transferSpeed.innerText = "0.0 MB/s";
                    setStatusDot('amber');
                }
            });
        });

        setupPeerErrorHandling(peer);
    }

    async function sendNextChunk(conn, file, offset) {
        const chunkSize = 512 * 1024; 
        try {
            if (!isTransferring || isCancelled) return;
            
            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();
            
            if (!isTransferring || isCancelled) return;
            conn.send({ type: 'chunk', data: buffer });

            if (offset + buffer.byteLength >= file.size) {
                if(UI.progressText) UI.progressText.innerText = "Finishing...";
                UI.statusText.innerText = "Waiting for them to finish downloading... Please don't close.";
                if (UI.transferSpeed) UI.transferSpeed.innerText = '';
            }
        } catch (e) {
            console.error("File Read Error", e);
        }
    }

    UI.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    UI.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); UI.dropZone.classList.add('drop-active'); });
    UI.dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); UI.dropZone.classList.remove('drop-active'); });
    UI.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        UI.dropZone.classList.remove('drop-active');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    if (window.location.search.includes('?c=')) {
        const cloudId = new URLSearchParams(window.location.search).get('c');
        if(cloudId) {
            window.history.replaceState(null, null, window.location.pathname);
            startSmartReceive(cloudId.toUpperCase());
        }
    }

    UI.receiveBtn.addEventListener('click', () => {
        const targetId = UI.receiveCodeInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        if (!targetId) {
            showToast("Please enter a valid code or link ID.", "error");
            return;
        }
        startSmartReceive(targetId);
    });

    if (window.location.hash.length > 1) {
        const hashVal = window.location.hash.substring(1);
        if (hashVal.startsWith('clip-')) {
            const targetPeerId = hashVal.substring(5).toUpperCase();
            switchMode('clipboard'); 
            startP2PClipboardReceive(targetPeerId);
        } else {
            const targetPeerId = hashVal.toUpperCase();
            startP2PReceive(targetPeerId);
        }
    }

    async function startSmartReceive(targetId) {
        isCancelled = false;
        showTransferScreen("Connecting...", `Searching for ${targetId}...`);

        try {
            const docRef = doc(db, "links", targetId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (Date.now() > data.expiresAt) {
                    showToast("This link has expired and is being removed.", "error");
                    await purgeCloudFile(targetId, data.storagePath);
                    resetApp();
                    return;
                }
                await downloadCloudFile(data, targetId);
                return;
            }
        } catch(e) { }

        startP2PReceive(targetId);
    }

    async function downloadCloudFile(data, docId) {
        UI.progressArea.classList.remove('hidden');
        if(UI.progressText) UI.progressText.innerText = "Downloading...";
        UI.fileName.innerText = data.name;
        UI.statusText.innerText = `Fetching file...`;

        lastSpeedBytes = 0;
        lastSpeedTime = Date.now();

        try {
            const response = await fetch(data.url);
            if (!response.ok) throw new Error("Network Error");

            const reader = response.body.getReader();
            const contentLength = +response.headers.get('Content-Length') || data.size;
            let receivedLength = 0;
            let chunks = [];

            while(true) {
                if (isCancelled) return;
                const {done, value} = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedLength += value.length;
                updateProgress(receivedLength, contentLength);
            }

            const blob = new Blob(chunks, { type: data.type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (data.isOneTime) {
                await purgeCloudFile(docId, data.storagePath);
            }

            UI.progressArea.classList.add('hidden');
            UI.successArea.classList.remove('hidden');
            UI.successArea.classList.add('flex');
            UI.successText.innerText = "Received";
            UI.statusText.innerText = "File saved to your device!";
            setResetButton("Close", true);
            if (UI.transferSpeed) UI.transferSpeed.innerText = '';
            setStatusDot('green');
            showToast("Download Complete!", "success");

        } catch (error) {
            if (isCancelled) return;
            window.open(data.url, '_blank');
            if (data.isOneTime) {
                await purgeCloudFile(docId, data.storagePath);
            }
            UI.progressArea.classList.add('hidden');
            UI.statusText.innerText = "Download opened in a new tab.";
            setResetButton("Close", true);
        }
    }

    function attemptReconnect() {
        if (isCancelled) return;
        clearTimeout(reconnectTimer);

        if (p2pTransferState.reconnectAttempts > 15) { 
            showToast("Connection lost permanently.", "error");
            resetApp();
            return;
        }

        p2pTransferState.reconnectAttempts++;

        if (navigator.onLine && peer && !peer.destroyed) {
            if (peer.disconnected) peer.reconnect();
            const newConn = peer.connect(p2pTransferState.targetId, { reliable: true });
            setupReceiverConnection(newConn);
        } else {
            reconnectTimer = setTimeout(attemptReconnect, 3000);
        }
    }

    function startP2PReceive(targetId) {
        isCancelled = false;
        p2pTransferState = { buffer: [], bytesReceived: 0, meta: null, targetId: targetId, isReconnecting: false, reconnectAttempts: 0 };
        showTransferScreen("Connecting...", `Looking for connection code ${targetId}...`);

        peer = new Peer({
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        connectionTimeout = setTimeout(() => {
            showToast("Connection timed out. Please check the code and try again.", "error");
            resetApp();
        }, 45000);

        peer.on('open', () => {
            const conn = peer.connect(targetId, { reliable: true });
            setupReceiverConnection(conn);
        });

        setupPeerErrorHandling(peer);
    }

    function setupReceiverConnection(conn) {
        currentConnection = conn;
        isTransferring = true;

        conn.on('open', () => {
            clearTimeout(connectionTimeout);
            UI.progressArea.classList.remove('hidden');
            p2pTransferState.reconnectAttempts = 0; 

            if (p2pTransferState.isReconnecting && p2pTransferState.bytesReceived > 0) {
                UI.statusText.innerText = "Connection restored! Resuming download...";
                if (UI.progressText) UI.progressText.innerText = "Downloading...";
                setStatusDot('green');
                conn.send({ type: 'resume', offset: p2pTransferState.bytesReceived });
            } else {
                if(UI.progressText) UI.progressText.innerText = "Downloading...";
                UI.statusText.innerText = "Connected. Waiting for file...";
                setStatusDot('green');
            }
        });

        conn.on('data', (payload) => {
            // Intercept clipboard mode request
            if (payload.type === 'init-clipboard') {
                isTransferring = false; // Disconnects it from file transfer close logic
                setupClipboardConnection(conn); // Hand it over to the clipboard handler
                return;
            }
            if (!isTransferring || isCancelled) return;

            if (payload.type === 'transfer-cancelled') {
                showToast("The sender cancelled the transfer.", "error");
                resetApp();

            } else if (payload.type === 'metadata') {
                if (p2pTransferState.isReconnecting) return;

                p2pTransferState.meta = payload;
                UI.fileName.innerText = payload.name;
                const mbSize = (payload.size / (1024 * 1024)).toFixed(2);
                UI.statusText.innerText = `Downloading (${mbSize} MB)...`;

                lastSpeedBytes = 0;
                lastSpeedTime = Date.now();

                conn.send({ type: 'ack', bytesReceived: 0 });

            } else if (payload.type === 'chunk') {
                if (UI.statusText.innerText.includes("Restored") || UI.statusText.innerText.includes("reconnect") || UI.statusText.innerText.includes("paused")) {
                    const mbSize = (p2pTransferState.meta.size / (1024 * 1024)).toFixed(2);
                    UI.statusText.innerText = `Downloading (${mbSize} MB)...`;
                    if (UI.progressText) UI.progressText.innerText = "Downloading...";
                    setStatusDot('green');
                    
                    lastSpeedBytes = p2pTransferState.bytesReceived;
                    lastSpeedTime = Date.now();
                }

                const chunkData = payload.data;
                p2pTransferState.buffer.push(chunkData);
                p2pTransferState.bytesReceived += (chunkData.byteLength || chunkData.size || chunkData.length || 0);

                updateProgress(p2pTransferState.bytesReceived, p2pTransferState.meta.size);

                if (p2pTransferState.bytesReceived >= p2pTransferState.meta.size) {
                    isTransferring = false;
                    isTransferComplete = true;
                    try {
                        saveFile(p2pTransferState.buffer, p2pTransferState.meta);
                        conn.send({ type: 'transfer-complete' });

                        UI.progressArea.classList.add('hidden');
                        UI.successArea.classList.remove('hidden');
                        UI.successArea.classList.add('flex');
                        UI.successText.innerText = "Received";
                        UI.statusText.innerText = "File saved to your device!";
                        setResetButton("Close", true);
                        if (UI.transferSpeed) UI.transferSpeed.innerText = '';
                        setStatusDot('green');
                        p2pTransferState = { buffer: [], bytesReceived: 0, meta: null, targetId: null, isReconnecting: false, reconnectAttempts: 0 };
                        showToast("Download Complete!", "success");
                    } catch (err) {
                        showToast("Error saving the file.", "error");
                    }
                } else {
                    conn.send({ type: 'ack', bytesReceived: p2pTransferState.bytesReceived });
                }
            }
        });

        conn.on('close', () => {
            if (isCancelled) return;

            if (p2pTransferState.bytesReceived > 0 && p2pTransferState.bytesReceived < p2pTransferState.meta.size) {
                p2pTransferState.isReconnecting = true;
                showToast("Connection dropped. Auto-reconnecting...", "info");
                UI.statusText.innerText = "Connection lost! Attempting to reconnect...";
                setStatusDot('amber');
                if (UI.transferSpeed) UI.transferSpeed.innerText = "0.0 MB/s";
                attemptReconnect();
            } else if (isTransferring) {
                showToast("The sender disconnected.", "error");
                resetApp();
            }
        });
    }

    function showTransferScreen(fileName, statusText) {
        setActiveScreen('create');
        UI.initial.classList.add('hidden');
        UI.initial.classList.remove('flex');
        UI.transfer.classList.remove('hidden');
        UI.transfer.classList.add('flex', 'transfer-enter');
        UI.fileName.innerText = fileName;
        UI.statusText.innerText = statusText;
        setResetButton("Cancel", false);
        setStatusDot('blue');
    }

    function updateProgress(current, total) {
        if(!total || total === 0) return;
        let percent = Math.floor((current / total) * 100);
        if (percent > 100) percent = 100;
        UI.progressBar.style.width = percent + "%";
        UI.percentage.innerText = percent + "%";

        const now = Date.now();
        const timeDiff = now - lastSpeedTime;
        
        if (timeDiff >= 250) {
            if (timeDiff < 5000 && current >= lastSpeedBytes) {
                const bytesDiff = current - lastSpeedBytes;
                const speedMBps = (bytesDiff / (1024 * 1024) / (timeDiff / 1000)).toFixed(1);
                
                if (UI.transferSpeed && speedMBps > 0) {
                    UI.transferSpeed.innerText = `${speedMBps} MB/s`;
                }
            }
            lastSpeedBytes = current;
            lastSpeedTime = now;
        }
    }

    function saveFile(bufferArray, meta) {
        const blob = new Blob(bufferArray, { type: meta.fileType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = meta.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

// --- NEW CLIPBOARD P2P LOGIC ---
    let clipboardHeartbeat = null;

    UI.startClipboardBtn.addEventListener('click', () => {
        startP2PClipboard();
    });

    UI.clipboardReceiveBtn.addEventListener('click', () => {
        const targetId = UI.clipboardReceiveCode.value.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        if (!targetId) return showToast("Enter sync code", "error");
        startP2PClipboardReceive(targetId);
    });

    function startP2PClipboard() {
        isCancelled = false;
        showTransferScreen("Clipboard Sync", "Waiting for the other device to connect...");
        const roomCode = generateShortCode();
        peer = new Peer(roomCode, {
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
        });

        peer.on('open', (id) => {
            const cleanUrl = window.location.href.split('?')[0].split('#')[0];
            const transferUrl = `${cleanUrl}#clip-${id}`; 
            UI.qrContainer.innerHTML = "";
            new QRCode(UI.qrContainer, { text: transferUrl, width: 150, height: 150, colorDark: "#020617", colorLight: "#ffffff" });
            UI.pairingCodeDisplay.innerText = id;
            UI.shareOptions.classList.remove('hidden');
            setStatusDot('amber');
        });

        peer.on('connection', setupClipboardConnection);
        setupPeerErrorHandling(peer);
    }

    function startP2PClipboardReceive(targetId, isTrusted = false) {
        isCancelled = false;
        showTransferScreen("Clipboard Sync", `Connecting to ${isTrusted ? 'Trusted Device' : targetId}...`);
        
        // If connecting via Trusted Device, bypass the temporary peer
        if (isTrusted && backgroundPeer && !backgroundPeer.destroyed) {
            const conn = backgroundPeer.connect(targetId, { reliable: true });
            setupClipboardConnection(conn);
            return;
        }

        peer = new Peer({
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
        });
        peer.on('open', () => {
            const conn = peer.connect(targetId, { reliable: true });
            setupClipboardConnection(conn);
        });
        setupPeerErrorHandling(peer);
    }

   function setupClipboardConnection(conn) {
        currentConnection = conn;
        
        const onOpen = () => {
            UI.transfer.classList.add('hidden');
            UI.initial.classList.add('hidden');
            UI.clipboardActiveState.classList.remove('hidden');
            UI.clipboardActiveState.classList.add('flex', 'transfer-enter');
            
            // Hide prompt initially on new connection
            UI.saveDevicePrompt.classList.add('hidden');
            UI.saveDevicePrompt.classList.remove('flex');

            if (UI.sharedTextpad.tagName === 'TEXTAREA') UI.sharedTextpad.value = "";
            else UI.sharedTextpad.innerHTML = "";
            
            UI.sharedTextpad.focus();
            showToast("Devices Synced!", "success");

            clearInterval(clipboardHeartbeat);
            clipboardHeartbeat = setInterval(() => {
                if (currentConnection && currentConnection.open) {
                    currentConnection.send({ type: 'heartbeat' });
                }
            }, 25000); 

            conn.send({ type: 'init-clipboard' });
            
            // Send our persistent ID to the other device so they can save us
            conn.send({ type: 'device-info', id: myClipId, name: myClipName });
        };

        if (conn.open) onOpen(); else conn.on('open', onOpen);

        conn.on('data', (payload) => {
            if (payload.type === 'init-clipboard') return;
            
            // Handle incoming Device Info for saving
            // Handle incoming Device Info for saving OR updating
            if (payload.type === 'device-info') {
                const existingIndex = trustedDevices.findIndex(d => d.id === payload.id);
                
                // If it's already a trusted device, update the name if it changed
                if (existingIndex !== -1) {
                    if (trustedDevices[existingIndex].name !== payload.name) {
                        trustedDevices[existingIndex].name = payload.name;
                        localStorage.setItem('smartshare_trusted_devices', JSON.stringify(trustedDevices));
                        renderTrustedDevices();
                        showToast(`Device name updated to: ${payload.name}`, "info");
                    }
                    return; // Stop here since it's already saved
                }
                
                // If not trusted, show the prompt to save it
                if (payload.id !== myClipId) {
                    UI.saveDevicePrompt.classList.remove('hidden');
                    UI.saveDevicePrompt.classList.add('flex');
                    UI.saveDeviceName.innerText = payload.name;
                    
                    UI.btnSaveDeviceYes.onclick = () => {
                        trustedDevices.push({ id: payload.id, name: payload.name });
                        localStorage.setItem('smartshare_trusted_devices', JSON.stringify(trustedDevices));
                        renderTrustedDevices();
                        UI.saveDevicePrompt.classList.add('hidden');
                        UI.saveDevicePrompt.classList.remove('flex');
                        showToast("Device saved to Trusted List!", "success");
                    };
                    
                    UI.btnSaveDeviceNo.onclick = () => {
                        UI.saveDevicePrompt.classList.add('hidden');
                        UI.saveDevicePrompt.classList.remove('flex');
                    };
                }
                return;
            }

            if (payload.type === 'clipboard-sync') {
                const incomingData = payload.html !== undefined ? payload.html : payload.text;
                if (UI.sharedTextpad.tagName === 'TEXTAREA') {
                    UI.sharedTextpad.value = incomingData;
                } else {
                    UI.sharedTextpad.innerHTML = incomingData;
                }
            } else if (payload.type === 'transfer-cancelled') {
                clearInterval(clipboardHeartbeat);
                showToast("The other device disconnected.", "info");
                resetApp();
            }
        });

        conn.on('close', () => {
            clearInterval(clipboardHeartbeat);
            if(!isCancelled) {
                showToast("The other device disconnected.", "error"); 
                resetApp();
            }
        });
    }

    // --- RICH TEXT, LINKS & IMAGE HANDLING ---
    
    // Master Sync Function
    function syncClipboardData() {
        if (currentConnection && currentConnection.open) {
            const currentData = UI.sharedTextpad.tagName === 'TEXTAREA' ? UI.sharedTextpad.value : UI.sharedTextpad.innerHTML;
            // Send both formats to prevent version clashing
            currentConnection.send({ type: 'clipboard-sync', html: currentData, text: currentData });
        }
    }

    // 1. Sync on typing
    UI.sharedTextpad.addEventListener('input', syncClipboardData);

  // 2. Click to open links, Save Images, and Remove Images
    UI.sharedTextpad.addEventListener('click', (e) => {
        // Handle Links
        if (e.target.tagName === 'A') {
            window.open(e.target.href, '_blank');
            return;
        }

        // Handle Save Image Button
        const saveBtn = e.target.closest('.save-img-btn');
        if (saveBtn) {
            const img = saveBtn.closest('.group').querySelector('img');
            if (img) {
                const a = document.createElement('a');
                a.href = img.src;
                a.download = `SmartShare_Image_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast("Image saved to device!", "success");
            }
            return;
        }

        // Handle Remove Image Button
        const removeBtn = e.target.closest('.remove-img-btn');
        if (removeBtn) {
            const wrapper = removeBtn.closest('.group');
            if (wrapper) {
                wrapper.remove();
                syncClipboardData();
                showToast("Image removed", "info");
            }
            return;
        }
    });

    // Helper: Generates the HTML for images with overlay buttons
    function generateImageWrapper(base64Data) {
        return `
        <div class="relative group inline-block m-2 align-middle max-w-full" contenteditable="false">
            <img src="${base64Data}" class="max-w-full rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm block" />
            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1.5 transition-opacity duration-200 z-10">
                <button class="save-img-btn bg-slate-900/70 hover:bg-slate-900 text-white p-2 rounded-lg backdrop-blur-md shadow-lg transition-transform hover:scale-105" title="Save Image">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                </button>
                <button class="remove-img-btn bg-red-500/80 hover:bg-red-600 text-white p-2 rounded-lg backdrop-blur-md shadow-lg transition-transform hover:scale-105" title="Remove">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        </div>&nbsp;`; // Trailing space lets the user keep typing after the image
    }

    // 3. Smart Paste (Auto-Link & Images)
    UI.sharedTextpad.addEventListener('paste', (e) => {
        let hasImage = false;
        const items = (e.clipboardData || window.clipboardData).items;
        
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                hasImage = true;
                e.preventDefault();
                const blob = item.getAsFile();
                
                if (blob.size > 2 * 1024 * 1024) return showToast("Image too large! Max 2MB for clipboard.", "error");
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.execCommand('insertHTML', false, generateImageWrapper(event.target.result));
                    setTimeout(syncClipboardData, 50); 
                };
                reader.readAsDataURL(blob);
            }
        }
        
        if (!hasImage) {
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            if (pastedText) {
                e.preventDefault();
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const htmlText = pastedText
                    .replace(/</g, "&lt;").replace(/>/g, "&gt;") 
                    .replace(urlRegex, '<a href="$1" target="_blank" class="text-blue-500 underline font-medium cursor-pointer">$1</a>')
                    .replace(/\n/g, "<br>"); 
                document.execCommand('insertHTML', false, htmlText);
                setTimeout(syncClipboardData, 50); 
            }
        }
    });

    // 4. Drag & Drop Text/Images directly into the pad
    UI.sharedTextpad.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                if(file.size > 2 * 1024 * 1024) return showToast("Image too large! Max 2MB.", "error");
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.execCommand('insertHTML', false, generateImageWrapper(event.target.result));
                    setTimeout(syncClipboardData, 50); 
                };
                reader.readAsDataURL(file);
            }
        } else {
            const text = e.dataTransfer.getData('text/plain');
            if(text) {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const htmlText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(urlRegex, '<a href="$1" target="_blank" class="text-blue-500 underline font-medium cursor-pointer">$1</a>').replace(/\n/g, "<br>");
                document.execCommand('insertHTML', false, htmlText);
                setTimeout(syncClipboardData, 50); 
            }
        }
    });

    // 5. Copy out of the app
    UI.copyClipboardBtn.addEventListener('click', () => {
        const textToCopy = UI.sharedTextpad.tagName === 'TEXTAREA' ? UI.sharedTextpad.value : UI.sharedTextpad.innerText;
        navigator.clipboard.writeText(textToCopy);
        showToast("Copied to your device clipboard!", "success");
    });

    // 6. Clear Clipboard Button
    UI.clearClipboardBtn.addEventListener('click', () => {
        if (UI.sharedTextpad.tagName === 'TEXTAREA') UI.sharedTextpad.value = "";
        else UI.sharedTextpad.innerHTML = "";
        
        syncClipboardData();
        UI.sharedTextpad.focus();
        showToast("Clipboard cleared", "info");
    });

    UI.clipboardDisconnectBtn.addEventListener('click', () => {
        clearInterval(clipboardHeartbeat);
        resetApp();
    });
// Auto-recover P2P session if we were in the middle of one
   // Auto-recover P2P session
    const recoveredId = localStorage.getItem('p2p_active_id');
    if (recoveredId) {
        // If we have an ID but no files, we can't send, so just clear it
        if (selectedFiles.length === 0) {
            localStorage.removeItem('p2p_active_id');
        } else {
            showToast("Recovering previous session...", "info");
            UI.sendFilesBtn.click();
        }
    }
});
