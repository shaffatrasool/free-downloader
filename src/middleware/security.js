/**
 * src/middleware/security.js
 * Security validations: SSRF defense, URL sanitization, filename safe handling.
 */

const { BLOCKED_HOSTS } = require('../config/constants');
const ip = require('net');

/**
 * Checks if an IP address falls into a private or reserved range
 */
function isPrivateIp(address) {
  if (!address) return false;

  // IPv4 checks
  if (ip.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
  }

  // IPv6 loopback and link-local
  if (ip.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc00:')) {
      return true;
    }
  }

  return false;
}

/**
 * Validates and sanitizes a URL to prevent SSRF and injection attacks
 */
function validateAndSanitizeUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('URL must be a non-empty string.');
  }

  const trimmed = input.trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch (e) {
    throw new Error('Invalid URL format.');
  }

  // Enforce HTTP / HTTPS only
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are allowed.');
  }

  const rawHostname = parsedUrl.hostname.toLowerCase();
  // Strip IPv6 brackets if present (e.g. "[::1]" -> "::1")
  const hostname = rawHostname.replace(/^\[|\]$/g, '');

  // Block known loopback and internal cloud metadata hostnames
  if (BLOCKED_HOSTS.includes(rawHostname) || BLOCKED_HOSTS.includes(hostname)) {
    throw new Error('Access to internal and local network addresses is forbidden.');
  }

  // Block IP directly if it's private or loopback
  if (ip.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error('Access to private IP ranges is forbidden.');
  }

  return parsedUrl.toString();
}

/**
 * Safely sanitizes a filename for Content-Disposition and filesystem operations.
 * Preserves international Unicode (Urdu, Arabic, Hindi, Cyrillic, CJK, Emoji)
 * while removing forbidden Windows/Linux filesystem characters.
 */
function sanitizeFilename(filename, extension = '') {
  if (!filename || typeof filename !== 'string') {
    filename = 'download';
  }

  // Remove control characters and illegal OS characters: / \ : * ? " < > |
  let clean = filename
    .replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/g, '')
    .replace(/\.{2,}/g, '') // remove path traversal dots (..)
    .replace(/^\.+|\.+$/g, '') // strip leading and trailing dots
    .replace(/\s+/g, ' ')
    .trim();

  // Guard against Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const reservedPattern = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reservedPattern.test(clean)) {
    clean = `file_${clean}`;
  }

  // If filename ends up empty or dot-only, use fallback
  if (!clean || clean === '.' || clean === '..') {
    clean = 'download';
  }

  // Truncate length if overly long (filesystem limits: 255 bytes)
  if (clean.length > 150) {
    clean = clean.substring(0, 150).trim();
  }

  if (extension) {
    const cleanExt = extension.replace(/^\./, '').replace(/[^a-zA-Z0-9]/g, '');
    if (cleanExt && !clean.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`)) {
      clean = `${clean}.${cleanExt}`;
    }
  }

  return clean;
}

/**
 * Encodes filename for RFC 5987 Content-Disposition header (UTF-8 safe)
 */
function getEncodedContentDisposition(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  const utf8Encoded = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

module.exports = {
  validateAndSanitizeUrl,
  sanitizeFilename,
  getEncodedContentDisposition,
  isPrivateIp
};
