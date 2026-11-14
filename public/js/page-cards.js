(function () {
Object.assign(window.BlackBook, {
  instCard(inst) {
    return this.cardById(inst.cardId) ||
      (this.data.creditCards || []).find(c => c.legacyAccountId === inst.accountId) || null;
  },

  instGrandTotal(inst) { const r = inst.ratePct != null ? inst.ratePct : 5; return Math.round(inst.total * (1 + r / 100) * 100) / 100; },
  instMonthlyAmount(inst) { return Math.round(inst.total / inst.months * 100) / 100; },
  instInterest(inst) { return Math.round((this.instGrandTotal(inst) - inst.total) * 100) / 100; },
  instBaseAmount(inst, seq) {
    if (seq === inst.months && inst.months > 1) return Math.round((inst.total - this.instMonthlyAmount(inst) * (inst.months - 1)) * 100) / 100;
    return this.instMonthlyAmount(inst);
  },
  instDueAmount(inst, seq) { return Math.round((this.instBaseAmount(inst, seq) + (seq === 1 ? this.instInterest(inst) : 0)) * 100) / 100; },
  instPaymentPairId(inst, seq) { return 'inst-' + inst.id + '-s' + seq; },
  instPaymentTxs(inst, seq, excludeTxId = '') {
    const pairId = this.instPaymentPairId(inst, seq);
    return (this.data.transactions || []).filter(tx => tx && tx.id !== excludeTxId && (tx.pairId === pairId ||
      (tx.cardBillPayment && (tx.installmentAllocations || []).some(allocation => allocation && allocation.installmentId === inst.id && Number(allocation.seq) === Number(seq)))));
  },
  instSlotPaidAmount(inst, seq, excludeTxId = '') {
    const creditStart = Math.max(0, Number(inst.advance) || 0);
    const entries = this.instPaidEntries(inst);
    let credit = creditStart, paidAtTarget = 0;
    for (let slot = 1; slot <= seq; slot++) {
      const due = this.instDueAmount(inst, slot);
      const entry = entries.find(item => item.seq === slot);
      const txs = this.instPaymentTxs(inst, slot, excludeTxId);
      const txPaid = txs.reduce((sum, tx) => {
        const allocation = (tx.installmentAllocations || []).find(item => item && item.installmentId === inst.id && Number(item.seq) === Number(slot));
        const amount = allocation ? allocation.amount : tx.amount;
        return sum + (Number.isFinite(Number(amount)) ? Math.abs(Number(amount)) : 0);
      }, 0);
      let paid = entry && entry.via === 'advance' ? due : txPaid;
      if (entry && entry.via === 'tx' && !txs.length) paid = due;
      paid = Math.min(due, Math.max(0, paid));
      const fromCredit = Math.min(credit, due - paid);
      credit = Math.max(0, credit - fromCredit);
      paid = Math.round((paid + fromCredit) * 100) / 100;
      if (slot === seq) paidAtTarget = paid;
    }
    return paidAtTarget;
  },
  instOutstanding(inst, excludeTxId = '') {
    let paid = 0;
    for (let seq = 1; seq <= inst.months; seq++) paid += this.instSlotPaidAmount(inst, seq, excludeTxId);
    return Math.max(0, Math.round((this.instGrandTotal(inst) - paid) * 100) / 100);
  },
  instIsClosed(inst) {
    if (this.instOutstanding(inst) > 0.009) return false;
    for (let s = 1; s <= inst.months; s++) if (this.instSlotPaidAmount(inst, s) < this.instDueAmount(inst, s) - 0.009) return false;
    return true;
  },
  instFeeCategory() {
    const cc = this.data.categories.find(c => (c.name || '').toLowerCase() === 'credit card');
    return cc ? cc.id : this.transferCategoryObj().id;
  },
  instPaidEntries(inst) {
    if (!inst.paid) inst.paid = [];
    if (inst.paid.length && typeof inst.paid[0] === 'number') inst.paid = inst.paid.map(s => ({ seq: s, via: 'tx' }));
    if (inst.extraPaid) { inst.advance = Math.round((((inst.advance || 0)) + inst.extraPaid) * 100) / 100; delete inst.extraPaid; }
    return inst.paid;
  },

  // ===== CREDIT CARDS PAGE =====

  renderCards() {    const el = document.getElementById('page-cards');
    if (!el) return;
    if (!this.data.creditCards) this.data.creditCards = [];
    let html = '<div class="month-picker" style="justify-content:flex-end;">' +
      '<button class="btn btn-primary" onclick="BlackBook.openNewCardTx()" title="Add a new transaction on a credit card">+ NEW PURCHASE</button></div>';
    html += this.cardsSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.cardsListHtml() + '</div>';
    el.innerHTML = html;
    this.finishFocus('card');
  },

  async openCardPlanTxs(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    const tx = inst ? this.instPurchaseTx(inst) : null;
    if (tx) this.openLinkedTransaction(tx.id);
  },

  allocateCardBillShares(plans, amount, excludeTxId = '') {
    const ordered = plans.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)));
    const shares = new Map(ordered.map(plan => [plan.id, 0]));
    const capacities = new Map(ordered.map(plan => [plan.id, Math.max(0, Math.round(this.instOutstanding(plan, excludeTxId) * 100))]));
    let centsLeft = Math.max(0, Math.round(Math.abs(Number(amount) || 0) * 100));
    while (centsLeft > 0) {
      const active = ordered.filter(plan => (capacities.get(plan.id) || 0) > (shares.get(plan.id) || 0));
      if (!active.length) break;
      const equalShare = Math.floor(centsLeft / active.length);
      const extraCents = centsLeft % active.length;
      let distributed = 0;
      active.forEach((plan, index) => {
        const requested = equalShare + (index < extraCents ? 1 : 0);
        const capacityLeft = (capacities.get(plan.id) || 0) - (shares.get(plan.id) || 0);
        const take = Math.min(requested, capacityLeft, centsLeft - distributed);
        if (take > 0) {
          shares.set(plan.id, (shares.get(plan.id) || 0) + take);
          distributed += take;
        }
      });
      if (!distributed) break;
      centsLeft -= distributed;
    }
    return new Map([...shares].map(([id, cents]) => [id, cents / 100]));
  },

  cardBillInstallmentAllocations(plans, amount, excludeTxId = '') {
    const shares = this.allocateCardBillShares(plans, amount, excludeTxId);
    const allocations = [];
    for (const plan of plans) {
      let remaining = shares.get(plan.id) || 0;
      for (let seq = 1; seq <= plan.months && remaining > 0.009; seq++) {
        const slotLeft = Math.max(0, Math.round((this.instDueAmount(plan, seq) - this.instSlotPaidAmount(plan, seq, excludeTxId)) * 100) / 100);
        const allocated = Math.min(remaining, slotLeft);
        if (allocated > 0.009) {
          allocations.push({ installmentId: plan.id, seq, amount: Math.round(allocated * 100) / 100 });
          remaining = Math.round((remaining - allocated) * 100) / 100;
        }
      }
      if (remaining > 0.009) return null;
    }
    const allocatedTotal = Math.round(allocations.reduce((sum, allocation) => sum + allocation.amount, 0) * 100) / 100;
    return Math.abs(allocatedTotal - Math.abs(Number(amount) || 0)) <= 0.009 ? allocations : null;
  },

  async applyCardBillPayment(cardId, amount, date, accountId) {
    const card = this.cardById(cardId);
    const parsed = Math.round(Math.abs(Number(amount) || 0) * 100) / 100;
    if (!card || !(parsed > 0)) return null;
    const plans = (this.data.installments || []).filter(plan => (this.instCard(plan) || {}).id === cardId && this.instOutstanding(plan) > 0.009);
    if (!plans.length) { this.showToast('There are no active purchases to pay on this card.'); return null; }
    const totalOutstanding = Math.round(plans.reduce((sum, plan) => sum + this.instOutstanding(plan), 0) * 100) / 100;
    if (parsed > totalOutstanding + 0.009) { this.showToast('That amount is higher than the tracked balance on this card.'); return null; }
    const account = (this.data.accounts || []).find(item => item.id === accountId && !item.hidden && item.type !== 'credit' && item.type !== 'creditcard');
    if (!account) { this.showToast('Select an account to pay this card bill from.'); return null; }
    const baseCurrency = this.baseCurrency() || 'RSD';
    const accountCurrency = account.currency || baseCurrency;
    const accountAmount = accountCurrency === baseCurrency ? parsed : this.convertBetweenCurrencies(parsed, baseCurrency, accountCurrency);
    if (!(Number.isFinite(accountAmount) && accountAmount > 0)) { this.showToast('Set an exchange rate for ' + accountCurrency + ' before recording this payment.'); return null; }
    const allocations = this.cardBillInstallmentAllocations(plans, parsed);
    if (!allocations) { this.showToast('The payment could not be fully allocated across the active purchases.'); return null; }
    const tx = {
      id: 'tx-card-bill-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      date: date || this.today(),
      type: 'expense',
      amount: -Math.round(accountAmount * 100) / 100,
      currency: accountCurrency,
      accountId: account.id,
      cardBillPaymentId: card.id,
      cardBillPayment: true,
      installmentAllocations: allocations,
      categoryId: this.instFeeCategory(),
      note: 'Credit card payment · ' + card.name
    };
    if (accountCurrency !== baseCurrency) {
      tx.nativeAmount = -parsed;
      tx.nativeCurrency = baseCurrency;
    }
    if (!this.data.transactions) this.data.transactions = [];
    this.data.transactions.push(tx);
    if (this.syncViewToDate) this.syncViewToDate(tx.date);
    const saved = await this.save({ undoable: true, label: 'Pay credit card bill' });
    if (!saved) this.data.transactions = this.data.transactions.filter(item => item.id !== tx.id);
    return saved ? tx : null;
  },

  adjustCardBillPaymentForEdit(transaction, updatedTransaction) {
    if (updatedTransaction.type !== 'expense' || updatedTransaction.parts) {
      return { ok: false, message: 'Keep a card bill payment as one expense. Its item allocations are managed on the Cards page.' };
    }
    const baseCurrency = this.baseCurrency() || 'RSD';
    const amountInBase = updatedTransaction.nativeAmount != null && updatedTransaction.nativeCurrency === baseCurrency
      ? Math.abs(Number(updatedTransaction.nativeAmount) || 0)
      : (updatedTransaction.currency || baseCurrency) === baseCurrency
        ? Math.abs(Number(updatedTransaction.amount) || 0)
        : this.convertBetweenCurrencies(Math.abs(Number(updatedTransaction.amount) || 0), updatedTransaction.currency, baseCurrency);
    if (!(Number.isFinite(amountInBase) && amountInBase > 0)) return { ok: false, message: 'Set a valid amount and exchange rate for this card payment.' };
    const plans = (this.data.installments || []).filter(plan => (this.instCard(plan) || {}).id === transaction.cardBillPaymentId && this.instOutstanding(plan, transaction.id) > 0.009);
    const totalOutstanding = plans.reduce((sum, plan) => sum + this.instOutstanding(plan, transaction.id), 0);
    if (amountInBase > totalOutstanding + 0.009) return { ok: false, message: 'That amount is higher than the tracked card balance.' };
    const allocations = this.cardBillInstallmentAllocations(plans, amountInBase, transaction.id);
    if (!allocations) return { ok: false, message: 'The edited amount could not be allocated across the active purchases.' };
    updatedTransaction.installmentAllocations = allocations;
    return { ok: true };
  },

  openMobileCardBill() {
    const activeCards = (this.data.creditCards || []).filter(card =>
      (this.data.installments || []).some(plan => (this.instCard(plan) || {}).id === card.id && this.instOutstanding(plan) > 0.009));
    if (!activeCards.length) { this.showToast('No card payment is due.'); return; }
    if (activeCards.length === 1) { this.openPayCardBill(activeCards[0].id); return; }
    document.getElementById('mobile-card-bill-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'mobile-card-bill-picker';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content" style="max-width:420px;"><div class="modal-header"><span class="modal-title">PAY BILL</span><button type="button" class="modal-close" aria-label="Close">&times;</button></div><div class="mobile-card-bill-options"></div></div>';
    const close = () => this.closeModal('mobile-card-bill-picker');
    modal.querySelector('.modal-backdrop').addEventListener('click', close);
    modal.querySelector('.modal-close').addEventListener('click', close);
    const options = modal.querySelector('.mobile-card-bill-options');
    activeCards.forEach(card => {
      const outstanding = (this.data.installments || []).filter(plan => (this.instCard(plan) || {}).id === card.id).reduce((sum, plan) => sum + this.instOutstanding(plan), 0);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary mobile-card-bill-option';
      button.innerHTML = '<span>' + this.escapeHtml(card.name) + '</span><strong>' + this.escapeHtml(this.fmtBase(outstanding)) + '</strong>';
      button.addEventListener('click', () => { close(); this.openPayCardBill(card.id); });
      options.appendChild(button);
    });
    document.body.appendChild(modal);
    this.openModal(modal.id);
  },

  openPayCardBill(cardId) {
    const card = this.cardById(cardId);
    if (!card) return;
    const accounts = this.visibleAccounts();
    if (!accounts.length) { this.showToast('Set a funding account before paying a credit card bill.'); return; }
    const defaultId = this.fundingAccountId();
    const accountOptions = accounts.map(account => '<option value="' + this.escapeHtml(account.id) + '"' + (account.id === defaultId ? ' selected' : '') + '>' + this.escapeHtml(account.name + (account.currency && account.currency !== this.baseCurrency() ? ' (' + account.currency + ')' : '')) + '</option>').join('');
    const outstanding = (this.data.installments || []).filter(plan => (this.instCard(plan) || {}).id === card.id).reduce((sum, plan) => sum + this.instOutstanding(plan), 0);
    const existing = document.getElementById('pay-card-bill-modal');
    if (existing) existing.remove();
    const wrapper = document.createElement('div');
    wrapper.id = 'pay-card-bill-modal';
    wrapper.className = 'modal hidden';
    wrapper.innerHTML = '<div class="modal-backdrop" onclick="BlackBook.closeModal(\'pay-card-bill-modal\')"></div><div class="modal-content" style="max-width:420px;">' +
      '<div class="modal-header"><span class="modal-title">Pay Bill · ' + this.escapeHtml(card.name) + '</span><button class="modal-close" onclick="BlackBook.closeModal(\'pay-card-bill-modal\')">&times;</button></div>' +
      '<div style="padding:14px;"><div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Outstanding across active purchases: ' + this.fmtBase(outstanding) + '. Payment is divided evenly across them.</div>' +
      '<div class="form-group"><label for="pay-card-bill-amount">Amount Paid</label><input type="text" inputmode="decimal" id="pay-card-bill-amount" class="input" placeholder="AMOUNT" autocomplete="off"></div>' +
      '<div class="form-row-2col"><div class="form-group"><label for="pay-card-bill-date">Date</label><input type="text" inputmode="numeric" id="pay-card-bill-date" class="input" placeholder="DD/MM/YYYY" value="' + this.escapeHtml(this.fmtDateInput(this.today())) + '" autocomplete="off"></div>' +
      '<div class="form-group"><label for="pay-card-bill-account">Pay From</label><select id="pay-card-bill-account" class="input">' + accountOptions + '</select></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;"><button class="btn btn-sm btn-secondary" onclick="BlackBook.closeModal(\'pay-card-bill-modal\')">CANCEL</button><button class="btn btn-sm btn-primary" onclick="BlackBook.submitPayCardBill(\'' + card.id + '\')">PAY BILL</button></div></div></div>';
    document.body.appendChild(wrapper);
    this.openModal('pay-card-bill-modal');
    const accountSelect = document.getElementById('pay-card-bill-account');
    if (accountSelect) this.syncCustomSelect(accountSelect);
    const amountInput = document.getElementById('pay-card-bill-amount');
    if (amountInput) {
      amountInput.focus();
      amountInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); this.submitPayCardBill(card.id); } });
    }
  },

  async submitPayCardBill(cardId) {
    const amount = this.evalAmount((document.getElementById('pay-card-bill-amount') || {}).value || '');
    if (!(amount > 0)) { this.showToast('Enter a valid payment amount.'); return; }
    const rawDate = (document.getElementById('pay-card-bill-date') || {}).value || '';
    const date = this.parseDateInput(rawDate);
    if (!date) { this.showToast('Enter a valid date (' + this.dateFormatPattern() + ').'); return; }
    const accountId = (document.getElementById('pay-card-bill-account') || {}).value || '';
    const tx = await this.applyCardBillPayment(cardId, amount, date, accountId);
    if (!tx) return;
    this.closeModal('pay-card-bill-modal');
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  installmentProgressMarkers(plan) {
    const count = Math.max(1, Math.floor(Number(typeof plan === 'object' ? plan.months : plan) || 1));
    if (count < 2) return '';
    const amounts = typeof plan === 'object'
      ? Array.from({ length: count }, (_, i) => this.instDueAmount(plan, i + 1))
      : Array(count).fill(1);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    let cumulative = 0;
    return amounts.slice(0, -1).map(amount => {
      cumulative += amount;
      return '<i class="inst-progress-marker" style="left:' + (total > 0 ? (cumulative / total * 100) : 0) + '%;"></i>';
    }).join('');
  },

  instPaymentTx(inst, seq) {
    return this.instPaymentTxs(inst, seq)[0] || null;
  },

  cardsSummaryHtml() {
    const cards = this.data.creditCards || [];
    let totalOwed = 0, totalPlanned = 0;
    for (const inst of this.data.installments) {
      const card = this.instCard(inst);
      if (!card) continue;
      totalOwed += this.instOutstanding(inst);
      totalPlanned += this.instGrandTotal(inst);
    }
    const pct = totalPlanned > 0 ? Math.min(Math.round((totalPlanned - totalOwed) / totalPlanned * 100), 100) : 0;
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">TOTAL DEBT</span><span class="month-summary-value amount-negative">' + this.fmtBase(totalOwed) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">PAID OFF</span><span class="month-summary-value amount-positive">' + pct + '%</span></div></div>';
  },

  cardsListHtml() {
    const cards = this.data.creditCards || [];
    if (!cards.length) return '<div class="empty-state"><div class="empty-state-text">No credit cards yet. Add one on the Settings page.</div></div>';
    return cards.map(c => this.cardBlockHtml(c)).join('');
  },

  cardBlockHtml(card) {
    const plans = this.data.installments.filter(i => (this.instCard(i) || {}).id === card.id);
    const debt = plans.reduce((s, p) => s + this.instOutstanding(p), 0);
    const activePlans = plans.filter(plan => this.instOutstanding(plan) > 0.009);
    let html = '<div class="card-block' + this.focusRecordHtml('card', card.id) + '">' +
      '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + this.cardColor(card) + ';"></span> ' + this.escapeHtml(card.name) + '</span>' +
      '<span class="savings-actions">' + (activePlans.length ? '<button class="btn btn-sm btn-primary mobile-card-inline-pay" onclick="BlackBook.openPayCardBill(\'' + card.id + '\')" title="Record one payment for this card and split it across active purchases">PAY BILL</button>' : '') + '</span>' +
      '</div>' +
      '<div class="bill-meta-line" style="display:block;margin-bottom:6px;">INT ' + (card.ratePct != null ? card.ratePct : 5) + '% &middot; DUE DAY ' + (card.dueDay || 15) + ' &middot; DEBT ' + this.fmtBase(debt) + '</div>';
    if (!plans.length) html += '<div class="empty-state" style="padding:14px;"><div class="empty-state-text">No purchases yet. Click + NEW to add a transaction.</div></div>';
    else html += this.cardBillPaymentHistoryHtml(card) + plans.map(p => this.planBlockHtml(p)).join('');
    return html + '</div>';
  },

  cardBillPaymentHistoryHtml(card) {
    const payments = (this.data.transactions || []).filter(tx => tx && tx.cardBillPayment && tx.cardBillPaymentId === card.id)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)));
    if (!payments.length) return '';
    const rows = payments.map(tx => '<div class="linked-payment-row"><span class="linked-payment-date">' + this.escapeHtml(this.fmtDateInput(tx.date) || '—') + '</span><span class="linked-payment-amount">' + this.fmtAmount(Math.abs(tx.amount || 0), tx.currency || this.baseCurrency()) + '</span><span class="linked-payment-actions">' +
      this.linkedTransactionButton(tx.id) + '<button type="button" class="btn btn-sm btn-danger btn-icon" title="Delete this card payment" aria-label="Delete this card payment" onclick="BlackBook.deleteTransaction(\'' + this.escapeHtml(tx.id) + '\')">' + this.xIcon() + '</button></span></div>').join('');
    return '<details class="item-details card-payment-history"><summary>CARD PAYMENT HISTORY · ' + payments.length + '</summary><div class="linked-payment-history">' + rows + '</div></details>';
  },

