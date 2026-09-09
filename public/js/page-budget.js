(function () {
Object.assign(window.BlackBook, {
  renderBudget() {
    const el = document.getElementById('page-budget');
    if (!el) return;
    if (this.budgetChart) { this.budgetChart.destroy(); this.budgetChart = null; }
    if (!this.data.budgets) this.data.budgets = [];
    const hideGraph = !!(this.data.settings && this.data.settings.hideBudgetGraph);
    el.innerHTML = this.monthPickerHtml() +
      this.budgetSummaryHtml() +
      '<div class="list-sep"></div>' +
      '<div class="page-scroll-wrap">' + this.budgetCardsHtml() + '</div>' +
      (hideGraph
        ? ''
        : this.budgetChipsHtml() +
          '<div class="overview-charts"><div class="chart-panel chart-panel-full"><canvas id="budget-chart"></canvas></div></div>');
    if (!hideGraph) setTimeout(() => this.renderBudgetChart(), 50);
  },

  async toggleBudgetGraph() {
    this.data.settings.hideBudgetGraph = !(this.data.settings && this.data.settings.hideBudgetGraph);
    await this.save();
    this.renderPage('budget');
  },

  budgetChipsHtml() {
    const budgetMap = Object.fromEntries(this.data.budgets.map(b => [b.categoryId, b]));
    let html = '<div class="cat-filter">';
    const hc = this.data.settings.highlightColor || '#fa8c3c';
    const totOn = this._budgetTotalOn !== false;
    html += '<div class="cat-filter-chip' + (totOn ? ' selected' : '') + '" style="--cc:' + hc + ';' + (totOn ? 'background:' + hc + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.toggleBudgetTotal()" title="Monthly total spent line \u00b7 click to toggle">' +
      '<span style="' + (totOn ? '' : 'opacity:0.5;') + '">TOTAL</span></div>';
    for (const cat of this.sortedCategories()) {
      if (cat.name.toLowerCase() === 'transfer') continue;
      const color = this.categoryColor(cat);
      const b = budgetMap[cat.id];
      const on = !(this._budgetCatOff && this._budgetCatOff[cat.id]);
      const name = b && b.name ? b.name : cat.name;
      html += '<div class="cat-filter-chip' + (on ? ' selected' : '') + '" style="--cc:' + color + ';' + (on ? 'background:' + color + ';color:var(--on-fill);' : '') + (on ? '' : 'opacity:0.55;') + '" onclick="BlackBook.toggleBudgetCat(\x27' + cat.id + '\x27)" title="' + this.escapeHtml(name) + (b ? ' \u00b7 ' + this.fmtBase(b.amount) : ' \u00b7 NO LIMIT') + ' \u00b7 click to show/hide in graph">' + this.escapeHtml(name) + '</div>';
    }
    return html + '</div>';
  },

  toggleBudgetTotal() {
    this._budgetTotalOn = (this._budgetTotalOn === false);
    this.renderBudget();
  },

  toggleBudgetCat(catId) {
    if (!this._budgetCatOff) this._budgetCatOff = {};
    this._budgetCatOff[catId] = !this._budgetCatOff[catId];
    this.renderBudget();
  },

  budgetMonthlySpend() {
    const year = String(this.vy());
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(year + '-' + String(m).padStart(2, '0'));
    const totalSet = new Set(months);
    const byCat = {};
    const total = {};
    for (const mk of months) { total[mk] = 0; }
    for (const tx of this.data.transactions) {
      if (tx.type !== 'expense' || this.isTransfer(tx)) continue;
      const mk = String(tx.date || '').slice(0, 7);
      if (!totalSet.has(mk)) continue;
      const rsd = Math.abs(this.toBase(tx.amount, tx.currency));
      if (!byCat[tx.categoryId]) byCat[tx.categoryId] = {};
      byCat[tx.categoryId][mk] = (byCat[tx.categoryId][mk] || 0) + rsd;
      total[mk] += rsd;
    }
    return { months: months, byCat: byCat, total: total };
  },

  renderBudgetChart() {
    if (this.budgetChart) { this.budgetChart.destroy(); this.budgetChart = null; }
    const canvas = document.getElementById('budget-chart');
    if (!canvas) return;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const spend = this.budgetMonthlySpend();
    const datasets = [];
    if (this._budgetTotalOn !== false) {
      const hc = this.data.settings.highlightColor || '#fa8c3c';
      datasets.push({
        label: 'TOTAL',
        data: spend.months.map(mk => this.round2(spend.total[mk] || 0)),
        borderColor: hc,
        backgroundColor: hc,
        fill: false,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 2
      });
    }
    for (const cat of this.sortedCategories()) {
      if (this._budgetCatOff && this._budgetCatOff[cat.id]) continue;
      const b = this.data.budgets.find(x => x.categoryId === cat.id);
      const per = spend.byCat[cat.id] || {};
      datasets.push({
        label: b && b.name ? b.name : cat.name,
        data: spend.months.map(mk => this.round2(per[mk] || 0)),
        borderColor: this.categoryColor(cat),
        backgroundColor: this.categoryColor(cat),
        fill: false,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3
      });
    }
    this.budgetChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: MONTHS_S, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: {
            usePointStyle: true,
            boxPadding: 3,
            callbacks: {
              label: (c) => ' ' + c.dataset.label + ': ' + this.fmtNumber(c.parsed.y)
            }
          }
        },
        scales: {
          x: { ticks: { color: '#555555', autoSkip: false, maxRotation: 0, font: { size: 11 } }, grid: { color: '#141414' } },
          y: { ticks: { color: '#555555', font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: '#141414' } }
        }
      }
    });
  },

  budgetSummaryHtml() {
    const year = this.vy(), month = this.vm();
    const budgetedIds = new Set(this.data.budgets.map(b => b.categoryId));
    let totalBudgeted = 0;
    for (const b of this.data.budgets) { totalBudgeted += b.amount; }
    let used = 0;
    for (const tx of this.data.transactions) {
      if (tx.type !== 'expense') continue;
      if (!budgetedIds.has(tx.categoryId) || this.isTransfer(tx)) continue;
      const { y, m } = this.ymOf(tx.date);
      if (y === year && m === month) { used += Math.abs(this.toBase(tx.amount, tx.currency)); }
    }
    const totalRemaining = totalBudgeted - used;
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">TOTAL BUDGET</span><span class="month-summary-value">' + this.fmtBase(totalBudgeted) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">USED</span><span class="month-summary-value">' + this.fmtBase(used) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">REMAINING</span><span class="month-summary-value ' + (totalRemaining >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtBase(totalRemaining) + '</span></div>' +
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
      if (y === year && m === month) { catSpent[tx.categoryId] = (catSpent[tx.categoryId] || 0) + this.toBase(tx.amount, tx.currency); }
    }
    let html = '';
    const sorted = this.sortedCategories();
    const withBudget = sorted.filter(c => !!budgetMap[c.id]);
    const withoutBudget = sorted.filter(c => !budgetMap[c.id]);
    const allRows = withBudget.concat(withoutBudget);
    for (const cat of allRows) {
      const budget = budgetMap[cat.id];
      const spent = catSpent[cat.id] || 0;
      const amount = budget ? budget.amount : 0;
      const spentAbs = Math.abs(spent);
      const remaining = amount - spentAbs;
      const over = !!budget && remaining < 0;
      const pct = amount > 0 ? Math.round(spentAbs / amount * 100) : 0;
      const fillPct = Math.min(pct, 100);
      const catColor = this.categoryColor(cat);
      const budgetName = budget && budget.name ? budget.name : cat.name;
      const barValues = budget
        ? this.fmtBase(spentAbs) + '<span class="budget-bar-slash">/ ' + this.fmtBase(amount) + '</span>'
        : this.fmtBase(spentAbs);
      const barBg = over ? 'rgba(248,113,113,0.15)' : 'var(--surface-raised)';
      html += '<div class="budget-card">' +
        '<div class="budget-headrow">' +
        '<span class="budget-name-block">' +
        '<span class="cat-dot" style="background:' + catColor + ';"></span>' +
        '<span class="budget-name-text">' + this.escapeHtml(budgetName) + '</span>' +
        '</span>' +
        '<span class="bar-values-wrap"><div class="budget-bar' + (budget ? '' : ' budget-bar-none') + '" style="background:' + barBg + ';"><div class="budget-bar-fill' + (budget ? '' : ' budget-bar-fill-full') + ' ' + (over ? 'over' : '') + '" style="width:' + fillPct + '%;background:' + catColor + (over ? ';opacity:0.9' : '') + ';"></div><span class="budget-bar-values-unfilled' + (over ? ' amount-negative' : '') + '">' + barValues + '</span><span class="budget-bar-values-filled' + (over ? ' amount-negative' : '') + '" style="clip-path:inset(0 ' + (100 - fillPct) + '% 0 0);">' + barValues + '</span></div></span>' +
        '<span class="budget-pct' + (over ? ' over' : '') + '">' + (budget ? pct + '%' : '') + '</span>' +
        '<button class="btn btn-sm budget-edit ' + (budget ? 'btn-secondary' : 'btn-primary') + '" onclick="BlackBook.openBudgetModal(\x27' + cat.id + '\x27)">' + (budget ? 'EDIT' : 'SET') + '</button>' +
        '</div></div>';
    }
    return html || '<div class="empty-state"><div class="empty-state-text">No categories. Add categories in Settings first.</div></div>';
  },

  openBudgetModal(categoryId) {
    const cat = this.data.categories.find(c => c.id === categoryId);
    if (!cat) return;
    const budget = this.data.budgets.find(b => b.categoryId === categoryId);
    document.getElementById('budget-category-id').value = categoryId;
    document.getElementById('budget-category-name').value = cat.name;
    document.getElementById('budget-name').value = budget && budget.name ? budget.name : '';
    document.getElementById('budget-amount').value = budget ? budget.amount : '';
    this.openModal('budget-modal');
    setTimeout(() => document.getElementById('budget-amount').focus(), 50);
  },

  bindBudgetForm() {
    document.getElementById('budget-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const catId = document.getElementById('budget-category-id').value;
      const raw = document.getElementById('budget-amount').value.trim();
      const amount = this.evalAmount(raw);
      if (!catId) return;
      const existing = this.data.budgets.find(b => b.categoryId === catId);
      if (raw === '' || isNaN(amount) || amount <= 0) {
        if (existing) { this.data.budgets = this.data.budgets.filter(b => b !== existing); }
      } else if (existing) {
        existing.amount = amount;
        const customName = document.getElementById('budget-name').value.trim();
        if (customName) existing.name = customName; else delete existing.name;
      }
      else {
        const newBudget = { categoryId: catId, amount: amount };
        const customName = document.getElementById('budget-name').value.trim();
        if (customName) newBudget.name = customName;
        this.data.budgets.push(newBudget);
      }
      await this.save();
      this.closeModal('budget-modal');
      this.renderBudget();
    });
  },

  // ==================== BILLS ====================
});
})();
