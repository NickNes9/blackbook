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
    if (!hideGraph) setTimeout(() => { this.renderOverviewLineChart(); }, 50);
  },

  toggleOvType(t) {
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
  },

  ovActiveTypes() {
    if (this._ovInc && this._ovExp) return null;
    if (this._ovInc) return 'income';
    if (this._ovExp) return 'expense';
    return null;
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
      if (y === year && m === month) {
        const rsd = this.toRsd(tx.amount, tx.currency);
        if (tx.type === 'income') income += Math.abs(rsd); else expenses += Math.abs(rsd);
      }
    }
    return '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(income) + '</span></div><div class="month-summary-item"><span class="month-summary-label">EXPENSES</span><span class="month-summary-value amount-negative">' + this.fmtRsd(expenses) + '</span></div><div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (income - expenses >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtRsd(income - expenses) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:6px;align-items:center;">' +
      '<div class="cat-filter-chip' + (this._ovInc ? ' selected' : '') + '" onclick="BlackBook.toggleOvType(\x27income\x27)" title="Filter the graph and the list to income only">INCOME</div>' +
      '<div class="cat-filter-chip' + (this._ovExp ? ' selected' : '') + '" onclick="BlackBook.toggleOvType(\x27expense\x27)" title="Filter the graph and the list to expenses only">EXPENSES</div>' +
      '</span></div>';
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
    const allCat = !this.selectedCategory;
    const y = this.vy(), m = this.vm();
    const used = new Set();
    for (const tx of this.data.transactions) {
      if (this.isTransfer(tx) || !tx.categoryId) continue;
      const { y: ty, m: tm } = this.ymOf(tx.date);
      if (ty === y && tm === m) used.add(tx.categoryId);
    }
    let html = '<div class="cat-filter"><div class="cat-filter-chip' + (allCat ? ' selected' : '') + '" onclick="BlackBook.selectCategory(null)">ALL</div>';
    const sorted = this.data.categories.filter(c => used.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sorted) {
      const sel = this.selectedCategory === c.id;
      html += '<div class="cat-filter-chip' + (sel ? ' selected' : '') + '" style="--cc:' + c.color + ';' + (sel ? 'background:' + c.color + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.selectCategory(\x27' + c.id + '\x27)">' + this.escapeHtml(c.name) + '</div>';
    }
    return html + '</div>';
  },

  recentTransactionsHtml() {
    let txs = this.data.transactions.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (this.selectedAccount) txs = txs.filter(t => t.accountId === this.selectedAccount);
    if (this.selectedCategory) txs = txs.filter(t => t.categoryId === this.selectedCategory);
    const typeFilter = this.ovActiveTypes();
    if (typeFilter) txs = txs.filter(t => t.type === typeFilter);
    txs = txs.filter(t => { const { y, m } = this.ymOf(t.date); return y === this.vy() && m === this.vm(); });
    if (!txs.length) return '<div class="empty-state" style="padding:20px"><div class="empty-state-text">No transactions this month. Press A to add one.</div></div>';
    const accounts = Object.fromEntries(this.data.accounts.map(a => [a.id, a]));
    const cards = Object.fromEntries((this.data.creditCards || []).map(c => [c.id, c]));
    const categories = Object.fromEntries(this.data.categories.map(c => [c.id, c]));
    let rows = '';
    for (const tx of txs) {
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
      rows += '<div class="tx-row' + (this._bulkSel && this._bulkSel.has(tx.id) ? ' bulk-selected' : '') + '" onclick="BlackBook.bulkToggle(\x27' + tx.id + '\x27)" onmouseenter="BlackBook.hoveredTxId=\x27' + tx.id + '\x27" onmouseleave="BlackBook.hoveredTxId=null"><div class="tx-acct-stripe" style="background:' + acc.color + '"><span class="tx-acct-label">' + this.escapeHtml((acc.shortName || '?').toUpperCase()) + '</span></div><span class="tx-date">' + tx.date + '</span><span class="tx-cat" style="color:' + cat.color + '">' + this.escapeHtml(cat.name) + '</span><span class="tx-note">' + this.escapeHtml(tx.note || '') + '</span><span class="tx-actions" onclick="event.stopPropagation()"><button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditTransaction(\x27' + tx.id + '\x27)">EDIT</button><button class="btn btn-sm btn-danger" onclick="BlackBook.deleteTransaction(\x27' + tx.id + '\x27)">DEL</button></span><span class="tx-amt ' + amtClass + wtClass + '">' + txAmtDisplay + '</span></div>';
    }
    let html = '<div class="tx-list">' + rows + '</div>';
    if (this._bulkSel && this._bulkSel.size) {
      html += '<div class="bulk-bar"><span class="bulk-count">' + this._bulkSel.size + ' SELECTED</span>' +
        '<button class="btn btn-sm btn-primary" onclick="BlackBook.openBulkEdit()">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.bulkDelete()">DELETE</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.bulkClear()">CLEAR</button></div>';
    }
    return html;
  },









  // ==================== BUDGET ====================

  selectAccount(id) { this.selectedAccount = id; this.renderPage(this.currentPage); },
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
      html += '<div class="account-chip' + (sel ? ' selected' : '') + '" onclick="BlackBook.selectAccount(\x27' + a.id + '\x27)"><span class="chip-name">' + this.escapeHtml(a.name) + '</span><span class="chip-balance ' + (bal < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtAmount(bal, currency) + '</span></div>';
    }
    return html + '</div>';
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
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: false } }, scales: { x: { ticks: { color: '#555555' }, grid: { color: '#222222' } }, y: { ticks: { color: '#555555' }, grid: { color: '#222222' } } } }
    });
  }
});
})();