planBlockHtml(inst) {
    const card = this.instCard(inst) || {};
    const color = this.cardColor(card);
    const closed = this.instIsClosed(inst);
    const paidEntries = this.instPaidEntries(inst);
    const paidCount = closed ? inst.months : Array.from({ length: inst.months }, (_, i) => i + 1)
      .filter(seq => this.instSlotPaidAmount(inst, seq) >= this.instDueAmount(inst, seq) - 0.009).length;
    const outstanding = this.instOutstanding(inst);
    const grandTotal = this.instGrandTotal(inst);
    const pct = grandTotal > 0 ? Math.min(Math.round((grandTotal - outstanding) / grandTotal * 100), 100) : 0;
    const advance = inst.advance || 0;
    const tx = this.instPurchaseTx(inst);
    let html = '<div class="plan-card' + this.focusRecordHtml('card', inst.id) + '" data-mobile-plan-id="' + this.escapeHtml(inst.id) + '" data-mobile-tx-id="' + this.escapeHtml(tx ? tx.id : '') + '"' + (closed ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name">' + this.escapeHtml(inst.name) + this.healthMarker('installments', inst.id) + '</span>' +
      '<span class="savings-actions">' +
      (tx ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openCardPlanTxs(\x27' + inst.id + '\x27)" title="View this plan\u2019s transactions">LINK</button>' : '') +
      '<span class="inst-count-badge"' + (closed ? ' style="border-color:' + color + ';color:var(--on-fill);background:' + color + ';"' : '') + '>' + paidCount + '/' + inst.months + ' PAID</span>' +
      (tx ? '<button class="btn btn-sm btn-secondary mobile-card-edit" onclick="BlackBook.openEditCardTx(\x27' + tx.id + '\x27)" title="Edit this purchase">EDIT</button>' : '') +
      '<button class="btn btn-sm btn-danger btn-icon mobile-card-delete" title="Delete installment plan" onclick="BlackBook.deleteInstallment(\x27' + inst.id + '\x27)">' + this.xIcon() + '</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + (closed ? '&#10003; FULLY PAID OFF' :
      'LEFT ' + this.fmtBase(this.instOutstanding(inst)) + ' of ' + this.fmtBase(this.instGrandTotal(inst))) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar inst-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + color + ';"></div>' + this.installmentProgressMarkers(inst) + '</div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      this.fmtBase(this.instMonthlyAmount(inst)) + ' &times; ' + inst.months +
      ' &middot; PRICE ' + this.fmtBase(inst.total) + ' + INT ' + (inst.ratePct != null ? inst.ratePct : 5) + '% (' + this.fmtBase(this.instInterest(inst)) + ') = TOTAL ' + this.fmtBase(this.instGrandTotal(inst)) +
      ' &middot; DUE ' + (inst.dueDay || 15) + '/mo &middot; FROM ' + inst.startMonth +
      (advance > 0 ? ' &middot; <span class="amount-positive">ADVANCE ' + this.fmtBase(advance) + '</span>' : '') + '</div>';
    html += '<details class="item-details"><summary>PAYMENT HISTORY · ' + paidCount + '/' + inst.months + '</summary>';
    html += '<div class="inst-rows">';
    for (let s = 1; s <= inst.months; s++) {
      const entry = paidEntries.find(e => e.seq === s);
      const due = this.instDueAmount(inst, s);
      const slotPaid = this.instSlotPaidAmount(inst, s);
      const slotComplete = slotPaid >= due - 0.009;
      const slotPartial = slotPaid > 0.009 && !slotComplete;
      const mk = this.mkOfSeq(inst, s);
      const paymentTxs = entry && entry.via === 'advance' ? [] : this.instPaymentTxs(inst, s);
      const paymentTx = paymentTxs[0] || null;
      html += '<div class="inst-row' + (slotComplete ? ' inst-row-paid' : slotPartial ? ' inst-row-partial' : '') + '">' +
        '<span class="inst-seq">' + String(s).padStart(2, '0') + '</span>' +
        '<span class="inst-month">' + this.monthLabel(mk) + '</span>' +
        '<span class="inst-amt">' + (slotPartial ? this.fmtBase(slotPaid) + ' of ' : '') + this.fmtBase(due) + (s === 1 ? ' <span class="tip-dim">(incl INT)</span>' : '') + '</span>' +
        '<span class="inst-paid-date">' + (slotPaid > 0 ? (paymentTx ? this.fmtDateInput(paymentTx.date) : (entry && entry.via === 'advance' ? 'ADVANCE' : 'PAID')) : '') + '</span>' +
        '<span class="inst-status ' + (slotComplete ? 'amount-positive' : slotPartial ? 'amount-negative' : 'tip-dim') + '">' + (slotComplete ? 'PAID' : slotPartial ? 'PARTIAL' : 'DUE') + '</span>' +
        '<span class="inst-tx-link">' + paymentTxs.map(item => this.linkedTransactionButton(item.id)).join('') + '</span>' +
        '</div>';
    }
    html += '</div></details></div>';
    return html;
  },

  instPurchaseTx(inst) {
    return (this.data.transactions || []).find(t => {
      if (!t || t.cardId !== inst.cardId) return false;
      if (t.installId && t.installId === inst.id) return true;
      return Math.abs(Math.abs(t.amount) - inst.total) < 0.009 && t.note === inst.name;
    }) || null;
  },

  mkOfSeq(inst, seq) {
    const y = parseInt(inst.startMonth.slice(0, 4), 10), m = parseInt(inst.startMonth.slice(5, 7), 10) - 1;
    const t = y * 12 + m + (seq - 1);
    return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
  },

  monthLabel(mk) {
    const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return M[parseInt(mk.slice(5, 7), 10) - 1] + ' ' + mk.slice(0, 4);
  },

  async payInstallmentSlot(instId, seq) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst || seq < 1 || seq > inst.months) return;
    const paidEntries = this.instPaidEntries(inst);
    const entry = paidEntries.find(e => e.seq === seq);
    const due = this.instDueAmount(inst, seq);
    const slotPaid = this.instSlotPaidAmount(inst, seq);
    if (slotPaid < due - 0.009) return this.openPayInstallment(instId, seq);
    const pairId = this.instPaymentPairId(inst, seq);
    const txs = this.instPaymentTxs(inst, seq);
    const directPaid = txs.reduce((sum, tx) => sum + (Number.isFinite(Number(tx.amount)) ? Math.abs(Number(tx.amount)) : 0), 0);
    const advanceApplied = Math.max(0, slotPaid - Math.min(due, directPaid));
    inst.paid = paidEntries.filter(e => e.seq !== seq);
    if (entry && entry.via === 'advance') inst.advance = Math.round(((inst.advance || 0) + due) * 100) / 100;
    else if (advanceApplied > 0) inst.advance = Math.max(0, Math.round(((inst.advance || 0) - advanceApplied) * 100) / 100);
    this.data.transactions = this.data.transactions.filter(t => t.pairId !== pairId);
    await this.save({ undoable: true, label: 'Change installment payment' });
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  createInstPaymentTx(inst, seq, amount = this.instDueAmount(inst, seq)) {
    const fundingAccId = this.fundingAccountId();
    if (!fundingAccId) return;
    const acc = this.data.accounts.find(a => a.id === fundingAccId);
    const catId = this.instFeeCategory();
    const pairId = this.instPaymentPairId(inst, seq);
    const txId = 'tx-' + pairId + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const date = this.mkOfSeq(inst, seq) + '-' + String(inst.dueDay || 15).padStart(2, '0');
    const note = 'Installment ' + inst.name + ' ' + seq + '/' + inst.months;
    this.data.transactions.unshift({ id: txId, type: 'expense', amount: -amount, currency: acc.currency || this.baseCurrency() || 'RSD', accountId: fundingAccId, categoryId: catId, date: date, note: note, pairId: pairId });
  },

  openPayInstallment(instId, seq = null) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (seq != null && (seq < 1 || seq > inst.months)) return;
    const due = seq == null ? this.instOutstanding(inst) : this.instDueAmount(inst, seq) - this.instSlotPaidAmount(inst, seq);
    const html = '<div class="modal-backdrop" onclick="BlackBook.closeModal(\'pay-installment-modal\')"></div>' +
      '<div class="modal-content" style="max-width:360px;">' +
      '<div class="modal-header"><span class="modal-title">Pay ' + this.escapeHtml(inst.name) + (seq == null ? '' : ' · ' + seq + '/' + inst.months) + '</span><button class="modal-close" onclick="BlackBook.closeModal(\'pay-installment-modal\')">&times;</button></div>' +
      '<div style="padding:14px;">' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">' + (seq == null ? 'Outstanding: ' : 'Remaining on installment: ') + this.fmtBase(due) + '</div>' +
      '<label style="font-size:12px;color:var(--text-muted);">AMOUNT</label>' +
      '<input type="text" inputmode="decimal" id="pay-inst-amount" class="input" style="width:100%;margin-top:4px;" placeholder="Enter amount" autofocus>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.closeModal(\'pay-installment-modal\')">CANCEL</button>' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.submitPayInstallment(\x27' + instId + '\x27,' + (seq == null ? 'null' : seq) + ')">PAY</button>' +
      '</div></div></div>';
    const wrapper = document.createElement('div');
    wrapper.id = 'pay-installment-modal';
    wrapper.className = 'modal hidden';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    this.openModal('pay-installment-modal');
    const inp = document.getElementById('pay-inst-amount');
    if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.submitPayInstallment(instId, seq); } }); }
  },

  async submitPayInstallment(instId, seq = null) {
    const inp = document.getElementById('pay-inst-amount');
    const rawVal = inp ? String(inp.value || '').trim() : '';
    this.closeModal('pay-installment-modal');
    if (!rawVal) { await this.confirmModal({ title: 'Pay Installment', message: 'Enter an amount first.', danger: false }); return; }
    await this.customPayInstallments(instId, rawVal, seq);
  },

  async customPayInstallments(instId, rawVal, targetSeq = null) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (targetSeq != null && (Number(targetSeq) < 1 || Number(targetSeq) > inst.months)) return;
    if (targetSeq != null && this.instDueAmount(inst, Number(targetSeq)) - this.instSlotPaidAmount(inst, Number(targetSeq)) <= 0.009) {
      await this.confirmModal({ title: 'Pay Installment', message: 'This installment is already paid.', danger: false });
      return;
    }
    if (!rawVal) { await this.confirmModal({ title: 'Pay Installment', message: 'Enter an amount first.', danger: false }); return; }
    const paidEntries = this.instPaidEntries(inst);
    const outstanding = this.instOutstanding(inst);
    if (!(outstanding > 0)) { await this.confirmModal({ title: 'Pay Installment', message: 'Nothing left to pay on this plan.', danger: false }); return; }
    let amt = this.evalAmount(rawVal);
    if (!(amt > 0)) { await this.confirmModal({ title: 'Pay Installment', message: 'Enter a valid amount.', danger: false }); return; }
    let rem = amt, cleared = 0;
    const slots = targetSeq == null ? Array.from({ length: inst.months }, (_, i) => i + 1) : [Number(targetSeq)];
    for (const s of slots) {
      const due = this.instDueAmount(inst, s);
      const alreadyPaid = this.instSlotPaidAmount(inst, s);
      const remaining = Math.max(0, Math.round((due - alreadyPaid) * 100) / 100);
      if (remaining <= 0.009) continue;
      const payment = Math.min(rem, remaining);
      if (payment <= 0) break;
      this.createInstPaymentTx(inst, s, payment);
      rem = Math.round((rem - payment) * 100) / 100;
      if (payment >= remaining - 0.009) {
        if (!paidEntries.some(e => e.seq === s)) paidEntries.push({ seq: s, via: 'tx' });
        cleared++;
      }
      if (rem <= 0.009) break;
    }
    if (rem > 0) {
      inst.advance = Math.round(((inst.advance || 0) + rem) * 100) / 100;
      const fundingAccId = this.fundingAccountId();
      if (fundingAccId) {
        const acc = this.data.accounts.find(a => a.id === fundingAccId);
        const pid = 'inst-' + inst.id + '-adv-' + Date.now();
        this.data.transactions.unshift({ id: 'tx-' + pid, type: 'expense', amount: -rem, currency: acc.currency || this.baseCurrency() || 'RSD', accountId: fundingAccId, categoryId: this.instFeeCategory(), date: this.today(), note: 'Advance ' + inst.name, pairId: pid });
      }
    }
    await this.save({ undoable: true, label: 'Pay installment' });
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  async deleteInstallment(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (!(await this.confirmModal({ title: 'Delete Plan', message: 'Delete purchase plan "' + inst.name + '"? Paid payments stay as transactions.' , confirmText: 'Delete' }))) return;
    const pid = 'inst-' + inst.id + '-';
    for (const transaction of (this.data.transactions || [])) {
      if (transaction && transaction.cardBillPayment && Array.isArray(transaction.installmentAllocations)) {
        transaction.installmentAllocations = transaction.installmentAllocations.filter(allocation => allocation.installmentId !== instId);
      }
    }
    this.data.installments = this.data.installments.filter(i => i.id !== instId);
    this.data.transactions = this.data.transactions.filter(t => !t.pairId || t.pairId.indexOf(pid) !== 0);
    await this.save({ undoable: true, label: 'Delete purchase plan' });
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  openNewCreditCard() {
    this.openNewAccount();
    const typeSel = document.getElementById('settings-account-type');
    if (typeSel) { typeSel.value = 'creditcard'; this.updateCreditFieldsVisibility(); }
    document.getElementById('settings-account-modal-title').textContent = 'New Credit Card';
  },

  openNewCardTx(cardId) {
    const cards = this.data.creditCards || [];
    if (!cards.length) { alert('Add a credit card on the Settings page first.'); return; }
    const sorted = cards.slice().sort((a, b) => a.name.localeCompare(b.name));
    let cur = cardId || sorted[0].id;
    if (!sorted.some(c => c.id === cur)) cur = sorted[0].id;
    const sel = document.getElementById('ctx-card');
    if (sel) sel.innerHTML = sorted.map(c => '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    const card = this.cardById(cur);
    document.getElementById('ctx-edit-id').value = '';
    document.getElementById('ctx-amount').value = '';
    document.getElementById('ctx-date').value = this.fmtDateInput(this.today());
    document.getElementById('ctx-note').value = '';
    document.getElementById('ctx-months').value = '1';
    const catInput = document.getElementById('ctx-category-input');
    const catHidden = document.getElementById('ctx-category');
    if (catInput && catHidden) {
      catHidden.value = '';
      catInput.value = '';
      this.initCategoryPicker('ctx-category-input', 'ctx-category', 'ctx-category-dropdown');
    }
    const cats = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    const def = this.categoriesAvailableOn(this.today()).some(c => c.id === this.data.settings.defaultCategoryId) ? this.data.settings.defaultCategoryId : null;
    if (def) { catHidden.value = def; catInput.value = this.data.categories.find(c => c.id === def)?.name?.toUpperCase() || ''; }
    document.getElementById('card-tx-title').textContent = 'New \u2014 ' + (card ? card.name : 'Credit Card');
    this.bindCardTxForm();
    this.openModal('card-tx-modal');
    setTimeout(() => document.getElementById('ctx-amount').focus(), 50);
  },

  openEditCardTx(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx || !tx.cardId) return;
    const card = this.cardById(tx.cardId);
    if (!card) return;
    const inst = this.data.installments.find(i => i.cardId === card.id && i.name === (tx.note || 'Purchase') && i.total === Math.abs(tx.amount));
    const months = inst ? inst.months : 1;
    const cards = this.data.creditCards || [];
    const sorted = cards.slice().sort((a, b) => a.name.localeCompare(b.name));
    const sel = document.getElementById('ctx-card');
    if (sel) sel.innerHTML = sorted.map(c => '<option value="' + c.id + '"' + (c.id === card.id ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('ctx-edit-id').value = tx.id;
    const purchaseCurrency = card.currency || this.baseCurrency();
    document.getElementById('ctx-amount').value = tx.nativeCurrency === purchaseCurrency && tx.nativeAmount != null ? Math.abs(tx.nativeAmount) : this.convertBetweenCurrencies(Math.abs(tx.amount), tx.currency || this.baseCurrency(), purchaseCurrency) ?? '';
    document.getElementById('ctx-date').value = this.fmtDateInput(tx.date);
    document.getElementById('ctx-note').value = tx.note || '';
    document.getElementById('ctx-months').value = String(months);
    const catInput = document.getElementById('ctx-category-input');
    const catHidden = document.getElementById('ctx-category');
    if (catInput && catHidden) {
      catHidden.value = tx.categoryId || '';
      catInput.value = tx.categoryId ? this.data.categories.find(c => c.id === tx.categoryId)?.name?.toUpperCase() || '' : '';
      this.initCategoryPicker('ctx-category-input', 'ctx-category', 'ctx-category-dropdown');
    }
    const cats = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById('card-tx-title').textContent = 'Edit \u2014 ' + card.name;
    this.bindCardTxForm();
    this.openModal('card-tx-modal');
    setTimeout(() => document.getElementById('ctx-amount').focus(), 50);
  },

  bindCardTxForm() {
    const f = document.getElementById('card-tx-form');
    if (!f || f._bound) return;
    f._bound = true;
    const cardSel = document.getElementById('ctx-card');
    if (cardSel) cardSel.addEventListener('change', () => {
      const c = this.cardById(cardSel.value);
      document.getElementById('card-tx-title').textContent = c ? 'New \u2014 ' + c.name : 'New Transaction';
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cardId = document.getElementById('ctx-card').value;
      const card = this.cardById(cardId);
      if (!card) return;
      let amt = this.evalAmount(document.getElementById('ctx-amount').value);
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      const nativeAmount = amt;
      const nativeCurrency = card.currency || this.baseCurrency();
      amt = this.convertBetweenCurrencies(nativeAmount, nativeCurrency, this.baseCurrency());
      if (!(amt > 0)) { this.showToast('Set an exchange rate for ' + nativeCurrency + ' before saving.'); return; }
      const date = this.parseDateInput(document.getElementById('ctx-date').value) || this.today();
      const note = document.getElementById('ctx-note').value.trim();
      const months = parseInt(document.getElementById('ctx-months').value, 10) || 1;
      const categoryId = document.getElementById('ctx-category').value;
      const editId = document.getElementById('ctx-edit-id').value;
      const original = editId ? this.data.transactions.find(t => t.id === editId) : null;
      if (!this.categorySelectionAllowed(categoryId, date, original && original.categoryId)) { alert('That category was archived for this date. Choose another category.'); return; }
      if (editId) {
        const tx = this.data.transactions.find(t => t.id === editId);
        if (!tx) return;
        const oldAmt = Math.abs(tx.amount);
        tx.amount = -amt;
        tx.currency = this.baseCurrency();
        tx.nativeAmount = -nativeAmount;
        tx.nativeCurrency = nativeCurrency;
        tx.date = date;
        tx.note = note;
        tx.categoryId = categoryId;
        if (tx.cardId !== cardId) { tx.cardId = cardId; tx.installId = null; }
        let inst = null;
        if (tx.installId) inst = this.data.installments.find(i => i.id === tx.installId);
        if (!inst) inst = this.data.installments.find(i => i.cardId === cardId && Math.abs(i.total - oldAmt) < 0.009);
        if (inst) {
          if (months <= 1) {
            this.data.installments = this.data.installments.filter(i => i.id !== inst.id);
            tx.installId = null;
          } else {
            inst.name = note || 'Purchase';
            inst.total = amt;
            inst.months = months;
            inst.ratePct = card.ratePct != null ? card.ratePct : 5;
            tx.installId = inst.id;
          }
        } else if (months > 1) {
          if (!this.data.installments) this.data.installments = [];
          const { y, m } = this.ymOf(date);
          const plan = {
            id: 'inst-' + Date.now(), cardId: cardId, name: note || 'Purchase',
            total: amt, months: months,
            startMonth: y + '-' + String(m + 1).padStart(2, '0'),
            dueDay: card.dueDay || 15,
            ratePct: card.ratePct != null ? card.ratePct : 5,
            paid: [], advance: 0
          };
          this.data.installments.push(plan);
          tx.installId = plan.id;
        }
      } else {
        const newTx = { id: crypto.randomUUID(), date: date, type: 'expense', amount: -amt, currency: this.baseCurrency(), nativeAmount: -nativeAmount, nativeCurrency: nativeCurrency, accountId: null, cardId: cardId, categoryId: categoryId, note: note };
        if (months > 1) {
          if (!this.data.installments) this.data.installments = [];
          const { y, m } = this.ymOf(date);
          const plan = {
            id: 'inst-' + Date.now(), cardId: cardId, name: note || 'Purchase',
            total: amt, months: months,
            startMonth: y + '-' + String(m + 1).padStart(2, '0'),
            dueDay: card.dueDay || 15,
            ratePct: card.ratePct != null ? card.ratePct : 5,
            paid: [], advance: 0
          };
          this.data.installments.push(plan);
          newTx.installId = plan.id;
        }
        this.data.transactions.push(newTx);
      }
      this.syncViewToDate(date);
      await this.save({ undoable: true, label: 'Change card transaction' });
      this.closeModal('card-tx-modal');
      this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
    });
  },

  async deleteCard(id) {
    const card = this.cardById(id);
    if (!card) return;
    const plans = this.data.installments.filter(i => (this.instCard(i) || {}).id === id);
    const msg = plans.length ? '"' + card.name + '" has ' + plans.length + ' purchase plan' + (plans.length === 1 ? '' : 's') + '.\n\nConfirm = delete the card AND its plans.\nCancel = do nothing.' : 'Delete card "' + card.name + '"?';
    if (!(await this.confirmModal({ title: 'Delete Card', message: msg, confirmText: 'Delete' }))) return;
    const planIds = plans.map(p => p.id);
    this.data.creditCards = this.data.creditCards.filter(c => c.id !== id);
    this.data.installments = this.data.installments.filter(i => planIds.indexOf(i.id) === -1);
    await this.save({ undoable: true, label: 'Delete credit card' });
    this.renderPage(this.currentPage);
  },

});
})();
