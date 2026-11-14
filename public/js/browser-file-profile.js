(function () {
  const app = window.BlackBook;
  const folderStart = app.showBrowserFolderStart;
  app.showBrowserFolderStart = async function (message) {
    await folderStart.call(this, message || 'Open a profile from your device or create a new one.');
    const host = document.querySelector('#page-overview .empty-state');
    if (!host) return;
    host.querySelector('.empty-state-title').textContent = 'PROFILE';
    if (!BrowserProfileStore.supported()) {
      const texts = host.querySelectorAll('.empty-state-text');
      if (texts[1]) texts[1].remove();
    }
    const hint = host.querySelector('.form-hint');
    if (hint) hint.textContent = 'File mode: open profile.json from Files, iCloud Drive, Dropbox, or your device. Edits stay in this tab until you choose SAVE FILE. Replace the original file with your exported copy before opening it on another device. Use one device at a time.';
    const section = document.createElement('section');
    section.style.cssText = 'margin:16px 0;';
    section.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="browser-profile-open-file">OPEN FILE</button><button type="button" class="btn btn-secondary" id="browser-profile-new-file">NEW PROFILE FILE</button></div><input type="file" id="browser-profile-file" accept=".json,application/json" hidden><form id="browser-profile-create-file" hidden style="margin-top:16px"><div class="form-group"><label>Profile name</label><input class="input" name="profileName" maxlength="80" required autocomplete="off"></div><div class="form-group"><label>First account</label><input class="input" name="accountName" maxlength="40" required autocomplete="off"></div><div class="form-group"><label>Currency</label><input class="input" name="currency" value="RSD" pattern="[A-Za-z]{3}" maxlength="3" required autocomplete="off"></div><button class="btn btn-primary" type="submit">CREATE PROFILE</button></form><p class="form-hint">This mode uses a plain JSON file. Keep your own backup; automatic folder saving is available only in browsers that support it.</p>';
    host.insertBefore(section, hint);
    const input = section.querySelector('input[type=file]');
    section.querySelector('#browser-profile-open-file').onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) throw new Error('Choose a Black Book JSON profile or JSON export. Encrypted profiles must be exported as JSON from the desktop app first.');
        await this.activateBrowserProfileFile(data, file.name);
      } catch (error) { alert(error.message || 'Could not open this profile.'); }
      finally { input.value = ''; }
    };
    const form = section.querySelector('form');
    section.querySelector('#browser-profile-new-file').onclick = () => { form.hidden = !form.hidden; if (!form.hidden) form.elements.profileName.focus(); };
    form.onsubmit = async event => {
      event.preventDefault();
      const name = form.elements.profileName.value.trim();
      const account = form.elements.accountName.value.trim();
      const currency = form.elements.currency.value.trim().toUpperCase();
      if (!name || !account || !/^[A-Z]{3}$/.test(currency)) return;
      const data = BrowserProfileStore.defaultProfile(name, account, currency);
      await this.activateBrowserProfileFile(data, name.replace(/[<>:"/\\|?*]/g, '_') + '.json');
      this._browserFileDirty = true;
      this.setSaveState('saved');
    };
  };

  app.activateBrowserProfileFile = async function (data, filename) {
    this._browserFileName = filename || 'profile.json';
    this._browserFileDirty = false;
    this._browserFileExported = false;
    this._browserFileInitialData = data;
    localStorage.setItem('bb_profile_storage', 'file');
    // Only the selected mode and filename are remembered. Never persist profile contents.
    localStorage.setItem('bb_profile_file_name', this._browserFileName);
    await this.init();
  };

  app.openBrowserProfileFile = async function () {
    if (this._browserFileDirty && !(await this.confirmModal({ title:'Open Another Profile', message:'Export your current changes with SAVE FILE before switching. Continue without exporting?', confirmText:'Continue', danger:true }))) return;
    localStorage.setItem('bb_profile_storage', 'file');
    this._browserFileDirty = false;
    location.reload();
  };

  app.saveBrowserProfileFile = async function () {
    if (!this._browserFileMode || !this.data || this._browserFileExportBusy) return;
    this._browserFileExportBusy = true;
    const sequence = this._saveSequence || 0;
    const filename = this._browserFileName || 'profile.json';
    try {
      const file = new File([JSON.stringify(this.stripTransient(this.data), null, 2)], filename, { type:'application/json' });
      const useShare = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      if (useShare && navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:filename });
        this.showToast('Choose Save to Files and replace your original profile.');
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.showToast('Profile exported. Replace your original file with the downloaded copy.');
      }
      this._browserFileExported = true;
      if ((this._saveSequence || 0) === sequence) this._browserFileDirty = false;
    } catch (error) {
      if (error.name !== 'AbortError') this.showToast('Export failed: ' + error.message);
    } finally {
      this._browserFileExportBusy = false;
      this.setSaveState('saved');
    }
  };

  const setStatus = app.setSaveState;
  app.setSaveState = function (state) {
    setStatus.call(this, state);
    if (!this._browserFileMode || !this.data || this._appLoading || ['loading','saving','failed','load-failed'].includes(state)) return;
    const indicator = document.getElementById('save-indicator');
    if (!indicator) return;
    indicator.querySelector('.save-label').textContent = this._browserFileDirty ? 'SAVE FILE' : this._browserFileExported ? 'EXPORTED' : 'FILE OPEN';
    indicator.classList.toggle('saving', !!this._browserFileDirty);
    indicator.title = 'Export this profile to your device. Replace the original file to keep other devices up to date.';
    indicator.onclick = () => this.saveBrowserProfileFile();
    indicator.tabIndex = 0;
    indicator.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.saveBrowserProfileFile(); } };
  };
  window.addEventListener('beforeunload', event => {
    if (!app._browserFileMode || !app._browserFileDirty) return;
    event.preventDefault(); event.returnValue = '';
  });

  const profilesList = app.refreshProfilesList;
  app.refreshProfilesList = async function () {
    if (!this._browserFileMode) return profilesList.call(this);
    const list = document.getElementById('profiles-list');
    if (list) list.innerHTML = '<div class="settings-row settings-row-active"><span class="settings-row-name">' + this.escapeHtml(this.profile) + '</span><button class="btn btn-sm btn-secondary" onclick="BlackBook.openProfileEdit()">EDIT</button><button class="btn btn-sm btn-primary" onclick="BlackBook.saveBrowserProfileFile()">SAVE FILE</button></div><p class="form-hint">' + this.escapeHtml(this._browserFileName || 'profile.json') + ' · Changes stay in this tab until exported. Replace the original file after export. Use one device at a time.</p>';
  };
  const editProfile = app.openProfileEdit;
  app.openProfileEdit = function () {
    editProfile.call(this);
    if (this._browserFileMode) for (const id of ['edit-profile-password-group','edit-profile-folder-group']) document.getElementById(id)?.classList.add('hidden');
  };
  const createProfile = app.createProfile;
  app.createProfile = function () { return this._browserFileMode ? this.openBrowserProfileFile() : createProfile.call(this); };
})();
