# Free Downloader 🎬⚡

> **Free All-in-One Social Media Video & Audio Downloader**  
> High performance, privacy-first, zero ads, no signups, 100% free forever.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)
[![yt--dlp](https://img.shields.io/badge/yt--dlp-2026.10%2B-blue)](https://github.com/yt-dlp/yt-dlp)
[![ffmpeg](https://img.shields.io/badge/ffmpeg-static-orange)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Highlights & Features

- **All Major Platforms Supported**: YouTube (Videos, Shorts, Playlists), TikTok (No-Watermark when available), Instagram (Reels, Posts), Facebook, Twitter/X, Dailymotion, Threads, Reddit (audio & video merged), Pinterest, Vimeo, Twitch Clips, SoundCloud, Bilibili, and 1000+ sites supported by `yt-dlp`.
- **Search or URL**: Paste any direct media URL or type plain keywords (e.g. `funny cats`) to browse YouTube search cards.
- **Ultra HD & 4K Video**: Download 4K (2160p), 1440p (2K), 1080p Full HD, 720p HD, 480p, 360p, 240p, and 144p resolutions in MP4 and WebM with audio always merged.
- **Audio Extraction**: Studio quality MP3 (320kbps, 256kbps, 192kbps, 128kbps), M4A, OPUS, WAV, and FLAC.
- **Extras & Playlists**: Download high-resolution thumbnails (JPG), captions/subtitles (SRT/VTT), descriptions (.txt), and entire playlists as a ZIP archive.
- **High-Speed Streaming Pipeline**: Multi-threaded fragment downloading (`--concurrent-fragments 16`, `--http-chunk-size 10M`, `--buffer-size 64K`), bypasses compression for binary media, and streams with 1MB highWaterMark backpressure.
- **Native File Picker (Step C)**: Uses the modern **File System Access API** (`window.showSaveFilePicker`) to let users pick their target folder before downloading, streaming directly with `createWritable()` so huge files never overwhelm browser memory.
- **Rich Live Progress UI**: Server-Sent Events (SSE) and client-stream tracking displaying smooth percentages, downloaded / total bytes (e.g. `45.2 MB / 120 MB`), live speed (e.g. `3.4 MB/s`), remaining ETA, two-phase stage badges ("Step 1/2: Preparing video on server", "Step 2/2: Saving to device"), and dynamic browser title percentage (e.g. `(45%) Free Downloader`).
- **Download History**: Stores last 50 downloads in local browser storage (`localStorage`) with re-download and clear buttons.
- **Expanded Multi-Language (i18n)**: English, Urdu (اردو with automated RTL layout), Hindi (हिन्दी), Arabic (العربية with automated RTL layout), Spanish (Español), and French (Français) via a clean glass globe popover.
- **Modern UI & Visual Overhaul**: Animated aurora mesh hero with floating orbs, glassmorphism input bar, interactive platform chip navigation, 5 Simple Steps visual timeline with CSS browser mockups, and 8 Reasons feature grid.
- **Appearance**: VidsSave-inspired dark theme with light mode toggle, glassmorphism UI, smooth animations, and responsive layout from 320px mobile to 4K desktop.
- **Zero Vulnerabilities**: SSRF protection (private IP / localhost blocking), parameter array spawning (command injection proof), rate limiting, Helmet CSP headers, and gzip compression.

---

## 📁 Project Structure

```text
free-downloader/
├── bin/                          # Auto-downloaded yt-dlp binary (yt-dlp.exe / yt-dlp)
├── scripts/
│   ├── install-ytdlp.js          # Auto-installer for cross-platform yt-dlp
│   └── update-ytdlp.js           # CLI updater script
├── src/
│   ├── config/
│   │   └── constants.js          # Platforms regex, resolution presets, limits
│   ├── controllers/
│   │   ├── infoController.js     # POST /api/info, GET /api/search
│   │   ├── downloadController.js # GET /api/download, SSE /api/progress/:jobId, ZIP
│   │   └── healthController.js   # GET /api/health
│   ├── middleware/
│   │   ├── errorHandler.js       # User-friendly error message normalizer
│   │   ├── rateLimiter.js        # DDoS & rate limiting
│   │   └── security.js           # SSRF protection & safe Unicode filename sanitizer
│   ├── routes/
│   │   └── api.js                # Central API router
│   ├── services/
│   │   ├── jobManager.js         # Concurrent job queue & SSE broadcaster
│   │   ├── updaterService.js     # Automatic daily yt-dlp update checker
│   │   └── ytdlpService.js       # yt-dlp & ffmpeg process orchestrator
│   └── server.js                 # Express application & graceful shutdown
├── public/
│   ├── css/
│   │   └── style.css             # Glassmorphism, dark/light themes, RTL support
│   ├── js/
│   │   ├── translations.js       # English, Urdu, Hindi dictionaries
│   │   ├── api.js                # Fetch wrapper for API
│   │   ├── fileSaver.js          # File System Access API & streaming writable
│   │   ├── history.js            # LocalStorage 50-item manager
│   │   ├── downloadManager.js    # Queue & SSE state tracker
│   │   └── app.js                # Master frontend controller & UI bindings
│   ├── favicon.svg               # SVG logo icon
│   ├── manifest.webmanifest      # PWA metadata
│   ├── robots.txt                # Search crawler rules
│   ├── sitemap.xml               # SEO sitemap
│   └── index.html                # Semantic, accessible HTML5 layout
├── temp/                         # Temporary video processing buffer
├── .env.example                  # Environment configuration template
├── Dockerfile                    # Container definition
├── package.json
└── README.md
```

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Install Dependencies
```bash
npm install
```
*(The postinstall script will automatically detect your OS and download the latest working `yt-dlp` binary into the `bin/` directory).*

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
```

### 3. Start the Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔄 How to Update yt-dlp

Social media platforms frequently change their video player formats. Free Downloader includes two automated ways to keep yt-dlp up to date:

1. **Automatic Daily Check**: The server runs an automatic update check every 24 hours in the background.
2. **Manual Command**: Run the update script at any time:
   ```bash
   npm run update-ytdlp
   ```

---

## 🌐 Deploy to Free Hosting Services

### Option A: Render (Docker)
1. Fork or push this repository to GitHub.
2. Log into [Render.com](https://render.com) and click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Select **Docker** as the Runtime environment.
5. In **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
6. Click **Create Web Service**. Render will build the container, install ffmpeg and yt-dlp, and deploy your live URL.

### Option B: Railway
1. Open [Railway.app](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo**.
3. Railway automatically detects the `Dockerfile`.
4. Add the environment variable `PORT=3000`.
5. Railway provides an HTTPS domain immediately.

### Option C: VPS (Ubuntu / Debian)
```bash
# 1. Clone repository
git clone https://github.com/your-username/free-downloader.git
cd free-downloader

# 2. Install dependencies & build
npm install --omit=dev

# 3. Run with PM2 for background process persistence
npm install -g pm2
pm2 start src/server.js --name "free-downloader"
pm2 save
pm2 startup
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/info` | `POST` | Fetches metadata, formats, and available resolutions for any URL or search keyword. |
| `/api/search` | `GET` | Searches YouTube with `?q=query` and returns 10 clickable video cards. |
| `/api/download` | `GET` | Streams media chunks (`?url=&type=&quality=&format=&filename=`). |
| `/api/progress/:jobId` | `GET` | Server-Sent Events (SSE) stream delivering real-time download and merge percentages. |
| `/api/cancel/:jobId` | `POST` | Terminates active child processes and cleans up disk cache. |
| `/api/download-playlist-zip` | `POST` | Downloads selected playlist items and streams an uncompressed/compressed ZIP archive. |
| `/api/health` | `GET` | Returns status of `yt-dlp` and `ffmpeg` engine binaries. |

---

## 🛡️ Security & Privacy Notice

- **SSRF Hardening**: Rejects loopback (`127.0.0.1`, `localhost`), private LAN CIDRs (`192.168.x`, `10.x`, `172.16-31.x`), and link-local ranges.
- **Safe Process Invocation**: Uses Node `child_process.spawn` with argument arrays to prevent shell interpolation.
- **Zero Storage**: Media files are processed in ephemeral buffers and unlinked immediately after streaming.
- **No Personal Data**: History and preferences are stored client-side in the user's browser `localStorage`.

---

## ⚖️ Legal Disclaimer

Free Downloader is intended strictly for personal and fair-use downloading of content that users own or have explicit permission from copyright owners to download. This service does not host or index copyrighted media.

---

**All rights reserved © Shaffat Rasool Pro**
