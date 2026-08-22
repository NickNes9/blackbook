(function () {
Object.assign(window.BlackBook, {
  instCard(inst) {
    return this.cardById(inst.cardId) ||
      (this.data.creditCards || []).find(c => c.legacyAccountId === inst.accountId) || null;
  },

  instMonthlyAmount(inst) { return Math.round(inst.total / inst.months * 100) / 100; },
  instInterest(inst) { return Math.round(inst.total * (inst.ratePct != null ? inst.ratePct : 5)) / 100; },
  instBaseAmount(inst, seq) {
    if (seq === inst.months && inst.months > 1) return Math.round((inst.total - this.instMonthlyAmount(inst) * (inst.months - 1)) * 100) / 100;
    return this.instMonthlyAmount(inst);
  },
  instDueAmount(inst, seq) { return Math.round((this.instBaseAmount(inst, seq) + (seq === 1 ? this.instInterest(inst) : 0)) * 100) / 100; },
  instOutstanding(inst) {
    let paidPrincipal = inst.advance || 0;
    for (const e of this.instPaidEntries(inst)) paidPrincipal += this.instBaseAmount(inst, e.seq);
    return Math.max(0, Math.round((inst.total - paidPrincipal) * 100) / 100);
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

  renderCards() {
    const el = document.getElementById('page-cards');
    if (!el) return;
    if (!this.data.creditCards) this.data.creditCards = [];
    let html = '<div class="month-picker"></div>';
    html += this.cardsSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.cardsListHtml() + '</div>';
    el.innerHTML = html;
  },

  cardsSummaryHtml() {
    const cards = this.data.creditCards || [];
    if (!cards.length) return '';
    let totalOwed = 0, totalPlanned = 0;
    for (const inst of this.data.installments) {
      const card = this.instCard(inst);
      if (!card) continue;
      totalOwed += this.instOutstanding(inst);
      totalPlanned += inst.total + this.instInterest(inst);
    }
    const pct = totalPlanned > 0 ? Math.min(Math.round((totalPlanned - totalOwed) / totalPlanned * 100), 100) : 0;
    return '<div class="month-summary" style="margin-bottom:10px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">TOTAL DEBT</span><span class="month-summary-value amount-negative">' + this.fmtRsd(totalOwed) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">PAID OFF</span><span class="month-summary-value amount-positive">' + pct + '%</span></div></div>';
  },

  cardsListHtml() {
    const cards = this.data.creditCards || [];
    if (!cards.length) return '<div class="empty-state"><div class="empty-state-text">No credit cards yet. Click + NEW CARD to add one.</div></div>';
    return cards.map(c => this.cardBlockHtml(c)).join('');
  },

  cardBlockHtml(card) {
    const plans = this.data.installments.filter(i => (this.instCard(i) || {}).id === card.id);
    const debt = plans.reduce((s, p) => s + this.instOutstanding(p), 0);
    let html = '<div class="card-block">' +
      '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + (card.color || '#71717a') + ';"></span> ' + this.escapeHtml(card.name) + '</span>' +
      '<span class="savings-actions">' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.openNewCardTx(\x27' + card.id + '\x27)" title="Add a transaction on this card">New</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27card:' + card.id + '\x27)">EDIT</button>' +
       '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCard(\x27' + card.id + '\x27)">DEL</button></span></div>' +
      '<div class="bill-meta-line" style="display:block;margin-bottom:6px;">INT ' + (card.ratePct != null ? card.ratePct : 5) + '% &middot; DUE DAY ' + (card.dueDay || 15) + ' &middot; DEBT ' + this.fmtRsd(debt) + '</div>';
    if (!plans.length) html += '<div class="empty-state" style="padding:14px;"><div class="empty-state-text">No purchases yet. Click New to add a transaction on this card.</div></div>';
    else html += plans.map(p => this.planBlockHtml(p)).join('');
    return html + '</div>';
  },

  planBlockHtml(inst) {
    const card = this.instCard(inst) || {};
    const color = card.color || this.billColor(inst);
    const closed = this.instIsClosed(inst);
    const paidEntries = this.instPaidEntries(inst);
    const paidCount = closed ? inst.months : paidEntries.length;
    const pct = Math.min(Math.round(paidCount / inst.months * 100), 100);
    const advance = inst.advance || 0;
    let html = '<div class="plan-card"' + (closed ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name">' + this.escapeHtml(inst.name) + '</span>' +
      '<span class="savings-actions">' +
      '<span class="inst-count-badge"' + (closed ? ' style="border-color:' + color + ';color:#000;background:' + color + ';"' : '') + '>' + paidCount + '/' + inst.months + ' PAID</span>' +
      '<span class="inst-custom"><input type="text" inputmode="decimal" id="cust-' + inst.id + '" class="input inst-custom-input" placeholder="AMOUNT" autocomplete="off">' +
      (closed ? '' : '<button class="btn btn-sm btn-primary" onclick="BlackBook.customPayInstallments(\x27' + inst.id + '\x27)" title="Pay the amount entered - fills installments in order">PAY</button>') + '</span>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteInstallment(\x27' + inst.id + '\x27)">DEL</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + (closed ? '&#10003; FULLY PAID OFF' :
      'LEFT ' + this.fmtRsd(this.instOutstanding(inst)) + ' of ' + this.fmtRsd(inst.total)) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      this.fmtRsd(this.instMonthlyAmount(inst)) + ' &times; ' + inst.months + ' &middot; TOTAL ' + this.fmtRsd(inst.total) +
      ' &middot; INT ' + (inst.ratePct != null ? inst.ratePct : 5) + '% FIRST (' + this.fmtRsd(this.instInterest(inst)) + ')' +
      ' &middot; DUE ' + (inst.dueDay || 15) + '/mo &middot; FROM ' + inst.startMonth +
      (advance > 0 ? ' &middot; <span class="amount-positive">ADVANCE ' + this.fmtRsd(advance) + '</span>' : '') + '</div>';
    html += '<div class="inst-rows">';
    for (let s = 1; s <= inst.months; s++) {
      const entry = paidEntries.find(e => e.seq === s);
      const due = this.instDueAmount(inst, s);
      const mk = this.mkOfSeq(inst, s);
      html += '<div class="inst-row' + (entry ? ' inst-row-paid' : '') + '">' +
        '<span class="inst-seq">' + String(s).padStart(2, '0') + '</span>' +
        '<span class="inst-month">' + this.monthLabel(mk) + '</span>' +
        '<span class="inst-amt">' + this.fmtRsd(due) + (s === 1 ? ' <span class="tip-dim">(incl INT)</span>' : '') + '</span>' +
        '<span class="inst-status">' + (entry
          ? '<button class="btn btn-sm btn-toggle-paid" onclick="BlackBook.payInstallmentSlot(\x27' + inst.id + '\x27,' + s + ')" title="Click to undo this payment">PAID</button>'
          : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.payInstallmentSlot(\x27' + inst.id + '\x27,' + s + ')">PAY</button>') + '</span>' +
        '</div>';
    }
    html += '</div></div>';
    return html;
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
      const base = this.instBaseAmount(inst, seq);
      if ((inst.advance || 0) >= base - 0.009) {
        inst.advance = Math.round(((inst.advance || 0) - base) * 100) / 100;
        paidEntries.push({ seq: seq, via: 'advance' });
      } else {
        this.createInstPaymentTx(inst, seq);
        paidEntries.push({ seq: seq, via: 'tx' });
      }
    } else {
      inst.paid = paidEntries.filter(e => e.seq !== seq);
      if (entry.via === 'advance') {
        inst.advance = Math.round(((inst.advance || 0) + this.instBaseAmount(inst, seq)) * 100) / 100;
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
    const note = 'Installment ' + inst.name + ' ' + seq + '/' + inst.months + (seq === 1 ? ' (incl ' + this.fmtRsd(this.instInterest(inst)) + ' int)' : '');
    this.data.transactions.unshift({ id: 'tx-' + pairId, type: 'expense', amount: -amount, currency: acc.currency || 'RSD', accountId: fundingAccId, categoryId: catId, date: date, note: note, pairId: pairId });
  },

  async customPayInstallments(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    const inputEl = document.getElementById('cust-' + instId);
    const rawVal = inputEl ? String(inputEl.value || '').trim() : '';
    if (!rawVal) { alert('Enter an amount first.'); return; }
    const paidEntries = this.instPaidEntries(inst);
    const outstanding = this.instOutstanding(inst);
    if (!(outstanding > 0)) { alert('Nothing left to pay on this plan.'); return; }
    let amt = Math.round(parseFloat(rawVal.replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
    if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
    let rem = amt, cleared = 0;
    for (let s = 1; s <= inst.months; s++) {
      if (paidEntries.some(e => e.seq === s)) continue;
      const base = this.instBaseAmount(inst, s);
      if (rem >= base - 0.009) {
        this.createInstPaymentTx(inst, s);
        paidEntries.push({ seq: s, via: 'tx' });
        rem = Math.round((rem - base) * 100) / 100;
        cleared++;
      } else break;
    }
    if (rem > 0) {
      inst.advance = Math.round(((inst.advance || 0) + rem) * 100) / 100;
      const fundingAccId = this.fundingAccountId();
      if (fundingAccId) {
        const acc = this.data.accounts.find(a => a.id === fundingAccId);
        const pid = 'inst-' + inst.id + '-adv-' + Date.now();
        this.data.transactions.unshift({ id: 'tx-' + pid, type: 'expense', amount: -rem, currency: acc.currency || 'RSD', accountId: fundingAccId, categoryId: this.instFeeCategory(), date: this.today(), note: 'Advance ' + inst.name, pairId: pid });
      }
    }
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  async deleteInstallment(instId) {
    const inst = this.data.installments.find(i => i.id === instId);
    if (!inst) return;
    if (!confirm('Delete purchase plan "' + inst.name + '"? Paid payments stay as transactions.')) return;
    const pid = 'inst-' + inst.id + '-';
    this.data.installments = this.data.installments.filter(i => i.id !== instId);
    this.data.transactions = this.data.transactions.filter(t => !t.pairId || t.pairId.indexOf(pid) !== 0);
    await this.save();
    this.renderPage(this.currentPage === 'cards' ? 'cards' : this.currentPage);
  },

  openNewCardTx(cardId) {
    const card = this.cardById(cardId);
    if (!card) return;
    document.getElementById('ctx-card').value = cardId;
    document.getElementById('ctx-amount').value = '';
    document.getElementById('ctx-date').value = this.today();
    document.getElementById('ctx-note').value = '';
    document.getElementById('ctx-months').value = '1';
    const sel = document.getElementById('ctx-category');
    const sorted = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    const def = this.data.settings.defaultCategoryId;
    sel.innerHTML = sorted.map(c => '<option value="' + c.id + '"' + (c.id === (def || sorted[0].id) ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('card-tx-title').textContent = 'New \u2014 ' + card.name;
    this.bindCardTxForm();
    this.openModal('card-tx-modal');
    setTimeout(() => document.getElementById('ctx-amount').focus(), 50);
  },

  bindCardTxForm() {
    const f = document.getElementById('card-tx-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cardId = document.getElementById('ctx-card').value;
      const card = this.cardById(cardId);
      if (!card) return;
      let amt = Math.round(parseFloat(String(document.getElementById('ctx-amount').value).trim().replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      const date = document.getElementById('ctx-date').value || this.today();
      const note = document.getElementById('ctx-note').value.trim();
      const months = parseInt(document.getElementById('ctx-months').value, 10) || 1;
      const categoryId = document.getElementById('ctx-category').value;
      this.data.transactions.push({ id: crypto.randomUUID(), date: date, type: 'expense', amount: -amt, currency: 'RSD', accountId: null, cardId: cardId, categoryId: categoryId, note: note });
      if (months > 1) {
        if (!this.data.installments) this.data.installments = [];
        const { y, m } = this.ymOf(date);
        this.data.installments.push({
          id: 'inst-' + Date.now(), cardId: cardId, name: note || 'Purchase',
          total: amt, months: months,
          startMonth: y + '-' + String(m + 1).padStart(2, '0'),
          dueDay: card.dueDay || 15,
          ratePct: card.ratePct != null ? card.ratePct : 5,
          paid: [], advance: 0
        });
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
    const msg = plans.length ? '"' + card.name + '" has ' + plans.length + ' purchase plan' + (plans.length === 1 ? '' : 's') + '.\n\nOK = delete the card AND its plans.\nCancel = do nothing.' : 'Delete card "' + card.name + '"?';
    if (!confirm(msg)) return;
    const planIds = plans.map(p => p.id);
    this.data.creditCards = this.data.creditCards.filter(c => c.id !== id);
    this.data.installments = this.data.installments.filter(i => planIds.indexOf(i.id) === -1);
    await this.save();
    this.renderPage(this.currentPage);
  },

});
})();
