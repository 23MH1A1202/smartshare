import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const storage = getStorage(app);
const db = getFirestore(app, "smartshare"); 

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

        devModal: document.getElementById('dev-modal'),
        devModalCard: document.getElementById('dev-modal-card'),
        openModalBtn: document.getElementById('about-dev-btn'),
        closeModalBtn: document.getElementById('close-modal-btn'),

        cloudModal: document.getElementById('cloud-modal'),
        cloudModalCard: document.getElementById('cloud-modal-card'),
        openCloudModalBtn: document.getElementById('my-cloud-files-btn'),
        closeCloudModalBtn: document.getElementById('close-cloud-modal-btn'),
        cloudFilesList: document.getElementById('cloud-files-list')
    };

    let peer = null;
    let currentConnection = null;
    let fileToSend = null;
    let connectionTimeout = null;
    let isTransferring = false;
    let selectedFiles = [];

    UI.modeP2P.addEventListener('click', () => {
        transferMode = 'p2p';
        UI.modeP2P.classList.replace('text-slate-500', 'text-blue-600');
        UI.modeP2P.classList.add('bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-blue-400');
        UI.modeCloud.classList.remove('bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-blue-400');
        UI.modeCloud.classList.add('text-slate-500', 'dark:text-slate-400');
        UI.cloudSettings.classList.add('hidden');
        UI.cloudSettings.classList.remove('flex');
    });

    UI.modeCloud.addEventListener('click', () => {
        transferMode = 'cloud';
        UI.modeCloud.classList.replace('text-slate-500', 'text-blue-600');
        UI.modeCloud.classList.add('bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-blue-400');
        UI.modeP2P.classList.remove('bg-white', 'shadow-sm', 'dark:bg-slate-700', 'dark:text-blue-400');
        UI.modeP2P.classList.add('text-slate-500', 'dark:text-slate-400');
        UI.cloudSettings.classList.remove('hidden');
        UI.cloudSettings.classList.add('flex');
    });

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

    // --- Link Manager ---
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
            if (storagePath) {
                await deleteObject(ref(storage, storagePath));
            }
        } catch (e) { console.error("Could not delete from server", e); }
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
            } catch (e) { console.error(e); }
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
            card.className = "bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/50 flex flex-col gap-2";
            
            let sizeText = (file.size / (1024 * 1024)).toFixed(2) + " MB";
            
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex flex-col truncate pr-2">
                        <span class="font-semibold text-slate-800 dark:text-white text-sm truncate">${file.name}</span>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-md font-mono">${file.id}</span>
                            <span class="text-xs text-slate-500">${sizeText}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-1 bg-white dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div class="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span id="timer-${file.id}">${formatTimeLeft(file.expiresAt - Date.now())}</span>
                    </div>
                    <div class="flex gap-2">
                        <button class="extend-btn text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-2.5 py-1.5 rounded-lg transition-colors" data-id="${file.id}">Extend Time</button>
                        <button class="delete-cloud-btn text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-2.5 py-1.5 rounded-lg transition-colors" data-id="${file.id}" data-path="${file.storagePath}">Delete</button>
                    </div>
                </div>
            `;
            UI.cloudFilesList.appendChild(card);
        });

        // 🌟 NEW: Prompt-based Extending logic
        document.querySelectorAll('.extend-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                
                let mins = prompt("How many minutes do you want to extend this link for? (Max: 60)", "15");
                if (mins === null) return; 
                
                mins = parseInt(mins, 10);
                if (isNaN(mins) || mins <= 0 || mins > 60) {
                    showToast("Please enter a valid number of minutes up to 60.", "error");
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

    UI.openCloudModalBtn.addEventListener('click', () => {
        UI.cloudModal.classList.remove('hidden');
        UI.cloudModal.classList.add('flex');
        setTimeout(() => {
            UI.cloudModal.classList.remove('opacity-0');
            UI.cloudModalCard.classList.remove('scale-95');
            UI.cloudModalCard.classList.add('scale-100');
        }, 10);
        loadCloudManager();
    });

    UI.closeCloudModalBtn.addEventListener('click', () => {
        clearInterval(cloudTimerInterval);
        UI.cloudModal.classList.add('opacity-0');
        UI.cloudModalCard.classList.remove('scale-100');
        UI.cloudModalCard.classList.add('scale-95');
        setTimeout(() => {
            UI.cloudModal.classList.add('hidden');
            UI.cloudModal.classList.remove('flex');
        }, 300);
    });

    function renderFileList() {
        UI.fileList.innerHTML = '';
        
        if (selectedFiles.length === 0) {
            UI.stagedFilesSection.classList.add('hidden');
            UI.stagedFilesSection.classList.remove('flex');
            UI.receiveSection.classList.remove('hidden');
            UI.receiveSection.classList.add('flex');
            UI.fileInput.value = '';
            return;
        }

        UI.stagedFilesSection.classList.remove('hidden');
        UI.stagedFilesSection.classList.add('flex');
        UI.receiveSection.classList.add('hidden');
        UI.receiveSection.classList.remove('flex');

        selectedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = "flex items-center justify-between bg-white/50 dark:bg-slate-800/40 backdrop-blur-md p-3 rounded-3xl border border-white/60 dark:border-slate-700/50 shadow-sm transition-all hover:bg-white/70 dark:hover:bg-slate-800/60 group";
            
            let sizeText = (file.size / (1024 * 1024)).toFixed(2) + " MB";
            if (file.size < 1024 * 1024) sizeText = (file.size / 1024).toFixed(2) + " KB";
            
            let mediaPreview = '';
            const objectUrl = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
                mediaPreview = `<img src="${objectUrl}" class="w-full h-full object-cover" onload="URL.revokeObjectURL(this.src)">`;
            } else if (file.type.startsWith('video/')) {
                mediaPreview = `<video src="${objectUrl}#t=0.001" class="w-full h-full object-cover" preload="metadata" muted playsinline onloadeddata="URL.revokeObjectURL(this.src)"></video>`;
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

        UI.sendFilesBtn.innerHTML = `Send ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`;
    }

    function resetApp() {
        try {
            if (currentConnection) currentConnection.close();
            if (peer) peer.destroy();
        } catch (e) { console.error(e); }

        clearTimeout(connectionTimeout);
        peer = null; currentConnection = null; fileToSend = null; isTransferring = false;
        selectedFiles = [];

        UI.fileInput.value = '';
        UI.receiveCodeInput.value = '';
        UI.cloudCustomCode.value = '';

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

        UI.resetBtn.innerText = "Cancel";
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
        showTransferScreen(file.name, "Preparing link share...");
        UI.progressArea.classList.remove('hidden');

        let rawCode = UI.cloudCustomCode.value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const fileId = rawCode || generateShortCode();

        if (rawCode) {
            try {
                const docSnap = await getDoc(doc(db, "links", fileId));
                if (docSnap.exists()) {
                    showToast("That custom word is already taken!", "error");
                    resetApp();
                    return;
                }
            } catch(e) { console.error(e); }
        }

        const storagePath = `shared/${fileId}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                updateProgress(snapshot.bytesTransferred, snapshot.totalBytes);
                UI.statusText.innerText = `Uploading file securely...`;
                if(UI.progressText) UI.progressText.innerText = "Uploading...";
            },
            (error) => {
                showToast("Upload failed: Please check your internet.", "error");
                resetApp();
            },
            async () => {
                try {
                    UI.statusText.innerText = `Generating your secure link...`;
                    
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    
                    // 🌟 NEW: Cleaned up Time selection logic
                    let expireMs = 60 * 60 * 1000; // default 1 hr
                    if (UI.cloudExpire.value === '10m') expireMs = 10 * 60 * 1000;
                    else if (UI.cloudExpire.value === '1h') expireMs = 60 * 60 * 1000;
                    else if (UI.cloudExpire.value === '4h') expireMs = 4 * 60 * 60 * 1000;

                    const isOneTime = UI.cloudLimit.value === 'one-time';

                    await setDoc(doc(db, "links", fileId), {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        url: downloadURL,
                        storagePath: storagePath,
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
                    UI.resetBtn.innerText = "Start Over";

                    UI.copyLinkBtn.onclick = () => {
                        navigator.clipboard.writeText(transferUrl);
                        showToast("Link copied to clipboard!", "success");
                    };
                } catch (err) {
                    showToast("Could not generate link.", "error");
                    resetApp();
                }
            }
        );
    }

    function startP2PTransfer(file) {
        if (!file) return;

        fileToSend = file;
        showTransferScreen(file.name, "Setting up secure connection...");
        const roomCode = generateShortCode();
        
        peer = new Peer(roomCode, {
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            const cleanUrl = window.location.href.split('?')[0].split('#')[0];
            const transferUrl = `${cleanUrl}#${id}`;
            UI.qrContainer.innerHTML = "";
            new QRCode(UI.qrContainer, { text: transferUrl, width: 150, height: 150, colorDark: "#020617", colorLight: "#ffffff" });

            UI.pairingCodeDisplay.innerText = id;
            UI.shareOptions.classList.remove('hidden');
            UI.statusText.innerText = "Waiting for the other person to join...";
            UI.copyLinkBtn.onclick = () => {
                navigator.clipboard.writeText(transferUrl);
                showToast("Link copied to clipboard!", "success");
            };
        });

        peer.on('connection', (conn) => {
            currentConnection = conn;
            isTransferring = true;
            UI.shareOptions.classList.add('hidden');
            UI.progressArea.classList.remove('hidden');
            if(UI.progressText) UI.progressText.innerText = "Sending...";
            const mbSize = (fileToSend.size / (1024 * 1024)).toFixed(2);
            UI.statusText.innerText = `Sending (${mbSize} MB)...`;

            conn.on('data', (payload) => {
                if (payload.type === 'transfer-complete') {
                    isTransferring = false;
                    UI.progressArea.classList.add('hidden');
                    UI.successArea.classList.remove('hidden');
                    UI.successArea.classList.add('flex');
                    UI.successText.innerText = "Sent";
                    UI.statusText.innerText = "File sent successfully! ✅";
                    UI.resetBtn.innerText = "Start Over";
                    showToast("Transfer Complete!", "success");
                }
            });

            conn.on('open', () => streamFileToReceiver(conn, fileToSend));
            conn.on('close', () => {
                if(isTransferring) {
                    showToast("The other person disconnected.", "error");
                    resetApp();
                }
            });
        });

        setupPeerErrorHandling(peer);
    }

    function streamFileToReceiver(conn, file) {
        const chunkSize = 64 * 1024; 
        let offset = 0;
        conn.send({ type: 'metadata', name: file.name, size: file.size, fileType: file.type });

        const reader = new FileReader();
        reader.onload = (e) => {
            if (!isTransferring) return; 
            conn.send({ type: 'chunk', data: e.target.result });
            offset += e.target.result.byteLength;
            updateProgress(offset, file.size);

            if (offset < file.size) {
                setTimeout(readNext, 5); 
            } else {
                if(UI.progressText) UI.progressText.innerText = "Finishing...";
                UI.statusText.innerText = "Waiting for them to finish downloading... Please don't close.";
            }
        };
        const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        readNext();
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
            receiveCloudLink(cloudId);
        }
    }

    UI.receiveBtn.addEventListener('click', () => {
        const targetId = UI.receiveCodeInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!targetId) {
            showToast("Please enter a valid code or link ID.", "error");
            return;
        }

        if (transferMode === 'cloud') {
            receiveCloudLink(targetId);
        } else {
            startP2PReceive(targetId);
        }
    });

    if (window.location.hash.length > 1) {
        const targetPeerId = window.location.hash.substring(1).toUpperCase();
        startP2PReceive(targetPeerId);
    }

    async function receiveCloudLink(targetId) {
        showTransferScreen("Connecting...", `Looking for shared link: ${targetId}...`);

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
            } else {
                showToast("File not found or link has expired.", "error");
                resetApp();
            }
        } catch(e) {
            showToast("Could not connect to the server.", "error");
            resetApp();
        }
    }

    async function downloadCloudFile(data, docId) {
        UI.progressArea.classList.remove('hidden');
        if(UI.progressText) UI.progressText.innerText = "Downloading...";
        UI.fileName.innerText = data.name;
        UI.statusText.innerText = `Fetching file...`;

        try {
            const response = await fetch(data.url);
            if (!response.ok) throw new Error("Network Error");

            const reader = response.body.getReader();
            const contentLength = +response.headers.get('Content-Length') || data.size;
            let receivedLength = 0;
            let chunks = [];

            while(true) {
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
            UI.statusText.innerText = "File saved to your device! 📥";
            UI.resetBtn.innerText = "Start Over";
            showToast("Download Complete!", "success");

        } catch (error) {
            window.open(data.url, '_blank'); 
            if (data.isOneTime) {
                await purgeCloudFile(docId, data.storagePath);
            }
            UI.progressArea.classList.add('hidden');
            UI.statusText.innerText = "Download opened in a new tab.";
            UI.resetBtn.innerText = "Start Over";
        }
    }

    function startP2PReceive(targetId) {
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
            currentConnection = conn;
            isTransferring = true;

            let receivedBuffer = [];
            let fileMeta = null;
            let bytesReceived = 0;

            conn.on('open', () => {
                clearTimeout(connectionTimeout);
                UI.progressArea.classList.remove('hidden');
                if(UI.progressText) UI.progressText.innerText = "Downloading...";
                UI.statusText.innerText = "Connected. Waiting for file...";
            });

            conn.on('data', (payload) => {
                if (!isTransferring) return; 

                if (payload.type === 'metadata') {
                    fileMeta = payload;
                    UI.fileName.innerText = fileMeta.name;
                    const mbSize = (fileMeta.size / (1024 * 1024)).toFixed(2);
                    UI.statusText.innerText = `Downloading (${mbSize} MB)...`;
                } else if (payload.type === 'chunk') {
                    const chunkData = payload.data;
                    receivedBuffer.push(chunkData);
                    bytesReceived += chunkData.byteLength || chunkData.size || chunkData.length || 0;
                    updateProgress(bytesReceived, fileMeta.size);

                    if (bytesReceived >= fileMeta.size) {
                        isTransferring = false;
                        try {
                            saveFile(receivedBuffer, fileMeta);
                            conn.send({ type: 'transfer-complete' });

                            UI.progressArea.classList.add('hidden');
                            UI.successArea.classList.remove('hidden');
                            UI.successArea.classList.add('flex');
                            UI.successText.innerText = "Received";
                            UI.statusText.innerText = "File saved to your device! 📥";
                            UI.resetBtn.innerText = "Start Over";
                            showToast("Download Complete!", "success");
                        } catch (err) {
                            showToast("Error saving the file.", "error");
                        }
                    }
                }
            });

            conn.on('close', () => {
                if(isTransferring) {
                    showToast("The sender disconnected.", "error");
                    resetApp();
                }
            });
        });

        setupPeerErrorHandling(peer);
    }

    function setupPeerErrorHandling(peerInstance) {
        peerInstance.on('error', (err) => {
            clearTimeout(connectionTimeout);
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

    function showTransferScreen(fileName, statusText) {
        UI.initial.classList.add('hidden');
        UI.initial.classList.remove('flex');
        UI.transfer.classList.remove('hidden');
        UI.transfer.classList.add('flex');
        UI.fileName.innerText = fileName;
        UI.statusText.innerText = statusText;
        UI.resetBtn.innerText = "Cancel";
    }

    function updateProgress(current, total) {
        if(!total || total === 0) return;
        let percent = Math.floor((current / total) * 100);
        if (percent > 100) percent = 100; 
        UI.progressBar.style.width = percent + "%";
        UI.percentage.innerText = percent + "%";
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

    UI.openModalBtn.addEventListener('click', () => {
        UI.devModal.classList.remove('hidden');
        UI.devModal.classList.add('flex');
        setTimeout(() => {
            UI.devModal.classList.remove('opacity-0');
            UI.devModalCard.classList.remove('scale-95');
            UI.devModalCard.classList.add('scale-100');
        }, 10);
    });

    UI.closeModalBtn.addEventListener('click', () => {
        UI.devModal.classList.add('opacity-0');
        UI.devModalCard.classList.remove('scale-100');
        UI.devModalCard.classList.add('scale-95');
        setTimeout(() => {
            UI.devModal.classList.add('hidden');
            UI.devModal.classList.remove('flex');
        }, 300);
    });
});
