const validBrowserProfile = value => value && Array.isArray(value.accounts) && Array.isArray(value.transactions) && Array.isArray(value.categories);

window.BlackBook = {
  data: null,
  profile: localStorage.getItem('mb_profile') || '',
  currentPage: 'overview',
  selectedAccount: null,
  selectedCategories: null,
  viewMonth: new Date().getMonth(),
  viewYear: new Date().getFullYear(),
  hoveredTxId: null,
  selectedTxIds: [],
  lastClickedTxId: null,
  activeFilters: { accounts: [], categories: [], search: '', dateFrom: '', dateTo: '' },
  billsChart: null,
  overviewPieChart: null,
  overviewLineChart: null,
  forecastChart: null,
  savingsChart: null,
  _cmdPaletteIndex: -1,
  _cmdPaletteItems: [],
  _ovSortBy: 'date',
  _ovSortDir: 'desc',
  _undoHistory: null,
  _undoBaseline: null,
  _undoReady: false,
  _undoBusy: false,
  _saveQueue: Promise.resolve(),
  _appLoading: true,
  _browserFolderMode: false,
  _hostedMode: false,
  _localProfileRecord: null,
  _localProfileBase: null,

  async init() {
    this._appLoading = true;
    this.setSaveState('loading');
    this.enhancePasswordFields();
    let response = { status: 200 };
    this._browserFolderMode = !this._hostedMode && localStorage.getItem('bb_profile_storage') === 'folder';
    this._browserFileMode = !!this._hostedMode || localStorage.getItem('bb_profile_storage') === 'file';
    if (this._browserFileMode) {
      if (!this._browserFileInitialData) { await this.showBrowserFolderStart(); return; }
      this.data = this._browserFileInitialData;
      this._browserFileInitialData = null;
      this.profile = this.data.settings && this.data.settings.profileName || this._browserFileName || 'Profile';
      this._transactionLoad = null;
      this._firstRun = false;
    } else if (this._browserFolderMode) {
      try {
        const record = await BrowserProfileStore.get(localStorage.getItem('bb_folder_profile') || '');
        if (!record) { await this.showBrowserFolderStart('Reconnect or choose the folder that contains this profile.'); return; }
        const loaded = await BrowserProfileStore.load(record);
        if (loaded.permissionRequired) { this.showBrowserFolderReconnect(record); return; }
        if (!validBrowserProfile(loaded.data)) throw new Error('The selected folder does not contain a valid Black Book profile.');
        this._localProfileRecord = record;
        this._localProfileWriterId = BrowserProfileStore.writerId(record.id);
        this._localProfileBase = structuredClone(loaded.data);
        this._localProfileFileStamp = loaded.stamp;
        this.profile = record.name;
        localStorage.setItem('mb_profile', record.name);
        this._transactionLoad = null;
        this._firstRun = false;
        this.data = loaded.data;
      } catch (error) {
        await this.showBrowserFolderStart(error.message || 'Could not open the profile folder.');
        return;
      }
    } else {
      try {
        const profilesResponse = await fetch('/api/profiles');
        const profilesInfo = await profilesResponse.json();
        if (!profilesResponse.ok) throw new Error(profilesInfo.error || 'Could not list profiles.');
        const profiles = profilesInfo.profiles || [];
        if ((!this.profile || !profiles.some(p => p.name === this.profile)) && profilesInfo.lastUsedProfile !== null && profilesInfo.lastUsedProfile !== undefined &&
            (!profilesInfo.lastUsedProfile || profiles.some(p => p.name === profilesInfo.lastUsedProfile))) {
          this.profile = profilesInfo.lastUsedProfile;
        }
        if (this.profile && !profiles.some(p => p.name === this.profile)) {
          this.profile = '';
          localStorage.removeItem('mb_profile');
        }
        this._firstRun = !profiles.length;
        if (!this.profile && profiles.length) this.profile = profiles[0].name;
        response = await fetch('/api/load?initialTransactions=1000' + (this.profile ? '&profile=' + encodeURIComponent(this.profile) : ''));
        if (response.status !== 401) {
          const loaded = await response.json();
          if (!response.ok || !validBrowserProfile(loaded)) throw new Error(loaded.error || 'The server returned an invalid profile.');
          this._transactionLoad = loaded._transactionLoad || null;
          this._partialLoadSaveOccurred = false;
          if (this._transactionLoad) {
            const load = this._transactionLoad;
            load.sourceIndex = Symbol('transactionLoadSourceIndex');
            (load.firstIndexes || []).forEach((index, transactionIndex) => {
              const transaction = loaded.transactions[transactionIndex];
              if (Number.isSafeInteger(index) && transaction && typeof transaction === 'object') {
                Object.defineProperty(transaction, load.sourceIndex, { value: index, configurable: true });
              }
            });
          }
          delete loaded._transactionLoad;
          this.data = loaded;
        }
      } catch (error) {
        if (window.BrowserProfileStore) {
          await this.showBrowserFolderStart('Open a profile from your device, or create a new profile.');
          return;
        }
        this._appLoading = false;
        this.setSaveState('saved');
        this.applyTheme();
        document.getElementById('page-overview').innerHTML =
          '<div class="empty-state"><div class="empty-state-title">LOADING FAILED</div><div class="empty-state-text">' + this.escapeHtml(error.message || 'Could not load data from the Black Book server.') + ' Your existing files have not been changed. Check the profile folder permissions, then retry.</div>' +
          '<div style="margin-top:14px;"><button class="btn btn-primary" onclick="location.reload()">RETRY</button></div></div>';
        return;
      }
    }
    if (!this._browserFolderMode && response.status === 401) {
      this._appLoading = false;
      this.setSaveState('saved');
      this.showUnlockOverlay(this.profile);
      return;
    }
    if (!this.data.bills) this.data.bills = [];
    if (!this.data.billPayments) this.data.billPayments = [];
    if (!this.data.savingsGoals) this.data.savingsGoals = [];
    if (!this.data.budgets) this.data.budgets = [];
    if (!this.data.budgetAllocations) this.data.budgetAllocations = [];
    if (!this.data.installments) this.data.installments = [];
    if (!this.data.debts) this.data.debts = [];
    if (!this.data.invoices) this.data.invoices = [];
    if (!this.data.recurringTemplates) this.data.recurringTemplates = [];
    if (!this.data.reconciliations) this.data.reconciliations = [];
    if (!this.data.importRules) this.data.importRules = [];
    if (!this.data.recurringRules) this.data.recurringRules = [];
    if (!this.data.settings) this.data.settings = {};
    if (this.migrateCreditCards()) await this.save();
    if (!this._transactionLoad && this.migrateTransfers()) await this.save();
    if (this.normalizeLegacyCurrencySettings()) await this.save();
    if (!(this.data.categories || []).some(c => c && c.name && String(c.name).toLowerCase() === 'invoice')) {
      this.invoiceCategory();
      await this.save();
    }
    let signFixed = false;
    if (!this._transactionLoad) {
      for (const t of (this.data.transactions || [])) {
        if (!t || typeof t.amount !== 'number') continue;
        if (t.type === 'expense' && t.amount > 0) { t.amount = -t.amount; signFixed = true; }
        else if (t.type === 'income' && t.amount < 0) { t.amount = -t.amount; signFixed = true; }
      }
    }
    if (signFixed) await this.save();
    if (!this.data.billPayments) this.data.billPayments = [];
    if (this.applyAutopay()) await this.save();
    this.applyTheme();
    this.applyThemeColors();
    this.updateNavVisibility();

    const rates = this.getRates();
    if (!this._hostedMode && ['EUR', 'USD', 'XAU'].some(c => !rates[c] || !rates[c].rate)) {
      fetch('/api/exchange-rate').then(r => r.json()).then(result => {
        if (result.rates) {
          Object.assign(this.getRates(), result.rates);
          this.save();
        }
      }).catch(() => {});
    }

if (!this._browserFolderMode && !this._browserFileMode) { this.connectWebSocket(); this.bindWsRecovery(); }
    if (window.UpdateUi) { UpdateUi.init(); }
    const hp = document.getElementById('header-profile');
    if (hp) { hp.textContent = '\u00b7 ' + (this.profile ? this.profile.toUpperCase() : 'DEFAULT'); }
    if (window.Chart) {
      Chart.defaults.font.family = "'Hack', 'Courier New', monospace";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = '#777777';
    }
    this.bindNav();
    this.refreshAttention();
    this.bindSidebarToggle();
    this.bindKeyboard();
    this.bindGlobalSelectWheel();
    this.bindOutsideDeselect();
    this.bindDateWheel();
    this.bindMonthWheel();
    this.bindModalSubmit();
    this.bindBillModalSubmit();
    this.bindSavingsGoalForm();
    this.bindSavingsEntryForm();
    this.bindWishlistForm();
    this.bindBudgetForm();
    this.bindTransferForm();
    this.bindSettingsModals();

    document.querySelector('#transaction-modal .modal-backdrop').addEventListener('click', () => this.closeModal('transaction-modal'));
    document.querySelector('#bill-modal .modal-backdrop').addEventListener('click', () => this.closeModal('bill-modal'));
    document.querySelector('#savings-modal .modal-backdrop').addEventListener('click', () => this.closeModal('savings-modal'));
    document.querySelector('#savings-entry-modal .modal-backdrop').addEventListener('click', () => this.closeModal('savings-entry-modal'));
    document.querySelector('#wishlist-modal .modal-backdrop').addEventListener('click', () => this.closeModal('wishlist-modal'));
    document.querySelector('#budget-modal .modal-backdrop').addEventListener('click', () => this.closeModal('budget-modal'));
    document.querySelector('#budget-allocation-modal .modal-backdrop').addEventListener('click', () => this.closeBudgetAllocationEditor());
    document.querySelector('#forecast-recurring-modal .modal-backdrop').addEventListener('click', () => this.closeModal('forecast-recurring-modal'));
    document.querySelector('#settings-account-modal .modal-backdrop').addEventListener('click', () => this.closeModal('settings-account-modal'));
    document.querySelector('#settings-category-modal .modal-backdrop').addEventListener('click', () => this.closeModal('settings-category-modal'));
    document.querySelector('#transfer-modal .modal-backdrop').addEventListener('click', () => this.closeModal('transfer-modal'));
    document.querySelector('#debt-pay-modal .modal-backdrop').addEventListener('click', () => this.closeModal('debt-pay-modal'));
    document.querySelector('#bulk-edit-modal .modal-backdrop').addEventListener('click', () => this.closeModal('bulk-edit-modal'));
    const bulkForm = document.getElementById('bulk-edit-form');
    if (bulkForm) bulkForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitBulkEdit(); });
    document.querySelector('#debt-modal .modal-backdrop').addEventListener('click', () => this.closeModal('debt-modal'));
    document.querySelector('#debt-pay-modal .modal-backdrop').addEventListener('click', () => this.closeModal('debt-pay-modal'));
    document.querySelector('#bill-pay-modal .modal-backdrop').addEventListener('click', () => this.closeModal('bill-pay-modal'));
    document.querySelector('#data-health-modal .modal-backdrop').addEventListener('click', () => this.closeModal('data-health-modal'));

    const headerInput = document.getElementById('header-command-input');
    if (headerInput) {
      headerInput.addEventListener('focus', () => {
        headerInput.blur();
        this.openCommandPalette();
      });
    }

    const cmdInput = document.getElementById('command-input');
    if (cmdInput) {
      cmdInput.addEventListener('input', (e) => this.updateCommandResults(e.target.value));
      cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); this.closeCommandPalette(); return; }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._cmdPaletteIndex = Math.min(this._cmdPaletteIndex + 1, this._cmdPaletteItems.length - 1);
          this._highlightPaletteItem();
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._cmdPaletteIndex = Math.max(this._cmdPaletteIndex - 1, 0);
          this._highlightPaletteItem();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (this._cmdPaletteIndex >= 0) {
            if (this._cmdPaletteItems[this._cmdPaletteIndex]) this._cmdPaletteItems[this._cmdPaletteIndex].execute();
            return;
          }
          if (this._cmdPaletteEnterAction && this._cmdPaletteItems.length) {
            this._cmdPaletteItems[0].execute();
            return;
          }
          const query = cmdInput.value.trim();
          if (query) this.applyCommandSearchFilter(query);
          else if (this._cmdPaletteItems.length) this._cmdPaletteItems[0].execute();
        }
      });
    }

    document.getElementById('command-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'command-overlay') this.closeCommandPalette();
    });

    document.getElementById('command-results').addEventListener('click', (e) => {
      const item = e.target.closest('.command-item');
      if (item) {
        const idx = parseInt(item.dataset.idx, 10);
        if (this._cmdPaletteItems[idx]) this._cmdPaletteItems[idx].execute();
      }
    });

    document.addEventListener('pointerover', (e) => {
      const row = e.target.closest && e.target.closest('.tx-row');
      if (!row || (e.relatedTarget && row.contains(e.relatedTarget))) return;
      const match = (row.getAttribute('onclick') || '').match(/bulkToggle\('([^']+)'/);
      this._footerHoveredTxId = match ? match[1] : null;
      this.updateFooterHotkeys();
    });
    document.addEventListener('pointerout', (e) => {
      const row = e.target.closest && e.target.closest('.tx-row');
      if (!row || (e.relatedTarget && row.contains(e.relatedTarget))) return;
      this._footerHoveredTxId = null;
      this.updateFooterHotkeys();
    });
    document.addEventListener('focusin', () => this.updateFooterHotkeys());
    document.addEventListener('focusout', () => setTimeout(() => this.updateFooterHotkeys(), 0));

    this.populateCurrencyDropdowns();
    this.updateBaseCurrencyLabels();
    this.upgradeAllSelects(document);
    this.initChartResize();
    this.resetUndoHistory();
    this.navigateTo('overview');
    if (this._firstRun && !this.data.accounts.length && !this.data.transactions.length) {
      this.navigateTo('settings');
      this.createProfile();
    }
    if (this._transactionLoad) this.loadRemainingTransactions(this._transactionLoad.id);
    else {
      this._appLoading = false;
      this.setSaveState(this._pendingSaves > 0 ? 'saving' : (this._lastSaveFailure || 0) > (this._lastSaveSuccess || 0) ? 'failed' : 'saved');
    }
    if (this._browserFolderMode) this.startBrowserFolderSync();
  },

  async showBrowserFolderStart(message) {
    this._appLoading = false;
    this.setSaveState('saved');
    this.applyTheme();
    const el = document.getElementById('page-overview');
    const profiles = window.BrowserProfileStore ? await BrowserProfileStore.list().catch(() => []) : [];
    const rows = profiles.map(record => '<div class="settings-row"><span class="settings-row-name">' + this.escapeHtml(record.name.toUpperCase()) + '</span><button class="btn btn-sm btn-primary" data-folder-open-id="' + this.escapeHtml(record.id) + '">OPEN</button></div>').join('');
    const available = window.BrowserProfileStore && BrowserProfileStore.supported();
    el.innerHTML = '<div class="empty-state" style="max-width:680px;margin:8vh auto;padding:28px;text-align:left;">' +
      '<div class="empty-state-title">PROFILE FOLDER</div>' +
      '<div class="empty-state-text" style="margin:12px 0 22px;">' + this.escapeHtml(message || 'Choose where this browser should open your Black Book profile. Your profile stays in that folder.') + '</div>' +
      (available ? '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary" id="browser-folder-create">NEW PROFILE IN A FOLDER</button><button class="btn btn-secondary" id="browser-folder-open">OPEN EXISTING PROFILE FOLDER</button></div>' : '<div class="empty-state-text">This browser does not support direct folder access here. Open the profile with the Black Book desktop app or use a supported browser over HTTPS.</div>') +
      (rows ? '<div style="margin-top:24px;"><div class="settings-section-title" style="margin-bottom:8px;">CONNECTED FOLDERS</div>' + rows + '</div>' : '') +
      '<div class="form-hint" style="margin-top:22px;">The browser remembers folder access, not a readable path. Keep the whole folder together, including its hidden .blackbook change journals. Profile data stays in your folder; the browser remembers access to it, not a plain path. Choose the same synced folder once on each device.</div></div>';
    const create = document.getElementById('browser-folder-create');
    const open = document.getElementById('browser-folder-open');
    if (create) create.addEventListener('click', () => this.createBrowserFolderProfileFromHome());
    if (open) open.addEventListener('click', () => this.openBrowserFolderProfileFromHome());
    el.querySelectorAll('[data-folder-open-id]').forEach((button, index) => button.addEventListener('click', () => this.reconnectBrowserFolderProfile(profiles[index])));
  },

  showBrowserFolderReconnect(record) {
    this._appLoading = false;
    this.setSaveState('saved');
    this.applyTheme();
    document.getElementById('page-overview').innerHTML = '<div class="empty-state" style="max-width:640px;margin:10vh auto;padding:28px;text-align:left;"><div class="empty-state-title">RECONNECT PROFILE FOLDER</div><div class="empty-state-text" style="margin:12px 0 20px;">' + this.escapeHtml(record.name) + ' needs permission to read and save in its folder.</div><button class="btn btn-primary" id="browser-folder-reconnect" data-profile-id="' + this.escapeHtml(record.id) + '">RECONNECT FOLDER</button><button class="btn btn-secondary" style="margin-left:8px;" id="browser-folder-choose-another">CHOOSE ANOTHER</button></div>';
    document.getElementById('browser-folder-reconnect').addEventListener('click', () => this.reconnectBrowserFolderProfile(record));
    document.getElementById('browser-folder-choose-another').addEventListener('click', () => this.showBrowserFolderStart('Choose another profile folder.'));
  },

  async switchBrowserFolderProfile(id) {
    const record = await BrowserProfileStore.get(id);
    if (!record) return this.showBrowserFolderStart('That browser connection is no longer available.');
    localStorage.setItem('bb_profile_storage', 'folder');
    localStorage.setItem('bb_folder_profile', record.id);
    localStorage.setItem('mb_profile', record.name);
    location.reload();
  },

  async reconnectBrowserFolderProfile(value) {
    const record = typeof value === 'object' ? value : await BrowserProfileStore.get(value);
    if (!record) return this.showBrowserFolderStart('That browser connection is no longer available.');
    try {
      if (await BrowserProfileStore.reconnect(record)) return this.switchBrowserFolderProfile(record.id);
      this.showBrowserFolderStart('Folder permission was not granted. Choose the folder again to reconnect.');
    } catch (error) { this.showBrowserFolderStart(error.message); }
  },

  startBrowserFolderSync() {
    if (!this._browserFolderMode || !this._localProfileRecord) return;
    clearInterval(this._localProfileSyncTimer);
    this._localProfileSyncTimer = setInterval(() => this.syncBrowserFolderProfile(), 6000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.syncBrowserFolderProfile(); });
  },

  async syncBrowserFolderProfile() {
    if (!this._browserFolderMode || this._localProfileSyncBusy || this._pendingSaves || document.hidden) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    this._localProfileSyncBusy = true;
    try {
      const stamp = await BrowserProfileStore.fileStamp(this._localProfileRecord);
      if (stamp === null) return this.showBrowserFolderReconnect(this._localProfileRecord);
      if (stamp === this._localProfileFileStamp) return;
      const changedLocally = !!this._localProfileDataDirty;
      const result = changedLocally
        ? await BrowserProfileStore.save(this._localProfileRecord, this._localProfileBase, this.stripTransient(this.data), this._localProfileWriterId)
        : await BrowserProfileStore.load(this._localProfileRecord);
      if (result.permissionRequired) return this.showBrowserFolderReconnect(this._localProfileRecord);
      this.data = result.data;
      this._localProfileBase = structuredClone(result.data);
      this._localProfileFileStamp = result.stamp;
      this._localProfileDataDirty = false;
      this.resetUndoHistory();
      this.renderPage(this.currentPage);
      this.setSaveState('saved');
    } catch (error) {
      console.warn('Could not refresh the folder profile:', error);
    } finally { this._localProfileSyncBusy = false; }
  },

  bindNav() {
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.page));
    });
  },

  connectWebSocket() {
    this._wsRetry = this._wsRetry || 0;
    if (this._ws) { try { this._ws.close(); } catch (e) {} this._ws = null; }
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(protocol + '//' + location.host);
      this._ws = ws;
      ws.onopen = () => {
        this._wsRetry = 0;
        if (this._saveRetryProfile === this.profile && this.data) this.save(this._saveRetryOptions || {});
      };
      ws.onclose = () => {
        this._ws = null;
        if (this._updating && window.UpdateUi) { UpdateUi.onServerGone(); return; }
        this.scheduleWsReconnect();
      };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    } catch (e) {
      this.scheduleWsReconnect();
    }
  },

  scheduleWsReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this._wsRetry), 15000);
    this._wsRetry++;
    clearTimeout(this._wsReconnectTimer);
    this._wsReconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
  },

  bindWsRecovery() {
    const reconnectNow = () => { if (!this._ws) this.connectWebSocket(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reconnectNow(); });
    window.addEventListener('focus', reconnectNow);
  },

  hoveredTransactionId() {
    const row = document.querySelector('.tx-row:hover');
    const match = row && (row.getAttribute('onclick') || '').match(/bulkToggle\('([^']+)'/);
    return match ? match[1] : null;
  },

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const confirmEl = document.getElementById('confirm-modal');
        if (confirmEl && !confirmEl.classList.contains('hidden')) { e.preventDefault(); this._resolveConfirm(false); return; }
        const reportsWheel = document.querySelector('.mobile-reports-wheel');
        if (reportsWheel) { e.preventDefault(); reportsWheel.remove(); return; }
        const palette = document.getElementById('command-overlay');
        if (!palette.classList.contains('hidden')) {
          this.closeCommandPalette();
          return;
        }
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => this.closeModal(m.id));
        return;
      }
      if (document.querySelector('.mobile-reports-wheel')) {
        if (!['Tab', 'Enter', ' '].includes(e.key)) e.preventDefault();
        return;
      }
      const tag = document.activeElement.tagName;
      const modalOpen = !!document.querySelector('.modal:not(.hidden)');
      const paletteOpen = !document.getElementById('command-overlay').classList.contains('hidden');
      const confirmOpen = !document.getElementById('confirm-modal').classList.contains('hidden');
      if (confirmOpen) {
        if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') { e.preventDefault(); this._resolveConfirm(true); return; }
        if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') { e.preventDefault(); this._resolveConfirm(false); return; }
        return;
      }
      const transactionModal = document.getElementById('transaction-modal');
      const active = document.activeElement;
      const isTypingField = active && ((['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) || active.isContentEditable) &&
        !(active.dataset && active.dataset.numericOnlyBound === 'true');
      if (transactionModal && !transactionModal.classList.contains('hidden') &&
          (e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !isTypingField) {
        e.preventDefault();
        this.toggleTransactionSplit();
        return;
      }
      if (e.target && e.target.closest && e.target.closest('#transaction-modal')) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        const active = document.activeElement;
        const editable = active && (['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName) || active.isContentEditable);
        if (editable || modalOpen || paletteOpen) return;
        e.preventDefault();
        this.undoFinancialChange(e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (paletteOpen) this.closeCommandPalette();
        else this.openCommandPalette();
        return;
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (active && active.isContentEditable) || modalOpen || paletteOpen) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        this.openFindReplace();
        return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.arrowPeriod(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.arrowPeriod(1); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); this.openNewTransaction(); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); this.openTransferModal(); }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); this.gotoToday(); }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C') && this.currentPage === 'overview') {
        e.preventDefault();
        this.copySelectedTransaction();
        return;
      }
      if (e.key === ' ') { e.preventDefault(); if (paletteOpen) this.closeCommandPalette(); else this.openCommandPalette(); return; }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (this._bulkSel && this._bulkSel.size) this.openBulkEdit();
        else this.editHoveredTransaction();
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.openMergeModal();
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (this._bulkSel && this._bulkSel.size) this.toggleBulkOnly();
      }
      if (e.key === 'Delete' || e.key === 'Del') {
        e.preventDefault();
        if (this._bulkSel && this._bulkSel.size) this.bulkDelete();
        else {
          const hoveredId = this.hoveredTransactionId();
          if (hoveredId) this.deleteTransaction(hoveredId);
        }
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        if (this.currentPage === 'overview') { this.toggleOverviewGraph(); return; }
        if (this.currentPage === 'bills') { this.toggleBillsGraph(); return; }
        if (this.currentPage === 'budget') { this.toggleBudgetGraph(); return; }
        if (this.currentPage === 'reports' && this.reportsState && this.reportsState().view === 'forecast') { this.toggleForecastGraph(); return; }
      }
      if (e.key === 'Tab' && this.currentPage === 'overview') { e.preventDefault(); this.cycleAccount(); return; }
      if (e.key === 'Tab' && this.currentPage === 'reports' && this.reportsState) { e.preventDefault(); this.cycleReportsView(e.shiftKey ? -1 : 1); return; }
      if (e.key === '0') { e.preventDefault(); this.navigateTo('settings'); return; }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const pages = this.pageList().filter(p => p !== 'settings' && this.isPageEnabled(p));
        if (idx < pages.length) { e.preventDefault(); this.navigateTo(pages[idx]); }
      }
    });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  randomPastel() {
    const h = Math.random() * 360;
    const s = 60 + Math.random() * 20;
    const l = 70 + Math.random() * 10;
    return 'hsl(' + Math.round(h) + ', ' + Math.round(s) + '%, ' + Math.round(l) + '%)';
  },

  _catPalette: ['#f76d6d', '#f7876d', '#f79a6d', '#f7b06d', '#f7c36d', '#ecf76d', '#a7f76d', '#6df76d', '#6df798', '#6df7bb', '#6df7db', '#6ddbf7', '#6dbbf7', '#6d9af7', '#876df7', '#a76df7', '#ca6df7', '#ec6df7', '#f76ddb', '#f76dbb', '#f76d98', '#e47979', '#e49079', '#e4a179', '#e4b479', '#e4c879', '#dbe479', '#9ee479', '#79e493', '#79e4ac', '#79e4c4', '#79cae4', '#79b1e4', '#7997e4', '#8979e4', '#a179e4', '#ba79e4', '#d379e4', '#e479cb', '#e479b2', '#e47996', '#d58989', '#d59d89', '#d5ac89', '#d5bd89', '#d5cd89', '#c8d589', '#9fd589', '#89d597', '#89d5ab', '#89d5be', '#89c1d5', '#8aadca', '#8998d5', '#9689d5', '#ab89d5', '#bf89d5', '#d589c2', '#d589a9', '#d58996', '#cb9999', '#cbaa99', '#cbb899', '#cbc799', '#bdcb99', '#a2cb99', '#99cba4', '#99cbb5', '#99cbc3', '#99bacb', '#99a9c4', '#9999cb', '#a599cb', '#b699cb', '#c499cb', '#cb99bd', '#cb99a7', '#e8a6a6', '#e8b7a6', '#e8c6a6', '#e8d5a6', '#e0e8a6', '#b7e8a6', '#a6e8b2', '#a6e8c2', '#a6e2e8', '#a6c9e8', '#a6b2e8', '#b2a6e8', '#c2a6e8', '#d1a6e8', '#e8a6dc', '#e8a6c6', '#e8a6b0'],

  nextCategoryColor() {
    const used = new Set((this.data.categories || []).map(c => c.color).filter(Boolean));
    for (const a of (this.data.accounts || [])) if (a.color) used.add(a.color);
    for (const col of this._catPalette) if (!used.has(col)) return col;
    const golden = 137.508;
    let i = this._paletteCursor || 0;
    for (let k = 0; k < 120; k++) {
      i++;
      const col = this.hslToHex('hsl(' + Math.round((i * golden) % 360) + ', 68%, 70%)');
      if (!used.has(col)) { this._paletteCursor = i; return col; }
    }
    return this.hslToHex('hsl(' + Math.round(Math.random() * 360) + ', 68%, 70%)');
  },

  colorForName(name) {
    const s = String(name || '?');
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return this._catPalette[h % this._catPalette.length];
  },

  accountColor(acc) { if (acc && acc.color) return acc.color; return this.colorForName(acc && (acc.name || acc.shortName)); },
  categoryLabel(category) {
    const name = typeof category === 'string' ? category : category && category.name;
    const label = String(name || '');
    return label.trim().toLocaleLowerCase() === 'uncategorized' ? 'None' : label;
  },
  categoryColor(cat) { if (cat && cat.color) return cat.color; return this.colorForName(cat && (cat.name || '?')); },
  cardColor(card) { if (card && card.color) return card.color; return this.colorForName(card && (card.name || card.shortName)); },

  hslToHex(hsl) {
    const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!m) return hsl;
    let h = parseInt(m[1]) / 360, s = parseInt(m[2]) / 100, l = parseInt(m[3]) / 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
    }
    return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  },

  pageList() { return ['overview', 'bills', 'budget', 'cards', 'savings', 'debts', 'invoices', 'reports', 'settings']; },

  isPageEnabled(page) {
    if (page === 'settings' || page === 'overview') return true;
    const off = (this.data && this.data.settings && this.data.settings.disabledPages) || [];
    return !off.includes(page);
  },

  firstEnabledPage() {
    for (const p of this.pageList()) { if (this.isPageEnabled(p)) return p; }
    return 'settings';
  },

  updateNavVisibility() {
    document.querySelectorAll('.sidebar-nav-item').forEach(b => {
      b.classList.toggle('hidden', !this.isPageEnabled(b.dataset.page));
    });
  },

  async togglePageEnabled(page) {
    if (page === 'settings' || page === 'overview' || !this.data.settings) return;
    if (!this.data.settings.disabledPages) this.data.settings.disabledPages = [];
    const arr = this.data.settings.disabledPages;
    const i = arr.indexOf(page);
    if (i >= 0) arr.splice(i, 1); else arr.push(page);
    this.updateNavVisibility();
    await this.save();
    if (!this.isPageEnabled(this.currentPage)) this.navigateTo(this.firstEnabledPage());
    else this.renderSettings();
  },

  cyclePage(dir) {
    const pages = this.pageList().filter(p => this.isPageEnabled(p));
    if (!pages.length) return;
    const idx = pages.indexOf(this.currentPage);
    const next = pages[(idx + dir + pages.length) % pages.length];
    this.navigateTo(next);
  },

  navigateTo(page) {
    if (page === 'forecast') {
      if (this.reportsState) this.reportsState().view = 'forecast';
      page = 'reports';
    }
    if (page === 'wishlist') { this._savingsView = 'wishlist'; page = 'savings'; }
    const known = this.pageList();    if (!known.includes(page) || !this.isPageEnabled(page)) page = this.firstEnabledPage();
    if (this.overviewPieChart) { this.overviewPieChart.destroy(); this.overviewPieChart = null; }
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    if (this.billsPieChart) { this.billsPieChart.destroy(); this.billsPieChart = null; }
    if (this.savingsChart) { this.savingsChart.destroy(); this.savingsChart = null; }
    if (this.forecastChart) { this.forecastChart.destroy(); this.forecastChart = null; }
    if (this.destroyReportsCharts) this.destroyReportsCharts();
    this.currentPage = page;
    document.body.classList.remove('mobile-nav-open');
    document.querySelectorAll('.page').forEach(p => {
      const active = p.id === 'page-' + page;
      p.classList.toggle('hidden', !active);
      p.style.display = active ? '' : 'none';
      if (!active) p.innerHTML = '';
    });
    const pageEl = document.getElementById('page-' + page);
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    window.scrollTo(0, 0);
    this.renderPage(page);
    this.populateCurrencyDropdowns();
    this.updateBaseCurrencyLabels();
  },

  bindSidebarToggle() {
    const mark = document.querySelector('.header-logo-mark');
    if (!mark) return;
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSidebar();
    });
    document.body.classList.remove('mobile-nav-open');
    try {
      document.body.classList.toggle('sb-collapsed', localStorage.getItem('bb-sidebar-collapsed') === '1');
    } catch (err) {}
  },

  toggleSidebar() {
    if (window.matchMedia && window.matchMedia('(max-width: 500px)').matches) {
      document.body.classList.toggle('mobile-nav-open');
      return;
    }
    const collapsed = document.body.classList.toggle('sb-collapsed');
    try {
      localStorage.setItem('bb-sidebar-collapsed', collapsed ? '1' : '0');
    } catch (err) {}
  },

  fitElems(selector, minPx) {
    const min = minPx || 8;
    document.querySelectorAll(selector).forEach((el) => {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (isNaN(base) || el.scrollWidth <= el.clientWidth + 1) return;
      let size = base;
      while (size > min && el.scrollWidth > el.clientWidth + 1) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
      }
    });
  },

  renderPage(page) {
    try {
      if (this.refreshDataHealth) this.refreshDataHealth();
      this.hideDonutTooltip();
      if (page === 'overview') this.renderOverview();
      else if (page === 'budget') this.renderBudget();
      else if (page === 'bills') this.renderBills();
      else if (page === 'cards') this.renderCards();
      else if (page === 'savings') this.renderSavings();
      else if (page === 'debts') this.renderDebts();
      else if (page === 'invoices') this.renderInvoices();
      else if (page === 'reports') this.renderReports();
      else if (page === 'settings') this.renderSettings();
      if (page === 'settings' && window.UpdateUi) { try { UpdateUi.renderSettings(); } catch (err) { console.error('Update UI render failed:', err); } }
      const pageEl = document.getElementById('page-' + page);
      if (pageEl) this.upgradeAllSelects(pageEl);
      this.syncDateInputHints();
      this.refreshAttention();
      this.updateGraphFooter();
      this.updateFooterHotkeys();
    } catch (err) {
      console.error('renderPage failed:', err);
      if (!this._renderErrShown) { this._renderErrShown = true; alert('Render error: ' + err.message); }
    }
  },

  bindVerticalReorder(container, rowSelector, onReorder, options = {}) {
    if (!container || container._verticalReorderBound) return;
    container._verticalReorderBound = true;
    let drag = null;
    const rows = () => Array.from(container.querySelectorAll(rowSelector)).filter(row => row.dataset.reorderKey);
    const clearDropIndicators = () => rows().forEach(row => row.classList.remove('reorder-drop-before', 'reorder-drop-after'));
    const finish = (event) => {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      const current = drag;
      drag = null;
      current.row.classList.remove('reorder-dragging');
      if (current.handle) current.handle.classList.remove('reorder-handle-active');
      clearDropIndicators();
      if (!current.moved) return;
      const keys = rows().map(row => row.dataset.reorderKey);
      if (keys.join('\u0000') !== current.initialOrder.join('\u0000')) onReorder(keys);
    };
    container.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.reorder-grip');
      const row = options.dragAnywhere ? event.target.closest(rowSelector) : (handle && handle.closest(rowSelector));
      if ((!options.dragAnywhere && !handle) || !row || !container.contains(row) || !row.dataset.reorderKey || (event.button != null && event.button !== 0)) return;
      if (options.dragAnywhere && event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
      const siblings = rows();
      if (siblings.length < 2) return;
      drag = { row, handle, pointerId: event.pointerId, startY: event.clientY, moved: false, initialOrder: siblings.map(item => item.dataset.reorderKey) };
      row.classList.add('reorder-dragging');
      if (handle) handle.classList.add('reorder-handle-active');
      try { row.setPointerCapture(event.pointerId); } catch (err) {}
      event.preventDefault();
    }, true);
    container.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return;
      drag.moved = true;
      clearDropIndicators();
      const targets = rows().filter(row => row !== drag.row);
      const before = targets.find(row => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
      if (before) container.insertBefore(drag.row, before);
      else container.appendChild(drag.row);
      (before || drag.row).classList.add(before ? 'reorder-drop-before' : 'reorder-drop-after');
      event.preventDefault();
    }, true);
    container.addEventListener('pointerup', finish, true);
    container.addEventListener('pointercancel', finish, true);
  },

  updateGraphFooter() {
    const button = document.getElementById('footer-graph-toggle');
    if (!button) return;
    const forecastGraphPage = this.currentPage === 'reports' && this.reportsState && this.reportsState().view === 'forecast';
    const graphPage = this.currentPage === 'overview' || this.currentPage === 'bills' || this.currentPage === 'budget' || forecastGraphPage;
    button.classList.toggle('hidden', !graphPage);
    if (!graphPage) return;
    const hidden = this.currentPage === 'overview'
      ? !!this.data.settings.hideOverviewGraph
      : this.currentPage === 'bills'
        ? !!this.data.settings.hideBillsGraph
          : this.currentPage === 'budget'
          ? !!this.data.settings.hideBudgetGraph
          : !!this.data.settings.hideForecastGraph;
    button.textContent = hidden ? 'SHOW GRAPH' : 'HIDE GRAPH';
    button.onclick = () => this.currentPage === 'overview'
      ? this.toggleOverviewGraph()
      : this.currentPage === 'bills'
        ? this.toggleBillsGraph()
          : this.currentPage === 'budget'
          ? this.toggleBudgetGraph()
          : this.toggleForecastGraph();
  },

  attentionItems() {
    const today = this.today();
    const inDays = (date) => Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    const items = [];
    for (const bill of this.data.bills || []) {
      if (bill.active === false || !bill.amount) continue;
      if (bill.frequency === 'annual') {
        const year = Number(today.slice(0, 4));
        const month = Number(bill.dueMonth) || 1;
        const makeDueDate = (y) => new Date(y, month - 1, Math.min(Number(bill.dueDay) || 1, new Date(y, month, 0).getDate()));
        let due = makeDueDate(year);
        let date = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0');
        const paid = (this.data.billPayments || []).some(p => p.billId === bill.id && p.month === date.slice(0, 7));
        if (due < new Date(today + 'T00:00:00') || paid) {
          due = makeDueDate(year + 1);
          date = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0');
        }
        const distance = inDays(date);
        if (distance >= 0 && distance <= 3) items.push({ severity: 3, date, label: bill.name + (distance === 0 ? ' is due today' : ' is due in ' + distance + ' days'), page: 'bills' });
        continue;
      }
      const due = new Date(today + 'T00:00:00'); due.setDate(Math.min(Number(bill.dueDay) || 1, new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()));
      let date = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0');
      const paid = (this.data.billPayments || []).some(p => p.billId === bill.id && p.month === date.slice(0, 7));
      if (paid) continue;
      let distance = inDays(date);
      if (distance < 0) { due.setMonth(due.getMonth() + 1); date = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0'); distance = inDays(date); }
      if (distance <= 3) items.push({ severity: distance < 0 ? 1 : 3, date, label: bill.name + (distance < 0 ? ' is overdue' : distance === 0 ? ' is due today' : ' is due in ' + distance + ' days'), page: 'bills' });
    }
    if (window.ForecastEngine) {
      const forecast = window.ForecastEngine.buildForecast(this.data, { startDate: today, days: 30, baseCurrency: this.baseCurrency(), rates: this.getRates() });
      for (const shortfall of forecast.shortfalls.slice(0, 1)) {
        const account = this.data.accounts.find(a => a.id === shortfall.accountId);
        items.push({ severity: 2, date: shortfall.date, label: (account ? account.name : 'An account') + ' is forecast below zero', page: 'forecast' });
      }
    }
    return items.sort((a, b) => a.severity - b.severity || a.date.localeCompare(b.date));
  },

  refreshAttention() {
    const toggle = document.getElementById('settings-attention-toggle');
    if (toggle && this.data) {
      const shown = !this.data.settings?.attentionBarHidden;
      toggle.textContent = shown ? 'SHOW' : 'HIDE';
      toggle.classList.toggle('btn-primary', shown);
      toggle.classList.toggle('btn-secondary', !shown);
      toggle.setAttribute('aria-pressed', String(shown));
    }
    const bar = document.getElementById('attention-bar');
    if (!bar || !this.data) return;
    const hidden = this.data.settings && this.data.settings.attentionBarHidden;
    const items = this.attentionItems();
    if (hidden || !items.length) { bar.innerHTML = ''; return; }
    const visible = items.slice(0, 3);
    bar.innerHTML = visible.map(item => '<button class="attention-item severity-' + item.severity + '" onclick="BlackBook.navigateTo(\'' + item.page + '\')">' + this.escapeHtml(item.label) + '</button>').join('') +
      (items.length > 3 ? '<button class="attention-more" onclick="BlackBook.showAttention()">+' + (items.length - 3) + ' MORE</button>' : '') +
      '<button class="btn btn-sm btn-danger btn-icon attention-hide" onclick="BlackBook.hideAttentionBar()" title="Hide attention bar">' + (this.xIcon ? this.xIcon() : '×') + '</button>';
  },

  async hideAttentionBar() { this.data.settings.attentionBarHidden = true; await this.save(); this.refreshAttention(); },
  toggleAttentionBar() { return this.data.settings.attentionBarHidden ? this.showAttentionBar() : this.hideAttentionBar(); },
  async showAttentionBar() { this.data.settings.attentionBarHidden = false; await this.save(); this.refreshAttention(); },
  showAttention() {
    const groups = ['URGENT', 'FORECAST', 'DUE SOON', 'REVIEW'];
    const items = this.attentionItems();
    const text = groups.map((name, index) => {
      const group = items.filter(item => item.severity === index + 1);
      return group.length ? name + '\n' + group.map(item => '• ' + item.label + ' (' + item.date + ')').join('\n') : '';
    }).filter(Boolean).join('\n\n');
    alert(text || 'Nothing needs attention.');
  },

  setSaveState(state) {
    const ind = document.getElementById('save-indicator');
    if (!ind) return;
    if (this._transactionLoadError && state === 'saved') state = 'load-failed';
    else if (!this._transactionLoadError && (this._appLoading || this._transactionLoad) && state !== 'failed' && state !== 'load-failed') state = 'loading';
    ind.classList.toggle('loading', state === 'loading');
    ind.classList.toggle('load-failed', state === 'load-failed');
    ind.classList.toggle('saving', state === 'saving');
    ind.classList.toggle('failed', state === 'failed');
    const label = ind.querySelector('.save-label');
    const dot = ind.querySelector('.save-dot');
    if (label) label.textContent = state === 'loading' ? 'LOADING\u2026' : state === 'load-failed' ? 'LOAD ERROR' : state === 'saving' ? 'SAVING\u2026' : state === 'failed' ? 'UNSAVED' : 'SAVED';
    ind.title = state === 'loading' ? 'Loading profile' : state === 'load-failed' ? 'Older transactions could not be loaded. Click to retry.' : state === 'failed' ? 'Changes have not been saved. Click to retry.' : 'Save status';
    ind.onclick = state === 'failed' ? () => this.save(this._saveRetryOptions || {}) : state === 'load-failed' ? () => this.loadRemainingTransactions(this._transactionLoad?.id) : null;
    ind.tabIndex = state === 'failed' || state === 'load-failed' ? 0 : -1;
    ind.onkeydown = state === 'failed' || state === 'load-failed' ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (state === 'failed') this.save(this._saveRetryOptions || {}); else this.loadRemainingTransactions(this._transactionLoad?.id); } } : null;
  },

  resetUndoHistory() {
    if (!window.UndoHistory || !this.data) return;
    this._undoHistory = new window.UndoHistory(100, 5 * 1024 * 1024);
    this._undoBaseline = this._undoHistory.snapshot(this.stripTransient(this.data));
    this._undoReady = true;
  },

  footerHotkeys() {
    const modalOpen = typeof document !== 'undefined' && document.querySelector('.modal:not(.hidden), #command-overlay:not(.hidden)');
    if (modalOpen) return [];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const editing = active && (['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName) || active.isContentEditable);
    const shortcuts = [];
    const add = (key, label) => shortcuts.push({ key, label });
    if (!editing) {
      add('A', 'NEW TRANSACTION');
      add('T', 'TRANSFER');
      add('D', 'TODAY');
      add('F', 'FIND / REPLACE');
    }
    if (!editing && this.currentPage === 'overview') {
      const selected = this._bulkSel ? this._bulkSel.size : 0;
      const hovered = !!(this._footerHoveredTxId || this.hoveredTransactionId());
      if (selected === 1 || (!selected && hovered)) add('C', 'COPY TRANSACTION');
      if (selected || hovered) add('E', selected ? 'EDIT SELECTED' : 'EDIT');
      if (selected >= 2) add('M', 'MERGE');
      if (selected) add('B', 'FILTER SELECTED');
      if (selected || hovered) add('DEL', selected ? 'DELETE SELECTED' : 'DELETE');
    }
    if (!editing && (['overview', 'bills', 'budget'].includes(this.currentPage) || (this.currentPage === 'reports' && this.reportsState && this.reportsState().view === 'forecast'))) add('H', 'GRAPH');
    if (!editing && this.currentPage === 'overview') add('TAB', 'ACCOUNT');
    if (!editing && this.currentPage === 'reports') add('TAB', 'REPORT');
    const reportState = this.currentPage === 'reports' && this.reportsState ? this.reportsState() : null;
    if (!editing && (!reportState || !['items', 'forecast'].includes(reportState.view))) {
      const yearly = reportState && (['categories', 'people', 'compare'].includes(reportState.view) ||
        reportState.view === 'moneyflow' && reportState.flowPeriod === 'year' ||
        reportState.view === 'calendar' && reportState.calendarMode === 'year');
      add('← →', reportState ? (yearly ? 'YEAR' : 'MONTH') : 'MONTH');
    }
    const pageCount = this.pageList().filter(page => this.isPageEnabled(page)).length;
    if (!editing && pageCount > 1) add('0–9', 'PAGES');
    if (!editing) add('Space', 'COMMAND');
    if (!editing && this._undoReady && !this._undoBusy && this._undoHistory) {
      if (this._undoHistory.undoStack.length) add('Ctrl Z', 'UNDO');
      if (this._undoHistory.redoStack.length) add('Ctrl Shift Z', 'REDO');
    }
    return shortcuts;
  },

  updateFooterHotkeys() {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('footer-hotkeys');
    if (!host) return;
    host.innerHTML = this.footerHotkeys().map(item => '<span class="hotkey"><kbd>' + item.key + '</kbd> ' + item.label + '</span>').join('');
  },

  async undoFinancialChange(direction) {
    if (!this._undoReady || this._undoBusy) return;
    try { await (this._saveQueue || Promise.resolve()); } catch (_) {}
    if ((this._lastSaveFailure || 0) > (this._lastSaveSuccess || 0)) {
      this.showToast('Undo unavailable while changes are unsaved');
      return;
    }
    const from = direction === 'redo' ? this._undoHistory.redoStack : this._undoHistory.undoStack;
    const to = direction === 'redo' ? this._undoHistory.undoStack : this._undoHistory.redoStack;
    const entry = from[from.length - 1];
    if (!entry) { this.showToast(direction === 'redo' ? 'Nothing to redo' : 'Nothing to undo'); return; }
    const previous = this._undoHistory.snapshot(this.stripTransient(this.data));
    this._undoHistory.apply(this.data, entry.delta, direction);
    this._undoBusy = true;
    const ok = await this.save({ historyReplay: true });
    this._undoBusy = false;
    if (!ok) {
      for (const key of Object.keys(previous)) this.data[key] = previous[key];
      this.showToast((direction === 'redo' ? 'Redo' : 'Undo') + ' could not be saved');
      return;
    }
    if (from[from.length - 1] === entry) from.pop();
    to.push(entry);
    this._undoHistory.trim();
    this.renderPage(this.currentPage);
    this.showToast((direction === 'redo' ? 'Redid' : 'Undid') + ' last financial change');
  },

  async save(options = {}) {
    const sequence = (this._saveSequence || 0) + 1;
    this._saveSequence = sequence;
    this._pendingSaves = (this._pendingSaves || 0) + 1;
    this.setSaveState('saving');
    const payload = this.stripTransient(this.data);
    if (this._browserFolderMode) this._localProfileDataDirty = true;
    if (this._browserFileMode) this._browserFileDirty = true;
    const profile = this.profile;
    const loadSessionId = this._transactionLoad?.id || '';
    if (loadSessionId) this._partialLoadSaveOccurred = true;
    const loadedTransactionCount = Number(this._transactionLoad?.nextOffset) || (this.data.transactions || []).length;
    const body = profile || loadSessionId ? { profile, data: payload, ...(loadSessionId ? { loadSessionId, loadedTransactionCount } : {}) } : payload;
    const serializedBody = this._browserFolderMode || this._browserFileMode ? '' : JSON.stringify(body);
    const after = this._undoHistory && this._undoHistory.snapshot(payload);
    const perform = async () => {
      const hasUndoSteps = this._undoHistory && (this._undoHistory.undoStack.length || this._undoHistory.redoStack.length);
      const shouldCompareHistory = this._undoReady && !options.historyReplay && (options.undoable || hasUndoSteps);
      const before = shouldCompareHistory ? this._undoBaseline : null;
      const delta = before && after && this._undoHistory ? this._undoHistory.diff(before, after) : null;
      try {
        if (this._browserFileMode) {
          if (this._browserFileHandle && this.data.settings.autosave !== false) await this.writeBrowserProfileFile(payload);
          // Browsers without write access keep edits in memory until a manual save.
        } else if (this._browserFolderMode) {
          const result = await BrowserProfileStore.save(this._localProfileRecord, this._localProfileBase, payload, this._localProfileWriterId);
          if (this.profile === profile) {
            this.data = result.data;
            this._localProfileBase = structuredClone(result.data);
            this._localProfileFileStamp = result.stamp;
            this._localProfileDataDirty = false;
          }
        } else {
          const response = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serializedBody });
          if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Save failed');
        }
        this._lastSaveSuccess = Math.max(this._lastSaveSuccess || 0, sequence);
        if (this._saveRetryProfile === profile && sequence >= (this._lastSaveFailure || 0)) {
          this._saveRetryProfile = null;
          this._saveRetryOptions = null;
        }
        if (this.profile === profile && this._undoHistory) {
          if (this._undoReady && delta && !options.historyReplay) {
            if (options.undoable) this._undoHistory.push({ label: options.label || 'Financial change', delta });
            else this._undoHistory.clear();
          }
          this._undoBaseline = this._browserFolderMode ? this._undoHistory.snapshot(this.stripTransient(this.data)) : after;
          this.updateFooterHotkeys();
        }
        return true;
      } catch (error) {
        this._lastSaveFailure = Math.max(this._lastSaveFailure || 0, sequence);
        this._saveRetryProfile = profile;
        this._saveRetryOptions = options;
        console.error('Save failed:', error);
        return false;
      } finally {
        this._pendingSaves = (this._pendingSaves || 0) - 1;
        if (this._pendingSaves <= 0) {
          this._pendingSaves = 0;
          this.setSaveState((this._lastSaveFailure || 0) > (this._lastSaveSuccess || 0) ? 'failed' : 'saved');
        }
      }
    };
    const queued = (this._saveQueue || Promise.resolve()).catch(() => false).then(perform);
    this._saveQueue = queued;
    return queued;
  },

  async loadRemainingTransactions(loadSessionId) {
    if (!loadSessionId || !this.data || this._loadTransactionsBusy) return;
    this._loadTransactionsBusy = true;
    this._appLoading = true;
    this._transactionLoadError = false;
    this.setSaveState('loading');
    const profile = this.profile || '';
    try {
      let offset = Number(this._transactionLoad?.nextOffset) || (this.data.transactions || []).length;
      while (this._transactionLoad?.id === loadSessionId && offset < this._transactionLoad.total) {
        const query = new URLSearchParams({ loadSessionId, offset: String(offset), limit: String(this._transactionLoad.chunkSize || 10_000) });
        if (profile) query.set('profile', profile);
        const response = await fetch('/api/load-chunk?' + query.toString());
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load older transactions.');
        if (!Array.isArray(result.transactions)) throw new Error('The server returned an invalid transaction batch.');
        if (!Array.isArray(result.indexes) || result.indexes.length !== result.transactions.length) {
          throw new Error('The server returned an invalid transaction batch.');
        }
        for (let index = 0; index < result.transactions.length; index++) {
          const tx = result.transactions[index];
          const sourceIndex = result.indexes[index];
          if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= this._transactionLoad.total) {
            throw new Error('The server returned an invalid transaction position.');
          }
          if (tx && typeof tx === 'object') {
            Object.defineProperty(tx, this._transactionLoad.sourceIndex, { value: sourceIndex, configurable: true });
          }
          this.data.transactions.push(tx);
        }
        const nextOffset = Number(result.nextOffset);
        if (!Number.isSafeInteger(nextOffset) || nextOffset < offset || (!result.done && nextOffset === offset)) {
          throw new Error('The server returned an invalid transaction batch position.');
        }
        offset = nextOffset;
        this._transactionLoad.nextOffset = offset;
        if (result.done) break;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (this._transactionLoad?.id !== loadSessionId) return;

      // Rebuild the saved file order, while retaining edits/deletions made during hydration.
      const load = this._transactionLoad;
      const liveTransactions = this.data.transactions || [];
      const originalOrder = new Array(load.total);
      const addedDuringLoad = [];
      for (const transaction of liveTransactions) {
        const sourceIndex = transaction && typeof transaction === 'object' ? transaction[load.sourceIndex] : undefined;
        if (Number.isSafeInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < load.total) {
          originalOrder[sourceIndex] = transaction;
          delete transaction[load.sourceIndex];
        } else {
          addedDuringLoad.push(transaction);
        }
      }
      const restoredOrder = [];
      for (let index = 0; index < originalOrder.length; index++) {
        if (Object.hasOwn(originalOrder, index)) restoredOrder.push(originalOrder[index]);
      }
      this.data.transactions = addedDuringLoad.concat(restoredOrder);

      const transfersChanged = this.migrateTransfers();
      let signFixed = false;
      for (const tx of (this.data.transactions || [])) {
        if (!tx || typeof tx.amount !== 'number') continue;
        if (tx.type === 'expense' && tx.amount > 0) { tx.amount = -tx.amount; signFixed = true; }
        else if (tx.type === 'income' && tx.amount < 0) { tx.amount = -tx.amount; signFixed = true; }
      }
      // From here on every transaction is present, so future saves can safely write the full profile.
      const needsFullSave = transfersChanged || signFixed || this._partialLoadSaveOccurred;
      this._transactionLoad = null;
      if (needsFullSave) {
        await (this._saveQueue || Promise.resolve()).catch(() => false);
        await this.save({ historyReplay: true });
        await (this._saveQueue || Promise.resolve()).catch(() => false);
      }
      if (this._undoHistory) this._undoBaseline = this._undoHistory.snapshot(this.stripTransient(this.data));
      await fetch('/api/load-complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, loadSessionId })
      }).catch(() => {});
      this._partialLoadSaveOccurred = false;
      this._appLoading = false;
      this._transactionLoadError = false;
      this.setSaveState(this._pendingSaves > 0 ? 'saving' : (this._lastSaveFailure || 0) > (this._lastSaveSuccess || 0) ? 'failed' : 'saved');
      this.renderPage(this.currentPage);
    } catch (error) {
      this._appLoading = false;
      this._transactionLoadError = true;
      console.error('Older transactions could not be loaded:', error);
      this.setSaveState('load-failed');
      this.showToast('Older transactions could not be loaded. Click LOAD ERROR in the top-right to retry.');
    } finally {
      this._loadTransactionsBusy = false;
    }
  },

  enhancePasswordFields() {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.dataset.eyeEnhanced) return;
      input.dataset.eyeEnhanced = '1';
      const wrap = document.createElement('span');
      wrap.className = 'password-field';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-eye';
      btn.setAttribute('aria-label', 'Show password');
      btn.innerHTML = this._eyeSvg(false);
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = this._eyeSvg(show);
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        input.focus();
      });
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(btn);
    });
  },

  _eyeSvg(off) {
    const eye = '<svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 4.5C6.5 4.5 1.8 9.5 0.3 12 1.8 14.5 6.5 19.5 12 19.5s10.2-5 11.7-7.5C22.2 9.5 17.5 4.5 12 4.5z M12 14.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></svg>';
    if (!off) return eye;
    return '<svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 4.5C6.5 4.5 1.8 9.5 0.3 12 1.8 14.5 6.5 19.5 12 19.5s10.2-5 11.7-7.5C22.2 9.5 17.5 4.5 12 4.5z"/><line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  },

  showUnlockOverlay(name) {
    const overlay = document.getElementById('unlock-overlay');
    const nameEl = document.getElementById('unlock-profile-name');
    const form = document.getElementById('unlock-form');
    const errEl = document.getElementById('unlock-error');
    const pwInput = document.getElementById('unlock-password');
    const sel = document.getElementById('unlock-profile');
    this._pendingProfile = name || '';
    nameEl.textContent = name ? name.toUpperCase() : 'DEFAULT';
    if (sel) this.populateUnlockSelect(sel, name || '', () => { pwInput.focus(); });
    overlay.classList.remove('hidden');
    errEl.classList.add('hidden');
    pwInput.value = '';
    pwInput.focus();
    form.onsubmit = (e) => this.submitUnlock(e);
  },

  async populateUnlockSelect(sel, selected, done) {
    let profiles = [];
    let defaultHasPassword = false;
    try {
      const res = await fetch('/api/profiles');
      const out = await res.json();
      profiles = out.profiles || [];
      defaultHasPassword = !!out.defaultHasPassword;
    } catch (e) { }
    this._defaultHasPassword = defaultHasPassword;
    this._profilesWithPasswords = profiles.filter(p => p.hasPassword).map(p => p.name);
    let html = '<option value="">DEFAULT' + (defaultHasPassword ? ' &bull;' : '') + '</option>';
    for (const p of profiles) {
      html += '<option value="' + this.escapeHtml(p.name) + '"' + (p.name === selected ? ' selected' : '') + '>' + this.escapeHtml(p.name).toUpperCase() + (p.hasPassword ? ' &bull;' : '') + '</option>';
    }
    sel.innerHTML = html;
    sel.value = selected || '';
    if (done) done();
  },

  unlockProfileSelected(sel) {
    const name = sel.value || '';
    const locked = name ? (this._profilesWithPasswords || []).includes(name) : !!this._defaultHasPassword;
    if (!locked) {
      localStorage.setItem('mb_profile', name || '');
      location.reload();
      return;
    }
    this._pendingProfile = name || '';
    this._unlockForSwitch = true;
    const nameEl = document.getElementById('unlock-profile-name');
    if (nameEl) nameEl.textContent = name ? name.toUpperCase() : 'DEFAULT';
    const errEl = document.getElementById('unlock-error');
    if (errEl) errEl.classList.add('hidden');
    const pwInput = document.getElementById('unlock-password');
    if (pwInput) { pwInput.value = ''; pwInput.focus(); }
  },

  async submitUnlock(e) {
    if (e) e.preventDefault();
    const sel = document.getElementById('unlock-profile');
    const pendingFromSelect = sel && sel.value !== undefined && sel.value !== null ? sel.value : '';
    const pw = document.getElementById('unlock-password').value;
    const name = this._pendingProfile !== undefined && this._pendingProfile !== null ? this._pendingProfile
      : (pendingFromSelect !== '' && this.profile !== pendingFromSelect ? pendingFromSelect : this.profile);
    const errEl = document.getElementById('unlock-error');
    errEl.classList.add('hidden');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: pw })
      });
      if (!res.ok) {
        errEl.textContent = (await res.json().catch(() => ({}))).error || 'Wrong password';
        errEl.classList.remove('hidden');
        return;
      }
      if (name !== this.profile) {
        localStorage.setItem('mb_profile', name || '');
        this._unlockForSwitch = false;
        this._pendingProfile = null;
      }
      location.reload();
    } catch (err) {
      errEl.textContent = 'Server unreachable';
      errEl.classList.remove('hidden');
    }
  },

  stripTransient(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === '_debtReconciled') continue;
      const v = obj[k];
      if (v && typeof v === 'object') {
        out[k] = this.stripTransient(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  },

  rnd4(v) { return Math.round(v * 10000) / 10000; },

  baseCurrency() {
    return this.data.settings.baseCurrency || 'RSD';
  },

  normalizeLegacyCurrencySettings() {
    const s = this.data.settings;
    if (!s.baseCurrency) s.baseCurrency = 'RSD';
    if (s.currencyPreset) return false; // profile created with an explicit currency preset — do not auto-add currencies
    const en = s.enabledCurrencies;
    const degenerate = !Array.isArray(en) || en.length === 0 || (en.length === 1 && en[0] === (s.baseCurrency || 'RSD'));
    if (degenerate) {
      s.enabledCurrencies = this.legacyDefaultCurrencies();
      return true;
    }
    return false;
  },

  legacyDefaultCurrencies() {
    return ['RSD', 'EUR', 'USD', 'XAU'];
  },

  currencyList() {
    const s = this.data.settings;
    const def = this.legacyDefaultCurrencies();
    const list = new Set(Array.isArray(s.enabledCurrencies) && s.enabledCurrencies.length ? s.enabledCurrencies : def);
    list.add(this.baseCurrency());
    for (const t of (this.data.transactions || [])) { if (t.currency) list.add(t.currency); if (t.currencyIn) list.add(t.currencyIn); }
    for (const a of (this.data.accounts || [])) if (a.currency) list.add(a.currency);
    for (const b of (this.data.bills || [])) if (b.currency) list.add(b.currency);
    for (const g of (this.data.savingsGoals || [])) if (g.currency) list.add(g.currency);
    for (const item of (this.data.wishlist || [])) if (item.currency) list.add(item.currency);
    for (const d of (this.data.debts || [])) if (d.currency) list.add(d.currency);
    for (const v of (this.data.invoices || [])) if (v.currency) list.add(v.currency);
    return Array.from(list);
  },

  defaultAccountForCurrency(cur) {
    const vis = this.visibleAccounts();
    const def = this.data.settings.defaultAccountId;
    const defAcc = def ? vis.find(a => a.id === def) : null;
    if (cur) {
      if (defAcc && (defAcc.currency || this.baseCurrency()) === cur) return defAcc.id;
      const match = vis.find(a => (a.currency || this.baseCurrency()) === cur);
      if (match) return match.id;
    }
    return defAcc ? defAcc.id : (vis[0] ? vis[0].id : '');
  },

  populateCurrencyDropdowns() {
    const curs = this.currencyList();
    const selects = ['tx-native-currency-select', 'bill-currency', 'savings-goal-currency', 'wishlist-currency', 'settings-account-currency', 'debt-currency', 'invoice-currency'];
    for (const id of selects) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      const prev = sel.value;
      sel.innerHTML = curs.map(c => '<option value="' + c + '">' + c + '</option>').join('');
      if (curs.includes(prev)) sel.value = prev;
    }
  },

  updateBaseCurrencyLabels() {
    const cur = this.baseCurrency();
    document.querySelectorAll('.base-cur-label').forEach(el => el.textContent = cur);
  },

  toBase(amount, currency) {
    const base = this.baseCurrency();
    if (!currency || currency === base) return amount;
    const rates = this.getRates();
    const rateFrom = (currency === 'EUR') ? 1 : (rates[currency] || {}).rate;
    const rateTo = (base === 'EUR') ? 1 : (rates[base] || {}).rate;
    if (!rateFrom || !rateTo) return amount;
    return Math.round(amount * rateFrom / rateTo * 100) / 100;
  },

  transactionToBase(tx) {
    const base = this.baseCurrency();
    if (tx && tx.currency === base) return Number(tx.amount) || 0;
    const parts = tx && Array.isArray(tx.parts) ? tx.parts : [];
    if (parts.some(part => part && part.nativeAmount != null && Number.isFinite(Number(part.nativeAmount)))) {
      const sign = Number(tx.amount) < 0 ? -1 : 1;
      const total = parts.reduce((sum, part) => {
        if (part && part.nativeAmount != null && (part.nativeCurrency || tx.nativeCurrency) === base) {
          return sum + sign * Math.abs(Number(part.nativeAmount) || 0);
        }
        return sum + this.toBase(sign * Math.abs(Number(part && part.amount) || 0), (part && part.currency) || tx.currency || base);
      }, 0);
      return Math.round(total * 100) / 100;
    }
    if (tx && tx.nativeCurrency === base && tx.nativeAmount != null) return Number(tx.nativeAmount) || 0;
    return tx ? this.toBase(Number(tx.amount) || 0, tx.currency || base) : 0;
  },

  transactionAllocationRows(tx) {
    if (!tx) return [];
    const parts = Array.isArray(tx.parts) && tx.parts.length ? tx.parts : null;
    if (!parts) return [{ ...tx, transactionId: tx.id || null, allocationId: tx.id || null, partDescription: '', isSplitPart: false }];
    const sign = Number(tx.amount) < 0 ? -1 : 1;
    return parts.map((part, index) => ({
      ...tx,
      transactionId: tx.id || null,
      allocationId: part.id || ((tx.id || 'transaction') + ':part:' + index),
      partDescription: String(part.description || '').trim() && Number(part.quantity) > 1
        ? String(part.description).trim() + ' × ' + Number(part.quantity)
        : String(part.description || ''),
      isSplitPart: true,
      categoryId: part.categoryId || null,
      nativeAmount: part.nativeAmount == null ? null : sign * Math.abs(Number(part.nativeAmount) || 0),
      nativeCurrency: part.nativeAmount == null ? null : (part.nativeCurrency || tx.nativeCurrency || null),
      // Parent tags apply to the whole purchase; part-level tags add context.
      personIds: [...new Set([...(Array.isArray(tx.personIds) ? tx.personIds : []), ...(Array.isArray(part.personIds) ? part.personIds : [])])],
      amount: sign * Math.abs(Number(part.amount) || 0)
    })).filter(row => !row.autoRemainder || Math.abs(Number(row.amount) || 0) > 0);
  },

  transactionSplitValidation(total, parts) {
    const source = Array.isArray(parts) ? parts : [];
    const amounts = source.map(part => Number(part && part.amount));
    const validAmounts = amounts.length >= 1 && amounts.every(amount => Number.isFinite(amount) && amount > 0);
    const totalCents = Math.round(Math.abs(Number(total) || 0) * 100);
    const allocatedCents = amounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? Math.round(amount * 100) : 0), 0);
    return {
      valid: validAmounts && totalCents > 0 && allocatedCents === totalCents,
      totalCents,
      allocatedCents,
      remainingCents: totalCents - allocatedCents
    };
  },

  getRates() {
    const s = this.data.settings;
    if (!s.rates) s.rates = {};
    if (!s.rates.EUR) s.rates.EUR = { rate: 1, source: null, updated: null };
    // Legacy migration: if EUR rate > 10, rates are RSD-based — convert to EUR-based
    if (s.rates.EUR.rate > 10) {
      const eurRate = s.rates.EUR.rate;
      for (const [code, r] of Object.entries(s.rates)) {
        if (code === 'EUR') { s.rates[code] = { rate: 1, source: r.source, updated: r.updated }; continue; }
        if (r && r.rate != null) {
          s.rates[code] = { rate: this.rnd4(r.rate / eurRate), source: r.source, updated: r.updated };
        }
      }
      // Legacy rates only stored EUR/USD/XAU; the base currency rate was implicit (=1 per unit).
      // Without an explicit EUR-based base rate, toBase()/convertBetweenCurrencies() return the
      // amount unchanged, silently breaking every conversion.
      const base = this.baseCurrency();
      if (base && base !== 'EUR' && (!s.rates[base] || s.rates[base].rate == null)) {
        s.rates[base] = { rate: this.rnd4(1 / eurRate), source: 'legacy-migration', updated: null };
      }
    }
    return s.rates;
  },

  today() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  },

  todayForViewedMonth() {
    const n = new Date();
    const day = String(n.getDate()).padStart(2, '0');
    return this.vy() + '-' + String(this.vm() + 1).padStart(2, '0') + '-' + day;
  },

  getDateSeparator() {
    return (this.data.settings && this.data.settings.dateSeparator) || '/';
  },

  dateFormatPattern() {
    const configured = this.data && this.data.settings && this.data.settings.dateFormat;
    return this.validDateFormat(configured) ? configured : 'DD/MM/YYYY';
  },

  dateFormatParts(pattern) {
    return String(pattern || '').match(/YYYY|MMM|YY|DD|MM|D|M|[^DMY]+/g) || [];
  },

  validDateFormat(pattern) {
    if (typeof pattern !== 'string' || pattern.length > 40) return false;
    const parts = this.dateFormatParts(pattern);
    if (parts.join('') !== pattern) return false;
    const count = re => parts.filter(part => re.test(part)).length;
    return count(/^(DD|D)$/) === 1 && count(/^(MMM|MM|M)$/) === 1 && count(/^(YYYY|YY)$/) === 1 &&
      parts.every(part => /^(YYYY|MMM|YY|DD|MM|D|M)$/.test(part) || /^[^A-Za-z0-9]+$/.test(part));
  },

  fmtDateInput(iso) {
    const p = String(iso || '').split('-');
    if (p.length !== 3 || p[0].length !== 4) return '';
    const day = Number(p[2]), month = Number(p[1]), year = Number(p[0]);
    if (!day || month < 1 || month > 12) return '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const values = { D: String(day), DD: String(day).padStart(2, '0'), M: String(month), MM: String(month).padStart(2, '0'), MMM: months[month - 1].slice(0, 3).toUpperCase(), YY: String(year).slice(-2), YYYY: String(year) };
    return this.dateFormatParts(this.dateFormatPattern()).map(part => values[part] || part).join('');
  },

  parseDateInput(str) {
    const original = String(str || '').trim();
    if (!original) return null;
    const parts = this.dateFormatParts(this.dateFormatPattern());
    const captures = [];
    const source = parts.map(part => {
      if (/^(DD|D|MM|M|YY|YYYY)$/.test(part)) {
        captures.push(part);
        return part === 'YYYY' ? '(\\d{4})' : part === 'YY' || part === 'DD' || part === 'MM' ? '(\\d{2})' : '(\\d{1,2})';
      }
      if (part === 'MMM') { captures.push(part); return '([A-Za-z]+)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    }).join('');
    const matched = original.match(new RegExp('^' + source + '$', 'i'));
    if (matched) {
      const fields = {};
      captures.forEach((part, index) => { fields[part] = matched[index + 1]; });
      const day = Number(fields.DD || fields.D);
      let month = Number(fields.MM || fields.M);
      if (fields.MMM) {
        const names = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        month = names.findIndex(name => name.slice(0, 3) === String(fields.MMM).toLowerCase()) + 1;
      }
      const year = fields.YYYY ? Number(fields.YYYY) : 2000 + Number(fields.YY);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day)
        return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      return null;
    }
    let s = original.replace(/\s+/g, '');
    if (!s) return null;
    const sep = this.getDateSeparator();
    const sepEscaped = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('[-/.' + sepEscaped + ']', 'g'), '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    let d, m, y;
    if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s)) {
      const q = s.split('.'); y = parseInt(q[0], 10); m = parseInt(q[1], 10); d = parseInt(q[2], 10);
    } else if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(s)) {
      const q = s.split('.'); d = parseInt(q[0], 10); m = parseInt(q[1], 10); y = parseInt(q[2], 10);
      if (y < 100) y += 2000;
    } else if (/^\d{1,2}\.\d{1,2}$/.test(s)) {
      const q = s.split('.'); d = parseInt(q[0], 10); m = parseInt(q[1], 10); y = new Date().getFullYear();
    } else {
      return null;
    }
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  },

  syncDateInputHints() {
    const pattern = this.dateFormatPattern();
    const textMonth = /MMM/.test(pattern);
    for (const id of ['tx-date', 'tr-date', 'ctx-date', 'savings-entry-date', 'debt-date', 'debt-paid-date', 'invoice-date', 'invoice-paid-date', 'ipay-date']) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.placeholder = pattern;
      input.inputMode = textMonth ? 'text' : 'numeric';
      input.dataset.dateInput = '';
    }
  },

  parseSmartDate(input) {
    const s = String(input || '').trim();
    if (!s) return { type: 'none' };
    const asNum = parseInt(s, 10);
    if (!isNaN(asNum) && /^[+-]?\d+$/.test(s)) {
      return { type: 'offset', value: asNum };
    }
    const asDate = this.parseDateInput(s);
    if (asDate) return { type: 'exact', value: asDate };
    return { type: 'invalid', raw: s };
  },

  shiftDate(isoDate, dayOffset) {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + dayOffset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  sortedCategories() {
    return this.data.categories.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },

  categoriesAvailableOn(date, retainedId) {
    return this.sortedCategories().filter(category =>
      CategoryAvailability.availableOn(category, date || this.today()) || category.id === retainedId);
  },

  categoriesVisibleInMonth(month) {
    return this.sortedCategories().filter(category => CategoryAvailability.visibleInMonth(category, month));
  },

  categorySelectionAllowed(id, date, retainedId) {
    if (!id) return true;
    const category = this.data.categories.find(item => item.id === id);
    return !!category && (id === retainedId || CategoryAvailability.availableOn(category, date));
  },

  categoryPickerDate(inputId) {
    const dateId = {
      'tx-category-input': 'tx-date', 'ctx-category-input': 'ctx-date',
      'invoice-category-input': 'invoice-date', 'debt-category-input': 'debt-date'
    }[inputId];
    const input = dateId && document.getElementById(dateId);
    return input ? (this.parseDateInput(input.value) || this.today()) : this.today();
  },

  ymOf(dateStr) {
    const p = String(dateStr || '').split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10) - 1 };
  },

  monthKeyOf(dateStr) {
    return String(dateStr || '').substring(0, 7);
  },

  openModal(id) { document.getElementById(id).classList.remove('hidden'); this.updateFooterHotkeys(); },
  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    this.hideDonutTooltip();
    if (id === 'transfer-modal') this._transferSourceIds = null;
    if (id === 'budget-allocation-modal') {
      this._budgetEditorOpen = false;
      this._budgetAllocationDraft = null;
      if (this.budgetPreviewDonutChart) { this.budgetPreviewDonutChart.destroy(); this.budgetPreviewDonutChart = null; }
    }
    this.updateFooterHotkeys();
  },

  showToast(message, duration = 3500) {
    const el = document.getElementById('app-toast');
    if (!el) return;
    clearTimeout(this._toastTimer);
    el.textContent = String(message);
    el.title = String(message);
    el.classList.remove('hidden');
    this._toastTimer = setTimeout(() => {
      el.classList.add('hidden');
      el.textContent = '';
      this._toastTimer = null;
    }, duration);
  },

  confirmModal(opts) {
    return new Promise((resolve) => {
      opts = opts || {};
      document.getElementById('confirm-title').textContent = opts.title || 'Confirm';
      const msg = document.getElementById('confirm-message');
      msg.textContent = (opts.message == null ? 'Are you sure?' : String(opts.message));
      const okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = opts.confirmText || 'Confirm';
      okBtn.className = 'btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger');
      document.getElementById('confirm-cancel').textContent = opts.cancelText || 'Cancel';
      this._confirmResolve = resolve;
      this.openModal('confirm-modal');
      setTimeout(() => okBtn.focus(), 30);
    });
  },

  _resolveConfirm(val) {
    if (!this._confirmResolve) return;
    const r = this._confirmResolve;
    this._confirmResolve = null;
    this.closeModal('confirm-modal');
    r(val);
  },

  promptModal(opts) {
    return new Promise((resolve) => {
      opts = opts || {};
      document.getElementById('prompt-title').textContent = opts.title || 'Enter';
      const msg = document.getElementById('prompt-message');
      msg.textContent = (opts.message == null ? '' : String(opts.message));
      const input = document.getElementById('prompt-input');
      input.value = (opts.defaultValue == null ? '' : String(opts.defaultValue));
      input.placeholder = (opts.placeholder == null ? '' : String(opts.placeholder));
      const promptWrap = document.querySelector('.prompt-input-wrap');
      if (opts.password) {
        input.type = 'password';
        if (!input.dataset.eyeEnhanced && promptWrap) {
          input.dataset.eyeEnhanced = '1';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'password-eye';
          btn.setAttribute('aria-label', 'Show password');
          btn.innerHTML = this._eyeSvg(false);
          btn.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = this._eyeSvg(show);
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            input.focus();
          });
          promptWrap.appendChild(btn);
        } else if (promptWrap) {
          const oldBtn = promptWrap.querySelector('.password-eye');
          if (oldBtn) oldBtn.classList.remove('hidden');
        }
      } else {
        input.type = 'text';
        const oldBtn = promptWrap ? promptWrap.querySelector('.password-eye') : null;
        if (oldBtn) oldBtn.classList.add('hidden');
      }
      document.getElementById('prompt-ok').textContent = opts.confirmText || 'OK';
      this._promptResolve = resolve;
      this.openModal('prompt-modal');
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  },

  _resolvePrompt(value) {
    if (!this._promptResolve) return;
    const r = this._promptResolve;
    this._promptResolve = null;
    this.closeModal('prompt-modal');
    r(value);
  },

  chartGridColor(baseColor) {
    const color = String(baseColor || '').trim();
    if (this.currentTheme() !== 'dark') return color;
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
    if (!match) return color;
    const hex = match[1].length === 3 ? match[1].split('').map(value => value + value).join('') : match[1];
    const brighter = [0, 2, 4].map(index => Math.min(255, parseInt(hex.slice(index, index + 2), 16) + 6).toString(16).padStart(2, '0'));
    return '#' + brighter.join('');
  },
  lineChartOptions(xTicks = {}) {
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { left: 8, right: 8, top: 8, bottom: 0 } },
      plugins: {
        legend: { display: false }, title: { display: false },
        tooltip: { enabled: false, external: ({ chart, tooltip }) => this.showDonutTooltip(chart, tooltip,
          tooltip.dataPoints && tooltip.dataPoints.length
            ? [tooltip.title && tooltip.title[0], ...tooltip.dataPoints.map(c => c.dataset.label + ': ' + this.fmtBase(c.parsed.y))].filter(Boolean).join('\n')
            : '') }
      },
      scales: {
        x: { ticks: { color: '#888888', maxRotation: 0, autoSkip: false, font: { size: 11 }, ...xTicks }, grid: { color: this.chartGridColor('#2a2a2a'), drawBorder: false }, border: { display: false } },
        y: { ticks: { color: '#888888', font: { size: 11 }, maxTicksLimit: 5, callback: value => Math.abs(value) < 10000 ? this.fmtNumber(value) : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value).toLowerCase().replace(/^-0(?:\.0+)?$/, '0') }, grid: { color: this.chartGridColor('#2a2a2a'), drawBorder: false }, border: { display: false } }
      }
    };
  },

  hideDonutTooltip() {
    const tip = document.getElementById('donut-tooltip');
    if (tip) tip.style.display = 'none';
  },

  showDonutTooltip(chart, tooltip, label) {
    if (!tooltip || !tooltip.opacity || !label) { this.hideDonutTooltip(); return; }
    let tip = document.getElementById('donut-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'donut-tooltip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.textContent = label;
    tip.style.display = 'block';
    const canvas = chart.canvas.getBoundingClientRect();
    const anchorX = canvas.left + (Number.isFinite(tooltip.caretX) ? tooltip.caretX : canvas.width / 2);
    const anchorY = canvas.top + (Number.isFinite(tooltip.caretY) ? tooltip.caretY : canvas.height / 2);
    const preferredLeft = anchorX - tip.offsetWidth / 2;
    const preferredTop = anchorY - tip.offsetHeight - 10;
    tip.style.left = Math.max(8, Math.min(preferredLeft, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    const top = preferredTop < 8 ? anchorY + 10 : preferredTop;
    tip.style.top = Math.max(8, Math.min(top, window.innerHeight - tip.offsetHeight - 8)) + 'px';
  },

  donutDisplayValues(values, minimumAngle = 2) {
    const amounts = values.map(value => Math.max(0, Number(value) || 0));
    const total = amounts.reduce((sum, value) => sum + value, 0);
    const count = amounts.filter(value => value > 0).length;
    if (!total || !count) return amounts;
    const floor = Math.min(minimumAngle / 360, .8 / count);
    const remainder = 1 - floor * count;
    return amounts.map(value => value > 0 ? floor + remainder * value / total : 0);
  },

  sqrtNormalizedValues(values, minimumShare = 0.02) {
    const amounts = values.map(value => Math.max(0, Number(value) || 0));
    const positiveCount = amounts.filter(value => value > 0).length;
    if (!positiveCount) return amounts;
    const squareRoots = amounts.map(value => Math.sqrt(value));
    const total = squareRoots.reduce((sum, value) => sum + value, 0);
    const floor = Math.min(minimumShare, 0.8 / positiveCount);
    const remainder = 1 - floor * positiveCount;
    return squareRoots.map(value => value > 0 ? floor + remainder * value / total : 0);
  },

  fmtNumber(amount) {
    const value = Number(amount) || 0;
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return formatted === '-0' ? '0' : formatted;
  },

  fmtBase(amount) {
    return this.fmtNumber(amount) + ' ' + this.baseCurrency();
  },

  round2(amount) {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  },

  calcForeignFee(nativeAmt, pct, nativeCur) {
    const feeNative = this.round2(Math.abs(nativeAmt) * pct / 100);
    return { feeNative: feeNative, feeBase: this.round2(this.toBase(feeNative, nativeCur || this.baseCurrency())) };
  },

  fmtAmount(amount, currency) {
    return this.fmtNumber(amount) + ' ' + currency;
  },

  currencyShortLabel(currency) {
    const code = String(currency || '').toUpperCase();
    if (this.data?.settings?.currencyDisplay === 'code') return code;
    if (code === 'RSD') return '';
    try {
      const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0).find(part => part.type === 'currency')?.value;
      return symbol && symbol.toUpperCase() !== code ? symbol : '';
    } catch (_) {
      return '';
    }
  },

  fmtDualCurrency(amount, currency, accountCurrency, nativeAmount, nativeCurrency) {
    const cur = currency || this.baseCurrency();
    const accCur = accountCurrency || this.baseCurrency();
    const primarySign = amount < 0 ? '-' : '';
    if (nativeAmount != null && nativeCurrency && nativeCurrency !== cur) {
      if (cur === accCur) return primarySign + this.fmtNumber(Math.abs(amount)) + ' ' + cur + ' (' + this.fmtNumber(Math.abs(nativeAmount)) + ' ' + nativeCurrency + ')';
      if (nativeCurrency === accCur) {
        const nativeSign = nativeAmount < 0 ? '-' : '';
        return nativeSign + this.fmtNumber(Math.abs(nativeAmount)) + ' ' + nativeCurrency + ' (' + this.fmtNumber(Math.abs(amount)) + ' ' + cur + ')';
      }
    }
    const abs = Math.abs(amount);
    if (cur === accCur) return primarySign + this.fmtNumber(abs) + ' ' + cur;
    const base = Math.abs(this.toBase(abs, cur));
    return primarySign + this.fmtNumber(base) + ' ' + accCur + ' (' + this.fmtNumber(abs) + ' ' + cur + ')';
  },

  transactionBalanceParts(tx) {
    const settlements = tx && tx.settlements;
    if (!tx || !Array.isArray(settlements) || !settlements.length) return [tx];
    const sameAmount = (left, right) => Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) < 0.005;
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
    const primaryCurrency = tx.currency || this.baseCurrency();
    const isTransfer = tx.type === 'transfer';
    const incomingCurrency = tx.currencyIn || primaryCurrency;
    let amountTotal = 0;
    let amountInTotal = 0;
    let nativeTotal = 0;
    const parts = [];

    for (const item of settlements) {
      if (!item || !validDate(item.date) || item.currency !== primaryCurrency || item.amount == null || !Number.isFinite(Number(item.amount))) return [tx];
      const part = { ...item, amount: Number(item.amount) };
      amountTotal += part.amount;
      if (isTransfer) {
        if (tx.amountIn != null) {
          if (item.amountIn == null || !Number.isFinite(Number(item.amountIn)) || (item.currencyIn || incomingCurrency) !== incomingCurrency) return [tx];
          part.amountIn = Number(item.amountIn);
          part.currencyIn = item.currencyIn || incomingCurrency;
          amountInTotal += part.amountIn;
        } else if (item.amountIn != null || item.currencyIn != null) return [tx];
        if (item.nativeAmount != null || item.nativeCurrency != null) return [tx];
      } else {
        if (item.amountIn != null || item.currencyIn != null) return [tx];
        if (tx.nativeAmount != null) {
          const nativeCurrency = tx.nativeCurrency || primaryCurrency;
          if (item.nativeAmount == null || !Number.isFinite(Number(item.nativeAmount)) || (item.nativeCurrency || nativeCurrency) !== nativeCurrency) return [tx];
          part.nativeAmount = Number(item.nativeAmount);
          part.nativeCurrency = item.nativeCurrency || nativeCurrency;
          nativeTotal += part.nativeAmount;
        } else if (item.nativeAmount != null || item.nativeCurrency != null) return [tx];
      }
      parts.push(part);
    }

    if (!sameAmount(amountTotal, tx.amount)) return [tx];
    if (isTransfer && tx.amountIn != null && !sameAmount(amountInTotal, tx.amountIn)) return [tx];
    if (!isTransfer && tx.nativeAmount != null && !sameAmount(nativeTotal, tx.nativeAmount)) return [tx];
    return parts;
  },

  accountBalance(accountId, throughDate = null) {
    let total = 0;
    for (const tx of this.data.transactions) {
      for (const part of this.transactionBalanceParts(tx)) {
        if (throughDate && part.date > throughDate) continue;
        if (tx.type === 'transfer') {
          if (tx.fromAccountId === accountId) total -= this.toBase(part.amount, part.currency);
          if (tx.toAccountId === accountId) total += this.toBase(part.amountIn != null ? part.amountIn : part.amount, part.currencyIn || part.currency);
          continue;
        }
        if (tx.accountId !== accountId) continue;
        total += this.transactionToBase(part);
      }
    }
    return total;
  },

  accountBalanceNative(accountId, throughDate = null) {
    const acc = this.data.accounts.find(a => a.id === accountId);
    let total = 0;
    let currency = (acc && acc.currency) || this.baseCurrency();
    for (const tx of this.data.transactions) {
      for (const part of this.transactionBalanceParts(tx)) {
        if (throughDate && part.date > throughDate) continue;
        if (tx.type === 'transfer') {
          if (tx.fromAccountId === accountId) {
            let amt = part.amount;
            if (part.currency && acc && acc.currency && part.currency !== acc.currency) {
              const converted = this.convertBetweenCurrencies(part.amount, part.currency, acc.currency);
              if (converted != null && !isNaN(converted)) amt = converted;
            }
            total -= amt;
          }
          if (tx.toAccountId === accountId) {
            let amt = part.amountIn != null ? part.amountIn : part.amount;
            const cur = part.currencyIn || part.currency;
            if (cur && acc && acc.currency && cur !== acc.currency) {
              const converted = this.convertBetweenCurrencies(amt, cur, acc.currency);
              if (converted != null && !isNaN(converted)) amt = converted;
            }
            total += amt;
          }
          continue;
        }
        if (tx.accountId !== accountId) continue;
        let amt = part.amount;
        if (part.currency && acc && acc.currency && part.currency !== acc.currency && part.nativeCurrency === acc.currency && part.nativeAmount != null) {
          amt = part.nativeAmount;
        } else if (part.currency && acc && acc.currency && part.currency !== acc.currency) {
          const converted = this.convertBetweenCurrencies(part.amount, part.currency, acc.currency);
          if (converted != null && !isNaN(converted)) amt = converted;
        }
        total += amt;
      }
    }
    return { amount: total, currency: currency };
  },

  openCommandPalette() {
    const overlay = document.getElementById('command-overlay');
    const input = document.getElementById('command-input');
    overlay.classList.remove('hidden');
    input.value = '';
    input.focus();
    this._cmdPaletteIndex = -1;
    this.updateCommandResults('');
  },

  closeCommandPalette() {
    document.getElementById('command-overlay').classList.add('hidden');
    document.getElementById('command-input').value = '';
    this._cmdPaletteIndex = -1;
    this._cmdPaletteItems = [];
  },

  updateCommandResults(query) {
    const results = document.getElementById('command-results');
    this._cmdPaletteItems = [];
    this._cmdPaletteIndex = -1;
    this._cmdPaletteEnterAction = !query.trim();

    if (!query) {
      let html = '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">ACTIONS</div>';
      html += this._paletteItemHtml('New Transaction', 'N');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewTransaction(); } });
      html += this._paletteItemHtml('New Transfer', 'T');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openTransferModal(); } });
      html += this._paletteItemHtml('New Bill', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewBill(); } });
      html += this._paletteItemHtml('New Savings Goal', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewSavingsGoal(); } });
      html += this._paletteItemHtml('New Invoice', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewInvoice(); } });
      html += this._paletteItemHtml('New Debt', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewDebt(); } });
      html += this._paletteItemHtml('New Account', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewAccount(); } });
      html += this._paletteItemHtml('New Category', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewCategory(); } });
      html += this._paletteItemHtml('Export CSV', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.exportCsv(); } });
      html += '</div>';
      html += '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">PAGES</div>';
      for (const p of this.pageList()) {
        if (!this.isPageEnabled(p)) continue;
        html += this._paletteItemHtml(p.toUpperCase(), '');
        this._cmdPaletteItems.push({ execute: (_p => () => { this.closeCommandPalette(); this.navigateTo(_p); })(p) });
      }
      html += '</div>';
      html += '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">SYNTAX</div>' +
        '<div class="command-syntax">1500 -shop groceries for the week &nbsp;&middot;&nbsp; expense (negative = expense)</div>' +
        '<div class="command-syntax">95000 paycheck 25/8 salary &nbsp;&middot;&nbsp; income on Aug 25</div>' +
        '<div class="command-syntax">t 5000 cash card &nbsp;&middot;&nbsp; transfer between accounts</div>' +
        '<div class="command-syntax">pay internet &nbsp;&middot;&nbsp; toggle bill paid this month</div>' +
        '<div class="command-syntax">bg shop 20000 &nbsp;/&nbsp; bg shop clear &nbsp;&middot;&nbsp; budget</div>' +
        '<div class="command-syntax">dep hawaii 5000 &nbsp;/&nbsp; wd hawaii 2000 &nbsp;&middot;&nbsp; savings move</div>' +
        '<div class="command-syntax">csv &nbsp;&middot;&nbsp; profile &lt;name&gt;</div></div>';
      results.innerHTML = html;
      return;
    }

    const lq0 = query.trim().toLowerCase();
    const kw = lq0.split(/\s+/)[0];
    if (kw === 'csv' || kw === 'json' || kw === 'profiles') {
      this._cmdPaletteEnterAction = true;
      const actionsMap = {
        csv: ['Export transactions as CSV', () => this.exportCsv()],
        json: ['Export full backup JSON', () => { const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'blackbook-backup-' + this.today() + '.json'; a.click(); }],
        profiles: ['Show profiles in settings', () => { this.closeCommandPalette(); this.navigateTo('settings'); }]
      };
      const [label, fn] = actionsMap[kw];
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({
        execute: async () => {
          if (kw !== 'profiles') await fn();
          this.closeCommandPalette();
          if (kw !== 'csv' && kw !== 'json') this.renderPage(this.currentPage);
          else alert('Export started');
        }
      });
      return;
    }

    try {
      const parsedT = this.parseTransferCommand(query);
      this._cmdPaletteEnterAction = true;
      results.innerHTML = '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>' +
        this._paletteItemHtml(parsedT.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedT.execute });
      return;
    } catch (e) { /* not a transfer */ }

    try {
      const parsedB = this.parseBillPayCommand(query);
      this._cmdPaletteEnterAction = true;
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(parsedB.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedB.execute });
      return;
    } catch (e) { /* not a bill pay */ }

    try {
      const parsedBg = this.parseBudgetCommand(query);
      this._cmdPaletteEnterAction = true;
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(parsedBg.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedBg.execute });
      return;
    } catch (e) { /* not a budget */ }

    try {
      const parsedS = this.parseSavingsMoveCommand(query);
      this._cmdPaletteEnterAction = true;
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(parsedS.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedS.execute });
      return;
    } catch (e) { /* not a savings move */ }

    try {
      const parsed = this.parseCommand(query);
      this._cmdPaletteEnterAction = true;
      const typeLabel = parsed.type === 'expense' ? 'Expense' : 'Income';
      const detail = typeLabel + ': ' + Math.abs(parsed.amount) + ' ' + this.baseCurrency() + (parsed.category ? ' / ' + this.categoryLabel(parsed.category) : '') + (parsed.date ? ' / ' + parsed.date : '') + (parsed.note ? ' / ' + parsed.note : '');
      let cmdHtml = '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>';
      cmdHtml += this._paletteItemHtml('Create: ' + detail, 'Enter');
      this._cmdPaletteItems.push({
        execute: async () => {
          const tx = { id: crypto.randomUUID(), date: parsed.date, type: parsed.type, amount: Math.round((parsed.type === 'expense' ? -1 : 1) * Math.abs(parsed.amount) * 100) / 100, currency: parsed.account.currency || this.baseCurrency(), accountId: parsed.account.id, categoryId: parsed.category.id, note: parsed.note };
          this.data.transactions.unshift(tx);
          this.syncViewToDate(tx.date);
          await this.save({ undoable: true, label: 'Add transaction' });
          this.closeCommandPalette();
          this.renderPage(this.currentPage);
        }
      });
      cmdHtml += '</div>';
      results.innerHTML = cmdHtml;
      return;
    } catch (e) { /* not a command */ }

    const lq = query.toLowerCase();
    let searchHtml = '';
    const txResults = this.data.transactions
      .map((tx, index) => {
        const note = String(tx.note || '').toLowerCase();
        const splitMatches = (Array.isArray(tx.parts) ? tx.parts : []).filter(part => String(part.description || '').toLowerCase().includes(lq));
        const amount = String(tx.amount);
        let relevance = -1;
        if (note === lq || amount === lq) relevance = 3;
        else if (note.startsWith(lq) || amount.startsWith(lq)) relevance = 2;
        else if (note.includes(lq) || amount.includes(lq)) relevance = 1;
        for (const part of splitMatches) {
          const description = String(part.description || '').toLowerCase();
          relevance = Math.max(relevance, description === lq ? 3 : description.startsWith(lq) ? 2 : 1);
        }
        return { tx, index, relevance, splitMatches };
      })
      .filter(result => result.relevance >= 0)
      .sort((a, b) => b.relevance - a.relevance || String(b.tx.date || '').localeCompare(String(a.tx.date || '')) || a.index - b.index);
    if (txResults.length) {
      searchHtml += '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">TRANSACTIONS</div>';
      for (const result of txResults) {
        const tx = result.tx;
        const cat = this.data.categories.find(c => c.id === tx.categoryId);
        const transfer = tx.type === 'transfer';
        const amountClass = transfer ? 'amt-transfer' : tx.type === 'income' ? 'amt-income' : 'amt-expense';
        const sign = transfer ? '' : tx.type === 'income' ? '+' : '−';
        const amount = sign + this.fmtNumber(Math.abs(tx.amount)) + ' ' + (tx.currency || this.baseCurrency());
        const label = '<span class="command-transaction-meta"><span>' + this.escapeHtml(this.fmtDateInput(tx.date)) + '</span>' +
          '<span class="' + amountClass + '">' + this.escapeHtml(amount) + '</span>' +
          '<span style="color:' + (transfer ? 'var(--text-muted)' : cat ? this.categoryColor(cat) : 'var(--text-muted)') + '">' + this.escapeHtml(transfer ? 'Transfer' : cat ? this.categoryLabel(cat) : '?') + '</span></span>' +
          '<span class="command-transaction-note">' + this.transactionDescriptionHtml(tx) + (result.splitMatches.length ? '<small class="command-split-matches">' + result.splitMatches.map(part => this.escapeHtml(part.description || 'Split part')).join(' · ') + '</small>' : '') + '</span>';
        searchHtml += '<div class="command-item command-transaction-item" data-idx="' + this._cmdPaletteItems.length + '"><span class="command-item-label">' + label + '</span></div>';
        this._cmdPaletteItems.push({ execute: (_txId => () => { this.closeCommandPalette(); this.openLinkedTransaction(_txId); })(tx.id) });
      }
      searchHtml += '</div>';
    }
    const allPages = ['overview', 'bills', 'budget', 'cards', 'savings', 'debts', 'invoices', 'settings'];
    const matchingPages = allPages.filter(p => p.includes(lq));
    if (matchingPages.length) {
      searchHtml += '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">PAGES</div>';
      for (const mp of matchingPages) {
        searchHtml += this._paletteItemHtml(mp.toUpperCase(), '');
        this._cmdPaletteItems.push({ execute: (_mp => () => { this.closeCommandPalette(); this.navigateTo(_mp); })(mp) });
      }
      searchHtml += '</div>';
    }
    results.innerHTML = searchHtml || '<div class="command-empty">No results</div>';
  },

  findAccountByName(name) {
    const q = String(name || '').toLowerCase();
    const vis = this.visibleAccounts();
    return vis.find(a => (a.shortName || '').toLowerCase() === q)
      || vis.find(a => a.name.toLowerCase() === q)
      || vis.find(a => a.name.toLowerCase().startsWith(q))
      || null;
  },

  parseTransferCommand(input) {
    const parts = input.trim().split(/\s+/);
    if (parts[0].toLowerCase() !== 't' && parts[0].toLowerCase() !== 'tr') throw new Error('not transfer');
    const amount = this.evalAmount(parts[1]);
    if (isNaN(amount) || amount <= 0) throw new Error('transfer needs positive amount');
    const from = this.findAccountByName(parts[2]);
    const to = this.findAccountByName(parts[3]);
    if (!from || !to) throw new Error('accounts not found');
    if (from.id === to.id) throw new Error('same account');
    const note = parts.slice(4).join(' ');
    const label = 'Transfer: ' + Math.round(amount * 100) / 100 + ' \u00b7 ' + from.name + ' \u2192 ' + to.name + (note ? ' / ' + note : '');
    return {
      label: label,
      execute: async () => {
        await this.doTransfer(from, to, amount, note, this.today());
        this.closeCommandPalette();
        this.renderPage(this.currentPage);
      }
    };
  },

  parseBillPayCommand(input) {
    const parts = input.trim().split(/\s+/);
    if (parts[0].toLowerCase() !== 'pay') throw new Error('not bill pay');
    const name = parts.slice(1).join(' ').toLowerCase();
    if (!name) throw new Error('bill name required');
    const bill = this.data.bills.find(b => b.name.toLowerCase().startsWith(name));
    if (!bill) throw new Error('no bill matches');
    const mk = this.vy() + '-' + String(this.vm() + 1).padStart(2, '0');
    const paid = this.getBillPayment(bill.id, mk);
    const label = (paid ? 'Mark UNPAID: ' : 'Mark PAID: ') + bill.name + ' \u00b7 ' + mk;
    return {
      label: label,
      execute: async () => {
        await this.toggleBillPayment(bill.id, mk);
        this.closeCommandPalette();
        this.renderPage(this.currentPage);
      }
    };
  },

  parseBudgetCommand(input) {
    const parts = input.trim().split(/\s+/);
    if (parts[0].toLowerCase() !== 'bg' && parts[0].toLowerCase() !== 'budget') throw new Error('not budget');
    const cat = this.categoriesVisibleInMonth(this.monthKeyOf(this.todayForViewedMonth())).find(c => c.name.toLowerCase().startsWith((parts[1] || '').toLowerCase()));
    if (!cat) throw new Error('category not found');
    let clear = false, amount = 0;
    if ((parts[2] || '').toLowerCase() === 'clear') { clear = true; }
    else { amount = this.evalAmount(parts[2]); if (isNaN(amount) || amount <= 0) throw new Error('budget amount invalid'); }
    const label = (clear ? 'Clear budget: ' : 'Set budget: ') + this.categoryLabel(cat) + (clear ? '' : ' \u00b7 ' + Math.round(amount * 100) / 100 + ' ' + this.baseCurrency() + '/mo');
    return {
      label: label,
      execute: async () => {
        const existing = this.data.budgets.find(b => b.categoryId === cat.id);
        if (clear || amount <= 0) { this.data.budgets = this.data.budgets.filter(b => b !== existing); }
        else if (existing) existing.amount = amount;
        else this.data.budgets.push({ categoryId: cat.id, amount: amount });
        await this.save();
        this.closeCommandPalette();
        this.renderPage(this.currentPage);
      }
    };
  },

  parseSavingsMoveCommand(input) {
    const parts = input.trim().split(/\s+/);
    const verb = (parts[0] || '').toLowerCase();
    if (verb !== 'dep' && verb !== 'wd' && verb !== 'deposit' && verb !== 'withdraw') throw new Error('not savings move');
    const goalName = (parts[1] || '').toLowerCase();
    const goal = this.data.savingsGoals.find(g => g.name.toLowerCase().startsWith(goalName));
    if (!goal) throw new Error('goal not found');
    const amount = this.evalAmount(parts[2]);
    if (isNaN(amount) || amount <= 0) throw new Error('amount invalid');
    const isDep = verb === 'dep' || verb === 'deposit';
    const signed = isDep ? amount : -amount;
    const saved = this.goalSaved(goal);
    if (!isDep && saved + signed < 0) throw new Error('insufficient savings');
    const date = this.today();
    const label = (isDep ? 'Deposit: +' : 'Withdraw: -') + Math.round(amount * 100) / 100 + ' \u00b7 ' + goal.name;
    return {
      label: label,
      execute: async () => {
        await this.addSavingsEntry(goal.id, signed, date, 'terminal');
        this.closeCommandPalette();
        this.renderPage(this.currentPage);
      }
    };
  },

  _paletteItemHtml(label, shortcut) {
    return '<div class="command-item" data-idx="' + this._cmdPaletteItems.length + '"><span class="command-item-label">' + this.escapeHtml(label) + '</span>' + (shortcut ? '<span class="command-item-shortcut">' + this.escapeHtml(shortcut) + '</span>' : '') + '</div>';
  },

  _highlightPaletteItem() {
    document.querySelectorAll('#command-results .command-item').forEach((el, i) => {
      el.classList.toggle('active', i === this._cmdPaletteIndex);
      if (i === this._cmdPaletteIndex) el.scrollIntoView({ block: 'nearest' });
    });
  },

  parseCommand(input) {
    const parts = input.trim().split(/\s+/);
    if (parts.length < 2) throw new Error('Format: amount category [date] [account] [note]');
    const amount = this.evalAmount(parts[0]);
    if (isNaN(amount)) throw new Error('Invalid amount');
    const catName = parts[1];
    let date = this.today(); let account = null; let noteParts = []; let i = 2;
    if (i < parts.length && /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(parts[i])) {
      const dp = parts[i].split('/');
      const day = dp[0].padStart(2, '0'); const month = dp[1].padStart(2, '0');
      const year = dp[2] ? (dp[2].length === 2 ? '20' + dp[2] : dp[2]) : String(new Date().getFullYear());
      date = year + '-' + month + '-' + day; i++;
    }
    const category = this.categoriesAvailableOn(date).find(c => c.name.toLowerCase().startsWith(catName.toLowerCase()));
    if (!category) throw new Error('Category not available on ' + date + ': ' + catName);
    if (i < parts.length) {
      const token = parts[i].toLowerCase();
      const ma = this.visibleAccounts().find(a => (a.shortName || '').toLowerCase() === token || a.name.toLowerCase() === token);
      if (ma) { account = ma; i++; }
    }
    if (i < parts.length) noteParts = parts.slice(i);
    if (!account) {
      const act = this.visibleAccounts().find(a => a.id === this.selectedAccount);
      if (act) account = act;
      else throw new Error('No active account - include shorthand (e.g. 500 groceries CSH)');
    }
    return { amount: Math.abs(amount), type: amount < 0 ? 'expense' : 'income', category, date, account, note: noteParts.join(' ') };
  },

  evalAmount(input) {
    return window.BlackBookAmount.evaluateAmount(input);
  },

  ordinalDay(n) {
    const d = parseInt(n, 10);
    if (isNaN(d)) return '';
    const s = ["th", "st", "nd", "rd"], v = d % 100;
    return d + (s[(v - 20) % 10] || s[v] || s[0]);
  },

  currentTheme() {
    let t = null;
    try { t = localStorage.getItem('bb-theme'); } catch (e) {}
    return t === 'light' ? 'light' : 'dark';
  },

  applyTheme() {
    let t = null;
    try { t = localStorage.getItem('bb-theme'); } catch (e) {}
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  },

  setTheme(t) {
    try { localStorage.setItem('bb-theme', t); } catch (e) {}
    this.applyTheme();
  },

  hexDim(hex, f) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  },

  hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  },

  normalizeHex(v) {
    let s = String(v || '').trim();
    if (!s) return null;
    if (s[0] !== '#') s = '#' + s;
    const m = /^#[0-9a-fA-F]{6}$/.exec(s);
    if (!m) {
      const s3 = /^#[0-9a-fA-F]{3}$/.exec(s);
      if (s3) return '#' + s3[1][0] + s3[1][0] + s3[1][1] + s3[1][1] + s3[1][2] + s3[1][2];
      return null;
    }
    return s.toLowerCase();
  },

  bindColorPicker(colorId, hexId, resetId, autoName) {
    const color = document.getElementById(colorId);
    const hex = document.getElementById(hexId);
    const reset = document.getElementById(resetId);
    if (!hex) return;
    if (hex._bound) return;
    hex._bound = true;
    if (reset) {
      reset.innerHTML = this.refreshIcon();
      reset.title = 'Use an automatic color';
      reset.setAttribute('aria-label', 'Use an automatic color');
      reset.addEventListener('click', () => {
        const c = this._catPalette[Math.floor(Math.random() * this._catPalette.length)];
        if (color) color.value = c;
        hex.value = c;
        hex.dataset.auto = '1';
      });
    }
    color.addEventListener('input', () => {
      hex.dataset.auto = '0';
      hex.value = color.value;
    });
    hex.addEventListener('input', () => {
      const c = this.normalizeHex(hex.value);
      if (c) { color.value = c; hex.value = c; hex.dataset.auto = '0'; }
    });
    hex.addEventListener('blur', () => {
      if (!this.normalizeHex(hex.value)) hex.value = color.value;
    });
  },

  applyThemeColors() {
    const s = this.data && this.data.settings;
    if (!s) return;
    const root = document.documentElement.style;
    if (s.highlightColor) {
      root.setProperty('--accent', s.highlightColor);
      root.setProperty('--accent-dim', this.hexDim(s.highlightColor, 0.72));
    }
    if (s.incomeColor) root.setProperty('--income', s.incomeColor);
    if (s.expenseColor) root.setProperty('--expense', s.expenseColor);
  },

  migrateCreditCards() {
    let changed = false;
    if (!this.data.creditCards) { this.data.creditCards = []; changed = true; }
    for (const a of this.data.accounts) {
      if ((a.type === 'credit' || a.type === 'creditcard') && !a.hidden) {
        this.data.creditCards.push({
          id: 'card-' + Math.random().toString(36).slice(2, 10),
          name: a.name,
          ratePct: a.ratePct != null ? a.ratePct : 5,
          dueDay: a.dueDay || 15,
          legacyAccountId: a.id
        });
        a.hidden = true;
        changed = true;
      }
    }
    for (const inst of this.data.installments) {
      if (inst.cardId) continue;
      const card = this.data.creditCards.find(c => c.legacyAccountId === inst.accountId);
      if (card) { inst.cardId = card.id; changed = true; }
    }
    return changed;
  },

  migrateTransfers() {
    const paired = this.data.transactions.filter(t => t.pairId && t.pairId.startsWith('pair-') && t.type !== 'transfer');
    if (!paired.length) return false;
    const pairs = {};
    for (const tx of paired) {
      if (!pairs[tx.pairId]) pairs[tx.pairId] = [];
      pairs[tx.pairId].push(tx);
    }
    const convertedIds = new Set();
    const unified = [];
    for (const [pairId, txs] of Object.entries(pairs)) {
      const expense = txs.find(t => t.type === 'expense');
      const income = txs.find(t => t.type === 'income');
      if (!expense || !income) continue;
      unified.push({
        id: 'tx-' + pairId,
        type: 'transfer',
        amount: Math.abs(expense.amount),
        amountIn: Math.abs(income.amount),
        currency: expense.currency,
        currencyIn: income.currency,
        fromAccountId: expense.accountId,
        toAccountId: income.accountId,
        categoryId: expense.categoryId,
        date: expense.date,
        note: (expense.note || '').replace(/^Transfer\s+/, ''),
        pairId: pairId
      });
      convertedIds.add(pairId);
    }
    this.data.transactions = this.data.transactions.filter(t => !convertedIds.has(t.pairId));
    this.data.transactions.push(...unified);
    return true;
  },

  visibleAccounts() { return this.data.accounts.filter(a => !a.hidden && a.type !== 'credit' && a.type !== 'creditcard'); },
  allSpendAccounts() { return this.data.accounts.filter(a => !a.hidden); },

  cardById(id) { return (this.data.creditCards || []).find(c => c.id === id); },

  fundingAccountId() {
    const s = this.data.settings.defaultAccountId;
    if (s && this.visibleAccounts().some(a => a.id === s)) return s;
    const first = this.visibleAccounts()[0];
    return first ? first.id : null;
  },

  cardsForAccount(accId) {
    return (this.data.creditCards || []).filter(c => c.legacyAccountId === accId);
  },

  billColor(bill) {
    if (bill && bill.color) return bill.color;
    return this.colorForName(bill.name || bill.id);
  },

  matchingUnpaidBill(tx) {
    if (!tx || tx.type !== 'expense' || this.isTransfer(tx)) return null;
    const { y, m } = this.ymOf(tx.date);
    const mk = y + '-' + String(m + 1).padStart(2, '0');
    const linkedTx = new Set((this.data.billPayments || []).flatMap(p => this.billPaymentTransactionIds(p)));
    if (linkedTx.has(tx.id)) return null;
    const txRsd = Math.abs(this.transactionToBase(tx));
    for (const bill of (this.data.bills || [])) {
      if (bill.active === false) continue;
      if (bill.frequency === 'annual' && !this.billOccursInMonth(bill, mk)) continue;
      const existingPayment = this.getBillPayment(bill.id, mk);
      const from = this.billPayFrom(bill);
      const matchAcc = from && from.startsWith('card:') ? tx.cardId === from.slice(5) : (tx.accountId === from);
      if (bill.categoryId && tx.categoryId && bill.categoryId !== tx.categoryId) continue;
      let descriptionMatch = false;
      if (bill.name && tx.note) {
        const bn = String(bill.name).trim().toLowerCase();
        const tn = String(tx.note).trim().toLowerCase();
        descriptionMatch = tn === bn || tn.includes(bn) || bn.includes(tn);
        if (!descriptionMatch) continue;
      } else if (bill.name && !tx.note) {
        continue;
      }
      // Once a split payment exists, matching descriptions may contribute from
      // another card/account. Keep source/amount safeguards for the first match.
      if (!matchAcc && !descriptionMatch) continue;
      if (!existingPayment && bill.amount != null && txRsd > 0 && !descriptionMatch) {
        const bar = this.toBase(Math.abs(bill.amount), bill.currency || this.baseCurrency());
        const tolerance = Math.max(bar * 0.05, 1);
        if (Math.abs(txRsd - bar) > tolerance) continue;
      }
      return bill;
    }
    return null;
  },

  linkedBillForTx(tx) {
    if (!tx) return null;
    const pay = this.billPaymentForTx(tx.id);
    if (!pay) return null;
    const bill = (this.data.bills || []).find(b => b.id === pay.billId);
    return bill || null;
  },

  billPaymentForTx(txId) {
    return (this.data.billPayments || []).find(p => this.billPaymentTransactionIds(p).includes(txId)) || null;
  },

  billPaymentTransactionIds(payment) {
    if (!payment) return [];
    const ids = [...(Array.isArray(payment.relatedTxIds) ? payment.relatedTxIds : []), payment.txId];
    return [...new Set(ids.filter(Boolean))];
  },

  billPaymentTransactions(payment) {
    const ids = new Set(this.billPaymentTransactionIds(payment));
    return (this.data.transactions || []).filter(tx => ids.has(tx.id));
  },

  billPaymentTotalBase(payment, bill) {
    const transactions = this.billPaymentTransactions(payment);
    if (transactions.length) return this.round2(transactions.reduce((sum, tx) => sum + Math.abs(this.transactionToBase(tx)), 0));
    const amount = payment && payment.amount != null ? payment.amount : bill && bill.amount;
    if (amount == null) return 0;
    if (payment && payment.nativeAmount != null && !payment.amountCurrency) return Math.abs(Number(amount) || 0);
    const currency = payment && (payment.amountCurrency || payment.payCurrency) || bill && bill.currency || this.baseCurrency();
    return Math.abs(this.toBase(Number(amount) || 0, currency));
  },

  syncBillPaymentTransactions(payment, bill) {
    const transactions = this.billPaymentTransactions(payment);
    if (!transactions.length) return;
    transactions.sort((a, b) => Math.abs(this.transactionToBase(b)) - Math.abs(this.transactionToBase(a)));
    payment.relatedTxIds = transactions.map(tx => tx.id);
    payment.txId = transactions[0].id;
    payment.amount = this.billPaymentTotalBase(payment, bill);
    payment.amountCurrency = this.baseCurrency();
    const currencies = new Set(transactions.map(tx => tx.currency || this.baseCurrency()));
    payment.payCurrency = currencies.size === 1 ? transactions[0].currency || this.baseCurrency() : this.baseCurrency();
  },

  debtForPaymentTx(txId) {
    const d = (this.data.debts || []).find(x => x.id != null && (this.data.transactions || []).find(t => t.id === txId && t.debtId === x.id));
    return d || null;
  },

  invoiceForPaymentTx(txId) {
    for (const v of (this.data.invoices || [])) {
      const p = (v.payments || []).find(pay => pay.txId === txId);
      if (p) return { invoice: v, paymentIndex: (v.payments || []).indexOf(p) };
      if (txId && String(txId).indexOf('tx-inv-' + v.id + '-p') === 0) {
        const idx = (v.payments || []).findIndex(pay => pay && pay.txId === txId);
        return { invoice: v, paymentIndex: idx >= 0 ? idx : -1 };
      }
    }
    return null;
  },

  savingsForTx(txId) {
    for (const g of (this.data.savingsGoals || [])) {
      const idx = (g.entries || []).findIndex(e => e.id === txId || (this.data.transactions || []).find(t => t.id === txId && t.linkId === e.id));
      if (idx >= 0) return { goal: g, entryIndex: idx };
    }
    return null;
  },

  linkedRecordType(tx) {
    if (!tx) return null;
    if (this.billPaymentForTx(tx.id)) return 'bill';
    if (this.debtForPaymentTx(tx.id)) return 'debt';
    if (this.invoiceForPaymentTx(tx.id)) return 'invoice';
    if (this.savingsForTx(tx.id)) return 'savings';
    if (tx.cardId || tx.installId) return 'card';
    if (this.installmentForTx(tx.id)) return 'card';
    return null;
  },

  installmentForTx(txId) {
    const tx = (this.data.transactions || []).find(t => t.id === txId);
    if (!tx) return null;
    if (tx.cardBillPayment && Array.isArray(tx.installmentAllocations)) {
      for (const allocation of tx.installmentAllocations) {
        if (!allocation) continue;
        const inst = (this.data.installments || []).find(i => String(i.id) === String(allocation.installmentId));
        if (inst) return { inst, seq: Number(allocation.seq) || null, cardPayment: true };
      }
    }
    if (tx.pairId && String(tx.pairId).indexOf('inst-') === 0) {
      const m = String(tx.pairId).match(/^inst-(.+)-s(\d+)$/);
      if (m) {
        const inst = (this.data.installments || []).find(i => String(i.id) === m[1]);
        if (inst) return { inst, seq: parseInt(m[2], 10) };
      }
    }
    if (tx.installId) {
      const inst = (this.data.installments || []).find(i => String(i.id) === String(tx.installId));
      if (inst) return { inst, seq: null };
    }
    return null;
  },

  linkTxToBill(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    const bill = this.matchingUnpaidBill(tx);
    if (!tx || !bill) return;
    const { y, m } = this.ymOf(tx.date);
    const mk = y + '-' + String(m + 1).padStart(2, '0');
    const existing = this.getBillPayment(bill.id, mk);
    if (existing) {
      const linkedIds = new Set(this.billPaymentTransactionIds(existing));
      if (linkedIds.has(tx.id)) return;
      if ([...linkedIds].length && [...linkedIds].every(id => String(id).startsWith('bil-'))) this.removeBillTransaction(existing);
      existing.paid = true;
      existing.relatedTxIds = [...new Set([...this.billPaymentTransactionIds(existing), tx.id])];
      this.syncBillPaymentTransactions(existing, bill);
    } else {
      if (!this.data.billPayments) this.data.billPayments = [];
      const payment = { billId: bill.id, month: mk, paid: true, relatedTxIds: [tx.id] };
      this.data.billPayments.push(payment);
      this.syncBillPaymentTransactions(payment, bill);
    }
    this.save({ undoable: true, label: 'Mark bill paid' });
    this.renderPage(this.currentPage);
  },


  transferCategory() {
    let cat = this.data.categories.find(c => c.name.toLowerCase() === 'transfer');
    if (!cat) {
      cat = { id: crypto.randomUUID(), name: 'Transfer', color: '#71717a' };
      this.data.categories.push(cat);
    }
    return cat;
  },

  invoiceCategory() {
    let cat = this.data.categories.find(c => c.name.toLowerCase() === 'invoice');
    if (!cat) {
      cat = { id: 'cat-invoice', name: 'Invoice', color: '#fa8c3c' };
      this.data.categories.push(cat);
    }
    return cat;
  },

  debtCategory() {
    let cat = this.data.categories.find(c => c.name.toLowerCase() === 'debt');
    if (!cat) {
      cat = { id: 'cat-debt', name: 'Debt', color: '#facc15' };
      this.data.categories.push(cat);
    }
    return cat;
  },

  _invFileStore() {
    if (this._hostedMode) return Promise.reject(new Error('Invoice file storage is unavailable in the hosted version.'));
    if (this._invFileStorePromise) return this._invFileStorePromise;
    this._invFileStorePromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('blackbook-invoice-files', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._invFileStorePromise;
  },

  async _invFilePut(id, blob) {
    try {
      const db = await this._invFileStore();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, 'inv:' + id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { return false; }
  },

  async _invFileGet(id) {
    try {
      const db = await this._invFileStore();
      return new Promise((resolve) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get('inv:' + id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  },

  async _invFileDel(id) {
    try {
      const db = await this._invFileStore();
      return new Promise((resolve) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete('inv:' + id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  },

  _fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },

  _dataURLToBlob(dataUrl) {
    try {
      const m = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      if (!m) return null;
      const mime = m[1] || 'application/octet-stream';
      const bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  },

  async openInvoiceFile(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v) return;
    if (v.filePath) {
      try {
        const response = await fetch('/api/invoice-file/open', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: this.profile || '', id: v.id })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not open the linked file.');
      } catch (error) {
        alert(error.message || 'Could not open the linked file.');
      }
      return;
    }
    const tab = window.open('', '_blank');
    let stored = await this._invFileGet(id);
    if (!stored && v.fileData) stored = this._dataURLToBlob(v.fileData);
    if (!stored) {
      if (tab) tab.close();
      alert('The local invoice link is unavailable in this browser. Edit the invoice and attach the file again.');
      return;
    }
    try {
      if (typeof stored.getFile === 'function') {
        const permission = await stored.queryPermission({ mode: 'read' });
        if (permission !== 'granted' && await stored.requestPermission({ mode: 'read' }) !== 'granted') {
          throw new Error('File access was not granted.');
        }
        stored = await stored.getFile();
      }
      const url = URL.createObjectURL(stored);
      const inlineSafe = /^(application\/pdf|image\/(?:png|jpeg|gif|webp))$/.test(stored.type || '');
      if (inlineSafe) {
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      } else {
        if (tab) tab.close();
        const link = document.createElement('a');
        link.href = url;
        link.download = v.fileName || 'invoice-file';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (tab) tab.close();
      alert('Could not open the linked file. It may have moved or access may have expired. Edit the invoice to link it again.');
    }
  },

  isTransfer(tx) {
    if (!tx) return false;
    if (tx.type === 'transfer') return true;
    if (!tx.categoryId) return false;
    const t = this.data.categories.find(c => c.name.toLowerCase() === 'transfer');
    return !!t && tx.categoryId === t.id;
  },

  bindOutsideDeselect() {
    if (this._outsideDeselectBound) return;
    this._outsideDeselectBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (!this._bulkSel || !this._bulkSel.size) return;
      if (e.target.closest('.tx-row, .bulk-filter-chip, .ov-merge-selected, .ov-type-cycle, .ov-sort-cycle, .ov-sort-dir, .cat-filter-chip, .mp-month, .mp-year-btn, .mp-today, .account-chip, .modal')) return;
      this.bulkClear();
    });
  },

  bindGlobalSelectWheel() {
    if (this._selectWheelBound) return;
    this._selectWheelBound = true;
    document.addEventListener('wheel', (e) => {
      const sel = e.target.closest && e.target.closest('select');
      if (!sel || sel.disabled || sel.multiple || !sel.options.length) return;
      e.preventDefault();
      const d = e.deltaY > 0 ? 1 : -1;
      sel.selectedIndex = (sel.selectedIndex + d + sel.options.length) % sel.options.length;
      sel.dispatchEvent(new Event('change'));
    }, { passive: false });
  },

  bindDateWheel() {
    if (this._dateWheelBound) return;
    this._dateWheelBound = true;
    document.addEventListener('wheel', (e) => {
      const el = e.target;
      if (!el || el.tagName !== 'INPUT' || el.type !== 'text' || el.readOnly || el.disabled) return;
      if (!el.matches('[data-date-input]')) return;
      if (!el.value.trim()) { e.preventDefault(); el.value = this.fmtDateInput(this.today()); return; }
      const parsed = this.parseDateInput(el.value);
      if (!parsed) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const p = parsed.split('-');
      const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + dir);
      el.value = this.fmtDateInput(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { passive: false });
  },

  bindMonthWheel() {
    if (this._monthWheelBound) return;
    this._monthWheelBound = true;
    const onWheel = (e) => {
      if (e.target.closest && e.target.closest('.accounts-panel')) return;
      const target = e.target.closest && e.target.closest('.month-picker, .account-chips, .app-sidebar');
      if (!target) return;
      const dir = e.deltaY < 0 ? 1 : -1;
      if (target.matches('.account-chips')) { e.preventDefault(); this.cycleAccount(-dir); return; }
      if (target.matches('.app-sidebar')) { e.preventDefault(); this.cyclePage(-dir); return; }
      const mp = target;
      const checkOverYear = () => {
        const yearBtn = mp.querySelector('.mp-year');
        if (!yearBtn) return false;
        const yr = yearBtn.getBoundingClientRect();
        return e.clientY >= yr.top && e.clientY <= yr.bottom &&
               e.clientX >= yr.left && e.clientX <= yr.right;
      };
      e.preventDefault();
      if (checkOverYear()) this.shiftYear(dir);
      else this.arrowPeriod(dir);
      mp._lastWheel = Date.now();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
  },

  transferCategoryObj() {
    let cat = this.data.categories.find(c => (c.name || '').toLowerCase() === 'transfer');
    if (!cat) {
      cat = { id: 'cat-transfer', name: 'Transfer', color: '#71717a' };
      this.data.categories.push(cat);
    }
    return cat;
  },

  bindBillModalSubmit() {
    document.getElementById('bill-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('bill-id').value;
      const rawAmt = String(document.getElementById('bill-amount').value).trim().replace(/\s+/g, '').replace(',', '.');
      const parsedAmt = this.evalAmount(rawAmt);
      const colorEl = document.getElementById('bill-color');
      const hexEl = document.getElementById('bill-color-hex');
      const resetBtn = document.getElementById('bill-color-reset');
      let color = null;
      const isAuto = hexEl && hexEl.dataset.auto === '1';
      if (!isAuto && colorEl) color = this.normalizeHex(hexEl ? hexEl.value : colorEl.value);
      const frequency = document.getElementById('bill-frequency-toggle').dataset.frequency === 'annual' ? 'annual' : 'monthly';
      const original = id ? this.data.bills.find(b => b.id === id) : null;
      const billData = { name: document.getElementById('bill-name').value, amount: parsedAmt > 0 ? parsedAmt : null, currency: document.getElementById('bill-currency').value, frequency, dueMonth: frequency === 'annual' ? parseInt(document.getElementById('bill-dueMonth').value, 10) : null, dueDay: parseInt(document.getElementById('bill-dueDay').value), categoryId: document.getElementById('bill-category').value, active: original ? original.active !== false : true, autopay: document.getElementById('bill-autopay-toggle').dataset.autopay === 'true', payAccountId: document.getElementById('bill-payfrom').value || null, color: isAuto ? null : color };
      if (!this.categorySelectionAllowed(billData.categoryId, this.today(), original && original.categoryId)) { alert('That category is archived. Choose another category.'); return; }
      let linkedRecurringCount = 0, skippedRecurringCount = 0;
      if (id) { const bill = this.data.bills.find(b => b.id === id); if (bill) Object.assign(bill, billData); }
      else {
        billData.id = crypto.randomUUID();
        this.data.bills.push(billData);
        const pendingIds = this._pendingRecurringBillTxIds || [];
        const byMonth = new Map();
        for (const txId of pendingIds) {
          const tx = (this.data.transactions || []).find(item => item.id === txId);
          if (!tx || tx.type !== 'expense' || this.billPaymentForTx(tx.id)) { skippedRecurringCount++; continue; }
          const month = this.monthKeyOf(tx.date);
          if (!this.billOccursInMonth(billData, month)) { skippedRecurringCount++; continue; }
          if (!byMonth.has(month)) byMonth.set(month, []);
          byMonth.get(month).push(tx.id);
        }
        for (const [month, txIds] of byMonth) {
          const payment = { billId: billData.id, month, paid: true, relatedTxIds: [...new Set(txIds)] };
          this.data.billPayments.push(payment);
          this.syncBillPaymentTransactions(payment, billData);
          linkedRecurringCount += payment.relatedTxIds.length;
        }
        this._pendingRecurringBillTxIds = null;
      }
      await this.save({ undoable: true, label: id ? 'Edit bill' : 'Add bill' }); this.closeModal('bill-modal'); this.renderPage(this.currentPage);
      if (linkedRecurringCount) this.showToast(linkedRecurringCount + ' past payment(s) linked to bill' + (skippedRecurringCount ? ' · ' + skippedRecurringCount + ' not linked' : ''));
    });
  },

  selectCategory(id, ev) {
    if (ev && ev.altKey) {
      this._ovInc = false;
      this._ovExp = false;
    }
    if (id == null) this.selectedCategories = null;
    else if (ev && ev.shiftKey && !ev.altKey) {
      const selected = new Set(this.selectedCategories || []);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      this.selectedCategories = selected.size ? selected : null;
    } else this.selectedCategories = new Set([id]);
    this.renderPage(this.currentPage);
  },

  // ==================== MONTH PICKER ====================

  monthPickerHtml() {
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    let btns = '';
    for (let i = 0; i < 12; i++) {
      const sel = i === this.vm();
      const isCur = now.getFullYear() === this.vy() && now.getMonth() === i;
      btns += '<button class="mp-month' + (sel ? ' selected' : '') + (isCur && !sel ? ' current' : '') + '" onclick="BlackBook.pickMonth(' + i + ')"><span class="month-name-full">' + months[i] + '</span><span class="month-name-short">' + shortMonths[i] + '</span><span class="month-name-number">' + (i + 1) + '</span></button>';
    }
    const offToday = !(now.getFullYear() === this.vy() && now.getMonth() === this.vm());
    return '<div class="month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<div class="mp-months">' + btns + '</div>' +
      '<button class="mp-today' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '</div>';
  },

  vw() {
    if (!this._pageView) this._pageView = {};
    const p = this.currentPage || 'overview';
    if (!this._pageView[p]) {
      const n = new Date();
      this._pageView[p] = { m: n.getMonth(), y: n.getFullYear() };
    }
    return this._pageView[p];
  },
  vm() { return this.vw().m; },
  vy() { return this.vw().y; },

  clearTransactionSelectionForPeriod() {
    if (this._bulkSel) this._bulkSel.clear();
    this._bulkOnly = false;
    this._linkedTransactionFocusId = null;
  },
  pickMonth(m) { if (this.vw().m !== m) this.clearTransactionSelectionForPeriod(); this.vw().m = m; this.renderPage(this.currentPage); },
  shiftYear(d) { if (d) this.clearTransactionSelectionForPeriod(); this.vw().y += d; this.renderPage(this.currentPage); },
  arrowPeriod(dir) {
    if (this.currentPage === 'reports' && this.shiftReportsPeriod) { this.shiftReportsPeriod(dir); return; }
    if (this.currentPage === 'savings') { this.shiftYear(dir); return; }
    const v = this.vw();
    let y = v.y, m = v.m + dir;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    if (y !== v.y || m !== v.m) this.clearTransactionSelectionForPeriod();
    v.y = y; v.m = m;
    this.renderPage(this.currentPage);
  },
  gotoToday() {
    if (this.currentPage === 'reports' && this.reportsToday) { this.reportsToday(); return; }
    const n = new Date();
    const v = this.vw();
    if (v.m !== n.getMonth() || v.y !== n.getFullYear()) this.clearTransactionSelectionForPeriod();
    v.m = n.getMonth();
    v.y = n.getFullYear();
    this.renderPage(this.currentPage);
  },

  navigateToRecord(type, id) {
    const txId = id;
    const tx = this.data.transactions.find(t => t.id === txId);
    let page = null;
    let month = null;
    if (type === 'bill') {
      const bp = this.billPaymentForTx(txId);
      const bill = bp && (this.data.bills || []).find(item => item.id === bp.billId);
      if (bill) id = bill.id;
      page = 'bills';
      if (bp && bp.month) { const parts = bp.month.split('-'); month = { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10) - 1 }; }
    } else if (type === 'debt') {
      const debt = this.debtForPaymentTx(txId);
      if (debt) id = debt.id;
      page = 'debts';
    } else if (type === 'invoice') {
      const linked = this.invoiceForPaymentTx(txId);
      if (linked && linked.invoice) id = linked.invoice.id;
      page = 'invoices';
    } else if (type === 'savings') {
      const linked = this.savingsForTx(txId);
      if (linked && linked.goal) id = linked.goal.id;
      page = 'savings';
    } else if (type === 'card') {
      const linked = this.installmentForTx(txId);
      if (linked && linked.inst) id = linked.inst.id;
      else if (tx && tx.cardId) id = tx.cardId;
      page = 'cards';
    }
    if (!page) return;
    if (tx && !month) {
      if (tx.date) { const { y, m } = this.ymOf(tx.date); if (!isNaN(y) && !isNaN(m)) month = { y, m }; }
    }
    if (month) {
      if (!this._pageView) this._pageView = {};
      if (!this._pageView[page]) { const n = new Date(); this._pageView[page] = { m: n.getMonth(), y: n.getFullYear() }; }
      this._pageView[page].y = month.y;
      this._pageView[page].m = month.m;
    }
    this._focusRecord = { type, id };
    this.navigateTo(page);
  },

  transactionLinkIcon() {
    return '<svg class="transaction-link-icon" viewBox="0 0 874 870" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><g transform="matrix(1,0,0,1,36,40)"><path fill="currentColor" d="M584.703,352.703C585.861,351.553 663.384,274.104 666.173,271.191C681.687,254.99 691.281,228.812 692.092,212.466C696.216,129.287 621.859,91.139 565.435,107.273C531.042,117.107 522.14,133.437 451.297,203.293C421.428,232.747 369.415,215.489 365.936,171.454C363.816,144.624 381.91,131.315 411.112,102.112C452.445,60.779 488.069,16.578 564.528,5.718C721.175,-16.531 843.543,146.221 771.056,293.293C754.189,327.516 741.51,337.254 638.889,439.891C591.862,486.925 568.933,514.468 522.571,531.689C401.562,576.636 313.371,495.179 303.392,478.573C271.143,424.905 339.028,375.939 380.327,415.681C386.432,421.556 425.982,459.613 483.516,439.546C509.557,430.463 511.85,425.541 584.703,352.703Z"/></g><g transform="matrix(1,0,0,1,36,40)"><path fill="currentColor" d="M211.297,443.297C121.841,532.797 120.282,532.235 111.46,553.484C78.109,633.819 155.256,718.172 241.322,685.056C262.665,676.843 268.466,668.953 333.702,603.702C340.165,597.239 367.238,562.414 407.297,585.851C417.874,592.039 451.18,627.426 411.889,666.891C338.33,740.776 328.976,750.143 312.679,759.814C294.869,770.383 275.67,783.532 229.519,790.608C163.409,800.744 108.451,768.262 99.28,762.841C9.628,709.853 -26.722,584.517 33.124,488.253C49.354,462.147 50.464,462.777 186.111,327.109C207.403,305.814 247.968,257.758 332.496,251.424C402.422,246.183 452.113,281.915 460.78,288.147C471.877,296.127 515.535,323.63 496.084,366.294C487.047,386.116 450.773,413.558 413.172,377.844C378.797,345.194 316.387,338.267 273.777,380.777C268.771,385.771 237.093,417.374 211.297,443.297Z"/></g></svg>';
  },

  healthMarker() { return ''; },

  linkedTransactionButton(txId) {
    const tx = (this.data.transactions || []).find(item => item && item.id === txId);
    if (!tx) return txId ? '<button type="button" class="health-link" aria-label="Missing linked transaction" title="This linked transaction is missing" onclick="event.stopPropagation();BlackBook.openDataHealth()">' + this.transactionLinkIcon() + '</button>' : '';
    return '<button type="button" class="btn btn-sm btn-secondary linked-tx-action" data-tx-id="' + this.escapeHtml(tx.id) + '" onclick="event.stopPropagation();BlackBook.openLinkedTransaction(this.dataset.txId)" title="Open this transaction" aria-label="Open linked transaction">' + this.transactionLinkIcon() + '</button>';
  },

  linkedBillPaymentButton(payment) {
    const ids = this.billPaymentTransactionIds(payment).filter(id => (this.data.transactions || []).some(tx => tx.id === id));
    if (!ids.length) return '';
    const encoded = JSON.stringify(ids);
    return '<button type="button" class="btn btn-sm btn-secondary linked-tx-action" data-tx-ids="' + this.escapeHtml(encoded) + '" onclick="event.stopPropagation();BlackBook.openDataHealthTransactions(JSON.parse(this.dataset.txIds))" title="Show all ' + ids.length + ' bill payment transaction' + (ids.length === 1 ? '' : 's') + ' on Overview" aria-label="Show linked bill payment transactions on Overview">' + this.transactionLinkIcon() + '</button>';
  },

  openLinkedTransaction(txId) {
    this._overviewCustomFilter = null;
    const tx = (this.data.transactions || []).find(item => item && item.id === txId);
    if (!tx) return;
    const { y, m } = this.ymOf(tx.date);
    if (!isNaN(y) && !isNaN(m)) {
      if (!this._pageView) this._pageView = {};
      if (!this._pageView.overview) this._pageView.overview = { y, m };
      this._pageView.overview.y = y;
      this._pageView.overview.m = m;
    }
    this._linkedTransactionFocusId = tx.id;
    this.selectedAccount = tx.type === 'transfer' ? tx.fromAccountId || tx.toAccountId || null : tx.accountId || null;
    this.selectedCategories = null;
    this._ovInc = true;
    this._ovExp = true;
    this._bulkSel = new Set([tx.id]);
    this._bulkOnly = false;
    this.navigateTo('overview');
  },

  openDataHealthTransactions(txIds) {
    this._overviewCustomFilter = null;
    const requested = new Set((txIds || []).filter(Boolean));
    const transactions = (this.data.transactions || []).filter(tx => tx && requested.has(tx.id));
    if (!transactions.length) return;
    this.closeModal('data-health-modal');
    const firstDated = transactions.find(tx => tx.date);
    if (firstDated) {
      const { y, m } = this.ymOf(firstDated.date);
      if (!isNaN(y) && !isNaN(m)) {
        if (!this._pageView) this._pageView = {};
        if (!this._pageView.overview) this._pageView.overview = { y, m };
        this._pageView.overview.y = y;
        this._pageView.overview.m = m;
      }
    }
    this.selectedAccount = null;
    this.selectedCategories = null;
    this._ovInc = true;
    this._ovExp = true;
    this._bulkSel = new Set(transactions.map(tx => tx.id));
    this._bulkOnly = true;
    this._linkedTransactionFocusId = null;
    this.navigateTo('overview');
  },

  focusRecordHtml(type, id) {
    if (!this._focusRecord || this._focusRecord.type !== type || this._focusRecord.id !== id) return '';
    return ' record-focused';
  },

  clearFocusRecord() { this._focusRecord = null; },

  finishFocus(type) {
    const fr = this._focusRecord;
    if (!fr || fr.type !== type) return;
    const el = document.querySelector('.record-focused');
    if (el) {
      setTimeout(() => { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 60);
    }
    const id = fr.id;
    setTimeout(() => { if (this._focusRecord && this._focusRecord.id === id) this._focusRecord = null; }, 2000);
  },

  syncViewToDate(dateStr) {
    if (!dateStr) return;
    const { y, m } = this.ymOf(dateStr);
    if (!isNaN(y) && !isNaN(m)) { const v = this.vw(); v.y = y; v.m = m; }
  },

  initCategoryPicker(inputId, hiddenId, dropdownId) {
    if (this._catPickBound && this._catPickBound.has(inputId)) return;
    if (!this._catPickBound) this._catPickBound = new Set();
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;
    this._catPickBound.add(inputId);

    const sortedCats = (query = '') => {
      const needle = query.trim().toLocaleLowerCase();
      return this.categoriesAvailableOn(this.categoryPickerDate(inputId), hidden.value)
        .filter((cat) => !needle || this.categoryLabel(cat).toLocaleLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name));
    };
    const closeDropdown = () => dropdown.classList.add('hidden');
    const pick = (cat) => {
      if (!cat) return;
      input.value = this.categoryLabel(cat).toUpperCase();
      hidden.value = cat.id;
      input.classList.remove('pick-empty');
      closeDropdown();
    };
    const cycle = (dir) => {
      const cats = sortedCats();
      if (!cats.length) return;
      const idx = cats.findIndex(c => c.id === hidden.value);
      const next = idx < 0 ? (dir > 0 ? 0 : cats.length - 1) : (idx + dir + cats.length) % cats.length;
      pick(cats[next]);
    };

    const openDropdown = (query = '') => {
      const cats = sortedCats(query);
      dropdown.innerHTML = cats.length ? cats.map(c =>
        '<div class="category-dropdown-item' + (c.id === hidden.value ? ' active' : '') + '" data-id="' + c.id + '"><span class="cat-dot" style="background:' + this.categoryColor(c) + ';"></span>' + this.escapeHtml(this.categoryLabel(c)) + '</div>'
      ).join('') : '<div class="category-dropdown-empty">No categories yet</div>';
      const act = dropdown.querySelector('.category-dropdown-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
      dropdown.classList.remove('hidden');
    };

    input.addEventListener('click', () => openDropdown());
    input.addEventListener('focus', () => { input.select(); openDropdown(); });
    input.addEventListener('input', () => {
      hidden.value = '';
      input.classList.toggle('pick-empty', !input.value.trim());
      openDropdown(input.value);
    });
    input.addEventListener('wheel', (e) => { e.preventDefault(); cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cycle(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycle(-1); }
      else if (e.key === 'Escape') {
        if (!dropdown.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); }
        closeDropdown();
      } else if (e.key === 'Enter' && !dropdown.classList.contains('hidden')) {
        e.preventDefault(); e.stopPropagation();
        const cats = sortedCats(input.value);
        if (cats[0]) pick(cats[0]); else closeDropdown();
      }
    });

    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.category-dropdown-item');
      if (!item || !item.dataset.id) return;
      pick(this.data.categories.find(c => c.id === item.dataset.id));
    });

    document.addEventListener('pointerdown', (e) => {
      if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== input) {
        closeDropdown();
      }
    });
  },

  upgradeSelect(el) {
    if (!el || el.tagName !== 'SELECT' || el.dataset.customSelect === '1') return;
    const wrap = document.createElement('div');
    wrap.className = 'category-autocomplete custom-select';
    if (el.classList.contains('qe-currency')) wrap.classList.add('cs-flex-fixed');
    const btn = document.createElement('div');
    btn.className = 'input custom-select-btn';
    btn.tabIndex = 0;
    const list = document.createElement('div');
    list.className = 'category-dropdown hidden';
    el.dataset.customSelect = '1';
    el.parentNode.replaceChild(wrap, el);
    wrap.appendChild(el);
    wrap.appendChild(btn);
    wrap.appendChild(list);

    const sync = () => {
      const opt = el.selectedOptions && el.selectedOptions[0];
      btn.textContent = (opt && opt.text) ? opt.text : '\u00a0';
    };
    el._syncCustomSelect = sync;
    const curIndex = () => Math.max(el.selectedIndex, 0);
    const open = () => {
      const opts = Array.from(el.options);
      list.innerHTML = opts.length ? opts.map((o, i) =>
        '<div class="category-dropdown-item' + (i === curIndex() ? ' active' : '') + '" data-i="' + i + '">' + this.escapeHtml(o.text) + '</div>'
      ).join('') : '<div class="category-dropdown-empty">No options</div>';
      const act = list.querySelector('.category-dropdown-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
      list.classList.remove('hidden');
    };
    const close = () => list.classList.add('hidden');
    const toggle = () => list.classList.contains('hidden') ? open() : close();
    const pickIndex = (i) => {
      if (!el.options.length) return;
      el.selectedIndex = Math.min(Math.max(i, 0), el.options.length - 1);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    };

    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    btn.addEventListener('wheel', (e) => {
      if (el.disabled || el.multiple || !el.options.length) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY > 0 ? 1 : -1;
      pickIndex((curIndex() + step + el.options.length) % el.options.length);
    }, { passive: false });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.classList.contains('hidden')) { open(); return; }
        const step = e.key === 'ArrowDown' ? 1 : -1;
        let i = curIndex() + step;
        if (i < 0) i = el.options.length - 1;
        if (i >= el.options.length) i = 0;
        pickIndex(i);
        open();
      }
    });
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.category-dropdown-item');
      if (!item || !item.dataset.i) return;
      pickIndex(parseInt(item.dataset.i, 10));
      close();
    });
    list.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    document.addEventListener('pointerdown', (e) => {
      if (!list.classList.contains('hidden') && !wrap.contains(e.target)) close();
    });
    el.addEventListener('change', sync);
    if (window.MutationObserver) new MutationObserver(() => sync()).observe(el, { childList: true, attributes: true, subtree: true });
    sync();
  },

  syncCustomSelect(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el && typeof el._syncCustomSelect === 'function') el._syncCustomSelect();
  },

  upgradeAllSelects(root) {
    const scope = root || document;
    scope.querySelectorAll('select:not([hidden])').forEach(s => this.upgradeSelect(s));
  },

  chartAccountsTx() {
    let txs = this.data.transactions.slice();
    if (this.currentPage === 'overview') txs = txs.filter(tx => this.overviewCustomMatches(tx));
    if (this.activeFilters.accounts.length) {
      txs = txs.filter(t => {
        if (t.type === 'transfer') return this.activeFilters.accounts.includes(t.fromAccountId) || this.activeFilters.accounts.includes(t.toAccountId);
        return this.activeFilters.accounts.includes(t.accountId);
      });
    }
    if (this._bulkSel && this._bulkSel.size && this._bulkOnly) txs = txs.filter(t => this._bulkSel.has(t.id));
    return txs;
  },

  captureChartPanelHeights(pageEl) {
    if (!pageEl) return [];
    return Array.from(pageEl.querySelectorAll('.chart-panel, .chart-panel-full')).map((panel, index) => ({
      key: panel.id || Array.from(panel.classList).filter(name => name !== 'chart-panel' && name !== 'chart-panel-full' && name !== 'chart-panel-resizing').sort().join('.') || String(index),
      height: panel.style.height
    }));
  },

  restoreChartPanelHeights(pageEl, heights) {
    if (!pageEl || !heights || !heights.length) return;
    const panels = Array.from(pageEl.querySelectorAll('.chart-panel, .chart-panel-full'));
    panels.forEach((panel, index) => {
      const key = panel.id || Array.from(panel.classList).filter(name => name !== 'chart-panel' && name !== 'chart-panel-full' && name !== 'chart-panel-resizing').sort().join('.') || String(index);
      const saved = heights.find(item => item.key === key && item.height);
      if (saved) panel.style.height = saved.height;
    });
  },

  initChartResize() {
    if (this._chartResizeBound) return;
    this._chartResizeBound = true;
    const HIDE_PX = 40;
    const DRAG_PX = 6;
    document.addEventListener('mousedown', (e) => {
      const canvas = e.target.closest('.chart-panel canvas, .chart-panel-full canvas');
      if (!canvas) return;
      const panel = canvas.closest('.chart-panel, .chart-panel-full');
      if (!panel) return;
      const startY = e.clientY;
      const startH = panel.offsetHeight;
      const startBottom = panel.getBoundingClientRect().bottom;
      const pinBottom = Math.min(startBottom, window.innerHeight - 4);
      let dragged = false;
      let hidden = false;
      const doHide = () => {
        if (hidden) return;
        hidden = true;
        panel.style.display = 'none';
        const fn = this._hideFnForPanel(panel);
        if (fn) this[fn]();
      };
      const cleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        window.removeEventListener('blur', cleanup);
        panel.classList.remove('chart-panel-resizing');
      };
      const onMove = (ev) => {
        const delta = startY - ev.clientY;
        if (!dragged) {
          if (Math.abs(delta) < DRAG_PX) return;
          dragged = true;
          ev.preventDefault();
        }
        let newH = startH + delta;
        if (newH < HIDE_PX) { doHide(); cleanup(); return; }
        const pctMax = Math.max(HIDE_PX, window.innerHeight * 0.65);
        newH = Math.min(newH, pctMax);
        if (newH < HIDE_PX) newH = HIDE_PX;
        panel.style.height = newH + 'px';
        const br = panel.getBoundingClientRect();
        const drift = br.bottom - pinBottom;
        if (Math.abs(drift) > 1) panel.style.height = Math.max(HIDE_PX, br.height - drift) + 'px';
      };
      const onUp = () => {
        cleanup();
        if (!dragged && panel.offsetHeight <= 0) doHide();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      window.addEventListener('blur', cleanup);
    });
  },

  _hideFnForPanel(panel) {
    if (!panel) return null;
    const pageId = panel.closest('.page');
    const pid = pageId ? pageId.id : '';
    if (pid === 'page-overview') return 'toggleOverviewGraph';
    if (pid === 'page-bills') return 'toggleBillsGraph';
    if (pid === 'page-budget') return 'toggleBudgetGraph';
    const canvas = panel.querySelector('canvas');
    const id = canvas ? canvas.id : '';
    if (id === 'overview-chart' || id === 'overview-line-chart' || id === 'pie') return 'toggleOverviewGraph';
    if (id === 'bills-chart') return 'toggleBillsGraph';
    if (id === 'budget-chart') return 'toggleBudgetGraph';
    if (id === 'forecast-chart') return 'toggleForecastGraph';
    return null;
  },

  resetChartHeights() {
    document.querySelectorAll('.chart-panel, .chart-panel-full').forEach(p => {
      p.style.height = '';
    });
  },
};
