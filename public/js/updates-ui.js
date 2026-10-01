window.UpdateUi = {
  version: '0.0.0',
  status: null,
  _polling: false,
  _dismissed: false,
  _progress: null,
  _lastProgressKey: '',
  _targetVersion: '',

  async init() {
    await this.refresh(true);
    this.renderBanner();
    let installedVersion = '';
    try {
      installedVersion = sessionStorage.getItem('blackbook-update-installed-version') || '';
      if (installedVersion) sessionStorage.removeItem('blackbook-update-installed-version');
    } catch (_) { }
    if (installedVersion && installedVersion === this.version && window.BlackBook && window.BlackBook.showToast) {
      window.BlackBook.showToast('UPDATED TO v' + installedVersion, 5000);
    }
  },

  async refresh(force) {
    try {
      const url = '/api/updates/status' + (force ? '?refresh=1' : '');
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      this.status = await resp.json();
      if (this.status && this.status.currentVersion) this.version = this.status.currentVersion;
    } catch (_) {
      this.status = null;
    }
  },

  esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  notesPreview(notes) {
    if (!notes) return '';
    const plain = notes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain.length <= 160) return plain;
    return plain.slice(0, 157).trim() + '…';
  },

  renderBanner() {
    const el = document.getElementById('update-notice');
    if (!el) return;
    if (this._progress) {
      el.innerHTML = this.progressMarkup(this._progress);
      el.classList.add('is-progress');
      el.classList.remove('hidden');
      return;
    }
    el.classList.remove('is-progress');
    const s = this.status;
    if (this._dismissed || !s || !s.updateAvailable || s.reason !== 'available' || !s.latest) { el.classList.add('hidden'); return; }
    el.innerHTML =
      '<button class="update-notice-main" onclick="UpdateUi.openUpdates()" title="Open About & Updates"><span class="update-notice-long">UPDATE AVAILABLE · </span><span class="update-notice-short">UPDATE </span>v' + this.esc(s.latest.version) + '</button>' +
      '<button class="update-notice-dismiss" onclick="UpdateUi.dismissBanner()" title="Later" aria-label="Dismiss update notice for this run">×</button>';
    el.classList.remove('hidden');
  },

  progressMarkup(progress, inline = false) {
    const stage = progress && progress.stage || 'checking';
    const labels = {
      checking: 'Checking for update…',
      downloading: 'Downloading update',
      verifying: 'Verifying update…',
      installing: 'Installing update…',
      restarting: 'Installed · restarting…'
    };
    const version = this.esc(progress && progress.version || (this.status && this.status.latest && this.status.latest.version) || '');
    const total = Number(progress && progress.total);
    const received = Math.max(0, Number(progress && progress.received) || 0);
    const hasTotal = Number.isFinite(total) && total > 0;
    const percent = hasTotal ? Math.min(100, Math.round(received / total * 100)) : 0;
    const downloading = stage === 'downloading';
    const progressBar = downloading
      ? '<div class="update-notice-progress-bar" role="progressbar" aria-label="Downloading update v' + version + '" aria-valuemin="0" aria-valuemax="100"' + (hasTotal ? ' aria-valuenow="' + percent + '" aria-valuetext="' + percent + '%"' : ' aria-valuetext="Download in progress"') + '><span style="width:' + (hasTotal ? percent : 34) + '%"></span></div>'
      : '<div class="update-notice-progress-bar is-indeterminate" aria-hidden="true"><span></span></div>';
    const detail = downloading ? (hasTotal ? percent + '%' : 'Receiving…') : '';
    return '<div class="' + (inline ? 'update-settings-progress' : 'update-notice-progress') + '" role="status" aria-live="polite" aria-atomic="false">' +
      '<div class="update-notice-progress-title">UPDATE · v' + version + '</div>' +
      (detail ? '<div class="update-notice-progress-detail">' + this.esc(detail) + '</div>' : '') + progressBar +
      (!downloading ? '<div class="update-notice-progress-stage">' + this.esc(labels[stage] || 'Updating…') + '</div>' : '') +
      '</div>';
  },

  updateProgress(event) {
    if (!event || !event.stage) return;
    const previousStage = this._progress && this._progress.stage;
    this._progress = event;
    const total = Number(event.total);
    const percent = Number.isFinite(total) && total > 0 ? Math.floor(Math.min(100, (Number(event.received) || 0) / total * 100)) : -1;
    const key = event.stage + ':' + percent;
    if (key !== this._lastProgressKey) {
      this._lastProgressKey = key;
      this.renderBanner();
    }
    if (event.stage !== previousStage) this.renderSettings();
  },

  async readApplyResponse(response) {
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch (_) { }
      throw new Error(payload.error || 'Update failed. No files were changed.');
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      const result = await response.json();
      if (!result || !result.ok) throw new Error((result && result.error) || 'Update failed.');
      return result;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let result = null;
    const acceptLine = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.error || 'Update failed.');
      if (event.type === 'complete') result = event;
      else this.updateProgress(event);
    };
    try {
      while (true) {
        const part = await reader.read();
        pending += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
        const lines = pending.split('\n');
        pending = lines.pop();
        lines.forEach(acceptLine);
        if (part.done) break;
      }
      if (pending.trim()) acceptLine(pending);
    } finally {
      try { reader.releaseLock(); } catch (_) { }
    }
    if (!result || !result.ok) throw new Error('The update finished without a confirmation. Please check the current version and try again.');
    return result;
  },

  dismissBanner() {
    this._dismissed = true;
    const el = document.getElementById('update-notice');
    if (el) el.classList.add('hidden');
  },

  openUpdates() {
    window.BlackBook.navigateTo('settings');
    const section = document.getElementById('settings-updates');
    if (section) section.scrollIntoView({ block: 'center' });
  },

  async checkNow() {
    const btn = document.getElementById('settings-updates-check');
    if (btn) { btn.disabled = true; btn.textContent = 'CHECKING…'; }
    try {
      await this.refresh(true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'CHECK FOR UPDATES'; }
    }
    this.renderBanner();
    this.renderSettings();
  },

  async updateNow() {
    if (this._updating) return;
    this._updating = true;
    if (window.BlackBook) window.BlackBook._updating = true;
    this._progress = { stage: 'checking', version: this.status && this.status.latest && this.status.latest.version };
    this.renderBanner();
    this.renderSettings();
    try {
      const resp = await fetch('/api/updates/apply', { method: 'POST', cache: 'no-store' });
      const result = await this.readApplyResponse(resp);
      this._targetVersion = result.toVersion || '';
      this.updateProgress({ stage: 'restarting', version: this._targetVersion });
      try { if (this._targetVersion) sessionStorage.setItem('blackbook-update-installed-version', this._targetVersion); } catch (_) { }
      this.pollForRestart();
    } catch (e) {
      this._updating = false;
      if (window.BlackBook) window.BlackBook._updating = false;
      this._progress = null;
      this._lastProgressKey = '';
      this.renderBanner();
      this.renderSettings();
      if (window.BlackBook && window.BlackBook.showToast) window.BlackBook.showToast('UPDATE FAILED · ' + e.message, 6500);
    }
  },

  onServerGone() {
    if (this._polling) return;
    this._updating = true;
    window.BlackBook._updating = true;
    this.updateProgress({ stage: 'restarting', version: this._targetVersion || (this._progress && this._progress.version) });
    this.pollForRestart();
  },

  pollForRestart() {
    if (this._polling) return;
    this._polling = true;
    const started = Date.now();
    const attempt = async () => {
      if (Date.now() - started > 90_000) {
        this._polling = false;
        this._updating = false;
        if (window.BlackBook) window.BlackBook._updating = false;
        this._progress = null;
        this._lastProgressKey = '';
        this.renderBanner();
        this.renderSettings();
        if (window.BlackBook && window.BlackBook.showToast) window.BlackBook.showToast('RESTART NEEDED · Please restart Black Book.', 7000);
        return;
      }
      try {
        const resp = await fetch('/api/version', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (resp.ok) {
          const info = await resp.json();
          if (this._targetVersion && info.version !== this._targetVersion) { setTimeout(attempt, 600); return; }
          window.BlackBook._updating = false;
          this._updating = false;
          location.reload();
          return;
        }
      } catch (_) { }
      setTimeout(attempt, 1000);
    };
    setTimeout(attempt, 800);
  },

  renderSettings() {
    const el = document.getElementById('settings-updates');
    if (el) {
      const s = this.status;
      const ver = this.esc(this.version);
      let html =
        '<div class="settings-row"><span class="settings-row-name">Current version</span><span class="settings-row-meta">v' + ver + '</span></div>';
      if (s && s.reason === 'unreachable') {
        html += '<div class="settings-row"><span class="settings-row-name">Checking for updates</span><span class="settings-row-meta" style="color:var(--text-muted);">offline or not reachable</span></div>';
      } else if (s && s.updateAvailable && s.latest) {
        html += '<div class="settings-row"><span class="settings-row-name">Update available</span><span class="settings-row-meta" style="color:var(--income);">v' + this.esc(s.latest.version) + '</span></div>';
        if (s.latest.notes) html += '<div class="settings-row-note">' + this.esc(this.notesPreview(s.latest.notes)) + '</div>';
      } else if (s) {
        html += '<div class="settings-row"><span class="settings-row-name">Updates</span><span class="settings-row-meta" style="color:var(--text-muted);">You are on the latest version</span></div>';
      }
      if (this._progress) html += this.progressMarkup(this._progress, true);
      html += '<div class="settings-data-actions" style="margin-top:10px;">' +
        '<button class="btn btn-secondary" id="settings-updates-check" onclick="UpdateUi.checkNow()"' + (this._updating ? ' disabled' : '') + '>CHECK FOR UPDATES</button>' +
        (s && s.updateAvailable && s.latest && s.reason === 'available' ? '<button class="btn btn-primary" onclick="UpdateUi.updateNow()"' + (this._updating ? ' disabled' : '') + '>' + (this._updating ? 'UPDATING…' : 'UPDATE NOW') + '</button>' : '') +
        '</div>';
      el.innerHTML = html;
    }
    const footer = document.getElementById('settings-footer-version');
    if (footer) footer.textContent = 'v' + this.version;
  }
};
