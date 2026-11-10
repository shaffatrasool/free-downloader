/**
 * public/js/api.js
 * API communication layer for metadata queries, searches, job control,
 * and playlist batch downloads. Includes auto-retry with exponential backoff
 * and AbortController to safely abort stale in-flight requests.
 */

class ApiClient {
  constructor() {
    this.currentInfoController = null;
  }

  /**
   * Helper fetch with exponential backoff retry for transient network glitches
   */
  async fetchWithRetry(url, options = {}, maxRetries = 2) {
    let lastError = null;
    let delay = 600;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Do not retry on client errors (400, 404, etc.)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

        // Retry on 429 or 5xx if attempts remain
        if (!response.ok && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
          continue;
        }

        return response;
      } catch (err) {
        lastError = err;
        // Don't retry user aborted requests
        if (err.name === 'AbortError') {
          throw err;
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }

    throw lastError || new Error('Network request failed after retries.');
  }

  /**
   * Extract video / playlist metadata.
   * Cancels any prior in-flight info request to prevent race conditions.
   */
  async fetchInfo(urlOrQuery) {
    if (this.currentInfoController) {
      try {
        this.currentInfoController.abort();
      } catch (e) {}
    }

    this.currentInfoController = new AbortController();
    const { signal } = this.currentInfoController;

    try {
      const response = await this.fetchWithRetry('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlOrQuery }),
        signal
      }, 2);

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract media information.');
      }

      return data;
    } finally {
      this.currentInfoController = null;
    }
  }

  async search(query) {
    const response = await this.fetchWithRetry(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Search query failed.');
    }
    return data.data;
  }

  async pauseJob(jobId) {
    const res = await fetch(`/api/pause/${encodeURIComponent(jobId)}`, { method: 'POST' });
    return await res.json().catch(() => ({ success: false }));
  }

  async resumeJob(jobId) {
    const res = await fetch(`/api/resume/${encodeURIComponent(jobId)}`, { method: 'POST' });
    return await res.json().catch(() => ({ success: false }));
  }

  async cancelJob(jobId) {
    const res = await fetch(`/api/cancel/${encodeURIComponent(jobId)}`, { method: 'POST' });
    return await res.json().catch(() => ({ success: false }));
  }

  async downloadPlaylistZip(items, playlistTitle) {
    const response = await fetch('/api/download-playlist-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, playlistTitle })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate playlist ZIP.');
    }

    return response;
  }

  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      return await res.json();
    } catch (e) {
      return { status: 'down', error: e.message };
    }
  }
}

window.apiClient = new ApiClient();
