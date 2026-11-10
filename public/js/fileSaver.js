/**
 * public/js/fileSaver.js
 * Handles file saving via the modern File System Access API (window.showSaveFilePicker)
 * with chunk-by-chunk streaming to createWritable(), and graceful fallback for
 * Firefox, Safari, and mobile devices.
 */

class FileSaver {
  constructor() {
    this.askSaveSettingKey = 'free_downloader_ask_save';
  }

  isAskSaveEnabled() {
    const val = localStorage.getItem(this.askSaveSettingKey);
    return val === null ? true : val === 'true'; // default ON
  }

  setAskSaveEnabled(enabled) {
    localStorage.setItem(this.askSaveSettingKey, enabled ? 'true' : 'false');
  }

  isFileSystemAccessSupported() {
    return typeof window.showSaveFilePicker === 'function';
  }

  /**
   * Helper to determine MIME type picker filter
   */
  getFilePickerTypes(ext) {
    const e = ext.toLowerCase();
    if (e === 'mp4') {
      return [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }];
    } else if (e === 'webm') {
      return [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }];
    } else if (e === 'mp3') {
      return [{ description: 'MP3 Audio', accept: { 'audio/mpeg': ['.mp3'] } }];
    } else if (e === 'm4a') {
      return [{ description: 'M4A Audio', accept: { 'audio/mp4': ['.m4a'] } }];
    } else if (e === 'wav') {
      return [{ description: 'WAV Audio', accept: { 'audio/wav': ['.wav'] } }];
    } else if (e === 'flac') {
      return [{ description: 'FLAC Audio', accept: { 'audio/flac': ['.flac'] } }];
    } else if (e === 'zip') {
      return [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }];
    } else if (e === 'txt') {
      return [{ description: 'Text File', accept: { 'text/plain': ['.txt'] } }];
    } else if (e === 'jpg' || e === 'jpeg') {
      return [{ description: 'JPEG Image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }];
    } else if (e === 'vtt') {
      return [{ description: 'WebVTT Subtitle', accept: { 'text/vtt': ['.vtt'] } }];
    }
    return [{ description: 'Media File', accept: { 'application/octet-stream': [`.${e}`] } }];
  }

  /**
   * Request user save location. MUST be called synchronously inside user click event!
   * Returns a fileHandle or null if user cancels.
   */
  async promptSaveLocation(suggestedName, ext = 'mp4') {
    if (!this.isFileSystemAccessSupported() || !this.isAskSaveEnabled()) {
      return null; // Fallback to standard browser download
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: this.getFilePickerTypes(ext)
      });
      return handle;
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled dialog
        return 'CANCELLED';
      }
      console.warn('File picker error, falling back:', err);
      return null;
    }
  }

  /**
   * Stream a response directly into a FileSystemFileHandle chunk-by-chunk
   */
  async streamToFileHandle(response, fileHandle, onProgress) {
    const writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get('content-length') || 0);

    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writable.write(value);
        receivedBytes += value.length;

        if (onProgress) {
          onProgress(receivedBytes, contentLength);
        }
      }

      await writable.close();
      return true;
    } catch (streamErr) {
      try {
        await writable.abort();
      } catch (e) {}
      throw streamErr;
    }
  }

  /**
   * Fallback for browsers without File System Access API
   */
  triggerBrowserDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 1000);
  }
}

window.fileSaver = new FileSaver();
