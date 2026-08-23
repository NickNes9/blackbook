(function () {
Object.assign(window.BlackBook, {
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
    const budgetedIds = new Set(this.data.budgets.map(b => b.categoryId));
    let totalBudgeted = 0;
    for (const b of this.data.budgets) { totalBudgeted += b.amount; }
    let used = 0;
    for (const tx of this.data.transactions) {
      if (tx.type !== 'expense') continue;
      if (!budgetedIds.has(tx.categoryId) || this.isTransfer(tx)) continue;
      const { y, m } = this.ymOf(tx.date);
      if (y === year && m === month) { used += Math.abs(this.toRsd(tx.amount, tx.currency)); }
    }
    const totalRemaining = totalBudgeted - used;
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">TOTAL BUDGET</span><span class="month-summary-value">' + this.fmtRsd(totalBudgeted) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">USED</span><span class="month-summary-value">' + this.fmtRsd(used) + '</span></div>' +
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
    const sorted = this.sortedCategories();
    const withBudget = sorted.filter(c => !!budgetMap[c.id]);
    const withoutBudget = sorted.filter(c => !budgetMap[c.id]);
    for (const cat of withBudget.concat(withoutBudget)) {
      const budget = budgetMap[cat.id];
      const spent = catSpent[cat.id] || 0;
      const amount = budget ? budget.amount : 0;
      const spentAbs = Math.abs(spent);
      const remaining = amount - spentAbs;
      const over = !!budget && remaining < 0;
      const pct = amount > 0 ? Math.round(spentAbs / amount * 100) : 0;
      const barClass = amount === 0 ? '' : (pct < 80 ? 'under' : pct <= 100 ? 'warning' : 'over');
      const barWidth = Math.min(pct, 100);
      const rightHtml = budget
        ? '<div class="budget-big-spent ' + (over ? 'amount-negative' : 'amount-positive') + '">' + this.fmtRsd(spentAbs) + '</div>' +
          '<div class="budget-big-budget">/ ' + this.fmtRsd(amount) + '</div>'
        : '<div class="budget-big-spent" style="color:var(--text);">' + this.fmtRsd(spentAbs) + '</div>' +
          '<div class="budget-left-small">NO LIMIT</div>';
      const budgetName = budget && budget.name ? budget.name : cat.name;
      html += '<div class="budget-card" style="cursor:pointer;" onclick="BlackBook.openBudgetModal(\x27' + cat.id + '\x27)">' +
        '<div class="budget-header">' +
        '<span style="display:flex;align-items:center;gap:8px;">' +
        '<button class="btn btn-sm ' + (budget ? 'btn-secondary' : 'btn-primary') + '" style="min-width:64px;" onclick="event.stopPropagation();BlackBook.openBudgetModal(\x27' + cat.id + '\x27)">' + (budget ? 'EDIT' : 'SET') + '</button>' +
        '<span style="color:' + cat.color + ';">' + this.escapeHtml(budgetName) + '</span>' +
        (budget ? '<span class="budget-pct-inline">' + pct + '% used &middot; <span class="' + (over ? 'amount-negative' : 'amount-positive') + '">' + (over ? this.fmtRsd(Math.abs(remaining)) + ' OVER' : this.fmtRsd(remaining) + ' left') + '</span></span>' : '') +
        '</span>' +
        '<span class="budget-right">' + rightHtml + '</span>' +
        '</div>' +
        (budget ? '<div class="budget-bar"><div class="budget-bar-fill ' + barClass + '" style="width:' + barWidth + '%;"></div></div>' : '') +
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
