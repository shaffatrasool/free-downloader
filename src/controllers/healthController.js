/**
 * src/controllers/healthController.js
 * Provides system diagnostics and status verification for yt-dlp and ffmpeg.
 */

const { spawnSync } = require('child_process');
const ytdlpService = require('../services/ytdlpService');
const { APP_NAME, APP_VERSION } = require('../config/constants');

function getHealth(req, res) {
  const ytdlpPath = ytdlpService.getYtdlpPath();
  const ffmpegPath = ytdlpService.getFfmpegPath();

  let ytdlpVersion = 'unknown';
  let ytdlpStatus = 'unavailable';

  try {
    const ytdlpRes = spawnSync(ytdlpPath, ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (ytdlpRes.status === 0 && ytdlpRes.stdout) {
      ytdlpVersion = ytdlpRes.stdout.trim();
      ytdlpStatus = 'healthy';
    }
  } catch (e) {
    ytdlpStatus = 'error: ' + e.message;
  }

  let ffmpegStatus = 'unavailable';
  try {
    const ffmpegRes = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf-8', timeout: 5000 });
    if (ffmpegRes.status === 0) {
      ffmpegStatus = 'healthy';
    }
  } catch (e) {
    ffmpegStatus = 'error: ' + e.message;
  }

  res.json({
    status: (ytdlpStatus === 'healthy' && ffmpegStatus === 'healthy') ? 'ok' : 'degraded',
    app: APP_NAME,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    engine: {
      ytdlp: { status: ytdlpStatus, version: ytdlpVersion, binary: ytdlpPath },
      ffmpeg: { status: ffmpegStatus, binary: ffmpegPath }
    },
    memory: process.memoryUsage()
  });
}

module.exports = {
  getHealth
};
