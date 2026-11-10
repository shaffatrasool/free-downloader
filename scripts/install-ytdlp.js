/**
 * scripts/install-ytdlp.js
 * Automatically downloads or verifies the yt-dlp binary for the current operating system.
 * Works seamlessly across Windows (yt-dlp.exe), Linux (yt-dlp), and macOS (yt-dlp_macos).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');

/**
 * Determine binary name and download URL for current platform
 */
function getPlatformConfig() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return {
      filename: 'yt-dlp.exe',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    };
  } else if (platform === 'darwin') {
    return {
      filename: 'yt-dlp',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
    };
  } else {
    // Linux default
    let url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    if (arch === 'arm64' || arch === 'aarch64') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64';
    } else if (arch === 'arm') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l';
    }
    return {
      filename: 'yt-dlp',
      url
    };
  }
}

/**
 * Download a binary file following HTTP 3xx redirects
 */
async function downloadBinary(url, destPath) {
  console.log(`[yt-dlp installer] Downloading from: ${url}`);
  console.log(`[yt-dlp installer] Destination: ${destPath}`);

  const tempPath = `${destPath}.tmp-${Date.now()}`;

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'free-downloader-installer/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp: HTTP ${response.status} ${response.statusText}`);
  }

  const fileStream = fs.createWriteStream(tempPath);
  const reader = response.body.getReader();

  let downloadedBytes = 0;
  const contentLength = Number(response.headers.get('content-length') || 0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
    downloadedBytes += value.length;

    if (contentLength > 0 && downloadedBytes % (1024 * 1024 * 4) < value.length) {
      const pct = ((downloadedBytes / contentLength) * 100).toFixed(1);
      process.stdout.write(`\r[yt-dlp installer] Progress: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB (${pct}%)`);
    }
  }

  fileStream.end();

  await new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  // Atomic rename to final binary
  if (fs.existsSync(destPath)) {
    try {
      fs.unlinkSync(destPath);
    } catch (e) {
      // Ignore if cannot delete immediately
    }
  }

  fs.renameSync(tempPath, destPath);

  // Set executable permission on Unix-based systems
  if (process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755);
  }

  console.log(`\n[yt-dlp installer] Successfully installed yt-dlp to: ${destPath}`);
}

/**
 * Check if existing binary works
 */
function verifyBinary(binPath) {
  if (!fs.existsSync(binPath)) return false;
  try {
    const res = spawnSync(binPath, ['--version'], { encoding: 'utf-8', timeout: 8000 });
    if (res.status === 0 && res.stdout) {
      console.log(`[yt-dlp installer] Existing working version found: ${res.stdout.trim()}`);
      return true;
    }
  } catch (err) {
    console.warn(`[yt-dlp installer] Verification check failed: ${err.message}`);
  }
  return false;
}

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const { filename, url } = getPlatformConfig();
  const destPath = path.join(BIN_DIR, filename);

  const force = process.argv.includes('--force');

  if (!force && verifyBinary(destPath)) {
    console.log('[yt-dlp installer] yt-dlp is already installed and functional.');
    return;
  }

  try {
    await downloadBinary(url, destPath);
    verifyBinary(destPath);
  } catch (err) {
    console.error(`[yt-dlp installer] Error installing yt-dlp: ${err.message}`);
    // If running in postinstall, don't fail the entire npm install if offline
    if (process.env.npm_lifecycle_event === 'postinstall') {
      console.warn('[yt-dlp installer] Postinstall notice: yt-dlp will be downloaded on first app startup.');
    } else {
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getPlatformConfig,
  verifyBinary,
  downloadBinary,
  BIN_DIR
};
