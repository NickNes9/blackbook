(function () {
Object.assign(window.BlackBook, {
  renderOverview() {
    const el = document.getElementById('page-overview');
    if (!this.data) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading...</div></div>'; return; }
    if (this.overviewPieChart) { this.overviewPieChart.destroy(); this.overviewPieChart = null; }
    if (this.overviewLineChart) { this.overviewLineChart.destroy(); this.overviewLineChart = null; }
    const hideGraph = !!(this.data.settings && this.data.settings.hideOverviewGraph);
    el.innerHTML = this.accountCardsHtml() + this.monthPickerHtml() + this.monthSummaryHtml() + this.categoryBreakdownHtml() +
      this.categoryFilterHtml() + '<div class="tx-list-wrap">' + this.recentTransactionsHtml() + '</div>' +
      (hideGraph
        ? '<div class="list-sep"></div><div class="graph-show-row"><button class="btn btn-sm btn-secondary" onclick="BlackBook.toggleOverviewGraph()">SHOW GRAPH</button></div>'
        : '<div class="list-sep"></div><div class="overview-charts"><div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">INCOME VS EXPENSES</span><button class="btn btn-sm btn-secondary" onclick="BlackBook.toggleOverviewGraph()" title="Hide graph (H)">HIDE</button></div><canvas id="overview-line-chart"></canvas></div></div>');
    this.bindBarTooltip(el);
    this.bindAccountsPanelDismiss();
    this.sizeAccountSquares();
    setTimeout(() => { if (this.visibleAccounts().length <= 5) { this.fitElems('.account-chip .chip-name'); this.fitElems('.account-chip .chip-balance'); } }, 20);
    if (!hideGraph) setTimeout(() => { this.renderOverviewLineChart(); }, 50);
  },

  sizeAccountSquares() {
    const chip = document.querySelector('.account-chip:not(.ov-chip):not(.account-mgr-square)');
    const ov = document.querySelector('.account-chip.ov-chip');
    const sq = document.querySelector('.account-chip.account-mgr-square');
    if (!chip || !ov || !sq) return;
    const side = Math.round(chip.getBoundingClientRect().height);
    if (!(side > 0)) return;
    [ov, sq].forEach(el => {
      el.style.width = side + 'px';
      el.style.height = side + 'px';
    });
  },

  toggleOvType(t) {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    const active = this.ovActiveTypes();
    if (active === t) {
      this._ovInc = false;
      this._ovExp = false;
    } else if (t === 'income') {
      this._ovInc = true;
      this._ovExp = false;
    } else {
      this._ovInc = false;
      this._ovExp = true;
    }
    this.renderPage('overview');
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  ovActiveTypes() {
    if (this._ovInc && this._ovExp) return null;
    if (this._ovInc) return 'income';
    if (this._ovExp) return 'expense';
    return null;
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
    const modes = ['date', 'value'];
    const idx = modes.indexOf(this._ovSortBy);
    this._ovSortBy = modes[(idx + 1) % modes.length];
    // Ensure default direction is desc when cycling
    if (!this._ovSortDir) this._ovSortDir = 'desc';
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

  monthSummaryHtml() {
    const year = this.vy(), month = this.vm();
    let income = 0, expenses = 0;
    for (const tx of this.data.transactions) {
      const { y, m } = this.ymOf(tx.date);
      if (this.isTransfer(tx)) continue;
      if (this._bulkSel && this._bulkSel.size && this._bulkOnly && !this._bulkSel.has(tx.id)) continue;
      if (y === year && m === month) {
        const rsd = this.toRsd(tx.amount, tx.currency);
        if (tx.type === 'income') income += Math.abs(rsd); else expenses += Math.abs(rsd);
      }
    }
    const sortLabel = this._ovSortBy === 'date' ? 'DATE' : this._ovSortBy === 'value' ? 'VALUE' : 'DATE';
    return '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(income) + '</span></div><div class="month-summary-item"><span class="month-summary-label">EXPENSES</span><span class="month-summary-value amount-negative">' + this.fmtRsd(expenses) + '</span></div><div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (income - expenses >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtRsd(income - expenses) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:6px;align-items:center;">' +
      (this._bulkSel && this._bulkSel.size ? '<div class="cat-filter-chip bulk-filter-chip' + (this._bulkOnly ? ' selected' : '') + '" onclick="BlackBook.toggleBulkOnly()">SELECTED (' + this._bulkSel.size + ')</div>' : '') +
      '<div class="cat-filter-chip' + (this._ovInc ? ' selected' : '') + '" onclick="BlackBook.toggleOvType(\x27income\x27)" title="Filter the graph and the list to income only">INCOME</div>' +
      '<div class="cat-filter-chip' + (this._ovExp ? ' selected' : '') + '" onclick="BlackBook.toggleOvType(\x27expense\x27)" title="Filter the graph and the list to expenses only">EXPENSES</div>' +
      '<button class="btn btn-sm btn-secondary ov-sort-cycle" onclick="BlackBook.cycleOvSort()" title="Cycle sort: Date → Value">' + sortLabel + '</button>' +
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
      if (this.isTransfer(tx)) continue;
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
      if (bill.amount == null) continue;
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
    const y = this.vy(), m = this.vm();
    const used = new Set();
    let hasTransfers = false;
    for (const tx of this.data.transactions) {
      const { y: ty, m: tm } = this.ymOf(tx.date);
      if (ty !== y || tm !== m) continue;
      if (tx.type === 'transfer') { hasTransfers = true; continue; }
      if (!tx.categoryId) continue;
      used.add(tx.categoryId);
    }
    let html = '<div class="cat-filter"><div class="cat-filter-chip' + (this.selectedCategory === null && !this._ovInc && !this._ovExp ? ' selected' : '') + '" onclick="BlackBook.selectCategory(null)">ALL</div>';
    if (hasTransfers) {
      const sel = this.selectedCategory === '__TRANSFER__';
      html += '<div class="cat-filter-chip' + (sel ? ' selected' : '') + '" style="--cc:#71717a;' + (sel ? 'background:#71717a;color:var(--on-fill);' : '') + '" onclick="BlackBook.selectCategory(\'__TRANSFER__\')">Transfer</div>';
    }
    const sorted = (this.data.categories || []).filter(c => used.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sorted) {
      const sel = this.selectedCategory === c.id;
      html += '<div class="cat-filter-chip' + (sel ? ' selected' : '') + '" style="--cc:' + c.color + ';' + (sel ? 'background:' + c.color + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.selectCategory(\x27' + c.id + '\x27)">' + this.escapeHtml(c.name) + '</div>';
    }
    return html + '</div>';
  },

  recentTransactionsHtml() {
    let txs = this.data.transactions.slice();
    
    // Apply sorting
    const sortBy = this._ovSortBy;
    const sortDir = this._ovSortDir || 'desc';
    const dirMult = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'date') {
      txs.sort((a, b) => dirMult * a.date.localeCompare(b.date));
    } else if (sortBy === 'value') {
      txs.sort((a, b) => dirMult * (Math.abs(this.toRsd(a.amount, a.currency)) - Math.abs(this.toRsd(b.amount, b.currency))));
    }
    
    if (this.selectedAccount) {
      txs = txs.filter(t => {
        if (t.type === 'transfer') return t.fromAccountId === this.selectedAccount || t.toAccountId === this.selectedAccount;
        return t.accountId === this.selectedAccount;
      });
    }
    if (this.selectedCategory) {
      if (this.selectedCategory === '__TRANSFER__') {
        txs = txs.filter(t => this.isTransfer(t));
      } else {
        txs = txs.filter(t => t.categoryId === this.selectedCategory);
      }
    }
    const typeFilter = this.ovActiveTypes();
    if (typeFilter) txs = txs.filter(t => t.type === typeFilter);
    txs = txs.filter(t => { const { y, m } = this.ymOf(t.date); return y === this.vy() && m === this.vm(); });
    if (this._bulkSel && this._bulkSel.size && this._bulkOnly) txs = txs.filter(t => this._bulkSel.has(t.id));
    if (!txs.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-text">No transactions this month. Press A to add one.</div></div>';
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
        rows += '<div class="tx-row tx-row-transfer' + (this._bulkSel && this._bulkSel.has(tx.id) ? ' bulk-selected' : '') + '" onclick="BlackBook.bulkToggle(\x27' + tx.id + '\x27, event.shiftKey)" onmouseenter="BlackBook.hoveredTxId=\x27' + tx.id + '\x27" onmouseleave="BlackBook.hoveredTxId=null"><span class="tx-num">' + rowNum + '</span><div class="tx-acct-stripe" style="background:' + shownAcc.color + '"><span class="tx-acct-label">' + this.escapeHtml(shownLabel) + '</span></div><span class="tx-date">' + this.fmtDateInput(tx.date) + '</span><span class="tx-cat" style="color:#71717a">Transfer</span><span class="tx-note">' + this.escapeHtml(tx.note || '') + '</span><span class="tx-actions" onclick="event.stopPropagation()"><button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditTransfer(\x27' + tx.id + '\x27)">EDIT</button><button class="btn btn-sm btn-danger" onclick="BlackBook.deleteTransaction(\x27' + tx.id + '\x27)">DEL</button></span><span class="tx-amt amt-transfer">' + amtDisplay + ' &#8594; ' + amtInDisplay + '</span></div>';
      } else {
        const card = tx.cardId ? cards[tx.cardId] : null;
        const acc = card
          ? { color: card.color || '#71717a', shortName: card.shortName || '?', name: card.name }
          : (accounts[tx.accountId] || { color: '#52525b', shortName: 'TR', name: 'Transfer' });
        const cat = categories[tx.categoryId] || { color: '#555555', name: '?' };
        const rsd = this.toRsd(tx.amount, tx.currency);
        const amtClass = tx.type === 'income' ? 'amt-income' : 'amt-expense';
        let wtClass = '';
        if (Math.abs(rsd) > 10000) wtClass = ' amt-heavy'; else if (Math.abs(rsd) > 5000) wtClass = ' amt-medium';
        const txCur = tx.currency || 'RSD';
        const accCur = card ? 'RSD' : ((accounts[tx.accountId] || {}).currency || 'RSD');
        const txAmtDisplay = this.fmtDualCurrency(tx.amount, txCur, accCur, tx.nativeAmount, tx.nativeCurrency);
        const editFn = card ? 'openEditCardTx' : 'openEditTransaction';
        rows += '<div class="tx-row' + (this._bulkSel && this._bulkSel.has(tx.id) ? ' bulk-selected' : '') + '" onclick="BlackBook.bulkToggle(\x27' + tx.id + '\x27, event.shiftKey)" onmouseenter="BlackBook.hoveredTxId=\x27' + tx.id + '\x27" onmouseleave="BlackBook.hoveredTxId=null"><span class="tx-num">' + rowNum + '</span><div class="tx-acct-stripe" style="background:' + acc.color + '"><span class="tx-acct-label">' + this.escapeHtml((acc.shortName || '?').toUpperCase()) + '</span></div><span class="tx-date">' + this.fmtDateInput(tx.date) + '</span><span class="tx-cat" style="color:' + cat.color + '">' + this.escapeHtml(cat.name) + '</span><span class="tx-note">' + this.escapeHtml(tx.note || '') + '</span><span class="tx-actions" onclick="event.stopPropagation()"><button class="btn btn-sm btn-secondary" onclick="BlackBook.' + editFn + '(\x27' + tx.id + '\x27)">EDIT</button><button class="btn btn-sm btn-danger" onclick="BlackBook.deleteTransaction(\x27' + tx.id + '\x27)">DEL</button></span><span class="tx-amt ' + amtClass + wtClass + '">' + txAmtDisplay + '</span></div>';
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

  accountCardsHtml() {
    const allSelected = !this.selectedAccount;
    const accts = this.visibleAccounts();
    const split = accts.length > 5;
    const chip = (a) => {
      const { amount: bal, currency } = this.accountBalanceNative(a.id);
      const sel = this.selectedAccount === a.id;
      const label = split ? (a.shortName || a.name || '?') : (a.name || a.shortName || '?');
      const compact = split ? ' chip-compact' : '';
      const full = a.name || label;
      const titleAttr = (split && full && full !== label ? full : '') + (a.description ? ((split && full && full !== label ? ' \u2014 ' : '') + a.description) : '');
      const amt = '<span class="chip-balance ' + (bal < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtAmount(bal, currency) + '</span>';
      return '<div class="account-chip' + (sel ? ' selected' : '') + compact + '" onclick="BlackBook.selectAccount(\x27' + a.id + '\x27)' + (titleAttr ? '" title="' + this.escapeHtml(titleAttr) : '') + '"><span class="chip-name">' + this.escapeHtml(label) + '</span>' + amt + '</div>';
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
    } else {
      html = '<div class="account-chips-row">' + overviewChip + accts.map(chip).join('') + squareChip + '</div>';
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
      return '<div class="ap-row' + dim + '"><span class="ap-swatch" style="background:' + (a.color || '#52525b') + '"></span>' +
        '<div class="ap-name-wrap"><span class="ap-name">' + this.escapeHtml(a.name) + '</span>' + desc + '</div>' +
        '<div class="ap-actions">' + up + down + eye + '</div></div>';
    }).join('');
    panel.innerHTML =
      '<div class="accounts-panel-head"><span>Accounts</span><button class="ap-btn" onclick="BlackBook.closeAccountsPanel()" title="Close">&times;</button></div>' +
      rows +
      '<div class="ap-footer"><button class="btn btn-sm btn-primary" onclick="BlackBook.closeAccountsPanel();BlackBook.openNewAccount()">+ ADD</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.closeAccountsPanel();BlackBook.navigateTo(\x27settings\x27)">MANAGE IN SETTINGS</button></div>';
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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const income = new Array(12).fill(0), expenses = new Array(12).fill(0);
    for (const tx of this.chartAccountsTx()) {
      if (this.isTransfer(tx)) continue;
      const d = new Date(tx.date);
      if (d.getFullYear() !== year) continue;
      const m = d.getMonth(), rsd = this.toRsd(tx.amount, tx.currency);
      if (tx.type === 'income') income[m] += rsd; else expenses[m] += rsd;
    }
    const incCol = this.data.settings.incomeColor || '#4ade80';
    const expCol = this.data.settings.expenseColor || '#f87171';
    const showIncome = !this._ovExp || this._ovInc;
    const showExpenses = !this._ovInc || this._ovExp;
    const datasets = [];
    if (showIncome) datasets.push({ label: 'Income', data: income, borderColor: incCol, backgroundColor: this.hexToRgba(incCol, 0.1), tension: 0.3, fill: true });
    if (showExpenses) datasets.push({ label: 'Expenses', data: expenses, borderColor: expCol, backgroundColor: this.hexToRgba(expCol, 0.1), tension: 0.3, fill: true });
    this.overviewLineChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: months, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 8, right: 8, top: 8, bottom: 8 } },
        plugins: { legend: { display: false }, title: { display: false } },
        scales: {
          x: {
            ticks: { color: '#888888', maxRotation: 0, autoSkip: false },
            grid: { color: '#2a2a2a', drawBorder: false },
            border: { display: false }
          },
          y: {
            ticks: { color: '#888888', callback: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k' : v },
            grid: { color: '#2a2a2a', drawBorder: false },
            border: { display: false }
          }
        }
      }
    });
  }
});
})();
