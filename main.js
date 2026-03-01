window.onerror = function(message, source, lineno) {
    console.error("System Error: " + message + " (Line " + lineno + ")");
    return true; 
};

document.addEventListener('DOMContentLoaded', () => {
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error("SW failed:", err));
    }

    const UI = {
        initial: document.getElementById('initial-state'),
        transfer: document.getElementById('transfer-state'),
        shareOptions: document.getElementById('share-options'),
        fileInput: document.getElementById('file-input'),
        receiveCodeInput: document.getElementById('receive-code-input'),
        receiveBtn: document.getElementById('receive-btn'),
        fileName: document.getElementById('file-name'),
        percentage: document.getElementById('percentage'),
        progressBar: document.getElementById('progress-bar'),
        statusText: document.getElementById('status-text'),
        qrContainer: document.getElementById('qr-container'),
        pairingCodeDisplay: document.getElementById('pairing-code-display'),
        copyLinkBtn: document.getElementById('copy-link-btn')
    };

    let peer = null;
    let currentConnection = null;
    let fileToSend = null;

    // Generate a clean 6-character code (e.g., "A7X9PQ")
    function generateShortCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // --- SENDER LOGIC ---
    UI.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileToSend = file;
        showTransferScreen(file.name, "Creating secure room...");

        const roomCode = generateShortCode();
        peer = new Peer(roomCode); // Using our custom 6-digit code as the Peer ID
        
        peer.on('open', (id) => {
            const cleanUrl = window.location.href.split('?')[0].split('#')[0];
            const transferUrl = `${cleanUrl}#${id}`;
            
            // Show QR Code
            UI.qrContainer.innerHTML = "";
            new QRCode(UI.qrContainer, { text: transferUrl, width: 160, height: 160, colorDark: "#020617" });
            
            // Show PIN Code
            UI.pairingCodeDisplay.innerText = id;
            UI.shareOptions.classList.remove('hidden');
            UI.statusText.innerText = "Waiting for receiver...";

            // Setup Copy Link button
            UI.copyLinkBtn.onclick = () => {
                navigator.clipboard.writeText(transferUrl);
                UI.copyLinkBtn.innerText = "Copied!";
                setTimeout(() => UI.copyLinkBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg> Copy Share Link`, 2000);
            };
        });

        peer.on('connection', (conn) => {
            currentConnection = conn;
            UI.shareOptions.classList.add('hidden');
            UI.statusText.innerText = "Device connected. Sending...";
            
            conn.on('open', () => streamFileToReceiver(conn, fileToSend));
        });
    });

    // Paced File Streaming to prevent WebRTC buffer overflow
    function streamFileToReceiver(conn, file) {
        const chunkSize = 64 * 1024; // 64KB chunks
        let offset = 0;

        conn.send({ type: 'metadata', name: file.name, size: file.size, fileType: file.type });

        const reader = new FileReader();
        reader.onload = (e) => {
            conn.send({ type: 'chunk', data: e.target.result });
            offset += e.target.result.byteLength;
            updateProgress(offset, file.size);

            if (offset < file.size) {
                // Slight delay allows the WebRTC buffer to breathe for massive files
                setTimeout(readNext, 5); 
            } else {
                UI.statusText.innerText = "Transfer Complete! ✅";
            }
        };

        const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        readNext();
    }

    // --- RECEIVER LOGIC (Manual Code Entry) ---
    UI.receiveBtn.addEventListener('click', () => {
        const targetId = UI.receiveCodeInput.value.trim().toUpperCase();
        if (targetId.length !== 6) {
            alert("Please enter a valid 6-character code.");
            return;
        }
        startReceiving(targetId);
    });

    // --- RECEIVER LOGIC (Link/QR Scan Entry) ---
    if (window.location.hash.length > 1) {
        const targetPeerId = window.location.hash.substring(1);
        startReceiving(targetPeerId);
    }

    function startReceiving(targetId) {
        showTransferScreen("Connecting...", "Looking for sender...");
        peer = new Peer();

        peer.on('open', () => {
            const conn = peer.connect(targetId, { reliable: true });
            let receivedBuffer = [];
            let fileMeta = null;
            let bytesReceived = 0;

            conn.on('open', () => {
                UI.statusText.innerText = "Connected. Waiting for file...";
            });

            conn.on('data', (payload) => {
                if (payload.type === 'metadata') {
                    fileMeta = payload;
                    UI.fileName.innerText = fileMeta.name;
                    UI.statusText.innerText = "Downloading...";
                } else if (payload.type === 'chunk') {
                    receivedBuffer.push(payload.data);
                    bytesReceived += payload.data.byteLength;
                    updateProgress(bytesReceived, fileMeta.size);

                    if (bytesReceived === fileMeta.size) {
                        saveFile(receivedBuffer, fileMeta);
                        UI.statusText.innerText = "Saved to Downloads! 📥";
                    }
                }
            });
            
            conn.on('error', () => {
                UI.statusText.innerText = "Connection lost.";
                alert("Sender disconnected or code is invalid.");
            });
        });
    }

    // --- UTILITIES ---
    function showTransferScreen(fileName, statusText) {
        UI.initial.classList.add('hidden');
        UI.transfer.classList.remove('hidden');
        UI.transfer.classList.add('flex');
        UI.fileName.innerText = fileName;
        UI.statusText.innerText = statusText;
    }

    function updateProgress(current, total) {
        const percent = Math.floor((current / total) * 100);
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
