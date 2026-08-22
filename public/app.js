const BlackBook = {
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
    if (this.migrateCreditCards()) await this.save();
    this.applyThemeColors();

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
    document.querySelector('#card-tx-modal .modal-backdrop').addEventListener('click', () => this.closeModal('card-tx-modal'));
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
          if (this._cmdPaletteIndex >= 0 && this._cmdPaletteItems[this._cmdPaletteIndex]) {
            this._cmdPaletteItems[this._cmdPaletteIndex].execute();
          }
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
      if (e.key === 'Tab') { e.preventDefault(); if (this.currentPage === 'overview') this.cycleAccount(); return; }
      const pages = ['overview', 'budget', 'bills', 'cards', 'savings', 'debts', 'settings'];
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
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

  navigateTo(page) {
    const known = ['overview', 'budget', 'bills', 'cards', 'savings', 'debts', 'settings'];
    if (!known.includes(page)) page = 'overview';
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
      let html = '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">ACTIONS</div>';
      html += this._paletteItemHtml('New Transaction', 'N');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewTransaction(); } });
      html += this._paletteItemHtml('New Transfer', 'T');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openTransferModal(); } });
      html += this._paletteItemHtml('New Bill', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewBill(); } });
      html += this._paletteItemHtml('New Savings Goal', '');
      this._cmdPaletteItems.push({ execute: () => { this.closeCommandPalette(); this.openNewSavingsGoal(); } });
      html += '</div>';
      html += '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">PAGES</div>';
      const pages = ['overview', 'budget', 'bills', 'cards', 'savings', 'debts', 'settings'];
      for (const p of pages) {
        html += this._paletteItemHtml(p.toUpperCase(), '');
        this._cmdPaletteItems.push({ execute: (_p => () => { this.closeCommandPalette(); this.navigateTo(_p); })(p) });
      }
      html += '</div>';
      html += '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">SYNTAX</div>' +
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
      results.innerHTML = '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>' +
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
      let cmdHtml = '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">COMMAND</div>';
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
      searchHtml += '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">TRANSACTIONS</div>';
      for (const tx of txResults) {
        const cat = this.data.categories.find(c => c.id === tx.categoryId);
        const sign = tx.type === 'income' ? '+' : '-';
        const label = tx.date + '  ' + sign + this.toRsd(tx.amount, tx.currency).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '  ' + (cat ? cat.name : '?') + (tx.note ? '  ' + tx.note : '');
        searchHtml += this._paletteItemHtml(label, '');
        this._cmdPaletteItems.push({ execute: (_txId => () => { this.closeCommandPalette(); this.openEditTransaction(_txId); })(tx.id) });
      }
      searchHtml += '</div>';
    }
    const allPages = ['overview', 'budget', 'bills', 'cards', 'savings', 'debts', 'settings'];
    const matchingPages = allPages.filter(p => p.includes(lq));
    if (matchingPages.length) {
      searchHtml += '<div class="command-section"><div style="padding:4px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">PAGES</div>';
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
    const amount = parseFloat(parts[1]);
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
    else { amount = parseFloat(parts[2]); if (isNaN(amount) || amount <= 0) throw new Error('budget amount invalid'); }
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
    const amount = parseFloat(parts[2]);
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
    const amount = parseFloat(parts[0]);
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
    if (!account) account = this.data.accounts.find(a => a.id === this.data.settings.defaultAccountId) || this.data.accounts[0];
    return { amount: Math.abs(amount), type: amount < 0 ? 'expense' : 'income', category, date, account, note: noteParts.join(' ') };
  },

  renderOverview() {
    const el = document.getElementById('page-overview');
    if (!this.data) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading...</div></div>'; return; }
    if (this.overviewPieChart) { this.overviewPieChart.destroy(); this.overviewPieChart = null; }
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    const hideGraph = !!(this.data.settings && this.data.settings.hideOverviewGraph);
    const graphHtml = hideGraph
      ? '<div class="overview-charts" style="justify-content:flex-end;"><button class="btn btn-sm btn-secondary" onclick="BlackBook.toggleOverviewGraph()">SHOW GRAPH</button></div>'
      : '<div class="overview-charts"><div class="chart-panel overview-line-panel"><canvas id="overview-line-chart"></canvas></div><button class="btn btn-sm btn-secondary overview-hide-btn" onclick="BlackBook.toggleOverviewGraph()" title="Hide income vs expenses graph">HIDE</button></div>';
    el.innerHTML = this.accountCardsHtml() + this.monthPickerHtml() + this.monthSummaryHtml() + this.categoryBreakdownHtml() +
      this.categoryFilterHtml() + '<div class="tx-list-wrap">' + this.recentTransactionsHtml() + '</div>' +
      graphHtml;
    this.bindBarTooltip(el);
    if (!hideGraph) setTimeout(() => { this.renderOverviewLineChart(); }, 50);
  },

  async toggleOverviewGraph() {
    this.data.settings.hideOverviewGraph = !(this.data.settings && this.data.settings.hideOverviewGraph);
    await this.save();
    this.renderOverview();
  },

  accountDetailHtml() {
    if (!this.selectedAccount) return '';
    const a = this.data.accounts.find(x => x.id === this.selectedAccount);
    if (!a) return '';
    const { amount: bal, currency } = this.accountBalanceNative(a.id);
    const txCount = this.data.transactions.filter(t => t.accountId === a.id).length;
    return '<div class="account-detail">' +
      '<div class="account-detail-header"><span class="account-detail-name">' + this.escapeHtml(a.name) + '</span>' +
      '<span class="account-detail-type">' + this.escapeHtml(a.currency) + ' ' + this.escapeHtml(a.type || 'cash') + '</span>' +
      '<span class="account-detail-balance ' + (bal >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtAmount(Math.abs(bal), currency) + '</span></div>' +
      '<div class="account-detail-meta">' + txCount + ' transactions</div>' +
      '</div>';
  },

  monthSummaryHtml() {
    const year = this.vy(), month = this.vm();
    let income = 0, expenses = 0;
    for (const tx of this.data.transactions) {
      const { y, m } = this.ymOf(tx.date);
      if (this.isTransfer(tx)) continue;
      if (y === year && m === month) {
        const rsd = this.toRsd(tx.amount, tx.currency);
        if (tx.type === 'income') income += Math.abs(rsd); else expenses += Math.abs(rsd);
      }
    }
    return '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(income) + '</span></div><div class="month-summary-item"><span class="month-summary-label">EXPENSES</span><span class="month-summary-value amount-negative">' + this.fmtRsd(expenses) + '</span></div><div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (income - expenses >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtRsd(income - expenses) + '</span></div></div>';
  },

  categoryBreakdownHtml() {
    const year = this.vy(), month = this.vm();
    const catTotals = {};
    const catCounts = {};
    for (const tx of this.data.transactions) {
      const { y, m } = this.ymOf(tx.date);
      if (this.isTransfer(tx)) continue;
      if (y === year && m === month && tx.type === 'expense') {
        const rsd = Math.abs(this.toRsd(tx.amount, tx.currency));
        catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + rsd;
        catCounts[tx.categoryId] = (catCounts[tx.categoryId] || 0) + 1;
      }
    }
    const entries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const cats = Object.fromEntries(this.data.categories.map(c => [c.id, c]));
    const total = entries.reduce((s, e) => s + e[1], 0);
    let segments = '';
    if (entries.length) {
      const FLOOR = 0.4;
      let widths = entries.map(([, amt]) => Math.max(amt / total * 100, FLOOR));
      const sum = widths.reduce((a, b) => a + b, 0);
      if (sum > 100) {
        const surplus = sum - FLOOR * entries.length;
        const k = surplus > 0 ? (100 - FLOOR * entries.length) / surplus : 0;
        widths = widths.map(w => FLOOR + (w - FLOOR) * k);
      }
      let offset = 0;
      entries.forEach(([catId, amt], i) => {
        const cat = cats[catId] || { name: '?', color: '#555555' };
        const w = widths[i];
        const pct = total > 0 ? amt / total * 100 : 0;
        const showText = w > 9;
        segments += '<div class="cat-stacked-segment" style="left:' + offset.toFixed(3) + '%;width:' + Math.max(w - 0.15, 0.2).toFixed(3) + '%;background:' + cat.color + ';" data-name="' + this.escapeHtml(cat.name) + '" data-amt="' + this.fmtRsd(amt) + '" data-pct="' + Math.round(pct * 10) / 10 + '" data-count="' + (catCounts[catId] || 0) + '"><span class="cat-seg-inner">' + (showText ? this.fmtRsd(amt) : '') + '</span></div>';
        offset += w;
      });
    } else {
      segments = '<div class="cat-bar-empty">NO EXPENSES THIS MONTH</div>';
    }
    return '<div class="cat-bar-container">' +
      '<div class="cat-stacked-bar">' + segments + '</div></div>';
  },

  initBarTooltip() {
    if (document.getElementById('bar-tooltip')) return;
    const tip = document.createElement('div');
    tip.id = 'bar-tooltip';
    document.body.appendChild(tip);
  },

  bindBarTooltip(scopeEl) {
    this.initBarTooltip();
    const bar = scopeEl.querySelector('.cat-stacked-bar');
    const tip = document.getElementById('bar-tooltip');
    if (!bar || !tip) return;
    bar.addEventListener('mousemove', (e) => {
      const seg = e.target.closest('.cat-stacked-segment');
      if (!seg || !seg.dataset.name) { tip.classList.remove('visible'); return; }
      tip.innerHTML = '<span class="tip-name">' + this.escapeHtml(seg.dataset.name) + '</span> ' + this.escapeHtml(seg.dataset.amt) + ' <span class="tip-dim">&middot; ' + seg.dataset.pct + '% &middot; ' + seg.dataset.count + ' tx</span>';
      tip.classList.add('visible');
      const pad = 12;
      let x = e.clientX + pad;
      let y = e.clientY - tip.offsetHeight - pad;
      if (x + tip.offsetWidth > window.innerWidth - 8) x = window.innerWidth - tip.offsetWidth - 8;
      if (y < 8) y = e.clientY + pad;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    bar.addEventListener('mouseleave', () => tip.classList.remove('visible'));
  },

  metricPanelsHtml() {
    let netWorth = 0, cashAvailable = 0;
    for (const a of this.visibleAccounts()) { const bal = this.accountBalance(a.id); netWorth += bal; if (a.type === 'cash') cashAvailable += bal; }
    const now = new Date(), year = now.getFullYear(), month = now.getMonth();
    let monthlyIncome = 0, monthlyExpenses = 0;
    for (const tx of this.data.transactions) {
      const d = new Date(tx.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const rsd = this.toRsd(tx.amount, tx.currency);
        if (tx.type === 'income') monthlyIncome += rsd; else monthlyExpenses += rsd;
      }
    }
    const savingsRate = monthlyIncome > 0 ? Math.round((monthlyIncome - monthlyExpenses) / monthlyIncome * 1000) / 10 : 0;
    let upcomingBillCount = 0, upcomingBillTotal = 0;
    const todayDate = now.getDate();
    for (const bill of this.data.bills) {
      if (!bill.active) continue;
      if (bill.dueDay >= todayDate && bill.dueDay <= todayDate + 7) { upcomingBillCount++; upcomingBillTotal += this.toRsd(bill.amount, bill.currency); }
    }
    return '<div class="metrics-grid">' +
      '<div class="metric-panel"><div class="metric-title">NET WORTH</div><div class="metric-value ' + (netWorth >= 0 ? 'metric-positive' : 'metric-negative') + '">' + this.fmtRsd(netWorth) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">CASH AVAILABLE</div><div class="metric-value ' + (cashAvailable >= 0 ? 'metric-positive' : 'metric-negative') + '">' + this.fmtRsd(cashAvailable) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">MONTHLY INCOME</div><div class="metric-value metric-positive">' + this.fmtRsd(monthlyIncome) + '</div><div class="metric-subtitle">' + now.toLocaleString('en', { month: 'long', year: 'numeric' }) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">MONTHLY EXPENSES</div><div class="metric-value metric-negative">' + this.fmtRsd(monthlyExpenses) + '</div><div class="metric-subtitle">' + now.toLocaleString('en', { month: 'long', year: 'numeric' }) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">SAVINGS RATE</div><div class="metric-value ' + (savingsRate >= 20 ? 'metric-positive' : savingsRate >= 0 ? '' : 'metric-negative') + '">' + savingsRate + '%</div><div class="metric-subtitle">of income saved</div></div>' +
      '<div class="metric-panel"><div class="metric-title">UPCOMING BILLS</div><div class="metric-value">' + upcomingBillCount + '</div><div class="metric-subtitle">' + (upcomingBillTotal > 0 ? this.fmtRsd(upcomingBillTotal) + ' due soon' : 'No bills due') + '</div></div></div>';
  },

  categoryFilterHtml() {
    const allCat = !this.selectedCategory;
    let html = '<div class="cat-filter"><div class="cat-filter-chip' + (allCat ? ' selected' : '') + '" onclick="BlackBook.selectCategory(null)">ALL</div>';
    const sorted = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sorted) {
      const sel = this.selectedCategory === c.id;
      html += '<div class="cat-filter-chip' + (sel ? ' selected' : '') + '" style="' + (sel ? 'background:' + c.color + ';color:#000;' : 'color:' + c.color + ';') + '" onclick="BlackBook.selectCategory(\x27' + c.id + '\x27)">' + this.escapeHtml(c.name) + '</div>';
    }
    return html + '</div>';
  },

  ordinalDay(n) {
    const d = parseInt(n, 10);
    if (isNaN(d)) return '';
    const s = ["th", "st", "nd", "rd"], v = d % 100;
    return d + (s[(v - 20) % 10] || s[v] || s[0]);
  },

  billsChipsHtml() {
    const bills = this.data.bills.filter(b => b.active !== false);
    if (!bills.length) return '';
    const mk = this.vy() + '-' + String(this.vm() + 1).padStart(2, '0');
    let html = '<div class="cat-filter">';
    for (const b of bills) {
      const color = b.color || this.billColor(b);
      const paid = (this.data.billPayments || []).some(p => p.billId === b.id && p.month === mk);
      html += '<div class="cat-filter-chip' + (paid ? ' selected' : '') + '" style="' + (paid ? 'background:' + color + ';color:#000;' : 'color:' + color + ';') + '" onclick="BlackBook.toggleBillPayment(\x27' + b.id + '\x27)" title="' + this.escapeHtml(b.name) + ' \u00b7 ' + this.fmtAmount(Math.abs(b.amount), b.currency || 'RSD') + ' \u00b7 click to toggle paid">' + this.escapeHtml(b.name) + '</div>';
    }
    return html + '</div>';
  },

  savingsChipsHtml() {
    const goals = this.data.savingsGoals || [];
    if (!goals.length) return '';
    let html = '<div class="cat-filter">';
    for (const g of goals) {
      const color = g.color || this.billColor(g);
      html += '<div class="cat-filter-chip" style="color:' + color + ';" onclick="BlackBook.toggleSavingsGoal(\x27' + g.id + '\x27)" title="' + this.escapeHtml(g.name) + ' \u00b7 click to show/hide entries">' + this.escapeHtml(g.name) + '</div>';
    }
    return html + '</div>';
  },

  recentTransactionsHtml() {
    let txs = this.data.transactions.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (this.selectedAccount) txs = txs.filter(t => t.accountId === this.selectedAccount);
    if (this.selectedCategory) txs = txs.filter(t => t.categoryId === this.selectedCategory);
    txs = txs.filter(t => { const { y, m } = this.ymOf(t.date); return y === this.vy() && m === this.vm(); });
    if (!txs.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-text">No transactions this month. Press A to add one.</div></div>';
    const accounts = Object.fromEntries(this.data.accounts.map(a => [a.id, a]));
    const cards = Object.fromEntries((this.data.creditCards || []).map(c => [c.id, c]));
    const categories = Object.fromEntries(this.data.categories.map(c => [c.id, c]));
    let rows = '';
    for (const tx of txs) {
      const card = tx.cardId ? cards[tx.cardId] : null;
      const acc = card
        ? { color: card.color || '#71717a', shortName: card.name, name: card.name }
        : (accounts[tx.accountId] || { color: '#52525b', shortName: 'TR', name: 'Transfer' });
      const cat = categories[tx.categoryId] || { color: '#555555', name: '?' };
      const rsd = this.toRsd(tx.amount, tx.currency);
      const sign = tx.type === 'income' ? '+' : '-';
      const amtClass = tx.type === 'income' ? 'amt-income' : 'amt-expense';
      let wtClass = '';
      if (Math.abs(rsd) > 10000) wtClass = ' amt-heavy'; else if (Math.abs(rsd) > 5000) wtClass = ' amt-medium';
      rows += '<div class="tx-row" onmouseenter="BlackBook.hoveredTxId=\x27' + tx.id + '\x27" onmouseleave="BlackBook.hoveredTxId=null"><div class="tx-acct-stripe" style="background:' + acc.color + '"><span class="tx-acct-label">' + this.escapeHtml((acc.shortName || '?').toUpperCase()) + '</span></div><span class="tx-date">' + tx.date + '</span><span class="tx-cat" style="color:' + cat.color + '">' + this.escapeHtml(cat.name) + '</span><span class="tx-note">' + this.escapeHtml(tx.note || '') + '</span><span class="tx-actions"><button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditTransaction(\x27' + tx.id + '\x27)">EDIT</button><button class="btn btn-sm btn-danger" onclick="BlackBook.deleteTransaction(\x27' + tx.id + '\x27)">DEL</button></span><span class="tx-amt ' + amtClass + wtClass + '">' + sign + Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + tx.currency + '</span></div>';
    }
    return '<div class="tx-list">' + rows + '</div>';
  },









  // ==================== BUDGET ====================

  renderBudget() {
    const el = document.getElementById('page-budget');
    if (!el) return;
    if (!this.data.budgets) this.data.budgets = [];
    el.innerHTML = this.monthPickerHtml() +
      this.budgetSummaryHtml() +
      '<div class="list-sep"></div>' +
      '<div class="page-scroll-wrap">' + this.budgetCardsHtml() + '</div>';
  },

  budgetSummaryHtml() {
    const year = this.vy(), month = this.vm();
    let totalBudgeted = 0;
    for (const b of this.data.budgets) { totalBudgeted += b.amount; }
    let totalSpent = 0;
    for (const tx of this.data.transactions) {
      if (tx.type !== 'expense') continue;
      const { y, m } = this.ymOf(tx.date);
      if (y === year && m === month) { totalSpent += this.toRsd(tx.amount, tx.currency); }
    }
    const totalRemaining = totalBudgeted - Math.abs(totalSpent);
    return '<div class="month-summary" style="margin-bottom:8px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">REMAINING</span><span class="month-summary-value ' + (totalRemaining >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtRsd(totalRemaining) + '</span></div>' +
      '</div>';
  },

  budgetCardsHtml() {
    const year = this.vy(), month = this.vm();
    const budgetMap = Object.fromEntries(this.data.budgets.map(b => [b.categoryId, b]));
    const catSpent = {};
    for (const tx of this.data.transactions) {
      if (tx.type !== 'expense') continue;
      if (this.isTransfer(tx)) continue;
      const { y, m } = this.ymOf(tx.date);
      if (y === year && m === month) { catSpent[tx.categoryId] = (catSpent[tx.categoryId] || 0) + this.toRsd(tx.amount, tx.currency); }
    }
    let html = '';
    for (const cat of this.data.categories) {
      const budget = budgetMap[cat.id];
      const spent = catSpent[cat.id] || 0;
      const amount = budget ? budget.amount : 0;
      const spentAbs = Math.abs(spent);
      const remaining = amount - spentAbs;
      const pct = amount > 0 ? Math.round(spentAbs / amount * 100) : 0;
      const barClass = amount === 0 ? '' : (pct < 80 ? 'under' : pct <= 100 ? 'warning' : 'over');
      const barWidth = Math.min(pct, 100);
      html += '<div class="budget-card" style="cursor:pointer;" onclick="BlackBook.openBudgetModal(\x27' + cat.id + '\x27)">' +
        '<div class="budget-header"><span style="color:' + cat.color + ';">' + this.escapeHtml(cat.name) + '</span>' +
        '<span style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:11px;color:' + (budget ? 'var(--text-dim)' : 'var(--text-muted)') + ';">' + (budget ? this.fmtRsd(amount) + ' / mo' : 'NO LIMIT') + '</span>' +
        '<button class="btn btn-sm ' + (budget ? 'btn-secondary' : 'btn-primary') + '" onclick="event.stopPropagation();BlackBook.openBudgetModal(\x27' + cat.id + '\x27)">' + (budget ? 'EDIT' : 'SET') + '</button></span>' +
        '</div>' +
        (budget ? '<div class="budget-progress-text"><span>' + this.fmtRsd(spentAbs) + ' spent</span><span>' + (remaining >= 0 ? this.fmtRsd(remaining) + ' left' : this.fmtRsd(Math.abs(remaining)) + ' over') + '</span></div>' +
        '<div class="budget-bar"><div class="budget-bar-fill ' + barClass + '" style="width:' + barWidth + '%;"></div></div>' +
        '<div class="budget-amounts"><span>' + pct + '% used</span></div>' : '<div class="budget-amounts"><span>' + this.fmtRsd(spentAbs) + ' spent this month</span></div>') +
        '</div>';
    }
    return html || '<div class="empty-state"><div class="empty-state-text">No categories. Add categories in Settings first.</div></div>';
  },

  openBudgetModal(categoryId) {
    const cat = this.data.categories.find(c => c.id === categoryId);
    if (!cat) return;
    const budget = this.data.budgets.find(b => b.categoryId === categoryId);
    document.getElementById('budget-category-id').value = categoryId;
    document.getElementById('budget-category-name').value = cat.name;
    document.getElementById('budget-amount').value = budget ? budget.amount : '';
    this.openModal('budget-modal');
    setTimeout(() => document.getElementById('budget-amount').focus(), 50);
  },

  bindBudgetForm() {
    document.getElementById('budget-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const catId = document.getElementById('budget-category-id').value;
      const raw = document.getElementById('budget-amount').value.trim();
      const amount = parseFloat(raw);
      if (!catId) return;
      const existing = this.data.budgets.find(b => b.categoryId === catId);
      if (raw === '' || isNaN(amount) || amount <= 0) {
        if (existing) { this.data.budgets = this.data.budgets.filter(b => b !== existing); }
      } else if (existing) { existing.amount = amount; }
      else { this.data.budgets.push({ categoryId: catId, amount: amount }); }
      await this.save();
      this.closeModal('budget-modal');
      this.renderBudget();
    });
  },

  // ==================== BILLS ====================

  renderBills() {
    const el = document.getElementById('page-bills');
    if (!el) return;
    el.innerHTML = this.monthPickerHtml() +
      this.billsSummaryHtml() +
      '<div class="list-sep"></div>' +
      this.billsChipsHtml() +
      '<div class="chart-panel chart-panel-full"><canvas id="bills-chart"></canvas></div>' +
      '<div style="display:flex;justify-content:flex-end;margin:8px 0;"><button class="btn btn-primary" onclick="BlackBook.openNewBill()">+ NEW BILL</button></div>' +
      '<div class="page-scroll-wrap"><div class="bills-grid-wrap">' + this.billsGridHtml() + '</div></div>';
    setTimeout(() => this.renderBillsChart(), 50);
  },

  billsSummaryHtml() {
    const active = this.data.bills.filter(b => b.active !== false);
    let total = 0;
    for (const b of active) total += Math.abs(this.toRsd(b.amount, b.currency || 'RSD'));
    return '<div class="month-summary" style="margin-bottom:10px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">MONTHLY TOTAL</span><span class="month-summary-value">' + this.fmtRsd(total) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">ACTIVE BILLS</span><span class="month-summary-value">' + active.length + '</span></div>' +
      '</div>';
  },

  applyThemeColors() {
    const s = this.data && this.data.settings;
    if (!s) return;
    const root = document.documentElement.style;
    if (s.highlightColor) root.setProperty('--accent', s.highlightColor);
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

  instCard(inst) {
    return this.cardById(inst.cardId) ||
      (this.data.creditCards || []).find(c => c.legacyAccountId === inst.accountId) || null;
  },

  fundingAccountId() {
    const s = this.data.settings.defaultAccountId;
    if (s && this.visibleAccounts().some(a => a.id === s)) return s;
    const first = this.visibleAccounts()[0];
    return first ? first.id : null;
  },

  cardsForAccount(accId) {
    return (this.data.creditCards || []).filter(c => c.legacyAccountId === accId);
  },

  instMonthlyAmount(inst) { return Math.round(inst.total / inst.months * 100) / 100; },
  instInterest(inst) { return Math.round(inst.total * (inst.ratePct != null ? inst.ratePct : 5)) / 100; },
  instBaseAmount(inst, seq) {
    if (seq === inst.months && inst.months > 1) return Math.round((inst.total - this.instMonthlyAmount(inst) * (inst.months - 1)) * 100) / 100;
    return this.instMonthlyAmount(inst);
  },
  instDueAmount(inst, seq) { return Math.round((this.instBaseAmount(inst, seq) + (seq === 1 ? this.instInterest(inst) : 0)) * 100) / 100; },
  instOutstanding(inst) {
    let paidPrincipal = inst.advance || 0;
    for (const e of this.instPaidEntries(inst)) paidPrincipal += this.instBaseAmount(inst, e.seq);
    return Math.max(0, Math.round((inst.total - paidPrincipal) * 100) / 100);
  },
  instIsClosed(inst) {
    if (this.instOutstanding(inst) > 0.009) return false;
    const entries = this.instPaidEntries(inst);
    for (let s = 1; s <= inst.months; s++) if (!entries.some(e => e.seq === s)) return false;
    return true;
  },
  instFeeCategory() {
    const cc = this.data.categories.find(c => (c.name || '').toLowerCase() === 'credit card');
    return cc ? cc.id : this.transferCategoryObj().id;
  },
  instPaidEntries(inst) {
    if (!inst.paid) inst.paid = [];
    if (inst.paid.length && typeof inst.paid[0] === 'number') inst.paid = inst.paid.map(s => ({ seq: s, via: 'tx' }));
    if (inst.extraPaid) { inst.advance = Math.round((((inst.advance || 0)) + inst.extraPaid) * 100) / 100; delete inst.extraPaid; }
    return inst.paid;
  },

  // ===== CREDIT CARDS PAGE =====

  renderCards() {
    const el = document.getElementById('page-cards');
    if (!el) return;
    if (!this.data.creditCards) this.data.creditCards = [];
    let html = this.cardsSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.cardsListHtml() + '</div>';
    el.innerHTML = html;
  },

  cardsSummaryHtml() {
    const cards = this.data.creditCards || [];
    if (!cards.length) return '';
    let totalOwed = 0, totalPlanned = 0;
    for (const inst of this.data.installments) {
      const card = this.instCard(inst);
      if (!card) continue;
      totalOwed += this.instOutstanding(inst);
      totalPlanned += inst.total + this.instInterest(inst);
    }
    const pct = totalPlanned > 0 ? Math.min(Math.round((totalPlanned - totalOwed) / totalPlanned * 100), 100) : 0;
    return '<div class="month-summary" style="margin-bottom:10px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">TOTAL DEBT</span><span class="month-summary-value amount-negative">' + this.fmtRsd(totalOwed) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">PAID OFF</span><span class="month-summary-value amount-positive">' + pct + '%</span></div></div>';
  },

  cardsListHtml() {
    const cards = this.data.creditCards || [];
    if (!cards.length) return '<div class="empty-state"><div class="empty-state-text">No credit cards yet. Click + NEW CARD to add one.</div></div>';
    return cards.map(c => this.cardBlockHtml(c)).join('');
  },

  cardBlockHtml(card) {
    const plans = this.data.installments.filter(i => (this.instCard(i) || {}).id === card.id);
    const debt = plans.reduce((s, p) => s + this.instOutstanding(p), 0);
    let html = '<div class="card-block">' +
      '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + (card.color || '#71717a') + ';"></span> ' + this.escapeHtml(card.name) + '</span>' +
      '<span class="savings-actions">' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.openNewCardTx(\x27' + card.id + '\x27)" title="Add a transaction on this card">New</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27card:' + card.id + '\x27)">EDIT</button>' +
       '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCard(\x27' + card.id + '\x27)">DEL</button></span></div>' +
      '<div class="bill-meta-line" style="display:block;margin-bottom:6px;">INT ' + (card.ratePct != null ? card.ratePct : 5) + '% &middot; DUE DAY ' + (card.dueDay || 15) + ' &middot; DEBT ' + this.fmtRsd(debt) + '</div>';
    if (!plans.length) html += '<div class="empty-state" style="padding:14px;"><div class="empty-state-text">No purchases yet. Click New to add a transaction on this card.</div></div>';
    else html += plans.map(p => this.planBlockHtml(p)).join('');
    return html + '</div>';
  },

  planBlockHtml(inst) {
    const card = this.instCard(inst) || {};
    const color = card.color || this.billColor(inst);
    const closed = this.instIsClosed(inst);
    const paidEntries = this.instPaidEntries(inst);
    const paidCount = closed ? inst.months : paidEntries.length;
    const pct = Math.min(Math.round(paidCount / inst.months * 100), 100);
    const advance = inst.advance || 0;
    let html = '<div class="plan-card"' + (closed ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name">' + this.escapeHtml(inst.name) + '</span>' +
      '<span class="savings-actions">' +
      '<span class="inst-count-badge"' + (closed ? ' style="border-color:' + color + ';color:#000;background:' + color + ';"' : '') + '>' + paidCount + '/' + inst.months + ' PAID</span>' +
      '<span class="inst-custom"><input type="text" inputmode="decimal" id="cust-' + inst.id + '" class="input inst-custom-input" placeholder="AMOUNT" autocomplete="off">' +
      (closed ? '' : '<button class="btn btn-sm btn-primary" onclick="BlackBook.customPayInstallments(\x27' + inst.id + '\x27)" title="Pay the amount entered - fills installments in order">PAY</button>') + '</span>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteInstallment(\x27' + inst.id + '\x27)">DEL</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + (closed ? '&#10003; FULLY PAID OFF' :
      'LEFT ' + this.fmtRsd(this.instOutstanding(inst)) + ' of ' + this.fmtRsd(inst.total)) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      this.fmtRsd(this.instMonthlyAmount(inst)) + ' &times; ' + inst.months + ' &middot; TOTAL ' + this.fmtRsd(inst.total) +
      ' &middot; INT ' + (inst.ratePct != null ? inst.ratePct : 5) + '% FIRST (' + this.fmtRsd(this.instInterest(inst)) + ')' +
      ' &middot; DUE ' + (inst.dueDay || 15) + '/mo &middot; FROM ' + inst.startMonth +
      (advance > 0 ? ' &middot; <span class="amount-positive">ADVANCE ' + this.fmtRsd(advance) + '</span>' : '') + '</div>';
    html += '<div class="inst-rows">';
    for (let s = 1; s <= inst.months; s++) {
      const entry = paidEntries.find(e => e.seq === s);
      const due = this.instDueAmount(inst, s);
      const mk = this.mkOfSeq(inst, s);
      html += '<div class="inst-row' + (entry ? ' inst-row-paid' : '') + '">' +
        '<span class="inst-seq">' + String(s).padStart(2, '0') + '</span>' +
        '<span class="inst-month">' + this.monthLabel(mk) + '</span>' +
        '<span class="inst-amt">' + this.fmtRsd(due) + (s === 1 ? ' <span class="tip-dim">(incl INT)</span>' : '') + '</span>' +
        '<span class="inst-status">' + (entry
          ? '<button class="btn btn-sm btn-toggle-paid" onclick="BlackBook.payInstallmentSlot(\x27' + inst.id + '\x27,' + s + ')" title="Click to undo this payment">PAID</button>'
          : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.payInstallmentSlot(\x27' + inst.id + '\x27,' + s + ')">PAY</button>') + '</span>' +
        '</div>';
    }
    html += '</div></div>';
    return html;
  },

  mkOfSeq(inst, seq) {
    const y = parseInt(inst.startMonth.slice(0, 4), 10), m = parseInt(inst.startMonth.slice(5, 7), 10) - 1;
    const t = y * 12 + m + (seq - 1);
    return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
  },

  monthLabel(mk) {
    const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return M[parseInt(mk.slice(5, 7), 10) - 1] + ' ' + mk.slice(0, 4);
  },

  async payInstallmentSlot(instId, seq) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst || seq < 1 || seq > inst.months) return;
    const paidEntries = this.instPaidEntries(inst);
    const entry = paidEntries.find(e => e.seq === seq);
    if (!entry) {
      if (this.instIsClosed(inst)) return;
      const base = this.instBaseAmount(inst, seq);
      if ((inst.advance || 0) >= base - 0.009) {
        inst.advance = Math.round(((inst.advance || 0) - base) * 100) / 100;
        paidEntries.push({ seq: seq, via: 'advance' });
      } else {
        this.createInstPaymentTx(inst, seq);
        paidEntries.push({ seq: seq, via: 'tx' });
      }
    } else {
      inst.paid = paidEntries.filter(e => e.seq !== seq);
      if (entry.via === 'advance') {
        inst.advance = Math.round(((inst.advance || 0) + this.instBaseAmount(inst, seq)) * 100) / 100;
      } else {
        const pairId = 'inst-' + inst.id + '-s' + seq;
        this.data.transactions = this.data.transactions.filter(t => t.pairId !== pairId);
      }
    }
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  createInstPaymentTx(inst, seq) {
    const fundingAccId = this.fundingAccountId();
    if (!fundingAccId) return;
    const acc = this.data.accounts.find(a => a.id === fundingAccId);
    const catId = this.instFeeCategory();
    const amount = this.instDueAmount(inst, seq);
    const pairId = 'inst-' + inst.id + '-s' + seq;
    const date = this.mkOfSeq(inst, seq) + '-' + String(inst.dueDay || 15).padStart(2, '0');
    const note = 'Installment ' + inst.name + ' ' + seq + '/' + inst.months + (seq === 1 ? ' (incl ' + this.fmtRsd(this.instInterest(inst)) + ' int)' : '');
    this.data.transactions.unshift({ id: 'tx-' + pairId, type: 'expense', amount: -amount, currency: acc.currency || 'RSD', accountId: fundingAccId, categoryId: catId, date: date, note: note, pairId: pairId });
  },

  async customPayInstallments(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    const inputEl = document.getElementById('cust-' + instId);
    const rawVal = inputEl ? String(inputEl.value || '').trim() : '';
    if (!rawVal) { alert('Enter an amount first.'); return; }
    const paidEntries = this.instPaidEntries(inst);
    const outstanding = this.instOutstanding(inst);
    if (!(outstanding > 0)) { alert('Nothing left to pay on this plan.'); return; }
    let amt = Math.round(parseFloat(rawVal.replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
    if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
    let rem = amt, cleared = 0;
    for (let s = 1; s <= inst.months; s++) {
      if (paidEntries.some(e => e.seq === s)) continue;
      const base = this.instBaseAmount(inst, s);
      if (rem >= base - 0.009) {
        this.createInstPaymentTx(inst, s);
        paidEntries.push({ seq: s, via: 'tx' });
        rem = Math.round((rem - base) * 100) / 100;
        cleared++;
      } else break;
    }
    if (rem > 0) {
      inst.advance = Math.round(((inst.advance || 0) + rem) * 100) / 100;
      const fundingAccId = this.fundingAccountId();
      if (fundingAccId) {
        const acc = this.data.accounts.find(a => a.id === fundingAccId);
        const pid = 'inst-' + inst.id + '-adv-' + Date.now();
        this.data.transactions.unshift({ id: 'tx-' + pid, type: 'expense', amount: -rem, currency: acc.currency || 'RSD', accountId: fundingAccId, categoryId: this.instFeeCategory(), date: this.today(), note: 'Advance ' + inst.name, pairId: pid });
      }
    }
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  async deleteInstallment(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (!confirm('Delete purchase plan "' + inst.name + '"? Paid payments stay as transactions.')) return;
    const pid = 'inst-' + inst.id + '-';
    this.data.installments = this.data.installments.filter(i => i.id !== instId);
    this.data.transactions = this.data.transactions.filter(t => !t.pairId || t.pairId.indexOf(pid) !== 0);
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  openNewCardTx(cardId) {
    const card = this.cardById(cardId);
    if (!card) return;
    document.getElementById('ctx-card').value = cardId;
    document.getElementById('ctx-amount').value = '';
    document.getElementById('ctx-date').value = this.today();
    document.getElementById('ctx-note').value = '';
    document.getElementById('ctx-months').value = '1';
    const sel = document.getElementById('ctx-category');
    const sorted = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    const def = this.data.settings.defaultCategoryId;
    sel.innerHTML = sorted.map(c => '<option value="' + c.id + '"' + (c.id === (def || sorted[0].id) ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('card-tx-title').textContent = 'New \u2014 ' + card.name;
    this.bindCardTxForm();
    this.openModal('card-tx-modal');
    setTimeout(() => document.getElementById('ctx-amount').focus(), 50);
  },

  bindCardTxForm() {
    const f = document.getElementById('card-tx-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cardId = document.getElementById('ctx-card').value;
      const card = this.cardById(cardId);
      if (!card) return;
      let amt = Math.round(parseFloat(String(document.getElementById('ctx-amount').value).trim().replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      const date = document.getElementById('ctx-date').value || this.today();
      const note = document.getElementById('ctx-note').value.trim();
      const months = parseInt(document.getElementById('ctx-months').value, 10) || 1;
      const categoryId = document.getElementById('ctx-category').value;
      this.data.transactions.push({ id: crypto.randomUUID(), date: date, type: 'expense', amount: -amt, currency: 'RSD', accountId: null, cardId: cardId, categoryId: categoryId, note: note });
      if (months > 1) {
        if (!this.data.installments) this.data.installments = [];
        const { y, m } = this.ymOf(date);
        this.data.installments.push({
          id: 'inst-' + Date.now(), cardId: cardId, name: note || 'Purchase',
          total: amt, months: months,
          startMonth: y + '-' + String(m + 1).padStart(2, '0'),
          dueDay: card.dueDay || 15,
          ratePct: card.ratePct != null ? card.ratePct : 5,
          paid: [], advance: 0
        });
      }
      this.syncViewToDate(date);
      await this.save();
      this.closeModal('card-tx-modal');
      this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
    });
  },

  async deleteCard(id) {
    const card = this.cardById(id);
    if (!card) return;
    const plans = this.data.installments.filter(i => (this.instCard(i) || {}).id === id);
    const msg = plans.length ? '"' + card.name + '" has ' + plans.length + ' purchase plan' + (plans.length === 1 ? '' : 's') + '.\n\nOK = delete the card AND its plans.\nCancel = do nothing.' : 'Delete card "' + card.name + '"?';
    if (!confirm(msg)) return;
    const planIds = plans.map(p => p.id);
    this.data.creditCards = this.data.creditCards.filter(c => c.id !== id);
    this.data.installments = this.data.installments.filter(i => planIds.indexOf(i.id) === -1);
    await this.save();
    this.renderPage(this.currentPage);
  },


  billColor(bill) {
    const s = (bill.name || bill.id || '?').toUpperCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h * 31) + s.charCodeAt(i)) >>> 0; }
    return 'hsl(' + (h % 360) + ',65%,60%)';
  },

  billsGridHtml() {
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    const curYM = now.getFullYear() * 12 + now.getMonth();
    let html = '<div class="bills-grid">';
    html += '<div class="bills-grid-head">BILL</div>';
    for (let m = 0; m < 12; m++) html += '<div class="bills-grid-head">' + MONTHS_S[m] + '</div>';
    if (!this.data.bills.length) {
      html += '<div class="bills-grid-empty">No bills yet. Click + NEW BILL to add one.</div>';
    }
    for (const bill of this.data.bills) {
      const color = this.billColor(bill);
      html += '<div class="bill-cell-label' + (bill.active ? '' : ' inactive') + '">' +
        '<span class="bill-name-line"><span class="cat-dot" style="background:' + color + ';"></span><span class="bill-name-text">' + this.escapeHtml(bill.name) + '</span><span class="bill-due-day">' + this.ordinalDay(bill.dueDay) + '</span></span>' +
        '<span class="bill-actions-mini">' +
        '<button class="btn btn-sm ' + (bill.active ? 'btn-paid' : 'btn-muted') + '" onclick="BlackBook.toggleBillActive(\x27' + bill.id + '\x27)" title="Include in graph">' + (bill.active ? 'ON' : 'OFF') + '</button>' +
        '<button class="btn btn-sm ' + (bill.autopay ? 'btn-primary' : 'btn-muted') + '" onclick="BlackBook.toggleBillAutopay(\x27' + bill.id + '\x27)" title="Auto-mark past months as paid">' + (bill.autopay ? 'AUTO' : 'MAN') + '</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditBill(\x27' + bill.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteBill(\x27' + bill.id + '\x27)">DEL</button></span></div>';
      for (let m = 0; m < 12; m++) {
        const mk = this.vy() + '-' + String(m + 1).padStart(2, '0');
        const ym = this.vy() * 12 + m;
        if (!bill.active) {
          html += '<div class="bill-cell disabled">&middot;</div>';
          continue;
        }
        const paid = this.getBillPayment(bill.id, mk);
        const cls = paid ? 'paid' : (ym <= curYM ? 'unpaid' : '');
        const amtNative = paid && paid.amount != null ? paid.amount : bill.amount;
        const amtLabel = Math.abs(Math.round(this.toRsd(amtNative, bill.currency || 'RSD'))).toLocaleString('en-US');
        const cellStyle = paid ? ' style="background:' + color + ';color:#000;font-weight:700;"' : '';
        html += '<div class="bill-cell ' + cls + '"' + cellStyle + ' onclick="BlackBook.toggleBillPayment(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + this.ordinalDay(bill.dueDay) +
          (paid ? (' \u00b7 paid' + (paid.amount != null ? ' (custom)' : '')) : '') +
          ' &middot; click to toggle &middot; right-click for custom amount">' + amtLabel + '</div>';
      }
    }
    html += '</div>';
    return html;
  },

  openNewBill() {
    document.getElementById('bill-id').value = '';
    document.getElementById('bill-name').value = '';
    document.getElementById('bill-amount').value = '';
    document.getElementById('bill-currency').value = 'RSD';
    document.getElementById('bill-dueDay').value = '';
    document.getElementById('bill-active').value = 'true';
    document.getElementById('bill-autopay').checked = false;
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.data.categories.map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('bill-modal-title').textContent = 'New Bill';
    this.openModal('bill-modal');
  },

  openEditBill(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    document.getElementById('bill-id').value = bill.id;
    document.getElementById('bill-name').value = bill.name;
    document.getElementById('bill-amount').value = bill.amount;
    document.getElementById('bill-currency').value = bill.currency;
    document.getElementById('bill-dueDay').value = bill.dueDay;
    document.getElementById('bill-active').value = String(bill.active);
    document.getElementById('bill-autopay').checked = !!bill.autopay;
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.data.categories.map(c => '<option value="' + c.id + '"' + (c.id === bill.categoryId ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('bill-modal-title').textContent = 'Edit Bill';
    this.openModal('bill-modal');
  },

  async deleteBill(billId) {
    if (!confirm('Delete this bill?')) return;
    this.data.bills = this.data.bills.filter(b => b.id !== billId);
    this.data.billPayments = (this.data.billPayments || []).filter(p => p.billId !== billId);
    await this.save();
    this.renderBills();
  },

  async toggleBillActive(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    bill.active = !bill.active;
    await this.save();
    this.renderBills();
  },

  async toggleBillPayment(billId, monthKey) {
    const mk = monthKey || (this.vy() + '-' + String(this.vm() + 1).padStart(2, '0'));
    if (!this.data.billPayments) this.data.billPayments = [];
    const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
    if (idx >= 0) { this.data.billPayments.splice(idx, 1); }
    else { this.data.billPayments.push({ billId: billId, month: mk, paid: true }); }
    await this.save();
    this.renderBills();
  },

  async toggleBillAutopay(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    bill.autopay = !bill.autopay;
    if (bill.autopay) this.applyAutopayForBill(bill);
    await this.save();
    this.renderBills();
  },

  applyAutopayForBill(bill) {
    const nowYM = new Date().getFullYear() * 12 + new Date().getMonth();
    for (let ym = nowYM, i = 0; i < 36; ym--, i++) {
      const y = Math.floor(ym / 12), m = ym % 12;
      const mk = y + '-' + String(m + 1).padStart(2, '0');
      if (!this.data.billPayments.some(p => p.billId === bill.id && p.month === mk)) {
        this.data.billPayments.push({ billId: bill.id, month: mk, paid: true, auto: true });
      }
    }
  },

  applyAutopay() {
    let changed = false;
    for (const bill of this.data.bills) {
      if (!bill.active || !bill.autopay) continue;
      const before = this.data.billPayments.length;
      this.applyAutopayForBill(bill);
      if (this.data.billPayments.length !== before) changed = true;
    }
    return changed;
  },

  renderBillsChart() {
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    const canvas = document.getElementById('bills-chart');
    if (!canvas) return;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(this.vy() + '-' + String(m).padStart(2, '0'));
    const activeBills = this.data.bills.filter(b => b.active);
    const datasets = activeBills.map(bill => ({
      label: bill.name,
      data: months.map(mk => { const p = this.getBillPayment(bill.id, mk); return p ? this.toRsd(p.amount != null ? p.amount : bill.amount, bill.currency) : 0; }),
      borderColor: this.billColor(bill),
      backgroundColor: 'transparent',
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 3
    }));
    this.billsChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: MONTHS_S, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: false }
        },
        scales: {
          x: { ticks: { color: '#555555' }, grid: { color: '#141414' } },
          y: { ticks: { color: '#555555' }, grid: { color: '#141414' } }
        }
      }
    });
  },

  openBillPayModal(billId, mk) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill || !bill.active) return;
    const existing = this.getBillPayment(billId, mk);
    document.getElementById('bpay-bill').value = billId;
    document.getElementById('bpay-month').value = mk;
    document.getElementById('bpay-amount').value = existing && existing.amount != null ? existing.amount : bill.amount;
    document.getElementById('bill-pay-title').textContent = bill.name + ' \u00b7 ' + mk;
    this.bindBillPayForm();
    this.openModal('bill-pay-modal');
    setTimeout(() => { const a = document.getElementById('bpay-amount'); a.focus(); a.select(); }, 50);
  },

  bindBillPayForm() {
    const f = document.getElementById('bill-pay-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const billId = document.getElementById('bpay-bill').value;
      const mk = document.getElementById('bpay-month').value;
      let amt = Math.round(parseFloat(String(document.getElementById('bpay-amount').value).trim().replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      if (!this.data.billPayments) this.data.billPayments = [];
      const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
      if (idx >= 0) this.data.billPayments.splice(idx, 1);
      this.data.billPayments.push({ billId: billId, month: mk, paid: true, amount: amt });
      await this.save();
      this.closeModal('bill-pay-modal');
      this.renderBills();
    });
  },

  getBillPayment(billId, monthKey) { return (this.data.billPayments || []).find(p => p.billId === billId && p.month === monthKey); },
  fmtBillAmount(bill) { const rsd = this.toRsd(bill.amount, bill.currency); return rsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD' + (bill.currency && bill.currency !== 'RSD' ? ' (' + bill.amount + ' ' + bill.currency + ')' : ''); },

  // ==================== SAVINGS ====================

  renderSavings() {
    const el = document.getElementById('page-savings');
    if (!el) return;
    if (!this.data.savingsGoals) this.data.savingsGoals = [];
    if (!this._expandedGoals) this._expandedGoals = {};
    el.innerHTML = this.yearPickerHtml() +
      this.savingsSummaryHtml() +
      '<div class="list-sep"></div>' +
      this.savingsChipsHtml() +
      '<div class="chart-panel chart-panel-full"><canvas id="savings-chart"></canvas></div>' +
      '<div style="display:flex;justify-content:flex-end;margin:8px 0;"><button class="btn btn-primary" onclick="BlackBook.openNewSavingsGoal()">+ NEW GOAL</button></div>' +
      '<div class="page-scroll-wrap"><div class="cat-label" style="margin-bottom:8px;">GOALS</div>' +
      this.savingsGoalsHtml() + '</div>';
    setTimeout(() => this.renderSavingsChart(), 50);
  },

  goalSaved(goal) { return (goal.entries || []).reduce((s, e) => s + e.amount, 0); },

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

  savingsSummaryHtml() {
    let totalSaved = 0, totalTarget = 0;
    for (const g of this.data.savingsGoals) {
      totalSaved += this.goalSaved(g);
      totalTarget += (g.targetAmount || 0);
    }
    const pct = totalTarget > 0 ? Math.min(Math.round(totalSaved / totalTarget * 100), 100) : 0;
    return '<div class="savings-total-bar"><div class="savings-total-fill" style="width:' + pct + '%;"></div>' +
      '<div class="savings-total-text"><span class="month-summary-label">SAVED&nbsp;</span><span class="month-summary-value">' + this.fmtRsd(totalSaved) + '</span><span class="month-summary-label">&nbsp;of&nbsp;</span><span class="month-summary-value">' + this.fmtRsd(totalTarget) + '</span><span class="month-summary-label">&nbsp;&middot;&nbsp;</span><span class="month-summary-value">' + pct + '%</span></div></div>';
  },

  yearPickerHtml() {
    const offToday = this.vy() !== new Date().getFullYear();
    return '<div class="month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<button class="mp-today' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '</div>';
  },

  savingsGoalsHtml() {
    if (!this.data.savingsGoals.length) return '<div class="empty-state"><div class="empty-state-text">No savings goals. Click + NEW GOAL to create one.</div></div>';
    return this.data.savingsGoals.map(g => this.savingsGoalCardHtml(g)).join('');
  },

  savingsGoalCardHtml(goal) {
    const target = goal.targetAmount || 0;
    const saved = this.goalSaved(goal);
    const pct = target > 0 ? Math.min(Math.round(saved / target * 100), 100) : 0;
    const barClass = pct < 80 ? 'under' : pct <= 100 ? 'warning' : 'over';
    const expanded = this._expandedGoals[goal.id];
    let html = '<div class="savings-card">' +
      '<div class="savings-header">' +
      '<span class="savings-name">' + this.escapeHtml(goal.name) + '</span>' +
      '<span class="savings-actions">' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.openNewSavingsEntry(\x27' + goal.id + '\x27)">+ ADD</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditSavingsGoal(\x27' + goal.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteSavingsGoal(\x27' + goal.id + '\x27)">DEL</button></span></div>' +
      '<div class="savings-progress-text"><span>' + this.fmtRsd(saved) + ' of ' + this.fmtRsd(target) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill ' + barClass + '" style="width:' + pct + '%;"></div></div>' +
      '<button class="btn btn-sm btn-secondary savings-expand-btn" onclick="BlackBook.toggleSavingsGoal(\x27' + goal.id + '\x27)">' + (expanded ? '&#9650; HIDE ENTRIES' : '&#9660; SHOW ENTRIES') + ' (' + (goal.entries || []).length + ')</button>';
    if (expanded) { html += this.savingsEntriesHtml(goal); }
    html += '</div>';
    return html;
  },

  savingsEntriesHtml(goal) {
    if (!goal.entries || !goal.entries.length) return '<div class="savings-entries"><div style="padding:6px 8px;color:var(--text-muted);font-size:12px;">No entries yet.</div></div>';
    let rows = '';
    const sorted = goal.entries.slice().sort((a, b) => b.date.localeCompare(a.date));
    for (const e of sorted) {
      const neg = e.amount < 0;
      rows += '<div class="savings-entry-item">' +
        '<span class="savings-entry-date">' + e.date + '</span>' +
        '<span class="savings-entry-note">' + this.escapeHtml(e.note || '') + '</span>' +
        '<span class="savings-entry-amount ' + (neg ? 'savings-withdraw' : '') + '">' + (neg ? '' : '+') + this.fmtRsd(e.amount) + '</span>' +
        '<button class="savings-entry-delete" onclick="BlackBook.deleteSavingsEntry(\x27' + goal.id + '\x27, \x27' + e.id + '\x27)">&times;</button></div>';
    }
    return '<div class="savings-entries">' + rows + '</div>';
  },

  toggleSavingsGoal(goalId) {
    if (!this._expandedGoals) this._expandedGoals = {};
    this._expandedGoals[goalId] = !this._expandedGoals[goalId];
    this.renderSavings();
  },

  openNewSavingsGoal() {
    document.getElementById('savings-goal-id').value = '';
    document.getElementById('savings-goal-name').value = '';
    document.getElementById('savings-goal-target').value = '';
    document.getElementById('savings-goal-currency').value = 'RSD';
    document.getElementById('savings-modal-title').textContent = 'New Savings Goal';
    this.openModal('savings-modal');
  },

  openEditSavingsGoal(goalId) {
    const goal = this.data.savingsGoals.find(g => g.id === goalId);
    if (!goal) return;
    document.getElementById('savings-goal-id').value = goal.id;
    document.getElementById('savings-goal-name').value = goal.name;
    document.getElementById('savings-goal-target').value = goal.targetAmount;
    document.getElementById('savings-goal-currency').value = goal.currency || 'RSD';
    document.getElementById('savings-modal-title').textContent = 'Edit Savings Goal';
    this.openModal('savings-modal');
  },

  async deleteSavingsGoal(goalId) {
    if (!confirm('Delete this savings goal?')) return;
    const goal = this.data.savingsGoals.find(g => g.id === goalId);
    const entryIds = new Set(((goal && goal.entries) || []).map(e => e.id));
    this.data.savingsGoals = this.data.savingsGoals.filter(g => g.id !== goalId);
    this.data.transactions = (this.data.transactions || []).filter(t => !entryIds.has(t.linkId));
    await this.save();
    this.renderSavings();
  },

  bindSavingsGoalForm() {
    document.getElementById('savings-goal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('savings-goal-id').value;
      const name = document.getElementById('savings-goal-name').value.trim();
      const targetAmount = parseFloat(document.getElementById('savings-goal-target').value);
      const currency = document.getElementById('savings-goal-currency').value;
      if (!name || isNaN(targetAmount) || targetAmount <= 0) return;
      if (id) {
        const goal = this.data.savingsGoals.find(g => g.id === id);
        if (goal) { goal.name = name; goal.targetAmount = targetAmount; goal.currency = currency; }
      } else {
        this.data.savingsGoals.push({ id: crypto.randomUUID(), name: name, targetAmount: targetAmount, currency: currency, entries: [] });
      }
      await this.save();
      this.closeModal('savings-modal');
      this.renderSavings();
    });
  },

  openNewSavingsEntry(goalId) {
    document.getElementById('savings-entry-goal-id').value = goalId;
    document.getElementById('savings-entry-date').value = this.today();
    document.getElementById('savings-entry-amount').value = '';
    document.getElementById('savings-entry-note').value = '';
    this.openModal('savings-entry-modal');
    setTimeout(() => document.getElementById('savings-entry-amount').focus(), 50);
  },

  async deleteSavingsEntry(goalId, entryId) {
    const goal = this.data.savingsGoals.find(g => g.id === goalId);
    if (!goal) return;
    goal.entries = (goal.entries || []).filter(e => e.id !== entryId);
    this.data.transactions = (this.data.transactions || []).filter(t => t.linkId !== entryId);
    await this.save();
    this.renderSavings();
  },

  async addSavingsEntry(goalId, amount, date, note) {
    const goal = this.data.savingsGoals.find(g => g.id === goalId);
    if (!goal) return;
    if (!goal.entries) goal.entries = [];
    const entry = { id: crypto.randomUUID(), date: date, amount: amount, note: note || '' };
    goal.entries.push(entry);
    const tCat = this.transferCategory();
    this.data.transactions.push({
      id: crypto.randomUUID(),
      linkId: entry.id,
      date: date,
      type: -amount >= 0 ? 'income' : 'expense',
      amount: Math.round(-amount * 100) / 100,
      currency: 'RSD',
      accountId: '',
      categoryId: tCat.id,
      note: 'Savings: ' + goal.name + (note ? ' — ' + note : '')
    });
    await this.save();
  },

  bindSavingsEntryForm() {
    document.getElementById('savings-entry-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = document.getElementById('savings-entry-goal-id').value;
      const date = document.getElementById('savings-entry-date').value;
      const amount = parseFloat(document.getElementById('savings-entry-amount').value);
      const note = document.getElementById('savings-entry-note').value.trim();
      if (!goalId || isNaN(amount) || amount === 0) return;
      const goal = this.data.savingsGoals.find(g => g.id === goalId);
      if (!goal) return;
      if (amount < 0 && this.goalSaved(goal) + amount < 0) { alert('Withdrawal exceeds saved balance (' + this.fmtRsd(this.goalSaved(goal)) + ').'); return; }
      await this.addSavingsEntry(goalId, amount, date, note);
      this.closeModal('savings-entry-modal');
      this.renderSavings();
    });
  },

  renderSavingsChart() {
    if (this.savingsChart) { this.savingsChart.destroy(); this.savingsChart = null; }
    const canvas = document.getElementById('savings-chart');
    if (!canvas) return;
    const goals = this.data.savingsGoals;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const yearStr = String(this.vy());
    const datasets = goals.map(goal => {
      let base = 0;
      for (const e of (goal.entries || [])) { if (e.date.substring(0, 4) < yearStr) base += e.amount; }
      let run = base;
      const data = MONTHS_S.map((_, m) => {
        const mk = yearStr + '-' + String(m + 1).padStart(2, '0');
        for (const e of (goal.entries || [])) { if (e.date.substring(0, 7) === mk) run += e.amount; }
        return Math.round(run * 100) / 100;
      });
      return { label: goal.name, data: data, borderColor: this.billColor(goal), backgroundColor: this.billColor(goal), tension: 0.3, borderWidth: 2, pointRadius: 3 };
    });
    this.savingsChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: MONTHS_S, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: false }
        },
        scales: {
          x: { ticks: { color: '#555555' }, grid: { color: '#141414' } },
          y: { ticks: { color: '#555555' }, grid: { color: '#141414' } }
        }
      }
    });
  },

  // ==================== DEBTS ====================

  renderDebts() {
    const el = document.getElementById('page-debts');
    if (!el) return;
    if (!this.data.debts) this.data.debts = [];
    let html = '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="btn btn-primary" onclick="BlackBook.openNewDebt()">+ NEW DEBT</button></div>';
    html += this.debtsSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.debtsListHtml() + '</div>';
    el.innerHTML = html;
  },

  debtRsd(d) { return Math.abs(this.toRsd(d.amount, d.currency || 'RSD')); },
  debtPaidRsd(d) { return Math.min(this.debtRsd(d), Math.abs(this.toRsd(d.amountPaid || 0, d.currency || 'RSD'))); },
  debtIsSettled(d) { return this.debtPaidRsd(d) >= this.debtRsd(d) - 0.009 && this.debtRsd(d) > 0; },

  debtsSummaryHtml() {
    let owedToMe = 0, iOwe = 0;
    for (const d of this.data.debts) {
      const left = this.debtRsd(d) - this.debtPaidRsd(d);
      if (d.type === 'in') owedToMe += left; else iOwe += left;
    }
    const net = owedToMe - iOwe;
    return '<div class="month-summary" style="margin-bottom:10px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">OWED TO ME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(owedToMe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">I OWE</span><span class="month-summary-value amount-negative">' + this.fmtRsd(iOwe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (net >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtRsd(net) + '</span></div></div>';
  },

  debtsListHtml() {
    if (!this.data.debts.length) return '<div class="empty-state"><div class="empty-state-text">No debts tracked. Click + NEW DEBT to add one.</div></div>';
    const sorted = this.data.debts.slice().sort((a, b) => {
      const sa = this.debtIsSettled(a) ? 1 : 0, sb = this.debtIsSettled(b) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return String(a.dueDate || a.date).localeCompare(String(b.dueDate || b.date));
    });
    return sorted.map(d => this.debtCardHtml(d)).join('');
  },

  debtCardHtml(d) {
    const settled = this.debtIsSettled(d);
    const total = this.debtRsd(d), paid = this.debtPaidRsd(d);
    const pct = total > 0 ? Math.min(Math.round(paid / total * 100), 100) : 0;
    const overdue = !settled && d.dueDate && d.dueDate < this.today();
    const fill = d.type === 'in' ? 'var(--income)' : 'var(--accent)';
    let html = '<div class="savings-card debt-card"' + (settled ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + (d.type === 'in' ? 'var(--income)' : 'var(--expense)') + ';"></span> ' + this.escapeHtml(d.person) + '</span>' +
      '<span class="savings-actions">' +
      '<span class="debt-badge ' + (d.type === 'in' ? 'debt-badge-in' : 'debt-badge-out') + '">' + (d.type === 'in' ? 'OWES ME' : 'I OWE') + '</span>' +
      (settled ? '<span class="debt-badge debt-badge-settled">&#10003; SETTLED</span>' : '<button class="btn btn-sm btn-primary" onclick="BlackBook.openDebtPayModal(\x27' + d.id + '\x27)">+ PAY</button>') +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditDebt(\x27' + d.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteDebt(\x27' + d.id + '\x27)">DEL</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + this.fmtRsd(paid) + ' of ' + this.fmtRsd(total) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + fill + ';"></div></div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      'DATE ' + (d.date || '?') +
      ' &middot; <span class="' + (overdue ? 'amount-negative" title="Overdue"' : '"') + '>DUE ' + (d.dueDate ? this.ordinalDay(new Date(d.dueDate).getDate()) + ' ' + new Date(d.dueDate).toLocaleString('en', { month: 'short' }).toUpperCase() + ' ' + new Date(d.dueDate).getFullYear() : '-') + '</span>' +
      (overdue ? ' &middot; <span class="amount-negative">OVERDUE</span>' : '') +
      (d.note ? ' &middot; ' + this.escapeHtml(d.note) : '') + '</div>';
    html += '</div>';
    return html;
  },

  openNewDebt() {
    document.getElementById('debt-id').value = '';
    document.getElementById('debt-person').value = '';
    document.getElementById('debt-type').value = 'in';
    document.getElementById('debt-amount').value = '';
    document.getElementById('debt-currency').value = 'RSD';
    document.getElementById('debt-date').value = this.today();
    const in30 = new Date(Date.now() + 30 * 86400000);
    document.getElementById('debt-due').value = in30.toISOString().slice(0, 10);
    document.getElementById('debt-paid').value = '';
    document.getElementById('debt-note').value = '';
    document.getElementById('debt-modal-title').textContent = 'New Debt';
    this.bindDebtForm();
    this.openModal('debt-modal');
    setTimeout(() => document.getElementById('debt-person').focus(), 50);
  },

  openEditDebt(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d) return;
    document.getElementById('debt-id').value = d.id;
    document.getElementById('debt-person').value = d.person;
    document.getElementById('debt-type').value = d.type || 'in';
    document.getElementById('debt-amount').value = d.amount;
    document.getElementById('debt-currency').value = d.currency || 'RSD';
    document.getElementById('debt-date').value = d.date || '';
    document.getElementById('debt-due').value = d.dueDate || '';
    document.getElementById('debt-paid').value = d.amountPaid || '';
    document.getElementById('debt-note').value = d.note || '';
    document.getElementById('debt-modal-title').textContent = 'Edit Debt';
    this.bindDebtForm();
    this.openModal('debt-modal');
    setTimeout(() => document.getElementById('debt-person').focus(), 50);
  },

  bindDebtForm() {
    const f = document.getElementById('debt-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('debt-id').value;
      const person = document.getElementById('debt-person').value.trim();
      if (!person) return;
      const parseNum = (v) => Math.round(parseFloat(String(v).trim().replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
      const amount = parseNum(document.getElementById('debt-amount').value);
      if (!(amount > 0)) { alert('Enter a valid amount.'); return; }
      let amountPaid = parseNum(document.getElementById('debt-paid').value) || 0;
      if (amountPaid > amount) amountPaid = amount;
      const data = { person: person, type: document.getElementById('debt-type').value, amount: amount, currency: document.getElementById('debt-currency').value, date: document.getElementById('debt-date').value || this.today(), dueDate: document.getElementById('debt-due').value || '', amountPaid: amountPaid, note: document.getElementById('debt-note').value.trim() };
      if (!this.data.debts) this.data.debts = [];
      if (id) {
        const d = this.data.debts.find(x => x.id === id);
        if (d) Object.assign(d, data);
      } else {
        data.id = 'debt-' + Date.now();
        this.data.debts.push(data);
      }
      await this.save();
      this.closeModal('debt-modal');
      this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
    });
  },

  openDebtPayModal(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d || this.debtIsSettled(d)) return;
    const remaining = this.debtRsd(d) - this.debtPaidRsd(d);
    document.getElementById('dpay-id').value = id;
    document.getElementById('dpay-amount').value = remaining.toFixed(2);
    document.getElementById('debt-pay-title').textContent = 'Payment \u2014 ' + d.person;
    this.bindDebtPayForm();
    this.openModal('debt-pay-modal');
    setTimeout(() => { const a = document.getElementById('dpay-amount'); a.focus(); a.select(); }, 50);
  },

  bindDebtPayForm() {
    const f = document.getElementById('debt-pay-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = this.data.debts.find(x => x.id === document.getElementById('dpay-id').value);
      if (!d) return;
      let amt = Math.round(parseFloat(String(document.getElementById('dpay-amount').value).trim().replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      const remaining = this.debtRsd(d) - this.debtPaidRsd(d);
      if (amt > remaining) amt = remaining;
      d.amountPaid = Math.round(((d.amountPaid || 0) + amt) * 100) / 100;
      await this.save();
      this.closeModal('debt-pay-modal');
      this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
    });
  },

  async deleteDebt(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d) return;
    if (!confirm('Delete debt entry for "' + d.person + '"?')) return;
    this.data.debts = this.data.debts.filter(x => x.id !== id);
    await this.save();
    this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
  },

  // ==================== SETTINGS ====================

  renderSettings() {
    const el = document.getElementById('page-settings');
    if (!el) return;
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h1 style="font-size:14px;">SETTINGS</h1></div>' + this.settingsHtml();
    this.bindSettingsEvents(el);
    this.bindSettingsModals();
    this.refreshProfilesList();
  },

  settingsHtml() {
    const defaultAccountId = this.data.settings.defaultAccountId || '';
    const defaultCategoryId = this.data.settings.defaultCategoryId || '';

    let accountsList = '';
    const visibleAccts = this.visibleAccounts();
    for (const a of visibleAccts) {
      accountsList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + a.color + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(a.name) + '</span>' +
        '<span class="settings-row-meta">' + a.currency + ' &middot; ' + (a.type || 'cash') + '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27' + a.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteAccount(\x27' + a.id + '\x27)">DEL</button></div>';
    }
    for (const c of (this.data.creditCards || [])) {
      accountsList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + (c.color || '#71717a') + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(c.name) + '</span>' +
        '<span class="settings-row-meta">CREDIT CARD &middot; INT ' + (c.ratePct != null ? c.ratePct : 5) + '%</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27card:' + c.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCard(\x27' + c.id + '\x27)">DEL</button></div>';
    }
    if (!visibleAccts.length && !(this.data.creditCards || []).length) accountsList = '<div style="padding:8px;color:var(--text-muted);font-size:12px;">No accounts yet.</div>';

    let categoriesList = '';
    const sortedCats = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sortedCats) {
      categoriesList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + c.color + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(c.name) + '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditCategory(\x27' + c.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCategory(\x27' + c.id + '\x27)">DEL</button></div>';
    }
    if (!this.data.categories.length) categoriesList = '<div style="padding:8px;color:var(--text-muted);font-size:12px;">No categories yet.</div>';

    const defaultAccountOpts = '<option value="">None</option>' + this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === defaultAccountId ? ' selected' : '') + '>' + this.escapeHtml(a.name) + '</option>').join('');
    const defaultCategoryOpts = '<option value="">None</option>' + this.data.categories.map(c => '<option value="' + c.id + '"' + (c.id === defaultCategoryId ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');

    return '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">APPEARANCE</span></div>' +
      '<div class="form-row-2col">' +
      '<div class="form-group"><label>Highlight Color</label><div style="display:flex;align-items:center;gap:8px;"><input type="color" id="settings-highlight-color" value="' + (this.data.settings.highlightColor || '#f9a05c') + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;"><span style="font-size:12px;color:var(--text-dim);">' + (this.data.settings.highlightColor || '#f9a05c') + '</span></div></div>' +
      '<div class="form-group"><label>Income Color</label><div style="display:flex;align-items:center;gap:8px;"><input type="color" id="settings-income-color" value="' + (this.data.settings.incomeColor || '#4ade80') + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;"><span style="font-size:12px;color:var(--text-dim);">' + (this.data.settings.incomeColor || '#4ade80') + '</span></div></div>' +
      '<div class="form-group"><label>Expense Color</label><div style="display:flex;align-items:center;gap:8px;"><input type="color" id="settings-expense-color" value="' + (this.data.settings.expenseColor || '#f87171') + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;"><span style="font-size:12px;color:var(--text-dim);">' + (this.data.settings.expenseColor || '#f87171') + '</span></div></div>' +
      '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">DEFAULTS</span></div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
      '<div class="form-group"><label>Default Account</label><select id="settings-default-account" class="input">' + defaultAccountOpts + '</select></div>' +
      '<div class="form-group"><label>Default Category</label><select id="settings-default-category" class="input">' + defaultCategoryOpts + '</select></div></div></div>' +

      '<div class="settings-cols">' +
      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">ACCOUNTS</span><button class="btn btn-sm btn-primary" onclick="BlackBook.openNewAccount()">+ ADD</button></div>' +
      '<div class="settings-list">' + accountsList + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">CATEGORIES</span><button class="btn btn-sm btn-primary" onclick="BlackBook.openNewCategory()">+ ADD</button></div>' +
      '<div class="settings-list">' + categoriesList + '</div></div>' +
      '</div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">EXCHANGE RATES (RSD PER UNIT)</span><button class="btn btn-sm btn-secondary" id="settings-refresh-all-rates">REFRESH ALL</button></div>' +
      '<div class="settings-rate-card">' + this.ratesTableHtml() + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">PROFILES</span><button class="btn btn-sm btn-primary" onclick="BlackBook.createProfile()">+ NEW PROFILE</button></div>' +
      '<div class="settings-list" id="profiles-list">' + this.profilesListHtml() + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">DATA</span></div>' +
      '<div class="settings-data-actions"><button class="btn btn-secondary" id="settings-export">EXPORT JSON</button>' +
      '<button class="btn btn-secondary" id="settings-export-csv">EXPORT CSV</button>' +
      '<button class="btn btn-secondary" id="settings-import-btn">IMPORT JSON</button>' +
      '<input type="file" id="settings-import-file" accept=".json" style="display:none;">' +
      '<button class="btn btn-secondary" id="settings-generate-demo">GENERATE DEMO DATA</button>' +
      '<button class="btn btn-secondary" id="settings-export-pdf">EXPORT PDF (coming soon)</button></div></div>' +

      '<div class="settings-footer">BLACK BOOK v0.1.0 &middot; Created by Nikola Ne&scaron;i&#263;</div>';
  },

  profilesListHtml() {
    return '<div style="padding:8px;color:var(--text-muted);font-size:12px;">Loading profiles&hellip;</div>';
  },

  async refreshProfilesList() {
    const el = document.getElementById('profiles-list');
    if (!el) return;
    let profiles = [];
    try {
      const res = await fetch('/api/profiles');
      profiles = (await res.json()).profiles || [];
    } catch (e) {}
    let html = '<div class="settings-row"><span class="row-swatch" style="background:var(--accent);"></span><span class="settings-row-name">DEFAULT' + (!this.profile ? ' &#10003;' : '') + '</span><span class="settings-row-meta">' + (this.profile ? 'switch to default data set' : 'active') + '</span>' +
      (!this.profile ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.renameProfile(\'\')">RENAME</button>' : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.switchProfile(\'\')">OPEN</button>') + '</div>';
    if (!profiles.length) html += '<div style="padding:8px;color:var(--text-muted);font-size:12px;">No extra profiles yet.</div>';
    for (const p of profiles) {
      const active = p.name === this.profile;
      html += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + this.billColor({ name: p.name }) + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(p.name).toUpperCase() + (active ? ' &#10003;' : '') + '</span>' +
        '<span class="settings-row-meta">' + (active ? 'active profile' : '') + '</span>' +
        (!active ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.switchProfile(\x27' + this.escapeHtml(p.name) + '\x27)">OPEN</button>' : '') +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.renameProfile(\x27' + this.escapeHtml(p.name) + '\x27)">RENAME</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteProfile(\x27' + this.escapeHtml(p.name) + '\x27)">DEL</button></div>';
    }
    el.innerHTML = html;
  },

  switchProfile(name) {
    localStorage.setItem('mb_profile', name || '');
    location.reload();
  },
  async createProfile() {
    const name = prompt('New profile name:');
    if (!name || !name.trim()) return;
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', name: name.trim() }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    await this.save();
    this.switchProfile(name.trim());
  },
  async renameProfile(name) {
    const newName = prompt(name ? 'Rename profile:' : 'Name the default profile (becomes a named profile):', name || 'default');
    if (!newName || !newName.trim() || newName.trim() === name) return;
    const wasActive = this.profile === name;
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', name: name, newName: newName.trim() }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    if (wasActive) this.switchProfile(newName.trim());
    else this.refreshProfilesList();
  },
  async deleteProfile(name) {
    if (!confirm('Delete profile "' + name + '" and all of its data?')) return;
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', name: name }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    if (this.profile === name) this.switchProfile('');
    else this.refreshProfilesList();
  },

  exportCsv() {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['date', 'type', 'amount', 'currency', 'account', 'card', 'category', 'note']];
    for (const t of this.data.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const acc = this.data.accounts.find(a => a.id === t.accountId);
      const card = t.cardId ? this.cardById(t.cardId) : null;
      const cat = this.data.categories.find(c => c.id === t.categoryId);
      rows.push([t.date, t.type, t.amount, t.currency || 'RSD', acc ? acc.name : '', card ? card.name : '', cat ? cat.name : '', t.note || '']);
    }
    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'blackbook-transactions-' + this.today() + '.csv';
    a.click();
  },

  async generateDemoData() {
    if (!confirm('This will REPLACE all transactions and budgets, reset categories to the default set and regenerate colors. Continue?')) return;
    const DEMO_CATS = [
      'Transfer', 'Salary', 'Side Income', 'Rent', 'Utilities', 'Internet & Phone',
      'Insurance', 'Subscriptions', 'Groceries', 'Dining Out', 'Cafe & Drinks',
      'Transport', 'Car', 'Healthcare', 'Pharmacy', 'Clothes', 'Entertainment',
      'Hobbies', 'Travel', 'Fitness', 'Gifts', 'Family', 'Home', 'Electronics',
      'Personal Care', 'Credit Card', 'Savings', 'Fees'
    ];
    this.data.categories = DEMO_CATS.map((name, i) => {
      let sn = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
      return { id: 'cat-demo-' + i, name: name, shortName: sn, color: this.hslToHex('hsl(' + Math.round((i * 137.508) % 360) + ', 65%, 62%)') };
    });
    const snTaken = new Set();
    for (const c of this.data.categories) {
      if (!snTaken.has(c.shortName)) { snTaken.add(c.shortName); continue; }
      let suffix = 'A';
      while (snTaken.has(c.shortName.slice(0, 3) + suffix)) suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
      c.shortName = c.shortName.slice(0, 3) + suffix;
      snTaken.add(c.shortName);
    }
    const cat = {};
    for (const c of this.data.categories) cat[c.name] = c.id;
    for (let i = 0; i < this.data.accounts.length; i++) {
      this.data.accounts[i].color = this.hslToHex('hsl(' + Math.round((i * 137.508 + 47) % 360) + ', 60%, 58%)');
    }
    if (!this.data.accounts.length) {
      this.data.accounts.push({ id: 'acc-cash', name: 'Cash', shortName: 'CSH', type: 'cash', currency: 'RSD', color: '#e0b04c' }, { id: 'acc-card', name: 'Card', shortName: 'CRD', type: 'bank', currency: 'RSD', color: '#5c8ae0' });
    }
    for (const a of this.data.accounts) {
      if (!a.shortName) a.shortName = String(a.name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'ACC';
    }

    const BUDGET_AMOUNTS = { 'Rent': 40000, 'Utilities': 9000, 'Internet & Phone': 5000, 'Subscriptions': 2500, 'Groceries': 60000, 'Dining Out': 20000, 'Cafe & Drinks': 8000, 'Transport': 6000, 'Car': 15000, 'Entertainment': 10000, 'Hobbies': 8000, 'Clothes': 12000, 'Healthcare': 8000, 'Pharmacy': 4000, 'Fitness': 4000, 'Personal Care': 4000, 'Gifts': 6000, 'Family': 8000, 'Home': 5000, 'Electronics': 8000, 'Travel': 20000 };
    this.data.budgets = Object.entries(BUDGET_AMOUNTS).filter(([n]) => cat[n]).map(([n, amount]) => ({ id: crypto.randomUUID(), categoryId: cat[n], amount: amount }));

    this.data.bills = [
      { id: 'bill-demo-ele', name: 'Electricity', amount: 6500, currency: 'RSD', dueDay: 15, categoryId: cat['Utilities'], active: true, autopay: false },
      { id: 'bill-demo-int', name: 'Internet', amount: 2999, currency: 'RSD', dueDay: 10, categoryId: cat['Internet & Phone'], active: true, autopay: true },
      { id: 'bill-demo-phone', name: 'Phone', amount: 1450, currency: 'RSD', dueDay: 20, categoryId: cat['Internet & Phone'], active: true, autopay: true },
      { id: 'bill-demo-sub', name: 'Netflix', amount: 1200, currency: 'RSD', dueDay: 5, categoryId: cat['Subscriptions'], active: true, autopay: true }
    ];
    this.data.billPayments = [];
    for (let m = 0; m <= curM; m++) {
      const mk = Y + '-' + String(m + 1).padStart(2, '0');
      if (m === curM) continue;
      for (const b of this.data.bills) {
        const entry = { billId: b.id, month: mk, paid: true };
        if (b.id === 'bill-demo-ele') entry.amount = rint(4500, 9500);
        this.data.billPayments.push(entry);
      }
    }

    this.data.savingsGoals = [
      { id: crypto.randomUUID(), name: 'New car', targetAmount: 600000, currency: 'RSD', entries: [] },
      { id: crypto.randomUUID(), name: 'Emergency fund', targetAmount: 300000, currency: 'RSD', entries: [] }
    ];
    for (let m = 0; m < curM; m++) {
      const dstr = Y + '-' + String(m + 1).padStart(2, '0') + '-20';
      this.data.savingsGoals[0].entries.push({ date: dstr, amount: rint(15000, 30000), note: 'Deposit' });
      if (chance(0.8)) this.data.savingsGoals[1].entries.push({ date: dstr, amount: rint(8000, 15000), note: 'Deposit' });
    }

    const cardId = 'card-demo-visa';
    this.data.creditCards = [{ id: cardId, name: 'Visa Gold', color: '#b45309', ratePct: 5, dueDay: 15 }];
    let pSy = Y, pSm = curM - 3;
    if (pSm < 0) { pSm += 12; pSy--; }
    const planId = 'inst-demo-mac';
    const planStart = pSy + '-' + String(pSm + 1).padStart(2, '0');
    this.data.installments = [{ id: planId, cardId: cardId, name: 'MacBook Pro', total: 144000, months: 6, startMonth: planStart, dueDay: 15, ratePct: 5, paid: [], advance: 0 }];

    this.data.debts = [
      { id: 'debt-demo-1', person: 'Marko', type: 'in', amount: 25000, amountPaid: 10000, currency: 'RSD', date: null, dueDate: null, note: 'Lent for laptop repair', _borrowedAgo: 1, _dueIn: 2 },
      { id: 'debt-demo-2', person: 'Ana', type: 'out', amount: 40000, amountPaid: 0, currency: 'RSD', date: null, dueDate: null, note: 'Shared vacation costs', _borrowedAgo: 2, _dueIn: -1 },
      { id: 'debt-demo-3', person: 'Jovana', type: 'in', amount: 12000, amountPaid: 12000, currency: 'RSD', date: null, dueDate: null, note: 'Concert tickets', _borrowedAgo: 5, _dueIn: 4 }
    ];
    const monthShift = (back) => {
      const t = Y * 12 + curM - back;
      return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
    };
    for (const d of this.data.debts) {
      d.date = monthShift(d._borrowedAgo) + '-05';
      d.dueDate = monthShift(-d._dueIn) + '-01';
      delete d._borrowedAgo; delete d._dueIn;
    }
    const accIds = this.data.accounts.map(a => a.id);
    const pickAcc = () => accIds[Math.floor(Math.random() * accIds.length)];
    const rint = (min, max) => Math.round(min + Math.random() * (max - min));
    const chance = (p) => Math.random() < p;
    const today = new Date();
    const Y = today.getFullYear(), curM = today.getMonth(), curD = today.getDate();

    const NOTES = {
      'Rent': ['Apartment rent', 'Monthly rent'],
      'Utilities': ['Electricity', 'Water', 'Heating', 'Gas bill'],
      'Internet & Phone': ['Internet bill', 'Phone plan', 'ISP bill'],
      'Insurance': ['Car insurance', 'Health insurance', 'Apartment insurance'],
      'Subscriptions': ['Netflix', 'Spotify', 'Cloud storage', 'News subscription'],
      'Groceries': ['Lidl run', 'Maxi groceries', 'Supermarket run', 'Corner shop', 'Farmers market'],
      'Dining Out': ['Lunch out', 'Pizza night', 'Dinner downtown', 'Burger place', 'Sushi date'],
      'Cafe & Drinks': ['Morning coffee', 'Beers with friends', 'Energy drink', 'Smoothie', 'Espresso bar'],
      'Transport': ['Bus ticket', 'Monthly tram pass', 'Taxi ride', 'City parking'],
      'Car': ['Fuel', 'Oil change', 'Car wash', 'New tires', 'Registration'],
      'Healthcare': ['Dentist', 'Checkup', 'Lab tests', 'Physiotherapy'],
      'Pharmacy': ['Pharmacy run', 'Prescription', 'Cold medicine', 'Vitamins'],
      'Clothes': ['Jeans', 'Sneakers', 'T-shirts pack', 'Winter jacket', 'Hoodie'],
      'Entertainment': ['Cinema night', 'Concert ticket', 'Bowling', 'Board game evening'],
      'Hobbies': ['Steam sale', 'Bookstore', 'Guitar strings', 'Craft supplies'],
      'Travel': ['Weekend trip', 'Hotel stay', 'Airplane tickets', 'Airbnb booking'],
      'Fitness': ['Gym membership', 'Protein powder', 'Running shoes', 'Yoga class'],
      'Gifts': ['Birthday gift', 'Gift for mom', 'Anniversary present', 'Flowers'],
      'Family': ['Family dinner', 'Helped out at home', 'Kids school fund'],
      'Home': ['IKEA haul', 'Cleaning supplies', 'Light bulbs', 'Kitchen stuff'],
      'Electronics': ['USB cable', 'Phone charger', 'Mechanical keyboard', 'Monitor stand'],
      'Personal Care': ['Haircut', 'Toiletries', 'Skincare', 'Barber'],
      'Salary': ['Salary', 'Monthly salary'],
      'Side Income': ['Freelance project', 'Sold old phone', 'Cashback bonus'],
      'Credit Card': ['Credit card payment'], 'Transfer': ['Account transfer']
    };
    const SPENDS = [
      { c: 'Groceries', min: 1500, max: 7000, w: 3 },
      { c: 'Dining Out', min: 900, max: 4200, w: 2 },
      { c: 'Cafe & Drinks', min: 400, max: 2200, w: 2 },
      { c: 'Transport', min: 300, max: 1800, w: 1.5 },
      { c: 'Car', min: 2500, max: 7500, w: 1 },
      { c: 'Hobbies', min: 1200, max: 5500, w: 1 },
      { c: 'Entertainment', min: 1000, max: 5000, w: 1 },
      { c: 'Subscriptions', min: 500, max: 2500, w: 0.9 },
      { c: 'Pharmacy', min: 600, max: 2500, w: 0.8 },
      { c: 'Personal Care', min: 800, max: 3500, w: 0.6 },
      { c: 'Home', min: 900, max: 6500, w: 0.5 },
      { c: 'Gifts', min: 1000, max: 6000, w: 0.5 },
      { c: 'Family', min: 2000, max: 9000, w: 0.5 },
      { c: 'Fitness', min: 1500, max: 4500, w: 0.5 },
      { c: 'Clothes', min: 1800, max: 8000, w: 0.7 },
      { c: 'Electronics', min: 1500, max: 12000, w: 0.4 },
      { c: 'Healthcare', min: 2200, max: 14000, w: 0.4 },
      { c: 'Travel', min: 12000, max: 42000, w: 0.15 }
    ];
    const weightedPick = () => {
      const total = SPENDS.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * total;
      for (const s of SPENDS) { r -= s.w; if (r <= 0) return s; }
      return SPENDS[0];
    };
    let seq = 0;
    const mkTx = (dateStr, type, amount, categoryId, note) => ({
      id: 'demo-' + Date.now() + '-' + (seq++), type: type, amount: amount, currency: 'RSD',
      accountId: pickAcc(), categoryId: categoryId, date: dateStr, note: note
    });

    const txs = [];
    for (let m = 0; m <= curM; m++) {
      const maxDay = m === curM ? Math.max(curD, 2) : 28;
      const day = (d) => Math.min(d, maxDay);
      const ds = (d) => Y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day(d)).padStart(2, '0');
      const note = (cname) => { const arr = NOTES[cname] || [cname]; return arr[Math.floor(Math.random() * arr.length)]; };

      txs.push(mkTx(ds(5), 'expense', -(rint(37000, 39500)), cat['Rent'], note('Rent')));
      txs.push(mkTx(ds(rint(8, 14)), 'expense', -(rint(3500, 8600)), cat['Utilities'], note('Utilities')));
      txs.push(mkTx(ds(15), 'expense', -(rint(2900, 4500)), cat['Internet & Phone'], note('Internet & Phone')));
      if (chance(0.5)) txs.push(mkTx(ds(10), 'expense', -(rint(4000, 7000)), cat['Insurance'], note('Insurance')));
      if (chance(0.7)) txs.push(mkTx(ds(3), 'expense', -(rint(1200, 2400)), cat['Subscriptions'], note('Subscriptions')));
      if (chance(0.25)) txs.push(mkTx(ds(12), 'income', rint(8000, 25000), cat['Side Income'], note('Side Income')));
      if (chance(0.35)) {
        txs.push(mkTx(ds(12), 'income', rint(30000, 45000), cat['Salary'], 'Salary advance'));
        txs.push(mkTx(ds(26), 'income', rint(60000, 78000), cat['Salary'], 'Salary'));
      } else {
        txs.push(mkTx(ds(25), 'income', rint(92000, 118000), cat['Salary'], 'Salary'));
      }
      const nSpends = rint(8, 16);
      for (let k = 0; k < nSpends; k++) {
        const s = weightedPick();
        txs.push(mkTx(ds(rint(1, 28)), 'expense', -(rint(s.min, s.max)), cat[s.c], note(s.c)));
      }
      if (accIds.length >= 2 && chance(0.7)) {
        const amt = rint(5000, 20000);
        const pairId = 'demo-pair-' + Date.now() + '-' + m;
        const fromId = accIds[0] === accIds[1] || chance(0.5) ? accIds[0] : accIds[1];
        const toId = fromId === accIds[0] ? (accIds[1] || accIds[0]) : accIds[0];
        const dstr = ds(rint(10, 24));
        txs.push({ id: 'demo-' + Date.now() + '-' + (seq++), type: 'expense', amount: -amt, currency: 'RSD', accountId: fromId, categoryId: cat['Transfer'], date: dstr, note: 'Account transfer', pairId: pairId });
        txs.push({ id: 'demo-' + Date.now() + '-' + (seq++), type: 'income', amount: amt, currency: 'RSD', accountId: toId, categoryId: cat['Transfer'], date: dstr, note: 'Account transfer', pairId: pairId });
      }
    }
    const plan = this.data.installments[0];
    txs.push({ id: 'demo-' + Date.now() + '-' + (seq++), type: 'expense', amount: -(plan.total), currency: 'RSD', accountId: null, cardId: cardId, categoryId: cat['Electronics'], date: plan.startMonth + '-05', note: 'MacBook Pro' });
    const fundingId = accIds[0] || null;
    for (let s = 1; s <= plan.months; s++) {
      const mkS = this.mkOfSeq(plan, s);
      const [pyy, pmm] = mkS.split('-').map(Number);
      if (pyy * 12 + (pmm - 1) < Y * 12 + curM) {
        plan.paid.push({ seq: s, via: 'tx' });
        const dueAmt = this.instDueAmount(plan, s);
        const pairId = 'inst-' + planId + '-s' + s;
        txs.push({ id: 'demo-' + Date.now() + '-' + (seq++), type: 'expense', amount: -dueAmt, currency: 'RSD', accountId: fundingId, categoryId: cat['Credit Card'], date: mkS + '-' + String(plan.dueDay).padStart(2, '0'), note: 'Installment MacBook Pro ' + s + '/6' + (s === 1 ? ' (incl interest)' : ''), pairId: pairId });
      }
    }
    txs.sort((a, b) => (a.date < b.date ? 1 : -1));
    this.data.transactions = txs;
    await this.save();
    this.renderSettings();
    alert('Generated ' + txs.length + ' transactions plus budgets, bills, savings goals, a credit card with installments and sample debts.');
  },

  ratesTableHtml() {
    const rates = this.getRates();
    let rows = '<div class="rate-grid-row rate-grid-head"><span>CUR</span><span>RATE</span><span>SOURCE</span><span>UPDATED</span><span>MANUAL OVERRIDE</span><span></span><span></span></div>';
    for (const code of ['EUR', 'USD', 'XAU']) {
      const r = rates[code] || { rate: null, source: null, updated: null };
      const rateVal = r.rate != null ? r.rate.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '--';
      const updated = r.updated ? new Date(r.updated).toLocaleString() : '--';
      rows += '<div class="rate-grid-row">' +
        '<span class="rate-code">' + code + '</span>' +
        '<span class="rate-val">' + rateVal + '</span>' +
        '<span class="rate-src">' + this.escapeHtml(r.source || '--') + '</span>' +
        '<span class="rate-upd">' + updated + '</span>' +
        '<input type="number" step="0.0001" class="input rate-manual-input" id="rate-manual-' + code + '" placeholder="set manually" value="' + (r.rate != null ? r.rate : '') + '">' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.saveManualRate(\x27' + code + '\x27)">SET</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.refreshRate(\x27' + code + '\x27)">REFRESH</button>' +
        '</div>';
    }
    return rows;
  },

  async refreshRate(code) {
    try {
      const resp = await fetch('/api/exchange-rate?cur=' + code);
      const result = await resp.json();
      if (result.rates && result.rates[code]) {
        this.getRates()[code] = result.rates[code];
        await this.save();
      } else {
        alert('No rate available for ' + code + '.');
      }
    } catch (e) { alert('Failed to refresh rate for ' + code + '.'); }
    this.renderSettings();
  },

  async refreshAllRates() {
    try {
      const resp = await fetch('/api/exchange-rate');
      const result = await resp.json();
      if (result.rates) {
        Object.assign(this.getRates(), result.rates);
        await this.save();
      }
    } catch (e) { alert('Failed to refresh rates.'); }
    this.renderSettings();
  },

  async saveManualRate(code) {
    const input = document.getElementById('rate-manual-' + code);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val <= 0) { alert('Invalid rate value.'); return; }
    this.getRates()[code] = { rate: val, source: 'manual', updated: new Date().toISOString() };
    await this.save();
    this.renderSettings();
  },

  bindSettingsEvents(el) {
    const highlightInput = el.querySelector('#settings-highlight-color');
    if (highlightInput) {
      highlightInput.addEventListener('input', async () => {
        this.data.settings.highlightColor = highlightInput.value;
        this.applyThemeColors();
        this.renderSettings();
        await this.save();
      });
    }
    const incomeInput = el.querySelector('#settings-income-color');
    if (incomeInput) {
      incomeInput.addEventListener('input', async () => {
        this.data.settings.incomeColor = incomeInput.value;
        this.applyThemeColors();
        this.renderSettings();
        await this.save();
      });
    }
    const expenseInput = el.querySelector('#settings-expense-color');
    if (expenseInput) {
      expenseInput.addEventListener('input', async () => {
        this.data.settings.expenseColor = expenseInput.value;
        this.applyThemeColors();
        this.renderSettings();
        await this.save();
      });
    }
    const refreshAllBtn = el.querySelector('#settings-refresh-all-rates');
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener('click', () => this.refreshAllRates());
    }
    const exportBtn = el.querySelector('#settings-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'blackbook-backup-' + this.today() + '.json';
        a.click();
      });
    }
    const exportCsvBtn = el.querySelector('#settings-export-csv');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportCsv());
    const demoBtn = el.querySelector('#settings-generate-demo');
    if (demoBtn) demoBtn.addEventListener('click', () => this.generateDemoData());
    const importBtn = el.querySelector('#settings-import-btn');
    const importFile = el.querySelector('#settings-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const imported = JSON.parse(ev.target.result);
            this.data = imported;
            if (!this.data.bills) this.data.bills = [];
            if (!this.data.billPayments) this.data.billPayments = [];
            if (!this.data.savingsGoals) this.data.savingsGoals = [];
    if (!this.data.budgets) this.data.budgets = [];
    if (!this.data.installments) this.data.installments = [];
    if (!this.data.debts) this.data.debts = [];
    this.migrateCreditCards();
    if (this.applyAutopay()) await this.save();
    this.applyThemeColors();
            if (!this.data.settings) this.data.settings = {};
            await this.save();
            this.renderSettings();
            alert('Data imported successfully.');
          } catch (e) { alert('Invalid JSON file.'); }
        };
        reader.readAsText(file);
      });
    }
    const pdfBtn = el.querySelector('#settings-export-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => alert('PDF export coming soon.'));
    }
    const defaultAcc = el.querySelector('#settings-default-account');
    if (defaultAcc) {
      defaultAcc.addEventListener('change', async () => {
        this.data.settings.defaultAccountId = defaultAcc.value || null;
        await this.save();
      });
    }
    const defaultCat = el.querySelector('#settings-default-category');
    if (defaultCat) {
      defaultCat.addEventListener('change', async () => {
        this.data.settings.defaultCategoryId = defaultCat.value || null;
        await this.save();
      });
    }
  },

  bindSettingsModals() {
    const accForm = document.getElementById('settings-account-form');
    if (accForm && !accForm._bound) {
      accForm._bound = true;
      document.getElementById('settings-account-type').addEventListener('change', () => this.updateCreditFieldsVisibility());
      accForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idVal = document.getElementById('settings-account-id').value;
        const name = document.getElementById('settings-account-name').value.trim();
        const shortName = document.getElementById('settings-account-shortname').value.trim();
        const color = document.getElementById('settings-account-color').value;
        const currency = document.getElementById('settings-account-currency').value;
        const type = document.getElementById('settings-account-type').value;
        if (!name) return;
        if (idVal.startsWith('card:') || (!idVal && type === 'creditcard')) {
          const rateVal = parseFloat(String(document.getElementById('settings-account-rate').value).replace(',', '.'));
          const cardData = { name: name, color: color, ratePct: isNaN(rateVal) ? 5 : rateVal, dueDay: parseInt(document.getElementById('settings-account-due-day').value, 10) || 15 };
          if (!this.data.creditCards) this.data.creditCards = [];
          if (idVal.startsWith('card:')) {
            const card = this.cardById(idVal.slice(5));
            if (card) Object.assign(card, cardData);
          } else {
            this.data.creditCards.push(Object.assign({ id: 'card-' + Math.random().toString(36).slice(2, 10) }, cardData));
          }
        } else {
          const extra = {};
          if (type === 'creditcard') {
            const rateVal = parseFloat(String(document.getElementById('settings-account-rate').value).replace(',', '.'));
            extra.ratePct = isNaN(rateVal) ? 5 : rateVal;
            extra.dueDay = parseInt(document.getElementById('settings-account-due-day').value, 10) || null;
          }
          if (idVal) {
            const acc = this.data.accounts.find(a => a.id === idVal);
            if (acc) Object.assign(acc, { name: name, shortName: shortName, color: color, currency: currency, type: type });
          } else {
            this.data.accounts.push(Object.assign({ id: crypto.randomUUID(), name: name, shortName: shortName, color: color, currency: currency, type: type }, extra));
          }
        }
        await this.save();
        this.migrateCreditCards();
        await this.save();
        this.closeModal('settings-account-modal');
        this.renderSettings();
      });
    }
    const catForm = document.getElementById('settings-category-form');
    if (catForm && !catForm._bound) {
      catForm._bound = true;
      catForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('settings-category-id').value;
        const name = document.getElementById('settings-category-name').value.trim();
        const color = document.getElementById('settings-category-color').value;
        if (!name) return;
        if (id) {
          const cat = this.data.categories.find(c => c.id === id);
          if (cat) { cat.name = name; cat.color = color; }
        } else {
          this.data.categories.push({ id: crypto.randomUUID(), name: name, color: color });
        }
        await this.save();
        this.closeModal('settings-category-modal');
        this.renderSettings();
      });
    }
  },

  updateCreditFieldsVisibility() {
    const typeSel = document.getElementById('settings-account-type');
    if (!typeSel) return;
    document.getElementById('credit-fields').classList.toggle('hidden', typeSel.value !== 'creditcard');
  },

  openNewAccount() {
    document.getElementById('settings-account-id').value = '';
    document.getElementById('settings-account-name').value = '';
    document.getElementById('settings-account-shortname').value = '';
    document.getElementById('settings-account-color').value = this.hslToHex(this.randomPastel());
    document.getElementById('settings-account-currency').value = 'RSD';
    document.getElementById('settings-account-type').value = 'cash';
    document.getElementById('settings-account-rate').value = '5';
    document.getElementById('settings-account-due-day').value = '15';
    this.updateCreditFieldsVisibility();
    document.getElementById('settings-account-modal-title').textContent = 'New Account / Card';
    this.openModal('settings-account-modal');
  },

  openEditAccount(id) {
    if (String(id).startsWith('card:')) return this.openEditAccountCard(String(id).slice(5));
    const acc = this.data.accounts.find(a => a.id === id);
    if (!acc) return;
    document.getElementById('settings-account-id').value = acc.id;
    document.getElementById('settings-account-name').value = acc.name;
    document.getElementById('settings-account-shortname').value = acc.shortName || '';
    document.getElementById('settings-account-color').value = acc.color;
    document.getElementById('settings-account-currency').value = acc.currency;
    document.getElementById('settings-account-type').value = (acc.type === 'credit' ? 'creditcard' : (acc.type || 'cash'));
    document.getElementById('settings-account-rate').value = acc.ratePct != null ? acc.ratePct : 5;
    document.getElementById('settings-account-due-day').value = acc.dueDay || 15;
    this.updateCreditFieldsVisibility();
    document.getElementById('settings-account-modal-title').textContent = 'Edit Account';
    this.openModal('settings-account-modal');
  },

  openEditAccountCard(cardId) {
    const card = this.cardById(cardId);
    if (!card) return;
    document.getElementById('settings-account-id').value = 'card:' + cardId;
    document.getElementById('settings-account-name').value = card.name;
    document.getElementById('settings-account-shortname').value = '';
    document.getElementById('settings-account-color').value = card.color || '#71717a';
    document.getElementById('settings-account-currency').value = 'RSD';
    document.getElementById('settings-account-type').value = 'creditcard';
    document.getElementById('settings-account-rate').value = card.ratePct != null ? card.ratePct : 5;
    document.getElementById('settings-account-due-day').value = card.dueDay || 15;
    this.updateCreditFieldsVisibility();
    document.getElementById('settings-account-modal-title').textContent = 'Edit Credit Card';
    this.openModal('settings-account-modal');
  },

  async deleteAccount(id) {
    const acc = this.data.accounts.find(a => a.id === id);
    if (!acc) return;
    const txCount = this.data.transactions.filter(t => t.accountId === id).length;
    let purgeTxs = false;
    if (txCount > 0) {
      if (!confirm('"' + acc.name + '" has ' + txCount + ' transaction' + (txCount === 1 ? '' : 's') + '.\n\nOK = delete the account AND its transactions.\nCancel = do nothing.')) return;
      purgeTxs = true;
    } else {
      if (!confirm('Delete account "' + acc.name + '"?')) return;
    }
    this.data.accounts = this.data.accounts.filter(a => a.id !== id);
    if (purgeTxs) this.data.transactions = this.data.transactions.filter(t => t.accountId !== id);
    if (this.selectedAccount === id) this.selectedAccount = null;
    if (this.data.settings.defaultAccountId === id) this.data.settings.defaultAccountId = null;
    this.data.installments = (this.data.installments || []).filter(i => i.accountId !== id);
    await this.save();
    this.renderPage(this.currentPage);
  },

  openNewCategory() {
    document.getElementById('settings-category-id').value = '';
    document.getElementById('settings-category-name').value = '';
    document.getElementById('settings-category-color').value = this.hslToHex(this.randomPastel());
    document.getElementById('settings-category-modal-title').textContent = 'New Category';
    this.openModal('settings-category-modal');
  },

  openEditCategory(id) {
    const cat = this.data.categories.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('settings-category-id').value = cat.id;
    document.getElementById('settings-category-name').value = cat.name;
    document.getElementById('settings-category-color').value = cat.color;
    document.getElementById('settings-category-modal-title').textContent = 'Edit Category';
    this.openModal('settings-category-modal');
  },

  async deleteCategory(id) {
    const cat = this.data.categories.find(c => c.id === id);
    if (!cat) return;
    const txCount = this.data.transactions.filter(t => t.categoryId === id).length;
    let purgeTxs = false;
    if (txCount > 0) {
      if (!confirm('"' + cat.name + '" is used by ' + txCount + ' transaction' + (txCount === 1 ? '' : 's') + '.\n\nOK = delete the category AND its transactions.\nCancel = do nothing.')) return;
      purgeTxs = true;
    } else {
      if (!confirm('Delete category "' + cat.name + '"?')) return;
    }
    this.data.categories = this.data.categories.filter(c => c.id !== id);
    if (purgeTxs) this.data.transactions = this.data.transactions.filter(t => t.categoryId !== id);
    if (this.selectedCategory === id) this.selectedCategory = null;
    if (this.data.settings.defaultCategoryId === id) this.data.settings.defaultCategoryId = null;
    this.data.budgets = (this.data.budgets || []).filter(b => b.categoryId !== id);
    await this.save();
    this.renderPage(this.currentPage);
  },

  // ==================== TRANSACTIONS ====================

  accountSelectOptions(selectedVal) {
    const opts = this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === selectedVal ? ' selected' : '') + '>' + this.escapeHtml(a.name) + (a.currency && a.currency !== 'RSD' ? ' (' + a.currency + ')' : '') + '</option>');
    for (const c of (this.data.creditCards || [])) {
      opts.push('<option value="card:' + c.id + '"' + ('card:' + c.id === selectedVal ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>');
    }
    return opts.join('');
  },

  openNewTransaction(targetId) {
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-date').value = this.today();
    document.getElementById('tx-type').value = 'expense';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    const cardPrefill = targetId && String(targetId).startsWith('card:') ? targetId : null;
    const defaultAccountId = targetId || this.selectedAccount || this.data.settings.defaultAccountId || (this.data.accounts[0] && this.data.accounts[0].id) || '';
    document.getElementById('tx-account').innerHTML = this.accountSelectOptions(defaultAccountId) || '<option value="">no accounts</option>';
    const selAcc = cardPrefill ? null : this.data.accounts.find(a => a.id === defaultAccountId);
    document.getElementById('tx-currency').value = selAcc ? (selAcc.currency || 'RSD') : 'RSD';
    const defaultCatId = this.data.settings.defaultCategoryId || (this.data.categories[0] && this.data.categories[0].id) || '';
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    const defaultCat = this.data.categories.find(c => c.id === defaultCatId);
    if (catInput && catHidden) { catHidden.value = defaultCatId; catInput.value = defaultCat ? defaultCat.name.toUpperCase() : ''; }
    const amountInput = document.getElementById('tx-amount');
    amountInput.oninput = () => { document.getElementById('tx-type').value = amountInput.value.trim().startsWith('+') ? 'income' : 'expense'; };
    this.openModal('transaction-modal');
    setTimeout(() => amountInput.focus(), 50);
    this.initCategoryPicker();
    this.bindQuickEntryExtras();
    const form = document.getElementById('transaction-form');
    if (!form._enterBound) { form._enterBound = true; form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); form.requestSubmit(); } }); }
  },

  bindQuickEntryExtras() {
    if (this._quickEntryExtrasBound) return;
    this._quickEntryExtrasBound = true;
    document.getElementById('tx-account').addEventListener('change', (e) => {
      const v = String(e.target.value);
      if (v.startsWith('card:')) {
        document.getElementById('tx-currency').value = 'RSD';
      } else {
        const acc = this.data.accounts.find(a => a.id === v);
        document.getElementById('tx-currency').value = acc ? (acc.currency || 'RSD') : 'RSD';
      }
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
      sel.selectedIndex = Math.min(sel.options.length - 1, Math.max(0, sel.selectedIndex + d));
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

  openTransferModal() {
    const vis = this.visibleAccounts();
    if (vis.length < 2) { alert('You need at least two accounts to transfer.'); return; }
    const opts = vis.map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + ' (' + (a.currency || 'RSD') + ')</option>').join('');
    document.getElementById('tr-from').innerHTML = opts;
    document.getElementById('tr-to').innerHTML = opts;
    document.getElementById('tr-from').value = (this.selectedAccount && vis.some(a => a.id === this.selectedAccount) && this.selectedAccount !== vis[0].id) ? this.selectedAccount : vis[0].id;
    const toSel = document.getElementById('tr-to');
    toSel.value = toSel.options[0].value === document.getElementById('tr-from').value ? toSel.options[1].value : toSel.options[0].value;
    document.getElementById('tr-amount').value = '';
    document.getElementById('tr-amount-in').value = '';
    document.getElementById('tr-note').value = '';
    document.getElementById('tr-date').value = new Date().toISOString().slice(0, 10);
    this.updateTransferCurrencyLabels();
    this.openModal('transfer-modal');
    setTimeout(() => document.getElementById('tr-amount').focus(), 50);
  },

  updateTransferCurrencyLabels() {
    const fromAcc = this.data.accounts.find(a => a.id === document.getElementById('tr-from').value);
    const toAcc = this.data.accounts.find(a => a.id === document.getElementById('tr-to').value);
    const curF = fromAcc ? (fromAcc.currency || 'RSD') : 'RSD';
    const curT = toAcc ? (toAcc.currency || 'RSD') : 'RSD';
    document.getElementById('tr-out-label').textContent = 'Amount out (' + curF + ')';
    document.getElementById('tr-in-label').textContent = 'Amount in (' + curT + ')';
  },

  convertBetweenCurrencies(amount, curFrom, curTo) {
    if (!amount || isNaN(amount)) return null;
    if (curFrom === curTo) return Math.round(amount * 100) / 100;
    const rsdFrom = this.toRsd(amount, curFrom);
    const rateTo = (this.getRates()[curTo] || {}).rate;
    if (!rateTo) return null;
    return Math.round(rsdFrom / rateTo * 100) / 100;
  },

  async doTransfer(fromId, toId, amountOut, noteExtra, date, amountInOverride) {
    const cat = this.transferCategoryObj();
    const fromAcc = this.data.accounts.find(a => a.id === fromId);
    const toAcc = this.data.accounts.find(a => a.id === toId);
    if (!fromAcc || !toAcc || fromId === toId || isNaN(amountOut) || amountOut <= 0) return false;
    const curF = fromAcc.currency || 'RSD';
    const curT = toAcc.currency || 'RSD';
    let amountIn = amountInOverride;
    if (amountIn == null || isNaN(amountIn)) amountIn = this.convertBetweenCurrencies(amountOut, curF, curT);
    if (amountIn == null || isNaN(amountIn)) amountIn = amountOut;
    const pairId = 'pair-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const noteBase = 'Transfer ' + fromAcc.name + ' \u2192 ' + toAcc.name + (noteExtra ? ' \u00b7 ' + noteExtra : '');
    this.data.transactions.unshift({
      id: 'tx-' + Date.now() + '-a', type: 'expense', amount: -Math.abs(Math.round(amountOut * 100) / 100), currency: curF,
      accountId: fromId, categoryId: cat.id, date: date, note: noteBase, pairId: pairId
    });
    this.data.transactions.unshift({
      id: 'tx-' + Date.now() + '-b', type: 'income', amount: Math.abs(Math.round(amountIn * 100) / 100), currency: curT,
      accountId: toId, categoryId: cat.id, date: date, note: noteBase, pairId: pairId
    });
    await this.save();
    return true;
  },

  bindTransferForm() {
    const amtOut = document.getElementById('tr-amount');
    const amtIn = document.getElementById('tr-amount-in');
    amtOut.addEventListener('input', () => {
      const f = document.getElementById('tr-from');
      const t = document.getElementById('tr-to');
      const curF = (this.data.accounts.find(a => a.id === f.value) || {}).currency || 'RSD';
      const curT = (this.data.accounts.find(a => a.id === t.value) || {}).currency || 'RSD';
      const converted = this.convertBetweenCurrencies(parseFloat(amtOut.value), curF, curT);
      if (converted != null) amtIn.value = converted;
    });
    ['tr-from', 'tr-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.updateTransferCurrencyLabels();
        if (amtOut.value) amtOut.dispatchEvent(new Event('input'));
      });
    });
    document.getElementById('transfer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const from = document.getElementById('tr-from').value;
      const to = document.getElementById('tr-to').value;
      const amountOut = parseFloat(amtOut.value);
      const amountInRaw = amtIn.value.trim();
      const amountIn = amountInRaw === '' ? null : parseFloat(amountInRaw);
      const date = document.getElementById('tr-date').value || new Date().toISOString().slice(0, 10);
      const noteExtra = document.getElementById('tr-note').value.trim();
      const ok = await this.doTransfer(from, to, amountOut, noteExtra, date, amountIn);
      if (!ok) return;
      this.closeModal('transfer-modal');
      this.syncViewToDate(date);
      this.renderPage(this.currentPage);
    });
  },

  openEditTransaction(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) return;
    document.getElementById('tx-id').value = tx.id;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-type').value = tx.type;
    document.getElementById('tx-amount').value = Math.abs(tx.amount);
    document.getElementById('tx-currency').value = tx.currency;
    document.getElementById('tx-note').value = tx.note || '';
    document.getElementById('tx-account').innerHTML = (tx.cardId
      ? this.accountSelectOptions('card:' + tx.cardId)
      : this.accountSelectOptions(tx.accountId));
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    if (catInput && catHidden) { catHidden.value = tx.categoryId; const cat = this.data.categories.find(c => c.id === tx.categoryId); catInput.value = cat ? cat.name.toUpperCase() : ''; }
    this.openModal('transaction-modal');
    setTimeout(() => document.getElementById('tx-amount').focus(), 50);
    this.initCategoryPicker();
    this.bindQuickEntryExtras();
  },

  editHoveredTransaction() { if (this.hoveredTxId) this.openEditTransaction(this.hoveredTxId); },

  async deleteTransaction(txId) {
    const removed = this.data.transactions.find(t => t.id === txId);
    this.data.transactions = this.data.transactions.filter(t => t.id !== txId);
    try { await this.save(); } catch (e) { if (removed) this.data.transactions.push(removed); }
    this.renderPage(this.currentPage);
  },

  bindModalSubmit() {
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('tx-id').value;
      const rawParsed = parseFloat(document.getElementById('tx-amount').value.trim().replace(/\s+/g, '').replace(',', '.').replace(/^\+/, ''));
      if (isNaN(rawParsed)) { alert('Please enter a valid amount.'); return; }
      const rawAmt = Math.abs(Math.round(rawParsed * 100) / 100);
      const txType = document.getElementById('tx-type').value;
      const accountVal = document.getElementById('tx-account').value;
      const txData = { date: document.getElementById('tx-date').value, type: txType, amount: txType === 'income' ? rawAmt : -rawAmt, currency: document.getElementById('tx-currency').value, accountId: accountVal.startsWith('card:') ? null : accountVal, categoryId: document.getElementById('tx-category').value, note: document.getElementById('tx-note').value };
      const orig = id ? this.data.transactions.find(t => t.id === id) : null;
      if (orig && orig.cardId) { txData.cardId = orig.cardId; txData.accountId = null; }
      else if (accountVal.startsWith('card:')) { txData.cardId = accountVal.slice(5); }
      if (id) { const tx = this.data.transactions.find(t => t.id === id); if (tx) Object.assign(tx, txData); }
      else {
        txData.id = crypto.randomUUID(); this.data.transactions.push(txData);
      }
      this.syncViewToDate(txData.date);
      await this.save(); this.closeModal('transaction-modal'); this.renderPage(this.currentPage);
    });
  },

  bindBillModalSubmit() {
    document.getElementById('bill-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('bill-id').value;
      const billData = { name: document.getElementById('bill-name').value, amount: Math.round(parseFloat(document.getElementById('bill-amount').value) * 100) / 100, currency: document.getElementById('bill-currency').value, dueDay: parseInt(document.getElementById('bill-dueDay').value), categoryId: document.getElementById('bill-category').value, active: document.getElementById('bill-active').value === 'true', autopay: document.getElementById('bill-autopay').checked };
      if (id) { const bill = this.data.bills.find(b => b.id === id); if (bill) Object.assign(bill, billData); }
      else { billData.id = crypto.randomUUID(); this.data.bills.push(billData); }
      await this.save(); this.closeModal('bill-modal'); this.renderPage(this.currentPage);
    });
  },

  initCategoryPicker() {
    if (this._catPickBound) return;
    const input = document.getElementById('tx-category-input');
    const hidden = document.getElementById('tx-category');
    const dropdown = document.getElementById('category-dropdown');
    if (!input || !dropdown) return;
    this._catPickBound = true;

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

    input.addEventListener('click', openDropdown);
    input.addEventListener('focus', openDropdown);

    function openDropdown() {
      const cats = sortedCats();
      dropdown.innerHTML = cats.length ? cats.map(c =>
        '<div class="category-dropdown-item' + (c.id === hidden.value ? ' active' : '') + '" data-id="' + c.id + '"><span class="cat-dot" style="background:' + c.color + ';"></span>' + BlackBook.escapeHtml(c.name) + '</div>'
      ).join('') : '<div class="category-dropdown-empty">No categories yet</div>';
      const act = dropdown.querySelector('.category-dropdown-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
      dropdown.classList.remove('hidden');
    }

    input.addEventListener('wheel', (e) => { e.preventDefault(); cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cycle(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycle(-1); }
      else if (e.key === 'Escape') {
        if (!dropdown.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); }
        closeDropdown();
      } else if (e.key === 'Enter' && !dropdown.classList.contains('hidden')) {
        e.preventDefault(); e.stopPropagation(); closeDropdown();
      }
    });

    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.category-dropdown-item');
      if (!item || !item.dataset.id) return;
      pick(this.data.categories.find(c => c.id === item.dataset.id));
    });

    document.addEventListener('pointerdown', (e) => {
      if (dropdown.classList.contains('hidden')) return;
      const root = document.getElementById('category-autocomplete');
      if (!root || !root.contains(e.target)) closeDropdown();
    });
  },

  selectAccount(id) { this.selectedAccount = id; this.renderPage(this.currentPage); },
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

  cycleAccount() {
    const vis = this.visibleAccounts();
    if (vis.length === 0) return;
    if (!this.selectedAccount || !vis.some(a => a.id === this.selectedAccount)) { this.selectedAccount = vis[0].id; }
    else {
      const idx = vis.findIndex(a => a.id === this.selectedAccount);
      if (idx === -1 || idx === vis.length - 1) { this.selectedAccount = null; }
      else { this.selectedAccount = vis[idx + 1].id; }
    }
    this.renderPage(this.currentPage);
  },

  accountCardsHtml() {
    const allSelected = !this.selectedAccount;
    let html = '<div class="account-chips"><div class="account-chip' + (allSelected ? ' selected' : '') + '" onclick="BlackBook.selectAccount(null)"><span class="chip-name">OVERVIEW</span></div>';
    for (const a of this.visibleAccounts()) {
      const { amount: bal, currency } = this.accountBalanceNative(a.id);
      const sel = this.selectedAccount === a.id;
      html += '<div class="account-chip' + (sel ? ' selected' : '') + '" onclick="BlackBook.selectAccount(\x27' + a.id + '\x27)"><span class="chip-name">' + this.escapeHtml(a.name) + '</span><span class="chip-balance">' + this.fmtAmount(Math.abs(bal), currency) + '</span></div>';
    }
    return html + '</div>';
  },

  chartAccountsTx() {
    let txs = this.data.transactions.slice();
    if (this.activeFilters.accounts.length) txs = txs.filter(t => this.activeFilters.accounts.includes(t.accountId));
    return txs;
  },

  renderOverviewLineChart() {
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    const canvas = document.getElementById('overview-line-chart');
    if (!canvas) return;
    const year = this.vy();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const income = new Array(12).fill(0), expenses = new Array(12).fill(0);
    for (const tx of this.chartAccountsTx()) {
      const d = new Date(tx.date);
      if (d.getFullYear() !== year) continue;
      const m = d.getMonth(), rsd = this.toRsd(tx.amount, tx.currency);
      if (tx.type === 'income') income[m] += rsd; else expenses[m] += rsd;
    }
    this.overviewLineChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: months, datasets: [
        { label: 'Income', data: income, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)', tension: 0.3, fill: true },
        { label: 'Expenses', data: expenses, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)', tension: 0.3, fill: true }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'INCOME VS EXPENSES (' + year + ')', color: '#777777', font: { size: 12 } } }, scales: { x: { ticks: { color: '#555555' }, grid: { color: '#222222' } }, y: { ticks: { color: '#555555' }, grid: { color: '#222222' } } } }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => BlackBook.init());

window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.error || e.message);
});
