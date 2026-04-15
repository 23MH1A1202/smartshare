# SmartShare

**SmartShare** is a fast, account-free file sharing web app with two sharing modes:

- **Direct (Device-to-Device)**: peer-to-peer transfer using **WebRTC (PeerJS)** — files don’t go to a server.
- **Link Share (Cloud Vault)**: upload files to the cloud and share a short code/link with **expiry** and **download limits**.

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
- Upload to **Firebase Storage**
- Link metadata stored in **Firebase Firestore**
- Share with:
  - Expiration (10 minutes / 1 hour / 4 hours)
  - Download limit (unlimited / one-time)
  - Optional **custom code word**
- Built-in **Active Links Manager** (manage/delete/extend links)

### Quality-of-life
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
- **P2P:** PeerJS (WebRTC)
- **Cloud Mode:** Firebase (Firestore + Storage)
- **Utilities:** QRCode.js, JSZip
- **PWA:** `manifest.json`, service worker (`sw.js`)

---

## Project Structure

```text
.
├── index.html         # UI + layout
├── main.js            # App logic (P2P + Cloud Vault)
├── style.css          # Custom styles
├── manifest.json      # PWA manifest
├── sw.js              # Service worker
├── icon.svg
├── icon-192.png
├── icon-512.png
└── CNAME              # Custom domain for GitHub Pages
```
## How to Use

### 1) Direct Mode (Device-to-Device)
1. Select **Direct (Device to Device)**
2. Add one or more files
3. Click **Send Files**
4. Share the generated **code / QR / link**
5. Receiver enters the code (or opens the link) to download

### 2) Link Share Mode (Cloud Vault)
1. Select **Link Share (Cloud Vault)**
2. Choose expiry + download limit (optional custom code word)
3. Click **Upload Files**
4. Share the generated link/code
5. Receiver downloads using that code/link


---

## Security Notes (Important)

- **Direct Mode:** files are not stored online; transfer is peer-to-peer.
- **Cloud Mode:** files are stored in Firebase Storage and referenced by a short code in Firestore.
- If you deploy publicly, review:
  - Firestore rules (who can read link documents)
  - Storage rules (who can download files)
  - Abuse prevention (rate limits / cleanup policies)

---

## Roadmap (Ideas)

- Password-protected Cloud Vault links
- End-to-end encryption for Cloud Mode
- Better ETA + speed graphs
- Folder upload support (where available)
- Improved multi-file receive experience

---


## Author

Developed by **Ambati Lalitha Sagar**  
Roll No: **23MH1A1202**  
Email: `alalithasagar355@gmail.com`
