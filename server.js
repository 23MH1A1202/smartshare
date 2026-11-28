import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.get('/__firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBXBbEt_OEwOuHtiM3ERDcLwUZpXyNVtzM",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "login-59720.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "login-59720",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "login-59720.firebasestorage.app",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "598332882697",
        appId: process.env.FIREBASE_APP_ID || "1:598332882697:web:6f675adebeb816e64dddd8",
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-36F4WTT681"
    });
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
