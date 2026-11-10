/**
 * public/js/downloadManager.js
 * Controls download queue with configurable concurrency (1-10, default 3),
 * live SSE progress streams, chunked File System Access writes, pause/resume/cancel,
 * live timers (⏱ mm:ss) and final average speed calculation (Avg X.X MB/s),
 * and batch management controls (Pause all, Resume all, Cancel all, Clear finished).
 */

class DownloadManager {
  constructor() {
    this.maxParallel = this.loadMaxParallel();
    this.queued = []; // array of job objects waiting to run
    this.active = new Map(); // jobId -> active job object
    this.jobs = new Map(); // jobId -> all job states
    this.isPanelOpen = false;
    this.originalDocTitle = document.title;
    this.lastProgressTime = new Map(); // jobId -> timestamp
    this.timerInterval = null;
    this.watchdogInterval = null;
  }

  loadMaxParallel() {
    try {
      const prefs = JSON.parse(localStorage.getItem('free_downloader_prefs') || '{}');
      const val = parseInt(prefs.maxParallel, 10);
      return (val >= 1 && val <= 10) ? val : 3;
    } catch (e) {
      return 3;
    }
  }

  setMaxParallel(val) {
    const num = Math.min(10, Math.max(1, parseInt(val, 10) || 3));
    this.maxParallel = num;
    this.processQueue();
  }

  init() {
    this.renderBadge();
    this.startWatchdog();
    this.startLiveTimer();
    this.bindHeaderActions();
  }

  bindHeaderActions() {
    const btnPauseAll = document.getElementById('btnPauseAll');
    if (btnPauseAll) btnPauseAll.onclick = () => this.pauseAll();

    const btnResumeAll = document.getElementById('btnResumeAll');
    if (btnResumeAll) btnResumeAll.onclick = () => this.resumeAll();

    const btnCancelAll = document.getElementById('btnCancelAll');
    if (btnCancelAll) btnCancelAll.onclick = () => this.cancelAll();

    const btnClearFinished = document.getElementById('btnClearFinished');
    if (btnClearFinished) btnClearFinished.onclick = () => this.clearFinished();
  }

  startLiveTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      // Update elapsed time for all active/downloading jobs
      for (const job of this.active.values()) {
        if (!job.isPaused && job.startedAt) {
          this.updateJobCard(job.id);
        }
      }
    }, 1000);
  }

  startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      const now = Date.now();
      for (const [jobId, job] of this.active.entries()) {
        const last = this.lastProgressTime.get(jobId) || now;
        if (now - last > 5000 && !job.isPaused && ['Preparing', 'Downloading', 'Downloading (server)', 'Merging', 'Converting', 'Saving'].includes(job.status)) {
          const card = document.getElementById(`job-card-${jobId}`);
          if (card) {
            const stageEl = card.querySelector('.job-stage-label');
            if (stageEl && !stageEl.textContent.includes('Still working')) {
              stageEl.textContent = `⏳ Still working... (${job.stage || job.status})`;
            }
          }
        }
      }
    }, 2000);
  }

  togglePanel(open) {
    const panel = document.getElementById('downloadManagerPanel');
    if (!panel) return;

    if (open !== undefined) {
      this.isPanelOpen = open;
    } else {
      this.isPanelOpen = !this.isPanelOpen;
    }

    if (this.isPanelOpen) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
  }

  getActiveCount() {
    return this.active.size;
  }

  formatTime(totalSecs) {
    if (isNaN(totalSecs) || totalSecs < 0) return '00:00';
    const s = Math.floor(totalSecs % 60);
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);
    const sStr = s < 10 ? `0${s}` : `${s}`;
    const mStr = m < 10 ? `0${m}` : `${m}`;
    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  }

  formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
    const b = Number(bytes);
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${b} B`;
  }

  enqueue(jobData) {
    // Generate unique job ID per click
    const uniqueId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const job = {
      id: uniqueId,
      url: jobData.url,
      type: jobData.type || 'video',
      quality: jobData.quality || 'best',
      format: jobData.format || 'mp4',
      ext: jobData.ext || 'mp4',
      filename: jobData.filename || 'media',
      title: jobData.title || 'Downloading media',
      thumbnail: jobData.thumbnail || '',
      size: jobData.size || 'Estimating...',
      downloadedBytes: 0,
      totalBytes: 0,
      fileHandle: jobData.fileHandle || null,
      status: 'Queued',
      stage: 'Waiting in queue...',
      percent: 0,
      speed: 'Waiting...',
      eta: '--:--',
      startedAt: null,
      finishedAt: null,
      pausedAt: null,
      totalPausedMs: 0,
      isPaused: false,
      error: null,
      eventSource: null,
      abortController: new AbortController()
    };

    this.jobs.set(job.id, job);
    this.queued.push(job);
    this.lastProgressTime.set(job.id, Date.now());

    this.togglePanel(true);
    this.render();
    this.renderBadge();
    this.processQueue();
  }

  processQueue() {
    while (this.active.size < this.maxParallel && this.queued.length > 0) {
      const nextJob = this.queued.shift();
      if (!nextJob || nextJob.status === 'Cancelled') continue;

      this.active.set(nextJob.id, nextJob);
      this.executeJob(nextJob);
    }
    this.renderBadge();
  }

  async executeJob(job) {
    job.status = 'Preparing';
    job.stage = 'Step 1/2: Preparing video on server';
    job.startedAt = job.startedAt || Date.now();
    this.lastProgressTime.set(job.id, Date.now());
    this.updateJobCard(job.id);
    this.renderBadge();

    // 1. Establish SSE Connection for live progress
    try {
      const sse = new EventSource(`/api/progress/${job.id}`);
      job.eventSource = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.lastProgressTime.set(job.id, Date.now());

          if (job.isPaused) return;

          if (data.status) job.status = data.status;
          if (data.stage) job.stage = data.stage;
          if (typeof data.percent === 'number') {
            job.percent = job.fileHandle ? Math.min(90, Math.round(data.percent * 0.9)) : data.percent;
          }
          if (data.speed) job.speed = data.speed;
          if (data.eta) job.eta = data.eta;
          if (data.size) job.size = data.size;
          if (data.downloadedBytes) job.downloadedBytes = data.downloadedBytes;
          if (data.totalBytes) job.totalBytes = data.totalBytes;
          if (data.error) job.error = data.error;

          this.updateJobCard(job.id);
          this.updateTitleProgress();
        } catch (e) {}
      };

      sse.onerror = () => {
        // SSE may close cleanly after finish or cancel
      };
    } catch (e) {
      console.warn('SSE stream error:', e);
    }

    // 2. Fetch the stream from backend
    const downloadParams = new URLSearchParams({
      jobId: job.id,
      url: job.url,
      type: job.type,
      quality: job.quality,
      format: job.format,
      filename: job.filename
    });

    const downloadUrl = `/api/download?${downloadParams.toString()}`;

    try {
      if (job.fileHandle && typeof job.fileHandle.createWritable === 'function') {
        job.stage = 'Step 2/2: Saving to your device';
        this.updateJobCard(job.id);

        const response = await fetch(downloadUrl, {
          signal: job.abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Download failed with status ${response.status}`);
        }

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > 0) job.totalBytes = contentLength;

        let received = 0;
        let lastReport = Date.now();
        let lastBytes = 0;

        const writable = await job.fileHandle.createWritable();
        const reader = response.body.getReader();

        while (true) {
          if (job.isPaused) {
            // Wait while paused
            await new Promise(r => setTimeout(r, 500));
            continue;
          }

          const { done, value } = await reader.read();
          if (done) break;

          await writable.write(value);
          received += value.length;
          job.downloadedBytes = received;

          const now = Date.now();
          if (now - lastReport >= 250) {
            const timeDiffSec = (now - lastReport) / 1000;
            const bytesDiff = received - lastBytes;
            const currentSpeed = bytesDiff / timeDiffSec;
            lastReport = now;
            lastBytes = received;

            if (contentLength > 0) {
              const filePercent = Math.round((received / contentLength) * 100);
              job.percent = Math.min(100, Math.max(job.percent, filePercent));
              const remainingBytes = Math.max(0, contentLength - received);
              const etaSec = currentSpeed > 0 ? Math.round(remainingBytes / currentSpeed) : 0;
              job.eta = etaSec > 0 ? `${etaSec}s left` : 'Almost done';
              job.size = `${(received / (1024 * 1024)).toFixed(1)} MB / ${(contentLength / (1024 * 1024)).toFixed(1)} MB`;
            } else {
              job.size = `${(received / (1024 * 1024)).toFixed(1)} MB`;
            }

            job.speed = currentSpeed >= 1024 * 1024
              ? `${(currentSpeed / (1024 * 1024)).toFixed(1)} MB/s`
              : `${(currentSpeed / 1024).toFixed(0)} KB/s`;

            this.lastProgressTime.set(job.id, now);
            this.updateJobCard(job.id);
            this.updateTitleProgress();
          }
        }

        await writable.close();
      } else {
        // Trigger browser native download stream
        window.fileSaver.triggerBrowserDownload(downloadUrl, job.filename);
      }

      job.status = 'Completed';
      job.stage = 'Completed';
      job.percent = 100;
      job.finishedAt = Date.now();

      // Compute total elapsed seconds and average speed
      const totalElapsedSec = Math.max(1, Math.round((job.finishedAt - (job.startedAt || job.finishedAt) - (job.totalPausedMs || 0)) / 1000));
      const transferredBytes = job.totalBytes || job.downloadedBytes || 0;
      let avgSpeedStr = '';
      if (transferredBytes > 0 && totalElapsedSec > 0) {
        const avgRate = transferredBytes / totalElapsedSec;
        avgSpeedStr = ` • Avg ${this.formatBytes(avgRate)}/s`;
      }
      job.finalTimeReport = `⏱ ${this.formatTime(totalElapsedSec)}${avgSpeedStr}`;
      job.speed = 'Done';
      job.eta = this.formatTime(totalElapsedSec);

      if (window.showToast) {
        window.showToast(`✓ Downloaded: ${job.title}`, 'success');
      }

      // Record in History
      if (window.historyManager) {
        window.historyManager.addItem({
          title: job.title,
          url: job.url,
          thumbnail: job.thumbnail,
          type: job.type,
          quality: job.quality,
          ext: job.ext,
          size: job.size
        });
      }

      // Auto-clear if setting enabled
      try {
        const prefs = JSON.parse(localStorage.getItem('free_downloader_prefs') || '{}');
        if (prefs.autoClearFinished) {
          setTimeout(() => this.removeJob(job.id), 2500);
        }
      } catch (e) {}
    } catch (err) {
      if (err.name === 'AbortError' || job.status === 'Cancelled') {
        job.status = 'Cancelled';
        job.stage = 'Cancelled';
      } else {
        job.status = 'Failed';
        job.stage = 'Failed';
        job.error = err.message || 'Download failed';
      }
    } finally {
      // STRICT RELEASE: delete from active and close SSE
      if (job.eventSource) {
        try {
          job.eventSource.close();
        } catch (e) {}
        job.eventSource = null;
      }

      this.active.delete(job.id);
      this.updateJobCard(job.id);
      this.renderBadge();
      this.updateTitleProgress();
      this.processQueue();
    }
  }

  async pauseJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || ['Completed', 'Failed', 'Cancelled'].includes(job.status)) return;

    job.isPaused = true;
    job.pausedAt = Date.now();
    job.status = 'Paused';
    job.stage = 'Download Paused';
    job.speed = 'Paused';

    try {
      await fetch(`/api/pause/${jobId}`, { method: 'POST' });
    } catch (e) {}

    this.updateJobCard(jobId);
    this.renderBadge();
  }

  async resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'Paused') return;

    if (job.pausedAt) {
      job.totalPausedMs += (Date.now() - job.pausedAt);
      job.pausedAt = null;
    }
    job.isPaused = false;
    job.status = 'Downloading';
    job.stage = 'Resuming download...';
    job.speed = 'Reconnecting...';

    try {
      await fetch(`/api/resume/${jobId}`, { method: 'POST' });
    } catch (e) {}

    this.updateJobCard(jobId);
    this.renderBadge();
  }

  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'Cancelled';
    job.stage = 'Cancelled';
    job.percent = 0;
    job.speed = 'Cancelled';

    if (job.abortController) {
      try {
        job.abortController.abort();
      } catch (e) {}
    }

    if (job.eventSource) {
      try {
        job.eventSource.close();
      } catch (e) {}
      job.eventSource = null;
    }

    // Call server cancel to taskkill child process and wipe .part files
    try {
      await fetch(`/api/cancel/${jobId}`, { method: 'POST' });
    } catch (e) {}

    // Remove from waiting queue if queued
    this.queued = this.queued.filter(q => q.id !== jobId);
    this.active.delete(jobId);

    this.updateJobCard(jobId);
    this.renderBadge();
    this.updateTitleProgress();
    this.processQueue();
  }

  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      this.cancelJob(jobId);
      this.jobs.delete(jobId);
      this.active.delete(jobId);
      this.queued = this.queued.filter(q => q.id !== jobId);
    }
    this.render();
    this.renderBadge();
  }

  retryJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'Queued';
    job.stage = 'Waiting in queue...';
    job.percent = 0;
    job.speed = 'Waiting...';
    job.startedAt = null;
    job.finishedAt = null;
    job.pausedAt = null;
    job.totalPausedMs = 0;
    job.isPaused = false;
    job.error = null;
    job.abortController = new AbortController();

    this.queued.push(job);
    this.updateJobCard(jobId);
    this.renderBadge();
    this.processQueue();
  }

  pauseAll() {
    for (const job of this.active.values()) {
      if (!job.isPaused) this.pauseJob(job.id);
    }
  }

  resumeAll() {
    for (const job of this.jobs.values()) {
      if (job.isPaused) this.resumeJob(job.id);
    }
  }

  cancelAll() {
    for (const job of this.jobs.values()) {
      if (!['Completed', 'Failed', 'Cancelled'].includes(job.status)) {
        this.cancelJob(job.id);
      }
    }
    this.queued = [];
    this.active.clear();
    this.render();
    this.renderBadge();
  }

  clearFinished() {
    for (const [id, job] of this.jobs.entries()) {
      if (['Completed', 'Failed', 'Cancelled'].includes(job.status)) {
        this.jobs.delete(id);
      }
    }
    this.render();
    this.renderBadge();
  }

  updateTitleProgress() {
    let maxPercent = -1;
    for (const job of this.active.values()) {
      if (job.percent > maxPercent) {
        maxPercent = job.percent;
      }
    }

    if (maxPercent >= 0) {
      document.title = `(${maxPercent}%) Free Downloader`;
    } else {
      document.title = this.originalDocTitle || 'Free All Video Downloader';
    }
  }

  renderBadge() {
    const badge = document.getElementById('activeDownloadsBadge');
    const pill = document.getElementById('managerActivePill');
    const activeCount = this.active.size;

    if (badge) {
      badge.textContent = activeCount;
      badge.style.display = activeCount > 0 ? 'inline-flex' : 'none';
    }

    if (pill) {
      pill.textContent = `${activeCount} active`;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  updateJobCard(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const el = document.getElementById(`job-card-${jobId}`);
    if (!el) {
      this.render();
      return;
    }

    const stageEl = el.querySelector('.job-stage-label');
    const percentEl = el.querySelector('.job-percent-text');
    const sizeEl = el.querySelector('.job-size-text');
    const speedEl = el.querySelector('.job-speed-text');
    const etaEl = el.querySelector('.job-eta-text');
    const progressBar = el.querySelector('.job-progress-fill');
    const actionsContainer = el.querySelector('.job-actions-row');

    if (stageEl) stageEl.textContent = job.stage || job.status;
    if (percentEl) percentEl.textContent = `${job.percent}%`;
    if (sizeEl) sizeEl.textContent = job.size || '';
    if (speedEl) speedEl.textContent = job.speed ? `⚡ ${job.speed}` : '';

    // BUG 6: Live timer display
    if (etaEl) {
      if (job.status === 'Completed') {
        etaEl.textContent = job.finalTimeReport || `⏱ ${this.formatTime(Math.max(1, Math.round((job.finishedAt - job.startedAt) / 1000)))}`;
      } else if (job.startedAt) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - job.startedAt - (job.totalPausedMs || 0)) / 1000));
        const liveElapsed = `⏱ ${this.formatTime(elapsedSec)}`;
        etaEl.textContent = job.eta && job.eta !== '--:--' ? `${liveElapsed} (ETA ${job.eta})` : liveElapsed;
      } else {
        etaEl.textContent = job.eta ? `⏱ ${job.eta}` : '';
      }
    }

    if (progressBar) {
      progressBar.style.width = `${job.percent}%`;
      progressBar.className = `job-progress-fill ${job.status.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    }

    if (actionsContainer) {
      if (job.status === 'Completed') {
        actionsContainer.innerHTML = `
          <span class="badge-success">✓ Completed</span>
          <button class="btn-job-action" onclick="window.downloadManager.retryJob('${job.id}')" title="Download Again">Download again</button>
          <button class="btn-job-action btn-job-remove" onclick="window.downloadManager.removeJob('${job.id}')" title="Remove from list">Remove</button>
        `;
      } else if (['Failed', 'Cancelled'].includes(job.status)) {
        actionsContainer.innerHTML = `
          <span class="text-danger" style="font-size:0.75rem;">${this.escapeHtml(job.error || job.status)}</span>
          <button class="btn-job-action" onclick="window.downloadManager.retryJob('${job.id}')" title="Retry">Retry</button>
          <button class="btn-job-action btn-job-remove" onclick="window.downloadManager.removeJob('${job.id}')" title="Remove">Remove</button>
        `;
      } else if (job.isPaused) {
        actionsContainer.innerHTML = `
          <span class="badge-paused">⏸ Paused</span>
          <button class="btn-job-action btn-job-resume" onclick="window.downloadManager.resumeJob('${job.id}')" title="Resume Download">Resume</button>
          <button class="btn-job-action btn-job-cancel" onclick="window.downloadManager.cancelJob('${job.id}')" title="Cancel">Cancel</button>
        `;
      } else {
        actionsContainer.innerHTML = `
          <button class="btn-job-action btn-job-pause" onclick="window.downloadManager.pauseJob('${job.id}')" title="Pause Download">Pause</button>
          <button class="btn-job-action btn-job-cancel" onclick="window.downloadManager.cancelJob('${job.id}')" title="Cancel">Cancel</button>
        `;
      }
    }
  }

  render() {
    const list = document.getElementById('downloadJobsList');
    if (!list) return;

    if (this.jobs.size === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <p>No active downloads</p>
        </div>
      `;
      return;
    }

    const items = Array.from(this.jobs.values()).reverse();
    list.innerHTML = items.map(job => {
      let actionsHtml = '';
      if (job.status === 'Completed') {
        actionsHtml = `
          <span class="badge-success">✓ Completed</span>
          <button class="btn-job-action" onclick="window.downloadManager.retryJob('${job.id}')">Download again</button>
          <button class="btn-job-action btn-job-remove" onclick="window.downloadManager.removeJob('${job.id}')">Remove</button>
        `;
      } else if (['Failed', 'Cancelled'].includes(job.status)) {
        actionsHtml = `
          <span class="text-danger" style="font-size:0.75rem;">${this.escapeHtml(job.error || job.status)}</span>
          <button class="btn-job-action" onclick="window.downloadManager.retryJob('${job.id}')">Retry</button>
          <button class="btn-job-action btn-job-remove" onclick="window.downloadManager.removeJob('${job.id}')">Remove</button>
        `;
      } else if (job.isPaused) {
        actionsHtml = `
          <span class="badge-paused">⏸ Paused</span>
          <button class="btn-job-action btn-job-resume" onclick="window.downloadManager.resumeJob('${job.id}')">Resume</button>
          <button class="btn-job-action btn-job-cancel" onclick="window.downloadManager.cancelJob('${job.id}')">Cancel</button>
        `;
      } else {
        actionsHtml = `
          <button class="btn-job-action btn-job-pause" onclick="window.downloadManager.pauseJob('${job.id}')">Pause</button>
          <button class="btn-job-action btn-job-cancel" onclick="window.downloadManager.cancelJob('${job.id}')">Cancel</button>
        `;
      }

      let timeText = '';
      if (job.status === 'Completed') {
        timeText = job.finalTimeReport || `⏱ ${this.formatTime(Math.max(1, Math.round((job.finishedAt - job.startedAt) / 1000)))}`;
      } else if (job.startedAt) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - job.startedAt - (job.totalPausedMs || 0)) / 1000));
        timeText = `⏱ ${this.formatTime(elapsedSec)}`;
      } else {
        timeText = job.eta ? `⏱ ${job.eta}` : '';
      }

      return `
        <div class="download-job-card" id="job-card-${job.id}">
          <div class="job-header-row">
            <div class="job-thumb">
              ${job.thumbnail ? `<img src="${this.escapeHtml(job.thumbnail)}" alt="" loading="lazy">` : `<div class="job-thumb-icon">${job.ext.toUpperCase()}</div>`}
            </div>
            <div class="job-details">
              <div class="job-title" title="${this.escapeHtml(job.title)}">${this.escapeHtml(job.title)}</div>
              <div class="job-stage-label">${this.escapeHtml(job.stage || job.status)}</div>
            </div>
          </div>

          <div class="job-progress-track">
            <div class="job-progress-fill ${job.status.toLowerCase().replace(/[^a-z0-9]/g, '-')}" style="width: ${job.percent}%"></div>
          </div>

          <div class="job-metrics-row">
            <div class="job-metrics-left">
              <span class="job-size-text">${this.escapeHtml(job.size || '')}</span>
              <span class="job-speed-text">${job.speed ? `⚡ ${this.escapeHtml(job.speed)}` : ''}</span>
              <span class="job-eta-text">${timeText}</span>
            </div>
            <div class="job-metrics-right">
              <span class="job-percent-text">${job.percent}%</span>
            </div>
          </div>

          <div class="job-actions-row">
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');
  }
}

window.downloadManager = new DownloadManager();
