(function () {
Object.assign(window.BlackBook, {
  billsChipsHtml() {
    const bills = this.data.bills;
    let html = '<div class="cat-filter">';
    const hc = this.data.settings.highlightColor || '#fa8c3c';
    const totOn = this._billsTotalOn === true;
    html += '<div class="cat-filter-chip' + (totOn ? ' selected' : '') + '" style="--cc:' + hc + ';' + (totOn ? 'background:' + hc + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.toggleBillsTotal()" title="Monthly total line \u00b7 click to toggle">' +
      '<span style="' + (totOn ? '' : 'opacity:0.5;') + '">TOTAL</span></div>';
    for (const b of bills) {
      const color = this.billColor(b);
      const on = b.active !== false;
      const amt = b.amount != null ? ' \u00b7 ' + this.fmtAmount(Math.abs(b.amount), b.currency || this.baseCurrency() || 'RSD') : '';
      html += '<div class="cat-filter-chip' + (on ? ' selected' : '') + '" style="--cc:' + color + ';' + (on ? 'background:' + color + ';color:var(--on-fill);' : '') + (on ? '' : 'opacity:0.55;') + '" onclick="BlackBook.toggleBillActive(\x27' + b.id + '\x27, event)" title="' + this.escapeHtml(b.name) + amt + ' \u00b7 click: toggle · Shift-click: toggle while keeping other selections · Alt-click: isolate">' + this.escapeHtml(b.name) + '</div>';
    }
    html += '<span style="flex:1;"></span>';
    return html + '</div>';
  },

  toggleBillsTotal() {
    this._billsTotalOn = this._billsTotalOn !== true;
    this.renderBills();
  },

  renderBills() {
    const el = document.getElementById('page-bills');
    if (!el) return;
    const chartHeights = this.captureChartPanelHeights(el);
    this.hideDonutTooltip();
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    if (this.billsPieChart) { this.billsPieChart.destroy(); this.billsPieChart = null; }
    this.repairBillPayments();
    const hideGraph = !!(this.data.settings && this.data.settings.hideBillsGraph);
    const offToday = this.vy() !== new Date().getFullYear();
    el.innerHTML = '<div class="month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<button class="mp-today' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '<span style="flex:1;"></span>' +
      '<button class="btn btn-primary" onclick="BlackBook.openNewBill()">+ NEW BILL</button>' +
      '</div>' +
      this.billsSummaryHtml() +
      '<div class="list-sep"></div>' +
      '<div class="page-scroll-wrap">' + this.billsGridHtml() + '</div>' +
      (hideGraph
        ? ''
        : '<div class="list-sep"></div>' + this.billsChipsHtml() +
          '<div class="overview-charts with-donut"><div class="chart-panel donut-panel"><div class="chart-head-row"><span id="bills-donut-title" class="chart-title-text">THIS YEAR</span></div><div class="budget-donut-wrap"><canvas id="bills-donut-chart" aria-label="Yearly bill breakdown"></canvas></div></div><div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">BILLS BY MONTH</span></div><canvas id="bills-chart"></canvas></div></div>');
    this.observeBillAmountFit(el);
    this.restoreChartPanelHeights(el, chartHeights);
    if (!hideGraph) { this.renderBillsChart(); this.renderBillsDonut(); }
    this.finishFocus('bill');
  },

  fitBillAmounts(root) {
    if (!root) return;
    for (const full of root.querySelectorAll('.bill-amount-full')) {
      const short = full.nextElementSibling;
      const cell = full.closest('.bill-cell, .bill-cell-total');
      if (!short || !cell) continue;
      const style = getComputedStyle(cell);
      const previous = {
        display: full.style.display,
        visibility: full.style.visibility,
        position: full.style.position,
        whiteSpace: full.style.whiteSpace
      };
      full.style.display = 'inline-block';
      full.style.visibility = 'hidden';
      full.style.position = 'absolute';
      full.style.whiteSpace = 'nowrap';
      const textWidth = full.getBoundingClientRect().width;
      full.style.display = previous.display;
      full.style.visibility = previous.visibility;
      full.style.position = previous.position;
      full.style.whiteSpace = previous.whiteSpace;
      const available = cell.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - 8;
      const fits = textWidth <= available;
      full.style.display = fits ? 'inline' : 'none';
      short.style.display = fits ? 'none' : 'inline';
    }
  },

  observeBillAmountFit(page) {
    if (!page) return;
    if (this._billAmountResizeObserver) this._billAmountResizeObserver.disconnect();
    const fit = () => requestAnimationFrame(() => this.fitBillAmounts(page));
    fit();
    if (typeof ResizeObserver === 'function') {
      this._billAmountResizeObserver = new ResizeObserver(fit);
      this._billAmountResizeObserver.observe(page);
    } else if (!this._billAmountResizeFallback) {
      this._billAmountResizeFallback = fit;
      window.addEventListener('resize', fit);
    }
  },

  async toggleBillsGraph() {
    this.data.settings.hideBillsGraph = !(this.data.settings && this.data.settings.hideBillsGraph);
    await this.save();
    this.renderPage('bills');
    this.updateGraphFooter();
  },

  billsSummaryHtml() {
    let total = 0;
    for (const b of this.data.bills) { if (b.amount != null) {
      const monthlyAmount = Math.abs(b.amount) / (b.frequency === 'annual' ? 12 : 1);
      const cur = b.currency || this.baseCurrency() || 'RSD';
      if (cur === this.baseCurrency()) { total += monthlyAmount; }
      else {
        const from = this.billPayFrom(b);
        const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
        const fee = (acc && acc.foreignFee) || 0;
        const feeRes = this.calcForeignFee(monthlyAmount, fee, cur);
        total += Math.abs(this.toBase(monthlyAmount, cur)) + feeRes.feeBase;
      }
    } }
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">MONTHLY TOTAL</span><span class="month-summary-value">' + this.fmtBase(total) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">BILLS</span><span class="month-summary-value">' + this.data.bills.length + '</span></div>' +
      '</div>';
  },

billsGridHtml() {
    const formatGridAmount = (amount) => this.formatBillGridAmount(amount);
    const compactAmount = (amount) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 0 }).format(amount).toLowerCase().replace(/^-0$/, '0');
    const responsiveAmount = (amount, currency, native = false) => {
      const symbol = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', CHF: 'CHF' }[currency] || currency;
      const full = formatGridAmount(amount) + (native ? ' ' + currency : '');
      const short = (native ? symbol : '') + compactAmount(amount);
      const fullClass = 'bill-amount-full' + (native ? ' bill-amount-full-native' : '');
      const shortClass = 'bill-amount-short' + (native ? ' bill-amount-short-native' : '');
      return '<span class="' + fullClass + '" title="' + this.escapeHtml(full) + '">' + this.escapeHtml(full) + '</span><span class="' + shortClass + '" title="' + this.escapeHtml(full) + '">' + this.escapeHtml(short) + '</span>';
    };
    const MONTHS_F = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let html = '<div class="bills-grid">';
    html += '<div class="bills-grid-head">BILL</div>';
    const now = new Date();
    const curMonth = this.vy() === now.getFullYear() ? now.getMonth() : -1;
    for (let m = 0; m < 12; m++) {
      html += '<div class="bills-grid-head' + (this.vm() === m ? ' selected' : '') + (m === curMonth ? ' current' : '') + '">' + MONTHS_F[m] + '</div>';
    }
    html += '<div class="bills-grid-head">TOTAL</div>';
    if (!this.data.bills.length) {
      html += '<div class="bills-grid-empty">No bills yet. Click + NEW BILL to add one.</div>';
    }
    let bi = 0;
    for (const [billIndex, bill] of this.data.bills.entries()) {
      const alt = bi % 2 === 1 ? ' alt' : '';
      const color = this.billColor(bill);
      let yearTotal = 0;
      let yearHasPaid = false;
      for (let m = 0; m < 12; m++) {
        const p = this.getBillPayment(bill.id, this.vy() + '-' + String(m + 1).padStart(2, '0'));
        if (!p) continue;
        yearTotal += this.billPaymentTotalBase(p, bill);
        yearHasPaid = true;
      }
      html += '<div class="bill-cell-label' + alt + (bill.active ? '' : ' inactive') + this.focusRecordHtml('bill', bill.id) + '">' +
        '<span class="bill-name-line"><span class="cat-dot" style="background:' + color + ';"></span><span class="bill-name-text">' + this.escapeHtml(bill.name) + this.healthMarker('bills', bill.id) + '</span><span class="bill-due-day">' + (bill.frequency === 'annual' ? MONTHS_F[(Number(bill.dueMonth) || 1) - 1] + ' ' : '') + this.ordinalDay(bill.dueDay) + '</span></span>' +
        '<span class="bill-actions-mini">' +
        '<button type="button" class="btn btn-sm btn-secondary btn-icon bill-order-btn" onclick="event.stopPropagation();BlackBook.reorderBill(\x27' + bill.id + '\x27,-1)" title="Move bill up" aria-label="Move ' + this.escapeHtml(bill.name) + ' up"' + (billIndex === 0 ? ' disabled' : '') + '>&#8593;</button>' +
        '<button type="button" class="btn btn-sm btn-secondary btn-icon bill-order-btn" onclick="event.stopPropagation();BlackBook.reorderBill(\x27' + bill.id + '\x27,1)" title="Move bill down" aria-label="Move ' + this.escapeHtml(bill.name) + ' down"' + (billIndex === this.data.bills.length - 1 ? ' disabled' : '') + '>&#8595;</button>' +
        '<button class="btn btn-sm ' + (bill.autopay ? 'btn-primary' : 'btn-muted') + '" onclick="BlackBook.toggleBillAutopay(\x27' + bill.id + '\x27)" title="Auto-mark upcoming months as paid">' + (bill.autopay ? 'AUTO' : 'MAN') + '</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditBill(\x27' + bill.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger btn-icon" title="Delete bill" onclick="BlackBook.deleteBill(\x27' + bill.id + '\x27)">' + this.xIcon() + '</button></span>' +
        '</div>';
      for (let m = 0; m < 12; m++) {
        const mk = this.vy() + '-' + String(m + 1).padStart(2, '0');
        const paid = this.getBillPayment(bill.id, mk);
        if (!paid && !this.billOccursInMonth(bill, mk)) {
          html += '<div class="bill-cell disabled bill-not-due' + alt + '" aria-hidden="true"></div>';
          continue;
        }
        let amtLabel;
        if (paid) {
          const paymentTransactions = this.billPaymentTransactions(paid);
          const tx = paymentTransactions.find(item => item.id === paid.txId) || paymentTransactions[0] || null;
          let rsdAmount, nativeAbs;
          if (paymentTransactions.length > 1) {
            rsdAmount = this.billPaymentTotalBase(paid, bill);
            amtLabel = responsiveAmount(rsdAmount, this.baseCurrency());
          } else {
          if (tx) {
            const txCur = tx.currency || bill.currency || this.baseCurrency() || 'RSD';
            if (txCur === this.baseCurrency()) {
              rsdAmount = Math.abs(tx.amount);
            } else {
              rsdAmount = Math.abs(this.toBase(tx.amount, txCur));
            }
            nativeAbs = tx.nativeAmount != null ? Math.abs(tx.nativeAmount) : (txCur !== this.baseCurrency() ? Math.abs(tx.amount) : null);
          } else {
            rsdAmount = Math.abs(paid.amount);
            nativeAbs = paid.nativeAmount != null ? Math.abs(paid.nativeAmount) : null;
          }
          const natCur = (tx && (tx.nativeCurrency || tx.currency)) || paid.nativeCurrency || paid.payCurrency || bill.currency || this.baseCurrency() || 'RSD';
          const rsd = responsiveAmount(rsdAmount, this.baseCurrency());
          let nativeVal = nativeAbs != null ? Math.abs(nativeAbs) : null;
          if (nativeVal == null && natCur !== this.baseCurrency()) {
            if (tx && tx.currency && tx.currency !== this.baseCurrency() && tx.nativeAmount == null) nativeVal = Math.abs(tx.amount);
            else if (bill.amount != null && (bill.currency || '') !== this.baseCurrency()) nativeVal = Math.abs(bill.amount);
          }
          amtLabel = nativeVal != null && natCur !== this.baseCurrency()
            ? '<div class="bill-amt-lines" title="' + this.escapeHtml(formatGridAmount(rsdAmount) + ' ' + this.baseCurrency() + ' / ' + formatGridAmount(nativeVal) + ' ' + natCur) + '"><span class="bill-amt-rsd">' + rsd + '</span><span class="bill-amt-native">' + responsiveAmount(nativeVal, natCur, true) + '</span></div>'
            : rsd;
          }
        } else {
          amtLabel = '';
        }
        const cellStyle = paid ? ' style="background:' + color + ';color:var(--on-fill);font-weight:700;"' : '';
        const clickFn = 'toggleBillPayment';
        const transactionLink = paid && paid.txId ? this.linkedBillPaymentButton(paid) : '';
        const linkedCount = paid ? this.billPaymentTransactions(paid).length : 0;
        html += '<div class="bill-cell' + alt + (paid ? ' paid' : '') + '"' + cellStyle + ' onclick="BlackBook.' + clickFn + '(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + (bill.frequency === 'annual' ? MONTHS_F[(Number(bill.dueMonth) || 1) - 1] + ' ' : '') + this.ordinalDay(bill.dueDay) +
          (paid ? ' \u00b7 paid' + (linkedCount > 1 ? ' · ' + linkedCount + ' linked transactions' : '') + ' \u00b7 click to unpay' : ' \u00b7 click to mark paid') +
          ' &middot; right-click for custom amount">' + amtLabel + (paid ? this.billChangeIndicator(bill, mk, paid) : '') + transactionLink + '</div>';
      }
      html += '<div class="bill-cell-total' + alt + '"' + (yearHasPaid ? ' style="background:' + color + '22;color:' + color + ';font-weight:700;" title="' + this.escapeHtml(formatGridAmount(yearTotal) + ' ' + this.baseCurrency()) + '"' : '') + '>' + (yearHasPaid ? responsiveAmount(yearTotal, this.baseCurrency()) : '') + '</div>';
      bi++;
    }
    html += '</div>';
    return html;
  },

  formatBillGridAmount(amount) { return this.fmtNumber(amount).replace(/\.00$/, ''); },

  billChangeIndicator(bill, month, payment) {
    const currency = bill.currency || this.baseCurrency();
    const exactAmount = pay => {
      if (!pay) return null;
      const transactions = this.billPaymentTransactions(pay);
      if (!transactions.length) return null;
      let total = 0;
      for (const tx of transactions) {
        if ((tx.currency || this.baseCurrency()) === currency) total += Math.abs(Number(tx.amount));
        else if (tx.nativeCurrency === currency && tx.nativeAmount != null) total += Math.abs(Number(tx.nativeAmount));
        else return null;
      }
      return Number.isFinite(total) ? total : null;
    };
    const [year, monthNumber] = month.split('-').map(Number);
    const annual = bill.frequency === 'annual';
    const previousYear = annual || monthNumber === 1 ? year - 1 : year;
    const previousMonth = annual ? monthNumber : monthNumber === 1 ? 12 : monthNumber - 1;
    const previousKey = previousYear + '-' + String(previousMonth).padStart(2, '0');
    const previous = exactAmount(this.getBillPayment(bill.id, previousKey));
    const current = exactAmount(payment);
    if (previous == null || current == null) return '';
    const change = this.round2(current - previous);
    if (!change) return '';
    const title = 'Previous ' + (annual ? 'year' : 'month') + ': ' + this.fmtAmount(previous, currency) + ' · ' + (change > 0 ? 'Increase: ' : 'Decrease: ') + this.fmtAmount(Math.abs(change), currency) + (previous > 0 ? ' · ' + this.round2(Math.abs(change) / previous * 100) + '%' : '');
    return '<span class="bill-change" title="' + this.escapeHtml(title) + '" aria-label="' + this.escapeHtml(title) + '">' + (change > 0 ? '↑' : '↓') + '</span>';
  },

  openNewBill() {
    this._pendingRecurringBillTxIds = null;
    document.getElementById('bill-id').value = '';
    document.getElementById('bill-name').value = '';
    document.getElementById('bill-amount').value = '';
    document.getElementById('bill-currency').value = this.baseCurrency();
    this.updateBillAmountLabel();
    document.getElementById('bill-dueDay').value = '';
    document.getElementById('bill-frequency-toggle').dataset.frequency = 'monthly';
    document.getElementById('bill-dueMonth').value = String(new Date().getMonth() + 1);
    this.updateBillFrequencyFields();
    document.getElementById('bill-autopay-toggle').dataset.autopay = 'false';
    this.updateBillAutopayButton();
    const colorEl = document.getElementById('bill-color');
    colorEl.value = '#888888';
    colorEl.disabled = false;
    const hexEl = document.getElementById('bill-color-hex');
    if (hexEl) { hexEl.value = '#888888'; hexEl.dataset.auto = '1'; }
    const resetBtn = document.getElementById('bill-color-reset');
    if (resetBtn) { resetBtn.dataset.name = ''; resetBtn.innerHTML = this.refreshIcon(); }
    this.bindColorPicker('bill-color', 'bill-color-hex', 'bill-color-reset');
    const catInput = document.getElementById('bill-category-input');
    const catHidden = document.getElementById('bill-category');
    if (catInput && catHidden) {
      catHidden.value = '';
      catInput.value = '';
      this.initCategoryPicker('bill-category-input', 'bill-category', 'bill-category-dropdown');
    }
    const billCat = this.categoriesAvailableOn(this.today()).find(c => /^bill/i.test(String(c.name).trim()));
    if (billCat) { catHidden.value = billCat.id; catInput.value = billCat.name.toUpperCase(); }
    const paySel = document.getElementById('bill-payfrom');
    paySel.innerHTML = this.accountSelectOptions(this.defaultAccountForCurrency(this.baseCurrency()));
    document.getElementById('bill-modal-title').textContent = 'New Bill';
    this.openModal('bill-modal');
  },

  openEditBill(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    document.getElementById('bill-id').value = bill.id;
    document.getElementById('bill-name').value = bill.name;
    document.getElementById('bill-amount').value = bill.amount != null ? bill.amount : '';
    document.getElementById('bill-currency').value = bill.currency;
    this.updateBillAmountLabel();
    document.getElementById('bill-dueDay').value = bill.dueDay;
    document.getElementById('bill-frequency-toggle').dataset.frequency = bill.frequency === 'annual' ? 'annual' : 'monthly';
    document.getElementById('bill-dueMonth').value = String(Number(bill.dueMonth) || 1);
    this.updateBillFrequencyFields();
    document.getElementById('bill-autopay-toggle').dataset.autopay = String(!!bill.autopay);
    this.updateBillAutopayButton();
    const colorEl = document.getElementById('bill-color');
    colorEl.value = this.billColor(bill);
    colorEl.disabled = false;
    const hexEl = document.getElementById('bill-color-hex');
    if (hexEl) { hexEl.value = this.billColor(bill); hexEl.dataset.auto = bill.color ? '0' : '1'; }
    const resetBtn = document.getElementById('bill-color-reset');
    if (resetBtn) { resetBtn.dataset.name = bill.name || bill.id || ''; resetBtn.innerHTML = this.refreshIcon(); }
    this.bindColorPicker('bill-color', 'bill-color-hex', 'bill-color-reset');
    const catInput = document.getElementById('bill-category-input');
    const catHidden = document.getElementById('bill-category');
    if (catInput && catHidden) {
      catHidden.value = bill.categoryId || '';
      catInput.value = bill.categoryId ? this.data.categories.find(c => c.id === bill.categoryId)?.name?.toUpperCase() || '' : '';
      this.initCategoryPicker('bill-category-input', 'bill-category', 'bill-category-dropdown');
    }
    const paySel = document.getElementById('bill-payfrom');
    const payDefault = bill.payAccountId && (bill.payAccountId.startsWith('card:') || this.visibleAccounts().some(a => a.id === bill.payAccountId))
      ? bill.payAccountId
      : this.defaultAccountForCurrency(bill.currency || this.baseCurrency());
    paySel.innerHTML = this.accountSelectOptions(payDefault);
    document.getElementById('bill-modal-title').textContent = 'Edit Bill';
    this.openModal('bill-modal');
  },

  updateBillAmountLabel() {
    const cur = document.getElementById('bill-currency').value || this.baseCurrency() || 'RSD';
    const lbl = document.getElementById('bill-amount-label');
    if (lbl) lbl.textContent = cur === this.baseCurrency() ? 'Amount (empty if unknown)' : 'Amount in ' + cur + ' (empty if unknown)';
    const paySel = document.getElementById('bill-payfrom');
    if (paySel && paySel.value && !paySel.value.startsWith('card:')) {
      const selAcc = this.data.accounts.find(a => a.id === paySel.value);
      const selCur = (selAcc && selAcc.currency) || this.baseCurrency() || 'RSD';
      if (selCur !== cur) {
        const preferred = this.defaultAccountForCurrency(cur);
        if (preferred && preferred !== paySel.value) {
          paySel.innerHTML = this.accountSelectOptions(preferred);
        }
      }
    }
  },

  async deleteBill(billId) {
    if (!(await this.confirmModal({ title: 'Delete Bill', message: 'Delete this bill?' , confirmText: 'Delete' }))) return;
    this.data.bills = this.data.bills.filter(b => b.id !== billId);
    for (const p of (this.data.billPayments || [])) { if (p.billId === billId) this.removeBillTransaction(p); }
    this.data.billPayments = (this.data.billPayments || []).filter(p => p.billId !== billId);
    await this.save({ undoable: true, label: 'Delete bill' });
    this.renderBills();
  },

  async toggleBillActive(billId, ev) {
    const bills = this.data.bills || [];
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;
    if (ev && ev.altKey) {
      for (const item of bills) item.active = item.id === billId;
    } else {
      bill.active = bill.active === false;
    }
    await this.save({ undoable: true, label: 'Change bill visibility' });
    this.renderBills();
  },

  async toggleBillPayment(billId, monthKey) {
    const n = new Date();
    const mk = monthKey || (n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'));
    if (!this.data.billPayments) this.data.billPayments = [];
    const bill = this.data.bills.find(b => b.id === billId);
    const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
    if (!bill || (idx < 0 && !this.billOccursInMonth(bill, mk))) return;
    if (idx >= 0) {
      this.removeBillTransaction(this.data.billPayments[idx]);
      this.data.billPayments.splice(idx, 1);
    } else {
      const pay = { billId: billId, month: mk, paid: true, amount: bill ? bill.amount : null };
      if (bill) this.attachBillTransaction(bill, pay);
      this.data.billPayments.push(pay);
    }
    await this.save({ undoable: true, label: idx >= 0 ? 'Mark bill unpaid' : 'Mark bill paid' });
    this.renderBills();
  },

  async toggleBillAutopay(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    bill.autopay = !bill.autopay;
    if (bill.autopay) this.applyAutopayForBill(bill);
    await this.save({ undoable: true, label: 'Change bill autopay' });
    this.renderBills();
  },

  applyAutopayForBill(bill) {
    const n = new Date();
    const mk = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
    if (!this.billOccursInMonth(bill, mk)) return;
    const dueDay = bill.dueDay || 1;
    if (n.getDate() >= dueDay) {
      this.ensureBillPaid(bill, mk);
    }
  },

  applyAutopay() {
    let changed = false;
    for (const bill of this.data.bills) {
      if (!bill.active || !bill.autopay) continue;
      const before = this.data.billPayments.length;
      this.applyAutopayForBill(bill);
      if (this.data.billPayments.length !== before) changed = true;
    }
    return changed;
  },

  ensureBillPaid(bill, mk) {
    if (!this.data.billPayments) this.data.billPayments = [];
    if (this.getBillPayment(bill.id, mk)) return;
    const pay = { billId: bill.id, month: mk, paid: true, auto: true, amount: bill.amount };
    this.attachBillTransaction(bill, pay);
    this.data.billPayments.push(pay);
  },

  billPayFrom(bill) {
    const sel = bill.payAccountId;
    if (sel && sel.startsWith('card:')) return sel;
    if (sel && this.visibleAccounts().some(a => a.id === sel)) return sel;
    const cur = (bill && bill.currency) || this.baseCurrency() || 'RSD';
    const curAcc = this.visibleAccounts().find(a => (a.currency || this.baseCurrency() || 'RSD') === cur);
    if (curAcc) return curAcc.id;
    const def = this.data.settings.defaultAccountId;
    const fallback = this.visibleAccounts().find(a => a.id === def) || this.visibleAccounts()[0];
    return fallback ? fallback.id : null;
  },

  billMatchTx(bill, pay) {
    const amt = pay.amount != null ? Math.abs(pay.amount) : (bill.amount != null ? Math.abs(bill.amount) : null);
    const from = pay.accountId || this.billPayFrom(bill);
    const linked = new Set((this.data.billPayments || []).flatMap(p => this.billPaymentTransactionIds(p)));
    const candidates = (this.data.transactions || []).filter(t => {
      if (t.type !== 'expense' || this.isTransfer(t)) return false;
      if (linked.has(t.id)) return false;
      if (String(t.date).slice(0, 7) !== pay.month) return false;
      if (pay.accountId) {
        const payAcc = from.startsWith('card:') ? t.cardId === from.slice(5) : t.accountId === from;
        if (!payAcc) return false;
      }
      if (bill.categoryId && t.categoryId && t.categoryId !== bill.categoryId) return false;
      if (bill.name) {
        const bn = String(bill.name).trim().toLowerCase();
        const tn = String(t.note || '').trim().toLowerCase();
        if (!tn || (tn !== bn && !tn.includes(bn) && !bn.includes(tn))) return false;
      }
      if (amt != null) {
        const payCur = pay.amountCurrency || pay.payCurrency || bill.currency || this.baseCurrency() || 'RSD';
        const txCur = t.currency || this.baseCurrency() || 'RSD';
        const tAmt = txCur === payCur ? Math.abs(t.amount) : this.toBase(Math.abs(t.amount), txCur);
        const expected = txCur === payCur ? amt : this.toBase(amt, payCur);
        if (Math.abs(tAmt - expected) > 0.011) return false;
      }
      return true;
    });
    const onAccount = candidates.filter(t => from && (from.startsWith('card:') ? t.cardId === from.slice(5) : t.accountId === from));
    if (onAccount.length === 1) return onAccount[0];
    return !pay.accountId && candidates.length === 1 ? candidates[0] : null;
  },

  attachBillTransaction(bill, pay) {
    if (pay.txId) return;
    const amt = pay.amount != null ? pay.amount : bill.amount;
    const from = pay.accountId || this.billPayFrom(bill);
    if (amt == null || !from) return;
    const existing = this.billMatchTx(bill, pay);
    if (existing) {
      pay.txId = existing.id;
      existing.note = bill.name;
      pay.amount = Math.abs(existing.amount);
      if (existing.baseAmount != null) pay.baseAmount = Math.abs(existing.baseAmount);
      if (existing.feeAmount != null) pay.feeAmount = Math.abs(existing.feeAmount);
      return;
    }
    const mp = pay.month.split('-');
    const y = parseInt(mp[0]), m = parseInt(mp[1]);
    const day = Math.min(Math.max(parseInt(bill.dueDay) || 1, 1), new Date(y, m, 0).getDate());
    const txId = 'bil-' + crypto.randomUUID();
    const billCur = pay.payCurrency || bill.currency || this.baseCurrency() || 'RSD';
    const tx = { id: txId, date: y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), type: 'expense', categoryId: bill.categoryId || null, note: bill.name };
    if (from.startsWith('card:')) {
      tx.cardId = from.slice(5);
      tx.amount = -Math.abs(amt);
      tx.currency = billCur;
    } else {
      const acc = this.data.accounts.find(a => a.id === from);
      const accCur = (acc && acc.currency) || this.baseCurrency() || 'RSD';
      if (billCur !== accCur && billCur !== this.baseCurrency() && accCur === this.baseCurrency()) {
        const fee = (acc && acc.foreignFee) || 0;
        const amtCur = pay.amountCurrency || billCur;
        const nativeAbs = pay.nativeAmount != null ? Math.abs(pay.nativeAmount) : (amtCur !== this.baseCurrency() ? Math.abs(amt) : Math.abs(bill.amount || 0));
        const rsdBase = amtCur === this.baseCurrency() ? Math.abs(amt) : Math.abs(this.toBase(amt, amtCur));
        let feeBase;
        if (pay.feeAmountOverride != null) {
          feeBase = this.round2(Math.abs(pay.feeAmountOverride));
        } else if (fee > 0 && nativeAbs > 0) {
          feeBase = this.calcForeignFee(nativeAbs, fee, billCur).feeBase;
        } else {
          feeBase = 0;
        }
        tx.amount = -this.round2(rsdBase + feeBase);
        tx.currency = accCur;
        tx.baseAmount = this.round2(rsdBase);
        tx.feeAmount = feeBase;
        tx.nativeAmount = -nativeAbs;
        tx.nativeCurrency = billCur;
      } else {
        tx.amount = -Math.abs(amt);
        tx.currency = billCur;
      }
      tx.accountId = from;
    }
    this.data.transactions.unshift(tx);
    pay.amount = Math.abs(tx.amount);
    if (tx.baseAmount != null) pay.baseAmount = Math.abs(tx.baseAmount);
    if (tx.feeAmount != null) pay.feeAmount = Math.abs(tx.feeAmount);
    delete pay.feeAmountOverride;
    pay.txId = txId;
  },

  removeBillTransaction(pay) {
    const ids = this.billPaymentTransactionIds(pay);
    const syntheticIds = new Set(ids.filter(id => String(id).startsWith('bil-')));
    if (syntheticIds.size) this.data.transactions = (this.data.transactions || []).filter(tx => !syntheticIds.has(tx.id));
    delete pay.txId;
    delete pay.relatedTxIds;
  },

  renderBillsChart() {
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    const canvas = document.getElementById('bills-chart');
    if (!canvas) return;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(this.vy() + '-' + String(m).padStart(2, '0'));
    const datasets = [];
    if (this._billsTotalOn === true) {
      const hc = this.data.settings.highlightColor || '#fa8c3c';
      datasets.push({
        label: 'TOTAL', _total: true,
        data: months.map(mk => {
          let s = 0;
          for (const b of this.data.bills) {
            const p = this.getBillPayment(b.id, mk);
            if (!p && !this.billOccursInMonth(b, mk)) continue;
            if (p) {
              s += this.billPaymentTotalBase(p, b);
            } else {
              const native = b.amount;
              if (native != null) {
                const cur = b.currency || this.baseCurrency() || 'RSD';
                if (cur === this.baseCurrency()) { s += Math.abs(native); }
                else {
                  const from = this.billPayFrom(b);
                  const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
                  const fee = (acc && acc.foreignFee) || 0;
                  const feeRes = this.calcForeignFee(native, fee, cur);
                  s += Math.abs(this.toBase(native, cur)) + feeRes.feeBase;
                }
              }
            }
          }
          return this.round2(s);
        }),
        borderColor: hc,
        backgroundColor: hc,
        fill: false,
        tension: 0.3,
        cubicInterpolationMode: 'monotone',
        borderWidth: 2.5,
        pointRadius: 2
      });
    }
    const activeBills = this.data.bills.filter(b => b.active !== false);
    for (const bill of activeBills) {
      datasets.push({
        label: bill.name,
        data: months.map(mk => {
          const p = this.getBillPayment(bill.id, mk);
          if (p) return this.billPaymentTotalBase(p, bill);
          if (!this.billOccursInMonth(bill, mk)) return null;
          const native = bill.amount;
          if (native == null) return 0;
          const cur = bill.currency || this.baseCurrency() || 'RSD';
          if (cur === this.baseCurrency()) return Math.abs(native);
          const from = this.billPayFrom(bill);
          const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
          const fee = (acc && acc.foreignFee) || 0;
          const feeRes = this.calcForeignFee(native, fee, cur);
          return this.round2(Math.abs(this.toBase(native, cur)) + feeRes.feeBase);
        }),
        borderColor: this.billColor(bill),
        backgroundColor: this.billColor(bill),
        fill: false,
        tension: 0.3,
        cubicInterpolationMode: 'monotone',
        borderWidth: 2,
        pointRadius: 3
      });
    }
    this.billsChart = new Chart(canvas.getContext('2d'), {
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

  renderBillsDonut() {
    if (this.billsPieChart) this.billsPieChart.destroy();
    const canvas = document.getElementById('bills-donut-chart');
    if (!canvas || !this.billsChart) return;
    const series = this.billsChart.data.datasets.filter(d => !d._total);
    const monthly = this._billsDonutPeriod === 'month';
    const monthIndex = this.vm();
    const values = series.map(d => monthly
      ? Math.abs(Number(d.data[monthIndex]) || 0)
      : d.data.reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0));
    const total = values.reduce((sum, value) => sum + value, 0);
    const empty = total <= 0;
    const labels = series.map(d => d.label);
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const title = monthly ? monthNames[monthIndex] + ' ' + this.vy() : 'THIS YEAR';
    const titleEl = document.getElementById('bills-donut-title');
    if (titleEl) titleEl.textContent = title;
    canvas.setAttribute('aria-label', (monthly ? 'Monthly' : 'Yearly') + ' bill breakdown. Click to show ' + (monthly ? 'year' : 'month'));
    this.billsPieChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: empty ? ['No bills'] : labels, datasets: [{ data: empty ? [1] : this.donutDisplayValues(values), backgroundColor: empty ? ['#454545'] : series.map(d => d.backgroundColor), borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), borderWidth: 1, hoverOffset: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '52.5%', animation: false,
        onClick: () => { this._billsDonutPeriod = monthly ? 'year' : 'month'; this.renderBillsDonut(); },
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: ({ chart, tooltip }) => {
          const point = tooltip.dataPoints && tooltip.dataPoints[0];
          const index = point && point.dataIndex;
          this.showDonutTooltip(chart, tooltip, !empty && index != null ? labels[index] + ': ' + this.fmtBase(values[index]) + ' · ' + this.round2(values[index] / total * 100) + '%' : '');
        } } } }
    });
  },

  async reorderBill(billId, direction) {
    const bills = this.data.bills || [];
    const index = bills.findIndex(bill => bill.id === billId);
    const target = index + Math.sign(direction);
    if (index < 0 || target < 0 || target >= bills.length) return;
    [bills[index], bills[target]] = [bills[target], bills[index]];
    if (!(await this.save({ undoable: true, label: 'Reorder bills' }))) {
      [bills[index], bills[target]] = [bills[target], bills[index]];
      return;
    }
    this.renderBills();
  },

  updateBillFrequencyFields() {
    const toggle = document.getElementById('bill-frequency-toggle');
    const frequency = toggle && toggle.dataset.frequency === 'annual' ? 'annual' : 'monthly';
    document.getElementById('bill-dueMonth-group').classList.toggle('hidden', frequency !== 'annual');
    if (toggle) {
      toggle.textContent = frequency === 'annual' ? 'ANNUAL' : 'MONTHLY';
      toggle.classList.toggle('btn-primary', frequency === 'annual');
      toggle.classList.toggle('btn-muted', frequency !== 'annual');
      toggle.setAttribute('aria-pressed', String(frequency === 'annual'));
    }
  },

  toggleBillFrequency() {
    const frequency = document.getElementById('bill-frequency-toggle');
    frequency.dataset.frequency = frequency.dataset.frequency === 'annual' ? 'monthly' : 'annual';
    this.updateBillFrequencyFields();
  },

  updateBillAutopayButton() {
    const button = document.getElementById('bill-autopay-toggle');
    if (!button) return;
    const enabled = button.dataset.autopay === 'true';
    button.textContent = enabled ? 'AUTO' : 'MANUAL';
    button.classList.toggle('btn-primary', enabled);
    button.classList.toggle('btn-muted', !enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Automatic payment is on' : 'Automatic payment is off';
  },

  toggleBillAutopayField() {
    const button = document.getElementById('bill-autopay-toggle');
    button.dataset.autopay = String(button.dataset.autopay !== 'true');
    this.updateBillAutopayButton();
  },

  billOccursInMonth(bill, monthKey) {
    if (!bill || bill.frequency !== 'annual') return true;
    const month = Number(String(monthKey || '').slice(5, 7));
    return month >= 1 && month <= 12 && month === (Number(bill.dueMonth) || 1);
  },

  openBillPayModal(billId, mk) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    if (!this.getBillPayment(billId, mk) && !this.billOccursInMonth(bill, mk)) return;
    this._bpayBill = bill;
    this._bpayMk = mk;
    const existing = this.getBillPayment(billId, mk);
    const linkedTx = existing && existing.txId ? (this.data.transactions || []).find(tx => tx.id === existing.txId) : null;
    const cur = (linkedTx && (linkedTx.nativeCurrency || linkedTx.currency)) || (existing && existing.payCurrency) || bill.currency || this.baseCurrency() || 'RSD';
    const from = linkedTx ? (linkedTx.cardId ? 'card:' + linkedTx.cardId : linkedTx.accountId) : (existing && existing.accountId) || this.billPayFrom(bill);
    const accSel = document.getElementById('bpay-account');
    const curSel = document.getElementById('bpay-currency');
    accSel.innerHTML = this.accountSelectOptions(from);
    curSel.innerHTML = this.currencyList().map(c => '<option value="' + c + '"' + (c === cur ? ' selected' : '') + '>' + c + '</option>').join('');
    document.getElementById('bpay-bill').value = billId;
    document.getElementById('bpay-month').value = mk;
    this.refreshBillPayFields(bill, existing);
    this.bindBillPayForm();
    this.openModal('bill-pay-modal');
    setTimeout(() => { const a = document.getElementById('bpay-amount'); a.focus(); a.select(); }, 50);
  },

  updateBillPayFromAccount() {
    const curSel = document.getElementById('bpay-currency');
    const accSel = document.getElementById('bpay-account');
    const accVal = accSel.value;
    const acc = accVal && !accVal.startsWith('card:') ? this.data.accounts.find(a => a.id === accVal) : null;
    if (acc && curSel) curSel.value = acc.currency || this.baseCurrency() || 'RSD';
    this.refreshBillPayFields(this._bpayBill, this.getBillPayment(this._bpayBill ? this._bpayBill.id : null, this._bpayMk));
  },

  updateBillPayFromCurrency() {
    const curSel = document.getElementById('bpay-currency');
    const accSel = document.getElementById('bpay-account');
    if (curSel && accSel && accSel.value && !accSel.value.startsWith('card:')) {
      const selAcc = this.data.accounts.find(a => a.id === accSel.value);
      const selCur = (selAcc && selAcc.currency) || this.baseCurrency() || 'RSD';
      if (selCur !== curSel.value) {
        const preferred = this.defaultAccountForCurrency(curSel.value);
        if (preferred && preferred !== accSel.value) {
          accSel.innerHTML = this.accountSelectOptions(preferred);
        }
      }
    }
    this.refreshBillPayFields(this._bpayBill, this.getBillPayment(this._bpayBill ? this._bpayBill.id : null, this._bpayMk));
  },

  refreshBillPayFields(bill, existing) {
    if (!bill) return;
    const curSel = document.getElementById('bpay-currency');
    const accSel = document.getElementById('bpay-account');
    const cur = curSel.value || bill.currency || this.baseCurrency() || 'RSD';
    const from = accSel.value || this.billPayFrom(bill);
    const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
    const accCur = (acc && acc.currency) || this.baseCurrency() || 'RSD';
    const isForeign = cur !== accCur && cur !== this.baseCurrency() && accCur === this.baseCurrency();
    document.getElementById('bpay-amount-label').textContent = isForeign ? 'Amount (' + this.baseCurrency() + ')' : 'Amount (' + cur + ')';
    const nativeRow = document.getElementById('bpay-native-row');
    const nativeLabel = document.getElementById('bpay-native-label');
    const nativeInput = document.getElementById('bpay-native-amount');
    const feeRow = document.getElementById('bpay-fee-row');
    const feeLabel = document.getElementById('bpay-fee-label');
    const feeInput = document.getElementById('bpay-fee-amount');
    const feePctModal = (acc && acc.foreignFee) || 0;
    if (isForeign) {
      nativeRow.style.display = '';
      nativeLabel.textContent = 'Native Amount (' + cur + ')';
      nativeInput.value = existing && existing.nativeAmount != null ? Math.abs(existing.nativeAmount) : (bill.amount != null ? Math.abs(bill.amount) : '');
      document.getElementById('bpay-amount').value = existing ? (existing.baseAmount != null ? Math.abs(existing.baseAmount) : (existing.amount != null ? Math.abs(existing.amount) : '')) : '';
      feeRow.style.display = '';
      feeLabel.textContent = 'Fee (' + this.baseCurrency() + ')' + (feePctModal > 0 ? ' \u00b7 ' + feePctModal + '% of native' : '');
      feeInput.value = existing && existing.feeAmount != null ? Math.abs(existing.feeAmount) : '';
    } else {
      nativeRow.style.display = 'none';
      feeRow.style.display = 'none';
      document.getElementById('bpay-amount').value = existing ? (existing.baseAmount != null ? Math.abs(existing.baseAmount) : (existing.amount != null ? existing.amount : (bill.amount != null ? bill.amount : ''))) : (bill.amount != null ? bill.amount : '');
    }
    document.getElementById('bill-pay-title').textContent = bill.name + ' \u00b7 ' + this._bpayMk;
    const previewEl = document.getElementById('bpay-preview');
    const updatePreview = () => {
      if (!isForeign) { previewEl.textContent = ''; return; }
      const val = this.evalAmount(document.getElementById('bpay-amount').value);
      const nativeVal = nativeInput.value.trim() ? this.evalAmount(nativeInput.value) : null;
      const manualFee = feeInput.value.trim() ? this.evalAmount(feeInput.value) : null;
      const parts = [];
      if (val > 0 && feePctModal > 0 && (nativeVal > 0 || manualFee > 0)) {
        const autoRes = nativeVal > 0 ? this.calcForeignFee(nativeVal, feePctModal, cur) : { feeNative: null, feeBase: 0 };
        const feeBase = manualFee > 0 ? manualFee : autoRes.feeBase;
        const total = this.round2(val + feeBase);
        let feeTxt = 'FEE ' + this.fmtNumber(feeBase) + ' ' + this.baseCurrency();
        if (manualFee > 0) feeTxt += ' (manual)';
        else if (autoRes.feeNative != null) feeTxt += ' (' + this.fmtNumber(autoRes.feeNative) + ' ' + cur + ')';
        parts.push(feeTxt + ' \u2192 ' + this.fmtNumber(total) + ' ' + this.baseCurrency());
      } else if (nativeVal > 0) {
        parts.push('\u2248 ' + this.fmtNumber(nativeVal) + ' ' + cur);
      }
      previewEl.textContent = parts.join(' \u00b7 ');
    };
    document.getElementById('bpay-amount').oninput = updatePreview;
    nativeInput.oninput = updatePreview;
    feeInput.oninput = updatePreview;
    updatePreview();
  },

  bindBillPayForm() {
    const f = document.getElementById('bill-pay-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const billId = document.getElementById('bpay-bill').value;
      const mk = document.getElementById('bpay-month').value;
      let amt = this.evalAmount(document.getElementById('bpay-amount').value);
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      if (!this.data.billPayments) this.data.billPayments = [];
      const bill = this.data.bills.find(b => b.id === billId);
      const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
      if (idx >= 0) {
        this.removeBillTransaction(this.data.billPayments[idx]);
        this.data.billPayments.splice(idx, 1);
      }
      const pay = { billId: billId, month: mk, paid: true, amount: amt };
      const accSel = document.getElementById('bpay-account');
      const curSel = document.getElementById('bpay-currency');
      if (accSel && accSel.value) pay.accountId = accSel.value;
      if (curSel) pay.payCurrency = curSel.value;
      const nativeEl = document.getElementById('bpay-native-amount');
      if (nativeEl && nativeEl.offsetParent !== null && nativeEl.value.trim()) {
        const nativeVal = this.evalAmount(nativeEl.value);
        if (nativeVal > 0) pay.nativeAmount = nativeVal;
      }
      const feeEl = document.getElementById('bpay-fee-amount');
      if (feeEl && feeEl.offsetParent !== null && feeEl.value.trim()) {
        const manualFee = this.evalAmount(feeEl.value);
        if (manualFee >= 0) pay.feeAmountOverride = manualFee;
      }
      if (bill) {
        const billCur = pay.payCurrency || bill.currency || this.baseCurrency() || 'RSD';
        const from = pay.accountId || this.billPayFrom(bill);
        const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
        const accCur = (acc && acc.currency) || this.baseCurrency() || 'RSD';
        const isForeign = billCur !== accCur && billCur !== this.baseCurrency() && accCur === this.baseCurrency();
        if (isForeign) pay.amountCurrency = this.baseCurrency();
        this.attachBillTransaction(bill, pay);
      }
      this.data.billPayments.push(pay);
      await this.save({ undoable: true, label: 'Record bill payment' });
      this.closeModal('bill-pay-modal');
      this.renderBills();
    });
  },

  getBillPayment(billId, monthKey) { return (this.data.billPayments || []).find(p => p.billId === billId && p.month === monthKey); },
  repairBillPayments() {
    if (!this.data.billPayments || this._billPaymentsRepaired) return;
    this._billPaymentsRepaired = true;
    let changed = false;
    for (const p of this.data.billPayments) {
      const linkedTransactions = this.billPaymentTransactions(p);
      if (linkedTransactions.length > 1) {
        const before = JSON.stringify([p.relatedTxIds, p.txId, p.amount, p.amountCurrency, p.payCurrency]);
        this.syncBillPaymentTransactions(p, this.data.bills.find(b => b.id === p.billId));
        if (before !== JSON.stringify([p.relatedTxIds, p.txId, p.amount, p.amountCurrency, p.payCurrency])) changed = true;
        continue;
      }
      if (!p.txId) continue;
      const tx = this.data.transactions.find(t => t.id === p.txId);
      if (!tx) continue;
      const bill = this.data.bills.find(b => b.id === p.billId);
      const billCur = (bill && bill.currency) || this.baseCurrency() || 'RSD';
      const from = bill ? this.billPayFrom(bill) : null;
      const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
      const accCur = (acc && acc.currency) || this.baseCurrency() || 'RSD';
      if ((tx.currency || this.baseCurrency() || 'RSD') === this.baseCurrency() && tx.nativeAmount != null && billCur !== this.baseCurrency() && accCur === this.baseCurrency()) {
        const fee = (acc && acc.foreignFee) || 0;
        const nativeAbs = Math.abs(tx.nativeAmount);
        const buggy = this.round2(nativeAbs * (1 + fee / 100));
        if (Math.abs(tx.amount) === buggy) {
          const curR = tx.nativeCurrency || billCur;
          const feeRes = this.calcForeignFee(nativeAbs, fee, curR);
          const fixed = -this.round2(Math.abs(this.toBase(nativeAbs, curR)) + feeRes.feeBase);
          if (fixed !== tx.amount) { tx.amount = fixed; changed = true; }
        }
      }
      if (p.amount !== Math.abs(tx.amount)) { p.amount = Math.abs(tx.amount); changed = true; }
      if (tx.baseAmount != null && p.baseAmount !== Math.abs(tx.baseAmount)) { p.baseAmount = Math.abs(tx.baseAmount); changed = true; }
      if (tx.feeAmount != null && p.feeAmount !== Math.abs(tx.feeAmount)) { p.feeAmount = Math.abs(tx.feeAmount); changed = true; }
      if (tx.nativeAmount != null && p.nativeAmount !== Math.abs(tx.nativeAmount)) { p.nativeAmount = Math.abs(tx.nativeAmount); changed = true; }
      if (tx.nativeCurrency && p.nativeCurrency !== tx.nativeCurrency) { p.nativeCurrency = tx.nativeCurrency; changed = true; }
    }
    if (changed) this.save();
  },
  fmtBillAmount(bill) { const rsd = this.toBase(bill.amount, bill.currency); return this.fmtNumber(rsd) + ' ' + this.baseCurrency() + (bill.currency && bill.currency !== this.baseCurrency() ? ' (' + this.fmtNumber(bill.amount) + ' ' + bill.currency + ')' : ''); },

  // ==================== SAVINGS ====================
});
})();
