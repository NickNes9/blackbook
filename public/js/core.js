window.BlackBook = {
  data: null,
  profile: localStorage.getItem('mb_profile') || '',
  currentPage: 'overview',
  selectedAccount: null,
  selectedCategory: null,
  viewMonth: new Date().getMonth(),
  viewYear: new Date().getFullYear(),
  hoveredTxId: null,
  selectedTxIds: [],
  lastClickedTxId: null,
  activeFilters: { accounts: [], categories: [], search: '', dateFrom: '', dateTo: '' },
  billsChart: null,
  overviewPieChart: null,
  overviewLineChart: null,
  savingsChart: null,
  _cmdPaletteIndex: -1,
  _cmdPaletteItems: [],
  _ovSortBy: 'date',
  _ovSortDir: 'desc',

  async init() {
    try {
      this.data = await (await fetch('/api/load' + (this.profile ? '?profile=' + encodeURIComponent(this.profile) : ''))).json();
    } catch (e) {
      document.getElementById('page-overview').innerHTML =
        '<div class="empty-state"><div class="empty-state-title">LOADING FAILED</div><div class="empty-state-text">Could not load data from server.</div></div>';
      return;
    }
    if (!this.data.bills) this.data.bills = [];
    if (!this.data.billPayments) this.data.billPayments = [];
    if (!this.data.savingsGoals) this.data.savingsGoals = [];
    if (!this.data.budgets) this.data.budgets = [];
    if (!this.data.installments) this.data.installments = [];
    if (!this.data.debts) this.data.debts = [];
    if (!this.data.invoices) this.data.invoices = [];
    if (this.migrateCreditCards()) await this.save();
    if (this.migrateTransfers()) await this.save();
    if (!(this.data.categories || []).some(c => c && c.name && String(c.name).toLowerCase() === 'invoice')) {
      this.invoiceCategory();
      await this.save();
    }
    let signFixed = false;
    for (const t of (this.data.transactions || [])) {
      if (!t || typeof t.amount !== 'number') continue;
      if (t.type === 'expense' && t.amount > 0) { t.amount = -t.amount; signFixed = true; }
      else if (t.type === 'income' && t.amount < 0) { t.amount = -t.amount; signFixed = true; }
    }
    if (signFixed) await this.save();
    if (!this.data.billPayments) this.data.billPayments = [];
    if (this.applyAutopay()) await this.save();
    this.applyTheme();
    this.applyThemeColors();
    this.updateNavVisibility();

    const rates = this.getRates();
    if (['EUR', 'USD', 'XAU'].some(c => !rates[c].rate)) {
      fetch('/api/exchange-rate').then(r => r.json()).then(result => {
        if (result.rates) {
          Object.assign(this.getRates(), result.rates);
          this.save();
        }
      }).catch(() => {});
    }

    this.connectWebSocket();
    const hp = document.getElementById('header-profile');
    if (hp) { hp.textContent = '\u00b7 ' + (this.profile ? this.profile.toUpperCase() : 'DEFAULT'); }
    if (window.Chart) {
      Chart.defaults.font.family = "'Hack', 'Courier New', monospace";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = '#777777';
    }
    this.bindNav();
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
    this.bindBudgetForm();
    this.bindTransferForm();

    document.querySelector('#transaction-modal .modal-backdrop').addEventListener('click', () => { document.getElementById('transaction-form').requestSubmit(); });
    document.querySelector('#bill-modal .modal-backdrop').addEventListener('click', () => this.closeModal('bill-modal'));
    document.querySelector('#savings-modal .modal-backdrop').addEventListener('click', () => this.closeModal('savings-modal'));
    document.querySelector('#savings-entry-modal .modal-backdrop').addEventListener('click', () => this.closeModal('savings-entry-modal'));
    document.querySelector('#budget-modal .modal-backdrop').addEventListener('click', () => this.closeModal('budget-modal'));
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
          if (!this._cmdPaletteItems.length) return;
          const pick = this._cmdPaletteIndex >= 0 ? this._cmdPaletteIndex : 0;
          if (this._cmdPaletteItems[pick]) this._cmdPaletteItems[pick].execute();
        }
        const emptyQuery = !e.target.value.trim();
        if (emptyQuery && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); this.closeCommandPalette(); this.openNewTransaction(); }
        if (emptyQuery && (e.key === 't' || e.key === 'T')) { e.preventDefault(); this.closeCommandPalette(); this.openTransferModal(); }
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

    this.upgradeAllSelects(document);
    this.initChartResize();
    this.navigateTo('overview');
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
      ws.onopen = () => { this._wsRetry = 0; };
      ws.onclose = () => { this._ws = null; this.scheduleWsReconnect(); };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    } catch (e) {
      this.scheduleWsReconnect();
    }
  },

  scheduleWsReconnect() {
    if (this._wsRetry > 10) return;
    const delay = Math.min(1000 * Math.pow(2, this._wsRetry), 15000);
    this._wsRetry++;
    clearTimeout(this._wsReconnectTimer);
    this._wsReconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
  },

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const confirmEl = document.getElementById('confirm-modal');
        if (confirmEl && !confirmEl.classList.contains('hidden')) { e.preventDefault(); this._resolveConfirm(false); return; }
        const palette = document.getElementById('command-overlay');
        if (!palette.classList.contains('hidden')) {
          this.closeCommandPalette();
          return;
        }
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
        return;
      }
      const tag = document.activeElement.tagName;
      const modalOpen = !document.getElementById('transaction-modal').classList.contains('hidden') ||
        !document.getElementById('bill-modal').classList.contains('hidden') ||
        !document.getElementById('savings-modal').classList.contains('hidden') ||
        !document.getElementById('savings-entry-modal').classList.contains('hidden') ||
        !document.getElementById('budget-modal').classList.contains('hidden') ||
        !document.getElementById('settings-account-modal').classList.contains('hidden') ||
        !document.getElementById('settings-category-modal').classList.contains('hidden') ||
        !document.getElementById('transfer-modal').classList.contains('hidden');
      const paletteOpen = !document.getElementById('command-overlay').classList.contains('hidden');
      const confirmOpen = !document.getElementById('confirm-modal').classList.contains('hidden');
      if (confirmOpen) {
        if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') { e.preventDefault(); this._resolveConfirm(true); return; }
        if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') { e.preventDefault(); this._resolveConfirm(false); return; }
        return;
      }
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (paletteOpen) this.closeCommandPalette();
        else this.openCommandPalette();
        return;
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || modalOpen || paletteOpen) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.arrowPeriod(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.arrowPeriod(1); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); this.openNewTransaction(); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); this.openTransferModal(); }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); this.gotoToday(); }
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
        else if (this.hoveredTxId) this.deleteTransaction(this.hoveredTxId);
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        if (this.currentPage === 'overview') { this.toggleOverviewGraph(); return; }
        if (this.currentPage === 'bills') { this.toggleBillsGraph(); return; }
        if (this.currentPage === 'budget') { this.toggleBudgetGraph(); return; }
      }
      if (e.key === 'Tab') { e.preventDefault(); if (this.currentPage === 'overview') this.cycleAccount(); return; }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const pages = this.pageList().filter(p => this.isPageEnabled(p));
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

  pageList() { return ['overview', 'bills', 'budget', 'cards', 'savings', 'debts', 'invoices', 'settings']; },

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
    const known = this.pageList();    if (!known.includes(page) || !this.isPageEnabled(page)) page = this.firstEnabledPage();
    if (this.overviewPieChart) { this.overviewPieChart.destroy(); this.overviewPieChart = null; }
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    if (this.savingsChart) { this.savingsChart.destroy(); this.savingsChart = null; }
    this.currentPage = page;
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
  },

  bindSidebarToggle() {
    const mark = document.querySelector('.header-logo-mark');
    if (!mark) return;
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSidebar();
    });
    try {
      if (localStorage.getItem('bb-sidebar-collapsed') === '1') {
        document.body.classList.add('sb-collapsed');
      }
    } catch (err) {}
  },

  toggleSidebar() {
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
      if (page === 'overview') this.renderOverview();
      else if (page === 'budget') this.renderBudget();
      else if (page === 'bills') this.renderBills();
      else if (page === 'cards') this.renderCards();
      else if (page === 'savings') this.renderSavings();
      else if (page === 'debts') this.renderDebts();
      else if (page === 'invoices') this.renderInvoices();
      else if (page === 'settings') this.renderSettings();
      const pageEl = document.getElementById('page-' + page);
      if (pageEl) this.upgradeAllSelects(pageEl);
    } catch (err) {
      console.error('renderPage failed:', err);
      if (!this._renderErrShown) { this._renderErrShown = true; alert('Render error: ' + err.message); }
    }
  },

  setSaveState(state) {
    const ind = document.getElementById('save-indicator');
    if (!ind) return;
    ind.classList.toggle('saving', state === 'saving');
    const label = ind.querySelector('.save-label');
    const dot = ind.querySelector('.save-dot');
    if (label) label.textContent = state === 'saving' ? 'SAVING\u2026' : 'SAVED';
  },

  async save() {
    this._pendingSaves = (this._pendingSaves || 0) + 1;
    this.setSaveState('saving');
    const payload = this.stripTransient(this.data);
    try {
      await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.profile ? { profile: this.profile, data: payload } : payload) });
    } finally {
      this._pendingSaves = (this._pendingSaves || 0) - 1;
      if (this._pendingSaves <= 0) { this._pendingSaves = 0; this.setSaveState('saved'); }
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

  toRsd(amount, currency) {
    if (!currency || currency === 'RSD') return amount;
    const rates = this.data.settings.rates;
    const r = rates && rates[currency];
    if (r && r.rate) return amount * r.rate;
    if (currency === 'EUR' && this.data.settings.eurToRsdRate) return amount * this.data.settings.eurToRsdRate;
    return amount;
  },

  getRates() {
    const s = this.data.settings;
    if (!s.rates) s.rates = {};
    const legacyEur = s.eurToRsdRate || null;
    for (const code of ['EUR', 'USD', 'XAU']) {
      if (!s.rates[code]) {
        s.rates[code] = code === 'EUR'
          ? { rate: legacyEur, source: legacyEur ? (s.eurToRsdRateSource || 'auto') : null, updated: s.eurToRsdRateUpdated || null }
          : { rate: null, source: null, updated: null };
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

  fmtDateInput(iso) {
    const p = String(iso || '').split('-');
    if (p.length !== 3 || p[0].length !== 4) return '';
    const sep = this.getDateSeparator();
    return parseInt(p[2], 10) + sep + parseInt(p[1], 10) + sep + p[0];
  },

  parseDateInput(str) {
    let s = String(str || '').trim().replace(/\s+/g, '');
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

  ymOf(dateStr) {
    const p = String(dateStr || '').split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10) - 1 };
  },

  monthKeyOf(dateStr) {
    return String(dateStr || '').substring(0, 7);
  },

  openModal(id) { document.getElementById(id).classList.remove('hidden'); },
  closeModal(id) { document.getElementById(id).classList.add('hidden'); if (id === 'transfer-modal') this._transferSourceIds = null; },

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

  fmtRsd(amount) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD';
  },

  round2(amount) {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  },

  calcForeignFee(nativeAmt, pct, nativeCur) {
    const feeNative = this.round2(Math.abs(nativeAmt) * pct / 100);
    return { feeNative: feeNative, feeRsd: this.round2(this.toRsd(feeNative, nativeCur || 'RSD')) };
  },

  fmtAmount(amount, currency) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
  },

  fmtDualCurrency(amount, currency, accountCurrency, nativeAmount, nativeCurrency) {
    const cur = currency || 'RSD';
    const accCur = accountCurrency || 'RSD';
    const sign = amount < 0 ? '-' : '';
    if (nativeCurrency && nativeCurrency !== accCur) {
      const natAbs = Math.abs(nativeAmount);
      const rsdAbs = Math.abs(amount);
      return sign + natAbs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + nativeCurrency + ' (' + rsdAbs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + accCur + ')';
    }
    const abs = Math.abs(amount);
    if (cur === accCur) return sign + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
    const rsd = Math.abs(this.toRsd(abs, cur));
    return sign + rsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + accCur + ' (' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur + ')';
  },

  accountBalance(accountId) {
    let total = 0;
    for (const tx of this.data.transactions) {
      if (tx.type === 'transfer') {
        if (tx.fromAccountId === accountId) total -= this.toRsd(tx.amount, tx.currency);
        if (tx.toAccountId === accountId) total += this.toRsd(tx.amountIn || tx.amount, tx.currencyIn || tx.currency);
        continue;
      }
      if (tx.accountId !== accountId) continue;
      total += this.toRsd(tx.amount, tx.currency);
    }
    return total;
  },

  accountBalanceNative(accountId) {
    const acc = this.data.accounts.find(a => a.id === accountId);
    let total = 0;
    let currency = (acc && acc.currency) || 'RSD';
    for (const tx of this.data.transactions) {
      if (tx.type === 'transfer') {
        if (tx.fromAccountId === accountId) {
          let amt = tx.amount;
          if (tx.currency && acc && acc.currency && tx.currency !== acc.currency) {
            const converted = this.convertBetweenCurrencies(tx.amount, tx.currency, acc.currency);
            if (converted != null && !isNaN(converted)) amt = converted;
          }
          total -= amt;
        }
        if (tx.toAccountId === accountId) {
          let amt = tx.amountIn || tx.amount;
          const cur = tx.currencyIn || tx.currency;
          if (cur && acc && acc.currency && cur !== acc.currency) {
            const converted = this.convertBetweenCurrencies(amt, cur, acc.currency);
            if (converted != null && !isNaN(converted)) amt = converted;
          }
          total += amt;
        }
        continue;
      }
      if (tx.accountId !== accountId) continue;
      let amt = tx.amount;
      if (tx.currency && acc && acc.currency && tx.currency !== acc.currency) {
        const converted = this.convertBetweenCurrencies(tx.amount, tx.currency, acc.currency);
        if (converted != null && !isNaN(converted)) amt = converted;
      }
      total += amt;
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
      results.innerHTML = '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>' +
        this._paletteItemHtml(parsedT.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedT.execute });
      return;
    } catch (e) { /* not a transfer */ }

    try {
      const parsedB = this.parseBillPayCommand(query);
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(parsedB.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedB.execute });
      return;
    } catch (e) { /* not a bill pay */ }

    try {
      const parsedBg = this.parseBudgetCommand(query);
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(parsedBg.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedBg.execute });
      return;
    } catch (e) { /* not a budget */ }

    try {
      const parsedS = this.parseSavingsMoveCommand(query);
      results.innerHTML = '<div class="command-section">' + this._paletteItemHtml(parsedS.label, 'Enter') + '</div>';
      this._cmdPaletteItems.push({ execute: parsedS.execute });
      return;
    } catch (e) { /* not a savings move */ }

    try {
      const parsed = this.parseCommand(query);
      const typeLabel = parsed.type === 'expense' ? 'Expense' : 'Income';
      const detail = typeLabel + ': ' + Math.abs(parsed.amount) + ' RSD' + (parsed.category ? ' / ' + parsed.category.name : '') + (parsed.date ? ' / ' + parsed.date : '') + (parsed.note ? ' / ' + parsed.note : '');
      let cmdHtml = '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>';
      cmdHtml += this._paletteItemHtml('Create: ' + detail, 'Enter');
      this._cmdPaletteItems.push({
        execute: async () => {
          const tx = { id: crypto.randomUUID(), date: parsed.date, type: parsed.type, amount: Math.round((parsed.type === 'expense' ? -1 : 1) * Math.abs(parsed.amount) * 100) / 100, currency: parsed.account.currency || 'RSD', accountId: parsed.account.id, categoryId: parsed.category.id, note: parsed.note };
          this.data.transactions.unshift(tx);
          this.syncViewToDate(tx.date);
          await this.save();
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
    const txResults = this.data.transactions.filter(tx => (tx.note || '').toLowerCase().includes(lq) || String(tx.amount).includes(lq)).slice(0, 10);
    if (txResults.length) {
      searchHtml += '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">TRANSACTIONS</div>';
      for (const tx of txResults) {
        const cat = this.data.categories.find(c => c.id === tx.categoryId);
        const sign = tx.type === 'income' ? '+' : '-';
        const label = tx.date + '  ' + sign + this.toRsd(tx.amount, tx.currency).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '  ' + (cat ? cat.name : '?') + (tx.note ? '  ' + tx.note : '');
        searchHtml += this._paletteItemHtml(label, '');
        this._cmdPaletteItems.push({ execute: (_txId => () => { this.closeCommandPalette(); this.openEditTransaction(_txId); })(tx.id) });
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
    const cat = this.data.categories.find(c => c.name.toLowerCase().startsWith((parts[1] || '').toLowerCase()));
    if (!cat) throw new Error('category not found');
    let clear = false, amount = 0;
    if ((parts[2] || '').toLowerCase() === 'clear') { clear = true; }
    else { amount = this.evalAmount(parts[2]); if (isNaN(amount) || amount <= 0) throw new Error('budget amount invalid'); }
    const label = (clear ? 'Clear budget: ' : 'Set budget: ') + cat.name + (clear ? '' : ' \u00b7 ' + Math.round(amount * 100) / 100 + ' RSD/mo');
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
    const category = this.data.categories.find(c => c.name.toLowerCase().startsWith(catName.toLowerCase()));
    if (!category) throw new Error('Category not found: ' + catName);
    let date = this.today(); let account = null; let noteParts = []; let i = 2;
    if (i < parts.length && /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(parts[i])) {
      const dp = parts[i].split('/');
      const day = dp[0].padStart(2, '0'); const month = dp[1].padStart(2, '0');
      const year = dp[2] ? (dp[2].length === 2 ? '20' + dp[2] : dp[2]) : String(new Date().getFullYear());
      date = year + '-' + month + '-' + day; i++;
    }
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
    const s = String(input == null ? '' : input).trim().replace(/\s+/g, '').replace(',', '.').replace(/(^|[^0-9.])0+([0-9])/g, '$1$2');
    if (!s) return NaN;
    if (!/^[0-9+\-*/().]+$/.test(s)) { const v = parseFloat(s); return isNaN(v) ? NaN : Math.round(v * 100) / 100; }
    try {
      const v = Function('"use strict";return (' + s + ')')();
      return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : NaN;
    } catch (e) { return NaN; }
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
    const linkedTx = new Set((this.data.billPayments || []).map(p => p.txId).filter(Boolean));
    if (linkedTx.has(tx.id)) return null;
    const txRsd = this.toRsd(Math.abs(tx.amount || 0), tx.currency || 'RSD');
    for (const bill of (this.data.bills || [])) {
      if (bill.active === false) continue;
      if (this.getBillPayment(bill.id, mk)) continue;
      const from = this.billPayFrom(bill);
      const matchAcc = from && from.startsWith('card:') ? tx.cardId === from.slice(5) : (tx.accountId === from);
      if (!matchAcc) continue;
      if (bill.categoryId && tx.categoryId && bill.categoryId !== tx.categoryId) continue;
      if (bill.name && tx.note) {
        const bn = String(bill.name).trim().toLowerCase();
        const tn = String(tx.note).trim().toLowerCase();
        if (tn !== bn && !tn.includes(bn) && !bn.includes(tn)) continue;
      } else if (bill.name && !tx.note) {
        continue;
      }
      if (bill.amount != null && txRsd > 0) {
        const bar = this.toRsd(Math.abs(bill.amount), bill.currency || 'RSD');
        const tolerance = Math.max(bar * 0.05, 1);
        if (Math.abs(txRsd - bar) > tolerance) continue;
      }
      return bill;
    }
    return null;
  },

  linkedBillForTx(tx) {
    if (!tx) return null;
    const pay = (this.data.billPayments || []).find(p => p.txId === tx.id);
    if (!pay) return null;
    const bill = (this.data.bills || []).find(b => b.id === pay.billId);
    return bill || null;
  },

  billPaymentForTx(txId) {
    return (this.data.billPayments || []).find(p => p.txId === txId) || null;
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
      if (existing.txId) return;
    } else {
      if (!this.data.billPayments) this.data.billPayments = [];
      this.data.billPayments.push({ billId: bill.id, month: mk, paid: true, amount: Math.abs(tx.amount), txId: tx.id });
    }
    this.save();
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
    let blob = await this._invFileGet(id);
    if (!blob && v.fileData) blob = this._dataURLToBlob(v.fileData);
    if (!blob) { alert('No file attached to this invoice.'); return; }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
      if (e.target.closest('.tx-list-wrap')) return;
      if (e.target.closest('.bulk-filter-chip')) return;
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
      const ph = (el.placeholder || '').toUpperCase();
      if (ph.indexOf('DD/MM/YYYY') === -1 && ph.indexOf('DD.MM.YYYY') === -1 && ph.indexOf('YYYY') === -1) return;
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
      const billData = { name: document.getElementById('bill-name').value, amount: parsedAmt > 0 ? parsedAmt : null, currency: document.getElementById('bill-currency').value, dueDay: parseInt(document.getElementById('bill-dueDay').value), categoryId: document.getElementById('bill-category').value, active: document.getElementById('bill-active').value === 'true', autopay: document.getElementById('bill-autopay').checked, payAccountId: document.getElementById('bill-payfrom').value || null, color: isAuto ? null : color };
      if (id) { const bill = this.data.bills.find(b => b.id === id); if (bill) Object.assign(bill, billData); }
      else { billData.id = crypto.randomUUID(); this.data.bills.push(billData); }
      await this.save(); this.closeModal('bill-modal'); this.renderPage(this.currentPage);
    });
  },

  selectCategory(id, ev) {
    if (ev && ev.altKey) {
      this._ovInc = false;
      this._ovExp = false;
      this.selectedCategory = id;
      this.renderPage(this.currentPage);
      return;
    }
    this.selectedCategory = id;
    this.renderPage(this.currentPage);
  },

  // ==================== MONTH PICKER ====================

  monthPickerHtml() {
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const now = new Date();
    let btns = '';
    for (let i = 0; i < 12; i++) {
      const sel = i === this.vm();
      const isCur = now.getFullYear() === this.vy() && now.getMonth() === i;
      btns += '<button class="mp-month' + (sel ? ' selected' : '') + (isCur && !sel ? ' current' : '') + '" onclick="BlackBook.pickMonth(' + i + ')">' + months[i] + '</button>';
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

  pickMonth(m) { this.vw().m = m; this.renderPage(this.currentPage); },
  shiftYear(d) { this.vw().y += d; this.renderPage(this.currentPage); },
  arrowPeriod(dir) {
    if (this.currentPage === 'savings') { this.shiftYear(dir); return; }
    const v = this.vw();
    let y = v.y, m = v.m + dir;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    v.y = y; v.m = m;
    this.renderPage(this.currentPage);
  },
  gotoToday() {
    const n = new Date();
    const v = this.vw();
    v.m = n.getMonth();
    v.y = n.getFullYear();
    this.renderPage(this.currentPage);
  },

  navigateToRecord(type, id) {
    const tx = this.data.transactions.find(t => t.id === id);
    let page = null;
    let month = null;
    if (type === 'bill') {
      const bp = this.billPaymentForTx(id);
      page = 'bills';
      if (bp && bp.month) { const parts = bp.month.split('-'); month = { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10) - 1 }; }
    } else if (type === 'debt') {
      page = 'debts';
    } else if (type === 'invoice') {
      page = 'invoices';
    } else if (type === 'savings') {
      page = 'savings';
    } else if (type === 'card') {
      page = 'cards';
    }
    if (!page) return;
    if (tx && !month) {
      const t = this.data.transactions.find(x => x.id === id);
      if (t && t.date) { const { y, m } = this.ymOf(t.date); if (!isNaN(y) && !isNaN(m)) month = { y, m }; }
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

    const sortedCats = () => this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    const closeDropdown = () => dropdown.classList.add('hidden');
    const pick = (cat) => {
      if (!cat) return;
      input.value = cat.name.toUpperCase();
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

    const openDropdown = () => {
      const cats = sortedCats();
      dropdown.innerHTML = cats.length ? cats.map(c =>
        '<div class="category-dropdown-item' + (c.id === hidden.value ? ' active' : '') + '" data-id="' + c.id + '"><span class="cat-dot" style="background:' + this.categoryColor(c) + ';"></span>' + this.escapeHtml(c.name) + '</div>'
      ).join('') : '<div class="category-dropdown-empty">No categories yet</div>';
      const act = dropdown.querySelector('.category-dropdown-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
      dropdown.classList.remove('hidden');
    };

    input.addEventListener('click', openDropdown);
    input.addEventListener('focus', openDropdown);
    input.addEventListener('wheel', (e) => { e.preventDefault(); cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cycle(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycle(-1); }
      else if (e.key === 'Escape') {
        if (!dropdown.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); }
        closeDropdown();
      } else if (e.key === 'Enter' && !dropdown.classList.contains('hidden')) {
        e.preventDefault(); closeDropdown();
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
    document.addEventListener('pointerdown', (e) => {
      if (!list.classList.contains('hidden') && !wrap.contains(e.target)) close();
    });
    el.addEventListener('change', sync);
    if (window.MutationObserver) new MutationObserver(() => sync()).observe(el, { childList: true, attributes: true, subtree: true });
    sync();
  },

  upgradeAllSelects(root) {
    const scope = root || document;
    scope.querySelectorAll('select').forEach(s => this.upgradeSelect(s));
  },

  chartAccountsTx() {
    let txs = this.data.transactions.slice();
    if (this.activeFilters.accounts.length) {
      txs = txs.filter(t => {
        if (t.type === 'transfer') return this.activeFilters.accounts.includes(t.fromAccountId) || this.activeFilters.accounts.includes(t.toAccountId);
        return this.activeFilters.accounts.includes(t.accountId);
      });
    }
    if (this._bulkSel && this._bulkSel.size && this._bulkOnly) txs = txs.filter(t => this._bulkSel.has(t.id));
    return txs;
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
        const top = panel.getBoundingClientRect().top;
        const maxH = Math.max(HIDE_PX, Math.min(window.innerHeight * 0.65, window.innerHeight - top - 20));
        newH = Math.min(newH, maxH);
        if (newH < HIDE_PX) newH = HIDE_PX;
        panel.style.height = newH + 'px';
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
    return null;
  },

  resetChartHeights() {
    document.querySelectorAll('.chart-panel, .chart-panel-full').forEach(p => {
      p.style.height = '';
    });
  },
};
