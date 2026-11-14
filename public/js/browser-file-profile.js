(function () {
  const app = window.BlackBook;
  const originalShowBrowserFolderStart = app.showBrowserFolderStart;
  const originalRefreshProfilesList = app.refreshProfilesList;
  const originalSwitchProfile = app.switchProfile;
  const originalDeleteProfile = app.deleteProfile;
  const originalPasswordModal = app.passwordModal;
  const originalSubmitPasswordForm = app.submitPasswordForm;
  const originalRemovePassword = app.removePassword;
  const isProfile = value => value && typeof value === 'object' && !Array.isArray(value) &&
    Array.isArray(value.accounts) && Array.isArray(value.categories) && Array.isArray(value.transactions) &&
    value.settings && typeof value.settings === 'object';
  const validAuth = value => value && typeof value === 'object' && Object.values(value).some(entry => entry && typeof entry === 'object' && entry.salt);
  const profileNameFromFile = name => String(name || 'profile.json').replace(/\.json$/i, '');
  const safeFilename = name => String(name || 'profile').trim().replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '') || 'profile';
  const isHosted = () => !!(app && app._hostedMode);

  function showStartScreen(message, create = false) {
    app._browserFileMode = true;
    app._browserFolderMode = false;
    app.data = null;
    document.body.classList.add('bb-profile-start');
    document.querySelectorAll('.sidebar-nav-item').forEach(button => { button.disabled = true; });
    const page = document.getElementById('page-overview');
    if (!page) return;
    document.querySelectorAll('.app-workspace > .page').forEach(item => item.classList.add('hidden'));
    page.classList.remove('hidden');
    page.innerHTML = '<div class="empty-state bb-file-start-card">' +
      '<div class="empty-state-title">SELECT A PROFILE</div>' +
      '<div class="empty-state-text">' + app.escapeHtml(message || 'Create or open a profile to begin.') + '</div>' +
      '<div class="bb-file-start-actions">' +
      '<button type="button" class="btn btn-primary" id="bb-create-profile-file">NEW</button>' +
      '<button type="button" class="btn btn-primary" id="bb-open-profile-file">OPEN</button>' +
      '</div>' +
      (isHosted() ? '<div class="bb-file-demo-action"><button type="button" class="btn btn-secondary" id="bb-try-demo-profile">TRY DEMO PROFILE</button><span>Explore a sample profile.</span></div>' : '') +
      '<div class="form-hint">Your profile is not copied into browser storage or uploaded.</div></div>';
    const open = document.getElementById('bb-open-profile-file');
    const createButton = document.getElementById('bb-create-profile-file');
    if (open) open.onclick = () => app.openBrowserProfileFile();
    if (createButton) createButton.onclick = () => app.createProfile();
    const demoButton = document.getElementById('bb-try-demo-profile');
    if (demoButton) demoButton.onclick = async () => {
      demoButton.disabled = true;
      demoButton.textContent = 'OPENING DEMO…';
      const storageMode = (() => { try { return localStorage.getItem('bb_profile_storage'); } catch (_) { return null; } })();
      const storedName = (() => { try { return localStorage.getItem('bb_profile_file_name'); } catch (_) { return null; } })();
      const restore = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) {} };
      try {
        const response = await fetch(new URL('./demo-profile.json', window.location.href), { cache: 'no-store' });
        if (!response.ok) throw new Error('The demo profile could not be loaded. Try again later.');
        const profile = await response.json();
        if (!isProfile(profile)) throw new Error('The packaged demo profile is not valid.');
        await app.activateBrowserProfileFile(profile, 'BlackBook-Demo.json', null);
        app._browserFileDemo = true;
        app._browserFileDirty = false;
        app.setSaveState('saved');
      } catch (error) {
        alert(error.message || 'Could not open the demo profile.');
        demoButton.disabled = false;
        demoButton.textContent = 'TRY DEMO PROFILE';
      } finally {
        restore('bb_profile_storage', storageMode);
        restore('bb_profile_file_name', storedName);
      }
    };
    const header = document.getElementById('header-profile');
    if (header) header.textContent = '· OPEN PROFILE';
    app.setSaveState('saved');
    if (create) app.createProfile();
    BrowserFileStore.last().then(record => {
      if (!record || !document.body.classList.contains('bb-profile-start')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.textContent = 'RECONNECT LAST FILE';
      btn.onclick = async () => {
        const restored = await app.restoreBrowserProfileFile(true);
        if (restored === true) await app.init();
      };
      const actions = document.querySelector('.bb-file-start-actions');
      if (actions && !actions.contains(btn)) actions.appendChild(btn);
    }).catch(() => {});
  }

  app.showBrowserFileStart = async function (message, create = false) {
    showStartScreen(message, create);
  };
  app.showBrowserFolderStart = async function (message) {
    if (isHosted()) return showStartScreen(message);
    return originalShowBrowserFolderStart.call(this, message);
  };

  app.openBrowserProfileFile = async function () {
    if (!isHosted()) {
      try {
        const response = await fetch('/api/profile-file/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not open this profile.');
        if (!result.cancelled) this.switchProfile(result.name);
      } catch (error) { if (error.name !== 'AbortError') alert(error.message || 'Could not open this profile.'); }
      return;
    }
    if (this._browserFileDirty && !(await this.confirmModal({ title:'Open Another Profile', message:'This profile has unsaved changes. Continue without saving?', confirmText:'Continue', danger:true }))) return;
    try {
      if (typeof window.showOpenFilePicker === 'function') {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Black Book profile', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await BrowserFileStore.requestPermission(handle);
        const file = await handle.getFile();
        const parsed = JSON.parse(await file.text());
        await this.openHostedProfile(parsed, file.name, writable === 'granted' ? handle : null);
        return;
      }
      let input = document.getElementById('bb-hosted-profile-picker');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'bb-hosted-profile-picker';
        input.multiple = true;
        input.hidden = true;
        input.addEventListener('change', async () => {
          try { await this.openHostedFiles(Array.from(input.files || [])); }
          catch (error) { alert(error.message || 'Could not open this profile.'); }
          finally { input.value = ''; }
        });
        document.body.appendChild(input);
      }
      input.click();
    } catch (error) {
      if (error.name !== 'AbortError') alert(error.message || 'Could not open this profile.');
    }
  };

  app.openHostedFiles = async function (files) {
    let profile = null;
    let profileFile = null;
    let auth = null;
    for (const file of files || []) {
      try {
        const parsed = JSON.parse(await file.text());
        if (isProfile(parsed) || BrowserProfileCrypto.isEncrypted(parsed)) {
          profile = parsed;
          profileFile = file;
        } else if (validAuth(parsed)) auth = { file, data: parsed };
      } catch (_) {}
    }
    if (!profile) throw new Error('Choose a Black Book profile JSON file.');
    const legacyAuth = auth ? auth.data[profileNameFromFile(profileFile.name)] || Object.values(auth.data)[0] : null;
    await this.openHostedProfile(profile, profileFile.name, null, legacyAuth);
  };

  app.openHostedProfileHandle = async function (handle) {
    const writable = await BrowserFileStore.requestPermission(handle);
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text());
    await this.openHostedProfile(parsed, file.name, writable === 'granted' ? handle : null);
  };

  app.openHostedProfile = async function (parsed, filename, handle = null, legacyAuth = null) {
    if (!BrowserFileCryptoReady()) throw new Error('Profile password support is not ready. Reload Black Book and try again.');
    if (BrowserProfileCrypto.isEncrypted(parsed)) {
      this._browserFilePendingEnvelope = parsed;
      this._browserFilePendingAuth = legacyAuth;
      this._browserFilePendingHandle = handle;
      this._browserFilePendingName = filename || 'profile.json';
      const kdf = parsed.kdf || legacyAuth;
      if (!kdf || !kdf.salt) {
        this._browserLegacyProfile = parsed;
        this._browserLegacyProfileName = this._browserFilePendingName;
        this._browserLegacyProfileHandle = handle;
        await this.pickLegacyAuthFile();
        return;
      }
      this.showBrowserUnlock();
      return;
    }
    if (!isProfile(parsed)) throw new Error('Choose a valid Black Book profile file.');
    await this.activateBrowserProfileFile(parsed, filename, handle, null);
  };

  function BrowserFileCryptoReady() {
    return !!(window.BrowserProfileCrypto && window.BrowserProfileCrypto.isEncrypted);
  }

  app.pickLegacyAuthFile = async function () {
    this.showBrowserUnlock('This older encrypted profile uses a separate auth file. Select that file to continue.');
    const form = document.getElementById('unlock-form');
    if (form) form.classList.add('hidden');
    const box = document.querySelector('#unlock-overlay .unlock-box');
    let choose = document.getElementById('bb-select-auth-file');
    if (!choose && box) {
      choose = document.createElement('button');
      choose.type = 'button';
      choose.id = 'bb-select-auth-file';
      choose.className = 'btn btn-primary unlock-btn';
      choose.textContent = 'SELECT AUTH FILE';
      box.appendChild(choose);
    }
    let input = document.getElementById('bb-hosted-auth-picker');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'bb-hosted-auth-picker';
      input.hidden = true;
      input.addEventListener('change', async () => {
        try {
          const file = input.files && input.files[0];
          if (!file) return;
          const map = JSON.parse(await file.text());
          if (!validAuth(map)) throw new Error('Choose the auth file that belongs to this profile.');
          const name = profileNameFromFile(app._browserLegacyProfileName);
          app._browserFilePendingAuth = map[name] || Object.values(map)[0];
          if (!app._browserFilePendingAuth || !app._browserFilePendingAuth.salt) throw new Error('The selected auth file does not match this profile.');
          app._browserFilePendingEnvelope = app._browserLegacyProfile;
          app._browserFilePendingHandle = app._browserLegacyProfileHandle;
          app._browserFilePendingName = app._browserLegacyProfileName;
          app._browserLegacyProfile = null;
          app._browserLegacyProfileHandle = null;
          document.getElementById('bb-select-auth-file')?.remove();
          document.getElementById('unlock-form')?.classList.remove('hidden');
          app.showBrowserUnlock();
        } catch (error) { alert(error.message || 'Could not read the auth file.'); }
        finally { input.value = ''; }
      });
      document.body.appendChild(input);
    }
    if (choose) choose.onclick = () => input.click();
  };

  app.showBrowserUnlock = function (message = '') {
    const overlay = document.getElementById('unlock-overlay');
    if (!overlay) return;
    const select = document.getElementById('unlock-profile');
    const name = document.getElementById('unlock-profile-name');
    const text = overlay.querySelector('.unlock-text');
    const form = document.getElementById('unlock-form');
    const error = document.getElementById('unlock-error');
    if (!form) return;
    this._hostedUnlockActive = true;
    if (select) select.classList.add('hidden');
    if (name) name.textContent = profileNameFromFile(this._browserFilePendingName).toUpperCase();
    if (text) text.textContent = message || 'This profile is password-protected. Enter its password to open the file.';
    if (error) error.classList.add('hidden');
    const input = document.getElementById('unlock-password');
    input.value = '';
    overlay.classList.remove('hidden');
    form.onsubmit = event => this.submitHostedUnlock(event);
    let cancel = document.getElementById('bb-cancel-unlock');
    if (!cancel) {
      cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.id = 'bb-cancel-unlock';
      cancel.className = 'btn btn-secondary unlock-btn';
      cancel.textContent = 'CANCEL';
      overlay.querySelector('.unlock-box').appendChild(cancel);
    }
    cancel.onclick = () => this.cancelHostedUnlock();
    setTimeout(() => input.focus(), 30);
  };

  app.cancelHostedUnlock = function () {
    document.getElementById('unlock-overlay')?.classList.add('hidden');
    document.getElementById('bb-select-auth-file')?.remove();
    this._hostedUnlockActive = false;
    this._browserFilePendingEnvelope = null;
    this._browserFilePendingAuth = null;
    this._browserFilePendingHandle = null;
    this._browserLegacyProfile = null;
    this._browserLegacyProfileHandle = null;
    if (!this.data) showStartScreen();
  };

  app.submitHostedUnlock = async function (event) {
    if (event) event.preventDefault();
    const error = document.getElementById('unlock-error');
    const input = document.getElementById('unlock-password');
    error.classList.add('hidden');
    try {
      const result = await BrowserProfileCrypto.unlock(this._browserFilePendingEnvelope, input.value, this._browserFilePendingAuth);
      this._hostedUnlockActive = false;
      document.getElementById('unlock-overlay').classList.add('hidden');
      this._browserFileEncryption = result.session;
      this._browserFileHandle = this._browserFilePendingHandle || null;
      this._browserFileName = this._browserFilePendingName || 'profile.json';
      this._browserFileInitialEnvelope = this._browserFilePendingEnvelope;
      this._browserFileInitialData = result.data;
      this._browserFilePendingEnvelope = null;
      this._browserFilePendingAuth = null;
      this._browserFilePendingHandle = null;
      try {
        localStorage.setItem('bb_profile_storage', 'file');
        localStorage.setItem('bb_profile_file_name', this._browserFileName);
      } catch (_) {}
      if (this._browserFileHandle) await BrowserFileStore.remember(this._browserFileHandle, this._browserFileName);
      await this.init();
    } catch (err) {
      error.textContent = err.message || 'Wrong password or corrupted profile.';
      error.classList.remove('hidden');
      input.select();
    }
  };

  app.activateBrowserProfileFile = async function (data, filename, handle = null, encryption = null, envelope = null, initialWrite = false) {
    this._browserFileMode = true;
    this._browserFolderMode = false;
    this._browserFileHandle = handle;
    this._browserFileName = filename || 'profile.json';
    this._browserFileDirty = false;
    this._browserFileExported = false;
    this._browserFileEncryption = encryption;
    this._browserFileInitialEnvelope = envelope;
    this._browserFileInitialData = data;
    try {
      localStorage.setItem('bb_profile_storage', 'file');
      localStorage.setItem('bb_profile_file_name', this._browserFileName);
    } catch (_) {}
    if (handle) await BrowserFileStore.remember(handle, this._browserFileName);
    await this.init();
    if (initialWrite && handle) await this.save();
    else if (initialWrite) { this._browserFileDirty = true; this.setSaveState('saved'); }
  };

  app.restoreBrowserProfileFile = async function (requestPermission = false) {
    const record = await BrowserFileStore.last();
    if (!record || !record.handle) return false;
    let permission = await BrowserFileStore.permission(record.handle);
    if (permission !== 'granted' && requestPermission) permission = await BrowserFileStore.requestPermission(record.handle);
    if (permission !== 'granted') {
      this._browserFileRemembered = record;
      if (requestPermission) alert('File access was not granted. Choose OPEN FILE and select your profile.');
      return false;
    }
    try {
      this._browserFileHandle = record.handle;
      this._browserFileName = record.name || record.handle.name || 'profile.json';
      const file = await record.handle.getFile();
      const parsed = JSON.parse(await file.text());
      if (BrowserProfileCrypto.isEncrypted(parsed)) {
        this._browserFilePendingEnvelope = parsed;
        this._browserFilePendingAuth = null;
        this._browserFilePendingHandle = record.handle;
        this._browserFilePendingName = this._browserFileName;
        const kdf = parsed.kdf;
        if (!kdf || !kdf.salt) {
          this._browserLegacyProfile = parsed;
          this._browserLegacyProfileName = this._browserFilePendingName;
          this._browserLegacyProfileHandle = record.handle;
          await this.pickLegacyAuthFile();
          return 'locked';
        }
        this.showBrowserUnlock();
        return 'locked';
      }
      if (!isProfile(parsed)) throw new Error('The selected file is not a valid Black Book profile.');
      this._browserFileInitialData = parsed;
      this._browserFileMode = true;
      this._browserFolderMode = false;
      this._browserFileDirty = false;
      try {
        localStorage.setItem('bb_profile_storage', 'file');
        localStorage.setItem('bb_profile_file_name', this._browserFileName);
      } catch (_) {}
      return true;
    } catch (error) {
      this._browserFileRemembered = record;
      return false;
    }
  };

  app.leaveBrowserFileStart = async function () {
    if (this._browserFileDirty && !(await this.confirmModal({ title:'Leave Profile', message:'This file has unsaved changes. Leave without saving?', confirmText:'Leave', danger:true }))) return;
    this._browserFileInitialData = null;
    this._browserFilePendingEnvelope = null;
    this._browserFileEncryption = null;
    this._browserFileHandle = null;
    await BrowserFileStore.forget();
    this._browserFileDirty = false;
    this.data = null;
    try { localStorage.removeItem('mb_profile'); } catch (_) {}
    showStartScreen();
  };

  app.writeBrowserProfileFile = async function (data) {
    if (!this._browserFileHandle) throw new Error('Choose where to save this profile first.');
    const permission = await BrowserFileStore.permission(this._browserFileHandle);
    if (permission !== 'granted' && await BrowserFileStore.requestPermission(this._browserFileHandle) !== 'granted') throw new Error('File access was not granted. Use SAVE FILE to choose the profile again.');
    const value = this._browserFileEncryption ? await BrowserProfileCrypto.save(data, this._browserFileEncryption) : data;
    const writable = await this._browserFileHandle.createWritable();
    try {
      await writable.write(JSON.stringify(value, null, 2));
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch (_) {}
      throw error;
    }
    this._browserFileInitialEnvelope = this._browserFileEncryption ? value : null;
    this._browserFileDirty = false;
  };

  app.saveBrowserProfileFile = async function () {
    if (!this._browserFileMode || !this.data || this._browserFileExportBusy) return;
    this._browserFileExportBusy = true;
    const sequence = this._saveSequence || 0;
    let filename = this._browserFileName || 'profile.json';
    let failed = false;
    try {
      if (!this._browserFileHandle && typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Black Book profile', accept: { 'application/json': ['.json'] } }]
        });
        this._browserFileHandle = handle;
        this._browserFileName = handle.name || filename;
        filename = this._browserFileName;
        await BrowserFileStore.remember(handle, filename);
      }
      if (this._browserFileHandle) {
        await this.writeBrowserProfileFile(this.stripTransient(this.data));
        this._browserFileExported = true;
        return;
      }
      const profileData = this.stripTransient(this.data);
      const fileData = this._browserFileEncryption ? await BrowserProfileCrypto.save(profileData, this._browserFileEncryption) : profileData;
      const file = new File([JSON.stringify(fileData, null, 2)], filename, { type:'application/json' });
      const useShare = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      if (useShare && navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:filename });
        this.showToast('Choose Save to Files and replace your original profile.');
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.showToast('Profile saved as a new file. Replace the original to keep using it.');
      }
      this._browserFileExported = true;
      if ((this._saveSequence || 0) === sequence) this._browserFileDirty = false;
    } catch (error) {
      if (error.name !== 'AbortError') {
        failed = true;
        this.showToast('Could not save the profile: ' + error.message);
      }
    } finally {
      this._browserFileExportBusy = false;
      this.setSaveState(failed ? 'failed' : 'saved');
    }
  };

  const setStatus = app.setSaveState;
  app.setSaveState = function (state) {
    setStatus.call(this, state);
    if (!this._hostedMode && !this._browserFileMode && this.data && !this._appLoading && state === 'saved' && this.data.settings.autosave === false) {
      const indicator = document.getElementById('save-indicator');
      if (indicator) {
        const label = indicator.querySelector('.save-label');
        if (label) label.textContent = 'SAVE';
        indicator.title = 'Changes are kept in local recovery. Click to update the profile file.';
        indicator.onclick = () => this.flushDesktopProfile();
        indicator.tabIndex = 0;
        indicator.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.flushDesktopProfile(); } };
      }
    }
    if (!this._browserFileMode || !this.data || this._appLoading || ['loading','saving','failed','load-failed'].includes(state)) return;
    const indicator = document.getElementById('save-indicator');
    if (!indicator) return;
    const label = indicator.querySelector('.save-label');
    if (label) label.textContent = this._browserFileHandle ? (this._browserFileDirty ? 'SAVING…' : 'SAVED') : this._browserFileDirty ? 'SAVE FILE' : this._browserFileExported ? 'EXPORTED' : 'FILE OPEN';
    indicator.classList.toggle('saving', !!this._browserFileDirty);
    indicator.title = this._browserFileHandle ? 'Saved directly to this profile file.' : this._browserFileExported ? 'A replacement file was exported. Open that file next time to continue with these changes.' : 'Save a replacement profile file to your device.';
    indicator.onclick = () => this.saveBrowserProfileFile();
    indicator.tabIndex = 0;
    indicator.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.saveBrowserProfileFile(); } };
  };

  app.flushDesktopProfile = async function () {
    if (this._hostedMode || this._browserFileMode || !this.data) return;
    try {
      if (!(await this.save())) throw new Error('Could not save the changes locally.');
      const response = await fetch('/api/save-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: this.profile || '' })
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not update the profile file.');
      this.showToast('Profile file saved.');
    } catch (error) {
      this.setSaveState('failed');
      this.showToast(error.message);
    }
  };

  const flushOnLeave = () => {
    if (app._hostedMode || app._browserFileMode || !app.data || app.data.settings.autosave === false) return;
    navigator.sendBeacon('/api/save-file', new Blob([JSON.stringify({ profile: app.profile || '' })], { type: 'application/json' }));
  };
  window.addEventListener('pagehide', flushOnLeave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnLeave(); });
  window.addEventListener('beforeunload', event => {
    if (app._browserFileMode && app._browserFileDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  app.refreshProfilesList = async function () {
    if (!this._hostedMode) return originalRefreshProfilesList.call(this);
    const list = document.getElementById('profiles-list');
    if (!list) return;
    if (!this.data) {
      list.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-state-text">Open a local profile file to continue.</div></div>';
      return;
    }
    const name = this.escapeHtml(this.profile || 'Profile');
    const filename = this.escapeHtml(this._browserFileName || 'profile.json');
    list.innerHTML = '<div class="settings-row settings-row-active"><span class="settings-row-name">' + name.toUpperCase() + '</span><span class="settings-row-meta">' + filename + '</span><button class="btn btn-sm btn-secondary" id="bb-open-another-profile">OPEN FILE</button><button class="btn btn-sm btn-secondary" id="bb-forget-profile-access">FORGET ACCESS</button><button class="btn btn-sm btn-primary" onclick="BlackBook.saveBrowserProfileFile()">SAVE FILE</button></div><div class="form-hint">This file stays on your device. To use it on another device, open the same synced file there; avoid editing it on two devices at once.</div>';
    list.querySelector('#bb-open-another-profile')?.addEventListener('click', () => this.openBrowserProfileFile());
    list.querySelector('#bb-forget-profile-access')?.addEventListener('click', () => this.forgetBrowserFileAccess());
  };

  app.forgetBrowserFileAccess = async function () {
    await BrowserFileStore.forget();
    this._browserFileHandle = null;
    this.showToast('Saved file access forgotten. Use SAVE FILE to choose a location again.');
    this.setSaveState('saved');
    this.renderSettings();
  };

  const oldCreateProfile = app.createProfile;
  app.createProfile = function () {
    if (!this._hostedMode) return oldCreateProfile.call(this);
    this._creatingFolderProfile = false;
    const note = document.getElementById('new-profile-folder-note');
    if (note) note.classList.add('hidden');
    const password = document.getElementById('new-profile-password');
    const confirm = document.getElementById('new-profile-password-confirm');
    if (password) password.closest('.form-group')?.classList.remove('hidden');
    if (confirm) confirm.closest('.form-group')?.classList.remove('hidden');
    const title = document.querySelector('#new-profile-modal .modal-header h2');
    if (title) title.textContent = 'New Profile';
    const currency = document.getElementById('new-profile-currency');
    if (currency) {
      currency.innerHTML = this.allCurrencyCodes().map(code => '<option value="' + this.escapeHtml(code) + '">' + this.escapeHtml(code) + '</option>').join('');
      currency.value = (this.data && this.data.settings && this.data.settings.baseCurrency) || 'RSD';
    }
    this.resetNewProfilePassword();
    this.openModal('new-profile-modal');
    setTimeout(() => { const field = document.getElementById('new-profile-name'); if (field) field.focus(); }, 30);
  };

  const oldSubmitNewProfile = app.submitNewProfile;
  app.submitNewProfile = async function (event) {
    if (!this._hostedMode) return oldSubmitNewProfile.call(this, event);
    if (event) event.preventDefault();
    const name = document.getElementById('new-profile-name').value.trim();
    const account = document.getElementById('new-profile-account').value.trim();
    const currency = document.getElementById('new-profile-currency').value;
    const password = document.getElementById('new-profile-password').value;
    const confirm = document.getElementById('new-profile-password-confirm').value;
    if (!name || !account || !currency) return;
    if (password && password !== confirm) { alert('The passwords do not match.'); return; }
    if (this.data && this._browserFileDirty && !(await this.confirmModal({ title:'Create Another Profile', message:'The current profile has unsaved changes. Continue without saving?', confirmText:'Continue', danger:true }))) return;
    let handle = null;
    try {
      const filename = safeFilename(name) + '.json';
      if (typeof window.showSaveFilePicker === 'function') {
        handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Black Book profile', accept: { 'application/json': ['.json'] } }]
        });
      }
      const profile = BrowserProfileStore.defaultProfile(name, account, currency);
      let encryption = null;
      let envelope = null;
      if (password) {
        const result = await BrowserProfileCrypto.create(profile, password);
        encryption = result.session;
        envelope = result.envelope;
      }
      this.closeModal('new-profile-modal');
      await this.activateBrowserProfileFile(profile, handle && handle.name || filename, handle, encryption, envelope, true);
    } catch (error) {
      if (error.name !== 'AbortError') alert(error.message || 'Could not create this profile.');
    }
  };

  app.switchProfile = function (name) {
    if (this._hostedMode) return this.openBrowserProfileFile();
    return originalSwitchProfile.call(this, name);
  };
  app.deleteProfile = async function (name) {
    if (this._hostedMode) alert('Black Book does not delete your local profile file. Delete it using your device’s file manager.');
    else return originalDeleteProfile.call(this, name);
  };
  app.passwordModal = function (...args) {
    if (this._hostedMode) return alert('To change a profile password, create a new encrypted profile file and move your data into it.');
    return originalPasswordModal.apply(this, args);
  };
  app.submitPasswordForm = async function (...args) {
    if (this._hostedMode) return;
    return originalSubmitPasswordForm.apply(this, args);
  };
  app.removePassword = async function (...args) {
    if (this._hostedMode) return;
    return originalRemovePassword.apply(this, args);
  };

  const oldOpenProfileEdit = app.openProfileEdit;
  app.openProfileEdit = function () {
    oldOpenProfileEdit.call(this);
    if (this._hostedMode) {
      for (const id of ['edit-profile-password-group','edit-profile-folder-group']) document.getElementById(id)?.classList.add('hidden');
    }
  };

  const oldRenderSettings = app.renderSettings;
  app.renderSettings = function () {
    oldRenderSettings.call(this);
    if (!this._hostedMode) return;
    document.getElementById('settings-refresh-all-rates')?.remove();
    document.querySelectorAll('[onclick*="refreshRate("]').forEach(button => button.remove());
    const updates = document.getElementById('settings-updates');
    if (updates) updates.textContent = 'Automatic update checks are unavailable in the hosted version.';
    const updateSection = updates && updates.closest('.settings-section');
    if (updateSection) updateSection.classList.add('hidden');
    document.querySelectorAll('button[onclick*="BrowserFolderProfile"]').forEach(button => button.remove());
  };

  const oldRefreshRate = app.refreshRate;
  app.refreshRate = async function (code) {
    if (!this._hostedMode) return oldRefreshRate.call(this, code);
    this.showToast('Enter exchange rates manually. The hosted version does not contact an external service.');
  };
  const oldRefreshAllRates = app.refreshAllRates;
  app.refreshAllRates = async function () {
    if (!this._hostedMode) return oldRefreshAllRates.call(this);
    this.showToast('Enter exchange rates manually. The hosted version does not contact an external service.');
  };
  const oldAddCurrency = app.addCurrency;
  app.addCurrency = async function (code) {
    if (!this._hostedMode) return oldAddCurrency.call(this, code);
    const enabled = this.data.settings.enabledCurrencies || this.currencyList();
    if (!enabled.includes(code)) this.data.settings.enabledCurrencies = [...enabled, code];
    this.populateCurrencyDropdowns();
    await this.save();
    this.closeAddCurrencyModal();
    this.renderSettings();
  };

  const oldNavigate = app.navigateTo;
  app.navigateTo = function (page) {
    if (this._hostedMode && !this.data && page !== 'overview') return;
    document.body.classList.remove('bb-profile-start');
    document.querySelectorAll('.sidebar-nav-item').forEach(button => { button.disabled = false; });
    return oldNavigate.call(this, page);
  };

  const originalInit = app.init;
  app.init = async function () {
    this._hostedMode = !!(window.BlackBookDeployment && (typeof window.BlackBookDeployment.isHosted === 'function' ? window.BlackBookDeployment.isHosted() : window.BlackBookDeployment.hosted));
    if (!this._hostedMode) {
      // Desktop profiles are opened by the local server from their actual paths.
      // A browser's previous website file mode must not replace desktop startup.
      try { localStorage.setItem('bb_profile_storage', 'server'); } catch (_) {}
      this._browserFileMode = false;
      this._browserFolderMode = false;
      return originalInit.call(this);
    }
    this._browserFolderMode = false;
    this._browserFileMode = true;
    if (!this._browserFileInitialData) {
      const restored = await this.restoreBrowserProfileFile(false);
      if (restored === 'locked') {
        this._appLoading = false;
        this.setSaveState('saved');
        return;
      }
      if (!restored) {
        this._appLoading = false;
        this.setSaveState('saved');
        await this.showBrowserFileStart();
        return;
      }
    }
    document.body.classList.remove('bb-profile-start');
    document.querySelectorAll('.sidebar-nav-item').forEach(button => { button.disabled = false; });
    return originalInit.call(this);
  };

  const oldOpenInvoiceFile = app.openInvoiceFile;
  app.openInvoiceFile = async function (id) {
    if (this._hostedMode) {
      const invoice = this.data && this.data.invoices && this.data.invoices.find(item => item.id === id);
      if (invoice && invoice.filePath) {
        alert('This invoice points to a file on another device. Attach the file in this browser if you need to open it here.');
        return;
      }
    }
    return oldOpenInvoiceFile.call(this, id);
  };

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && app._hostedUnlockActive) {
      event.preventDefault();
      app.cancelHostedUnlock();
      return;
    }
    if (event.key === 'Escape' && document.body.classList.contains('bb-profile-start')) {
      event.preventDefault();
      app.leaveBrowserFileStart();
    }
  });

  const newProfileForm = document.getElementById('new-profile-form');
  if (newProfileForm && !newProfileForm._bound) {
    newProfileForm._bound = true;
    newProfileForm.addEventListener('submit', event => app.submitNewProfile(event));
  }
})();
