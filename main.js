import { db, doc, setDoc, getDoc, updateDoc, deleteDoc } from './firebase.js';
import { UI, initializeTheme, showToast, setStatusDot, setResetButton } from './ui.js';
import { loadAndApplyStyles, initAdminStyleControls } from './customizer.js';

// Apply stored customizations immediately during parsing to prevent flashes of unstyled theme
loadAndApplyStyles();
// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
            .then((reg) => {
                console.log('Service Worker registered successfully!', reg);
                reg.update();
            })
            .catch((err) => console.error('Service Worker registration failed:', err));
    });
}


let myClipId = localStorage.getItem('smartshare_clip_id');
if (!myClipId) {
    myClipId = 'clip_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('smartshare_clip_id', myClipId);
}
let myClipName = localStorage.getItem('smartshare_clip_name') || 'Device-' + Math.floor(Math.random() * 1000);
let trustedDevices = JSON.parse(localStorage.getItem('smartshare_trusted_devices') || '[]');
let backgroundPeer = null; // Listens for trusted connections
// --- CLIPBOARD HEARTBEAT & TIMEOUT VARIABLES ---
let clipboardHeartbeat = null;
let clipboardConnTimeout = null;
let lastClipboardPong = 0;
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
let p2pSessionInterval = null; // Add this
let p2pTransferState = { buffer: [], bytesReceived: 0, meta: null, targetId: null, isReconnecting: false, reconnectAttempts: 0 };
let reconnectTimer = null; 

let lastSpeedBytes = 0;
let lastSpeedTime = Date.now();
// --- INDEXEDDB CACHING FOR FILE RECOVERY ---
    const DB_NAME = 'SmartShareStorage';
    const STORE_NAME = 'StagedFiles';
    const MAX_CACHE_SIZE = 300 * 1024 * 1024; // 300 MB limit for auto-recovery caching

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
                    e.target.result.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function cacheFiles(files) {
        if (!files || files.length === 0) {
            clearFileCache();
            return;
        }
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        if (totalSize > MAX_CACHE_SIZE) return; // Skip caching if too large to protect device RAM

        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(files, 'currentFiles');
        } catch (e) { console.warn("Cache failed", e); }
    }

    async function getCachedFiles() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get('currentFiles');
            return new Promise(resolve => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }

    async function clearFileCache() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete('currentFiles');
        } catch(e) {}
    }
