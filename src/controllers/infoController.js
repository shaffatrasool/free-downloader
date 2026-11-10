/**
 * src/controllers/infoController.js
 * Handles metadata queries and YouTube search requests.
 */

const ytdlpService = require('../services/ytdlpService');
const { validateAndSanitizeUrl } = require('../middleware/security');

/**
 * Handle POST /api/info
 * Accepts either a direct video URL or falls back to search if keyword is passed
 */
async function getInfo(req, res, next) {
  try {
    const rawInput = req.body?.url || req.body?.query || req.query?.url;
    if (!rawInput || typeof rawInput !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid media URL or search keyword.'
      });
    }

    const trimmed = rawInput.trim();

    // Reject non-HTTP URI schemes immediately
    if (/^[a-zA-Z0-9+-.]+:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
      return res.status(400).json({
        success: false,
        error: 'Only HTTP and HTTPS URLs are allowed.'
      });
    }

    // Check if input is a URL or search keyword
    const isUrl = /^(https?:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i.test(trimmed);

    if (isUrl) {
      let targetUrl = trimmed;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `https://${targetUrl}`;
      }

      const safeUrl = validateAndSanitizeUrl(targetUrl);
      const info = await ytdlpService.getVideoInfo(safeUrl);

      return res.json({
        success: true,
        type: info.isPlaylist ? 'playlist' : 'video',
        data: info
      });
    } else {
      // It's a keyword search query
      const results = await ytdlpService.search(trimmed, 10);
      return res.json({
        success: true,
        type: 'search',
        query: trimmed,
        data: results
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Handle GET /api/search
 */
async function search(req, res, next) {
  try {
    const query = req.query?.q || req.query?.query;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Please provide a non-empty search query parameter (q).'
      });
    }

    const results = await ytdlpService.search(query.trim(), 10);
    return res.json({
      success: true,
      data: results
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInfo,
  search
};
