/**
 * src/services/updaterService.js
 * Automatically checks for yt-dlp updates once a day to ensure platform extractors stay updated.
 */

const { update } = require('../../scripts/update-ytdlp');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class UpdaterService {
  constructor() {
    this.timer = null;
  }

  start() {
    console.log('[UpdaterService] Scheduling daily yt-dlp update checks (every 24h).');
    // First run delayed by 1 minute after server boot
    setTimeout(() => {
      this.checkUpdate();
    }, 60 * 1000);

    // Then recurring every 24 hours
    this.timer = setInterval(() => {
      this.checkUpdate();
    }, ONE_DAY_MS);
  }

  async checkUpdate() {
    try {
      console.log('[UpdaterService] Running scheduled yt-dlp update check...');
      await update();
    } catch (err) {
      console.warn(`[UpdaterService] Scheduled update failed: ${err.message}`);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = new UpdaterService();
