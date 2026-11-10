/**
 * src/services/jobManager.js
 * Tracks active download jobs, manages Server-Sent Events (SSE) connections,
 * processes real-time progress events, handles pause/resume/cancellation,
 * and ensures automatic release of resources and socket cleanup.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const { JOB_STATUS } = require('../config/constants');

class JobManager {
  constructor() {
    this.jobs = new Map(); // jobId -> job object
    this.watchdogTimer = setInterval(() => this.runWatchdog(), 10 * 1000);
  }

  createJob(jobId, initialData = {}) {
    const job = {
      id: jobId,
      url: initialData.url || '',
      title: initialData.title || 'Downloading...',
      thumbnail: initialData.thumbnail || '',
      status: initialData.status || JOB_STATUS.PREPARING,
      stage: initialData.stage || 'Preparing media on server...',
      percent: 0,
      speed: '0 KB/s',
      eta: '--:--',
      size: initialData.size || 'Calculating...',
      downloadedBytes: 0,
      totalBytes: 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      tempFilePath: null,
      childProcess: null,
      clients: new Set(),
      pingTimers: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      isPaused: false
    };

    this.jobs.set(jobId, job);
    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  setProcess(jobId, childProcess, tempFilePath = null) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.childProcess = childProcess;
      if (tempFilePath) job.tempFilePath = tempFilePath;
    }
  }

  addSSEClient(jobId, res) {
    let job = this.jobs.get(jobId);
    if (!job) {
      job = this.createJob(jobId);
    }

    job.clients.add(res);

    // Call flushHeaders if available
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Send immediate snapshot of current job state
    this.sendEventToClient(res, {
      jobId: job.id,
      title: job.title,
      thumbnail: job.thumbnail,
      status: job.status,
      stage: job.stage || job.status,
      percent: job.percent,
      speed: job.speed,
      eta: job.eta,
      size: job.size,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      speedBytesPerSec: job.speedBytesPerSec,
      etaSeconds: job.etaSeconds,
      error: job.error
    });

    // Heartbeat ping timer every 15s
    const pingTimer = setInterval(() => {
      try {
        res.write(': ping\n\n');
        if (typeof res.flush === 'function') res.flush();
      } catch (e) {
        clearInterval(pingTimer);
      }
    }, 15000);

    job.pingTimers.set(res, pingTimer);

    // Cleanup when client disconnects
    res.on('close', () => {
      clearInterval(pingTimer);
      job.pingTimers.delete(res);
      job.clients.delete(res);
    });
  }

  sendEventToClient(clientRes, data) {
    try {
      clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof clientRes.flush === 'function') {
        clientRes.flush();
      }
    } catch (e) {
      // client connection likely terminated
    }
  }

  updateProgress(jobId, data) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.updatedAt = Date.now();
    if (data.status) job.status = data.status;
    if (data.stage) job.stage = data.stage;
    if (typeof data.percent === 'number') job.percent = Math.min(100, Math.max(0, data.percent));
    if (data.speed !== undefined) job.speed = data.speed;
    if (data.eta !== undefined) job.eta = data.eta;
    if (data.size !== undefined) job.size = data.size;
    if (data.title) job.title = data.title;
    if (data.thumbnail) job.thumbnail = data.thumbnail;
    if (data.error) job.error = data.error;
    if (typeof data.downloadedBytes === 'number') job.downloadedBytes = data.downloadedBytes;
    if (typeof data.totalBytes === 'number') job.totalBytes = data.totalBytes;
    if (typeof data.speedBytesPerSec === 'number') job.speedBytesPerSec = data.speedBytesPerSec;
    if (typeof data.etaSeconds === 'number') job.etaSeconds = data.etaSeconds;

    const payload = {
      jobId: job.id,
      title: job.title,
      thumbnail: job.thumbnail,
      status: job.status,
      stage: job.stage || job.status,
      percent: job.percent,
      speed: job.speed,
      eta: job.eta,
      size: job.size,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      speedBytesPerSec: job.speedBytesPerSec,
      etaSeconds: job.etaSeconds,
      error: job.error
    };

    for (const client of job.clients) {
      this.sendEventToClient(client, payload);
    }

    // If job reached a terminal state, close SSE clients cleanly after short delay
    // to prevent browser socket exhaustion!
    if ([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(job.status)) {
      job.finishedAt = Date.now();
      setTimeout(() => {
        this.closeAllClients(job);
      }, 500);
    }
  }

  closeAllClients(job) {
    for (const client of job.clients) {
      const ping = job.pingTimers.get(client);
      if (ping) clearInterval(ping);
      try {
        client.end();
      } catch (e) {}
    }
    job.clients.clear();
    job.pingTimers.clear();
  }

  pauseJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.isPaused = true;
    job.status = 'Paused';
    job.stage = 'Download Paused';

    // Terminate child process but DO NOT delete .part files!
    if (job.childProcess && !job.childProcess.killed) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', job.childProcess.pid.toString(), '/f', '/t']);
        } else {
          job.childProcess.kill('SIGSTOP');
        }
      } catch (e) {
        console.error(`Failed to stop process for paused job ${jobId}:`, e.message);
      }
    }

    this.updateProgress(jobId, {
      status: 'Paused',
      stage: 'Download Paused',
      speed: '0 KB/s'
    });

    return true;
  }

  resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.isPaused = false;
    job.status = JOB_STATUS.PREPARING;
    job.stage = 'Resuming download...';

    this.updateProgress(jobId, {
      status: JOB_STATUS.PREPARING,
      stage: 'Resuming download...',
      speed: 'Reconnecting...'
    });

    return true;
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Terminate child process if running
    if (job.childProcess && !job.childProcess.killed) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', job.childProcess.pid.toString(), '/f', '/t']);
        } else {
          job.childProcess.kill('SIGTERM');
        }
      } catch (e) {
        console.error(`Failed to kill process for job ${jobId}:`, e.message);
      }
    }

    // Clean up temporary file and part files if exists
    if (job.tempFilePath) {
      try {
        if (fs.existsSync(job.tempFilePath)) {
          fs.unlinkSync(job.tempFilePath);
        }
        const partFile = `${job.tempFilePath}.part`;
        if (fs.existsSync(partFile)) {
          fs.unlinkSync(partFile);
        }
      } catch (e) {}
    }

    this.updateProgress(jobId, {
      status: JOB_STATUS.CANCELLED,
      stage: 'Cancelled',
      percent: 0,
      speed: '0 KB/s',
      eta: '--:--'
    });

    return true;
  }

  runWatchdog() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      // 1. Stalled job check: if downloading/merging and no update for 60s
      if ([JOB_STATUS.DOWNLOADING, JOB_STATUS.MERGING, JOB_STATUS.CONVERTING].includes(job.status)) {
        if (!job.isPaused && (now - job.updatedAt > 60 * 1000)) {
          console.warn(`[Watchdog] Job ${jobId} stalled for >60s. Terminating.`);
          this.cancelJob(jobId);
          this.updateProgress(jobId, {
            status: JOB_STATUS.FAILED,
            stage: 'Failed (Connection timed out)',
            error: 'Download stalled or timed out from server side.'
          });
        }
      }

      // 2. Cleanup finished jobs older than 30 minutes from memory
      if ([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(job.status)) {
        if (now - job.updatedAt > 30 * 60 * 1000) {
          this.closeAllClients(job);
          this.jobs.delete(jobId);
        }
      }
    }
  }
}

// Export singleton instance
module.exports = new JobManager();
