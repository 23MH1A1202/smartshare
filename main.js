window.onerror = function(message) {
    showToast("System Error: " + message, "error");
    return true; 
};

document.addEventListener('DOMContentLoaded', () => {
    
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
        qrContainer: document.getElementById('qr-container'),
        pairingCodeDisplay: document.getElementById('pairing-code-display'),
        copyLinkBtn: document.getElementById('copy-link-btn'),
        toastContainer: document.getElementById('toast-container'),
        dropZone: document.getElementById('drop-zone') // Added Drop Zone
    };

    let peer = null;
    let currentConnection = null;
    let fileToSend = null;
    let connectionTimeout = null;
    let isTransferring = false;

    // --- TOAST NOTIFICATION SYSTEM ---
    function showToast(message, type = "info") {
        const toast = document.createElement('div');
        const isError = type === "error";
        
        toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
            isError ? 'bg-red-950/90 border-red-500/30 text-red-200' : 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
        } backdrop-blur-md pointer-events-auto z-50`;
        
        const icon = isError 
            ? `<svg class="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
            : `<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;

        toast.innerHTML = `${icon} <span class="text-sm font-medium">${message}</span>`;
        UI.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.replace('toast-enter', 'toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function resetApp() {
        try {
            if (currentConnection) currentConnection.close();
            if (peer) peer.destroy();
        } catch (e) { console.error(e); }
        
        clearTimeout(connectionTimeout);
        peer = null; currentConnection = null; fileToSend = null; isTransferring = false;
        
        UI.fileInput.value = '';
        UI.receiveCodeInput.value = '';
        
        if (window.location.hash) {
            window.history.replaceState(null, null, window.location.pathname);
        }
        
        UI.transfer.classList.add('hidden');
        UI.transfer.classList.remove('flex');
        UI.initial.classList.remove('hidden');
        UI.initial.classList.add('flex');
        
        UI.progressArea.classList.add('hidden');
        UI.shareOptions.classList.add('hidden');
        updateProgress(0, 100);
        
        UI.resetBtn.innerText = "Cancel";
        UI.fileName.innerText = "Waiting...";
        UI.statusText.innerText = "Initializing connection";
    }

    UI.resetBtn.addEventListener('click', resetApp);

    function generateShortCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // --- 🌟 CORE SENDING FUNCTION ---
    function startSendingFile(file) {
        if (!file) return;

        fileToSend = file;
        showTransferScreen(file.name, "Creating secure room...");

        const roomCode = generateShortCode();
        peer = new Peer(roomCode); 
        
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
                isTransferring = false;
                UI.statusText.innerText = "Sent Successfully! ✅";
                UI.resetBtn.innerText = "Start Over";
                showToast("File sent successfully!", "success");
            }
        };

        const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        readNext();
    }


    // --- 🌟 1. STANDARD CLICK TO SELECT ---
    UI.fileInput.addEventListener('change', (e) => startSendingFile(e.target.files[0]));

    // --- 🌟 2. PC DRAG AND DROP ---
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
            startSendingFile(e.dataTransfer.files[0]);
        }
    });

    // --- 🌟 3. MOBILE NATIVE "SHARE TO" HANDLER ---
    if (window.location.search.includes('shared=true')) {
        // Clean the URL immediately
        window.history.replaceState(null, null, window.location.pathname);
        showTransferScreen("Processing...", "Loading shared file...");

        // Dig into the cache to retrieve the file the Service Worker caught
        caches.open('shared-file-cache').then(cache => {
            cache.match('/shared-file').then(response => {
                if (response) {
                    const fileName = decodeURIComponent(response.headers.get('X-File-Name') || 'shared_file');
                    const fileType = response.headers.get('Content-Type') || '';

                    response.blob().then(blob => {
                        const file = new File([blob], fileName, { type: fileType });
                        startSendingFile(file);
                        cache.delete('/shared-file'); // Delete from cache to save space
                    });
                } else {
                    resetApp();
                    showToast("Failed to load shared file.", "error");
                }
            });
        });
    }

    // --- RECEIVER LOGIC ---
    UI.receiveBtn.addEventListener('click', () => {
        const targetId = UI.receiveCodeInput.value.trim().toUpperCase();
        if (targetId.length !== 6) {
            showToast("Enter a valid 6-character code.", "error");
            return;
        }
        startReceiving(targetId);
    });

    if (window.location.hash.length > 1) {
        const targetPeerId = window.location.hash.substring(1).toUpperCase();
        startReceiving(targetPeerId);
    }

    function startReceiving(targetId) {
        showTransferScreen("Connecting...", `Looking for room ${targetId}...`);
        peer = new Peer();

        connectionTimeout = setTimeout(() => {
            showToast("Connection timed out. Check the code and try again.", "error");
            resetApp();
        }, 15000);

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

    // --- UTILITIES & ERROR HANDLING ---
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
});
