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
    const cats = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const cat of cats) {
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
        '<span style="font-size:12px;color:' + (budget ? 'var(--text-dim)' : 'var(--text-muted)') + ';">' + (budget ? this.fmtRsd(amount) + ' / mo' : 'NO LIMIT') + '</span>' +
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
});
})();
