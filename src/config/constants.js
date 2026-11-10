/**
 * src/config/constants.js
 * Application constants, platform regexes, quality definitions, and security constraints.
 */

const path = require('path');

module.exports = {
  // Application metadata
  APP_NAME: 'Free Downloader',
  APP_VERSION: '1.0.0',
  COPYRIGHT: 'All rights reserved © Shaffat Rasool Pro',

  // Server defaults
  DEFAULT_PORT: 3000,
  DEFAULT_HOST: '0.0.0.0',
  CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes cache
  MAX_PARALLEL_DOWNLOADS: 3,

  // Storage paths
  TEMP_DIR: path.resolve(__dirname, '../../temp'),
  BIN_DIR: path.resolve(__dirname, '../../bin'),

  // Supported Platforms and their regex patterns
  PLATFORMS: [
    {
      id: 'youtube',
      name: 'YouTube',
      color: '#FF0000',
      domains: ['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'],
      pattern: /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?.*v=|shorts\/|playlist\?.*list=)|youtu\.be\/)/i,
      features: ['Video (up to 4K)', 'Audio MP3', 'Shorts', 'Playlists', 'Subtitles', 'Thumbnails']
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      color: '#00F2FE',
      domains: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
      pattern: /^(https?:\/\/)?(www\.|vm\.|vt\.)?tiktok\.com\//i,
      features: ['No Watermark HD', 'Original Audio', 'Captions']
    },
    {
      id: 'instagram',
      name: 'Instagram',
      color: '#E1306C',
      domains: ['instagram.com', 'instagr.am'],
      pattern: /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv|stories)\//i,
      features: ['Reels', 'Posts', 'Carousel', 'Audio Extract']
    },
    {
      id: 'facebook',
      name: 'Facebook',
      color: '#1877F2',
      domains: ['facebook.com', 'fb.watch', 'm.facebook.com'],
      pattern: /^(https?:\/\/)?(www\.|m\.|web\.)?(facebook\.com\/(.*\/videos|reel|watch)|fb\.watch\/)/i,
      features: ['HD / SD Video', 'Audio MP3', 'Watch Clips']
    },
    {
      id: 'twitter',
      name: 'Twitter / X',
      color: '#1DA1F2',
      domains: ['twitter.com', 'x.com'],
      pattern: /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/.+\/status\/\d+/i,
      features: ['Highest MP4 bitrate', 'Fast extraction']
    },
    {
      id: 'reddit',
      name: 'Reddit',
      color: '#FF4500',
      domains: ['reddit.com', 'v.redd.it'],
      pattern: /^(https?:\/\/)?(www\.)?(reddit\.com\/r\/.+\/comments\/|v\.redd\.it\/)/i,
      features: ['Audio+Video Merged', 'No mute videos']
    },
    {
      id: 'pinterest',
      name: 'Pinterest',
      color: '#BD081C',
      domains: ['pinterest.com', 'pin.it'],
      pattern: /^(https?:\/\/)?(www\.|[a-z]{2}\.)?pinterest\.(com|[a-z]{2})\/pin\/|pin\.it\//i,
      features: ['Pins', 'Idea Pins Video', 'HD MP4']
    },
    {
      id: 'threads',
      name: 'Threads',
      color: '#000000',
      domains: ['threads.net'],
      pattern: /^(https?:\/\/)?(www\.)?threads\.net\//i,
      features: ['High quality MP4', 'Direct audio']
    },
    {
      id: 'dailymotion',
      name: 'Dailymotion',
      color: '#0066DC',
      domains: ['dailymotion.com', 'dai.ly'],
      pattern: /^(https?:\/\/)?(www\.)?(dailymotion\.com\/video\/|dai\.ly\/)/i,
      features: ['1080p / 720p', 'Audio Extract']
    },
    {
      id: 'vimeo',
      name: 'Vimeo',
      color: '#1AB7EA',
      domains: ['vimeo.com'],
      pattern: /^(https?:\/\/)?(www\.)?vimeo\.com\/\d+/i,
      features: ['Full HD', 'Clean Audio']
    },
    {
      id: 'twitch',
      name: 'Twitch',
      color: '#9146FF',
      domains: ['twitch.tv', 'clips.twitch.tv'],
      pattern: /^(https?:\/\/)?(www\.|clips\.)?twitch\.tv\//i,
      features: ['Clips', 'VODs']
    },
    {
      id: 'soundcloud',
      name: 'SoundCloud',
      color: '#FF5500',
      domains: ['soundcloud.com'],
      pattern: /^(https?:\/\/)?(www\.)?soundcloud\.com\//i,
      features: ['HQ Audio 320kbps MP3 / WAV']
    },
    {
      id: 'bilibili',
      name: 'Bilibili',
      color: '#00A1D6',
      domains: ['bilibili.com'],
      pattern: /^(https?:\/\/)?(www\.)?bilibili\.com\/video\//i,
      features: ['High quality Video & Audio']
    },
    {
      id: 'snapchat',
      name: 'Snapchat',
      color: '#FFFC00',
      domains: ['snapchat.com'],
      pattern: /^(https?:\/\/)?(www\.)?snapchat\.com\/spotlight\//i,
      features: ['Spotlight video', 'MP4']
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      color: '#0A66C2',
      domains: ['linkedin.com'],
      pattern: /^(https?:\/\/)?(www\.)?linkedin\.com\//i,
      features: ['Business videos', 'HD MP4']
    }
  ],

  // Standard video heights
  VIDEO_RESOLUTIONS: [
    { label: '4K (2160p)', height: 2160, quality: '4k' },
    { label: '2K (1440p)', height: 1440, quality: '1440p' },
    { label: 'Full HD (1080p)', height: 1080, quality: '1080p' },
    { label: 'HD (720p)', height: 720, quality: '720p' },
    { label: 'SD (480p)', height: 480, quality: '480p' },
    { label: '360p', height: 360, quality: '360p' },
    { label: '240p', height: 240, quality: '240p' },
    { label: '144p', height: 144, quality: '144p' }
  ],

  // Audio presets
  AUDIO_PRESETS: [
    { format: 'mp3', bitrate: '320k', label: 'MP3 - 320 kbps (Best Quality)' },
    { format: 'mp3', bitrate: '256k', label: 'MP3 - 256 kbps (High Quality)' },
    { format: 'mp3', bitrate: '192k', label: 'MP3 - 192 kbps (Standard Quality)' },
    { format: 'mp3', bitrate: '128k', label: 'MP3 - 128 kbps (Compact Size)' },
    { format: 'm4a', bitrate: 'auto', label: 'M4A (AAC Audio)' },
    { format: 'opus', bitrate: 'auto', label: 'OPUS (High Efficiency)' },
    { format: 'wav', bitrate: 'lossless', label: 'WAV (Uncompressed Audio)' },
    { format: 'flac', bitrate: 'lossless', label: 'FLAC (Lossless Audio)' }
  ],

  // SSRF Protection: blocked CIDRs / hostnames
  BLOCKED_HOSTS: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'metadata.google.internal',
    '169.254.169.254'
  ],

  // Job Statuses for Download Queue & SSE
  JOB_STATUS: {
    QUEUED: 'Queued',
    PREPARING: 'Preparing',
    DOWNLOADING: 'Downloading',
    MERGING: 'Merging audio and video',
    CONVERTING: 'Converting audio',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled'
  }
};
