window.UpdateUi = {
  version: '0.0.0',
  status: null,
  _polling: false,

  async init() {
    await this.refresh(true);
    this.renderBanner();
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
    const el = document.getElementById('update-banner');
    if (!el) return;
    const s = this.status;
    if (!s || !s.updateAvailable || !s.latest) { el.classList.add('hidden'); return; }
    el.innerHTML =
      '<span class="update-banner-text">BLACK BOOK v' + this.esc(s.latest.version) + ' IS AVAILABLE</span>' +
      '<button class="btn btn-sm btn-primary" onclick="UpdateUi.updateNow()">UPDATE NOW</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="UpdateUi.dismissBanner()">LATER</button>';
    el.classList.remove('hidden');
  },

  dismissBanner() {
    const el = document.getElementById('update-banner');
    if (el) el.classList.add('hidden');
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
    const banner = document.getElementById('update-banner');
    const button = banner ? banner.querySelector('.btn-primary') : null;
    if (button) { button.disabled = true; button.textContent = 'UPDATING…'; }
    try {
      const resp = await fetch('/api/updates/apply', { method: 'POST', cache: 'no-store' });
      const result = await resp.json();
      if (!resp.ok || !result.ok) {
        alert((result && result.error) || 'Update failed. No files were changed.');
        this.renderSettings();
        return;
      }
      window.BlackBook._updating = true;
      this.showOverlay('Update installed — reconnecting to the new version…');
      this.pollForRestart();
    } catch (e) {
      alert('Could not reach the server to install the update: ' + e.message);
      if (button) { button.disabled = false; button.textContent = 'UPDATE NOW'; }
    }
  },

  showOverlay(text) {
    const overlay = document.getElementById('update-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const textEl = document.getElementById('update-overlay-text');
    if (textEl) textEl.textContent = text || '';
    const retry = document.getElementById('update-overlay-retry');
    if (retry) retry.classList.add('hidden');
  },

  onServerGone() {
    if (this._polling) return;
    window.BlackBook._updating = true;
    this.showOverlay('Waiting for the new version to start…');
    this.pollForRestart();
  },

  pollForRestart() {
    if (this._polling) return;
    this._polling = true;
    const started = Date.now();
    const attempt = async () => {
      if (Date.now() - started > 90_000) {
        this._polling = false;
        const overlay = document.getElementById('update-overlay');
        if (overlay) overlay.classList.add('hidden');
        alert('Black Book updated successfully, but the server did not come back. Please restart Black Book.');
        return;
      }
      try {
        const resp = await fetch('/api/version', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (resp.ok) {
          window.BlackBook._updating = false;
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
      html += '<div class="settings-data-actions" style="margin-top:10px;">' +
        '<button class="btn btn-secondary" id="settings-updates-check" onclick="UpdateUi.checkNow()">CHECK FOR UPDATES</button>' +
        (s && s.updateAvailable && s.latest && s.reason === 'available' ? '<button class="btn btn-primary" onclick="UpdateUi.updateNow()">UPDATE NOW</button>' : '') +
        '</div>';
      el.innerHTML = html;
    }
    const footer = document.getElementById('settings-footer-version');
    if (footer) footer.textContent = 'v' + this.version;
  }
};