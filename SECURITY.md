# Security Policy & Architecture Specification — Free Downloader

This document provides an overview of the security measures, input validations, and mitigation strategies implemented in **Free Downloader**.

---

## 1. Threat Model & Mitigations

### 1.1 Server-Side Request Forgery (SSRF) Protection
All incoming URLs supplied to `/api/info`, `/api/download`, `/api/search`, and `/api/download-playlist-zip` are validated through `src/middleware/security.js`:
- **Protocol Enforcement**: Only `http:` and `https:` protocols are accepted. Any attempt to use `file:`, `gopher:`, `ftp:`, or custom schemes is rejected immediately with HTTP 400.
- **Loopback & Localhost Blocked**: Requests to `localhost`, `127.0.0.1`, `127.x.x.x`, `0.0.0.0`, and IPv6 loopback (`::1`) are blocked.
- **Private Subnets Blocked**: RFC 1918 address ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and carrier-grade NAT (`100.64.0.0/10`) are blocked.
- **Cloud Metadata Services Blocked**: Link-local address `169.254.169.254` (AWS/Azure/GCP metadata service) and `metadata.google.internal` are explicitly blocked to prevent token exfiltration.

### 1.2 Command Injection Protection
- **No Shell Execution**: The application avoids `child_process.exec()` or shell interpretation (`shell: true`).
- **Array-Only Argument Spawning**: All interactions with external binaries (`yt-dlp` and `ffmpeg`) use `child_process.spawn(binary, argsArray, { windowsHide: true })`. Arguments are passed as individual elements of an array, completely neutralizing shell metacharacter injection (`|`, `;`, `&`, `$`, `` ` ``, `>`, `<`).
- **Timeout Watchdog**: All metadata queries run with a 60-second execution timeout. If a query hangs, the process tree is killed automatically.

### 1.3 Path Traversal & Filename Sanitization
- **Strict Character Filtering**: Filenames passed via query parameters or extracted from media titles are sanitized using `sanitizeFilename()`. Path traversal sequences (`../`, `..\`), slashes (`/`, `\`), null bytes (`\0`), and control characters are stripped.
- **Windows Reserved Names**: Protected against reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
- **RFC 5987 / RFC 6266 Compliance**: Downloads send standardized `Content-Disposition: attachment; filename="..."; filename*=UTF-8''...` headers to ensure safe file naming across all operating systems.

### 1.4 Denial-of-Service & Resource Exhaustion Defense
- **Adaptive Rate Limiting**: `express-rate-limit` protects sensitive metadata endpoints (`/api/info` capped at 120 requests/min).
- **Socket & Stream Cleanup**:
  - SSE connections are kept alive with a 15-second heartbeat and cleanly terminated with `res.end()` once a job reaches a terminal state (`Completed`, `Failed`, or `Cancelled`).
  - Child processes are automatically terminated on client disconnection (`req.on('close')`).
  - If a download job stalls for >60 seconds without bytes received, the watchdog terminates the process and releases system resources.
- **Storage Lifecycle & Orphan Cleaning**: Temporary files are tracked in `src/services/jobManager.js` and deleted automatically upon download completion or abort. A startup cleaner and an hourly cron cleaner purge any orphaned `.part` or media files older than 60 minutes.

### 1.5 Cross-Site Scripting (XSS) Prevention
- **Helmet Security Headers**: Strict Content Security Policy (CSP), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `X-XSS-Protection` headers are applied via Helmet middleware.
- **Frontend HTML Escaping**: All user-supplied queries, titles, descriptions, and metadata strings are sanitized via `escapeHtml()` before rendering into the DOM.

---

## 2. Health Monitoring & Observability
System administrators can verify application health at any time:
- **Endpoint**: `GET /api/health`
- **Response**: JSON payload containing `uptime`, `memory`, `tempDirectory`, `storage`, `ytdlp` version, and `ffmpeg` binary availability.

---

## 3. Reporting a Vulnerability
If you discover a security vulnerability in Free Downloader, please report it responsibly:
- Email: security@free-downloader.local
- Response time: within 24 hours
