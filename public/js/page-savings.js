(function () {
Object.assign(window.BlackBook, {
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

  async deleteSavingsEntry(goalId, entryId) {
    const goal = this.data.savingsGoals.find(g => g.id === goalId);
    if (!goal) return;
    goal.entries = (goal.entries || []).filter(e => e.id !== entryId);
    this.data.transactions = (this.data.transactions || []).filter(t => t.linkId !== entryId);
    await this.save();
    this.renderSavings();
  },

});
})();
