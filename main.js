// 1. MOBILE ERROR CATCHER (Pops up an alert on your phone if JS crashes)
window.onerror = function(message, source, lineno, colno, error) {
    alert("System Error: " + message + " (Line " + lineno + ")");
    return true; 
};

// 2. Wait for the screen to fully load before attaching buttons
document.addEventListener('DOMContentLoaded', () => {
    
    // Check for Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error("SW failed:", err));
    }

    const UI = {
        dropZone: document.getElementById('drop-zone'),
        initial: document.getElementById('initial-state'),
        transfer: document.getElementById('transfer-state'),
        fileInput: document.getElementById('file-input'),
        selectBtn: document.getElementById('select-btn'),
        fileName: document.getElementById('file-name'),
        percentage: document.getElementById('percentage'),
        progressBar: document.getElementById('progress-bar'),
        statusText: document.getElementById('status-text'),
        qrWrapper: document.getElementById('qr-wrapper'),
        qrContainer: document.getElementById('qr-container')
    };

    let peer = null;
    let connection = null;
    let fileToSend = null;

    // 3. ATTACH THE BUTTON (This will now work instantly)
    

    UI.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            prepareSender(e.target.files[0]);
        }
    });

    // --- Sender Logic ---
    function prepareSender(file) {
        fileToSend = file;
        
        UI.initial.classList.add('hidden');
        UI.transfer.classList.remove('hidden');
        UI.fileName.innerText = file.name;
        UI.statusText.innerText = "Connecting to network...";

        // Initialize network ONLY after file is picked
        if (!peer) {
            peer = new Peer(); 
            setupPeerListenersForSender();
        }
    }

    function setupPeerListenersForSender() {
        peer.on('open', (id) => {
            // Build the URL based on your GitHub pages link
            const transferUrl = `${window.location.origin}${window.location.pathname}#${id}`;
            
            UI.qrContainer.innerHTML = "";
            new QRCode(UI.qrContainer, { text: transferUrl, width: 200, height: 200, colorDark: "#020617" });
            UI.qrWrapper.classList.remove('hidden');
            UI.statusText.innerText = "Scan QR Code to receive";
        });

        peer.on('connection', (conn) => {
            connection = conn;
            UI.qrWrapper.classList.add('hidden');
            UI.statusText.innerText = "Device connected. Sending...";
            
            conn.on('open', () => streamFileToReceiver(conn, fileToSend));
        });
        
        peer.on('error', (err) => {
            alert("Network Error: " + err.type);
            UI.statusText.innerText = "Connection failed.";
        });
    }

    function streamFileToReceiver(conn, file) {
        const chunkSize = 64 * 1024; 
        let offset = 0;

        conn.send({ type: 'metadata', name: file.name, size: file.size, fileType: file.type });

        const reader = new FileReader();
        reader.onload = (e) => {
            conn.send({ type: 'chunk', data: e.target.result });
            offset += e.target.result.byteLength;
            updateProgress(offset, file.size);

            if (offset < file.size) {
                readNext(); 
            } else {
                UI.statusText.innerText = "Transfer Complete! ✅";
            }
        };

        const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        readNext();
    }

    // --- Receiver Logic ---
    // Auto-trigger if someone opens the link with a QR code hash
    if (window.location.hash.length > 1) {
        const targetPeerId = window.location.hash.substring(1);
        
        UI.initial.classList.add('hidden');
        UI.transfer.classList.remove('hidden');
        UI.statusText.innerText = "Connecting to sender...";

        peer = new Peer();

        peer.on('open', () => {
            const conn = peer.connect(targetPeerId, { reliable: true });
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
        });
        
        peer.on('error', (err) => alert("Receiver Error: " + err.type));
    }

    // --- Helpers ---
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
