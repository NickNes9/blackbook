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

  debtPersonForName(value) {
    const normalize = name => String(name || '').trim().replace(/^@+/, '').trim().toLocaleLowerCase();
    const target = normalize(value);
    if (!target) return null;
    const matches = (this.data.people || []).filter(person => normalize(person.name) === target);
    return matches.length === 1 ? matches[0] : null;
  },

  populateDebtPersonOptions() {
    const list = document.getElementById('debt-person-options');
    if (!list) return;
    const people = [...(this.data.people || [])].filter(person => person && person.name)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    list.innerHTML = people.map(person => '<option value="@' + this.escapeHtml(person.name) + '"></option>').join('');
  },

  updateDebtTransactionPeople(debt, previousPersonId) {
    const nextPersonId = debt.personId || '';
    const transactions = (this.data.transactions || []).filter(tx => tx && (
      tx.debtId === debt.id || (debt.openingTransactionId && tx.id === debt.openingTransactionId)
    ));
    for (const tx of transactions) {
      const personIds = [...new Set((Array.isArray(tx.personIds) ? tx.personIds : []).filter(Boolean))];
      if (previousPersonId && previousPersonId !== nextPersonId) {
        const oldIndex = personIds.indexOf(previousPersonId);
        if (oldIndex >= 0) personIds.splice(oldIndex, 1);
      }
      if (nextPersonId && !personIds.includes(nextPersonId)) personIds.push(nextPersonId);
      tx.personIds = personIds;
    }
  },

  populateDebtAccountOptions(selectedId = '') {
    const select = document.getElementById('debt-account');
    if (!select) return;
    select.disabled = false;
    const accounts = this.visibleAccounts();
    select.innerHTML = '<option value="">— SELECT ACCOUNT —</option>' + accounts.map(account => '<option value="' + this.escapeHtml(account.id) + '">' + this.escapeHtml(account.name + (account.currency && account.currency !== this.baseCurrency() ? ' (' + account.currency + ')' : '')) + '</option>').join('');
    select.required = accounts.length > 0;
    const preferred = selectedId || this.selectedAccount || this.defaultAccountForCurrency(this.baseCurrency());
    select.value = accounts.some(account => account.id === preferred) ? preferred : '';
    this.syncCustomSelect(select);
  },

  debtOpeningTransaction(debt, accountId, id) {
    const type = debt.type === 'out' ? 'income' : 'expense';
    const description = debt.type === 'out' ? 'Borrowed from ' + debt.person : 'Loan to ' + debt.person;
    return {
      id,
      date: debt.date,
      type,
      amount: (type === 'income' ? 1 : -1) * Math.abs(Number(debt.openingAmount ?? debt.amount) || 0),
      currency: debt.currency || this.baseCurrency(),
      accountId,
      categoryId: debt.categoryId || null,
      personIds: debt.personId ? [debt.personId] : [],
      note: debt.note ? description + ' · ' + debt.note : description
    };
  },

  syncDebtOpeningTransaction(debt) {
    if (!debt || !debt.openingTransactionId) return;
    const transaction = (this.data.transactions || []).find(item => item.id === debt.openingTransactionId);
    if (!transaction) return;
    Object.assign(transaction, this.debtOpeningTransaction(debt, transaction.accountId, transaction.id));
  },

  syncDebtPaidDate(debt) {
    if (!debt) return '';
    if (!this.debtIsSettled(debt)) {
      debt.paidDate = '';
      return '';
    }
    const payments = this.debtPayments(debt).filter(payment => payment.txId && payment.date);
    const latest = payments[payments.length - 1];
    if (latest) debt.paidDate = latest.date;
    return debt.paidDate || '';
  },

  syncDebtLinkedTransactions(debt, previousPersonId = '', previousPerson = '') {
    if (!debt) return;
    this.syncDebtOpeningTransaction(debt);
    this.updateDebtTransactionPeople(debt, previousPersonId);
    const paymentType = debt.type === 'in' ? 'income' : 'expense';
    const additionType = debt.type === 'in' ? 'expense' : 'income';
    for (const transaction of (this.data.transactions || []).filter(item => item && item.debtId === debt.id)) {
      const isAddition = transaction.debtEntryType === 'addition';
      const type = isAddition ? additionType : paymentType;
      const sign = type === 'income' ? 1 : -1;
      transaction.type = type;
      transaction.amount = sign * Math.abs(Number(transaction.amount) || 0);
      if (transaction.nativeAmount != null) transaction.nativeAmount = sign * Math.abs(Number(transaction.nativeAmount) || 0);
      if (previousPerson) {
        const oldPrefixes = isAddition ? ['Additional loan to ', 'Additional borrowing from '] : ['Debt payment: '];
        const oldPrefix = oldPrefixes.find(prefix => transaction.note === prefix + previousPerson);
        if (oldPrefix) transaction.note = isAddition
          ? (debt.type === 'in' ? 'Additional loan to ' : 'Additional borrowing from ') + debt.person
          : 'Debt payment: ' + debt.person;
      }
    }
    this.syncDebtPaidDate(debt);
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
      if (!t || t.debtId !== d.id || t.debtEntryType === 'addition') continue;
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

  debtAdditionEntries(d) {
    return (this.data.transactions || []).filter(transaction => transaction && transaction.debtId === d.id && transaction.debtEntryType === 'addition')
      .map(transaction => ({ id: transaction.id, txId: transaction.id, amount: Math.abs(transaction.amount || 0), date: transaction.date, kind: 'addition' }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)));
  },

  debtHistoryEntries(d) {
    const payments = this.debtPayments(d).map(entry => ({ ...entry, kind: 'payment' }));
    return [...payments, ...this.debtAdditionEntries(d)]
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)));
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
      if (!t || t.debtId !== d.id || t.debtEntryType === 'addition') continue;
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
    const latest = this.debtHistoryEntries(d).slice().reverse().find(payment => payment.txId);
    if (latest) this.openLinkedTransaction(latest.txId);
  },

  debtAdditionDefaultAccount(d) {
    const additions = this.debtAdditionEntries(d).slice().reverse();
    const latest = additions.find(entry => entry.txId && (this.data.transactions || []).find(transaction => transaction.id === entry.txId && transaction.accountId));
    const opening = d.openingTransactionId && (this.data.transactions || []).find(transaction => transaction.id === d.openingTransactionId);
    return (latest && (this.data.transactions || []).find(transaction => transaction.id === latest.txId)?.accountId) ||
      (opening && opening.accountId) || this.selectedAccount || (this.data.settings || {}).defaultAccountId || '';
  },

  populateDebtAdditionAccounts(selectedId = '') {
    const select = document.getElementById('debt-add-account');
    if (!select) return;
    const accounts = this.visibleAccounts();
    select.innerHTML = '<option value="">— SELECT ACCOUNT —</option>' + accounts.map(account => '<option value="' + this.escapeHtml(account.id) + '">' + this.escapeHtml(account.name + (account.currency && account.currency !== this.baseCurrency() ? ' (' + account.currency + ')' : '')) + '</option>').join('');
    select.required = accounts.length > 0;
    const preferred = selectedId || this.selectedAccount || this.defaultAccountForCurrency(this.baseCurrency());
    select.value = accounts.some(account => account.id === preferred) ? preferred : '';
    this.syncCustomSelect(select);
  },

  openDebtAdditionModal(id) {
    const debt = (this.data.debts || []).find(item => item.id === id);
    if (!debt) return;
    document.getElementById('debt-add-id').value = id;
    document.getElementById('debt-add-amount').value = '';
    document.getElementById('debt-add-date').value = this.fmtDateInput(this.today());
    document.getElementById('debt-add-title').textContent = 'Add to Debt — ' + debt.person;
    this.populateDebtAdditionAccounts(this.debtAdditionDefaultAccount(debt));
    this.bindDebtAdditionForm();
    this.openModal('debt-add-modal');
    setTimeout(() => document.getElementById('debt-add-amount').focus(), 50);
  },

  bindDebtAdditionForm() {
    const form = document.getElementById('debt-add-form');
    if (!form || form._bound) return;
    form._bound = true;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const debt = (this.data.debts || []).find(item => item.id === document.getElementById('debt-add-id').value);
      if (!debt) return;
      const amount = this.evalAmount(document.getElementById('debt-add-amount').value);
      if (!(amount > 0)) { this.showToast('Enter a valid amount.'); return; }
      const enteredDate = document.getElementById('debt-add-date').value.trim();
      const date = this.parseDateInput(enteredDate);
      if (!date) { this.showToast('Enter a valid date (' + this.dateFormatPattern() + ').'); return; }
      const accountId = document.getElementById('debt-add-account').value;
      if (this.visibleAccounts().length && !accountId) { this.showToast('Select an account for the added amount.'); return; }
      const saved = await this.applyDebtAddition(debt, amount, date, accountId || null);
      if (saved) {
        this.closeModal('debt-add-modal');
        this.renderPage(this.currentPage === 'debts' ? 'debts' : this.currentPage);
      }
    });
  },

  async applyDebtAddition(debt, amount, date, accountId) {
    if (!debt || !(amount > 0)) return null;
    if (!this.data.transactions) this.data.transactions = [];
    const existingAdditions = this.debtAdditionEntries(debt).reduce((sum, entry) => sum + entry.amount, 0);
    const currentTotal = Math.abs(Number(debt.amount) || 0);
    if (debt.openingAmount == null) debt.openingAmount = Math.max(0, Math.round((currentTotal - existingAdditions) * 100) / 100);
    const currency = debt.currency || this.baseCurrency() || 'RSD';
    const isLoanOut = debt.type === 'in';
    const type = isLoanOut ? 'expense' : 'income';
    const tx = {
      id: 'tx-debt-add-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      date: date || this.today(),
      type,
      amount: (type === 'income' ? 1 : -1) * Math.round(Math.abs(amount) * 100) / 100,
      currency,
      accountId: accountId || null,
      categoryId: debt.categoryId || (this.debtCategory() && this.debtCategory().id) || null,
      personIds: debt.personId ? [debt.personId] : [],
      note: (isLoanOut ? 'Additional loan to ' : 'Additional borrowing from ') + debt.person,
      debtId: debt.id,
      debtEntryType: 'addition'
    };
    debt.amount = Math.round((currentTotal + Math.abs(amount)) * 100) / 100;
    this.data.transactions.push(tx);
    this.syncDebtPaidDate(debt);
    const saved = await this.save({ undoable: true, label: 'Add to debt' });
    return saved ? tx : null;
  },

  adjustDebtAdditionForEdit(debt, transaction, updatedTransaction) {
    const expectedType = debt.type === 'in' ? 'expense' : 'income';
    const expectedCurrency = debt.currency || this.baseCurrency() || 'RSD';
    if (updatedTransaction.type !== expectedType) return { ok: false, message: 'An added debt amount must stay in the same direction as the original debt.' };
    if (updatedTransaction.currency !== expectedCurrency) return { ok: false, message: 'Change the debt currency from the debt entry to keep its added amounts aligned.' };
    const oldAmount = Math.abs(Number(transaction.amount) || 0);
    if (debt.openingAmount == null) {
      const otherAdditions = this.debtAdditionEntries(debt).filter(entry => entry.txId !== transaction.id).reduce((sum, entry) => sum + entry.amount, 0);
      debt.openingAmount = Math.max(0, Math.round((Math.abs(Number(debt.amount) || 0) - otherAdditions - oldAmount) * 100) / 100);
    }
    debt.amount = Math.max(0, Math.round((Math.abs(Number(debt.amount) || 0) + Math.abs(updatedTransaction.amount) - oldAmount) * 100) / 100);
    return { ok: true };
  },

  toggleDebtPayments(id) {
    if (!this._expandedDebts) this._expandedDebts = {};
    this._expandedDebts[id] = !this._expandedDebts[id];
    this.renderPage('debts');
  },

  debtPaymentHistoryHtml(d, payments = this.debtHistoryEntries(d)) {
    if (!payments.length) return '';
    const rows = payments.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(payment => {
      const tx = payment.txId ? (this.data.transactions || []).find(item => item.id === payment.txId) : null;
      const date = tx ? tx.date : payment.date;
      const amount = tx ? Math.abs(tx.amount) : payment.amount;
      const currency = (tx && tx.currency) || d.currency || this.baseCurrency() || 'RSD';
      const kind = payment.kind === 'addition' || (tx && tx.debtEntryType === 'addition') ? 'ADDED' : 'PAID';
      return '<div class="linked-payment-row"><span class="linked-payment-date"><span class="debt-history-kind ' + (kind === 'ADDED' ? 'is-added' : 'is-paid') + '">' + kind + '</span> ' + this.escapeHtml(this.fmtDateInput(date) || '—') + '</span><span class="linked-payment-amount">' + this.fmtAmount(amount, currency) + '</span>' +
        (tx ? '<span class="linked-payment-actions">' + this.linkedTransactionButton(tx.id) + '<button type="button" class="btn btn-sm btn-danger btn-icon" title="Delete this debt entry" aria-label="Delete this debt entry" onclick="BlackBook.deleteTransaction(\'' + this.escapeHtml(tx.id) + '\')">' + this.xIcon() + '</button></span>' : '<span class="linked-payment-unlinked" title="No transaction is linked to this older payment">UNLINKED</span>') + '</div>';
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
    const linkedPerson = (this.data.people || []).find(person => person.id === d.personId);
    const personLabel = linkedPerson ? this.personNameHtml(linkedPerson, false) : this.escapeHtml(d.person);
    const dotColor = cat ? this.categoryColor(cat) : typeColor;
    const payments = this.debtPayments(d);
    const history = this.debtHistoryEntries(d);
    let html = '<div class="savings-card debt-card' + this.focusRecordHtml('debt', d.id) + '"' + (settled ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + dotColor + ';"></span> ' + personLabel + this.healthMarker('debts', d.id) + '</span>' +
      '<span class="savings-actions">' +
      '<span class="debt-badge" style="background:' + typeColor + ';color:var(--on-fill);">' + (d.type === 'in' ? 'OWED' : 'OWE') + '</span>' +
      '<button class="btn btn-sm btn-secondary" title="Add an amount to this debt" onclick="BlackBook.openDebtAdditionModal(\'' + d.id + '\')">+ ADD</button>' +
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
    html += '<details class="item-details debt-payment-details"><summary>DEBT HISTORY · ' + history.length + '</summary>' +
      (history.length ? this.debtPaymentHistoryHtml(d, history) : '<div class="linked-payment-history"><div class="linked-payment-row linked-payment-empty">No debt activity yet.</div></div>') + '</details>';
    html += '</div>';
    return html;
  },

  openNewDebt() {
    document.getElementById('debt-id').value = '';
    document.getElementById('debt-person').value = '';
    this.populateDebtPersonOptions();
    this._setDebtDir('in');
    document.getElementById('debt-amount').value = '';
    document.getElementById('debt-currency').value = this.baseCurrency();
    document.getElementById('debt-date').value = this.fmtDateInput(this.today());
    document.getElementById('debt-paid-date').value = '';
    document.getElementById('debt-note').value = '';
    document.getElementById('debt-account-field').hidden = false;
    this.populateDebtAccountOptions();
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
    this.populateDebtPersonOptions();
    const linkedPerson = (this.data.people || []).find(person => person.id === d.personId) || this.debtPersonForName(d.person);
    document.getElementById('debt-person').value = linkedPerson ? linkedPerson.name : d.person;
    this._setDebtDir(d.type || 'in');
    document.getElementById('debt-amount').value = d.amount;
    document.getElementById('debt-currency').value = d.currency || this.baseCurrency() || 'RSD';
    document.getElementById('debt-date').value = this.fmtDateInput(d.date || '');
    document.getElementById('debt-paid-date').value = this.fmtDateInput(d.paidDate || '');
    document.getElementById('debt-account-field').hidden = true;
    const accountSelect = document.getElementById('debt-account');
    if (accountSelect) { accountSelect.required = false; accountSelect.disabled = true; }
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
      const enteredPerson = document.getElementById('debt-person').value.trim();
      const linkedPerson = this.debtPersonForName(enteredPerson);
      const person = linkedPerson ? linkedPerson.name : enteredPerson;
      if (!person) return;
      const parseNum = (v) => { const n = this.evalAmount(v); return isNaN(n) ? 0 : n; };
      const amount = parseNum(document.getElementById('debt-amount').value);
      if (!(amount > 0)) { alert('Enter a valid amount.'); return; }
      const original = id ? this.data.debts.find(item => item.id === id) : null;
      const accountId = id ? '' : document.getElementById('debt-account').value;
      if (!id && !accountId) { this.showToast('Select an account for the debt transaction.'); return; }
      let amountPaid = original ? original.amountPaid || 0 : 0;
      if (amountPaid > amount) amountPaid = amount;
      const debtDate = this.parseDateInput(document.getElementById('debt-date').value) || this.today();
      const paidDateText = document.getElementById('debt-paid-date').value.trim();
      const paidDate = this.parseDateInput(paidDateText);
      if (paidDateText && !paidDate) { this.showToast('Enter a valid paid date (' + this.dateFormatPattern() + ').'); return; }
      const existingAdditions = original ? this.debtAdditionEntries(original).reduce((sum, entry) => sum + entry.amount, 0) : 0;
      if (existingAdditions > amount + 0.009) { this.showToast('The debt total cannot be lower than amounts already added to it.'); return; }
      const data = { person: person, personId: linkedPerson ? linkedPerson.id : null, type: document.getElementById('debt-type').value, amount: amount, openingAmount: Math.round((amount - existingAdditions) * 100) / 100, currency: document.getElementById('debt-currency').value, date: debtDate, paidDate: paidDate || '', amountPaid: amountPaid, note: document.getElementById('debt-note').value.trim(), categoryId: document.getElementById('debt-category').value || null };
      if (!this.categorySelectionAllowed(data.categoryId, debtDate, original && original.categoryId)) { alert('That category was archived for this date. Choose another category.'); return; }
      if (!this.data.debts) this.data.debts = [];
      if (id) {
        const d = this.data.debts.find(x => x.id === id);
        if (d) {
          const linkedTx = (this.data.transactions || []).filter(t => t.debtId === d.id);
          const payTx = linkedTx.filter(t => t.debtEntryType !== 'addition');
          if (linkedTx.length) {
            if (d.currency !== undefined && d.currency !== data.currency) {
              const ok = await this.confirmModal({ title: 'Edit Linked Debt', message: 'This debt has ' + linkedTx.length + ' linked transaction(s). Changing its currency may desync them.\n\nContinue?', confirmText: 'Continue' });
              if (!ok) return;
            }
            if (payTx.length) {
              const summed = payTx.reduce((s, t) => s + Math.abs(t.amount), 0);
              data.amountPaid = Math.min(Math.abs(data.amount || 0), summed);
            }
          }
          const previousPersonId = d.personId || '';
          const previousPerson = d.person || '';
          Object.assign(d, data);
          this.syncDebtLinkedTransactions(d, previousPersonId, previousPerson);
        }
      } else {
        data.id = 'debt-' + Date.now();
        this.data.debts.push(data);
        if (!this.data.transactions) this.data.transactions = [];
        const transactionId = 'tx-debt-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        data.openingTransactionId = transactionId;
        this.data.transactions.unshift(this.debtOpeningTransaction(data, accountId, transactionId));
      }
      const saved = await this.save({ undoable: true, label: id ? 'Edit debt' : 'Add debt' });
      if (!saved) return;
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
      personIds: d.personId ? [d.personId] : [],
      debtId: d.id
    };
    this.data.transactions.push(tx);
    d.amountPaid = Math.round(((d.amountPaid || 0) + amt) * 100) / 100;
    if (!d.payments) d.payments = [];
    const existingIdx = d.payments.findIndex(p => p && p.txId === txId);
    if (existingIdx < 0) {
      d.payments.push({ txId: txId, amount: amt, date: tx.date, type: type });
    }
    this.syncDebtPaidDate(d);
    await this.save({ undoable: true, label: 'Record debt payment' });
  },

  removeDebtPayment(txId) {
    const d = this.debtForPaymentTx(txId);
    if (!d) return;
    const tx = this.data.transactions.find(t => t.id === txId);
    const amt = tx ? Math.abs(tx.amount) : 0;
    this.data.transactions = this.data.transactions.filter(t => t.id !== txId);
    if (tx && tx.debtEntryType === 'addition') {
      d.amount = Math.max(0, Math.round((Math.abs(Number(d.amount) || 0) - amt) * 100) / 100);
      this.syncDebtPaidDate(d);
      return;
    }
    if (d.payments) {
      d.payments = d.payments.filter(p => p && p.txId !== txId);
    }
    d.amountPaid = Math.max(0, Math.round(((d.amountPaid || 0) - amt) * 100) / 100);
    this.syncDebtPaidDate(d);
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
      this.syncDebtPaidDate(d);
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
