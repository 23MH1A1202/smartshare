const peer = new Peer();
let activeConn = null;

// UI Elements
const dropZone = document.getElementById('drop-zone');
const initialState = document.getElementById('initial-state');
const transferState = document.getElementById('transfer-state');
const progressBar = document.getElementById('progress-bar');
const percentageText = document.getElementById('percentage');
const statusText = document.getElementById('status-text');

// 1. Handle File Selection
document.getElementById('file-input').onchange = (e) => startSending(e.target.files[0]);

function startSending(file) {
    if (!file) return;
    
    initialState.classList.add('hidden');
    transferState.classList.remove('hidden');
    document.getElementById('file-name').innerText = file.name;
    
    peer.on('open', (id) => {
        // In a real app, generate a QR with: window.location.href + '#' + id
        console.log("My ID is: " + id);
        statusText.innerText = "Scanning for receiver...";
    });

    peer.on('connection', (conn) => {
        activeConn = conn;
        statusText.innerText = "Connected! Sending...";
        sendFile(file);
    });
}

// 2. High-Speed Chunked Transfer
function sendFile(file) {
    const chunkSize = 64 * 1024; // 64KB Chunks
    let offset = 0;

    const reader = new FileReader();
    reader.onload = (e) => {
        activeConn.send({
            data: e.target.result,
            name: file.name,
            size: file.size,
            type: file.type
        });
        
        offset += e.target.result.byteLength;
        const progress = Math.floor((offset / file.size) * 100);
        
        // Smooth UI Update
        progressBar.style.width = progress + "%";
        percentageText.innerText = progress + "%";

        if (offset < file.size) {
            readNext();
        } else {
            statusText.innerText = "Transfer Complete! ✅";
        }
    };

    const readNext = () => {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
    };

    readNext();
}

// 3. Handle Receiving (Auto-trigger if URL has hash)
if (window.location.hash) {
    const targetPeerId = window.location.hash.replace('#', '');
    const conn = peer.connect(targetPeerId);
    
    conn.on('open', () => {
        initialState.classList.add('hidden');
        transferState.classList.remove('hidden');
        statusText.innerText = "Receiving data...";
    });

    let receivedChunks = [];
    conn.on('data', (data) => {
        receivedChunks.push(data.data);
        // Progress logic would go here for receiver too
        
        if (receivedChunks.reduce((acc, c) => acc + c.byteLength, 0) >= data.size) {
            const blob = new Blob(receivedChunks, { type: data.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.name;
            a.click();
            statusText.innerText = "Saved to Downloads! 📥";
        }
    });
}
