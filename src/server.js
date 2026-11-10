/**
 * src/server.js
 * Main entry point for Free Downloader web application.
 * Configures middleware, static file serving, API routes, security headers, process safety nets,
 * automated temp cleanup, and graceful shutdown.
 */

// Global process error handlers to prevent unexpected server terminations
process.on('uncaughtException', (err) => {
  console.error('[Safety Net] Uncaught Exception:', err.message || err);
  if (err.stack) console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Safety Net] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const apiRoutes = require('./routes/api');
const { errorHandler } = require('./middleware/errorHandler');
const updaterService = require('./services/updaterService');
const ytdlpService = require('./services/ytdlpService');
const { verifyBinary, getPlatformConfig, downloadBinary, BIN_DIR } = require('../scripts/install-ytdlp');
const { TEMP_DIR } = require('./config/constants');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// 1. Security Headers with relaxed Content Security Policy for external media embeds
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        connectSrc: ["'self'", 'blob:']
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// 2. CORS - Allow all origins for LAN / mobile / local development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization']
}));

// 3. Compression - strictly EXCLUDE streaming media and Server-Sent Events
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/api/download') || req.path.startsWith('/api/progress')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// 4. Body Parsing Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 5. Serve Public Static Assets
const PUBLIC_DIR = path.resolve(__dirname, '../public');
app.use(express.static(PUBLIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// 6. Mount API Endpoints (Notice: NO general limiter blocking downloads)
app.use('/api', apiRoutes);

// 7. Fallback route for SPA / platform direct navigation
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// 8. Central Error Handler
app.use(errorHandler);

// Automated cleanup of orphaned temporary files older than 1 hour
function cleanOrphanedTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    let cleaned = 0;

    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > oneHourMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (e) {
        // Ignored if busy
      }
    }
    if (cleaned > 0) {
      console.log(`[Temp Cleaner] Removed ${cleaned} expired temporary file(s).`);
    }
  } catch (err) {
    console.warn('[Temp Cleaner] Cleanup error:', err.message);
  }
}

// Ensure yt-dlp binary is ready before accepting traffic
async function ensureEngine() {
  const { filename, url } = getPlatformConfig();
  const binPath = path.join(BIN_DIR, filename);

  if (!verifyBinary(binPath)) {
    console.log('[Startup] yt-dlp binary missing or invalid. Downloading now...');
    try {
      await downloadBinary(url, binPath);
    } catch (err) {
      console.error('[Startup Warning] Could not download yt-dlp binary on startup:', err.message);
    }
  } else {
    console.log('[Startup] yt-dlp binary verified and ready.');
  }

  const ffmpeg = ytdlpService.getFfmpegPath();
  console.log(`[Startup] ffmpeg location: ${ffmpeg}`);

  // Run initial cleanup of orphaned temp files
  cleanOrphanedTempFiles();
  // Schedule hourly temp file cleanup
  setInterval(cleanOrphanedTempFiles, 60 * 60 * 1000);
}

let server;

async function startServer() {
  await ensureEngine();

  server = app.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(` Free Downloader is running successfully!`);
    console.log(` Local URL:    http://localhost:${PORT}`);
    console.log(` Network URL:  http://${HOST}:${PORT}`);
    console.log(` Environment:  ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================================`);

    // Start background yt-dlp daily updater
    updaterService.start();
  });
}

// Graceful Shutdown handling
function handleShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Closing HTTP server gracefully...`);
  updaterService.stop();

  if (server) {
    server.close(() => {
      console.log('[Shutdown] HTTP server closed. Process exiting.');
      process.exit(0);
    });

    // Force exit if hanging after 8 seconds
    setTimeout(() => {
      console.error('[Shutdown] Forcefully exiting after timeout.');
      process.exit(1);
    }, 8000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

if (require.main === module) {
  startServer().catch(err => {
    console.error('[Fatal Error] Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
