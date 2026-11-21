// Firebase is bundled locally (see src/firebase.src.js) so the app boots offline and needs no gstatic CDN.
export { db, doc, setDoc, getDoc, updateDoc, deleteDoc } from './vendor/firebase-bundle.js';
