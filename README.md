# SmartShare

**SmartShare** is a blazing-fast, account-free file sharing web app providing three dedicated sharing modes to suit any workflow:
- **Direct (Device-to-Device)**: Peer-to-peer file transfer using **WebRTC (PeerJS)** — files travel directly between devices, bypassing servers entirely.
- **Link Share (Cloud Vault)**: Upload files to the cloud securely and share a short code or link with **custom expiry timers**, **download limits**, and link extension capabilities.
- **Live Clipboard**: Instantly sync copied text, clickable links, and images between your devices in real-time.

**Live here:**
- **Custom domain:** https://smartshare.alsagar.tech/
- **GitHub Pages:** https://23mh1a1202.github.io/smartshare/

---

## Features

### Direct Transfer (P2P)
- Device-to-device sharing using **PeerJS + WebRTC**.
- Share via **6-digit code**, **QR code**, or **direct URL link**.
- **Auto-resume / reconnect** behavior on unstable connections (best-effort).

### Link Share (Cloud Vault)
- Files are uploaded securely to **Cloudinary** for fast and efficient delivery.
- Link metadata and routing handled securely by **Firebase Firestore**.
- **Advanced Sharing Controls:**
  - Configurable expiration (10 minutes, 1 hour, or 4 hours).
  - Download limit restrictions (unlimited or one-time).
  - Optional **custom code word** (e.g., `apple`).
- **Active Links Manager:** View and manage your active cloud links, manually delete them, or **dynamically extend link expiry times** on the fly.
- Smart file size limits (100MB for Video, 10MB for general files).

### Live Clipboard & Trusted Devices
- Real-time WebRTC connection for instant rich-text and image sharing.
- **Rich-Text Pad**: Supports drag-and-drop images, copy-pasting, and smart URL detection (auto-clickable links).
- **Advanced Trusted Devices Ecosystem:**
  - A local device-trust layer allowing you to remember specific hardware profiles for zero-friction, instant pairing.
  - **Custom Device Naming**: Easily rename trusted devices. Names automatically sync across your connected devices.
  - **Synchronized Deletions**: Removing a trusted device sends a silent background ping to the target device, ensuring your hardware profiles stay synchronized.
- **Background Heartbeat**: Keeps the firewall connection alive indefinitely, preventing idle timeouts.

### Native OS Integration & UX
- **Native Android Sharing (PWA):** Leverages the **Web Share Target API**. When installed as a Progressive Web App, SmartShare registers as a system-level share target. Users can share photos, videos, or documents directly from their native OS Gallery or File Manager straight into the application.
- **Streamlined PWA Installation**: Prompts native OS installation seamlessly from the navigation menu.
- **Performance Optimized**: Carefully deferred script loading logic ensures instantaneous initial frame renders, even on older devices and low-bandwidth connections.

### Quality-of-Life & Customization
- **Admin Style Customizer (Live Theme Editor):** A fully integrated, real-time theme customizer. Allows administrative tweaking of panel opacity, blur levels, base background colors (light & dark modes), and custom accent hues. Settings are persisted to Firestore to synchronize the experience globally.
- **Drag & drop uploads** with seamless multi-file bundling (creates zips instantly via **JSZip**).
- QR code generation via **QRCode.js**.
- Light/Dark theme toggle.

---

## Tech Stack
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **UI & Styling:** TailwindCSS (via CDN)
- **P2P Engine:** PeerJS (WebRTC)
- **Cloud Storage:** Cloudinary (Unsigned Uploads)
- **Cloud Database:** Firebase Firestore (Metadata & Admin Styles)
- **Utilities:** QRCode.js, JSZip, DOMPurify
- **PWA:** `manifest.json`, service worker (`sw.js`)

---

## Project Structure
```text
.
├── index.html         # UI + layout structure
├── main.js            # Core App logic (P2P, Cloud Vault, Live Clipboard)
├── ui.js              # UI state and DOM element management
├── customizer.js      # Admin style and live theme customizer logic
├── firebase.js        # Firebase configuration and initialization
├── style.css          # Custom animations and CSS overrides
├── manifest.json      # PWA manifest (installation & Share Target config)
├── sw.js              # Service worker
└── ...assets
```