document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme(); 
    initAdminStyleControls(); 
    // --- PWA INSTALL PROMPT ENGINE ---
    let deferredPrompt = null;

    // 1. Intercept the native install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // Stop the mini-infobar from appearing automatically
        deferredPrompt = e; // Stash the event so it can be triggered later

        // Reveal the "Install App" buttons in the navigation
        if (UI.navInstallBtns) {
            UI.navInstallBtns.forEach(btn => {
                btn.classList.remove('hidden');
                btn.classList.add('flex');
            });
        }

        // Auto-show the educational modal (if they haven't opted out)
        const hideInstall = localStorage.getItem('smartshare_hide_install');
        if (hideInstall !== 'true') {
            // Add a 2-second delay so it doesn't interrupt the initial page load instantly
            setTimeout(showInstallModal, 2000); 
        }
    });

    // 2. Hide buttons if the app gets installed successfully
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        if (UI.navInstallBtns) {
            UI.navInstallBtns.forEach(btn => {
                btn.classList.add('hidden');
                btn.classList.remove('flex');
            });
        }
        showToast("SmartShare installed successfully!", "success");
    });

    // 3. Modal Functions
    function showInstallModal() {
        if (!UI.installModal) return;
        UI.installModal.classList.remove('hidden');
        UI.installModal.classList.add('flex');

        requestAnimationFrame(() => {
            UI.installModal.classList.remove('opacity-0');
            UI.installModal.querySelector('div').classList.remove('scale-[0.98]');
        });
    }

    function hideInstallModal() {
        if (!UI.installModal) return;

        // Save user preference if they checked the box
        if (UI.dontShowInstallCheck && UI.dontShowInstallCheck.checked) {
            localStorage.setItem('smartshare_hide_install', 'true');
        }

        UI.installModal.classList.add('opacity-0');
        UI.installModal.querySelector('div').classList.add('scale-[0.98]');

        setTimeout(() => {
            UI.installModal.classList.add('hidden');
            UI.installModal.classList.remove('flex');
        }, 200);
    }

    // 4. Attach Event Listeners
    if (UI.cancelInstallBtn) {
        UI.cancelInstallBtn.addEventListener('click', hideInstallModal);
    }

    if (UI.confirmInstallBtn) {
        UI.confirmInstallBtn.addEventListener('click', async () => {
            hideInstallModal(); // Close our custom modal

            if (deferredPrompt) {
                deferredPrompt.prompt(); // Show the native OS install prompt
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    localStorage.setItem('smartshare_hide_install', 'true'); // Hide forever if installed
                }
                deferredPrompt = null;
            } else {
                showToast("Your browser doesn't support direct installation or the app is already installed.", "info");
            }
        });
    }

    // 5. Connect the Nav Buttons to the Modal
    if (UI.navInstallBtns) {
        UI.navInstallBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close the mobile menu if it's open before showing the modal
                if (UI.mobileMenu && !UI.mobileMenu.classList.contains('hidden')) {
                    document.getElementById('mobile-menu-btn').click(); 
                }
                showInstallModal();
            });
        });
    }
    if (navigator.share && UI.nativeShareBtn) {
        UI.nativeShareBtn.classList.remove('hidden');
        UI.nativeShareBtn.classList.add('flex');
    }
    const syncHeaderHeight = () => {
        const header = document.querySelector('header');
        if (header) {
            document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
        }
    };

    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('load', syncHeaderHeight);

    let peer = null;
    let currentConnection = null;
    let fileToSend = null;
    let connectionTimeout = null;
    let isTransferring = false;
    let selectedFiles = [];
    const baseTabClass = "flex-1 py-2.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-colors relative z-10 text-zinc-500 dark:text-zinc-400";
    const homeScreens = new Set(['share', 'create']);


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

                    // Keep P2P as default tab
                    switchMode('p2p'); 
                    renderFileList(); 

                    // NEW: Scroll the user down to the drag-and-drop section
                    setActiveScreen('create');

                    showToast("Files loaded! Choose Direct or Link mode, then share.", "success");
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
            div.className = "flex items-center justify-between w-full bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 hover:border-teal-400 dark:hover:border-teal-500 rounded-xl p-1.5 pl-2 transition-all shadow-sm group";

            div.innerHTML = `
                <button class="connect-trusted-btn flex-1 flex items-center gap-3 truncate text-left py-1.5 outline-none" data-id="${device.id}" aria-label="Connect to ${device.name}">
                    <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    </div>
                    <span class="font-semibold text-zinc-800 dark:text-zinc-200 text-sm truncate">${device.name}</span>
                </button>
                <div class="flex items-center gap-1 shrink-0 pr-1">
                    <button class="connect-trusted-btn hidden sm:flex items-center justify-center text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-1.5 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors uppercase tracking-wider" data-id="${device.id}">Connect</button>
                    
                    <button class="delete-trusted-btn text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors" data-index="${index}" aria-label="Remove device">
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
            '-translate-y-4',
            'pointer-events-none'
        );

        requestAnimationFrame(() => {
            UI.mobileMenu.classList.add(
                'opacity-100',
                'translate-y-0',
                'pointer-events-auto'
            );
        });
    }

    function closeMobileMenu() {
        UI.mobileMenu.classList.remove(
            'opacity-100',
            'translate-y-0',
            'pointer-events-auto'
        );

        UI.mobileMenu.classList.add(
            'opacity-0',
            '-translate-y-4',
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

    window.addEventListener('beforeunload', (e) => {
        // NEW: Warn the user if they try to refresh/close while a session is active
        if (fileToSend || isTransferring || (currentConnection && currentConnection.open)) {
            e.preventDefault();
            e.returnValue = ''; // This triggers the browser's native warning dialog
        }

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
            UI.modeP2P.classList.add('text-teal-600', 'dark:text-teal-300');
            UI.modeP2P.classList.remove('text-zinc-500', 'dark:text-zinc-400');
            UI.fileUploadInner.classList.remove('hidden');
            UI.fileUploadInner.classList.add('flex');
        } else if (mode === 'cloud') {
            UI.modeCloud.classList.add('text-teal-600', 'dark:text-teal-300');
            UI.modeCloud.classList.remove('text-zinc-500', 'dark:text-zinc-400');
            UI.fileUploadInner.classList.remove('hidden');
            UI.fileUploadInner.classList.add('flex');
            UI.cloudSettings.classList.remove('hidden');
            UI.cloudSettings.classList.add('flex');
        } else if (mode === 'clipboard') {
            startClipboardListener();
            UI.modeClipboard.classList.add('text-teal-600', 'dark:text-teal-300');
            UI.modeClipboard.classList.remove('text-zinc-500', 'dark:text-zinc-400');
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
        UI.cloudFilesList.innerHTML = `<p class="text-center text-sm text-zinc-500 py-10">Fetching your files...</p>`;
        clearInterval(cloudTimerInterval);

        let myLinks = JSON.parse(localStorage.getItem('smartshare_my_links') || '[]');
        if (myLinks.length === 0) {
            UI.cloudFilesList.innerHTML = `<p class="text-center text-sm text-zinc-500 py-10">You have no active shared links.</p>`;
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
            UI.cloudFilesList.innerHTML = `<p class="text-center text-sm text-zinc-500 py-10">You have no active shared links.</p>`;
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

    function promptExtendTime() {
        return new Promise((resolve) => {
            UI.extendModal.classList.remove('hidden');
            UI.extendModal.classList.add('flex');

            // Allow display block to apply before animating opacity
            requestAnimationFrame(() => {
                UI.extendModal.classList.remove('opacity-0');
                UI.extendModal.querySelector('div').classList.remove('scale-[0.98]');
            });

            UI.extendMinsInput.value = "15";
            UI.extendMinsInput.focus();

            const cleanup = () => {
                UI.extendModal.classList.add('opacity-0');
                UI.extendModal.querySelector('div').classList.add('scale-[0.98]');
                setTimeout(() => {
                    UI.extendModal.classList.add('hidden');
                    UI.extendModal.classList.remove('flex');
                }, 200); // Wait for transition
                UI.cancelExtendBtn.removeEventListener('click', onCancel);
                UI.confirmExtendBtn.removeEventListener('click', onConfirm);
            };

            const onCancel = () => { cleanup(); resolve(null); };
            const onConfirm = () => { cleanup(); resolve(UI.extendMinsInput.value); };

            UI.cancelExtendBtn.addEventListener('click', onCancel);
            UI.confirmExtendBtn.addEventListener('click', onConfirm);
        });
    }

    function renderCloudManagerUI(files) {
        UI.cloudFilesList.innerHTML = '';
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = "cloud-file-card bg-white/40 dark:bg-zinc-900/30 backdrop-blur-xl p-3.5 rounded-2xl border border-white/60 dark:border-zinc-700/50 flex flex-col shadow-sm transition-all hover:bg-white/60 dark:hover:bg-zinc-800/40 hover:shadow-md";
            let sizeText = (file.size / (1024 * 1024)).toFixed(2) + " MB";

            // Determine what to show in the thumbnail box
            let mediaPreview = file.thumbnail 
                ? `<img src="${file.thumbnail}" class="w-full h-full object-cover">`
                : getIconSvgForType(file.type || '');

            card.innerHTML = `
                <div class="flex items-center gap-3 w-full mb-3">
                    <div class="w-11 h-11 shrink-0 bg-white dark:bg-zinc-900 rounded-[12px] overflow-hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-sm">
                        ${mediaPreview}
                    </div>
                    
                    <div class="flex flex-col min-w-0 flex-1">
                        <div class="flex justify-between items-center mb-0.5">
                            <span class="font-semibold text-zinc-800 dark:text-white text-sm truncate pr-2">${file.name}</span>
                            <span class="text-[10px] font-mono font-bold bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 px-1.5 py-0.5 rounded tracking-wider shrink-0">${file.id}</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="font-medium text-zinc-500 dark:text-zinc-400">${sizeText}</span>
                            <div class="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-md">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span id="timer-${file.id}">${formatTimeLeft(file.expiresAt - Date.now())}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="grid ${!!navigator.share ? 'grid-cols-4' : 'grid-cols-3'} gap-2 border-t border-zinc-200 dark:border-zinc-700/50 pt-3">
                    <button class="copy-link-manager-btn flex items-center justify-center text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 py-2 rounded-xl transition-all" data-id="${file.id}">Copy</button>
                    
                    ${!!navigator.share ? `<button class="share-link-manager-btn flex items-center justify-center text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 py-2 rounded-xl transition-all" data-id="${file.id}">Share</button>` : ''}
                    
                    <button class="extend-btn flex items-center justify-center text-[11px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 py-2 rounded-xl transition-all" data-id="${file.id}">Extend</button>
                    <button class="delete-cloud-btn flex items-center justify-center text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 py-2 rounded-xl transition-all" data-id="${file.id}" data-path="${file.storagePath}">Delete</button>
                </div>
            `;
            UI.cloudFilesList.appendChild(card);
        });
        // --- NEW: Native Share for Manage Links Page ---
        document.querySelectorAll('.share-link-manager-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                const cleanUrl = window.location.href.split('?')[0].split('#')[0];
                const transferUrl = `${cleanUrl}?c=${id}`;
                try {
                    await navigator.share({
                        title: 'Secure Link Share',
                        text: `Hello,\n\nI have securely shared some files with you via SmartShare.\n\nPlease use the link below to access them:\n${transferUrl}\n\nAlternatively, open SmartShare and enter this code: ${id}\n\nRegards,\nSmartShare`,
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') showToast("Could not open share menu.", "error");
                }
            });
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
                // Prevent the click from bubbling up
                e.preventDefault(); 
                e.stopPropagation();

                const id = e.target.getAttribute('data-id');

                // Call the custom modal
                let mins = await promptExtendTime();

                if (mins === null) return; // User clicked Cancel

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
                        showToast(`Time extended by ${mins} minutes!`, "success");
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
            li.className = "file-item-enter flex items-center justify-between bg-white/40 dark:bg-zinc-900/30 backdrop-blur-xl p-3 rounded-3xl border border-white/60 dark:border-zinc-700/50 shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all hover:bg-white/60 dark:hover:bg-zinc-800/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] group";
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
                mediaPreview = `<svg class="w-6 h-6 text-zinc-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;
            }

            li.innerHTML = `
                <div class="flex items-center w-[85%]">
                    <div class="w-11 h-11 shrink-0 rounded-[14px] overflow-hidden bg-white/60 dark:bg-zinc-800/60 flex items-center justify-center mr-3 border border-white/40 dark:border-zinc-700/40 shadow-inner">
                        ${mediaPreview}
                    </div>
                    <div class="flex flex-col truncate pr-2 text-left w-full">
                        <span class="text-zinc-800 dark:text-zinc-200 font-semibold truncate tracking-tight text-[15px] leading-tight mb-0.5">${file.name}</span>
                        <span class="text-[13px] text-zinc-500 font-medium">${sizeText}</span>
                    </div>
                </div>
                <button class="delete-file-btn text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all p-2.5 rounded-2xl shrink-0 opacity-80 group-hover:opacity-100" data-index="${index}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            UI.fileList.appendChild(li);
        });

        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                selectedFiles.splice(index, 1);
                cacheFiles(selectedFiles);
                renderFileList();
            });
        });

        updateSendBtnText();
    }

    function resetApp() {
        isCancelled = true;
        clearTimeout(connectionTimeout);
        clearTimeout(reconnectTimer);
        clearInterval(p2pSessionInterval); // ADD THIS
        if(UI.transferIconContainer) updateTransferIcon(null); // Resets the icon
        if(UI.transferEta) UI.transferEta.innerText = ''; // Clears the ETA
        speedSamples = []; // Resets speed averaging
        document.getElementById('session-timer-display')?.classList.add('hidden');

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
        clearFileCache();
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
        
        // --- NEW: Clear file preview and memory ---
        const previewContainer = document.getElementById('success-preview-container');
        if (previewContainer) previewContainer.innerHTML = '';
        if (typeof lastSavedUrl !== 'undefined' && lastSavedUrl) {
            URL.revokeObjectURL(lastSavedUrl);
            lastSavedUrl = null;
        }
        // ------------------------------------------

        updateProgress(0, 100);

        renderFileList();

        setResetButton("Cancel", false);
        UI.fileName.innerText = "Waiting...";
        UI.statusText.innerText = "Getting ready...";

        if(UI.p2pWarningSender) UI.p2pWarningSender.classList.add('hidden');
        if(UI.cloudSafeMsg) UI.cloudSafeMsg.classList.add('hidden');
        if(UI.p2pWarningReceiver) {
            UI.p2pWarningReceiver.classList.add('hidden');
            UI.p2pWarningReceiver.classList.remove('flex');
        }
        if (UI.p2pWarningSender) {
            UI.p2pWarningSender.classList.add('bg-amber-50', 'border-amber-200');
            UI.p2pWarningSender.classList.remove('bg-amber-100', 'border-amber-400');
        }
    }

    UI.resetBtn.addEventListener('click', resetApp);

   function generateShortCode() {
        // Excluded: 0, O, 1, I to prevent visual confusion
        const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return code;
    }

    function handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (let i = 0; i < fileList.length; i++) {
            selectedFiles.push(fileList[i]);
        }
        cacheFiles(selectedFiles); 
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
                updateTransferIcon(finalFile);
            } catch (error) {
                showToast("Failed to pack files.", "error");
                resetApp();
                return;
            }
        }

        if (transferMode === 'cloud') {
            startCloudTransfer(finalFile);
            updateTransferIcon(finalFile);
        } else {
            startP2PTransfer(finalFile);
            updateTransferIcon(finalFile);
        }
    });

    async function startCloudTransfer(file) {
        isCancelled = false;
        updateTransferIcon(file);
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

                    // Generate thumbnail before uploading to DB
                    const thumbData = await generateThumbnailBase64(file);

                    await setDoc(doc(db, "links", fileId), {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        url: downloadURL,
                        storagePath: response.public_id,
                        expiresAt: Date.now() + expireMs,
                        isOneTime: isOneTime,
                        createdAt: Date.now(),
                        ownerId: myOwnerId,
                        thumbnail: thumbData // Save it to the cloud document!
                    });

                    saveFileToLocalLedger(fileId);

                    const cleanUrl = window.location.href.split('?')[0].split('#')[0];
                    const transferUrl = `${cleanUrl}?c=${fileId}`;

                    UI.progressArea.classList.add('hidden');
                    UI.qrContainer.innerHTML = "";
                    new QRCode(UI.qrContainer, { text: transferUrl, width: 150, height: 150, colorDark: "#020617", colorLight: "#ffffff" });
                    UI.pairingCodeDisplay.innerText = fileId;
                    UI.shareOptions.classList.remove('hidden');

                    UI.p2pWarningSender.classList.add('hidden');
                    UI.p2pWarningSender.classList.remove('flex');
                    UI.cloudSafeMsg.classList.remove('hidden');
                    UI.cloudSafeMsg.classList.add('flex');

                    // NEW: Clarified status text below filename
                    UI.statusText.innerText = "Link generated successfully!";
                    setResetButton("Close", true);
                    setStatusDot('green');

                    UI.copyLinkBtn.onclick = () => {
                        navigator.clipboard.writeText(transferUrl);
                        showToast("Link copied to clipboard!", "success");
                    };
                    // --- NEW: Cloud Link Native Share Logic ---
                    UI.nativeShareBtn.onclick = async () => {
                        try {
                            await navigator.share({
                                title: 'Secure Link Share',
                                text: `Hello,\n\nI have securely shared some files with you via SmartShare.\n\nPlease use the link below to access them:\n${transferUrl}\n\nAlternatively, open SmartShare and enter this code: ${fileId}\n\nRegards,\nSmartShare`,
                            });
                        } catch (err) {
                            if (err.name !== 'AbortError') showToast("Could not open share menu.", "error");
                        }
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

       // --- NEW: Visual 10 Minute Countdown ---
        let timeLeft = 600; // 10 minutes in seconds
        const timerEl = document.getElementById('timer-value');
        const timerContainer = document.getElementById('session-timer-display');
        timerContainer.classList.remove('hidden');

        p2pSessionInterval = setInterval(() => {
            timeLeft--;
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;

            if (timeLeft <= 0) {
                clearInterval(p2pSessionInterval);
                timerContainer.classList.add('hidden');
                showToast("P2P session expired due to inactivity.", "info");
                resetApp();
            }
        }, 1000);        
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
            UI.pairingCodeDisplay.innerText = id;
            UI.shareOptions.classList.remove('hidden');
            localStorage.setItem('p2p_active_id', id);
           // NEW: Show P2P Warning, Hide Cloud Safe Msg
            UI.p2pWarningSender.classList.remove('hidden');
            UI.p2pWarningSender.classList.add('flex');
            UI.cloudSafeMsg.classList.add('hidden');
            UI.cloudSafeMsg.classList.remove('flex');
            UI.statusText.innerText = "Waiting for the other person to join...";
            setStatusDot('amber');
           UI.copyLinkBtn.onclick = () => {
                navigator.clipboard.writeText(transferUrl);
                showToast("Link copied to clipboard!", "success");

                // Show the warning slightly after the success message
                setTimeout(() => {
                    showToast("After sharing the code or link, immediately return to this page to continue the file transfer.", "info");
                }, 600); 
            };

            // --- NEW: Direct Share Native Share Logic ---
            if (UI.nativeShareBtn) {
                UI.nativeShareBtn.onclick = async () => {
                    try {
                        // Trigger the warning BEFORE the share sheet opens, 
                        // as the OS share sheet suspends browser execution.
                        showToast("After sharing the code or link, immediately return to this page to continue the file transfer.", "info");

                        await navigator.share({
                            title: 'Secure File Share',
                            text: `Hello,\n\nI have securely shared some files with you via SmartShare.\n\nPlease use the link below to access them:\n${transferUrl}\n\nAlternatively, open SmartShare and enter this code: ${id}\n\nRegards,\nSmartShare`,
                        });
                    } catch (err) {
                        if (err.name !== 'AbortError') showToast("Could not open share menu.", "error");
                    }
                };
            }
        });




        peer.on('connection', (conn) => {
            clearInterval(p2pSessionInterval);
            // Hide the timer UI immediately
            const timerContainer = document.getElementById('session-timer-display');
            if (timerContainer) timerContainer.classList.add('hidden');
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
                    isTransferComplete = true; 
                    // --- NEW: Hide the warning when done ---
                    if (UI.p2pWarningSender) {
                        UI.p2pWarningSender.classList.add('hidden');
                        UI.p2pWarningSender.classList.remove('flex');
                    }
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
                    return;

                } else if (payload.type === 'ack') {
                    if (!fileToSend) return;

                    // We now only use the VERY FIRST ack to start the continuous stream
                    if (payload.bytesReceived === 0) {
                        lastSpeedBytes = 0;
                        lastSpeedTime = Date.now();
                        sendFileStream(conn, fileToSend, 0); // Launch the stream!
                    }

                } else if (payload.type === 'resume') {
                    if (!fileToSend) return;

                    UI.shareOptions.classList.add('hidden');
                    const mbSize = (fileToSend.size / (1024 * 1024)).toFixed(2);
                    UI.statusText.innerText = `Sending (${mbSize} MB)...`;
                    if (UI.progressText) UI.progressText.innerText = "Sending...";
                    setStatusDot('green');

                    lastSpeedBytes = payload.offset;
                    lastSpeedTime = Date.now();

                    updateProgress(payload.offset, fileToSend.size);

                    // Resume the high-speed stream from where it dropped
                    sendFileStream(conn, fileToSend, payload.offset);
                }
            });

           conn.on('open', async () => {
               // --- NEW: Prevent crash if user cancelled before connection opened ---
                if (isCancelled || !fileToSend) return;
                const thumbData = await generateThumbnailBase64(fileToSend);
                conn.send({ 
                    type: 'metadata', 
                    name: fileToSend.name, 
                    size: fileToSend.size, 
                    fileType: fileToSend.type, 
                    thumbnail: thumbData // Ship the thumbnail!
                });
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

    // --- HIGH-SPEED WEBRTC STREAMING ENGINE (TURBO MODE) ---
   // --- HIGH-SPEED WEBRTC STREAMING ENGINE (ADAPTIVE TCP-STYLE CONGESTION CONTROL) ---
    async function sendFileStream(conn, file, offset) {
        let chunkSize = 64 * 1024; // Start in "2nd Gear" (Safe for most networks)
        const maxChunkSize = 512 * 1024; // Top Speed for Local WiFi (512 KB)
        const minChunkSize = 16 * 1024; // 1st Gear for terrible cell reception (16 KB)
        const maxBuffer = 2 * 1024 * 1024; // 2 MB safety buffer

        while (offset < file.size && isTransferring && !isCancelled) {
            // Monitor the active WebRTC data pipe
            const currentBuffer = conn.dataChannel ? conn.dataChannel.bufferedAmount : 0;

            // Flow Control: The pipe is getting clogged! (Mobile Upload bottleneck)
            if (currentBuffer > maxBuffer) {
                // Downshift gear to prevent dropped packets
                chunkSize = Math.max(minChunkSize, Math.floor(chunkSize / 2));
                // Pause for just 5ms to let the cell tower digest the data
                await new Promise(resolve => setTimeout(resolve, 5));
                continue;
            }

            // Flow Control: The pipe is wide open! (Local WiFi network)
            if (currentBuffer < maxBuffer * 0.25) {
                // Upshift gear to push data as fast as the CPU can slice it
                chunkSize = Math.min(maxChunkSize, chunkSize * 2);
            }

            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();

            if (!isTransferring || isCancelled) break;

            conn.send({ type: 'chunk', data: buffer });
            offset += buffer.byteLength;

            // --- THE 99% HOLD UX ---
            if (offset >= file.size) {
                UI.progressBar.style.width = "99%";
                UI.percentage.innerText = "99%";
                if(UI.progressText) UI.progressText.innerText = "Finishing...";
                UI.statusText.innerText = "Receiver is saving the file... Please do not close!";
                if (UI.transferSpeed) UI.transferSpeed.innerText = '';

                if (UI.p2pWarningSender) {
                    UI.p2pWarningSender.classList.remove('bg-amber-50', 'border-amber-200');
                    UI.p2pWarningSender.classList.add('bg-amber-100', 'border-amber-400');
                }
                break;
            } else {
                updateProgress(offset, file.size);
            }
        }
    }

    UI.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    // --- NEW: Global Drag & Drop Overlay ---
    let globalDragCounter = 0;
    const globalDragOverlay = document.getElementById('global-drag-overlay');
    
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.types && (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-moz-file'))) {
            globalDragCounter++;
            if (globalDragCounter === 1 && globalDragOverlay) {
                globalDragOverlay.classList.remove('hidden');
                globalDragOverlay.classList.add('flex');
                requestAnimationFrame(() => {
                    globalDragOverlay.classList.remove('opacity-0');
                });
            }
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.types && (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-moz-file'))) {
            globalDragCounter--;
            if (globalDragCounter === 0 && globalDragOverlay) {
                globalDragOverlay.classList.add('opacity-0');
                setTimeout(() => {
                    if (globalDragCounter === 0) {
                        globalDragOverlay.classList.add('hidden');
                        globalDragOverlay.classList.remove('flex');
                    }
                }, 300);
            }
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        globalDragCounter = 0;
        if (globalDragOverlay) {
            globalDragOverlay.classList.add('opacity-0');
            setTimeout(() => {
                globalDragOverlay.classList.add('hidden');
                globalDragOverlay.classList.remove('flex');
            }, 300);
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setActiveScreen('create');
            handleFiles(e.dataTransfer.files);
        }
    });

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

    // Allow pressing "Enter" in the input field to trigger the Open button
    UI.receiveCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default form submission behaviors
            UI.receiveBtn.click();
        }
    });

   /* if (window.location.hash.length > 1) {
        const hashVal = window.location.hash.substring(1);
        if (hashVal.startsWith('clip-')) {
            const targetPeerId = hashVal.substring(5).toUpperCase();
            switchMode('clipboard'); 
            startP2PClipboardReceive(targetPeerId);
        } else {
            const targetPeerId = hashVal.toUpperCase();
            startP2PReceive(targetPeerId);
        }
    } */
    // --- NEW: Robust URL Hash Handler (Self-Click Protection) ---
    function handleIncomingHash(hashStr) {
        const hashVal = hashStr.substring(1);
        const activeId = localStorage.getItem('p2p_active_id');

        let targetPeerId = hashVal;
        let isClip = false;

        if (hashVal.startsWith('clip-')) {
            targetPeerId = hashVal.substring(5).toUpperCase();
            isClip = true;
        } else {
            targetPeerId = hashVal.toUpperCase();
        }

        // Verify if the sender just clicked their own link
        if (targetPeerId === activeId) {
            showToast("You are currently hosting this session.", "info");
            window.history.replaceState(null, null, window.location.pathname); // Clean the URL

            // Auto scroll to the active transfer box
            setActiveScreen('create');
            setTimeout(() => {
                const transferBox = document.getElementById('transfer-state');
                if (transferBox && !transferBox.classList.contains('hidden')) {
                    transferBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    UI.dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
            return;
        }

        // If it's someone else's link, proceed normally
        if (isClip) {
            switchMode('clipboard'); 
            startP2PClipboardReceive(targetPeerId);
        } else {
            startP2PReceive(targetPeerId);
        }
    }

    // Check on initial page load
    if (window.location.hash.length > 1) {
        handleIncomingHash(window.location.hash);
    }

    // Listen for link clicks while the page is already open
    window.addEventListener('hashchange', () => {
        if (window.location.hash.length > 1) {
            handleIncomingHash(window.location.hash);
        }
    });
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
                updateTransferIcon(data);
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
            if (lastSavedUrl) URL.revokeObjectURL(lastSavedUrl);
            lastSavedUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = lastSavedUrl;
            a.download = data.name;
            document.body.appendChild(a);
            a.click(); // Auto-save
            document.body.removeChild(a);

            if (data.isOneTime) {
                await purgeCloudFile(docId, data.storagePath);
            }

            UI.progressArea.classList.add('hidden');
            UI.successArea.classList.remove('hidden');
            UI.successArea.classList.add('flex');
            UI.successText.innerText = "Received";
            UI.statusText.innerText = "File saved to your device!";
            // NEW: Show the clickable preview
            showSuccessPreview(data, lastSavedUrl);
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

        // --- NEW: Show P2P Receiver Warning ---
        if (UI.p2pWarningReceiver) {
            UI.p2pWarningReceiver.classList.remove('hidden');
            UI.p2pWarningReceiver.classList.add('flex');
        }

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
        // --- NEW: Prevent crash if PeerJS fails to create a connection ---
        if (!conn) {
            showToast("Failed to establish connection.", "error");
            resetApp();
            return;
        }
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
                return;

            } else if (payload.type === 'metadata') {
                if (p2pTransferState.isReconnecting) return;

                p2pTransferState.meta = payload;
                updateTransferIcon(payload);
                UI.fileName.innerText = payload.name;
                const mbSize = (payload.size / (1024 * 1024)).toFixed(2);
                UI.statusText.innerText = `Downloading (${mbSize} MB)...`;

                lastSpeedBytes = 0;
                lastSpeedTime = Date.now();

                conn.send({ type: 'ack', bytesReceived: 0 });

            } else if (payload.type === 'chunk') {
                // --- NEW: Abort if the metadata was cleared by a cancellation ---
                if (!p2pTransferState.meta) return;
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
                        const fileUrl = saveFile(p2pTransferState.buffer, p2pTransferState.meta);
                        conn.send({ type: 'transfer-complete' });

                        UI.progressArea.classList.add('hidden');
                        UI.successArea.classList.remove('hidden');
                        UI.successArea.classList.add('flex');
                        UI.successText.innerText = "Received";
                        UI.statusText.innerText = "File saved to your device!";
                        
                        if (UI.p2pWarningReceiver) {
                            UI.p2pWarningReceiver.classList.add('hidden');
                            UI.p2pWarningReceiver.classList.remove('flex');
                        }

                        // NEW: Show the clickable preview
                        showSuccessPreview(p2pTransferState.meta, fileUrl);

                        setResetButton("Close", true);
                        if (UI.transferSpeed) UI.transferSpeed.innerText = '';
                        setStatusDot('green');
                        p2pTransferState = { buffer: [], bytesReceived: 0, meta: null, targetId: null, isReconnecting: false, reconnectAttempts: 0 };
                        showToast("Download Complete!", "success");
                    } catch (err) {
                        showToast("Error saving the file.", "error");
                    }
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
        setStatusDot('cyan');
    }

    let speedSamples = []; // Add this variable right above the function

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
                const speedBps = bytesDiff / (timeDiff / 1000);

                // Smooth the speed reading using an array
                speedSamples.push(speedBps);
                if (speedSamples.length > 5) speedSamples.shift(); 

                const avgSpeedBps = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
                const speedMBps = (avgSpeedBps / (1024 * 1024)).toFixed(1);

                if (UI.transferSpeed && speedMBps > 0) {
                    UI.transferSpeed.innerText = `${speedMBps} MB/s`;

                    // ETA Calculation
                    if (UI.transferEta && avgSpeedBps > 0) {
                        const bytesRemaining = total - current;
                        const secondsRemaining = Math.ceil(bytesRemaining / avgSpeedBps);

                        if (secondsRemaining < 2) {
                            UI.transferEta.innerText = 'Almost done';
                        } else if (secondsRemaining < 60) {
                            UI.transferEta.innerText = `${secondsRemaining}s left`;
                        } else {
                            const mins = Math.floor(secondsRemaining / 60);
                            const secs = secondsRemaining % 60;
                            UI.transferEta.innerText = `${mins}m ${secs}s left`;
                        }
                    }
                }
            }
            lastSpeedBytes = current;
            lastSpeedTime = now;
        }

        // Hide ETA when transfer finishes
        if (current >= total) {
            if (UI.transferEta) UI.transferEta.innerText = '';
            if (UI.transferSpeed) UI.transferSpeed.innerText = '';
        }
    }
    function updateTransferIcon(fileData) {
        if (!UI.transferIconContainer) return;

        let mediaPreview = `<svg class="w-5 h-5 text-teal-500 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;

        if (fileData) {
            const type = fileData.type || fileData.fileType || '';

            // Sender side: Generate from local File object
            if (fileData instanceof Blob || fileData instanceof File) {
                const objectUrl = URL.createObjectURL(fileData);
                if (type.startsWith('image/')) {
                    mediaPreview = `<img src="${objectUrl}" class="w-full h-full object-cover">`;
                } else if (type.startsWith('video/')) {
                    mediaPreview = `<video src="${objectUrl}#t=0.001" class="w-full h-full object-cover" preload="metadata" muted playsinline></video>`;
                } else {
                    mediaPreview = getIconSvgForType(type);
                }
            } 
            // NEW: Receiver side (Has attached Base64 string from metadata)
            else if (fileData.thumbnail) {
                mediaPreview = `<img src="${fileData.thumbnail}" class="w-full h-full object-cover">`;
            } 
            // Receiver side fallback icon
            else {
                mediaPreview = getIconSvgForType(type);
            }
        }

        UI.transferIconContainer.innerHTML = mediaPreview;
    }
    function generateThumbnailBase64(file) {
        return new Promise((resolve) => {
            const MAX_SIZE = 96;

            // --- 1. Handle Images ---
            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = img.width; let height = img.height;

                    if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                    else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }

                    canvas.width = width; canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.5));
                    URL.revokeObjectURL(url);
                };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                img.src = url;
            } 
            // --- 2. Handle Videos ---
            else if (file.type.startsWith('video/')) {
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;

                video.addEventListener('loadeddata', () => {
                    // Seek to 1 second to avoid black frames at the start of the video
                    video.currentTime = Math.min(1, video.duration / 2); 
                });

                video.addEventListener('seeked', () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = video.videoWidth; let height = video.videoHeight;

                    if (width === 0 || height === 0) {
                        URL.revokeObjectURL(url); resolve(null); return;
                    }

                    if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                    else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }

                    canvas.width = width; canvas.height = height;
                    ctx.drawImage(video, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.5)); // Compress to tiny JPEG
                    URL.revokeObjectURL(url);
                });

                video.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null); });
                video.src = url;
            } 
            // --- 3. Unsupported Files ---
            else {
                resolve(null);
            }
        });
    }
    function getIconSvgForType(type) {
        if (type.startsWith('image/')) return `<svg class="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
        if (type.startsWith('video/')) return `<svg class="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
        if (type.startsWith('audio/')) return `<svg class="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>`;
        if (type.includes('zip') || type.includes('compressed')) return `<svg class="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>`;
        return `<svg class="w-5 h-5 text-teal-500 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
    }

    let lastSavedUrl = null; // Holds the URL so the user can open it later

    function saveFile(bufferArray, meta) {
        if (lastSavedUrl) URL.revokeObjectURL(lastSavedUrl); // Clean up previous memory
        const blob = new Blob(bufferArray, { type: meta.fileType || 'application/octet-stream' });
        lastSavedUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = lastSavedUrl;
        a.download = meta.name;
        document.body.appendChild(a);
        a.click(); // Auto-save to device
        document.body.removeChild(a);
        
        return lastSavedUrl;
    }

        // NEW: Clean, minimalistic clickable preview that prevents the Zip redownload bug
    function showSuccessPreview(meta, url) {
        const container = document.getElementById('success-preview-container');
        if (!container) return;
                container.innerHTML = `<span class="text-xs text-zinc-500 dark:text-zinc-400 mt-3 font-medium">Check your device's Downloads folder.</span>`;
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

            // --- RESTORED: Show the Code and QR section ---
            UI.pairingCodeDisplay.innerText = id;
            UI.shareOptions.classList.remove('hidden');

            // Hide File Transfer specific warnings since this is Clipboard Mode
            UI.p2pWarningSender.classList.add('hidden');
            UI.p2pWarningSender.classList.remove('flex');
            UI.cloudSafeMsg.classList.add('hidden');
            UI.cloudSafeMsg.classList.remove('flex');
            UI.copyLinkBtn.onclick = () => {
                navigator.clipboard.writeText(transferUrl);
                showToast("Link copied to clipboard!", "success");
            };

            // --- NEW: Clipboard Native Share Logic ---
            UI.nativeShareBtn.onclick = async () => {
                try {
                    await navigator.share({
                        title: 'Clipboard Sync Session',
                        text: `Hello,\n\nI've opened a Live Clipboard sync session with you via SmartShare.\n\nPlease use the link below to connect our devices:\n${transferUrl}\n\nAlternatively, open SmartShare and enter this code: ${id}\n\nRegards,\nSmartShare`,
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') showToast("Could not open share menu.", "error");
                }
            };

            setStatusDot('amber');
        });

        peer.on('connection', setupClipboardConnection);
        setupPeerErrorHandling(peer);
    }

    function startP2PClipboardReceive(targetId, isTrusted = false) {
        isCancelled = false;
        showTransferScreen("Clipboard Sync", `Connecting to ${isTrusted ? 'Trusted Device' : targetId}...`);
       // --- NEW: 8-Second Timeout ---
        if (clipboardConnTimeout) clearTimeout(clipboardConnTimeout);
        clipboardConnTimeout = setTimeout(() => {
            if (!currentConnection || !currentConnection.open) {
                showToast("Connection timed out. Device may be offline.", "error");
                resetApp(); // <--- THIS FIXES THE INFINITE SCREEN
            }
        }, 8000);
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
       // --- NEW: Prevent crash if PeerJS fails to create a connection ---
        if (!conn) {
            showToast("Failed to establish connection.", "error");
            resetApp();
            return;
        }
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

            // Clear the 8-second timeout since we successfully connected
            if (clipboardConnTimeout) clearTimeout(clipboardConnTimeout);

            // --- NEW: Start Heartbeat to kill Ghost Connections ---
            lastClipboardPong = Date.now();
            clearInterval(clipboardHeartbeat);

            clipboardHeartbeat = setInterval(() => {
                if (currentConnection && currentConnection.open) {
                    // If no pong in 15 seconds, device went to sleep
                    if (Date.now() - lastClipboardPong > 15000) {
                        console.warn("Clipboard connection lost (ghosted).");
                        currentConnection.close();
                        clearInterval(clipboardHeartbeat);
                        setStatusDot('red');
                        return;
                    }
                    currentConnection.send({ type: 'ping' });
                } else {
                    clearInterval(clipboardHeartbeat);
                }
            }, 5000); // Ping every 5 seconds

            conn.send({ type: 'init-clipboard' });

            // Send our persistent ID to the other device so they can save us
            conn.send({ type: 'device-info', id: myClipId, name: myClipName });
        };

        if (conn.open) onOpen(); else conn.on('open', onOpen);

       conn.on('data', (payload) => {
            if (payload.type === 'init-clipboard') return;

            // --- NEW: Handle Heartbeat & Manual Sync Requests ---
            if (payload.type === 'ping') {
                currentConnection.send({ type: 'pong' }); // Bounce it back
                return;
            }
            if (payload.type === 'pong') {
                lastClipboardPong = Date.now(); // Register they are alive
                return;
            }
            if (payload.type === 'request-sync') {
                syncClipboardData(); // Auto-sends our current text to them
                return;
            }
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

                // CRITICAL FIX: Sanitize the incoming payload before rendering
                const cleanHTML = DOMPurify.sanitize(incomingData, {
                    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                    ADD_ATTR: ['target'] // Allows links to open in a new tab safely
                });

                if (UI.sharedTextpad.tagName === 'TEXTAREA') {
                    UI.sharedTextpad.value = cleanHTML;
                } else {
                    UI.sharedTextpad.innerHTML = cleanHTML;
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
            <img src="${base64Data}" class="max-w-full rounded-xl border border-zinc-200 dark:border-zinc-600 shadow-sm block" />
            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1.5 transition-opacity duration-200 z-10">
                <button class="save-img-btn bg-zinc-900/70 hover:bg-zinc-900 text-white p-2 rounded-lg backdrop-blur-md shadow-lg transition-transform hover:scale-105" title="Save Image">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                </button>
                <button class="remove-img-btn bg-red-500/80 hover:bg-red-600 text-white p-2 rounded-lg backdrop-blur-md shadow-lg transition-transform hover:scale-105" title="Remove">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        </div>&nbsp;`; // Trailing space lets the user keep typing after the image
    }

    // Helper: Safely insert HTML at the cursor position without execCommand
    function safeInsertHTML(html) {
        UI.sharedTextpad.focus(); // Ensure the pad has focus
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents(); // Clear highlighted text if any

            const template = document.createElement('div');
            template.innerHTML = html;

            const fragment = document.createDocumentFragment();
            let node, lastNode;
            while ((node = template.firstChild)) {
                lastNode = fragment.appendChild(node);
            }

            range.insertNode(fragment);

            // Move the cursor immediately after the inserted content
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } else {
            // Fallback
            UI.sharedTextpad.innerHTML += html;
        }
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
                    safeInsertHTML(generateImageWrapper(event.target.result));
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
                    .replace(urlRegex, '<a href="$1" target="_blank" class="text-cyan-500 underline font-medium cursor-pointer">$1</a>')
                    .replace(/\n/g, "<br>"); 
                safeInsertHTML(htmlText);
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
                    safeInsertHTML(generateImageWrapper(event.target.result));
                    setTimeout(syncClipboardData, 50); 
                };
                reader.readAsDataURL(file);
            }
        } else {
            const text = e.dataTransfer.getData('text/plain');
            if(text) {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const htmlText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(urlRegex, '<a href="$1" target="_blank" class="text-cyan-500 underline font-medium cursor-pointer">$1</a>').replace(/\n/g, "<br>");
                safeInsertHTML(htmlText);
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
    // --- HYBRID QR SCANNER (Native + jsQR Fallback) ---
    let qrScannerRequest = null;
    let qrVideoStream = null;

    // Create a hidden canvas for the jsQR fallback to read video frames
    const qrCanvas = document.createElement('canvas');
    const qrCtx = qrCanvas.getContext('2d', { willReadFrequently: true });

    async function startQRScanner() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' } // Prefer rear camera
            });

            UI.qrVideo.srcObject = stream;
            qrVideoStream = stream;

            UI.qrScannerContainer.classList.remove('hidden');
            UI.qrScannerContainer.classList.add('block');

            // Smoothly scroll the scanner into the center of the viewport
            setTimeout(() => {
                UI.qrScannerContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);

            // Wait for video metadata to load before playing and scanning
            UI.qrVideo.onloadedmetadata = async () => {
                await UI.qrVideo.play();
                scanQRFrame(); // Start the scanning loop
            };

        } catch (err) {
            console.error("Camera access error:", err);
            showToast("Could not access camera. Please check your permissions.", "error");
        }
    }

    async function scanQRFrame() {
        if (!qrVideoStream) return;

        try {
            // 1. Try Native BarcodeDetector First (Fastest, mostly Chrome/Android)
            if ('BarcodeDetector' in window) {
                try {
                    const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
                    const barcodes = await barcodeDetector.detect(UI.qrVideo);
                    if (barcodes && barcodes.length > 0) {
                        handleScannedQR(barcodes[0].rawValue);
                        return; // Stop looping on success
                    }
                } catch (nativeErr) {
                    // Native API exists but failed on this frame. Fall through silently.
                }
            }

            // 2. Fallback to jsQR (Software Decoder for Firefox/Desktop/Mac)
            if (typeof jsQR !== 'undefined' && UI.qrVideo.readyState === UI.qrVideo.HAVE_ENOUGH_DATA) {

                // BUG FIX: Downscale the HD video feed so jsQR doesn't choke on millions of pixels
                const scanWidth = Math.min(UI.qrVideo.videoWidth, 600); // Cap width at 600px
                const scanHeight = Math.min(UI.qrVideo.videoHeight, 600 * (UI.qrVideo.videoHeight / UI.qrVideo.videoWidth));

                if (scanWidth > 0 && scanHeight > 0) {
                    qrCanvas.width = scanWidth;
                    qrCanvas.height = scanHeight;

                    // Draw the shrunken frame
                    qrCtx.drawImage(UI.qrVideo, 0, 0, scanWidth, scanHeight);
                    const imageData = qrCtx.getImageData(0, 0, scanWidth, scanHeight);

                    // Decode using jsQR
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "attemptBoth", // BUG FIX: Helps read dark-mode QR codes off phone screens
                    });

                    if (code && code.data) {
                        handleScannedQR(code.data);
                        return; // Stop looping on success
                    }
                }
            }
        } catch (e) {
            // Ignore minor frame drops and continue the loop
        }

        // Loop the scan on the next screen paint
        qrScannerRequest = requestAnimationFrame(scanQRFrame);
    }

    function stopQRScanner() {
        if (qrScannerRequest) cancelAnimationFrame(qrScannerRequest);
        if (qrVideoStream) {
            qrVideoStream.getTracks().forEach(track => track.stop());
            qrVideoStream = null;
        }
        if (UI.qrVideo) UI.qrVideo.srcObject = null;
        if (UI.qrScannerContainer) {
            UI.qrScannerContainer.classList.add('hidden');
            UI.qrScannerContainer.classList.remove('block');
        }
    }

    function handleScannedQR(qrData) {
        stopQRScanner();

        let targetId = qrData;
        let isClipboard = false;

        // Try to parse SmartShare URLs safely
        try {
            if (qrData.startsWith('http')) {
                const url = new URL(qrData);
                if (url.searchParams.has('c')) {
                    targetId = url.searchParams.get('c'); // Cloud Link
                } else if (url.hash.length > 1) {
                    const hashVal = url.hash.substring(1);
                    if (hashVal.startsWith('clip-')) {
                        isClipboard = true;
                        targetId = hashVal.substring(5); // Clipboard P2P
                    } else {
                        targetId = hashVal; // Standard P2P
                    }
                }
            }
        } catch (e) { } 

        targetId = targetId.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();

        if (!targetId) {
            showToast("Invalid QR Code content.", "error");
            return;
        }

        // --- NEW: Self-Scan Protection ---
        if (!isClipboard && targetId === localStorage.getItem('p2p_active_id')) {
            showToast("You cannot connect to your own sharing session.", "error");
            return;
        }

        if (isClipboard) {
            switchMode('clipboard');
            UI.clipboardReceiveCode.value = targetId;
            showToast("Clipboard Code recognized!", "success");
            UI.clipboardReceiveBtn.click(); 
        } else {
            switchMode('p2p'); 
            UI.receiveCodeInput.value = targetId;
            showToast("Share Code recognized!", "success");
            UI.receiveBtn.click(); 
        }
    }

    if (UI.scanQrBtn) UI.scanQrBtn.addEventListener('click', startQRScanner);
    if (UI.closeScannerBtn) UI.closeScannerBtn.addEventListener('click', stopQRScanner);
// Auto-recover P2P session if we were in the middle of one
  // Auto-recover P2P session (Survive Hard Refreshes with File Restoration)
    const recoveredId = localStorage.getItem('p2p_active_id');
    if (recoveredId) {
        // Wait for the database to check for saved files
        const cachedFiles = await getCachedFiles();

        if (cachedFiles && cachedFiles.length > 0) {
            // FULL RECOVERY: Both ID and Files were saved
            selectedFiles = cachedFiles;
            renderFileList();
            showToast("Session and files recovered seamlessly!", "success");

            // Automatically push them back into the transfer state
            setTimeout(() => {
                UI.sendFilesBtn.click();
            }, 300);

        } else if (selectedFiles.length === 0) {
            // PARTIAL RECOVERY: ID saved, but files were too big to cache or manually cleared
            showToast("Session recovered. Please re-select your file to resume sharing.", "info");
            setActiveScreen('create');

            setTimeout(() => {
                UI.dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
                UI.dropZone.classList.add('drop-active');
                setTimeout(() => UI.dropZone.classList.remove('drop-active'), 1500);
             }, 300);
        } else {
            // Failsafe
            UI.sendFilesBtn.click();
        }
    }
 // --- MANUAL SYNC BUTTON ---
    if (UI.clipboardSyncBtn) {
        UI.clipboardSyncBtn.addEventListener('click', () => {
            if (currentConnection && currentConnection.open) {
                currentConnection.send({ type: 'request-sync' });
                syncClipboardData(); // Re-use your existing master sync function
                showToast("Sync triggered!", "success");
            } else {
                showToast("Reconnecting to trusted devices...", "info");
                autoConnectTrustedDevices(); 
            }
        });
    }

    // --- GLOBAL CLIPBOARD AUTO-CONNECT ---
    function autoConnectTrustedDevices() {
        if (trustedDevices && trustedDevices.length > 0) {
            trustedDevices.forEach(device => {
                // Connect in the background
                startP2PClipboardReceive(device.id, true);
            });
        }
    }

    // Always start the background listener so we can receive clipboard connections anywhere in the app
    startClipboardListener();

}); 
