import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

window.onerror = function(message) {
    showToast("System Error: " + message, "error");
    return true; 
};

let transferMode = 'p2p'; 

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

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }

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
        toastContainer: document.getElementById('toast-container'),
        dropZone: document.getElementById('drop-zone'),
        devModal: document.getElementById('dev-modal'),
        devModalCard: document.getElementById('dev-modal-card'),
        openModalBtn: document.getElementById('about-dev-btn'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        receiveSection: document.getElementById('receive-section'),
        stagedFilesSection: document.getElementById('staged-files-section'),
        fileList: document.getElementById('file-list'),
        sendFilesBtn: document.getElementById('send-files-btn'),
        
        modeP2P: document.getElementById('mode-p2p'),
        modeCloud: document.getElementById('mode-cloud'),
        cloudSettings: document.getElementById('cloud-settings'),
        cloudExpire: document.getElementById('cloud-expire'),
        cloudLimit: document.getElementById('cloud-limit'),
        cloudCustomCode: document.getElementById('cloud-custom-code')
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
        UI.statusText.innerText = "Initializing connection";
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
            showTransferScreen("Multiple Files", "Compressing files... Please wait");
            UI.progressArea.classList.remove('hidden');
            if(UI.progressText) UI.progressText.innerText = "Zipping...";
            
            try {
                const zip = new JSZip();
                for (let i = 0; i < selectedFiles.length; i++) {
                    zip.file(selectedFiles[i].name, selectedFiles[i]);
                }
                
                const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
                    let percent = Math.floor(metadata.percent);
                    updateProgress(metadata.percent, 100);
                });
                
                finalFile = new File([zipBlob], "SmartShare_Files.zip", { type: "application/zip" });
            } catch (error) {
                showToast("Failed to compress files.", "error");
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
        showTransferScreen(file.name, "Initializing Cloud Upload...");
        UI.progressArea.classList.remove('hidden');

        let rawCode = UI.cloudCustomCode.value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const fileId = rawCode || generateShortCode();

        if (rawCode) {
            try {
                const docSnap = await getDoc(doc(db, "links", fileId));
                if (docSnap.exists()) {
                    showToast("Custom code is already taken!", "error");
                    resetApp();
                    return;
                }
            } catch(e) { console.error("Code check error:", e); }
        }

        const storagePath = `shared/${fileId}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                updateProgress(snapshot.bytesTransferred, snapshot.totalBytes);
                UI.statusText.innerText = `Uploading to Cloud...`;
                if(UI.progressText) UI.progressText.innerText = "Uploading...";
            },
            (error) => {
                console.error("Storage Error:", error);
                showToast("Cloud upload failed: " + error.message, "error");
                resetApp();
            },
            async () => {
                // 🌟 NEW: Added Try/Catch block to catch silent database errors
                try {
                    UI.statusText.innerText = `Finalizing secure link...`;
                    
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    const expireHours = parseInt(UI.cloudExpire.value);
                    const isOneTime = UI.cloudLimit.value === 'one-time';

                    await setDoc(doc(db, "links", fileId), {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        url: downloadURL,
                        storagePath: storagePath,
                        expiresAt: Date.now() + (expireHours * 60 * 60 * 1000),
                        isOneTime: isOneTime,
                        createdAt: Date.now()
                    });

                    const cleanUrl = window.location.href.split('?')[0].split('#')[0];
                    const transferUrl = `${cleanUrl}?c=${fileId}`;

                    UI.progressArea.classList.add('hidden');
                    UI.qrContainer.innerHTML = "";
                    new QRCode(UI.qrContainer, { text: transferUrl, width: 150, height: 150, colorDark: "#020617", colorLight: "#ffffff" });

                    UI.pairingCodeDisplay.innerText = fileId;
                    UI.shareOptions.classList.remove('hidden');
                    UI.statusText.innerText = "Upload Complete! You can close this tab now.";
                    UI.resetBtn.innerText = "Start Over";

                    UI.copyLinkBtn.onclick = () => {
                        navigator.clipboard.writeText(transferUrl);
                        showToast("Link copied to clipboard!", "success");
                    };
                } catch (err) {
                    console.error("Database Finalization Error:", err);
                    showToast("Database Error: " + err.message, "error");
                    resetApp();
                }
            }
        );
    }

    function startP2PTransfer(file) {
        if (!file) return;

        fileToSend = file;
        showTransferScreen(file.name, "Creating secure room...");

        const roomCode = generateShortCode();
        
        peer = new Peer(roomCode, {
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
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
            UI.statusText.innerText = "Waiting for receiver...";

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
                    UI.statusText.innerText = "Sent Successfully! ✅";
                    UI.resetBtn.innerText = "Start Over";
                    showToast("File sent successfully!", "success");
                }
            });

            conn.on('open', () => streamFileToReceiver(conn, fileToSend));

            conn.on('close', () => {
                if(isTransferring) {
                    showToast("Receiver disconnected mid-transfer.", "error");
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
                if(UI.progressText) UI.progressText.innerText = "Finalizing...";
                UI.statusText.innerText = "Waiting for receiver to finish... Please don't close.";
            }
        };

        const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        readNext();
    }

    UI.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    UI.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        UI.dropZone.classList.add('drop-active');
    });

    UI.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        UI.dropZone.classList.remove('drop-active');
    });

    UI.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        UI.dropZone.classList.remove('drop-active');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    // Handle Cloud Links (e.g. ?c=Sagar2026)
    if (window.location.search.includes('?c=')) {
        const cloudId = new URLSearchParams(window.location.search).get('c');
        if(cloudId) {
            window.history.replaceState(null, null, window.location.pathname);
            startSmartReceive(cloudId);
        }
    }

    // Handle Native Share Intercepts
    if (window.location.search.includes('shared=true')) {
        window.history.replaceState(null, null, window.location.pathname);
        showTransferScreen("Processing...", "Loading shared file...");

        caches.open('shared-file-cache').then(cache => {
            cache.match('/shared-file').then(response => {
                if (response) {
                    const fileName = decodeURIComponent(response.headers.get('X-File-Name') || 'shared_file');
                    const fileType = response.headers.get('Content-Type') || '';

                    response.blob().then(blob => {
                        const file = new File([blob], fileName, { type: fileType });
                        handleFiles([file]);
                        cache.delete('/shared-file'); 
                        resetApp(); 
                    });
                } else {
                    resetApp();
                    showToast("Failed to load shared file.", "error");
                }
            });
        });
    }

    UI.receiveBtn.addEventListener('click', () => {
        const targetId = UI.receiveCodeInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!targetId) {
            showToast("Enter a valid code or ID.", "error");
            return;
        }
        startSmartReceive(targetId);
    });

    // Handle P2P Hash Links
    if (window.location.hash.length > 1) {
        const targetPeerId = window.location.hash.substring(1).toUpperCase();
        startSmartReceive(targetPeerId);
    }

    // 🌟 NEW: Smart Receiver (Checks Cloud first, falls back to P2P)
    async function startSmartReceive(targetId) {
        showTransferScreen("Connecting...", `Searching for ${targetId}...`);

        try {
            const docRef = doc(db, "links", targetId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (Date.now() > data.expiresAt) {
                    showToast("This link has expired.", "error");
                    resetApp();
                    return;
                }
                await downloadCloudFile(data, targetId);
                return;
            }
        } catch(e) {
            console.error("Firebase lookup failed", e);
        }

        // If not in Firebase, fallback to P2P
        startP2PReceive(targetId);
    }

    async function downloadCloudFile(data, docId) {
        UI.progressArea.classList.remove('hidden');
        if(UI.progressText) UI.progressText.innerText = "Downloading from Cloud...";
        UI.fileName.innerText = data.name;
        UI.statusText.innerText = `Fetching...`;

        try {
            // Attempt to fetch as blob to show progress and allow immediate deletion
            const response = await fetch(data.url);
            if (!response.ok) throw new Error("CORS or Network Error");

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
                await deleteDoc(doc(db, "links", docId));
                await deleteObject(ref(storage, data.storagePath));
            }

            UI.progressArea.classList.add('hidden');
            UI.successArea.classList.remove('hidden');
            UI.successArea.classList.add('flex');
            UI.successText.innerText = "Received";
            UI.statusText.innerText = "Saved to Downloads! 📥";
            UI.resetBtn.innerText = "Start Over";
            showToast("Download Complete!", "success");

        } catch (error) {
            // Smart Fallback: If CORS blocks the progress bar, open directly in a new tab
            window.open(data.url, '_blank'); 

            if (data.isOneTime) {
                await deleteDoc(doc(db, "links", docId));
                await deleteObject(ref(storage, data.storagePath));
            }

            UI.progressArea.classList.add('hidden');
            UI.statusText.innerText = "Download opened in new tab.";
            UI.resetBtn.innerText = "Start Over";
        }
    }

    function startP2PReceive(targetId) {
        peer = new Peer({
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        connectionTimeout = setTimeout(() => {
            showToast("Connection timed out. Network is slow or room is invalid.", "error");
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
                    const chunkLength = chunkData.byteLength || chunkData.size || chunkData.length || 0;

                    receivedBuffer.push(chunkData);
                    bytesReceived += chunkLength;

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

                            UI.statusText.innerText = "Saved to Downloads! 📥";
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
                    showToast("Sender disconnected.", "error");
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
                case 'peer-unavailable': errMsg = "Invalid code or the sender left."; break;
                case 'network':
                case 'disconnected': errMsg = "Lost connection to the signaling server."; break;
                case 'webrtc': errMsg = "WebRTC error. Check your firewall/VPN."; break;
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

    function openModal() {
        UI.devModal.classList.remove('hidden');
        UI.devModal.classList.add('flex');
        setTimeout(() => {
            UI.devModal.classList.remove('opacity-0');
            UI.devModalCard.classList.remove('scale-95');
            UI.devModalCard.classList.add('scale-100');
        }, 10);
    }

    function closeModal() {
        UI.devModal.classList.add('opacity-0');
        UI.devModalCard.classList.remove('scale-100');
        UI.devModalCard.classList.add('scale-95');
        setTimeout(() => {
            UI.devModal.classList.add('hidden');
            UI.devModal.classList.remove('flex');
        }, 300);
    }

    UI.openModalBtn.addEventListener('click', openModal);
    UI.closeModalBtn.addEventListener('click', closeModal);

    UI.devModal.addEventListener('click', (e) => {
        if (e.target === UI.devModal) {
            closeModal();
        }
    });
});
