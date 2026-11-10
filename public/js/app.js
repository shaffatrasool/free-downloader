/**
 * public/js/app.js
 * Main frontend application logic: URL detection, metadata rendering, tab navigation,
 * native file saving, multi-language switching with popover/bottom-sheet, dark/light theme,
 * and comprehensive platform routing.
 */

// Application State
const state = {
  currentLang: localStorage.getItem('free_downloader_lang') || 'en',
  currentTheme: localStorage.getItem('free_downloader_theme') || 'dark',
  currentPlatform: 'all',
  currentMediaData: null,
  activeTab: 'video',
  selectedPlaylistItems: new Set()
};

// DOM References
const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  initTheme();
  initLanguage();
  initEventListeners();
  initPlatformRoute();
  if (window.historyManager) window.historyManager.render();
  if (window.downloadManager) window.downloadManager.init();
});

function cacheElements() {
  elements.html = document.documentElement;
  elements.searchBoxWrapper = document.querySelector('.search-box-wrapper');
  elements.urlInput = document.getElementById('urlInput');
  elements.btnClearInput = document.getElementById('btnClearInput');
  elements.btnPaste = document.getElementById('btnPaste');
  elements.btnDownload = document.getElementById('btnDownload');
  elements.platformBadge = document.getElementById('inputPlatformBadge');
  elements.platformBadgeText = document.getElementById('platformBadgeText');

  elements.skeletonLoader = document.getElementById('skeletonLoader');
  elements.resultCard = document.getElementById('resultCard');
  elements.searchResults = document.getElementById('searchResults');
  elements.searchCardsList = document.getElementById('searchCardsList');
  elements.playlistView = document.getElementById('playlistView');

  // Result card elements
  elements.mediaThumb = document.getElementById('mediaThumb');
  elements.mediaDuration = document.getElementById('mediaDuration');
  elements.mediaPlatform = document.getElementById('mediaPlatform');
  elements.mediaTitle = document.getElementById('mediaTitle');
  elements.mediaUploader = document.getElementById('mediaUploader');
  elements.mediaViews = document.getElementById('mediaViews');

  // Tabs
  elements.tabButtons = document.querySelectorAll('.result-tab-btn');
  elements.tabPanels = document.querySelectorAll('.tab-panel');
  elements.videoFormatsTable = document.getElementById('videoFormatsTable');
  elements.audioFormatsTable = document.getElementById('audioFormatsTable');
  elements.otherPanel = document.getElementById('otherPanel');

  // Modals & Panels
  elements.downloadManagerPanel = document.getElementById('downloadManagerPanel');
  elements.historyPanel = document.getElementById('historyPanel');
  elements.historySearchInput = document.getElementById('historySearchInput');
  elements.settingsModal = document.getElementById('settingsModal');
  elements.legalModal = document.getElementById('legalModal');
  elements.toastContainer = document.getElementById('toastContainer');

  // Settings & Language Controls
  elements.settingAskSave = document.getElementById('settingAskSave');
  elements.settingThemeSelect = document.getElementById('settingThemeSelect');
  elements.settingLanguageSelect = document.getElementById('settingLanguageSelect');
  elements.settingMaxParallel = document.getElementById('settingMaxParallel');
  elements.maxParallelValue = document.getElementById('maxParallelValue');
  elements.settingAutoClear = document.getElementById('settingAutoClear');
  elements.btnResetSettings = document.getElementById('btnResetSettings');
  elements.langBtn = document.getElementById('langBtn');
  elements.langPopup = document.getElementById('langPopup');
  elements.langCloseBtn = document.getElementById('langCloseBtn');
}

/**
 * Platform URL Detection
 */
const PLATFORM_DETECTORS = [
  { id: 'youtube', name: 'YouTube', color: '#ff0000', regex: /(youtube\.com|youtu\.be)/i },
  { id: 'tiktok', name: 'TikTok', color: '#00f2fe', regex: /tiktok\.com/i },
  { id: 'instagram', name: 'Instagram', color: '#e1306c', regex: /instagram\.com/i },
  { id: 'facebook', name: 'Facebook', color: '#1877f2', regex: /(facebook\.com|fb\.watch)/i },
  { id: 'twitter', name: 'Twitter / X', color: '#ffffff', regex: /(twitter\.com|x\.com)/i },
  { id: 'reddit', name: 'Reddit', color: '#ff4500', regex: /(reddit\.com|v\.redd\.it)/i },
  { id: 'pinterest', name: 'Pinterest', color: '#bd081c', regex: /(pinterest\.com|pin\.it)/i },
  { id: 'threads', name: 'Threads', color: '#ffffff', regex: /threads\.net/i },
  { id: 'dailymotion', name: 'Dailymotion', color: '#0066dc', regex: /(dailymotion\.com|dai\.ly)/i },
  { id: 'vimeo', name: 'Vimeo', color: '#1ab7ea', regex: /vimeo\.com/i },
  { id: 'twitch', name: 'Twitch', color: '#9146ff', regex: /twitch\.tv/i },
  { id: 'soundcloud', name: 'SoundCloud', color: '#ff5500', regex: /soundcloud\.com/i }
];

