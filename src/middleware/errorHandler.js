/**
 * src/middleware/errorHandler.js
 * Centralized error handler returning clean, user-friendly JSON responses.
 */

function friendlyErrorMessage(err) {
  const msg = err.message || String(err);

  if (/is a live stream|this live event will begin in|live event/i.test(msg)) {
    return 'Live streams are not supported. Please wait until the stream has ended and been published.';
  }
  if (/sign in to confirm your age|age[- ]restricted/i.test(msg)) {
    return 'This content is age-restricted by the platform and cannot be downloaded anonymously.';
  }
  if (/private video|login required|this video is private/i.test(msg)) {
    return 'This content is private or requires authorization.';
  }
  if (/video unavailable|has been removed|this video is not available/i.test(msg)) {
    return 'This video is unavailable, deleted, or removed by the platform.';
  }
  if (/not available in your country|geo-restricted|blocked in your country/i.test(msg)) {
    return 'This content is region-blocked or restricted in the server location.';
  }
  if (/unsupported url|is not a valid url/i.test(msg)) {
    return 'Unsupported or unrecognized URL. Please enter a valid video link from a supported platform.';
  }
  if (/no video formats found/i.test(msg)) {
    return 'Could not retrieve downloadable streams for this media.';
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return 'Network timeout connecting to the media host. Please try again in a few moments.';
  }

  // Return the error message or a general fallback
  return msg || 'An unexpected error occurred while processing your request.';
}

function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  const status = err.status || err.statusCode || 500;
  const friendly = friendlyErrorMessage(err);

  // If response headers have already been sent (e.g. during streaming), delegate to Express
  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json({
    success: false,
    error: friendly,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

module.exports = {
  errorHandler,
  friendlyErrorMessage
};
