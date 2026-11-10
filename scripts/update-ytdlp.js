/**
 * scripts/update-ytdlp.js
 * Updates the yt-dlp binary to the absolute latest version.
 * Can be run manually with `npm run update-ytdlp` or scheduled by the server.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { getPlatformConfig, BIN_DIR, downloadBinary, verifyBinary } = require('./install-ytdlp');

async function update() {
  const { filename, url } = getPlatformConfig();
  const binPath = path.join(BIN_DIR, filename);

  console.log('[yt-dlp updater] Checking for yt-dlp updates...');

  // First try the built-in self update if binary exists
  if (verifyBinary(binPath)) {
    try {
      console.log('[yt-dlp updater] Attempting built-in self update via -U...');
      const res = spawnSync(binPath, ['-U'], { encoding: 'utf-8', timeout: 30000 });
      console.log(res.stdout || res.stderr || '');
      if (res.status === 0 && !res.stderr?.includes('ERROR')) {
        console.log('[yt-dlp updater] yt-dlp updated successfully via self-update.');
        return;
      }
    } catch (e) {
      console.warn(`[yt-dlp updater] Built-in update attempt failed: ${e.message}. Falling back to fresh download...`);
    }
  }

  // Fallback: download fresh latest binary
  console.log('[yt-dlp updater] Downloading latest release from GitHub...');
  await downloadBinary(url, binPath);
  verifyBinary(binPath);
}

if (require.main === module) {
  update().catch(err => {
    console.error(`[yt-dlp updater] Update failed: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { update };
