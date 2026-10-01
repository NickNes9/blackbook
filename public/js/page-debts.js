(function () {
Object.assign(window.BlackBook, {
  renderDebts() {
    const el = document.getElementById('page-debts');
    if (!el) return;
    if (!this.data.debts) this.data.debts = [];
    if (!this._expandedDebts) this._expandedDebts = {};
    let html = '<div class="month-picker" style="justify-content:flex-end;">' +
      '<button class="btn btn-primary" onclick="BlackBook.openNewDebt()">+ NEW DEBT</button></div>';
    html += this.debtsSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.debtsListHtml() + '</div>';
    el.innerHTML = html;
    this.finishFocus('debt');
  },

  setDebtFilter(f) { this._debtFilter = f; this.renderPage('debts'); },

  cycleDebtFilter() {
    const modes = ['in', 'out', 'all'];
    const idx = modes.indexOf(this._debtFilter || 'all');
    this._debtFilter = modes[(idx + 1) % modes.length];
    this.renderPage('debts');
  },

  _setDebtDir(dir) {
    const hidden = document.getElementById('debt-type');
    if (hidden) hidden.value = dir;
    const btn = document.getElementById('debt-dir-toggle');
    if (!btn) return;
    btn.dataset.dir = dir;
    btn.innerHTML = dir === 'in' ? 'THEY OWE ME' : 'I OWE THEM';
  },

  toggleDebtDir() {
    const btn = document.getElementById('debt-dir-toggle');
    const cur = (btn && btn.dataset.dir) || (document.getElementById('debt-type') || {}).value || 'in';
    const next = cur === 'in' ? 'out' : 'in';
    this._setDebtDir(next);
  },

  debtFilterChipsHtml() {
    const f = this._debtFilter || 'all';
    const chip = (key, label) => '<div class="cat-filter-chip' + (f === key ? ' selected' : '') + '" onclick="BlackBook.setDebtFilter(\x27' + key + '\x27)">' + label + '</div>';
    return '<div class="cat-filter" style="margin-bottom:0;margin-right:10px;">' + chip('in', 'OWED') + chip('out', 'I OWE') + chip('all', 'ALL') + '</div>';
  },

  debtRsd(d) { return Math.abs(this.toBase(d.amount, d.currency || this.baseCurrency() || 'RSD')); },

  debtPayments(d) {
    const out = [];
    if (!this.data.transactions) return out;
    for (const t of this.data.transactions) {
      if (!t || t.debtId !== d.id) continue;
      if (t.type === 'expense' && t.amount < 0) {
        out.push({ id: t.id, txId: t.id, amount: Math.abs(t.amount), amountIn: Math.abs(t.amountIn || t.amount), date: t.date, foreign: t.nativeAmount != null });
      } else if (t.type === 'income' && t.amount > 0) {
        out.push({ id: t.id, txId: t.id, amount: Math.abs(t.amount), amountIn: Math.abs(t.amountIn || t.amount), date: t.date, foreign: t.nativeAmount != null });
      }
    }
    out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)));
    if (!this.data._debtReconciled) {
      this.data._debtReconciled = {};
    }
    if (!this.data._debtReconciled[d.id] && (d.amountPaid || 0) > 0.009 && !out.length) {
      out.push({ id: 'legacy-' + (d.id || d.person), txId: null, amount: Math.abs(d.amountPaid), amountIn: Math.abs(d.amountPaid), date: d.date || this.today() });
      this.data._debtReconciled[d.id] = true;
    }
    return out;
  },

  debtPaidRsd(d) {
    const payments = this.debtPayments(d);
    let paid = 0;
    for (const p of payments) {
      const cur = d.currency || this.baseCurrency() || 'RSD';
      const amt = p.txId ? (this.data.transactions.find(t => t.id === p.txId) || {}).amount : null;
      const value = (amt != null) ? Math.abs(amt) : p.amount;
      paid += Math.abs(this.toBase(value, cur));
    }
    return Math.min(this.debtRsd(d), paid);
  },

  debtRemainingRsd(d) { return Math.max(0, this.debtRsd(d) - this.debtPaidRsd(d)); },

  debtPaidNative(d) {
    const cur = d.currency || this.baseCurrency() || 'RSD';
    let paid = 0;
    for (const t of (this.data.transactions || [])) {
      if (!t || t.debtId !== d.id) continue;
      paid += Math.abs(t.amount);
    }
    if (paid <= 0.009) paid = d.amountPaid || 0;
    return Math.min(Math.abs(d.amount || 0), paid);
  },

  debtRemainingNative(d) {
    return Math.max(0, Math.round((Math.abs(d.amount || 0) - this.debtPaidNative(d)) * 100) / 100);
  },

  debtIsSettled(d) {
    return this.debtPaidRsd(d) >= this.debtRsd(d) - 0.009 && this.debtRsd(d) > 0;
  },

  async openDebtPayments(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d) return;
    const latest = this.debtPayments(d).slice().reverse().find(payment => payment.txId);
    if (latest) this.openLinkedTransaction(latest.txId);
  },

  toggleDebtPayments(id) {
    if (!this._expandedDebts) this._expandedDebts = {};
    this._expandedDebts[id] = !this._expandedDebts[id];
    this.renderPage('debts');
  },

  debtPaymentHistoryHtml(d, payments = this.debtPayments(d)) {
    if (!payments.length) return '';
    const rows = payments.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(payment => {
      const tx = payment.txId ? (this.data.transactions || []).find(item => item.id === payment.txId) : null;
      const date = tx ? tx.date : payment.date;
      const amount = tx ? Math.abs(tx.amount) : payment.amount;
      const currency = (tx && tx.currency) || d.currency || this.baseCurrency() || 'RSD';
      return '<div class="linked-payment-row"><span class="linked-payment-date">' + this.escapeHtml(this.fmtDateInput(date) || '—') + '</span><span class="linked-payment-amount">' + this.fmtAmount(amount, currency) + '</span>' +
        (tx ? '<span class="linked-payment-actions">' + this.linkedTransactionButton(tx.id) + '<button type="button" class="btn btn-sm btn-danger btn-icon" title="Delete this payment transaction" aria-label="Delete this payment transaction" onclick="BlackBook.deleteTransaction(\'' + this.escapeHtml(tx.id) + '\')">' + this.xIcon() + '</button></span>' : '<span class="linked-payment-unlinked" title="No transaction is linked to this older payment">UNLINKED</span>') + '</div>';
    }).join('');
    return '<div class="linked-payment-history">' + rows + '</div>';
  },

  debtProgressMarkers(d, payments = this.debtPayments(d)) {
    const total = Math.abs(Number(d.amount) || 0);
    if (!(total > 0)) return '';
    let cumulative = 0;
    const positions = [0];
    for (const payment of payments) {
      cumulative += Math.abs(Number(payment.amount) || 0);
      positions.push(Math.min(100, Math.round(cumulative / total * 10000) / 100));
    }
    positions.push(100);
    return [...new Set(positions)].map(percent => '<i class="debt-progress-marker' + (percent === 0 ? ' is-start' : percent === 100 ? ' is-end' : '') + '" style="left:' + percent + '%" aria-hidden="true"></i>').join('');
  },

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
      '<div class="month-summary-item"><span class="month-summary-label">OWED TO ME</span><span class="month-summary-value amount-positive">' + this.fmtBase(owedToMe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">I OWE</span><span class="month-summary-value amount-negative">' + this.fmtBase(iOwe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">NET</span><span class="month-summary-value ' + (net >= 0 ? 'amount-positive' : 'amount-negative') + '">' + this.fmtBase(net) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:4px;align-items:center;">' +
      '<button class="btn btn-sm btn-secondary page-control debt-filter-cycle" onclick="BlackBook.cycleDebtFilter()" title="Cycle filter: Owed → I Owe → All" style="min-width:100px;text-align:center;">' + filterLabel + '</button>' +
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
    const cur = d.currency || this.baseCurrency() || 'RSD';
    const total = Math.abs(d.amount || 0), paid = Math.min(total, this.debtPaidNative(d));
    const pct = total > 0 ? Math.min(Math.round(total > 0 ? (this.debtPaidRsd(d) / this.debtRsd(d)) * 100 : 0), 100) : 0;
    const overdue = !settled && d.dueDate && d.dueDate < this.today();
    const fill = d.type === 'in' ? 'var(--income)' : 'var(--accent)';
    const typeColor = d.type === 'in' ? 'var(--income)' : 'var(--expense)';
    const cat = d.categoryId ? this.data.categories.find(c => c.id === d.categoryId) : null;
    const dotColor = cat ? this.categoryColor(cat) : typeColor;
    const payments = this.debtPayments(d);
    let html = '<div class="savings-card debt-card' + this.focusRecordHtml('debt', d.id) + '"' + (settled ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + dotColor + ';"></span> ' + this.escapeHtml(d.person) + this.healthMarker('debts', d.id) + '</span>' +
      '<span class="savings-actions">' +
      '<span class="debt-badge" style="background:' + typeColor + ';color:var(--on-fill);">' + (d.type === 'in' ? 'OWED' : 'OWE') + '</span>' +
      (settled ? '<button class="btn btn-sm btn-danger" onclick="BlackBook.toggleDebtPayment(\x27' + d.id + '\x27)" title="Unpay last payment">UNPAY</button>' : '<button class="btn btn-sm btn-primary" onclick="BlackBook.openDebtPayModal(\x27' + d.id + '\x27)">+ PAY</button>') +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditDebt(\x27' + d.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger btn-icon" title="Delete debt" onclick="BlackBook.deleteDebt(\x27' + d.id + '\x27)">' + this.xIcon() + '</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + this.fmtAmount(paid, cur) + ' of ' + this.fmtAmount(total, cur) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar debt-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + fill + ';"></div>' + this.debtProgressMarkers(d, payments) + '</div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      'DATE ' + (this.fmtDateInput(d.date) || '?') +
      ' &middot; <span class="' + (overdue ? 'amount-negative" title="Overdue"' : '"') + '>DUE ' + (this.fmtDateInput(d.dueDate) || '-') + '</span>' +
      (overdue ? ' &middot; <span class="amount-negative">OVERDUE</span>' : '') +
      (cat ? ' &middot; <span style="color:' + this.categoryColor(cat) + ';">' + this.escapeHtml(cat.name.toUpperCase()) + '</span>' : '') +
      (d.note ? ' &middot; ' + this.escapeHtml(d.note) : '') + '</div>';
    html += '<details class="item-details debt-payment-details"><summary>PAYMENT HISTORY · ' + payments.length + '</summary>' +
      (payments.length ? this.debtPaymentHistoryHtml(d, payments) : '<div class="linked-payment-history">No payments yet.</div>') + '</details>';
    html += '</div>';
    return html;
  },

  openNewDebt() {
    document.getElementById('debt-id').value = '';
    document.getElementById('debt-person').value = '';
    this._setDebtDir('in');
    document.getElementById('debt-amount').value = '';
    document.getElementById('debt-currency').value = this.baseCurrency();
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
      const defCat = this.categoriesAvailableOn(this.today()).some(c => c.id === this.data.settings.defaultCategoryId) ? this.data.settings.defaultCategoryId : null;
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
    this._setDebtDir(d.type || 'in');
    document.getElementById('debt-amount').value = d.amount;
    document.getElementById('debt-currency').value = d.currency || this.baseCurrency() || 'RSD';
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
      if (document.getElementById('debt-due').value.trim() && !debtDue) { alert('Enter a valid due date (' + this.dateFormatPattern() + ').'); return; }
      const data = { person: person, type: document.getElementById('debt-type').value, amount: amount, currency: document.getElementById('debt-currency').value, date: debtDate, dueDate: debtDue || '', amountPaid: amountPaid, note: document.getElementById('debt-note').value.trim(), categoryId: document.getElementById('debt-category').value || null,  };
      const original = id ? this.data.debts.find(item => item.id === id) : null;
      if (!this.categorySelectionAllowed(data.categoryId, debtDate, original && original.categoryId)) { alert('That category was archived for this date. Choose another category.'); return; }
      if (!this.data.debts) this.data.debts = [];
      if (id) {
        const d = this.data.debts.find(x => x.id === id);
        if (d) {
          const payTx = (this.data.transactions || []).filter(t => t.debtId === d.id);
          if (payTx.length) {
            if (d.currency !== undefined && d.currency !== data.currency) {
              const ok = await this.confirmModal({ title: 'Edit Linked Debt', message: 'This debt has ' + payTx.length + ' linked payment transaction(s). Changing its currency may desync those payments.\n\nContinue?', confirmText: 'Continue' });
              if (!ok) return;
            }
            const summed = payTx.reduce((s, t) => s + Math.abs(t.amount), 0);
            data.amountPaid = Math.min(Math.abs(data.amount || 0), summed);
          }
          Object.assign(d, data);
        }
      } else {
        data.id = 'debt-' + Date.now();
        this.data.debts.push(data);
      }
      await this.save({ undoable: true, label: id ? 'Edit debt' : 'Add debt' });
      this.closeModal('debt-modal');
      this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
    });
  },

  openDebtPayModal(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d || this.debtIsSettled(d)) return;
    const total = Math.abs(d.amount || 0);
    const remaining = this.debtRemainingNative(d);
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
      const capLeft = this.debtRemainingNative(d);
      if (amt > capLeft) amt = capLeft;
      if (!(amt > 0)) return;
      await this.applyDebtPayment(d, amt, this.today());
      this.closeModal('debt-pay-modal');
      this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
    });
  },

  async applyDebtPayment(d, amt, date) {
    if (!(amt > 0)) return;
    if (!this.data.transactions) this.data.transactions = [];
    const cur = d.currency || this.baseCurrency() || 'RSD';
    const type = (d.type === 'in') ? 'income' : 'expense';
    const txId = 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const tx = {
      id: txId,
      date: date || this.today(),
      type: type,
      amount: type === 'income' ? amt : -amt,
      currency: cur,
      accountId: this.data.settings.defaultAccountId || null,
      categoryId: this.debtCategory() ? this.debtCategory().id : null,
      note: 'Debt payment: ' + d.person,
      debtId: d.id
    };
    this.data.transactions.push(tx);
    d.amountPaid = Math.round(((d.amountPaid || 0) + amt) * 100) / 100;
    if (!d.payments) d.payments = [];
    const existingIdx = d.payments.findIndex(p => p && p.txId === txId);
    if (existingIdx < 0) {
      d.payments.push({ txId: txId, amount: amt, date: tx.date, type: type });
    }
    await this.save({ undoable: true, label: 'Record debt payment' });
  },

  removeDebtPayment(txId) {
    const d = this.debtForPaymentTx(txId);
    if (!d) return;
    const tx = this.data.transactions.find(t => t.id === txId);
    const amt = tx ? Math.abs(tx.amount) : 0;
    this.data.transactions = this.data.transactions.filter(t => t.id !== txId);
    if (d.payments) {
      d.payments = d.payments.filter(p => p && p.txId !== txId);
    }
    d.amountPaid = Math.max(0, Math.round(((d.amountPaid || 0) - amt) * 100) / 100);
  },

  toggleDebtPayment(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d) return;
    const wasSettled = this.debtIsSettled(d);
    if (!wasSettled) {
      this.openDebtPayModal(id);
      return;
    }
    this.removeLastDebtPayment(id);
  },

  async removeLastDebtPayment(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d) return;
    const payments = this.debtPayments(d).slice();
    if (!payments.length) return;
    const last = payments[payments.length - 1];
    const amtDisplay = this.fmtAmount(last.amount, d.currency || this.baseCurrency() || 'RSD');
    if (!(await this.confirmModal({ title: 'Unpay Debt', message: 'Remove the last payment of ' + amtDisplay + ' for "' + d.person + '"? The remaining debt will increase.', confirmText: 'Unpay' }))) return;
    if (last.txId) {
      this.removeDebtPayment(last.txId);
    } else {
      d.amountPaid = Math.max(0, (d.amountPaid || 0) - last.amount);
    }
    await this.save({ undoable: true, label: 'Remove debt payment' });
    this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
  },

  async deleteDebt(id) {
    const d = this.data.debts.find(x => x.id === id);
    if (!d) return;
    if (!(await this.confirmModal({ title: 'Delete Debt', message: 'Delete debt entry for "' + d.person + '"?' , confirmText: 'Delete' }))) return;
    this.data.debts = this.data.debts.filter(x => x.id !== id);
    await this.save({ undoable: true, label: 'Delete debt' });
    this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
  },

  // ==================== SETTINGS ====================
});
})();
