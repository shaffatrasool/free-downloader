/**
 * src/controllers/downloadController.js
 * Handles file downloads, streaming progress (SSE), job cancellations,
 * thumbnail downloads, subtitles, descriptions, and playlist ZIP archives.
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const ytdlpService = require('../services/ytdlpService');
const jobManager = require('../services/jobManager');
const { validateAndSanitizeUrl, sanitizeFilename, getEncodedContentDisposition } = require('../middleware/security');
const { JOB_STATUS } = require('../config/constants');

/**
 * Handle GET /api/download
 */
async function download(req, res, next) {
  const jobId = req.query.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const rawUrl = req.query.url;
  const type = req.query.type || 'video'; // video, audio, thumbnail, subtitle, description
  const quality = req.query.quality || 'best';
  const format = req.query.format || (type === 'audio' ? 'mp3' : 'mp4');
  const requestedFilename = req.query.filename;

  try {
    if (!rawUrl) {
      return res.status(400).json({ success: false, error: 'URL parameter is required.' });
    }

    const safeUrl = validateAndSanitizeUrl(rawUrl);

    // Initial job registration
    jobManager.createJob(jobId, {
      url: safeUrl,
      title: requestedFilename || 'Downloading media',
      status: JOB_STATUS.PREPARING
    });

    // 1. Direct Thumbnail Download
    if (type === 'thumbnail') {
      const thumbUrl = req.query.thumbUrl || safeUrl;
      const response = await fetch(thumbUrl, { redirect: 'follow' });
      if (!response.ok) throw new Error('Failed to retrieve thumbnail image.');

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const cleanName = sanitizeFilename(requestedFilename || 'thumbnail', 'jpg');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', getEncodedContentDisposition(cleanName));

      const arrayBuf = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuf));
    }

    // 2. Direct Description Download (.txt)
    if (type === 'description') {
      const info = await ytdlpService.getVideoInfo(safeUrl);
      const descText = info.description || 'No description provided.';
      const cleanName = sanitizeFilename(`${info.title} - Description`, 'txt');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', getEncodedContentDisposition(cleanName));
      return res.send(Buffer.from(descText, 'utf-8'));
    }

    // 3. Subtitles / Captions (.vtt or .srt)
    if (type === 'subtitle') {
      const subUrl = req.query.subUrl;
      if (subUrl) {
        const response = await fetch(subUrl, { redirect: 'follow' });
        if (!response.ok) throw new Error('Failed to retrieve subtitle stream.');

        const cleanName = sanitizeFilename(requestedFilename || 'subtitle', 'vtt');
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Content-Disposition', getEncodedContentDisposition(cleanName));

        const text = await response.text();
        return res.send(text);
      }
    }

    // 4. Video & Audio Downloads via yt-dlp & ffmpeg
    const ext = format.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanFilename = sanitizeFilename(requestedFilename || `download-${Date.now()}`, ext);

    const { filePath, ext: finalExt } = await ytdlpService.downloadAndPrepareMedia({
      jobId,
      url: safeUrl,
      type,
      format,
      quality,
      ext,
      req,
      res
    });

    if (!fs.existsSync(filePath)) {
      throw new Error('Downloaded file not found on server.');
    }

    const stat = fs.statSync(filePath);
    const mimeTypes = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      opus: 'audio/opus',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      flac: 'audio/flac'
    };

    const contentType = mimeTypes[finalExt] || 'application/octet-stream';

    // Support HTTP Range Requests
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Content-Disposition': getEncodedContentDisposition(cleanFilename),
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no'
      });

      const fileStream = fs.createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 });
      fileStream.pipe(res);
      return;
    }

    // Standard Full Streaming with high throughput buffer
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Content-Disposition': getEncodedContentDisposition(cleanFilename),
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no'
    });

    const fileStream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    fileStream.pipe(res);

    // Auto cleanup temporary file once streaming completes or connection breaks
    const cleanup = () => {
      fileStream.destroy();
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // Ignored if busy
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    fileStream.on('error', cleanup);
  } catch (err) {
    next(err);
  }
}

/**
 * Handle GET /api/progress/:jobId (Server-Sent Events)
 */
function getProgressStream(req, res) {
  const { jobId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Note: jobManager.addSSEClient() sets up its own 15s heartbeat ping timer
  // and cleans up on disconnect. No need for a duplicate ping here.
  jobManager.addSSEClient(jobId, res);
}

/**
 * Handle POST /api/pause/:jobId
 */
function pauseJob(req, res) {
  const { jobId } = req.params;
  const success = jobManager.pauseJob(jobId);
  return res.json({
    success,
    message: success ? 'Job paused successfully.' : 'Job not found or already completed.'
  });
}

/**
 * Handle POST /api/resume/:jobId
 */
function resumeJob(req, res) {
  const { jobId } = req.params;
  const success = jobManager.resumeJob(jobId);
  return res.json({
    success,
    message: success ? 'Job resumed successfully.' : 'Job not found.'
  });
}

/**
 * Handle POST /api/cancel/:jobId
 */
function cancelJob(req, res) {
  const { jobId } = req.params;
  const success = jobManager.cancelJob(jobId);
  return res.json({
    success,
    message: success ? 'Job cancelled successfully.' : 'Job not found or already completed.'
  });
}

/**
 * Handle POST /api/download-playlist-zip
 * Downloads selected items and streams them as a ZIP archive
 */
async function downloadPlaylistZip(req, res, next) {
  try {
    const { items, playlistTitle } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items selected for ZIP download.' });
    }

    // Limit to 20 items per zip batch to prevent server exhaustion
    const selected = items.slice(0, 20);
    const cleanTitle = sanitizeFilename(playlistTitle || 'Playlist', 'zip');

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': getEncodedContentDisposition(cleanTitle)
    });

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    archive.on('error', err => {
      console.error('[Zip Archive Error]', err);
      res.end();
    });

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      try {
        const itemJobId = `zip-item-${Date.now()}-${i}`;
        const { filePath } = await ytdlpService.downloadAndPrepareMedia({
          jobId: itemJobId,
          url: item.url,
          type: item.type || 'video',
          format: item.format || 'mp4',
          quality: '720p',
          ext: 'mp4',
          req,
          res
        });

        if (fs.existsSync(filePath)) {
          const entryName = sanitizeFilename(`${i + 1} - ${item.title || 'video'}`, 'mp4');
          archive.file(filePath, { name: entryName });
        }
      } catch (itemErr) {
        console.warn(`[ZIP] Failed to download item: ${item.title}: ${itemErr.message}`);
      }
    }

    await archive.finalize();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  download,
  getProgressStream,
  pauseJob,
  resumeJob,
  cancelJob,
  downloadPlaylistZip
};
