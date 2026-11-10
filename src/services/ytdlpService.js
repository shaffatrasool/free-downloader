/**
 * src/services/ytdlpService.js
 * Core engine interfacing with yt-dlp binary and ffmpeg for metadata extraction,
 * keyword searching, media downloading, merging, and audio transcoding.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegStatic = require('ffmpeg-static');
const {
  TEMP_DIR,
  BIN_DIR,
  VIDEO_RESOLUTIONS,
  AUDIO_PRESETS,
  PLATFORMS,
  JOB_STATUS
} = require('../config/constants');
const jobManager = require('./jobManager');

// In-memory cache for video metadata (10 minute TTL)
const infoCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

class YtdlpService {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Resolve absolute path to yt-dlp binary
   */
  getYtdlpPath() {
    const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const localBin = path.join(BIN_DIR, filename);

    if (fs.existsSync(localBin)) {
      return localBin;
    }

    // Fallback to system command
    return 'yt-dlp';
  }

  /**
   * Resolve absolute path to ffmpeg binary
   */
  getFfmpegPath() {
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
    return 'ffmpeg';
  }

  /**
   * Detect platform identifier from URL or extractor
   */
  detectPlatform(url, extractor = '') {
    if (!url) return { id: 'generic', name: 'Web Video', color: '#00c853' };

    for (const p of PLATFORMS) {
      if (p.pattern.test(url)) return p;
    }

    const lowerExt = (extractor || '').toLowerCase();
    for (const p of PLATFORMS) {
      if (lowerExt.includes(p.id)) return p;
    }

    return { id: 'generic', name: 'Web Video', color: '#00c853' };
  }

  /**
   * Format seconds into HH:MM:SS or MM:SS
   */
  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const totalSecs = Math.floor(Number(seconds));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;

    const sStr = s < 10 ? `0${s}` : `${s}`;
    if (h > 0) {
      const mStr = m < 10 ? `0${m}` : `${m}`;
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  }

  /**
   * Format view count or numbers (e.g., 1,234,567 or 1.2M)
   */
  formatViews(count) {
    if (!count || isNaN(count)) return 'N/A';
    const num = Number(count);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  }

  /**
   * Format bytes to human readable string (KB, MB, GB)
   */
  formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return 'Unknown size';
    const b = Number(bytes);
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${b} B`;
  }

  /**
   * Clean and normalize yt-dlp JSON dump into rich client formats
   */
  normalizeMetadata(info, originalUrl) {
    const isPlaylist = info._type === 'playlist' || (Array.isArray(info.entries) && info.entries.length > 0);
    const platform = this.detectPlatform(originalUrl, info.extractor_key || info.extractor);

    if (isPlaylist) {
      const entries = (info.entries || []).filter(Boolean).map(e => ({
        id: e.id,
        title: e.title || 'Untitled Video',
        duration: this.formatDuration(e.duration),
        durationSec: e.duration || 0,
        thumbnail: e.thumbnail || (e.thumbnails && e.thumbnails[0]?.url) || '',
        uploader: e.uploader || e.channel || 'Unknown Uploader',
        url: e.webpage_url || e.url || `https://www.youtube.com/watch?v=${e.id}`
      }));

      return {
        isPlaylist: true,
        id: info.id,
        title: info.title || 'Playlist',
        uploader: info.uploader || info.channel || 'Various Artists',
        thumbnail: entries[0]?.thumbnail || info.thumbnail || '',
        platform,
        url: originalUrl,
        entriesCount: entries.length,
        entries
      };
    }

    const duration = info.duration || 0;
    const rawFormats = info.formats || [];

    // ---- Build a height → best-format map (exact match, no tolerance) ----
    // We group video-only (acodec=none) and muxed streams by their exact height.
    // For each height we keep the highest-bitrate mp4/h264 first, then webm/vp9.
    const heightMap = new Map(); // height (number) → { mp4: format|null, webm: format|null }

    let bestAudioBytes = 0;
    let bestAudioBitrate = 128;

    for (const f of rawFormats) {
      // Collect best standalone audio for merge-size estimate
      if (f.vcodec === 'none' && f.acodec !== 'none') {
        const aBytes = f.filesize || f.filesize_approx || (f.tbr ? (f.tbr * 1000 / 8) * duration : 0);
        if (aBytes > bestAudioBytes) {
          bestAudioBytes = aBytes;
          bestAudioBitrate = f.abr || 128;
        }
        continue; // skip audio-only when building video map
      }

      // Skip purely audio formats
      if (!f.height || f.acodec === 'none' && f.vcodec === 'none') continue;
      // Must have a video codec
      if (!f.vcodec || f.vcodec === 'none') continue;

      const h = f.height;
      if (!heightMap.has(h)) heightMap.set(h, { mp4: null, webm: null });
      const entry = heightMap.get(h);

      const isMp4Like = f.ext === 'mp4' || (f.vcodec || '').includes('avc') || (f.vcodec || '').includes('h264');
      const fBytes = f.filesize || f.filesize_approx || (f.tbr ? (f.tbr * 1000 / 8) * duration : 0);

      if (isMp4Like) {
        const existBytes = entry.mp4 ? (entry.mp4.filesize || entry.mp4.filesize_approx || 0) : 0;
        if (!entry.mp4 || fBytes > existBytes) entry.mp4 = f;
      } else {
        const existBytes = entry.webm ? (entry.webm.filesize || entry.webm.filesize_approx || 0) : 0;
        if (!entry.webm || fBytes > existBytes) entry.webm = f;
      }
    }

    // Default fallback audio size estimate if duration known
    if (bestAudioBytes === 0 && duration > 0) {
      bestAudioBytes = (128 * 1000 / 8) * duration;
    }

    // Sort heights descending and generate videoFormats array
    const sortedHeights = Array.from(heightMap.keys()).sort((a, b) => b - a);

    // Labels for common heights
    const HEIGHT_LABELS = {
      2160: '4K UHD (2160p)',
      1440: '2K QHD (1440p)',
      1080: 'Full HD (1080p)',
      720:  'HD (720p)',
      480:  'SD (480p)',
      360:  'Low (360p)',
      240:  'Low (240p)',
      144:  'Low (144p)'
    };

    const videoFormatsMap = new Map();

    for (const h of sortedHeights) {
      const entry = heightMap.get(h);
      const best = entry.mp4 || entry.webm;
      if (!best) continue;

      const hasAudio = best.acodec && best.acodec !== 'none';
      const vBytes = best.filesize || best.filesize_approx || (best.tbr ? (best.tbr * 1000 / 8) * duration : 0);
      // If video-only, add estimated audio size for total
      const totalBytes = vBytes > 0 ? (hasAudio ? vBytes : vBytes + bestAudioBytes) : 0;

      const quality = `${h}`;
      const label = HEIGHT_LABELS[h] || `${h}p`;

      videoFormatsMap.set(quality, {
        quality,
        label,
        height: h,
        ext: 'mp4',
        hasAudio: true, // backend always merges best audio
        formatId: best.format_id || null,
        estimatedBytes: totalBytes,
        fileSize: totalBytes > 0 ? this.formatBytes(totalBytes) : 'Dynamic'
      });
    }

    // Ensure at least "Best Available" entry if no formats found
    if (videoFormatsMap.size === 0) {
      const fallbackH = info.height || 720;
      videoFormatsMap.set('best', {
        quality: 'best',
        label: HEIGHT_LABELS[fallbackH] || 'Best Available Quality',
        height: fallbackH,
        ext: 'mp4',
        hasAudio: true,
        estimatedBytes: info.filesize || info.filesize_approx || 0,
        fileSize: (info.filesize || info.filesize_approx) ? this.formatBytes(info.filesize || info.filesize_approx) : 'Dynamic'
      });
    }

    const videoFormats = Array.from(videoFormatsMap.values());

    // Generate Audio Formats
    const audioFormats = AUDIO_PRESETS.map(preset => {
      let kbps = 128;
      if (preset.bitrate === '320k') kbps = 320;
      else if (preset.bitrate === '256k') kbps = 256;
      else if (preset.bitrate === '192k') kbps = 192;
      else if (preset.bitrate === '128k') kbps = 128;
      else if (preset.bitrate === 'lossless') kbps = 800;
      else kbps = Math.min(192, Math.max(96, bestAudioBitrate));

      const estimatedBytes = duration > 0 ? Math.round((kbps * 1000 / 8) * duration) : 0;

      return {
        format: preset.format,
        bitrate: preset.bitrate,
        label: preset.label,
        ext: preset.format,
        estimatedBytes,
        fileSize: estimatedBytes > 0 ? this.formatBytes(estimatedBytes) : 'Dynamic'
      };
    });

    // Subtitles normalization
    const subtitles = [];
    const allSubs = Object.assign({}, info.subtitles || {}, info.automatic_captions || {});
    for (const [langCode, subList] of Object.entries(allSubs)) {
      if (Array.isArray(subList) && subList.length > 0) {
        const item = subList[0];
        subtitles.push({
          code: langCode,
          name: item.name || langCode.toUpperCase(),
          ext: item.ext || 'vtt',
          url: item.url
        });
      }
    }

    // Thumbnails normalization
    let bestThumbnail = info.thumbnail || '';
    if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
      // Pick highest resolution
      const sorted = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
      bestThumbnail = sorted[0].url || bestThumbnail;
    }

    return {
      isPlaylist: false,
      id: info.id,
      title: info.title || 'Untitled Media',
      uploader: info.uploader || info.channel || 'Creator',
      duration: this.formatDuration(duration),
      durationSeconds: duration,
      views: this.formatViews(info.view_count),
      thumbnail: bestThumbnail,
      description: info.description || '',
      platform,
      url: originalUrl,
      videoFormats,
      audioFormats,
      subtitles,
      webpageUrl: info.webpage_url || originalUrl
    };
  }

  /**
   * Fetch video info using yt-dlp -J with caching & retry logic
   */
  async getVideoInfo(url) {
    // Check in-memory cache
    const cached = infoCache.get(url);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    const ytdlpPath = this.getYtdlpPath();
    const ffmpegPath = this.getFfmpegPath();

    const baseArgs = [
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificates',
      '--no-call-home',
      '--ffmpeg-location', ffmpegPath
    ];

    if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
      baseArgs.push('--cookies', process.env.COOKIES_FILE);
    }

    // Try first attempt
    try {
      const data = await this.executeJson(ytdlpPath, [...baseArgs, url]);
      const normalized = this.normalizeMetadata(data, url);
      infoCache.set(url, { data: normalized, timestamp: Date.now() });
      return normalized;
    } catch (primaryErr) {
      console.warn(`[yt-dlp] Primary extract attempt failed: ${primaryErr.message}. Attempting retry with fallback extractor client...`);

      // Retry with YouTube android client or general compat flags
      const fallbackArgs = [
        ...baseArgs,
        '--extractor-args', 'youtube:player_client=android,web;player_skip=configs',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        url
      ];

      try {
        const retryData = await this.executeJson(ytdlpPath, fallbackArgs);
        const normalized = this.normalizeMetadata(retryData, url);
        infoCache.set(url, { data: normalized, timestamp: Date.now() });
        return normalized;
      } catch (retryErr) {
        throw new Error(retryErr.message || primaryErr.message);
      }
    }
  }

  /**
   * Helper to execute yt-dlp and parse JSON output safely with a 60s timeout
   */
  executeJson(binary, args, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const proc = spawn(binary, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t']);
          } else {
            proc.kill('SIGKILL');
          }
        } catch (e) {}
        reject(new Error(`yt-dlp operation timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      proc.stdout.on('data', chunk => {
        stdout += chunk.toString('utf-8');
      });

      proc.stderr.on('data', chunk => {
        stderr += chunk.toString('utf-8');
      });

      proc.on('close', code => {
        clearTimeout(timer);
        if (timedOut) return;

        if (code !== 0) {
          const errMessage = stderr.trim() || `Process exited with code ${code}`;
          return reject(new Error(errMessage));
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (jsonErr) {
          reject(new Error(`Failed to parse yt-dlp metadata JSON: ${jsonErr.message}`));
        }
      });

      proc.on('error', err => {
        clearTimeout(timer);
        if (!timedOut) reject(err);
      });
    });
  }

  /**
   * Execute YouTube keyword search (`ytsearch10:query`)
   */
  async search(query, limit = 10) {
    const ytdlpPath = this.getYtdlpPath();
    const cleanQuery = query.replace(/["\\]/g, ' ').trim();
    const searchTarget = `ytsearch${limit}:${cleanQuery}`;

    const args = [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates',
      searchTarget
    ];

    const data = await this.executeJson(ytdlpPath, args);
    const entries = data.entries || [];

    return entries.map(e => ({
      id: e.id,
      title: e.title || 'Untitled',
      channel: e.uploader || e.channel || 'YouTube Creator',
      duration: this.formatDuration(e.duration),
      durationSeconds: e.duration || 0,
      views: this.formatViews(e.view_count),
      thumbnail: e.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
      url: e.webpage_url || e.url || `https://www.youtube.com/watch?v=${e.id}`
    }));
  }

  /**
   * Download and prepare media stream with live progress reporting via SSE
   */
  async downloadAndPrepareMedia({ jobId, url, type, format, quality, ext, req, res }) {
    this.ensureDirectories();

    const ytdlpPath = this.getYtdlpPath();
    const ffmpegPath = this.getFfmpegPath();
    const targetExt = ext || (type === 'audio' ? 'mp3' : 'mp4');
    const tempOutputFile = path.join(TEMP_DIR, `${jobId}.${targetExt}`);

    const args = [
      '--no-warnings',
      '--no-check-certificates',
      '--newline',
      '--ffmpeg-location', ffmpegPath,
      '--concurrent-fragments', '16',
      '--http-chunk-size', '10M',
      '--buffer-size', '64K',
      '--retries', '10',
      '--fragment-retries', '10',
      '--retry-sleep', '1',
      '--part',
      '--continue',
      '--no-mtime',
      '--progress-template', 'download:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s'
    ];

    if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
      args.push('--cookies', process.env.COOKIES_FILE);
    }

    if (type === 'audio') {
      // Audio extraction & conversion
      args.push('-x');
      args.push('--audio-format', targetExt);
      if (format && format.includes('k')) {
        args.push('--audio-quality', format);
      } else {
        args.push('--audio-quality', '320k');
      }
    } else {
      // Video mode: ensure best audio is always merged with specified or best video
      let formatSelector;
      const height = parseInt(quality, 10);
      if (height && !isNaN(height)) {
        formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
      } else {
        formatSelector = 'bestvideo+bestaudio/best';
      }

      args.push('-f', formatSelector);
      args.push('--merge-output-format', targetExt);
    }

    // Set destination output path
    args.push('-o', tempOutputFile);
    args.push(url);

    jobManager.updateProgress(jobId, {
      status: JOB_STATUS.DOWNLOADING,
      percent: 1,
      speed: 'Starting...',
      eta: '--:--'
    });

    const child = spawn(ytdlpPath, args, { windowsHide: true });
    jobManager.setProcess(jobId, child, tempOutputFile);

    // Track abort on HTTP disconnect — but only cancel if NOT already completed or paused.
    // Paused downloads taskkill the child process intentionally; we don't want a double-cancel.
    req.on('close', () => {
      const currentJob = jobManager.getJob(jobId);
      const alreadyDone = currentJob && [
        JOB_STATUS.COMPLETED,
        JOB_STATUS.CANCELLED,
        JOB_STATUS.FAILED
      ].includes(currentJob.status);
      const isPaused = currentJob && currentJob.isPaused;

      if (!alreadyDone && !isPaused && !child.killed && child.exitCode === null) {
        console.log(`[Job ${jobId}] Client connection disconnected. Terminating child process.`);
        jobManager.cancelJob(jobId);
      }
    });

    return new Promise((resolve, reject) => {
      let stderrOutput = '';
      let lastBytes = 0;
      let lastTime = Date.now();

      child.stdout.on('data', chunk => {
        const text = chunk.toString('utf-8');

        // Check for rich progress template:
        // download:downloaded|total|total_est|speed_bytes|eta_sec|percent_str|speed_str|eta_str
        const lines = text.split('\n');
        for (const line of lines) {
          const matchRich = line.match(/download:([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^\r\n]*)/);
          if (matchRich) {
            const downloadedBytes = parseFloat(matchRich[1]) || 0;
            const totalBytes = parseFloat(matchRich[2]) || parseFloat(matchRich[3]) || 0;
            const speedBytesPerSec = parseFloat(matchRich[4]) || 0;
            const etaSeconds = parseFloat(matchRich[5]) || 0;
            const percentStr = matchRich[6].replace('%', '').trim();
            const rawSpeedStr = matchRich[7].trim();
            const etaStr = matchRich[8].trim();

            let percent = parseFloat(percentStr);
            if (isNaN(percent) && totalBytes > 0 && downloadedBytes > 0) {
              percent = Math.round((downloadedBytes / totalBytes) * 100);
            }

            // Delta speed calculation fallback if yt-dlp speed is empty or 0
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            let displaySpeed = rawSpeedStr;

            if ((!displaySpeed || speedBytesPerSec <= 0) && timeDiff >= 0.5 && downloadedBytes > lastBytes) {
              const deltaBytes = downloadedBytes - lastBytes;
              const rate = deltaBytes / timeDiff;
              displaySpeed = `${this.formatBytes(rate)}/s`;
              lastBytes = downloadedBytes;
              lastTime = now;
            } else if (speedBytesPerSec > 0) {
              displaySpeed = rawSpeedStr || `${this.formatBytes(speedBytesPerSec)}/s`;
              lastBytes = downloadedBytes;
              lastTime = now;
            }

            jobManager.updateProgress(jobId, {
              status: JOB_STATUS.DOWNLOADING,
              stage: 'Downloading (server)',
              percent: isNaN(percent) ? 50 : percent,
              speed: displaySpeed || 'Downloading...',
              eta: etaStr || (etaSeconds > 0 ? this.formatDuration(etaSeconds) : '--:--'),
              size: totalBytes > 0 ? `${this.formatBytes(downloadedBytes)} / ${this.formatBytes(totalBytes)}` : (downloadedBytes > 0 ? this.formatBytes(downloadedBytes) : 'Unknown'),
              downloadedBytes,
              totalBytes,
              speedBytesPerSec: speedBytesPerSec || (timeDiff > 0 && downloadedBytes > lastBytes ? (downloadedBytes - lastBytes) / timeDiff : 0),
              etaSeconds
            });
          } else {
            // Fallback for standard percent match
            const fallbackMatch = line.match(/download:\s*([0-9.]+)%\|([^|]*)\|([^|]*)\|([^\r\n]*)/);
            if (fallbackMatch) {
              const percent = parseFloat(fallbackMatch[1]);
              const speed = fallbackMatch[2].trim() || 'N/A';
              const eta = fallbackMatch[3].trim() || '00:00';
              const size = fallbackMatch[4].trim() || 'Unknown';

              jobManager.updateProgress(jobId, {
                status: JOB_STATUS.DOWNLOADING,
                stage: 'Downloading (server)',
                percent,
                speed,
                eta,
                size
              });
            }
          }
        }

        if (text.includes('[Merger]') || text.includes('Merging formats')) {
          jobManager.updateProgress(jobId, {
            status: JOB_STATUS.MERGING,
            stage: 'Merging audio and video...',
            percent: 98
          });
        }

        if (text.includes('[ExtractAudio]') || (text.includes('Destination:') && type === 'audio')) {
          jobManager.updateProgress(jobId, {
            status: JOB_STATUS.CONVERTING,
            stage: 'Converting audio...',
            percent: 99
          });
        }
      });

      child.stderr.on('data', chunk => {
        stderrOutput += chunk.toString('utf-8');
      });

      child.on('close', code => {
        if (code !== 0) {
          const err = new Error(stderrOutput.trim() || `Download failed with exit code ${code}`);
          jobManager.updateProgress(jobId, {
            status: JOB_STATUS.FAILED,
            error: err.message
          });
          return reject(err);
        }

        // Verify output file exists
        if (fs.existsSync(tempOutputFile)) {
          jobManager.updateProgress(jobId, {
            status: JOB_STATUS.COMPLETED,
            percent: 100,
            speed: 'Done',
            eta: '00:00'
          });
          resolve({ filePath: tempOutputFile, ext: targetExt });
        } else {
          // Sometimes ffmpeg output slightly modified filename extension
          const dir = path.dirname(tempOutputFile);
          const base = path.basename(tempOutputFile, path.extname(tempOutputFile));
          const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
          if (files.length > 0) {
            const actualPath = path.join(dir, files[0]);
            jobManager.updateProgress(jobId, {
              status: JOB_STATUS.COMPLETED,
              percent: 100,
              speed: 'Done',
              eta: '00:00'
            });
            resolve({ filePath: actualPath, ext: path.extname(actualPath).replace('.', '') });
          } else {
            const notFoundErr = new Error('Output media file was not generated.');
            jobManager.updateProgress(jobId, {
              status: JOB_STATUS.FAILED,
              error: notFoundErr.message
            });
            reject(notFoundErr);
          }
        }
      });

      child.on('error', err => {
        jobManager.updateProgress(jobId, {
          status: JOB_STATUS.FAILED,
          error: err.message
        });
        reject(err);
      });
    });
  }
}

module.exports = new YtdlpService();
