import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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
const db = getFirestore(app);

// Export the database instance and the Firestore functions so other files can use them
export { db, doc, setDoc, getDoc, updateDoc, deleteDoc };
