/**
 * src/routes/api.js
 * Central Express router definition for all API endpoints.
 */

const express = require('express');
const router = express.Router();

const infoController = require('../controllers/infoController');
const downloadController = require('../controllers/downloadController');
const healthController = require('../controllers/healthController');
const { infoLimiter, downloadLimiter } = require('../middleware/rateLimiter');

// System Health
router.get('/health', healthController.getHealth);

// Dev speedtest debug
router.get('/speedtest-debug', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Disabled in production' });
  }
  res.json({
    flags: [
      '--concurrent-fragments 16',
      '--http-chunk-size 10M',
      '--buffer-size 64K',
      '--retries 10',
      '--fragment-retries 10',
      '--retry-sleep 1',
      '--no-part',
      '--no-mtime'
    ],
    compressionExcluded: ['/api/download'],
    streamHighWaterMark: '1MB'
  });
});

// Media Metadata & Search
router.post('/info', infoLimiter, infoController.getInfo);
router.get('/search', infoLimiter, infoController.search);

// Downloads & Progress
router.get('/download', downloadLimiter, downloadController.download);
router.get('/progress/:jobId', downloadController.getProgressStream);
router.post('/pause/:jobId', downloadController.pauseJob);
router.post('/resume/:jobId', downloadController.resumeJob);
router.post('/cancel/:jobId', downloadController.cancelJob);
router.post('/download-playlist-zip', downloadLimiter, downloadController.downloadPlaylistZip);

module.exports = router;
