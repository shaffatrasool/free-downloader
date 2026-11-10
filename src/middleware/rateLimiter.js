/**
 * src/middleware/rateLimiter.js
 * Rate limiting middleware for preventing API abuse without disrupting normal user workflows.
 * Download endpoints have NO rate limiting (unlimited downloads).
 */

const rateLimit = require('express-rate-limit');

// Permissive info rate limiter: 120 requests per minute per IP
const infoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests/minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.setHeader('Retry-After', '60');
    res.status(429).json({
      success: false,
      error: 'Rate limit reached. Please wait a moment before querying another video link.',
      retryAfter: 60
    });
  }
});

// Pass-through limiter for downloads (unlimited)
const noLimit = (req, res, next) => next();

module.exports = {
  generalLimiter: noLimit,
  infoLimiter,
  downloadLimiter: noLimit
};
