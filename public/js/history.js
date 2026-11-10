/**
 * public/js/history.js
 * Manages client download history in localStorage (up to 1000 items)
 * with instant search filtering, re-download, individual delete, and clear history actions.
 */

class HistoryManager {
  constructor() {
    this.storageKey = 'free_downloader_history_v1';
    this.maxItems = 1000;
    this.searchQuery = '';
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

  getItems() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to parse history:', e);
      return [];
    }
  }

  saveItems(items) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items.slice(0, this.maxItems)));
    } catch (e) {
      console.warn('Failed to save history:', e);
    }
  }

  addItem(item) {
    const items = this.getItems();
    const newItem = {
      id: item.id || `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: item.title || 'Downloaded Media',
      url: item.url || '',
      thumbnail: item.thumbnail || '',
      type: item.type || 'video',
      quality: item.quality || 'HD',
      ext: item.ext || 'mp4',
      size: item.size || 'N/A',
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    };

    // Filter out duplicates with exact same url, quality and type
    const filtered = items.filter(i => !(i.url === newItem.url && i.quality === newItem.quality && i.type === newItem.type));
    filtered.unshift(newItem);

    this.saveItems(filtered);
    this.render();
  }

  deleteItem(id) {
    const items = this.getItems().filter(i => i.id !== id);
    this.saveItems(items);
    this.render();
  }

  clearHistory() {
    localStorage.removeItem(this.storageKey);
    this.render();
  }

  setSearchQuery(q) {
    this.searchQuery = (q || '').trim().toLowerCase();
    this.render();
  }

  render() {
    const container = document.getElementById('historyList');
    if (!container) return;

    const allItems = this.getItems();
    const countBadge = document.getElementById('historyCount');
    if (countBadge) {
      countBadge.textContent = allItems.length;
    }

    let items = allItems;
    if (this.searchQuery) {
      items = items.filter(i => 
        (i.title && i.title.toLowerCase().includes(this.searchQuery)) ||
        (i.url && i.url.toLowerCase().includes(this.searchQuery)) ||
        (i.quality && i.quality.toLowerCase().includes(this.searchQuery)) ||
        (i.ext && i.ext.toLowerCase().includes(this.searchQuery))
      );
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p>${this.searchQuery ? 'No matching downloads found.' : 'Your download history is empty.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="history-card" data-id="${this.escapeHtml(item.id)}">
        <div class="history-thumb">
          ${item.thumbnail ? `<img src="${this.escapeHtml(item.thumbnail)}" alt="" loading="lazy">` : `<div class="thumb-placeholder">${this.escapeHtml(item.ext.toUpperCase())}</div>`}
          <span class="history-type-badge">${this.escapeHtml(item.ext.toUpperCase())}</span>
        </div>
        <div class="history-info">
          <div class="history-title" title="${this.escapeHtml(item.title)}">${this.escapeHtml(item.title)}</div>
          <div class="history-meta">
            <span>${this.escapeHtml(item.quality)}</span> • <span>${this.escapeHtml(item.size)}</span> • <span class="history-date">${this.escapeHtml(item.dateStr)}</span>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-icon btn-redownload" title="Download Again" data-url="${this.escapeHtml(item.url)}" data-quality="${this.escapeHtml(item.quality)}" data-type="${this.escapeHtml(item.type)}" data-ext="${this.escapeHtml(item.ext)}" data-title="${encodeURIComponent(item.title)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="btn-icon btn-delete-hist" title="Delete from history" data-id="${this.escapeHtml(item.id)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach event listeners to redownload and delete buttons
    container.querySelectorAll('.btn-redownload').forEach(btn => {
      btn.onclick = () => {
        const url = btn.dataset.url;
        const quality = btn.dataset.quality;
        const type = btn.dataset.type;
        const ext = btn.dataset.ext;
        const title = decodeURIComponent(btn.dataset.title || 'media');
        if (window.downloadManager) {
          window.downloadManager.enqueue({
            url,
            quality,
            type,
            format: ext,
            ext,
            title,
            filename: title.replace(/[^a-zA-Z0-9_-]/g, '_')
          });
        }
      };
    });

    container.querySelectorAll('.btn-delete-hist').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.deleteItem(id);
      };
    });
  }
}

window.historyManager = new HistoryManager();