function detectPlatformFromUrl(text) {
  if (!text) return null;
  for (const p of PLATFORM_DETECTORS) {
    if (p.regex.test(text)) return p;
  }
  return null;
}

function updatePlatformInputIndicator(text) {
  const match = detectPlatformFromUrl(text);
  if (match) {
    elements.platformBadge.style.display = 'inline-flex';
    elements.platformBadgeText.textContent = match.name;
    elements.platformBadge.style.borderColor = match.color;
  } else {
    elements.platformBadge.style.display = 'none';
  }
}

/**
 * Clear search input bar and reset dynamic UI cards
 */
function clearSearchInput() {
  if (!elements.urlInput) return;
  elements.urlInput.value = '';
  if (elements.searchBoxWrapper) {
    elements.searchBoxWrapper.classList.remove('has-value');
  }
  updatePlatformInputIndicator('');
  if (elements.resultCard) elements.resultCard.style.display = 'none';
  if (elements.searchResults) elements.searchResults.style.display = 'none';
  if (elements.playlistView) elements.playlistView.style.display = 'none';
  state.currentMediaData = null;
  elements.urlInput.focus();
}

/**
 * Event Listeners Initialization
 */
function initEventListeners() {
  // Input live detection & clear button visibility
  elements.urlInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (elements.searchBoxWrapper) {
      elements.searchBoxWrapper.classList.toggle('has-value', val.length > 0);
    }
    updatePlatformInputIndicator(val);
  });

  // Cross (✕) clear button inside URL input bar
  if (elements.btnClearInput) {
    elements.btnClearInput.addEventListener('click', (e) => {
      e.preventDefault();
      clearSearchInput();
    });
  }

  // Keydown: Enter triggers download, Escape clears input
  elements.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAnalyze();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearSearchInput();
    }
  });

  // History search input filter
  if (elements.historySearchInput) {
    elements.historySearchInput.addEventListener('input', (e) => {
      if (window.historyManager) {
        window.historyManager.setSearchQuery(e.target.value);
      }
    });
  }

  // Paste Button
  elements.btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.urlInput.value = text.trim();
        if (elements.searchBoxWrapper) {
          elements.searchBoxWrapper.classList.add('has-value');
        }
        updatePlatformInputIndicator(text.trim());
        showToast(getTranslation('toastCopied'), 'success');
        handleAnalyze();
      }
    } catch (err) {
      elements.urlInput.focus();
      showToast('Please press Ctrl+V to paste your link.', 'info');
    }
  });

  // Download / Analyze Button
  elements.btnDownload.addEventListener('click', handleAnalyze);

  // Result Tabs Switching
  elements.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Navigation items & Platform links & Platform chips
  document.querySelectorAll('[data-platform]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const platform = el.dataset.platform;
      setPlatformRoute(platform);
      window.location.hash = platform === 'all' ? '' : platform;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Handle browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    setPlatformRoute(hash || 'all');
  });

  // Mobile navigation hamburger toggle
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const navMenu = document.getElementById('navbarMenu');
  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });
  }

  // Drawers and Modals
  document.getElementById('btnToggleManager')?.addEventListener('click', () => {
    window.downloadManager.togglePanel();
  });
  document.getElementById('btnCloseManager')?.addEventListener('click', () => {
    window.downloadManager.togglePanel(false);
  });

  document.getElementById('btnToggleHistory')?.addEventListener('click', () => {
    toggleDrawer(elements.historyPanel, true);
  });
  document.getElementById('btnCloseHistory')?.addEventListener('click', () => {
    toggleDrawer(elements.historyPanel, false);
  });
  document.getElementById('btnClearHistory')?.addEventListener('click', () => {
    if (window.historyManager) {
      window.historyManager.clearHistory();
      showToast('History cleared.', 'info');
    }
  });

  document.getElementById('btnToggleSettings')?.addEventListener('click', () => {
    toggleModal(elements.settingsModal, true);
  });
  document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
    toggleModal(elements.settingsModal, false);
  });

  // Load preferences
  initPreferences();

  // Dark/Light Mode quick toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const nextTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    updatePreference('theme', nextTheme);
  });

  // Language Popover Toggle & Selection
  if (elements.langBtn && elements.langPopup) {
    elements.langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = elements.langPopup.classList.contains('active');
      elements.langPopup.classList.toggle('active', !isOpen);
      elements.langBtn.setAttribute('aria-expanded', !isOpen);
    });

    elements.langCloseBtn?.addEventListener('click', () => {
      elements.langPopup.classList.remove('active');
      elements.langBtn.setAttribute('aria-expanded', 'false');
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!elements.langPopup.contains(e.target) && !elements.langBtn.contains(e.target)) {
        elements.langPopup.classList.remove('active');
        elements.langBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        elements.langPopup.classList.remove('active');
        elements.langBtn.setAttribute('aria-expanded', 'false');
        toggleModal(elements.settingsModal, false);
        toggleModal(elements.legalModal, false);
      }
    });

    // Language option click
    elements.langPopup.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        setLanguage(lang);
        elements.langPopup.classList.remove('active');
        elements.langBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // History action delegations (re-download and delete)
  elements.historyPanel?.addEventListener('click', (e) => {
    const redownloadBtn = e.target.closest('.btn-redownload');
    if (redownloadBtn) {
      const url = redownloadBtn.dataset.url;
      elements.urlInput.value = url;
      toggleDrawer(elements.historyPanel, false);
      handleAnalyze();
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete-hist');
    if (deleteBtn && window.historyManager) {
      window.historyManager.deleteItem(deleteBtn.dataset.id);
    }
  });

  // FAQ Accordion
  document.querySelectorAll('.faq-item-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const isOpen = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!isOpen) {
        item.classList.add('active');
      }
    });
  });

  // Legal Modal Triggers
  document.querySelectorAll('[data-legal]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openLegalModal(link.dataset.legal);
    });
  });
  document.getElementById('btnCloseLegal')?.addEventListener('click', () => {
    toggleModal(elements.legalModal, false);
  });
}

