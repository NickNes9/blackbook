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
    this.bindKeyboard();
    this.bindGlobalSelectWheel();
    this.bindModalSubmit();
    this.bindBillModalSubmit();
    this.bindSavingsGoalForm();
    this.bindSavingsEntryForm();
    this.bindBudgetForm();
    this.bindTransferForm();

    document.querySelector('#transaction-modal .modal-backdrop').addEventListener('click', () => this.closeModal('transaction-modal'));
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

    this.navigateTo('overview');
  },

  bindNav() {
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.page));
    });
  },

  connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + location.host);
    ws.onclose = () => {};
    ws.onerror = () => {};
  },

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
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
      if (e.key === '/') { e.preventDefault(); document.getElementById('header-command-input').focus(); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); this.editHoveredTransaction(); }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        if (this.currentPage === 'overview') { this.toggleOverviewGraph(); return; }
        if (this.currentPage === 'bills') { this.toggleBillsGraph(); return; }
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

  navigateTo(page) {
    const known = this.pageList();
    if (!known.includes(page) || !this.isPageEnabled(page)) page = this.firstEnabledPage();
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
    } catch (err) {
      console.error('renderPage failed:', err);
      if (!this._renderErrShown) { this._renderErrShown = true; alert('Render error: ' + err.message); }
    }
  },

  async save() {
    await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.profile ? { profile: this.profile, data: this.data } : this.data) });
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
          ? { rate: legacyEur, source: legacyEur ? (s.eurToRsdRateSource || 'manual') : null, updated: s.eurToRsdRateUpdated || null }
          : { rate: null, source: null, updated: null };
      }
    }
    return s.rates;
  },

  today() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  },

  fmtDateInput(iso) {
    const p = String(iso || '').split('-');
    if (p.length !== 3 || p[0].length !== 4) return '';
    return parseInt(p[2], 10) + '.' + parseInt(p[1], 10) + '.' + p[0];
  },

  parseDateInput(str) {
    let s = String(str || '').trim().replace(/\s+/g, '');
    if (!s) return null;
    s = s.replace(/[-/.]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    let d, m, y;
    if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s)) { const q = s.split('.'); y = parseInt(q[0], 10); m = parseInt(q[1], 10); d = parseInt(q[2], 10); }
    else {
      const q = s.split('.');
      if (q.length !== 3 || !q.every(x => /^\d+$/.test(x))) return null;
      d = parseInt(q[0], 10); m = parseInt(q[1], 10); y = parseInt(q[2], 10);
      if (y < 100) y += 2000;
    }
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
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
  closeModal(id) { document.getElementById(id).classList.add('hidden'); },

  fmtRsd(amount) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD';
  },

  fmtAmount(amount, currency) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
  },

  accountBalance(accountId) {
    let total = 0;
    for (const tx of this.data.transactions) {
      if (tx.accountId !== accountId) continue;
      const rsd = this.toRsd(tx.amount, tx.currency);
      total += tx.type === 'income' ? rsd : -rsd;
    }
    return total;
  },

  accountBalanceNative(accountId) {
    let total = 0;
    let currency = 'RSD';
    for (const tx of this.data.transactions) {
      if (tx.accountId !== accountId) continue;
      const amt = tx.type === 'income' ? tx.amount : -tx.amount;
      total += amt;
      currency = tx.currency;
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
        '<div class="command-syntax">csv &nbsp;&middot;&nbsp; demo &nbsp;&middot;&nbsp; profile &lt;name&gt;</div></div>';
      results.innerHTML = html;
      return;
    }

    const lq0 = query.trim().toLowerCase();
    const kw = lq0.split(/\s+/)[0];
    if (kw === 'csv' || kw === 'demo' || kw === 'json' || kw === 'profiles') {
      const actionsMap = {
        csv: ['Export transactions as CSV', () => this.exportCsv()],
        demo: ['Generate demo data (replaces everything)', () => this.generateDemoData()],
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
      const typeLabel = parsed.amount < 0 ? 'Expense' : 'Income';
      const detail = typeLabel + ': ' + Math.abs(parsed.amount) + ' RSD' + (parsed.category ? ' / ' + parsed.category.name : '') + (parsed.date ? ' / ' + parsed.date : '') + (parsed.note ? ' / ' + parsed.note : '');
      let cmdHtml = '<div class="command-section"><div style="padding:4px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>';
      cmdHtml += this._paletteItemHtml('Create: ' + detail, 'Enter');
      this._cmdPaletteItems.push({
        execute: async () => {
          const tx = { id: crypto.randomUUID(), date: parsed.date, type: parsed.type, amount: Math.round(Math.abs(parsed.amount) * 100) / 100, currency: 'RSD', accountId: parsed.account.id, categoryId: parsed.category.id, note: parsed.note };
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
          name: a.name, color: a.color || '#71717a',
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
    const s = (bill.name || bill.id || '?').toUpperCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h * 31) + s.charCodeAt(i)) >>> 0; }
    return 'hsl(' + (h % 360) + ',65%,60%)';
  },

  transferCategory() {
    let cat = this.data.categories.find(c => c.name.toLowerCase() === 'transfer');
    if (!cat) {
      cat = { id: crypto.randomUUID(), name: 'Transfer', color: '#71717a' };
      this.data.categories.push(cat);
    }
    return cat;
  },

  isTransfer(tx) {
    if (!tx || !tx.categoryId) return false;
    const t = this.data.categories.find(c => c.name.toLowerCase() === 'transfer');
    return !!t && tx.categoryId === t.id;
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
      const billData = { name: document.getElementById('bill-name').value, amount: parsedAmt > 0 ? parsedAmt : null, currency: document.getElementById('bill-currency').value, dueDay: parseInt(document.getElementById('bill-dueDay').value), categoryId: document.getElementById('bill-category').value, active: document.getElementById('bill-active').value === 'true', autopay: document.getElementById('bill-autopay').checked, payAccountId: document.getElementById('bill-payfrom').value || null, color: document.getElementById('bill-color-auto').checked ? null : document.getElementById('bill-color').value };
      if (id) { const bill = this.data.bills.find(b => b.id === id); if (bill) Object.assign(bill, billData); }
      else { billData.id = crypto.randomUUID(); this.data.bills.push(billData); }
      await this.save(); this.closeModal('bill-modal'); this.renderPage(this.currentPage);
    });
  },

  selectCategory(id) { this.selectedCategory = id; this.renderPage(this.currentPage); },

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

  syncViewToDate(dateStr) {
    if (!dateStr) return;
    const { y, m } = this.ymOf(dateStr);
    if (!isNaN(y) && !isNaN(m)) { const v = this.vw(); v.y = y; v.m = m; }
  },

  chartAccountsTx() {
    let txs = this.data.transactions.slice();
    if (this.activeFilters.accounts.length) txs = txs.filter(t => this.activeFilters.accounts.includes(t.accountId));
    return txs;
  },
};
