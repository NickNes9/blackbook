(function () {
Object.assign(window.BlackBook, {
  renderDebts() {
    const el = document.getElementById('page-debts');
    if (!el) return;
    if (!this.data.debts) this.data.debts = [];
    let html = '<div class="month-picker" style="justify-content:flex-end;">' +
      '<button class="btn btn-primary" onclick="BlackBook.openNewDebt()">+ NEW DEBT</button></div>';
    html += this.debtsSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.debtsListHtml() + '</div>';
    el.innerHTML = html;
  },

  setDebtFilter(f) { this._debtFilter = f; this.renderPage('debts'); },

  cycleDebtFilter() {
    const modes = ['in', 'out', 'all'];
    const idx = modes.indexOf(this._debtFilter || 'all');
    this._debtFilter = modes[(idx + 1) % modes.length];
    this.renderPage('debts');
  },

  debtFilterChipsHtml() {
    const f = this._debtFilter || 'all';
    const chip = (key, label) => '<div class="cat-filter-chip' + (f === key ? ' selected' : '') + '" onclick="BlackBook.setDebtFilter(\x27' + key + '\x27)">' + label + '</div>';
    return '<div class="cat-filter" style="margin-bottom:0;margin-right:10px;">' + chip('in', 'OWED') + chip('out', 'I OWE') + chip('all', 'ALL') + '</div>';
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
    const f = this._debtFilter || 'all';
    const filterLabel = f === 'in' ? 'OWED' : f === 'out' ? 'I OWE' : 'ALL';
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">OWED TO ME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(owedToMe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">I OWE</span><span class="month-summary-value amount-negative">' + this.fmtRsd(iOwe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (net >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtRsd(net) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:4px;align-items:center;">' +
      '<button class="btn btn-sm btn-secondary debt-filter-cycle" onclick="BlackBook.cycleDebtFilter()" title="Cycle filter: Owed → I Owe → All" style="min-width:100px;text-align:center;">' + filterLabel + '</button>' +
      '</span></div>';
  },

  debtsListHtml() {
    if (!this.data.debts.length) return '<div class="empty-state"><div class="empty-state-text">No debts tracked. Click + NEW DEBT to add one.</div></div>';
    const f = this._debtFilter || 'all';
    const filtered = f === 'all' ? this.data.debts : this.data.debts.filter(d => (d.type === 'in') === (f === 'in'));
    if (!filtered.length) return '<div class="empty-state"><div class="empty-state-text">No debts in this filter.</div></div>';
    const sorted = filtered.slice().sort((a, b) => {
      const sa = this.debtIsSettled(a) ? 1 : 0, sb = this.debtIsSettled(b) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return String(a.dueDate || a.date).localeCompare(String(b.dueDate || b.date));
    });
    return sorted.map(d => this.debtCardHtml(d)).join('');
  },

  debtCardHtml(d) {
    const settled = this.debtIsSettled(d);
    const cur = d.currency || 'RSD';
    const total = Math.abs(d.amount || 0), paid = Math.min(total, Math.abs(d.amountPaid || 0));
    const pct = total > 0 ? Math.min(Math.round(paid / total * 100), 100) : 0;
    const overdue = !settled && d.dueDate && d.dueDate < this.today();
    const fill = d.type === 'in' ? 'var(--income)' : 'var(--accent)';
    const typeColor = d.type === 'in' ? 'var(--income)' : 'var(--expense)';
    const cat = d.categoryId ? this.data.categories.find(c => c.id === d.categoryId) : null;
    const dotColor = cat ? cat.color : typeColor;
    let html = '<div class="savings-card debt-card"' + (settled ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + dotColor + ';"></span> ' + this.escapeHtml(d.person) + '</span>' +
      '<span class="savings-actions">' +
      '<span class="debt-badge" style="background:' + typeColor + ';color:var(--on-fill);">' + (d.type === 'in' ? 'OWED' : 'OWE') + '</span>' +
      (settled ? '<span class="debt-badge debt-badge-settled">&#10003; SETTLED</span>' : '<button class="btn btn-sm btn-primary" onclick="BlackBook.openDebtPayModal(\x27' + d.id + '\x27)">+ PAY</button>') +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditDebt(\x27' + d.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteDebt(\x27' + d.id + '\x27)">DEL</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + this.fmtAmount(paid, cur) + ' of ' + this.fmtAmount(total, cur) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + fill + ';"></div></div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      'DATE ' + (d.date || '?') +
      ' &middot; <span class="' + (overdue ? 'amount-negative" title="Overdue"' : '"') + '>DUE ' + (d.dueDate ? this.ordinalDay(new Date(d.dueDate).getDate()) + ' ' + new Date(d.dueDate).toLocaleString('en', { month: 'short' }).toUpperCase() + ' ' + new Date(d.dueDate).getFullYear() : '-') + '</span>' +
      (overdue ? ' &middot; <span class="amount-negative">OVERDUE</span>' : '') +
      (cat ? ' &middot; <span style="color:' + cat.color + ';">' + this.escapeHtml(cat.name.toUpperCase()) + '</span>' : '') +
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
    document.getElementById('debt-date').value = this.fmtDateInput(this.today());
    const in30 = new Date(Date.now() + 30 * 86400000);
    document.getElementById('debt-due').value = this.fmtDateInput(in30.toISOString().slice(0, 10));
    document.getElementById('debt-paid').value = '';
    document.getElementById('debt-note').value = '';
    const catInput = document.getElementById('debt-category-input');
    const catHidden = document.getElementById('debt-category');
    if (catInput && catHidden) {
      catHidden.value = '';
      catInput.value = '';
      this.initCategoryPicker('debt-category-input', 'debt-category', 'debt-category-dropdown');
      const defCat = this.data.settings.defaultCategoryId;
      if (defCat) { catHidden.value = defCat; catInput.value = this.data.categories.find(c => c.id === defCat)?.name?.toUpperCase() || ''; }
    }
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
    document.getElementById('debt-date').value = this.fmtDateInput(d.date || '');
    document.getElementById('debt-due').value = this.fmtDateInput(d.dueDate || '');
    document.getElementById('debt-paid').value = d.amountPaid || '';
    document.getElementById('debt-note').value = d.note || '';
    const catInput = document.getElementById('debt-category-input');
    const catHidden = document.getElementById('debt-category');
    if (catInput && catHidden) {
      catHidden.value = d.categoryId || '';
      catInput.value = d.categoryId ? this.data.categories.find(c => c.id === d.categoryId)?.name?.toUpperCase() || '' : '';
      this.initCategoryPicker('debt-category-input', 'debt-category', 'debt-category-dropdown');
    }
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
      const parseNum = (v) => { const n = this.evalAmount(v); return isNaN(n) ? 0 : n; };
      const amount = parseNum(document.getElementById('debt-amount').value);
      if (!(amount > 0)) { alert('Enter a valid amount.'); return; }
      let amountPaid = parseNum(document.getElementById('debt-paid').value) || 0;
      if (amountPaid > amount) amountPaid = amount;
      const debtDate = this.parseDateInput(document.getElementById('debt-date').value) || this.today();
      const debtDue = this.parseDateInput(document.getElementById('debt-due').value);
      if (document.getElementById('debt-due').value.trim() && !debtDue) { alert('Enter a valid due date (DD/MM/YYYY).'); return; }
      const data = { person: person, type: document.getElementById('debt-type').value, amount: amount, currency: document.getElementById('debt-currency').value, date: debtDate, dueDate: debtDue || '', amountPaid: amountPaid, note: document.getElementById('debt-note').value.trim(), categoryId: document.getElementById('debt-category').value || null };
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
    const total = Math.abs(d.amount || 0);
    const paid = Math.min(total, Math.abs(d.amountPaid || 0));
    const remaining = total - paid;
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
      let amt = this.evalAmount(document.getElementById('dpay-amount').value);
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      const total = Math.abs(d.amount || 0);
      const paid = Math.min(total, Math.abs(d.amountPaid || 0));
      const remaining = total - paid;
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
    if (!(await this.confirmModal({ title: 'Delete Debt', message: 'Delete debt entry for "' + d.person + '"?' , confirmText: 'Delete' }))) return;
    this.data.debts = this.data.debts.filter(x => x.id !== id);
    await this.save();
    this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
  },

  // ==================== SETTINGS ====================
});
})();
