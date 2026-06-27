# SmartShare

**SmartShare** is a fast, account-free file sharing web app with three dedicated sharing modes:

- **Direct (Device-to-Device)**: peer-to-peer transfer using **WebRTC (PeerJS)** — files don’t go to a server.
- **Link Share (Cloud Vault)**: upload files to the cloud securely and share a short code/link with **expiry timers** and **download limits**.
- **Live Clipboard**: instantly sync copied text, clickable links, and images between devices in real-time.

Live here:
- **Custom domain:** https://smartshare.alsagar.tech/
- **GitHub Pages:** https://23mh1a1202.github.io/smartshare/

---

## Features

### Direct Transfer (P2P)
- Device-to-device sharing using **PeerJS + WebRTC**
- Share via **code**, **QR**, or **link**
- **Auto-resume / reconnect** behavior on unstable connections (best-effort)

### Link Share (Cloud Vault)
- Files uploaded securely to **Cloudinary** (ensuring 100% free-tier operation)
- Link metadata and routing handled by **Firebase Firestore**
- Share with:
  - Expiration (10 minutes / 1 hour / 4 hours)
  - Download limit (unlimited / one-time)
  - Optional **custom code word**
- Built-in **Active Links Manager** (manage/delete/extend links)
- Smart file size limits (100MB for Video, 10MB for general files)

### Live Clipboard (Rich Text & Image Syncing)
- Real-time WebRTC connection for instant text and image sharing
- **Rich-Text Pad**: Supports drag-and-drop images, copy-pasting, and smart URL detection (auto-clickable links)
- **Image Controls**: Inline "Save to Device" and "Remove" options for shared images
- **One-Tap Copy**: Extract the synced clipboard directly to your system
- **Trusted Devices Ecosystem:** Includes a local device-trust layer allowing users to remember and authenticate specific local hardware profiles, facilitating fast, zero-friction pairing for recurring cross-device workflows.
- **Background Heartbeat**: Keeps the firewall connection alive indefinitely, preventing idle timeouts
- Instant disconnection detection and reporting

### Native OS Integration & UX
- **Native Android Sharing (PWA):** Leverages the **Web Share Target API**. When installed as a Progressive Web App, SmartShare registers as a system-level share target. Users can share photos, videos, or documents directly from their native Android Gallery, Camera, or File Manager straight into the application.
- **Quality-of-Life:** Drag & drop uploads, asynchronous multi-file bundling via **JSZip**, inline image controls ("Save to Device"), and a Light/Dark theme toggle.

### Quality-of-Life
- Drag & drop uploads
- Multi-file sending (zips using **JSZip**)
- QR generation (QRCode.js)
- Light/Dark theme toggle
- Mobile-friendly UI
- PWA manifest + service worker

---

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **UI:** TailwindCSS (CDN)
- **P2P Engine:** PeerJS (WebRTC)
- **Cloud Storage:** Cloudinary (Unsigned Uploads)
- **Cloud Database:** Firebase Firestore (Metadata only)
- **Utilities:** QRCode.js, JSZip
- **PWA:** `manifest.json`, service worker (`sw.js`)

---

## Project Structure

```text
.
├── index.html         # UI + layout
├── main.js            # App logic (P2P, Cloud Vault, Live Clipboard)
├── style.css          # Custom styles
├── manifest.json      # PWA manifest
├── sw.js              # Service worker
├── icon.svg
├── icon-192.png
├── icon-512.png
└── CNAME              # Custom domain for GitHub Pages