/**
 * Handle URL / Search analyze
 */
async function handleAnalyze() {
  const query = elements.urlInput.value.trim();
  if (!query) {
    showToast(getTranslation('toastEmptyInput'), 'error');
    elements.urlInput.focus();
    return;
  }

  // Disable analyze button and show skeleton loader
  elements.btnDownload.disabled = true;
  elements.skeletonLoader.style.display = 'block';
  elements.resultCard.style.display = 'none';
  elements.searchResults.style.display = 'none';
  elements.playlistView.style.display = 'none';

  try {
    const res = await window.apiClient.fetchInfo(query);

    if (res.type === 'search') {
      renderSearchResults(res.data, res.query);
    } else if (res.type === 'playlist') {
      renderPlaylistView(res.data);
    } else {
      state.currentMediaData = res.data;
      renderResultCard(res.data);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    elements.skeletonLoader.style.display = 'none';
    elements.btnDownload.disabled = false;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render Search Results Grid
 */
function renderSearchResults(items, query) {
  elements.searchResults.style.display = 'block';
  document.getElementById('searchQueryLabel').textContent = query;

  if (!items || items.length === 0) {
    elements.searchCardsList.innerHTML = `<div class="empty-state"><p>No video results found for this search.</p></div>`;
    return;
  }

  elements.searchCardsList.innerHTML = items.map(item => `
    <div class="search-card" data-url="${escapeHtml(item.url)}">
      <div class="search-card-thumb">
        <img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
        <span class="video-duration-tag">${escapeHtml(item.duration)}</span>
      </div>
      <div class="search-card-content">
        <h4 class="search-card-title">${escapeHtml(item.title)}</h4>
        <div class="search-card-meta">${escapeHtml(item.channel)} • ${escapeHtml(item.views)} views</div>
        <button class="btn btn-sm btn-primary mt-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${getTranslation('selectItem')}
        </button>
      </div>
    </div>
  `).join('');

  elements.searchCardsList.querySelectorAll('.search-card').forEach(card => {
    card.addEventListener('click', () => {
      elements.urlInput.value = card.dataset.url;
      updatePlatformInputIndicator(card.dataset.url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      handleAnalyze();
    });
  });
}

/**
 * Render Playlist View
 */
function renderPlaylistView(playlist) {
  elements.playlistView.style.display = 'block';
  document.getElementById('playlistTitle').textContent = `${playlist.title} (${playlist.entriesCount} videos)`;
  state.selectedPlaylistItems.clear();

  const list = document.getElementById('playlistEntriesList');
  list.innerHTML = playlist.entries.map((entry, idx) => `
    <div class="playlist-entry-row">
      <input type="checkbox" class="playlist-check" data-index="${idx}" data-url="${escapeHtml(entry.url)}" data-title="${encodeURIComponent(entry.title)}">
      <span class="playlist-idx" style="font-weight:700; color:var(--text-muted); width:24px;">${idx + 1}</span>
      <img src="${escapeHtml(entry.thumbnail)}" class="playlist-mini-thumb" alt="" loading="lazy">
      <div class="playlist-entry-info" style="flex:1; min-width:0;">
        <div class="playlist-entry-title" style="font-weight:600; font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(entry.title)}</div>
        <div class="playlist-entry-meta" style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(entry.duration)} • ${escapeHtml(entry.uploader)}</div>
      </div>
    </div>
  `).join('');

  // Checkbox listeners
  list.querySelectorAll('.playlist-check').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) {
        state.selectedPlaylistItems.add(chk.dataset.url);
      } else {
        state.selectedPlaylistItems.delete(chk.dataset.url);
      }
      updatePlaylistDownloadButton();
    });
  });

  // Select all / Deselect all
  document.getElementById('btnPlaylistSelectAll')?.addEventListener('click', () => {
    list.querySelectorAll('.playlist-check').forEach(chk => {
      chk.checked = true;
      state.selectedPlaylistItems.add(chk.dataset.url);
    });
    updatePlaylistDownloadButton();
  });

  document.getElementById('btnPlaylistDeselectAll')?.addEventListener('click', () => {
    list.querySelectorAll('.playlist-check').forEach(chk => {
      chk.checked = false;
    });
    state.selectedPlaylistItems.clear();
    updatePlaylistDownloadButton();
  });

  // Download ZIP
  document.getElementById('btnDownloadPlaylistZip')?.addEventListener('click', async () => {
    if (state.selectedPlaylistItems.size === 0) {
      showToast('Please select at least one video to download.', 'error');
      return;
    }

    const itemsToDownload = [];
    list.querySelectorAll('.playlist-check:checked').forEach(chk => {
      itemsToDownload.push({
        url: chk.dataset.url,
        title: decodeURIComponent(chk.dataset.title)
      });
    });

    const suggestedName = `${playlist.title}.zip`;
    const fileHandle = await window.fileSaver.promptSaveLocation(suggestedName, 'zip');
    if (fileHandle === 'CANCELLED') {
      showToast(getTranslation('toastSaveCancelled'), 'info');
      return;
    }

    showToast('Generating and streaming playlist ZIP archive...', 'info');

    window.downloadManager.enqueue({
      jobId: `zip-${Date.now()}`,
      url: playlist.url,
      type: 'zip',
      format: 'zip',
      ext: 'zip',
      filename: suggestedName,
      title: `${playlist.title} (ZIP Batch)`,
      fileHandle
    });
  });
}

