// Mobile Error Catcher
window.onerror = function(message, source, lineno) {
    alert("System Error: " + message + " (Line " + lineno + ")");
    return true; 
};

document.addEventListener('DOMContentLoaded', () => {
    
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error("SW failed:", err));
    }

    const UI = {
        initial: document.getElementById('initial-state'),
        transfer: document.getElementById('transfer-state'),
        fileInput: document.getElementById('file-input'),
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

    // --- File Selection Logic ---
    UI.fileInput.addEventListener('change', (e) => {
        try {
            const file = e.target.files[0];
            if (!file) return;

            fileToSend = file;
            
            // Switch UI immediately
            UI.initial.classList.add('hidden');
            UI.transfer.classList.remove('hidden');
            UI.transfer.classList.add('flex'); // Ensure it respects tailwind flex
            UI.fileName.innerText = file.name;
            UI.statusText.innerText = "Connecting to network...";

            if (!peer) {
                peer = new Peer(); 
                setupPeerListenersForSender();
            }

            e.target.value = ''; // Reset input
        } catch (error) {
            alert("Action Failed: " + error.message);
        }
    });

    // --- Sender Logic ---
    function setupPeerListenersForSender() {
        peer.on('open', (id) => {
            // Bulletproof clean URL generation
            const cleanUrl = window.location.href.split('?')[0].split('#')[0];
            const transferUrl = `${cleanUrl}#${id}`;
            
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
        const chunkSize = 64 * 1024; // 64KB
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
    if (window.location.hash.length > 1) {
        const targetPeerId = window.location.hash.substring(1);
        
        UI.initial.classList.add('hidden');
        UI.transfer.classList.remove('hidden');
        UI.transfer.classList.add('flex');
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

    // --- UI Helpers ---
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
