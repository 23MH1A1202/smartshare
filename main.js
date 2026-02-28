// --- 1. Service Worker Registration (For PWA Installability) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error("SW failed:", err));
}

// --- 2. State & DOM Elements ---  
const peer = new Peer(); // Initialize WebRTC via PeerJS
let connection = null;
let fileToSend = null;

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

// --- 3. Drag & Drop + File Selection ---
UI.selectBtn.addEventListener('click', () => UI.fileInput.click());
UI.fileInput.addEventListener('change', (e) => prepareSender(e.target.files[0]));

UI.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    UI.dropZone.classList.add('drop-active');
});
UI.dropZone.addEventListener('dragleave', () => UI.dropZone.classList.remove('drop-active'));
UI.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    UI.dropZone.classList.remove('drop-active');
    if (e.dataTransfer.files.length) prepareSender(e.dataTransfer.files[0]);
});

// --- 4. Sender Logic ---
function prepareSender(file) {
    if (!file) return;
    fileToSend = file;
    
    // Update UI
    UI.initial.classList.add('hidden');
    UI.transfer.classList.remove('hidden');
    UI.fileName.innerText = file.name;
    UI.statusText.innerText = "Generating connection...";

    peer.on('open', (id) => {
        const transferUrl = `${window.location.origin}${window.location.pathname}#${id}`;
        
        // Generate QR Code
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
}

function streamFileToReceiver(conn, file) {
    const chunkSize = 64 * 1024; // 64KB chunks for stability/speed
    let offset = 0;

    // Send Metadata first
    conn.send({ type: 'metadata', name: file.name, size: file.size, fileType: file.type });

    const reader = new FileReader();
    reader.onload = (e) => {
        conn.send({ type: 'chunk', data: e.target.result });
        offset += e.target.result.byteLength;
        
        updateProgress(offset, file.size);

        if (offset < file.size) {
            readNext(); // Recursively read next chunk to avoid RAM overload
        } else {
            UI.statusText.innerText = "Transfer Complete! ✅";
        }
    };

    const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
    readNext();
}

// --- 5. Receiver Logic ---
// If a user opens the app with a hash in the URL (e.g., #peer-id)
window.addEventListener('DOMContentLoaded', () => {
    const targetPeerId = window.location.hash.substring(1);
    
    if (targetPeerId) {
        UI.initial.classList.add('hidden');
        UI.transfer.classList.remove('hidden');
        UI.statusText.innerText = "Connecting to sender...";

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

                    // If file is fully received
                    if (bytesReceived === fileMeta.size) {
                        saveFile(receivedBuffer, fileMeta);
                        UI.statusText.innerText = "File saved to Downloads! 📥";
                    }
                }
            });
        });
    }
});

// --- 6. Helpers ---
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
    URL.revokeObjectURL(url); // Clean up memory
}
