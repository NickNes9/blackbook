(function () {
Object.assign(window.BlackBook, {
  budgetAllocationMonth() {
    return String(this.vy()) + '-' + String(this.vm() + 1).padStart(2, '0');
  },

  monthlyBudgetView() {
    return BudgetAllocator.monthlyView(this.data.budgets || [], this.data.budgetAllocations || [],
      this.budgetAllocationMonth(), this.categoriesVisibleInMonth(this.budgetAllocationMonth()).map(c => c.id));
  },

  renderBudget() {
    const el = document.getElementById('page-budget');
    if (!el) return;
    this.hideDonutTooltip();
    if (this.budgetChart) { this.budgetChart.destroy(); this.budgetChart = null; }
    if (this.budgetDonutChart) { this.budgetDonutChart.destroy(); this.budgetDonutChart = null; }
    if (!this.data.budgets) this.data.budgets = [];
    if (!this.data.budgetAllocations) this.data.budgetAllocations = [];
    const hideGraph = !!(this.data.settings && this.data.settings.hideBudgetGraph);
    el.innerHTML = this.monthPickerHtml() +
      this.budgetSummaryHtml() + this.budgetAllocationBannerHtml() +
      '<div class="list-sep"></div>' +
      '<div class="page-scroll-wrap">' + this.budgetCardsHtml() + '</div>' +
      (hideGraph
        ? ''
        : '<div class="list-sep"></div>' +
          this.budgetChipsHtml() +
          '<div class="overview-charts budget-charts">' +
          '<div class="chart-panel budget-donut-panel"><div class="chart-head-row"><span class="chart-title-text">BUDGET ALLOCATION</span></div>' +
          '<div class="budget-donut-wrap"><canvas id="budget-donut-chart" aria-label="Budget allocation"></canvas></div></div>' +
          '<div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">SPEND BY CATEGORY</span></div><canvas id="budget-chart"></canvas></div></div>');
    if (!hideGraph) {
      this.renderBudgetChart();
      this.renderBudgetDonut();
    }
  },

  async toggleBudgetGraph() {
    this.data.settings.hideBudgetGraph = !(this.data.settings && this.data.settings.hideBudgetGraph);
    await this.save();
    this.renderPage('budget');
  },

  budgetChipsHtml() {
    const limits = this.monthlyBudgetView().limits;
    const budgetMap = Object.fromEntries(this.data.budgets.map(b => [b.categoryId, b]));
    let html = '<div class="cat-filter">';
    const hc = this.data.settings.highlightColor || '#fa8c3c';
    const totOn = this._budgetTotalOn === true;
    html += '<div class="cat-filter-chip' + (totOn ? ' selected' : '') + '" style="--cc:' + hc + ';' + (totOn ? 'background:' + hc + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.toggleBudgetTotal()" title="Monthly total spent line \u00b7 click to toggle">' +
      '<span style="' + (totOn ? '' : 'opacity:0.5;') + '">TOTAL</span></div>';
    for (const cat of this.categoriesVisibleInMonth(this.budgetAllocationMonth())) {
      if (cat.name.toLowerCase() === 'transfer') continue;
      const color = this.categoryColor(cat);
      const b = budgetMap[cat.id];
      const on = !(this._budgetCatOff && this._budgetCatOff[cat.id]);
      const name = b && b.name ? b.name : cat.name;
      html += '<div class="cat-filter-chip' + (on ? ' selected' : '') + '" style="--cc:' + color + ';' + (on ? 'background:' + color + ';color:var(--on-fill);' : '') + (on ? '' : 'opacity:0.55;') + '" onclick="BlackBook.toggleBudgetCat(\x27' + cat.id + '\x27)" title="' + this.escapeHtml(name) + (limits[cat.id] != null ? ' \u00b7 ' + this.fmtBase(limits[cat.id]) : ' \u00b7 NO LIMIT') + ' \u00b7 click to show/hide in graph">' + this.escapeHtml(name) + '</div>';
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
    if (this._budgetTotalOn === true) {
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
    for (const cat of this.categoriesVisibleInMonth(this.budgetAllocationMonth())) {
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
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: { enabled: false, external: ({ chart, tooltip }) => this.showDonutTooltip(chart, tooltip,
            tooltip.dataPoints && tooltip.dataPoints.length
              ? [tooltip.title && tooltip.title[0], ...tooltip.dataPoints.map(c => c.dataset.label + ': ' + this.fmtNumber(c.parsed.y))].filter(Boolean).join('\n')
              : '') }
        },
        scales: {
          x: { ticks: { color: '#555555', autoSkip: false, maxRotation: 0, font: { size: 11 } }, grid: { color: '#141414' } },
          y: { ticks: { color: '#555555', font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: '#141414' } }
        }
      }
    });
  },

  renderBudgetDonut(preview = false) {
    const chartKey = preview ? 'budgetPreviewDonutChart' : 'budgetDonutChart';
    if (this[chartKey]) { this[chartKey].destroy(); this[chartKey] = null; }
    const canvas = document.getElementById(preview ? 'budget-allocation-preview-chart' : 'budget-donut-chart');
    if (!canvas) return;
    const cats = new Map(this.categoriesVisibleInMonth(this.budgetAllocationMonth()).map(cat => [cat.id, cat]));
    const view = this.monthlyBudgetView();
    let total = 0;
    let segments = [];
    if (preview) {
      total = this.evalAmount((document.getElementById('budget-allocation-total') || {}).value);
      if (!Number.isFinite(total) || total < 0) total = 0;
      for (const item of (this._budgetAllocationDraft || [])) {
        const cat = cats.get(item.categoryId);
        if (cat && item.pct > 0) segments.push({ id: cat.id, name: cat.name, pct: item.pct,
          amount: this.round2(total * item.pct / 100), color: this.categoryColor(cat) });
      }
      const unassigned = Math.max(0, 100 - segments.reduce((sum, s) => sum + s.pct, 0));
      if (unassigned > 0) segments.push({ id: null, name: 'Unassigned', pct: unassigned,
        amount: this.round2(total - segments.reduce((sum, s) => sum + s.amount, 0)), color: '#555555' });
    } else if (view.allocation && view.allocation.amount > 0) {
      total = view.total;
      for (const slice of view.slices) {
        const cat = cats.get(slice.categoryId);
        if (cat) segments.push({ id: cat.id, name: cat.name, pct: slice.percent,
          amount: slice.value, color: this.categoryColor(cat) });
      }
      if (view.leftover) segments.push({ id: null, name: 'Unassigned', pct: view.leftover.percent,
        amount: view.leftover.value, color: '#555555' });
    } else {
      total = view.total;
      for (const [id, amount] of Object.entries(view.limits)) {
        const cat = cats.get(id);
        if (cat && amount > 0 && total > 0) segments.push({ id, name: cat.name, pct: amount / total * 100,
          amount, color: this.categoryColor(cat) });
      }
    }
    const empty = !segments.length;
    if (empty) segments = [{ id: null, name: 'No budget', pct: 100, amount: 0, color: '#454545' }];
    this[chartKey] = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: segments.map(item => item.name), datasets: [{ data: segments.map(item => item.pct),
        backgroundColor: segments.map(item => item.color), borderColor: 'rgba(0,0,0,0)', borderWidth: 1 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '67%', animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: ({ chart, tooltip }) => {
          const point = tooltip.dataPoints && tooltip.dataPoints[0];
          const item = point && segments[point.dataIndex];
          this.showDonutTooltip(chart, tooltip, !empty && item
            ? item.name + ': ' + this.round2(item.pct) + '% · ' + this.fmtBase(item.amount) : '');
        } } },
        onClick: (_event, elements) => {
          if (!elements.length) return;
          if (preview) {
            const id = segments[elements[0].index].id;
            const card = id && document.querySelector('#budget-allocation-rows .budget-allocation-card[data-category-id="' + CSS.escape(id) + '"]');
            if (card) card.scrollIntoView({ block: 'nearest' });
          } else this.openBudgetAllocationModal(segments[elements[0].index].id);
        }
      }
    });
  },

  budgetSummaryHtml() {
    const year = this.vy(), month = this.vm();
    const plan = this.monthlyBudgetView();
    const planActive = !!(plan.allocation && plan.allocation.amount > 0);
    const budgetedIds = new Set(Object.keys(plan.limits));
    const totalBudgeted = plan.total;
    let used = 0;
    for (const tx of this.data.transactions) {
      if (tx.type !== 'expense') continue;
      if ((!planActive && !budgetedIds.has(tx.categoryId)) || this.isTransfer(tx)) continue;
      const { y, m } = this.ymOf(tx.date);
      if (y === year && m === month) { used += Math.abs(this.toBase(tx.amount, tx.currency)); }
    }
    const totalRemaining = totalBudgeted - used;
    return '<div class="month-summary budget-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">TOTAL BUDGET</span><span class="month-summary-value">' + this.fmtBase(totalBudgeted) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">USED</span><span class="month-summary-value">' + this.fmtBase(used) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">REMAINING</span><span class="month-summary-value ' + (totalRemaining >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtBase(totalRemaining) + '</span></div>' +
      '<button class="btn btn-sm btn-secondary page-control budget-allocate-btn" onclick="BlackBook.openBudgetAllocationModal()">ALLOCATE</button>' +
      '</div>';
  },

  budgetAllocationBannerHtml() {
    const plan = this.monthlyBudgetView();
    if (!plan.allocation || !(plan.allocation.amount > 0)) return '';
    return '<div class="form-hint budget-allocation-banner">PLAN ' + this.fmtBase(plan.allocation.amount) +
      ' · UNASSIGNED ' + this.fmtBase(plan.leftover ? plan.leftover.value : 0) +
      ' · effective from ' + this.escapeHtml(plan.allocation.month) + '</div>';
  },

  budgetCardsHtml() {
    const year = this.vy(), month = this.vm();
    const plan = this.monthlyBudgetView();
    const planActive = !!(plan.allocation && plan.allocation.amount > 0);
    const budgetMap = planActive ? {} : Object.fromEntries(this.data.budgets.map(b => [b.categoryId, b]));
    for (const slice of plan.slices) {
      budgetMap[slice.categoryId] = { ...budgetMap[slice.categoryId], categoryId: slice.categoryId, amount: slice.value, allocated: true };
    }
    const catSpent = {};
    const catIncome = {};
    for (const tx of this.data.transactions) {
      if (this.isTransfer(tx)) continue;
      if (tx.type !== 'expense' && tx.type !== 'income') continue;
      const { y, m } = this.ymOf(tx.date);
      if (y !== year || m !== month) continue;
      const val = this.toBase(tx.amount, tx.currency);
      if (tx.type === 'income') {
        if (val > 0) catIncome[tx.categoryId] = (catIncome[tx.categoryId] || 0) + val;
      } else {
        catSpent[tx.categoryId] = (catSpent[tx.categoryId] || 0) + Math.abs(val);
      }
    }
    let html = '';
    const sorted = this.categoriesVisibleInMonth(this.budgetAllocationMonth());
    const withBudget = sorted.filter(c => !!budgetMap[c.id]);
    const withoutBudget = sorted.filter(c => !budgetMap[c.id]);
    const allRows = withBudget.concat(withoutBudget);
    for (const cat of allRows) {
      const budget = budgetMap[cat.id];
      const isIncome = (catIncome[cat.id] || 0) > 0;
      const spent = (isIncome ? catIncome[cat.id] : catSpent[cat.id]) || 0;
      const amount = budget ? budget.amount : 0;
      const spentAbs = Math.abs(spent);
      const remaining = amount - spentAbs;
      const over = !!budget && !isIncome && remaining < 0;
      const net = isIncome ? (catIncome[cat.id] || 0) - (catSpent[cat.id] || 0) : null;
      const incomeBeat = !!budget && isIncome && net > 0 && spentAbs >= amount;
      const incomeShort = !!budget && isIncome && net > 0 && !incomeBeat;
      const pct = amount > 0 ? Math.round(spentAbs / amount * 100) : 0;
      const fillPct = Math.min(pct, 100);
      const catColor = this.categoryColor(cat);
      const budgetName = budget && budget.name ? budget.name : cat.name;
      const barValues = budget
        ? this.fmtBase(spentAbs) + '<span class="budget-bar-slash">/ ' + this.fmtBase(amount) + '</span>'
        : this.fmtBase(spentAbs);
      const barBg = over ? 'rgba(248,113,113,0.15)' : 'var(--surface-raised)';
      const editAction = planActive ? 'openBudgetAllocationModal(\x27' + cat.id + '\x27)' : 'openBudgetModal(\x27' + cat.id + '\x27)';
      html += '<div class="budget-card">' +
        '<div class="budget-headrow">' +
        '<span class="budget-name-block">' +
        '<span class="cat-dot" style="background:' + catColor + ';"></span>' +
        '<span class="budget-name-text">' + this.escapeHtml(budgetName) + '</span>' +
        '</span>' +
        '<span class="bar-values-wrap"><div class="budget-bar' + (budget ? '' : ' budget-bar-none') + '" style="background:' + barBg + ';"><div class="budget-bar-fill' + (budget ? '' : ' budget-bar-fill-full') + ' ' + (over ? 'over' : '') + '" style="width:' + fillPct + '%;background:' + catColor + (over ? ';opacity:0.9' : '') + ';"></div><span class="budget-bar-values-unfilled' + (over ? ' amount-negative' : '') + '">' + barValues + '</span><span class="budget-bar-values-filled' + (over ? ' amount-negative' : '') + '" style="clip-path:inset(0 ' + (100 - fillPct) + '% 0 0);">' + barValues + '</span></div></span>' +
        '<span class="budget-pct' + (over ? ' over' : '') + (incomeBeat ? ' amount-positive' : '') + (incomeShort ? ' amount-negative' : '') + '">' + (budget ? pct + '%' : '') + '</span>' +
        '<button class="btn btn-sm budget-edit ' + (budget ? 'btn-secondary' : 'btn-primary') + '" onclick="BlackBook.' + editAction + '">' + (planActive ? budget ? 'SHARE' : 'ADD' : budget ? 'EDIT' : 'SET') + '</button>' +
        '</div></div>';
    }
    return html || '<div class="empty-state"><div class="empty-state-text">No categories. Add categories in Settings first.</div></div>';
  },

  openBudgetAllocationModal(categoryId) {
    const month = this.budgetAllocationMonth();
    const entry = BudgetAllocator.effectiveAllocation(this.data.budgetAllocations || [], month);
    const categoryIds = this.categoriesVisibleInMonth(month).filter(c => c.name.toLowerCase() !== 'transfer').map(c => c.id);
    const allowedIds = new Set(categoryIds);
    const suggested = BudgetAllocator.planFromSuggested(Object.fromEntries(
      (this.data.budgets || []).filter(b => allowedIds.has(b.categoryId)).map(b => [b.categoryId, b.amount])));
    if (!this._budgetEditorOpen) {
      this._budgetAllocationDraft = BudgetAllocator.activeFromPercents(
        entry && entry.amount > 0 ? entry.percents : suggested.percents, categoryIds);
      this._budgetAllocationTotal = entry && entry.amount > 0 ? entry.amount : (suggested.total || '');
    }
    if (categoryId && !(this._budgetAllocationDraft || []).some(item => item.categoryId === categoryId)) {
      this._budgetAllocationDraft = BudgetAllocator.toggleActive(this._budgetAllocationDraft || [], categoryId);
    }
    this._budgetEditorOpen = true;
    document.querySelector('#budget-allocation-modal .base-cur-label').textContent = this.baseCurrency();
    document.getElementById('budget-use-individual').disabled = !(entry && entry.amount > 0);
    const totalInput = document.getElementById('budget-allocation-total');
    if (totalInput) totalInput.value = this._budgetAllocationTotal;
    this.openModal('budget-allocation-modal');
    this.renderBudgetAllocationRows();
    const target = categoryId && document.querySelector('#budget-allocation-rows .budget-allocation-card[data-category-id="' + CSS.escape(categoryId) + '"]');
    if (target) target.scrollIntoView({ block: 'nearest' });
    else if (totalInput) totalInput.scrollIntoView({ block: 'nearest' });
  },

  closeBudgetAllocationEditor() {
    this.closeModal('budget-allocation-modal');
  },

  renderBudgetAllocationRows() {
    const box = document.getElementById('budget-allocation-rows');
    if (!box) return;
    const active = this._budgetAllocationDraft || [];
    const byId = new Map(active.map(item => [item.categoryId, item.pct]));
    const total = this.evalAmount((document.getElementById('budget-allocation-total') || {}).value);
    const rows = this.categoriesVisibleInMonth(this.budgetAllocationMonth()).filter(c => c.name.toLowerCase() !== 'transfer').map(cat => {
      const checked = byId.has(cat.id);
      const pct = checked ? byId.get(cat.id) : 0;
      const amount = checked && Number.isFinite(total) ? this.round2(total * pct / 100) : 0;
      return '<div class="budget-allocation-card' + (checked ? ' active' : '') + '" data-category-id="' + this.escapeHtml(cat.id) + '" style="--category-color:' + this.categoryColor(cat) + '">' +
        '<span class="cat-dot" style="background:' + this.categoryColor(cat) + '"></span>' +
        '<span class="budget-allocation-name">' + this.escapeHtml(cat.name) + '</span>' +
        '<label class="budget-allocation-field"><input class="input budget-allocation-pct" type="number" min="0" max="100" step="0.000001" value="' + (checked ? pct : '') + '" ' + (checked ? '' : 'disabled ') +
        'oninput="BlackBook.updateBudgetAllocationInput(this,\x27pct\x27)" aria-label="' + this.escapeHtml(cat.name) + ' percent"><span>%</span></label>' +
        '<label class="budget-allocation-field"><input class="input budget-allocation-amount" type="number" min="0" step="0.01" value="' + (checked ? amount : '') + '" ' + (checked ? '' : 'disabled ') +
        'oninput="BlackBook.updateBudgetAllocationInput(this,\x27amount\x27)" aria-label="' + this.escapeHtml(cat.name) + ' amount"><span>' + this.escapeHtml(this.baseCurrency()) + '</span></label>' +
        '<button type="button" class="btn btn-sm ' + (checked ? 'btn-secondary' : 'btn-primary') + '" onclick="BlackBook.toggleBudgetAllocationCategory(this.closest(\x27.budget-allocation-card\x27).dataset.categoryId)">' + (checked ? 'REMOVE' : 'ADD') + '</button></div>';
    }).join('');
    box.innerHTML = rows;
    this.refreshBudgetAllocationFields();
  },

  refreshBudgetAllocationFields(source) {
    const totalInput = document.getElementById('budget-allocation-total');
    const total = totalInput ? this.evalAmount(totalInput.value) : NaN;
    this._budgetAllocationTotal = totalInput ? totalInput.value : '';
    const byId = new Map((this._budgetAllocationDraft || []).map(item => [item.categoryId, item.pct]));
    document.querySelectorAll('#budget-allocation-rows .budget-allocation-card').forEach(card => {
      const pct = byId.get(card.dataset.categoryId);
      if (pct == null) return;
      const pctInput = card.querySelector('.budget-allocation-pct');
      const amountInput = card.querySelector('.budget-allocation-amount');
      if (pctInput !== source) pctInput.value = pct;
      if (amountInput !== source) amountInput.value = Number.isFinite(total) ? this.round2(total * pct / 100) : '';
    });
    const totals = BudgetAllocator.shareTotals(this._budgetAllocationDraft || []);
    document.getElementById('budget-allocation-status').textContent =
      totals.used + '% assigned · ' + totals.unassigned + '% unassigned';
    this.renderBudgetDonut(true);
  },

  toggleBudgetAllocationCategory(id) {
    this._budgetAllocationDraft = BudgetAllocator.toggleActive(this._budgetAllocationDraft || [], id);
    this.renderBudgetAllocationRows();
  },

  updateBudgetAllocationInput(input, kind) {
    const id = input.closest('.budget-allocation-card').dataset.categoryId;
    const index = (this._budgetAllocationDraft || []).findIndex(item => item.categoryId === id);
    if (index < 0) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0 || input.value === '') return;
    if (kind === 'pct') this._budgetAllocationDraft = BudgetAllocator.setShare(this._budgetAllocationDraft, index, value);
    else {
      const total = this.evalAmount(document.getElementById('budget-allocation-total').value);
      if (!(total > 0)) return;
      this._budgetAllocationDraft = BudgetAllocator.setShareFromAmount(this._budgetAllocationDraft, index, value, total);
    }
    this.refreshBudgetAllocationFields(input);
  },

  resetBudgetAllocationDraft() {
    this._budgetAllocationDraft = [];
    this.renderBudgetAllocationRows();
  },

  async saveBudgetAllocation(event) {
    event.preventDefault();
    const amount = this.evalAmount(document.getElementById('budget-allocation-total').value);
    if (!Number.isFinite(amount) || amount <= 0) { alert('Enter a positive amount to allocate.'); return; }
    const active = BudgetAllocator.activeFromPercents(BudgetAllocator.toPercents(this._budgetAllocationDraft || []));
    if (active.reduce((sum, item) => sum + item.pct, 0) > 100.000001) { alert('Shares cannot exceed 100%.'); return; }
    const month = this.budgetAllocationMonth();
    this.data.budgetAllocations = (this.data.budgetAllocations || []).filter(entry => entry.month !== month);
    this.data.budgetAllocations.push({ month, amount: this.round2(amount), percents: BudgetAllocator.toPercents(active) });
    if (!(await this.save())) return;
    this.closeBudgetAllocationEditor();
    this.renderBudget();
  },

  async resetBudgetAllocation() {
    const month = this.budgetAllocationMonth();
    if (!(await this.confirmModal({ title: 'Use Individual Limits', message: 'Stop applying the allocation plan from ' + month + '? Individual category limits will apply until you set another plan.', confirmText: 'Use Limits', danger: false }))) return;
    this.data.budgetAllocations = (this.data.budgetAllocations || []).filter(entry => entry.month !== month);
    this.data.budgetAllocations.push({ month, amount: 0, percents: {} });
    if (!(await this.save())) return;
    this.closeBudgetAllocationEditor();
    this.renderBudget();
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