function updatePlaylistDownloadButton() {
  const btn = document.getElementById('btnDownloadPlaylistZip');
  if (btn) {
    btn.textContent = `${getTranslation('btnDownloadZip')} (${state.selectedPlaylistItems.size})`;
    btn.disabled = state.selectedPlaylistItems.size === 0;
  }
}

/**
 * Quality badge helper
 */
function getQualityBadge(height) {
  const h = parseInt(height, 10);
  if (h >= 2160) return `<span class="q-badge q-badge-4k">4K UHD</span>`;
  if (h >= 1440) return `<span class="q-badge q-badge-2k">2K QHD</span>`;
  if (h >= 1080) return `<span class="q-badge q-badge-hd">Full HD</span>`;
  if (h >= 720)  return `<span class="q-badge q-badge-hd">HD</span>`;
  return `<span class="q-badge q-badge-sd">SD</span>`;
}

/**
 * Render Modern Video/Audio/Other Result Card
 */
function renderResultCard(media) {
  elements.resultCard.style.display = 'block';

  elements.mediaThumb.src = media.thumbnail;
  elements.mediaDuration.textContent = media.duration;
  elements.mediaPlatform.textContent = media.platform?.name || 'Video';
  elements.mediaPlatform.style.backgroundColor = media.platform?.color || '#00c853';

  elements.mediaTitle.textContent = media.title;
  elements.mediaUploader.textContent = media.uploader;
  elements.mediaViews.textContent = media.views;

  // 1. Render Video Formats Table
  elements.videoFormatsTable.innerHTML = media.videoFormats.map(f => `
    <tr>
      <td>
        <span class="format-badge format-mp4">${escapeHtml((f.ext || 'MP4').toUpperCase())}</span>
      </td>
      <td>
        <div class="format-res-title">
          ${getQualityBadge(f.height || f.quality)}
          <span>${escapeHtml(f.label)}</span>
        </div>
        <div class="format-res-size">${escapeHtml(f.fileSize)}</div>
      </td>
      <td class="text-end">
        <button class="btn btn-action-download" data-type="video" data-quality="${escapeHtml(f.quality)}" data-format="${escapeHtml(f.ext)}" data-size="${escapeHtml(f.fileSize)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>${getTranslation('btnDownloadFile')}</span>
        </button>
      </td>
    </tr>
  `).join('');

  // 2. Render Audio Formats Table
  elements.audioFormatsTable.innerHTML = media.audioFormats.map(a => `
    <tr>
      <td>
        <span class="format-badge format-audio">${escapeHtml(a.ext.toUpperCase())}</span>
      </td>
      <td>
        <div class="format-res-title">${escapeHtml(a.label)}</div>
        <div class="format-res-size">${escapeHtml(a.fileSize)}</div>
      </td>
      <td class="text-end">
        <button class="btn btn-action-download" data-type="audio" data-quality="${escapeHtml(a.bitrate)}" data-format="${escapeHtml(a.format)}" data-size="${escapeHtml(a.fileSize)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>${getTranslation('btnDownloadFile')}</span>
        </button>
      </td>
    </tr>
  `).join('');

  // 3. Render Other Panel (Thumbnails, Subtitles, Description)
  elements.otherPanel.innerHTML = `
    <div class="other-section">
      <h5>${getTranslation('thumbnailsTitle')}</h5>
      <div class="d-flex align-items-center gap-3">
        <img src="${escapeHtml(media.thumbnail)}" class="other-thumb-preview" alt="" loading="lazy">
        <button class="btn btn-sm btn-outline-primary btn-action-other" data-action="thumbnail">
          ${getTranslation('downloadThumbnail')} (JPG)
        </button>
      </div>
    </div>

    <div class="other-section mt-4">
      <h5>${getTranslation('descriptionTitle')}</h5>
      <p class="desc-preview" style="color:var(--text-muted); font-size:0.88rem; line-height:1.6; margin-bottom:10px;">${media.description ? escapeHtml(media.description.substring(0, 160)) + '...' : 'No description.'}</p>
      <button class="btn btn-sm btn-outline-primary btn-action-other" data-action="description">
        ${getTranslation('downloadDescription')}
      </button>
    </div>

    <div class="other-section mt-4">
      <h5>${getTranslation('subtitlesTitle')}</h5>
      ${media.subtitles && media.subtitles.length > 0 ? `
        <div class="subtitles-grid">
          ${media.subtitles.slice(0, 12).map(sub => `
            <button class="btn btn-sm btn-outline-secondary btn-action-sub" data-sub-url="${escapeHtml(sub.url)}" data-lang="${escapeHtml(sub.code)}" data-name="${escapeHtml(sub.name)}">
              ${escapeHtml(sub.name)} (${escapeHtml(sub.code.toUpperCase())})
            </button>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:0.88rem;">${getTranslation('noSubtitles')}</p>`}
    </div>
  `;

  // Attach click handler for downloads
  attachDownloadHandlers(media);

  // Switch to default Video tab
  switchTab('video');
  elements.resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Handle Download Trigger with Step C: Native Save Dialog -> Stream Write
 */
function attachDownloadHandlers(media) {
  // Video and Audio table buttons
  elements.resultCard.querySelectorAll('.btn-action-download').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const quality = btn.dataset.quality;
      const format = btn.dataset.format;
      const size = btn.dataset.size;
      const ext = format || (type === 'audio' ? 'mp3' : 'mp4');

      const cleanMediaTitle = (media.title || 'video').replace(/[\\/:*?"<>|]/g, '').trim();
      const suggestedName = `${cleanMediaTitle} - ${quality}.${ext}`;

      // STEP C: Native Save Dialog FIRST inside click gesture
      const fileHandle = await window.fileSaver.promptSaveLocation(suggestedName, ext);

      if (fileHandle === 'CANCELLED') {
        showToast(getTranslation('toastSaveCancelled'), 'info');
        return;
      }

      if (fileHandle === null) {
        showToast(getTranslation('toastFallbackSave'), 'info');
      }

      // Enqueue in Download Manager
      window.downloadManager.enqueue({
        url: media.url,
        type,
        quality,
        format,
        ext,
        filename: suggestedName,
        title: media.title,
        thumbnail: media.thumbnail,
        size,
        fileHandle
      });
    });
  });

  // Other section buttons (Thumbnails, Description)
  elements.otherPanel.querySelectorAll('.btn-action-other').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const cleanMediaTitle = (media.title || 'media').replace(/[\\/:*?"<>|]/g, '').trim();

      if (action === 'thumbnail') {
        const suggestedName = `${cleanMediaTitle} - Thumbnail.jpg`;
        const fileHandle = await window.fileSaver.promptSaveLocation(suggestedName, 'jpg');
        if (fileHandle === 'CANCELLED') return;

        window.downloadManager.enqueue({
          url: media.url,
          type: 'thumbnail',
          thumbUrl: media.thumbnail,
          ext: 'jpg',
          filename: suggestedName,
          title: `${media.title} (Thumbnail)`,
          thumbnail: media.thumbnail,
          fileHandle
        });
      } else if (action === 'description') {
        const suggestedName = `${cleanMediaTitle} - Description.txt`;
        const fileHandle = await window.fileSaver.promptSaveLocation(suggestedName, 'txt');
        if (fileHandle === 'CANCELLED') return;

        window.downloadManager.enqueue({
          url: media.url,
          type: 'description',
          ext: 'txt',
          filename: suggestedName,
          title: `${media.title} (Description)`,
          thumbnail: media.thumbnail,
          fileHandle
        });
      }
    });
  });

  // Subtitle buttons
  elements.otherPanel.querySelectorAll('.btn-action-sub').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subUrl = btn.dataset.subUrl;
      const lang = btn.dataset.lang;
      const cleanMediaTitle = (media.title || 'media').replace(/[\\/:*?"<>|]/g, '').trim();
      const suggestedName = `${cleanMediaTitle} - ${lang}.vtt`;
      const fileHandle = await window.fileSaver.promptSaveLocation(suggestedName, 'vtt');
      if (fileHandle === 'CANCELLED') return;

      window.downloadManager.enqueue({
        url: media.url,
        type: 'subtitle',
        subUrl,
        ext: 'vtt',
        filename: suggestedName,
        title: `${media.title} (Subtitle ${lang.toUpperCase()})`,
        thumbnail: media.thumbnail,
        fileHandle
      });
    });
  });
}

/**
 * Tab Navigation
 */
function switchTab(tabName) {
  state.activeTab = tabName;
  elements.tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  elements.tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
}

/**
 * Dedicated Platform Section / SEO Routing
 */
const PLATFORM_SEO = {
  all: {
    title: 'Free All Video Downloader',
    subtitle: 'Supports the Most Popular Platforms — YouTube, TikTok, Instagram, Facebook, and more.',
    placeholder: 'Enter video URL or search keyword (e.g. funny cats)...'
  },
  youtube: {
    title: 'YouTube Video & Audio Downloader',
    subtitle: 'Download YouTube Videos, Shorts, and Playlists in 4K, 1080p Full HD, or 320kbps MP3 for Free.',
    placeholder: 'Paste YouTube video, Shorts, or playlist link here...'
  },
  tiktok: {
    title: 'TikTok Video Downloader Without Watermark',
    subtitle: 'Download TikTok Videos in Crystal Clear HD Without Watermark or Extract Clean Original Audio.',
    placeholder: 'Paste TikTok video link here...'
  },
  instagram: {
    title: 'Instagram Reels & Video Downloader',
    subtitle: 'Save Instagram Reels, Posts, and Videos in High Definition Fast and Securely.',
    placeholder: 'Paste Instagram Reels or Post link here...'
  },
  facebook: {
    title: 'Facebook Video Downloader',
    subtitle: 'Download Facebook Watch Videos and Clips in 1080p Full HD and MP3 Audio.',
    placeholder: 'Paste Facebook video link here...'
  },
  twitter: {
    title: 'X / Twitter Video Downloader',
    subtitle: 'Download Videos and GIFs from X (Twitter) in Crisp Full HD with Clean Audio.',
    placeholder: 'Paste X / Twitter post URL here...'
  },
  pinterest: {
    title: 'Pinterest Video Downloader',
    subtitle: 'Save Idea Pins and HD Videos from Pinterest Directly to Your Device.',
    placeholder: 'Paste Pinterest pin link here...'
  },
  reddit: {
    title: 'Reddit Video Downloader with Sound',
    subtitle: 'Download Reddit Videos with High Quality Audio Fully Merged into Smooth MP4.',
    placeholder: 'Paste Reddit post URL here...'
  },
  threads: {
    title: 'Threads Video Downloader',
    subtitle: 'Download Videos and Media Shared on Threads in Highest Resolution.',
    placeholder: 'Paste Threads video link here...'
  },
  dailymotion: {
    title: 'Dailymotion Video Downloader',
    subtitle: 'Download Full HD Dailymotion Videos and Transcode to MP3 Effortlessly.',
    placeholder: 'Paste Dailymotion video link here...'
  },
  vimeo: {
    title: 'Vimeo Video Downloader',
    subtitle: 'Download High Quality Vimeo Showcase and Creator Videos with Pristine Sound.',
    placeholder: 'Paste Vimeo video link here...'
  },
  twitch: {
    title: 'Twitch Clips Downloader',
    subtitle: 'Save High FPS Twitch Gaming Clips Directly to Your Phone or PC.',
    placeholder: 'Paste Twitch clip URL here...'
  },
  soundcloud: {
    title: 'SoundCloud Music & Audio Downloader',
    subtitle: 'Download Tracks and Songs from SoundCloud in High Bitrate MP3.',
    placeholder: 'Paste SoundCloud track link here...'
  }
};

function setPlatformRoute(platformId) {
  state.currentPlatform = platformId;
  const config = PLATFORM_SEO[platformId] || PLATFORM_SEO.all;

  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');

  if (heroTitle) heroTitle.textContent = config.title;
  if (heroSubtitle) heroSubtitle.textContent = config.subtitle;
  document.title = `${config.title} - Free Downloader`;

  // Highlight navbar active link
  document.querySelectorAll('.nav-link[data-platform]').forEach(l => {
    l.classList.toggle('active', l.dataset.platform === platformId);
  });

  if (elements.urlInput) {
    elements.urlInput.placeholder = config.placeholder || getTranslation('inputPlaceholder');
  }
}

function initPlatformRoute() {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (PLATFORM_SEO[hash]) {
    setPlatformRoute(hash);
  }
}

/**
 * Internationalization & Multi-Language Support
 */
function getTranslation(key) {
  const dict = window.translations[state.currentLang] || window.translations.en;
  return dict[key] || window.translations.en[key] || key;
}

function setLanguage(lang) {
  if (!window.translations[lang]) return;
  state.currentLang = lang;
  localStorage.setItem('free_downloader_lang', lang);

  const dict = window.translations[lang];
  elements.html.setAttribute('lang', lang);
  elements.html.setAttribute('dir', dict.dir || 'ltr');

  // Update checkmark in language popover
  if (elements.langPopup) {
    elements.langPopup.querySelectorAll('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.lang === lang);
    });
  }

  // Translate all DOM elements containing data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key]) {
      el.placeholder = dict[key];
    }
  });

  // Re-render SEO titles for current platform if on default
  if (state.currentPlatform === 'all') {
    const heroTitle = document.getElementById('heroTitle');
    const heroSubtitle = document.getElementById('heroSubtitle');
    if (heroTitle) heroTitle.textContent = dict.heroTitle;
    if (heroSubtitle) heroSubtitle.textContent = dict.heroSubtitle;
  }
}

function initLanguage() {
  setLanguage(state.currentLang);
}

/**
 * Theme Toggle (Dark / Light Mode)
 */
function setTheme(theme) {
  state.currentTheme = theme;
  localStorage.setItem('free_downloader_theme', theme);
  elements.html.setAttribute('data-theme', theme);

  if (elements.settingThemeSelect) {
    elements.settingThemeSelect.value = theme;
  }

  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    if (theme === 'dark') {
      themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    } else {
      themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
    }
  }
}

function initTheme() {
  setTheme(state.currentTheme);
}

/**
 * Preferences Management
 */
function getPreferences() {
  try {
    return JSON.parse(localStorage.getItem('free_downloader_prefs') || '{}');
  } catch (e) {
    return {};
  }
}

function updatePreference(key, value) {
  const prefs = getPreferences();
  prefs[key] = value;
  localStorage.setItem('free_downloader_prefs', JSON.stringify(prefs));
}

function initPreferences() {
  const prefs = getPreferences();

  if (elements.settingAskSave) {
    elements.settingAskSave.checked = prefs.askSave !== undefined ? !!prefs.askSave : window.fileSaver.isAskSaveEnabled();
    elements.settingAskSave.addEventListener('change', (e) => {
      window.fileSaver.setAskSaveEnabled(e.target.checked);
      updatePreference('askSave', e.target.checked);
    });
  }

  if (elements.settingThemeSelect) {
    elements.settingThemeSelect.value = state.currentTheme;
    elements.settingThemeSelect.addEventListener('change', (e) => {
      setTheme(e.target.value);
      updatePreference('theme', e.target.value);
    });
  }

  if (elements.settingLanguageSelect) {
    elements.settingLanguageSelect.value = state.currentLang;
    elements.settingLanguageSelect.addEventListener('change', (e) => {
      setLanguage(e.target.value);
      updatePreference('lang', e.target.value);
    });
  }

  if (elements.settingMaxParallel && elements.maxParallelValue) {
    const parallel = (prefs.maxParallel >= 1 && prefs.maxParallel <= 10) ? prefs.maxParallel : 3;
    elements.settingMaxParallel.value = parallel;
    elements.maxParallelValue.textContent = parallel;
    elements.settingMaxParallel.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      elements.maxParallelValue.textContent = val;
      updatePreference('maxParallel', val);
      if (window.downloadManager) {
        window.downloadManager.setMaxParallel(val);
      }
    });
  }

  if (elements.settingAutoClear) {
    elements.settingAutoClear.checked = !!prefs.autoClearFinished;
    elements.settingAutoClear.addEventListener('change', (e) => {
      updatePreference('autoClearFinished', e.target.checked);
    });
  }

  if (elements.btnResetSettings) {
    elements.btnResetSettings.addEventListener('click', () => {
      localStorage.removeItem('free_downloader_prefs');
      setTheme('dark');
      setLanguage('en');
      window.fileSaver.setAskSaveEnabled(true);
      if (elements.settingAskSave) elements.settingAskSave.checked = true;
      if (elements.settingThemeSelect) elements.settingThemeSelect.value = 'dark';
      if (elements.settingLanguageSelect) elements.settingLanguageSelect.value = 'en';
      if (elements.settingMaxParallel) {
        elements.settingMaxParallel.value = 3;
        elements.maxParallelValue.textContent = '3';
        window.downloadManager?.setMaxParallel(3);
      }
      if (elements.settingAutoClear) elements.settingAutoClear.checked = false;
      showToast('Settings reset to defaults.', 'info');
    });
  }
}

/**
 * Drawers & Modals
 */
function toggleDrawer(drawer, open) {
  if (!drawer) return;
  drawer.classList.toggle('open', open);
}

function toggleModal(modal, open) {
  if (!modal) return;
  modal.classList.toggle('active', open);
}

function openLegalModal(type) {
  const titleEl = document.getElementById('legalModalTitle');
  const bodyEl = document.getElementById('legalModalBody');

  if (type === 'terms') {
    titleEl.textContent = 'Terms of Use';
    bodyEl.innerHTML = `
      <p>Welcome to <strong>Free Downloader</strong>. By accessing or using this service, you agree to comply with and be bound by the following terms:</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">1. Personal and Fair Use</h6>
      <p>Free Downloader is strictly intended for personal, non-commercial use. Users may only download content that they own, copyright-free content, or media for which they have acquired explicit permission from the copyright owner.</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">2. No Hosting of Media</h6>
      <p>Free Downloader does not store, archive, or host any multimedia content on its servers. All files are fetched directly from publicly accessible URLs provided by the user.</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">3. User Responsibility</h6>
      <p>Users are solely responsible for ensuring that their downloading activities comply with all applicable local, national, and international copyright laws.</p>
    `;
  } else if (type === 'privacy') {
    titleEl.textContent = 'Privacy Policy';
    bodyEl.innerHTML = `
      <p>Your privacy is our highest priority.</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">1. Zero Logging of Personal Data</h6>
      <p>Free Downloader does not require registration, login, or any personal information (no email, no names, no payment details).</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">2. Local Browser Storage Only</h6>
      <p>Your download history and preference settings (such as dark mode and language) are stored exclusively on your device using your browser's <code>localStorage</code>. No telemetry or tracking cookies are sent to our servers.</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">3. Temporary Processing</h6>
      <p>Any temporary files generated on the server for the purpose of audio conversion or stream merging are permanently deleted immediately upon transfer.</p>
    `;
  } else {
    titleEl.textContent = 'DMCA & Disclaimer';
    bodyEl.innerHTML = `
      <p>Free Downloader respects intellectual property rights and adheres to the Digital Millennium Copyright Act (DMCA).</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">1. Disclaimer of Liability</h6>
      <p>Free Downloader operates as a protocol bridge and media utility tool. We do not index or host copyrighted material. If you believe your copyrighted work is being accessed without authorization, please contact the original hosting platform where the content resides.</p>
      <h6 style="margin: 12px 0 6px; font-weight:700;">2. Contact for Legal Inquiries</h6>
      <p>For any queries or formal DMCA notices regarding this tool, please contact our administrative team.</p>
    `;
  }

  toggleModal(elements.legalModal, true);
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  if (!elements.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  elements.toastContainer.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

window.showToast = showToast;
