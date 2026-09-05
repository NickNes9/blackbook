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
  instOutstanding(inst) {
    let paid = inst.advance || 0;
    for (const e of this.instPaidEntries(inst)) paid += this.instDueAmount(inst, e.seq);
    return Math.max(0, Math.round((this.instGrandTotal(inst) - paid) * 100) / 100);
  },
  instIsClosed(inst) {
    if (this.instOutstanding(inst) > 0.009) return false;
    const entries = this.instPaidEntries(inst);
    for (let s = 1; s <= inst.months; s++) if (!entries.some(e => e.seq === s)) return false;
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
    if (tx && tx.date) this.syncViewToDate(tx.date);
    this.navigateTo('overview');
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
    let html = '<div class="card-block">' +
      '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + this.cardColor(card) + ';"></span> ' + this.escapeHtml(card.name) + '</span>' +
      '</div>' +
      '<div class="bill-meta-line" style="display:block;margin-bottom:6px;">INT ' + (card.ratePct != null ? card.ratePct : 5) + '% &middot; DUE DAY ' + (card.dueDay || 15) + ' &middot; DEBT ' + this.fmtBase(debt) + '</div>';
    if (!plans.length) html += '<div class="empty-state" style="padding:14px;"><div class="empty-state-text">No purchases yet. Click + NEW to add a transaction.</div></div>';
    else html += plans.map(p => this.planBlockHtml(p)).join('');
    return html + '</div>';
  },

