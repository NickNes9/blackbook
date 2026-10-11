(function () {
Object.assign(window.BlackBook, {
  renderOverview() {
    const el = document.getElementById('page-overview');
    if (!this.data) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading...</div></div>'; return; }
    const chartHeights = this.captureChartPanelHeights(el);
    this.hideDonutTooltip();
    if (this.overviewPieChart) { this.overviewPieChart.destroy(); this.overviewPieChart = null; }
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    const hideGraph = !!(this.data.settings && this.data.settings.hideOverviewGraph);
    el.innerHTML = this.accountCardsHtml() + '<div class="list-sep overview-accounts-sep"></div>' + this.monthPickerHtml() + this.monthSummaryHtml() + this.categoryBreakdownHtml() +
      this.categoryFilterHtml() + this.selectedTransactionDetailsHtml() + '<div class="tx-list-wrap">' + this.recentTransactionsHtml() + '</div>' +
      (hideGraph
        ? ''
        : '<div class="list-sep"></div><div class="overview-charts with-donut"><div class="chart-panel donut-panel"><div class="chart-head-row"><span class="chart-title-text">' + (this._bulkOnly && this._bulkSel && this._bulkSel.size ? 'SELECTED THIS MONTH' : 'THIS MONTH') + '</span></div><div class="budget-donut-wrap"><canvas id="overview-donut-chart" aria-label="Income and expenses"></canvas><button id="overview-donut-toggle" class="overview-donut-toggle" type="button" onclick="BlackBook.toggleOverviewDonutPercent()" aria-label="Show expense percentage"></button></div></div><div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">' + (this._bulkOnly && this._bulkSel && this._bulkSel.size ? 'SELECTED BY DAY' : 'INCOME VS EXPENSES') + '</span></div><canvas id="overview-line-chart"></canvas></div></div>');
    this.restoreChartPanelHeights(el, chartHeights);
    const txWrap = el.querySelector('.tx-list-wrap');
    if (txWrap && txWrap.querySelector('.empty-state')) txWrap.classList.add('tx-list-wrap-empty');
    this.bindBarTooltip(el);
    this.bindAccountsPanelDismiss();
    this.sizeAccountSquares();
    if (this._accountChipObserver) this._accountChipObserver.disconnect();
    const chipList = el.querySelector('.account-chip-list');
    if (chipList && typeof ResizeObserver !== 'undefined') {
      this._accountChipObserver = new ResizeObserver(() => this.sizeAccountSquares());
      this._accountChipObserver.observe(chipList);
    }
    if (this._linkedTransactionFocusId) {
      const row = document.getElementById('tx-row-' + this._linkedTransactionFocusId);
      this._linkedTransactionFocusId = null;
      if (row) setTimeout(() => { try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 60);
    }
    if (!hideGraph) { this.renderOverviewLineChart(); this.renderOverviewDonut(); }
  },

  sizeAccountSquares() {
    const ov = document.querySelector('.account-chip.ov-chip');
    const sq = document.querySelector('.account-chip.account-mgr-square');
    if (!ov || !sq) return;
    let chip = document.querySelector('.account-chip:not(.ov-chip):not(.account-mgr-square)');
    let probe = null;
    if (!chip) {
      probe = document.createElement('div');
      probe.className = 'account-chip';
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.innerHTML = '<span class="chip-name">--</span><span class="chip-balance">--</span>';
      document.body.appendChild(probe);
      chip = probe;
    }
    const side = Math.round(chip.getBoundingClientRect().height);
    if (probe) probe.remove();
    if (!(side > 0)) return;
    [ov, sq].forEach(el => {
      el.style.width = side + 'px';
      el.style.height = side + 'px';
    });
    this.updateAccountChipFit();
  },

  updateAccountChipFit() {
    const wrapper = document.querySelector('.account-chips');
    const list = wrapper && wrapper.querySelector('.account-chip-list');
    if (!list) return;
    wrapper.classList.remove('account-chips-fit');
    wrapper.classList.add('account-chips-measure');
    const widths = Array.from(list.children).map(chip => chip.getBoundingClientRect().width);
    wrapper.classList.remove('account-chips-measure');
    wrapper.classList.toggle('account-chips-fit', !!widths.length && Math.max(...widths) * widths.length <= list.clientWidth);
  },

  cycleOvType() {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    const modes = [null, 'expense', 'income'];
    const idx = modes.indexOf(this.ovActiveTypes());
    const next = modes[(idx + 1) % modes.length];
    if (this._overviewCustomFilter?.profile === this.profile) this._overviewCustomFilter.filter.type = next || '';
    this._ovInc = next === 'income';
    this._ovExp = next === 'expense';
    this.renderPage('overview');
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  ovTypeLabel() {
    const t = this.ovActiveTypes();
    return t === 'income' ? 'INCOME' : t === 'expense' ? 'EXPENSES' : 'TYPE';
  },

  ovActiveTypes() {
    if (this._ovInc && this._ovExp) return null;
    if (this._ovInc) return 'income';
    if (this._ovExp) return 'expense';
    return null;
  },

  overviewChartVisibility() {
    const filter = this.ovActiveTypes();
    return { income: filter !== 'expense', expenses: filter !== 'income' };
  },

  setOvSortBy(field) {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    if (this._ovSortBy === field) {
      this._ovSortDir = this._ovSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._ovSortBy = field;
      this._ovSortDir = 'desc';
    }
    this.renderPage('overview');
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  toggleOvSortDir() {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    this._ovSortDir = this._ovSortDir === 'asc' ? 'desc' : 'asc';
    this.renderPage('overview');
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  cycleOvSort() {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    const modes = ['date', 'value', 'name'];
    const idx = modes.indexOf(this._ovSortBy);
    this._ovSortBy = modes[(idx + 1) % modes.length];
    this._ovSortDir = this._ovSortBy === 'name' ? 'asc' : 'desc';
    this.renderPage('overview');
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  async toggleOverviewGraph() {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    this.data.settings.hideOverviewGraph = !(this.data.settings && this.data.settings.hideOverviewGraph);
    await this.save();
    this.renderOverview();
    this.updateGraphFooter();
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  accountDetailHtml() {
    if (!this.selectedAccount) return '';
    const a = this.data.accounts.find(x => x.id === this.selectedAccount);
    if (!a) return '';
    const { amount: bal, currency } = this.accountBalanceNative(a.id);
    const txCount = this.data.transactions.filter(t => {
      if (t.type === 'transfer') return t.fromAccountId === a.id || t.toAccountId === a.id;
      return t.accountId === a.id;
    }).length;
    return '<div class="account-detail">' +
      '<div class="account-detail-header"><span class="account-detail-name">' + this.escapeHtml(a.name) + '</span>' +
      '<span class="account-detail-type">' + this.escapeHtml(a.currency) + ' ' + this.escapeHtml(a.type || 'cash') + '</span>' +
      '<span class="account-detail-balance ' + (bal >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtAmount(bal, currency) + '</span></div>' +
      '<div class="account-detail-meta">' + txCount + ' transactions</div>' +
      '</div>';
  },

  overviewMonthlyTotals() {
    const year = this.vy(), month = this.vm();
    let income = 0, expenses = 0;
    for (const tx of this.data.transactions) {
      if (!this.overviewCustomMatches(tx)) continue;
      const { y, m } = this.ymOf(tx.date);
      if (this.isTransfer(tx)) continue;
      if (this._bulkSel && this._bulkSel.size && this._bulkOnly && !this._bulkSel.has(tx.id)) continue;
      if (y === year && m === month) {
        const rsd = this.transactionToBase(tx);
        if (tx.type === 'income') income += Math.abs(rsd); else expenses += Math.abs(rsd);
      }
    }
    return { income, expenses };
  },

  monthEndBalanceAt() {
    const year = this.vy();
    const month = this.vm();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    if (this.selectedAccount) return this.accountBalanceNative(this.selectedAccount, endDate);
    const total = this.visibleAccounts().reduce((sum, account) => sum + this.accountBalance(account.id, endDate), 0);
    return { amount: total, currency: this.baseCurrency() };
  },

  monthSummaryHtml() {
    const { income, expenses } = this.overviewMonthlyTotals();
    const monthEnd = this.monthEndBalanceAt();
    const sortLabel = this._ovSortBy === 'date' ? 'DATE' : this._ovSortBy === 'value' ? 'VALUE' : this._ovSortBy === 'name' ? 'NAME' : 'DATE';
    const mergeButton = this._bulkSel && this._bulkSel.size >= 2
      ? '<button class="btn btn-sm btn-primary page-control ov-merge-selected" onclick="BlackBook.openMergeModal()">MERGE SELECTED</button>'
      : '';
    return '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtBase(income) + '</span></div><div class="month-summary-item"><span class="month-summary-label">EXPENSES</span><span class="month-summary-value amount-negative">' + this.fmtBase(expenses) + '</span></div><div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (income - expenses >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtBase(income - expenses) + '</span></div><div class="month-summary-item month-end-balance"><span class="month-summary-label">END OF MONTH</span><span class="month-summary-value ' + (monthEnd.amount >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtAmount(monthEnd.amount, monthEnd.currency) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:6px;align-items:center;">' +
      (this._bulkSel && this._bulkSel.size ? '<div class="cat-filter-chip bulk-filter-chip' + (this._bulkOnly ? ' selected' : '') + '" onclick="BlackBook.toggleBulkOnly()">SELECTED (' + this._bulkSel.size + ')</div>' : '') +
      mergeButton +
      '<button class="btn btn-sm ' + (this._overviewCustomFilter?.profile === this.profile && this._overviewCustomFilter ? 'btn-primary' : 'btn-secondary') + ' page-control" onclick="BlackBook.toggleOverviewFindReplace()" title="' + (this._overviewCustomFilter?.profile === this.profile && this._overviewCustomFilter ? 'Custom filter active · click to clear' : 'Find and preview transaction changes') + '">FIND &amp; REPLACE</button>' +
      '<button class="btn btn-sm btn-secondary page-control ov-type-cycle" onclick="BlackBook.cycleOvType()" title="Cycle filter: Type → Expenses → Income">' + this.ovTypeLabel() + '</button>' +
      '<button class="btn btn-sm btn-secondary page-control ov-sort-cycle" onclick="BlackBook.cycleOvSort()" title="Cycle sort: Date → Value → Name">' + sortLabel + '</button>' +
      '<button class="btn btn-sm btn-secondary ov-sort-dir" onclick="BlackBook.toggleOvSortDir()" title="' + (this._ovSortDir === 'asc' ? 'Descending' : 'Ascending') + '">' + (this._ovSortDir === 'asc' ? '&#9650;' : '&#9660;') + '</button>' +
      '</span></div>';
  },

  toggleBulkOnly() {
    if (!this._bulkSel || !this._bulkSel.size) { this._bulkOnly = false; return; }
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    this._bulkOnly = !this._bulkOnly;
    this.renderPage('overview');
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  categoryBreakdownHtml() {
    const year = this.vy(), month = this.vm();
    const filter = this.ovActiveTypes();
    const catTotals = {};
    const catCounts = {};
    for (const tx of this.data.transactions) {
      if (!this.overviewCustomMatches(tx)) continue;
      const { y, m } = this.ymOf(tx.date);
      if (this.isTransfer(tx)) continue;
      if (y === year && m === month && (!filter || tx.type === filter)) {
        const value = this.transactionToBase(tx);
        const amount = filter ? Math.abs(value) : (tx.type === 'expense' ? -Math.abs(value) : Math.abs(value));
        catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + amount;
        catCounts[tx.categoryId] = (catCounts[tx.categoryId] || 0) + 1;
      }
    }
    const entries = Object.entries(catTotals).filter(([, amt]) => Math.abs(amt) > 0.000001).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const cats = Object.fromEntries(this.data.categories.map(c => [c.id, c]));
    const total = entries.reduce((s, e) => s + Math.abs(e[1]), 0);
    let segments = '';
    if (entries.length) {
      const FLOOR = 0.4;
      let widths = entries.map(([, amt]) => Math.max(Math.abs(amt) / total * 100, FLOOR));
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
        const pct = total > 0 ? Math.abs(amt) / total * 100 : 0;
        const showText = w > 9;
        const displayAmount = filter ? amt : (amt < 0 ? -Math.abs(amt) : amt);
        segments += '<div class="cat-stacked-segment" style="left:' + offset.toFixed(3) + '%;width:' + Math.max(w - 0.15, 0.2).toFixed(3) + '%;background:' + this.categoryColor(cat) + ';" data-name="' + this.escapeHtml(cat.name) + '" data-amt="' + this.fmtBase(displayAmount) + '" data-pct="' + Math.round(pct * 10) / 10 + '" data-count="' + (catCounts[catId] || 0) + '"><span class="cat-seg-inner">' + (showText ? this.fmtBase(displayAmount) : '') + '</span></div>';
        offset += w;
      });
    } else {
      segments = '<div class="cat-bar-empty">NO ' + (this.ovActiveTypes() === 'income' ? 'INCOME' : this.ovActiveTypes() === 'expense' ? 'EXPENSES' : 'ACTIVITY') + ' THIS MONTH</div>';
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
      if (this.isTransfer(tx)) continue;
      const d = new Date(tx.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const rsd = this.transactionToBase(tx);
        if (tx.type === 'income') monthlyIncome += rsd; else monthlyExpenses += rsd;
      }
    }
    const savingsRate = monthlyIncome > 0 ? Math.round((monthlyIncome - monthlyExpenses) / monthlyIncome * 1000) / 10 : 0;
    let upcomingBillCount = 0, upcomingBillTotal = 0;
    const todayDate = now.getDate();
    for (const bill of this.data.bills) {
      if (!bill.active) continue;
      if (bill.amount == null) continue;
      let due = new Date(now.getFullYear(), now.getMonth(), Math.min(Number(bill.dueDay) || 1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
      if (bill.frequency === 'annual') {
        const dueMonth = (Number(bill.dueMonth) || 1) - 1;
        due = new Date(now.getFullYear(), dueMonth, Math.min(Number(bill.dueDay) || 1, new Date(now.getFullYear(), dueMonth + 1, 0).getDate()));
        if (due < new Date(now.getFullYear(), now.getMonth(), now.getDate())) due.setFullYear(due.getFullYear() + 1);
      } else if (due < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        due = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(Number(bill.dueDay) || 1, new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()));
      }
      const daysAway = Math.round((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      if (daysAway <= 7) { upcomingBillCount++; upcomingBillTotal += this.toBase(bill.amount, bill.currency); }
    }
    return '<div class="metrics-grid">' +
      '<div class="metric-panel"><div class="metric-title">NET WORTH</div><div class="metric-value ' + (netWorth >= 0 ? 'metric-positive' : 'metric-negative') + '">' + this.fmtBase(netWorth) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">CASH AVAILABLE</div><div class="metric-value ' + (cashAvailable >= 0 ? 'metric-positive' : 'metric-negative') + '">' + this.fmtBase(cashAvailable) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">MONTHLY INCOME</div><div class="metric-value metric-positive">' + this.fmtBase(monthlyIncome) + '</div><div class="metric-subtitle">' + now.toLocaleString('en', { month: 'long', year: 'numeric' }) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">MONTHLY EXPENSES</div><div class="metric-value metric-negative">' + this.fmtBase(monthlyExpenses) + '</div><div class="metric-subtitle">' + now.toLocaleString('en', { month: 'long', year: 'numeric' }) + '</div></div>' +
      '<div class="metric-panel"><div class="metric-title">SAVINGS RATE</div><div class="metric-value ' + (savingsRate >= 20 ? 'metric-positive' : savingsRate >= 0 ? '' : 'metric-negative') + '">' + savingsRate + '%</div><div class="metric-subtitle">of income saved</div></div>' +
      '<div class="metric-panel"><div class="metric-title">UPCOMING BILLS</div><div class="metric-value">' + upcomingBillCount + '</div><div class="metric-subtitle">' + (upcomingBillTotal > 0 ? this.fmtBase(upcomingBillTotal) + ' due soon' : 'No bills due') + '</div></div></div>';
  },

  categoryFilterHtml() {
    const y = this.vy(), m = this.vm();
    const used = new Set();
    let hasTransfers = false;
    let hasTransactions = false;
    for (const tx of this.data.transactions) {
      if (!this.overviewCustomMatches(tx)) continue;
      const { y: ty, m: tm } = this.ymOf(tx.date);
      if (ty !== y || tm !== m) continue;
      if (this.selectedAccount && !(tx.accountId === this.selectedAccount || tx.cardId === this.selectedAccount || tx.fromAccountId === this.selectedAccount || tx.toAccountId === this.selectedAccount)) continue;
      hasTransactions = true;
      if (tx.type === 'transfer') { hasTransfers = true; continue; }
      if (!tx.categoryId) continue;
      used.add(tx.categoryId);
    }
    if (!hasTransactions) return '';
    const selected = this.selectedCategories;
    let html = '<div class="cat-filter"><div class="cat-filter-chip' + (!selected && !this._ovInc && !this._ovExp ? ' selected' : '') + '" onclick="BlackBook.selectCategory(null, event)" title="Show all categories">ALL</div>';
    if (hasTransfers) {
      const sel = selected && selected.has('__TRANSFER__');
      html += '<div class="cat-filter-chip' + (sel ? ' selected' : '') + '" style="--cc:#71717a;' + (sel ? 'background:#71717a;color:var(--on-fill);' : '') + '" onclick="BlackBook.selectCategory(\'__TRANSFER__\', event)" title="Click: show only · Shift-click: add/remove · Alt-click: isolate">Transfer</div>';
    }
    const sorted = (this.data.categories || []).filter(c => used.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sorted) {
      const sel = selected && selected.has(c.id);
      html += '<div class="cat-filter-chip' + (sel ? ' selected' : '') + '" style="--cc:' + this.categoryColor(c) + ';' + (sel ? 'background:' + this.categoryColor(c) + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.selectCategory(\x27' + c.id + '\x27, event)" title="Click: show only · Shift-click: add/remove · Alt-click: isolate">' + this.escapeHtml(c.name) + '</div>';
    }
    return html + '</div>';
  },

  selectedTransactionDetailsHtml() {
    if (!this._bulkOnly || !this._bulkSel || !this._bulkSel.size) return '';
    const month = this.vy() + '-' + String(this.vm() + 1).padStart(2, '0');
    const selected = this.data.transactions.filter(tx => this._bulkSel.has(tx.id) && String(tx.date || '').startsWith(month));
    if (!selected.length) return '';
    return '<div class="selected-transaction-details"><span class="selected-transaction-details-label">SELECTED DETAILS</span>' + selected.map(tx =>
      '<span class="selected-transaction-detail"><span>' + this.escapeHtml(this.fmtDateInput(tx.date)) + '</span><span class="selected-transaction-note">' + this.transactionDescriptionHtml(tx, 'No note') + '</span><span>' + this.fmtAmount(tx.amount, tx.currency || this.baseCurrency()) + '</span></span>'
    ).join('') + '</div>';
  },

  overviewCategoryMatches(tx) {
    const selected = this.selectedCategories;
    if (!selected || !selected.size) return true;
    if (this.isTransfer(tx)) return selected.has('__TRANSFER__');
    return selected.has(tx.categoryId);
  },

  recentTransactionsHtml() {
    let txs = this.data.transactions.filter(tx => this.overviewCustomMatches(tx));
    const linkedFocusTx = this._linkedTransactionFocusId
      ? txs.find(tx => tx.id === this._linkedTransactionFocusId)
      : null;
    
    // Apply sorting
    const sortBy = this._ovSortBy;
    const sortDir = this._ovSortDir || 'desc';
    const dirMult = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'date') {
      txs.sort((a, b) => dirMult * a.date.localeCompare(b.date));
    } else if (sortBy === 'value') {
      txs.sort((a, b) => dirMult * (Math.abs(this.transactionToBase(a)) - Math.abs(this.transactionToBase(b))));
    } else if (sortBy === 'name') {
      txs.sort((a, b) => {
        const aHasDescription = Boolean(String(a.note || '').trim());
        const bHasDescription = Boolean(String(b.note || '').trim());
        if (aHasDescription !== bHasDescription) return aHasDescription ? -1 : 1;
        return dirMult * String(a.note || '').localeCompare(String(b.note || ''), undefined, { sensitivity: 'base' }) || String(b.date || '').localeCompare(String(a.date || ''));
      });
    }
    
    if (this.selectedAccount) {
      txs = txs.filter(t => {
        if (t.type === 'transfer') return t.fromAccountId === this.selectedAccount || t.toAccountId === this.selectedAccount;
        return t.accountId === this.selectedAccount;
      });
    }
    txs = txs.filter(t => this.overviewCategoryMatches(t));
    const typeFilter = this.ovActiveTypes();
    if (typeFilter) txs = txs.filter(t => t.type === typeFilter);
    txs = txs.filter(t => { const { y, m } = this.ymOf(t.date); return y === this.vy() && m === this.vm(); });
    if (this._bulkSel && this._bulkSel.size && this._bulkOnly) txs = txs.filter(t => this._bulkSel.has(t.id));
    if (linkedFocusTx) txs = [linkedFocusTx, ...txs.filter(tx => tx.id !== linkedFocusTx.id)];
    if (!txs.length) {
      const noAccs = this.visibleAccounts().length + (this.data.creditCards || []).length === 0;
      return '<div class="empty-state" style="padding:20px"><div class="empty-state-text">' + (noAccs ? 'No accounts yet — create one to get started.' : 'No transactions this month. Press A to add one.') + '</div>' + (noAccs ? '<div style="margin-top:14px"><button class="btn btn-primary" onclick="BlackBook.openNewAccount()">CREATE FIRST ACCOUNT</button></div>' : '') + '</div>';
    }
    const accounts = Object.fromEntries(this.data.accounts.map(a => [a.id, a]));
    const cards = Object.fromEntries((this.data.creditCards || []).map(c => [c.id, c]));
    const categories = Object.fromEntries(this.data.categories.map(c => [c.id, c]));
    let rows = '';
    let rowNum = 0;
    for (const tx of txs) {
      rowNum++;
      if (tx.type === 'transfer') {
        const fromAcc = accounts[tx.fromAccountId] || { color: '#52525b', shortName: '?', name: '?' };
        const toAcc = accounts[tx.toAccountId] || { color: '#52525b', shortName: '?', name: '?' };
        let shownAcc = toAcc;
        if (this.selectedAccount && (tx.fromAccountId === this.selectedAccount || tx.toAccountId === this.selectedAccount)) {
          shownAcc = tx.fromAccountId === this.selectedAccount ? toAcc : fromAcc;
        }
        const shownLabel = (shownAcc.shortName || shownAcc.name || '?').toUpperCase();
        const amtDisplay = this.fmtDualCurrency(tx.amount, tx.currency, tx.currency, null, null);
        const amtInDisplay = tx.amountIn != null ? this.fmtDualCurrency(tx.amountIn, tx.currencyIn || tx.currency, tx.currencyIn || tx.currency, null, null) : amtDisplay;
        rows += '<div id="tx-row-' + this.escapeHtml(tx.id) + '" class="tx-row tx-row-transfer' + (this._linkedTransactionFocusId === tx.id ? ' linked-transaction-focus' : '') + (this._bulkSel && this._bulkSel.has(tx.id) ? ' bulk-selected' : '') + '" onclick="BlackBook.bulkToggle(\x27' + tx.id + '\x27, event.shiftKey)" onmouseenter="BlackBook.hoveredTxId=\x27' + tx.id + '\x27" onmouseleave="BlackBook.hoveredTxId=null"><span class="tx-num">' + rowNum + '</span><div class="tx-acct-stripe" style="background:' + this.accountColor(shownAcc) + '"><span class="tx-acct-label">' + this.escapeHtml(shownLabel) + '</span></div><span class="tx-date">' + this.fmtDateInput(tx.date) + '</span><span class="tx-cat" style="color:#71717a">Transfer</span><span class="tx-note">' + this.transactionDescriptionHtml(tx) + this.healthMarker('transactions', tx.id) + '</span><span class="tx-actions" onclick="event.stopPropagation()">' + '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditTransfer(\x27' + tx.id + '\x27)">EDIT</button><button class="btn btn-sm btn-danger btn-icon" title="Delete transaction" onclick="BlackBook.deleteTransaction(\x27' + tx.id + '\x27)">' + this.xIcon() + '</button></span><span class="tx-amt amt-transfer">' + amtDisplay + ' &#8594; ' + amtInDisplay + '</span></div>';
      } else {
        const card = tx.cardId ? cards[tx.cardId] : null;
        const acc = card
          ? { shortName: card.shortName || '?', name: card.name }
          : (accounts[tx.accountId] || { shortName: 'TR', name: 'Transfer' });
        const cat = categories[tx.categoryId] || { name: '?' };
        const rsd = this.transactionToBase(tx);
        const amtClass = tx.type === 'income' ? 'amt-income' : 'amt-expense';
        let wtClass = '';
        if (Math.abs(rsd) > 10000) wtClass = ' amt-heavy'; else if (Math.abs(rsd) > 5000) wtClass = ' amt-medium';
        const txCur = tx.currency || this.baseCurrency() || 'RSD';
        const accCur = card ? (card.currency || this.baseCurrency()) : ((accounts[tx.accountId] || {}).currency || this.baseCurrency() || 'RSD');
        const txAmtDisplay = this.fmtDualCurrency(tx.amount, txCur, accCur, tx.nativeAmount, tx.nativeCurrency);
        const editFn = card ? 'openEditCardTx' : 'openEditTransaction';
        let billChip = '';
        let catLink = '';
        const ltype = this.linkedRecordType(tx);
        if (ltype) {
          let label = '';
          let full = '';
          if (ltype === 'bill') {
            const lBill = this.linkedBillForTx(tx);
            if (lBill) { label = lBill.name; full = 'Linked to bill: ' + lBill.name; }
          } else if (ltype === 'debt') {
            const lDebt = this.debtForPaymentTx(tx.id);
            if (lDebt) { label = (lDebt.type === 'in' ? '\u2192 ' : '\u2190 ') + (lDebt.person || ''); full = 'Linked to debt: ' + (lDebt.person || ''); }
          } else if (ltype === 'invoice') {
            const lInv = this.invoiceForPaymentTx(tx.id);
            if (lInv) { label = (lInv.invoice.number || lInv.invoice.party || 'invoice'); full = 'Linked to invoice: ' + (lInv.invoice.number || lInv.invoice.party || ''); }
          } else if (ltype === 'savings') {
            const lSav = this.savingsForTx(tx.id);
            if (lSav) { label = lSav.goal.name || 'savings'; full = 'Linked to savings: ' + (lSav.goal.name || ''); }
          } else if (ltype === 'card') {
            const lCard = this.cardById && this.cardById(tx.cardId);
            label = (lCard ? lCard.name : 'card') + (tx.installId ? ' (plan)' : '');
            full = 'Linked to credit card' + (tx.installId ? ' purchase plan' : '');
          }
          if (label) {
            billChip = '<button class="bill-link-chip is-linked" title="' + this.escapeHtml(full) + '" onclick="event.stopPropagation();BlackBook.navigateToRecord(\x27' + ltype + '\x27,\x27' + tx.id + '\x27)">' + this.escapeHtml(label) + '</button>';
            catLink = '<span class="tx-link-badge" style="color:' + this.categoryColor(cat) + '" title="' + this.escapeHtml(full) + '">' + this.transactionLinkIcon() + '</span>';
          }
        } else if (tx.type === 'expense') {
          const mBill = this.matchingUnpaidBill(tx);
          if (mBill) billChip = '<button class="btn btn-sm bill-link-chip" title="Match unpaid bill: ' + this.escapeHtml(mBill.name) + '" onclick="event.stopPropagation();BlackBook.linkTxToBill(\x27' + tx.id + '\x27)">BILL: ' + this.escapeHtml(mBill.name) + '</button>';
        }
        rows += '<div id="tx-row-' + this.escapeHtml(tx.id) + '" class="tx-row' + (this._linkedTransactionFocusId === tx.id ? ' linked-transaction-focus' : '') + (this._bulkSel && this._bulkSel.has(tx.id) ? ' bulk-selected' : '') + '" onclick="BlackBook.bulkToggle(\x27' + tx.id + '\x27, event.shiftKey)" onmouseenter="BlackBook.hoveredTxId=\x27' + tx.id + '\x27" onmouseleave="BlackBook.hoveredTxId=null"><span class="tx-num">' + rowNum + '</span><div class="tx-acct-stripe" style="background:' + this.accountColor(acc) + '"><span class="tx-acct-label">' + this.escapeHtml((acc.shortName || '?').toUpperCase()) + '</span></div><span class="tx-date">' + this.fmtDateInput(tx.date) + '</span><span class="tx-cat" style="color:' + this.categoryColor(cat) + '">' + this.escapeHtml(cat.name) + catLink + this.healthMarker('transactions', tx.id) + '</span><span class="tx-note">' + this.transactionDescriptionHtml(tx) + '</span><span class="tx-actions" onclick="event.stopPropagation()">' + billChip + '<button class="btn btn-sm btn-secondary" onclick="BlackBook.' + editFn + '(\x27' + tx.id + '\x27)">EDIT</button><button class="btn btn-sm btn-danger btn-icon" title="Delete transaction" onclick="BlackBook.deleteTransaction(\x27' + tx.id + '\x27)">' + this.xIcon() + '</button></span><span class="tx-amt ' + amtClass + wtClass + '">' + txAmtDisplay + '</span></div>';
      }
    }
    return '<div class="tx-list">' + rows + '</div>';
  },









  // ==================== BUDGET ====================

  selectAccount(id) { this.selectedAccount = id; this.renderPage(this.currentPage); },
  cycleAccount(dir) {
    dir = dir || 1;
    const vis = this.visibleAccounts();
    if (vis.length === 0) return;
    const states = [null].concat(vis.map(a => a.id));
    const cur = (!this.selectedAccount || !vis.some(a => a.id === this.selectedAccount)) ? null : this.selectedAccount;
    const idx = cur ? states.indexOf(cur) : 0;
    this.selectedAccount = states[(idx + dir + states.length) % states.length];
    this.renderPage(this.currentPage);
  },

  accountChipAmount(amount, currency) {
    return this.fmtAmount(amount, currency).replace(/\.00(?=\s|$)/, '');
  },

  accountCardsHtml() {
    const allSelected = !this.selectedAccount;
    const accts = this.visibleAccounts();
    const split = false;
    const chip = (a) => {
      const { amount: bal, currency } = this.accountBalanceNative(a.id);
      const sel = this.selectedAccount === a.id;
      const full = a.name || a.shortName || '?';
      const short = a.shortName || String(full).trim().slice(0, 3) || '?';
      const label = full;
      const compact = '';
      const titleAttr = full + (a.description ? ' \u2014 ' + a.description : '');
      const amt = '<span class="chip-balance ' + (bal < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.accountChipAmount(bal, currency) + '</span>';
      return '<div class="account-chip' + (sel ? ' selected' : '') + compact + '" onclick="BlackBook.selectAccount(\x27' + a.id + '\x27)" title="' + this.escapeHtml(titleAttr) + '"><span class="chip-name"><span class="account-name-full">' + this.escapeHtml(label) + '</span><span class="account-name-short">' + this.escapeHtml(short) + '</span></span>' + amt + '</div>';
    };
    const overviewChip = '<div class="account-chip ov-chip' + (allSelected ? ' selected' : '') + '" onclick="BlackBook.selectAccount(null)" title="All accounts"><span class="ov-triangle"></span></div>';
    const squareChip = '<div class="account-chip account-mgr-square" onclick="BlackBook.toggleAccountsPanel(event)" title="Manage accounts"><span class="mgr-lines"><i></i><i></i><i></i></span></div>';

    let html;
    if (split) {
      const rowGroups = [];
      for (let i = 0; i < accts.length; i += 5) rowGroups.push(accts.slice(i, i + 5));
      rowGroups[0].unshift(null); // placeholder for OVERVIEW at start of first row
      rowGroups[rowGroups.length - 1].push('__SQUARE__');
      html = rowGroups.map(r => '<div class="account-chips-row">' + r.map((x) => {
        if (x === null) return overviewChip;
        if (x === '__SQUARE__') return squareChip;
        return chip(x);
      }).join('') + '</div>').join('');
    } else if (accts.length === 0) {
      html = '<div class="account-chips-row">' + overviewChip + '<div class="account-chip-list"></div>' + squareChip + '</div>';
    } else {
      html = '<div class="account-chips-row">' + overviewChip + '<div class="account-chip-list">' + accts.map(chip).join('') + '</div>' + squareChip + '</div>';
    }
    return '<div class="account-chips">' + html + '</div>';
  },

  toggleAccountsPanel(ev) {
    if (ev) { ev.stopPropagation(); }
    this._accountsPanelOpen = !this._accountsPanelOpen;
    this.syncAccountsPanel();
  },

  bindAccountsPanelDismiss() {
    if (this._accountsPanelDismissBound) return;
    this._accountsPanelDismissBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (!this._accountsPanelOpen) return;
      if (e.target.closest('.account-mgr-square')) return;
      if (e.target.closest('.accounts-panel')) return;
      this.closeAccountsPanel();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._accountsPanelOpen) this.closeAccountsPanel();
    });
  },

  syncAccountsPanel() {
    const container = document.querySelector('.account-chips');
    if (!container) return;
    let panel = document.getElementById('accounts-panel');
    if (this._accountsPanelOpen) {
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'accounts-panel';
        panel.className = 'accounts-panel';
        container.appendChild(panel);
      }
      this.renderAccountsPanel(panel);
    } else if (panel) {
      panel.remove();
      panel = null;
    }
  },

  renderAccountsPanel(panel) {
    const accts = this.data.accounts.filter(a => a.type !== 'credit' && a.type !== 'creditcard');
    const rows = accts.map((a, i) => {
      const dim = a.hidden ? ' ap-dim' : '';
      const eyeSvg = '<svg class="ap-eye" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 4.5C6.5 4.5 1.8 9.5 0.3 12 1.8 14.5 6.5 19.5 12 19.5s10.2-5 11.7-7.5C22.2 9.5 17.5 4.5 12 4.5z M12 14.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></svg>';
      const eye = a.hidden
        ? '<button class="ap-btn ap-hidden" title="Show account" onclick="BlackBook.setAccountHidden(\x27' + a.id + '\x27,false)">' + eyeSvg + '</button>'
        : '<button class="ap-btn" title="Hide account" onclick="BlackBook.setAccountHidden(\x27' + a.id + '\x27,true)">' + eyeSvg + '</button>';
      const up = i > 0 ? '<button class="ap-btn" title="Move up" onclick="BlackBook.moveAccount(\x27' + a.id + '\x27,-1)">&#9650;</button>' : '<span class="ap-btn" style="opacity:0.3">&#9650;</span>';
      const down = i < accts.length - 1 ? '<button class="ap-btn" title="Move down" onclick="BlackBook.moveAccount(\x27' + a.id + '\x27,1)">&#9660;</button>' : '<span class="ap-btn" style="opacity:0.3">&#9660;</span>';
      const desc = a.description ? '<div class="ap-desc">' + this.escapeHtml(a.description) + '</div>' : '';
      return '<div class="ap-row' + dim + '"><span class="ap-swatch" style="background:' + this.accountColor(a) + '"></span>' +
        '<div class="ap-name-wrap"><span class="ap-name">' + this.escapeHtml(a.name) + '</span>' + desc + '</div>' +
        '<div class="ap-actions">' + up + down + eye + '</div></div>';
    }).join('');
    panel.innerHTML =
      '<div class="accounts-panel-head"><span>Accounts</span><button class="ap-btn" onclick="BlackBook.closeAccountsPanel()" title="Close">&times;</button></div>' +
      rows +
      '<div class="ap-footer"><button class="btn btn-sm btn-primary" onclick="BlackBook.closeAccountsPanel();BlackBook.openNewAccount()">+ ADD</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.closeAccountsPanel();BlackBook.navigateTo(\x27settings\x27)">MANAGE IN SETTINGS</button>' +
      '<button class="btn btn-sm btn-secondary yearly-balances-open" onclick="BlackBook.openYearlyBalances()">YEARLY BALANCES</button></div>';
  },

  yearlyBalanceAccounts() {
    return (this.data.accounts || []).filter(account => account.type !== 'credit' && account.type !== 'creditcard');
  },

  yearlyBalanceYears(accountId = null) {
    const dates = [];
    const relevant = tx => !accountId || tx.accountId === accountId || tx.fromAccountId === accountId || tx.toAccountId === accountId;
    for (const tx of this.data.transactions || []) {
      if (!relevant(tx)) continue;
      const parts = typeof this.transactionBalanceParts === 'function' ? this.transactionBalanceParts(tx) : [tx];
      for (const part of (Array.isArray(parts) ? parts : [tx])) if (/^\d{4}-\d{2}-\d{2}$/.test(part.date || '')) dates.push(part.date);
    }
    for (const checkpoint of this.data.balanceCheckpoints || []) {
      if ((!accountId || checkpoint.accountId === accountId) && /^\d{4}-\d{2}-\d{2}$/.test(checkpoint.date || '')) dates.push(checkpoint.date);
    }
    const currentYear = Number(String(this.today()).slice(0, 4));
    const firstYear = dates.length ? Math.min(currentYear, ...dates.map(date => Number(date.slice(0, 4)))) : currentYear;
    return Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i);
  },

  yearlyBalanceFor(account, year) {
    const priorYearEnd = String(year - 1) + '-12-31';
    const startDate = String(year) + '-01-01';
    const endDate = year === Number(String(this.today()).slice(0, 4)) ? this.today() : String(year) + '-12-31';
    const prior = this.accountBalanceNative(account.id, priorYearEnd);
    const opening = (this.data.transactions || []).filter(tx => tx.accountId === account.id && tx.date === startDate && tx.balanceCorrection && tx.balanceCorrection.kind === 'opening')
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const end = this.accountBalanceNative(account.id, endDate);
    const currency = account.currency || prior.currency || this.baseCurrency();
    const checkpoints = this.data.balanceCheckpoints || [];
    const openingRecorded = checkpoints.some(cp => cp.accountId === account.id && cp.date === startDate && cp.kind === 'opening');
    const currentRecorded = year === Number(String(this.today()).slice(0, 4)) && checkpoints.some(cp => cp.accountId === account.id && cp.date === endDate && cp.kind === 'current');
    return { year, accountId: account.id, accountName: account.name, currency, start: prior.amount + opening, end: end.amount, change: end.amount - prior.amount - opening, startDate, endDate, openingRecorded, currentRecorded };
  },

  yearlyBalanceToBase(amount, currency) {
    const value = Number(amount);
    const base = this.baseCurrency();
    if (!Number.isFinite(value)) return null;
    if (value === 0 || !currency || currency === base) return value;
    const rates = this.getRates();
    const rateFrom = currency === 'EUR' ? 1 : Number((rates[currency] || {}).rate);
    const rateTo = base === 'EUR' ? 1 : Number((rates[base] || {}).rate);
    if (!Number.isFinite(rateFrom) || rateFrom <= 0 || !Number.isFinite(rateTo) || rateTo <= 0) return null;
    const converted = this.convertBetweenCurrencies(value, currency, base);
    return Number.isFinite(converted) ? converted : null;
  },

  yearlyBalanceAggregate(accounts, year) {
    let start = 0, end = 0;
    const excluded = [];
    for (const account of accounts) {
      const row = this.yearlyBalanceFor(account, year);
      const convertedStart = this.yearlyBalanceToBase(row.start, row.currency);
      const convertedEnd = this.yearlyBalanceToBase(row.end, row.currency);
      if (convertedStart == null || convertedEnd == null) {
        if (row.start !== 0 || row.end !== 0) excluded.push(account.id);
        continue;
      }
      start += convertedStart;
      end += convertedEnd;
    }
    return { year, start, end, change: end - start, excluded };
  },

  yearlyBalanceCheckpointNote(accounts) {
    const ids = new Set(accounts.map(account => account.id));
    const checkpoints = this.data.balanceCheckpoints || [];
    const hasOpening = checkpoints.some(cp => ids.has(cp.accountId) && cp.kind === 'opening');
    const currentRecorded = checkpoints.some(cp => ids.has(cp.accountId) && cp.kind === 'current' && cp.date === this.today());
    const parts = [];
    if (hasOpening) parts.push('Opening checkpoint recorded; applied before January 1 activity');
    if (currentRecorded) parts.push('current balance checkpoint recorded');
    return parts.join(' · ');
  },

  openYearlyBalances() {
    this.closeAccountsPanel();
    this._yearlyBalanceMode = 'total';
    this._yearlyVisibleAccounts = new Set(this.yearlyBalanceAccounts().map(account => account.id));
    let modal = document.getElementById('yearly-balances-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'yearly-balances-modal';
      modal.className = 'modal hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'yearly-balances-title');
      modal.innerHTML = '<div class="modal-backdrop" onclick="BlackBook.closeYearlyBalances()"></div><div class="modal-content wide yearly-balances-content"><div class="modal-header"><h2 id="yearly-balances-title">Yearly balances</h2><button class="modal-close" type="button" onclick="BlackBook.closeYearlyBalances()" aria-label="Close">×</button></div><div class="yearly-balances-controls"><label for="yearly-balances-account">Account</label><select id="yearly-balances-account" class="input" onchange="BlackBook.renderYearlyBalances()"></select><button id="yearly-balances-mode" class="btn btn-sm btn-secondary yearly-mode-toggle" type="button" onclick="BlackBook.toggleYearlyBalanceMode()" aria-label="Switch between total and accounts views"></button></div><div class="yearly-balances-chart-wrap"><canvas id="yearly-balances-chart" aria-label="Yearly balance graph"></canvas><div id="yearly-balances-chart-empty" class="yearly-balances-empty" hidden></div></div><div id="yearly-balances-account-series" class="yearly-balances-account-series" role="group" aria-label="Accounts shown in graph"></div><div id="yearly-balances-summary" class="yearly-balances-summary"></div><div id="yearly-balances-context" class="yearly-balances-context" role="status"></div><section id="yearly-balances-history" class="yearly-balances-history" aria-label="Yearly balance history"></section></div>';
      document.body.appendChild(modal);
      this._yearlyBalanceModalObserver = new MutationObserver(() => {
        if (modal.classList.contains('hidden') && this.yearlyBalanceChart) { this.yearlyBalanceChart.destroy(); this.yearlyBalanceChart = null; }
      });
      this._yearlyBalanceModalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    const select = document.getElementById('yearly-balances-account');
    const selected = this.selectedAccount && this.yearlyBalanceAccounts().some(a => a.id === this.selectedAccount) ? this.selectedAccount : '';
    select.innerHTML = '<option value="">All accounts</option>' + this.yearlyBalanceAccounts().map(a => '<option value="' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + ' · ' + this.escapeHtml(a.currency || this.baseCurrency()) + '</option>').join('');
    select.value = selected;
    this.renderYearlyBalances();
    this.openModal('yearly-balances-modal');
    select.focus();
  },

  renderYearlyBalances() {
    const select = document.getElementById('yearly-balances-account');
    const summary = document.getElementById('yearly-balances-summary');
    const context = document.getElementById('yearly-balances-context');
    const history = document.getElementById('yearly-balances-history');
    const seriesEl = document.getElementById('yearly-balances-account-series');
    const modeButton = document.getElementById('yearly-balances-mode');
    if (!select || !summary || !context || !history || !seriesEl || !modeButton) return;
    if (this.yearlyBalanceChart) { this.yearlyBalanceChart.destroy(); this.yearlyBalanceChart = null; }
    const accountId = select.value || null;
    const allAccounts = this.yearlyBalanceAccounts();
    const accounts = accountId ? allAccounts.filter(a => a.id === accountId) : allAccounts;
    const accountMode = !!accountId;
    const viewMode = accountMode ? 'account' : (this._yearlyBalanceMode || 'total');
    const modal = document.getElementById('yearly-balances-modal');
    modal.classList.toggle('yearly-all-view', !accountMode);
    modal.classList.toggle('yearly-account-view', accountMode);
    modeButton.hidden = accountMode;
    modeButton.textContent = viewMode === 'accounts' ? 'ACCOUNTS' : 'TOTAL';
    modeButton.setAttribute('aria-label', 'Switch to ' + (viewMode === 'accounts' ? 'total' : 'accounts') + ' view');
    modeButton.setAttribute('aria-pressed', viewMode === 'accounts' ? 'true' : 'false');
    const years = this.yearlyBalanceYears(accountId);
    const currentYear = Number(String(this.today()).slice(0, 4));
    const graphEmpty = document.getElementById('yearly-balances-chart-empty');
    const canvas = document.getElementById('yearly-balances-chart');
    const base = this.baseCurrency();
    const chartStyles = getComputedStyle(document.documentElement);
    const startColor = chartStyles.getPropertyValue('--text-dim').trim() || '#7a7a7a';
    const endColor = chartStyles.getPropertyValue('--accent').trim() || '#fa8c3c';
    let datasets = [], currency = base, excluded = new Set();
    history.hidden = accountMode ? false : true;
    seriesEl.hidden = accountMode;
    seriesEl.classList.toggle('is-placeholder', !accountMode && viewMode !== 'accounts');
    if (accountMode) {
      const account = accounts[0];
      if (!account) { summary.innerHTML = '<div class="yearly-balances-empty">No account history is available.</div>'; }
      else {
        currency = account.currency || base;
        const current = this.yearlyBalanceFor(account, currentYear);
        summary.innerHTML = this.yearlyBalanceSummaryHtml(current.start, current.end);
        datasets = [
          { label: 'Start', data: years.map(year => this.yearlyBalanceFor(account, year).start), borderColor: startColor },
          { label: 'End', data: years.map(year => this.yearlyBalanceFor(account, year).end), borderColor: endColor }
        ];
        const notes = [];
        if (current.openingRecorded) notes.push('Opening checkpoint recorded before January 1 activity.');
        if (current.currentRecorded) notes.push('Current checkpoint recorded.');
        context.textContent = ['Amounts in ' + currency + '.', 'Current through ' + this.fmtDateInput(this.today()) + '.', ...notes].join(' ');
        context.title = context.textContent;
        history.innerHTML = this.yearlyBalanceHistoryHtml(years.map(year => this.yearlyBalanceFor(account, year)));
      }
      seriesEl.innerHTML = '';
    } else if (viewMode === 'total') {
      const aggregates = years.map(year => this.yearlyBalanceAggregate(allAccounts, year));
      const current = aggregates.find(row => row.year === currentYear) || { start: 0, end: 0, excluded: [] };
      summary.innerHTML = this.yearlyBalanceSummaryHtml(current.start, current.end);
      datasets = [
        { label: 'Start', data: aggregates.map(row => row.start), borderColor: startColor },
        { label: 'End', data: aggregates.map(row => row.end), borderColor: endColor }
      ];
      for (const row of aggregates) row.excluded.forEach(id => excluded.add(id));
      const excludedNames = [...excluded].map(id => allAccounts.find(account => account.id === id)).filter(Boolean).map(account => account.name || account.shortName || 'Account');
      context.textContent = 'Current through ' + this.fmtDateInput(this.today()) + '. Converted at current rates · ' + base + (excludedNames.length ? ' · Missing rates: ' + excludedNames.length + ' account(s) omitted.' : '');
      context.title = excludedNames.length ? 'Missing rates; omitted: ' + excludedNames.join(', ') : context.textContent;
      history.innerHTML = '';
      seriesEl.innerHTML = '';
    } else {
      const chosen = this._yearlyVisibleAccounts || new Set(allAccounts.map(account => account.id));
      const selected = allAccounts.filter(account => chosen.has(account.id));
      const cards = allAccounts.map(account => '<button type="button" class="cat-filter-chip yearly-account-toggle' + (chosen.has(account.id) ? ' selected' : '') + '" style="--cc:' + this.escapeHtml(this.accountColor(account)) + ';" aria-pressed="' + (chosen.has(account.id) ? 'true' : 'false') + '" title="Click or Shift-click to toggle; Alt-click to isolate" onclick="BlackBook.toggleYearlyAccountSeries(\x27' + this.escapeHtml(account.id) + '\x27,event)">' + this.escapeHtml(account.name || account.shortName || 'Account') + '</button>').join('');
      seriesEl.innerHTML = cards;
      const currentAggregate = this.yearlyBalanceAggregate(selected, currentYear);
      summary.innerHTML = selected.length ? this.yearlyBalanceSummaryHtml(currentAggregate.start, currentAggregate.end) : '';
      datasets = selected.map(account => ({
        label: account.name || account.shortName || 'Account',
        data: years.map(year => {
          const amount = this.yearlyBalanceFor(account, year).end;
          const converted = this.yearlyBalanceToBase(amount, account.currency || base);
          if (converted == null && amount !== 0) { excluded.add(account.id); return null; }
          return converted;
        }),
        borderColor: this.accountColor(account),
        backgroundColor: this.accountColor(account),
        tension: 0.25,
        cubicInterpolationMode: 'monotone',
        spanGaps: false
      }));
      currentAggregate.excluded.forEach(id => excluded.add(id));
      const notes = [];
      const checkpointNote = this.yearlyBalanceCheckpointNote(selected);
      if (checkpointNote) notes.push(checkpointNote + '.');
      notes.push('Current through ' + this.fmtDateInput(this.today()) + '. Converted at current rates · ' + base);
      let excludedNames = [];
      if (excluded.size) {
        excludedNames = [...excluded].map(id => allAccounts.find(account => account.id === id)).filter(Boolean).map(account => account.name || account.shortName || 'Account');
        notes.push('Missing rates: ' + excludedNames.length + ' account(s) omitted.');
      }
      context.textContent = notes.join(' ');
      context.title = excludedNames.length ? 'Missing rates; omitted: ' + excludedNames.join(', ') : context.textContent;
      history.innerHTML = '';
    }
    const noAccountHistory = !accountMode && allAccounts.length === 0;
    if (noAccountHistory) { summary.innerHTML = '<div class="yearly-balances-empty">No accounts are available for a balance summary.</div>'; context.textContent = ''; context.title = ''; datasets = []; }
    const noAccounts = !accountMode && viewMode === 'accounts' && !(this._yearlyVisibleAccounts && this._yearlyVisibleAccounts.size);
    graphEmpty.hidden = datasets.length > 0 && !noAccounts;
    graphEmpty.textContent = noAccountHistory ? 'Add an account to see yearly balances.' : noAccounts ? 'Select one or more accounts below the graph.' : (!accounts.length ? 'No account balance history is available.' : 'No graphable balances yet.');
    canvas.hidden = graphEmpty.hidden === false;
    if (!years.length || !datasets.length || noAccounts || (accountMode && !accounts.length)) return;
    const options = this.lineChartOptions();
    options.plugins.legend.display = false;
    options.plugins.legend.position = 'bottom';
    options.plugins.legend.labels = { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() };
    options.plugins.tooltip.external = ({ chart, tooltip }) => {
      const points = tooltip.dataPoints || [];
      const label = points.length ? [tooltip.title && tooltip.title[0], ...points.map(point => point.dataset.label + ': ' + this.fmtNumber(point.parsed.y) + ' ' + currency)].filter(Boolean).join('\n') : '';
      this.showDonutTooltip(chart, tooltip, label);
    };
    options.scales.x.ticks.color = chartStyles.getPropertyValue('--text-muted').trim();
    options.scales.y.ticks.color = chartStyles.getPropertyValue('--text-muted').trim();
    options.scales.x.grid.color = chartStyles.getPropertyValue('--text-muted').trim();
    options.scales.y.grid.color = chartStyles.getPropertyValue('--text-muted').trim();
    options.scales.x.grid.lineWidth = 1;
    options.scales.y.grid.lineWidth = 1;
    if (!accountMode && viewMode === 'accounts') options.plugins.legend.display = false;
    this.yearlyBalanceChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: years.map(String), datasets: datasets.map(dataset => ({ ...dataset, backgroundColor: dataset.backgroundColor || dataset.borderColor, cubicInterpolationMode: 'monotone', tension: dataset.tension == null ? 0.25 : dataset.tension })) },
      options
    });
  },

  yearlyBalanceSummaryHtml(start, end) {
    const change = end - start;
    const amount = (value, signed = false) => '<span class="' + (value < 0 ? 'amount-negative' : 'amount-positive') + '">' + (signed && value > 0 ? '+' : '') + this.fmtNumber(value) + '</span>';
    return '<div class="yearly-summary-item"><span>START</span>' + amount(start) + '</div><div class="yearly-summary-item"><span>CURRENT</span>' + amount(end) + '</div><div class="yearly-summary-item"><span>CHANGE</span>' + amount(change, true) + '</div>';
  },

  yearlyBalanceHistoryHtml(rows) {
    if (!rows.length) return '<div class="yearly-balances-empty">No account balance history is available yet.</div>';
    const ordered = rows.slice().sort((a, b) => b.year - a.year);
    return '<table class="yearly-balances-table"><thead><tr><th>Year</th><th>Start</th><th>End / Current</th><th>Change</th></tr></thead><tbody>' + ordered.map(row => '<tr><th scope="row">' + row.year + '</th><td>' + this.fmtNumber(row.start) + '</td><td>' + this.fmtNumber(row.end) + '</td><td class="' + (row.change < 0 ? 'amount-negative' : 'amount-positive') + '">' + (row.change > 0 ? '+' : '') + this.fmtNumber(row.change) + '</td></tr>').join('') + '</tbody></table>';
  },

  toggleYearlyBalanceMode() {
    this._yearlyBalanceMode = this._yearlyBalanceMode === 'accounts' ? 'total' : 'accounts';
    this.renderYearlyBalances();
  },

  toggleYearlyAccountSeries(id, event) {
    const all = this.yearlyBalanceAccounts();
    const selected = this._yearlyVisibleAccounts || new Set(all.map(account => account.id));
    if (event && event.altKey) this._yearlyVisibleAccounts = new Set([id]);
    else {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this._yearlyVisibleAccounts = next;
    }
    this.renderYearlyBalances();
  },

  closeYearlyBalances() {
    if (this.yearlyBalanceChart) { this.yearlyBalanceChart.destroy(); this.yearlyBalanceChart = null; }
    this.closeModal('yearly-balances-modal');
  },

  closeAccountsPanel() {
    this._accountsPanelOpen = false;
    this.syncAccountsPanel();
  },

  async setAccountHidden(id, hidden) {
    const acc = this.data.accounts.find(a => a.id === id);
    if (!acc) return;
    acc.hidden = !!hidden;
    if (this.selectedAccount === id) this.selectedAccount = null;
    await this.save();
    this.renderPage(this.currentPage);
    this.syncAccountsPanel();
  },

  renderOverviewLineChart() {
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    const canvas = document.getElementById('overview-line-chart');
    if (!canvas) return;
    const year = this.vy();
    const dailySelection = !!(this._bulkOnly && this._bulkSel && this._bulkSel.size);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const bucketCount = dailySelection ? new Date(year, this.vm() + 1, 0).getDate() : 12;
    const labels = dailySelection ? Array.from({ length: bucketCount }, (_, index) => String(index + 1)) : months;
    const income = new Array(bucketCount).fill(0), expenses = new Array(bucketCount).fill(0);
    for (const tx of this.chartAccountsTx()) {
      if (this.isTransfer(tx)) continue;
      const d = new Date(tx.date);
      if (d.getFullYear() !== year) continue;
      if (dailySelection && d.getMonth() !== this.vm()) continue;
      const index = dailySelection ? d.getDate() - 1 : d.getMonth();
      const rsd = Math.abs(this.transactionToBase(tx));
      if (tx.type === 'income') income[index] += rsd; else expenses[index] -= rsd;
    }
    const incCol = this.data.settings.incomeColor || '#4ade80';
    const expCol = this.data.settings.expenseColor || '#f87171';
    const visible = this.overviewChartVisibility();
    const datasets = [];
    if (visible.income) datasets.push({ label: 'Income', data: income, borderColor: incCol, backgroundColor: incCol, fill: { target: 'origin', above: this.hexToRgba(incCol, 0.1), below: this.hexToRgba(incCol, 0.1) }, tension: 0.3, cubicInterpolationMode: 'monotone' });
    if (visible.expenses) datasets.push({ label: 'Expenses', data: expenses, borderColor: expCol, backgroundColor: expCol, fill: { target: 'origin', above: this.hexToRgba(expCol, 0.1), below: this.hexToRgba(expCol, 0.1) }, tension: 0.3, cubicInterpolationMode: 'monotone' });
    this.overviewLineChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: datasets },
      options: this.lineChartOptions(dailySelection ? { autoSkip: true, maxTicksLimit: 8 } : {})
    });
  },
  renderOverviewDonut() {
    const canvas = document.getElementById('overview-donut-chart');
    if (!canvas) return;
    const { income, expenses } = this.overviewMonthlyTotals();
    const total = income + expenses;
    const empty = !(total > 0);
    const labels = empty ? ['No activity'] : ['Income', 'Expenses'];
    const values = empty ? [1] : [income, expenses];
    const colors = empty ? ['#454545'] : [this.data.settings.incomeColor || '#4ade80', this.data.settings.expenseColor || '#f87171'];
    this.updateOverviewDonutPercent(income, expenses);
    this.overviewPieChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: this.donutDisplayValues(values), backgroundColor: colors, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), borderWidth: 1, hoverOffset: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: ({ chart, tooltip }) => {
          const point = tooltip.dataPoints && tooltip.dataPoints[0];
          const index = point && point.dataIndex;
          this.showDonutTooltip(chart, tooltip, !empty && index != null
            ? labels[index] + ': ' + this.fmtBase(values[index]) + ' · ' + this.round2(values[index] / total * 100) + '%' : '');
        } } } }
    });
  },
  toggleOverviewDonutPercent() {
    this._overviewDonutSide = this._overviewDonutSide === 'expenses' ? 'income' : 'expenses';
    const totals = this.overviewMonthlyTotals();
    this.updateOverviewDonutPercent(totals.income, totals.expenses);
  },
  updateOverviewDonutPercent(income, expenses) {
    const button = document.getElementById('overview-donut-toggle');
    if (!button) return;
    const side = this._overviewDonutSide === 'expenses' ? 'expenses' : 'income';
    const total = income + expenses;
    const pct = total > 0 ? Math.round((side === 'income' ? income : expenses) / total * 100) + '%' : '—';
    button.textContent = pct;
    button.style.color = side === 'income' ? (this.data.settings.incomeColor || '#4ade80') : (this.data.settings.expenseColor || '#f87171');
    button.setAttribute('aria-label', (total > 0 ? side + ' ' + pct + '. ' : 'No income or expenses. ') + 'Click to show ' + (side === 'income' ? 'expense' : 'income') + ' percentage');
  }
});
})();