planBlockHtml(inst) {
    const card = this.instCard(inst) || {};
    const color = this.cardColor(card);
    const closed = this.instIsClosed(inst);
    const paidEntries = this.instPaidEntries(inst);
    const paidCount = closed ? inst.months : paidEntries.length;
    const outstanding = this.instOutstanding(inst);
    const grandTotal = this.instGrandTotal(inst);
    const pct = grandTotal > 0 ? Math.min(Math.round((grandTotal - outstanding) / grandTotal * 100), 100) : 0;
    const advance = inst.advance || 0;
    const tx = this.instPurchaseTx(inst);
    let html = '<div class="plan-card' + this.focusRecordHtml('card', inst.id) + '"' + (closed ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name">' + this.escapeHtml(inst.name) + '</span>' +
      '<span class="savings-actions">' +
      (tx ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openCardPlanTxs(\x27' + inst.id + '\x27)" title="View this plan\u2019s transactions">LINK</button>' : '') +
      '<span class="inst-count-badge"' + (closed ? ' style="border-color:' + color + ';color:var(--on-fill);background:' + color + ';"' : '') + '>' + paidCount + '/' + inst.months + ' PAID</span>' +
      (closed ? '' : '<button class="btn btn-sm btn-primary" onclick="BlackBook.openPayInstallment(\x27' + inst.id + '\x27)" title="Pay toward this plan">PAY</button>') +
      (tx ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditCardTx(\x27' + tx.id + '\x27)" title="Edit this purchase">EDIT</button>' : '') +
      '<button class="btn btn-sm btn-danger btn-icon" title="Delete installment plan" onclick="BlackBook.deleteInstallment(\x27' + inst.id + '\x27)">' + this.xIcon() + '</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + (closed ? '&#10003; FULLY PAID OFF' :
      'LEFT ' + this.fmtBase(this.instOutstanding(inst)) + ' of ' + this.fmtBase(this.instGrandTotal(inst))) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      this.fmtBase(this.instMonthlyAmount(inst)) + ' &times; ' + inst.months +
      ' &middot; PRICE ' + this.fmtBase(inst.total) + ' + INT ' + (inst.ratePct != null ? inst.ratePct : 5) + '% (' + this.fmtBase(this.instInterest(inst)) + ') = TOTAL ' + this.fmtBase(this.instGrandTotal(inst)) +
      ' &middot; DUE ' + (inst.dueDay || 15) + '/mo &middot; FROM ' + inst.startMonth +
      (advance > 0 ? ' &middot; <span class="amount-positive">ADVANCE ' + this.fmtBase(advance) + '</span>' : '') + '</div>';
    html += '<div class="inst-rows">';
    for (let s = 1; s <= inst.months; s++) {
      const entry = paidEntries.find(e => e.seq === s);
      const due = this.instDueAmount(inst, s);
      const mk = this.mkOfSeq(inst, s);
      html += '<div class="inst-row' + (entry ? ' inst-row-paid' : '') + '">' +
        '<span class="inst-seq">' + String(s).padStart(2, '0') + '</span>' +
        '<span class="inst-month">' + this.monthLabel(mk) + '</span>' +
        '<span class="inst-amt">' + this.fmtBase(due) + (s === 1 ? ' <span class="tip-dim">(incl INT)</span>' : '') + '</span>' +
        '<span class="inst-status">' + (entry
          ? '<button class="btn btn-sm btn-toggle-paid" onclick="BlackBook.payInstallmentSlot(\x27' + inst.id + '\x27,' + s + ')" title="Click to undo this payment">PAID</button>'
          : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.payInstallmentSlot(\x27' + inst.id + '\x27,' + s + ')">PAY</button>') + '</span>' +
        '</div>';
    }
    html += '</div></div>';
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
    if (!entry) {
      if (this.instIsClosed(inst)) return;
      const due = this.instDueAmount(inst, seq);
      if ((inst.advance || 0) >= due - 0.009) {
        inst.advance = Math.round(((inst.advance || 0) - due) * 100) / 100;
        paidEntries.push({ seq: seq, via: 'advance' });
      } else {
        this.createInstPaymentTx(inst, seq);
        paidEntries.push({ seq: seq, via: 'tx' });
      }
    } else {
      inst.paid = paidEntries.filter(e => e.seq !== seq);
      if (entry.via === 'advance') {
        inst.advance = Math.round(((inst.advance || 0) + this.instDueAmount(inst, seq)) * 100) / 100;
      } else {
        const pairId = 'inst-' + inst.id + '-s' + seq;
        this.data.transactions = this.data.transactions.filter(t => t.pairId !== pairId);
      }
    }
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  createInstPaymentTx(inst, seq) {
    const fundingAccId = this.fundingAccountId();
    if (!fundingAccId) return;
    const acc = this.data.accounts.find(a => a.id === fundingAccId);
    const catId = this.instFeeCategory();
    const amount = this.instDueAmount(inst, seq);
    const pairId = 'inst-' + inst.id + '-s' + seq;
    const date = this.mkOfSeq(inst, seq) + '-' + String(inst.dueDay || 15).padStart(2, '0');
    const note = 'Installment ' + inst.name + ' ' + seq + '/' + inst.months;
    this.data.transactions.unshift({ id: 'tx-' + pairId, type: 'expense', amount: -amount, currency: acc.currency || this.baseCurrency() || 'RSD', accountId: fundingAccId, categoryId: catId, date: date, note: note, pairId: pairId });
  },

  openPayInstallment(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    const outstanding = this.instOutstanding(inst);
    const html = '<div class="modal-backdrop" onclick="BlackBook.closeModal(\'pay-installment-modal\')"></div>' +
      '<div class="modal-content" style="max-width:360px;">' +
      '<div class="modal-header"><span class="modal-title">Pay ' + this.escapeHtml(inst.name) + '</span><button class="modal-close" onclick="BlackBook.closeModal(\'pay-installment-modal\')">&times;</button></div>' +
      '<div style="padding:14px;">' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Outstanding: ' + this.fmtBase(outstanding) + '</div>' +
      '<label style="font-size:12px;color:var(--text-muted);">AMOUNT</label>' +
      '<input type="text" inputmode="decimal" id="pay-inst-amount" class="input" style="width:100%;margin-top:4px;" placeholder="Enter amount" autofocus>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.closeModal(\'pay-installment-modal\')">CANCEL</button>' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.submitPayInstallment(\x27' + instId + '\x27)">PAY</button>' +
      '</div></div></div>';
    const wrapper = document.createElement('div');
    wrapper.id = 'pay-installment-modal';
    wrapper.className = 'modal hidden';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    this.openModal('pay-installment-modal');
    const inp = document.getElementById('pay-inst-amount');
    if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.submitPayInstallment(instId); } }); }
  },

  async submitPayInstallment(instId) {
    const inp = document.getElementById('pay-inst-amount');
    const rawVal = inp ? String(inp.value || '').trim() : '';
    this.closeModal('pay-installment-modal');
    if (!rawVal) { await this.confirmModal({ title: 'Pay Installment', message: 'Enter an amount first.', danger: false }); return; }
    await this.customPayInstallments(instId, rawVal);
  },

  async customPayInstallments(instId, rawVal) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (!rawVal) { await this.confirmModal({ title: 'Pay Installment', message: 'Enter an amount first.', danger: false }); return; }
    const paidEntries = this.instPaidEntries(inst);
    const outstanding = this.instOutstanding(inst);
    if (!(outstanding > 0)) { await this.confirmModal({ title: 'Pay Installment', message: 'Nothing left to pay on this plan.', danger: false }); return; }
    let amt = this.evalAmount(rawVal);
    if (!(amt > 0)) { await this.confirmModal({ title: 'Pay Installment', message: 'Enter a valid amount.', danger: false }); return; }
    let rem = amt, cleared = 0;
    for (let s = 1; s <= inst.months; s++) {
      if (paidEntries.some(e => e.seq === s)) continue;
      const due = this.instDueAmount(inst, s);
      if (rem >= due - 0.009) {
        this.createInstPaymentTx(inst, s);
        paidEntries.push({ seq: s, via: 'tx' });
        rem = Math.round((rem - due) * 100) / 100;
        cleared++;
      } else break;
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
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  async deleteInstallment(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (!(await this.confirmModal({ title: 'Delete Plan', message: 'Delete purchase plan "' + inst.name + '"? Paid payments stay as transactions.' , confirmText: 'Delete' }))) return;
    const pid = 'inst-' + inst.id + '-';
    this.data.installments = this.data.installments.filter(i => i.id !== instId);
    this.data.transactions = this.data.transactions.filter(t => !t.pairId || t.pairId.indexOf(pid) !== 0);
    await this.save();
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
    const def = this.data.settings.defaultCategoryId;
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
    document.getElementById('ctx-amount').value = Math.abs(tx.amount);
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
      const date = this.parseDateInput(document.getElementById('ctx-date').value) || this.today();
      const note = document.getElementById('ctx-note').value.trim();
      const months = parseInt(document.getElementById('ctx-months').value, 10) || 1;
      const categoryId = document.getElementById('ctx-category').value;
      const editId = document.getElementById('ctx-edit-id').value;
      if (editId) {
        const tx = this.data.transactions.find(t => t.id === editId);
        if (!tx) return;
        const oldAmt = Math.abs(tx.amount);
        tx.amount = -amt;
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
        const newTx = { id: crypto.randomUUID(), date: date, type: 'expense', amount: -amt, currency: this.baseCurrency(), accountId: null, cardId: cardId, categoryId: categoryId, note: note };
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
      await this.save();
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
    await this.save();
    this.renderPage(this.currentPage);
  },

});
})();
