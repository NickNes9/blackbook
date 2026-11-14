(function () {
Object.assign(window.BlackBook, {
  billsChipsHtml() {
    const bills = this.data.bills;
    let html = '<div class="cat-filter">';
    const hc = this.data.settings.highlightColor || '#fa8c3c';
    const allOn = bills.length > 0 && bills.every(bill => bill.active !== false);
    html += '<div class="cat-filter-chip' + (allOn ? ' selected' : '') + '" style="--cc:' + hc + ';' + (allOn ? 'background:' + hc + ';color:var(--on-fill);' : 'color:' + hc + ';') + '" onclick="BlackBook.toggleBillsAll()" title="Toggle all bill categories">ALL</div>';
    const forecastOn = this._billsForecastOn === true;
    const forecastColor = '#8a8a8a';
    html += '<div class="cat-filter-chip' + (forecastOn ? ' selected' : '') + '" style="--cc:' + forecastColor + ';' + (forecastOn ? 'background:' + forecastColor + ';color:#111;' : 'color:' + forecastColor + ';') + '" onclick="BlackBook.toggleBillsForecast()" title="Extrapolated bill-payment average from up to three previous years">FORECAST</div>';
    for (const b of bills) {
      const color = this.billColor(b);
      const on = b.active !== false;
      const amt = b.amount != null ? ' \u00b7 ' + this.fmtAmount(Math.abs(b.amount), b.currency || this.baseCurrency() || 'RSD') : '';
      html += '<div class="cat-filter-chip' + (on ? ' selected' : '') + '" style="--cc:' + color + ';' + (on ? 'background:' + color + ';color:var(--on-fill);' : '') + (on ? '' : 'opacity:0.55;') + '" onclick="BlackBook.toggleBillActive(\x27' + b.id + '\x27, event)" title="' + this.escapeHtml(b.name) + amt + ' \u00b7 click: toggle · Shift-click: toggle while keeping other selections · Alt-click: isolate">' + this.escapeHtml(b.name) + '</div>';
    }
    html += '<span style="flex:1;"></span>';
    return html + '</div>';
  },

  async toggleBillsAll() {
    this.closeBillsFilterMenu();
    const bills = this.data.bills || [];
    const activateAll = !bills.length || !bills.every(bill => bill.active !== false);
    bills.forEach(bill => { bill.active = activateAll; });
    await this.save({ undoable:true, label:activateAll ? 'Show all bill categories' : 'Hide all bill categories' });
    this.renderBills();
  },

  toggleBillsForecast() {
    this._billsForecastOn = this._billsForecastOn !== true;
    this.renderBills();
  },

  renderBills() {
    const el = document.getElementById('page-bills');
    if (!el) return;
    const chartHeights = this.captureChartPanelHeights(el);
    this.hideDonutTooltip();
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    if (this.billsPieChart) { this.billsPieChart.destroy(); this.billsPieChart = null; }
    if (!this._billsViewportListenerBound && window.matchMedia) {
      this._billsViewportListenerBound = true;
      window.matchMedia('(max-width:500px)').addEventListener('change', () => {
        if (this.currentPage === 'bills') this.renderBills();
      });
    }
    this.repairBillPayments();
    const mobileView = !!(window.matchMedia && window.matchMedia('(max-width:500px)').matches);
    const hideGraph = mobileView
      ? this._mobileBillsGraphOn !== true
      : !!(this.data.settings && this.data.settings.hideBillsGraph);
    this._billsHoveredMonth = this.vm();
    const offToday = this.vy() !== new Date().getFullYear();
    el.innerHTML = '<div class="month-picker bills-month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<button class="mp-today btn btn-secondary page-control' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '<span style="flex:1;"></span>' +
      (mobileView
        ? '<span class="mobile-bill-count">BILLS ' + (this.data.bills || []).length + '</span>'
        : '<button class="btn btn-primary" onclick="BlackBook.openNewBill()">+ NEW BILL</button>') +
      '</div>' +
      this.billsSummaryHtml() +
      '<div class="list-sep"></div>' +
      '<div class="page-scroll-wrap">' + (mobileView ? this.mobileBillsListHtml() : this.billsGridHtml()) + '</div>' +
      (hideGraph
        ? ''
        : '<div class="list-sep"></div><div class="bills-graph-controls">' +
          '<span id="bills-month-readout" class="bills-month-readout" aria-live="polite"></span><button type="button" class="bills-mobile-filter-toggle btn btn-secondary page-control" aria-expanded="false" onclick="BlackBook.toggleBillsFilterMenu()">CATEGORIES</button>' +
          '<div class="bills-filter-panel">' + this.billsChipsHtml() + '</div></div>' +
          '<div class="overview-charts with-donut"><div class="chart-panel donut-panel bills-breakdown-panel">' +
            (mobileView ? '' : '<div class="chart-head-row"><span id="bills-donut-title" class="chart-title-text">THIS YEAR</span></div>') +
            '<div class="budget-donut-wrap"><canvas id="bills-donut-chart" aria-label="Bill breakdown"></canvas></div></div><div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">TOTAL BY MONTH</span></div><canvas id="bills-chart"></canvas></div></div>');
    this.observeBillAmountFit(el);
    this.restoreChartPanelHeights(el, chartHeights);
    this.bindBillReordering(el.querySelector('.bills-grid'));
    if (!hideGraph) this.renderBillsChart();
    this.finishFocus('bill');
  },

  toggleBillsFilterMenu() {
    const wrap = document.querySelector('#page-bills .bills-graph-controls');
    if (!wrap) return;
    const open = wrap.classList.toggle('is-open');
    const button = wrap.querySelector('.bills-mobile-filter-toggle');
    if (button) button.setAttribute('aria-expanded', String(open));
  },

  closeBillsFilterMenu() {
    const wrap = document.querySelector('#page-bills .bills-graph-controls');
    if (!wrap) return;
    wrap.classList.remove('is-open');
    const button = wrap.querySelector('.bills-mobile-filter-toggle');
    if (button) button.setAttribute('aria-expanded', 'false');
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
    if (window.matchMedia && window.matchMedia('(max-width:500px)').matches) {
      this._mobileBillsGraphOn = this._mobileBillsGraphOn !== true;
      this.renderBills();
      this.updateGraphFooter();
      return;
    }
    this.data.settings.hideBillsGraph = !(this.data.settings && this.data.settings.hideBillsGraph);
    await this.save();
    this.renderPage('bills');
    this.updateGraphFooter();
  },

  billsSummaryHtml() {
    const [todayYear, todayMonth] = this.today().split('-').map(Number);
    const previousMonth = new Date(todayYear, todayMonth - 2, 1);
    const monthKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    const totalForMonth = key => {
      let sum = 0;
      for (const bill of this.data.bills) {
        const payment = this.getBillPayment(bill.id, key);
        if (payment) sum += this.billPaymentTotalBase(payment, bill);
      }
      return this.round2(sum);
    };
    const previousMonthTotal = totalForMonth(monthKey(previousMonth));
    let rollingYearTotal = 0;
    for (let offset = 0; offset < 12; offset++) {
      rollingYearTotal += totalForMonth(monthKey(new Date(previousMonth.getFullYear(), previousMonth.getMonth() - offset, 1)));
    }
    const yearlyAverage = this.round2(rollingYearTotal / 12);
    return '<div class="month-summary bills-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">PAST MONTH</span><span class="month-summary-value">' + this.fmtBase(previousMonthTotal) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">YEARLY AVERAGE</span><span class="month-summary-value">' + this.fmtBase(yearlyAverage) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">BILLS</span><span class="month-summary-value">' + this.data.bills.length + '</span></div>' +
      '</div>';
  },

billsGridHtml() {
    const formatGridAmount = (amount) => this.formatBillGridAmount(amount);
    const compactAmount = (amount) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 0 }).format(amount).toLowerCase().replace(/^-0$/, '0');
    const responsiveAmount = (amount, currency, native = false) => {
      const currencyLabel = this.currencyShortLabel(currency);
      const full = formatGridAmount(amount) + (native ? ' ' + currency : '');
      const short = native
        ? (this.data.settings.currencyDisplay === 'code' ? compactAmount(amount) + ' ' + currencyLabel : currencyLabel + compactAmount(amount))
        : compactAmount(amount);
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
    for (const bill of this.data.bills) {
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
      html += '<div class="bill-cell-label' + alt + (bill.active ? '' : ' inactive') + this.focusRecordHtml('bill', bill.id) + '" data-reorder-bill="' + bill.id + '" role="button" tabindex="0" onclick="BlackBook.openEditBill(\x27' + bill.id + '\x27)" onkeydown="if(event.target===this&&(event.key===\x27Enter\x27||event.key===\x27 \x27)){event.preventDefault();BlackBook.openEditBill(\x27' + bill.id + '\x27)}">' +
        '<span class="bill-name-line"><span class="cat-dot" style="background:' + color + ';"></span><span class="bill-name-text">' + this.escapeHtml(bill.name) + this.healthMarker('bills', bill.id) + '</span>' + (bill.autopay ? '<span class="bill-autopay-indicator" title="Automatic payment" aria-label="Automatic payment">' + this.refreshIcon() + '</span>' : '') + '</span>' +
        '<span class="bill-due-day">' + (bill.frequency === 'annual' ? MONTHS_F[(Number(bill.dueMonth) || 1) - 1] + ' ' : '') + this.ordinalDay(bill.dueDay) + '</span>' +
        '</div>';
      for (let m = 0; m < 12; m++) {
        const mk = this.vy() + '-' + String(m + 1).padStart(2, '0');
        const paid = this.getBillPayment(bill.id, mk);
        if (!paid && !this.billOccursInMonth(bill, mk)) {
          html += '<div class="bill-cell disabled bill-not-due' + alt + '" data-reorder-bill="' + bill.id + '" aria-hidden="true"></div>';
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
        html += '<div class="bill-cell' + alt + (paid ? ' paid' : '') + '" data-reorder-bill="' + bill.id + '"' + cellStyle + ' onclick="BlackBook.' + clickFn + '(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + (bill.frequency === 'annual' ? MONTHS_F[(Number(bill.dueMonth) || 1) - 1] + ' ' : '') + this.ordinalDay(bill.dueDay) +
          (paid ? ' \u00b7 paid' + (linkedCount > 1 ? ' · ' + linkedCount + ' linked transactions' : '') + ' \u00b7 click to unpay' : ' \u00b7 click to mark paid') +
          ' &middot; right-click for custom amount">' + amtLabel + (paid ? this.billChangeIndicator(bill, mk, paid) : '') + transactionLink + '</div>';
      }
      html += '<div class="bill-cell-total' + alt + '" data-reorder-bill="' + bill.id + '"' + (yearHasPaid ? ' style="background:' + color + '22;color:' + color + ';font-weight:700;" title="' + this.escapeHtml(formatGridAmount(yearTotal) + ' ' + this.baseCurrency()) + '"' : '') + '>' + (yearHasPaid ? responsiveAmount(yearTotal, this.baseCurrency()) : '') + '</div>';
      bi++;
    }
    html += '</div>';
    return html;
  },

  mobileBillPaymentMonth(bill) {
    const today = this.today();
    if (bill && bill.frequency === 'annual') return today.slice(0, 4) + '-' + String(Number(bill.dueMonth) || 1).padStart(2, '0');
    return today.slice(0, 7);
  },

  mobileBillPaymentBase(payment, bill, transactionById) {
    const linked = this.billPaymentTransactionIds(payment).map(id => transactionById.get(id)).filter(Boolean);
    if (linked.length) return this.round2(linked.reduce((sum, tx) => sum + Math.abs(this.transactionToBase(tx)), 0));
    const amount = payment && payment.amount != null ? payment.amount : bill && bill.amount;
    if (amount == null) return 0;
    if (payment && payment.nativeAmount != null && !payment.amountCurrency) return Math.abs(Number(amount) || 0);
    const currency = payment && (payment.amountCurrency || payment.payCurrency) || bill && bill.currency || this.baseCurrency();
    return Math.abs(this.toBase(Number(amount) || 0, currency));
  },

  mobileBillChangeHtml(bill, monthKey, payment, paymentFor, transactionById) {
    if (!payment || payment.paid === false) return '';
    const [year, month] = monthKey.split('-').map(Number);
    const annual = bill.frequency === 'annual';
    const previousKey = annual || month === 1
      ? (year - 1) + '-' + String(annual ? month : 12).padStart(2, '0')
      : year + '-' + String(month - 1).padStart(2, '0');
    const previous = paymentFor(bill.id, previousKey);
    if (!previous || previous.paid === false) return '';
    const currentAmount = this.mobileBillPaymentBase(payment, bill, transactionById);
    const previousAmount = this.mobileBillPaymentBase(previous, bill, transactionById);
    const change = this.round2(currentAmount - previousAmount);
    if (!change) return '';
    const direction = change > 0 ? 'more' : 'less';
    const period = bill.frequency === 'annual' ? 'previous year' : 'previous month';
    return '<span class="mobile-bill-change is-' + direction + '" title="' + (change > 0 ? 'Higher' : 'Lower') + ' than the ' + period + '" aria-label="' + (change > 0 ? 'Higher' : 'Lower') + ' than the ' + period + '">' + (change > 0 ? '↑' : '↓') + '</span>';
  },

  mobileBillHistoryHtml(bill, paymentFor, transactionById) {
    const year = String(this.vy());
    const monthNames = Array.from({ length:12 }, (_, month) => new Date(Number(year), month, 1).toLocaleString('en', { month:'long' }));
    let html = '<div class="mobile-bill-history" hidden>';
    for (let month = 0; month < 12; month++) {
      const monthKey = year + '-' + String(month + 1).padStart(2, '0');
      const payment = paymentFor(bill.id, monthKey);
      if (!payment && !this.billOccursInMonth(bill, monthKey)) continue;
      const paid = !!payment && payment.paid !== false;
      const state = paid ? this.fmtBase(this.mobileBillPaymentBase(payment, bill, transactionById)) : '';
      const linkedIds = paid ? this.billPaymentTransactionIds(payment).filter(id => transactionById.has(id)) : [];
      const change = this.mobileBillChangeHtml(bill, monthKey, payment, paymentFor, transactionById);
      html += '<button type="button" class="mobile-bill-month' + (paid ? ' is-paid' : '') + (monthKey === this.today().slice(0,7) ? ' is-current' : '') + '" onclick="BlackBook.openMobileBillMonth(\'' + this.escapeHtml(bill.id) + '\',\'' + monthKey + '\')"><span class="mobile-bill-month-name">' + monthNames[month] + '</span><span class="mobile-bill-month-state">' + this.escapeHtml(state) + '</span>' + (change ? '<span class="mobile-bill-month-change">' + change + '</span>' : '') + (linkedIds.length ? '<span class="mobile-bill-month-link" aria-label="Open linked transaction">' + this.transactionLinkIcon() + '</span>' : '') + '</button>';
    }
    return html + '</div>';
  },

  mobileBillsListHtml() {
    if (!window.matchMedia('(max-width:500px)').matches) return '<div class="mobile-bills-list"></div>';
    const bills = this.data.bills || [];
    let html = '<div class="mobile-bills-list">';
    if (!bills.length) return html + '<p class="mobile-bills-empty">No bills yet.</p></div>';

    const linkedIds = new Set((this.data.billPayments || []).flatMap(payment => this.billPaymentTransactionIds(payment)));
    const transactionById = new Map();
    for (const tx of this.data.transactions || []) if (linkedIds.has(tx.id)) transactionById.set(tx.id, tx);
    const paymentByKey = new Map();
    for (const payment of this.data.billPayments || []) {
      const key = payment.billId + '|' + payment.month;
      if (!paymentByKey.has(key)) paymentByKey.set(key, payment);
    }
    const paymentFor = (billId, monthKey) => paymentByKey.get(billId + '|' + monthKey);

    for (const bill of bills) {
      const color = this.billColor(bill);
      const monthKey = this.mobileBillPaymentMonth(bill);
      const payment = paymentFor(bill.id, monthKey);
      const paid = !!payment && payment.paid !== false;
      const annual = bill.frequency === 'annual';
      const dueMonth = Number(bill.dueMonth) || 1;
      const dueLabel = (annual ? new Date(2000, dueMonth - 1, 1).toLocaleString('en', { month:'short' }) + ' ' : '') + this.ordinalDay(bill.dueDay);
      const amount = paid ? '<span class="mobile-bill-paid-amount">' + this.escapeHtml(this.fmtBase(this.mobileBillPaymentBase(payment, bill, transactionById))) + '</span>' : '';
      const trend = this.mobileBillChangeHtml(bill, monthKey, payment, paymentFor, transactionById);
      html += '<article class="mobile-bill-entry' + (bill.active === false ? ' is-inactive' : '') + '" data-bill-id="' + this.escapeHtml(bill.id) + '"><div class="mobile-bill-shell"><button type="button" class="mobile-bill-row" data-pay-month="' + monthKey + '" style="--bill-color:' + color + ';" aria-expanded="false" onclick="BlackBook.toggleMobileBillHistory(\'' + this.escapeHtml(bill.id) + '\')"><span class="mobile-bill-color" aria-hidden="true"></span><span class="mobile-bill-main"><span class="mobile-bill-title"><span class="mobile-bill-name">' + this.escapeHtml(bill.name) + '</span>' + (bill.autopay ? '<span class="bill-autopay-indicator" title="Automatic payment" aria-label="Automatic payment">' + this.refreshIcon() + '</span>' : '') + '<span class="mobile-bill-date">' + this.escapeHtml(dueLabel) + '</span></span>' + (amount || trend ? '<span class="mobile-bill-payment">' + amount + (trend ? '<span class="mobile-bill-trend">' + trend + '</span>' : '') + '</span>' : '') + '</span></button></div>' + this.mobileBillHistoryHtml(bill, paymentFor, transactionById) + '</article>';
    }
    return html + '</div>';
  },

  toggleMobileBillHistory(billId) {
    const entry = [...document.querySelectorAll('#page-bills .mobile-bill-entry')].find(item => item.dataset.billId === billId);
    if (!entry) return;
    const row = entry.querySelector('.mobile-bill-row');
    const history = entry.querySelector('.mobile-bill-history');
    const expanded = row.getAttribute('aria-expanded') !== 'true';
    if (expanded) {
      document.querySelectorAll('#page-bills .mobile-bill-entry.is-expanded').forEach(other => {
        if (other === entry) return;
        other.classList.remove('is-expanded');
        const otherRow = other.querySelector('.mobile-bill-row');
        const otherHistory = other.querySelector('.mobile-bill-history');
        if (otherRow) otherRow.setAttribute('aria-expanded', 'false');
        if (otherHistory) otherHistory.hidden = true;
      });
    }
    row.setAttribute('aria-expanded', String(expanded));
    entry.classList.toggle('is-expanded', expanded);
    history.hidden = !expanded;
  },

  openMobileBillMonth(billId, monthKey) {
    const payment = this.getBillPayment(billId, monthKey);
    const linkedIds = payment && this.billPaymentTransactionIds(payment).filter(id => (this.data.transactions || []).some(tx => tx.id === id));
    if (linkedIds && linkedIds.length) this.openDataHealthTransactions(linkedIds);
    else this.openBillPayModal(billId, monthKey);
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
    const deleteButton = document.getElementById('bill-delete-button');
    if (deleteButton) deleteButton.classList.add('hidden');
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
    const deleteButton = document.getElementById('bill-delete-button');
    if (deleteButton) deleteButton.classList.remove('hidden');
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
    this.closeModal('bill-modal');
    this.data.bills = this.data.bills.filter(b => b.id !== billId);
    for (const p of (this.data.billPayments || [])) { if (p.billId === billId) this.removeBillTransaction(p); }
    this.data.billPayments = (this.data.billPayments || []).filter(p => p.billId !== billId);
    await this.save({ undoable: true, label: 'Delete bill' });
    this.renderBills();
  },

  async toggleBillActive(billId, ev) {
    this.closeBillsFilterMenu();
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

  billsHistoricalForecast(year) {
    const transactions = this.data.transactions || [];
    const payments = this.data.billPayments || [];
    const bills = (this.data.bills || []).filter(bill => bill.active !== false);
    const sequence = this._saveSequence || 0;
    const cache = this._billsForecastCache;
    if (cache && cache.year === year && cache.sequence === sequence && cache.transactions === transactions && cache.payments === payments && cache.bills === this.data.bills) return cache.values.slice();

    const billById = new Map(bills.map(bill => [bill.id, bill]));
    const paymentByTxId = new Map();
    const historicalPayments = [];
    for (const payment of payments) {
      const bill = billById.get(payment.billId);
      const month = String(payment.month || '');
      if (!bill || payment.paid === false || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) continue;
      const paymentYear = Number(month.slice(0, 4));
      if (paymentYear >= year || paymentYear < year - 3) continue;
      const paymentKey = String(payment.billId) + '|' + month;
      historicalPayments.push({ payment, bill, month, year: paymentYear, key: paymentKey });
      for (const id of this.billPaymentTransactionIds(payment)) {
        const txId = String(id);
        if (!paymentByTxId.has(txId)) paymentByTxId.set(txId, []);
        paymentByTxId.get(txId).push(paymentKey);
      }
    }

    const linkedTotals = new Map();
    const linkedPaymentKeys = new Set();
    for (const tx of transactions) {
      const keys = paymentByTxId.get(String(tx.id));
      if (!keys || this.isTransfer(tx)) continue;
      const amount = Math.abs(this.transactionToBase(tx));
      for (const paymentKey of keys) {
        linkedPaymentKeys.add(paymentKey);
        linkedTotals.set(paymentKey, (linkedTotals.get(paymentKey) || 0) + amount);
      }
    }

    const monthTotals = new Map();
    const firstObserved = new Map();
    for (const { payment, bill, month, key: paymentKey } of historicalPayments) {
      let amount;
      if (linkedPaymentKeys.has(paymentKey)) amount = linkedTotals.get(paymentKey) || 0;
      else {
        const raw = payment.amount != null ? payment.amount : bill.amount;
        if (raw == null) continue;
        if (payment.nativeAmount != null && !payment.amountCurrency) amount = Math.abs(Number(raw) || 0);
        else amount = Math.abs(this.toBase(Number(raw) || 0, payment.amountCurrency || payment.payCurrency || bill.currency || this.baseCurrency()));
      }
      const billMonthKey = String(payment.billId) + '|' + month;
      monthTotals.set(billMonthKey, (monthTotals.get(billMonthKey) || 0) + amount);
      const first = firstObserved.get(payment.billId);
      if (!first || month < first) firstObserved.set(payment.billId, month);
    }

    const [todayYear, todayMonth] = this.today().split('-').map(Number);
    const values = Array.from({ length: 12 }, (_, month) => {
      let total = 0, hasHistory = false;
      for (const bill of bills) {
        const first = firstObserved.get(bill.id);
        if (!first) continue;
        const firstYear = Number(first.slice(0, 4));
        const firstMonth = Number(first.slice(5, 7)) - 1;
        let sum = 0, count = 0;
        for (let historyYear = Math.max(1900, year - 3, firstYear); historyYear < year; historyYear++) {
          if (historyYear === firstYear && month < firstMonth) continue;
          if (historyYear === todayYear && month >= todayMonth - 1) continue;
          const monthKey = historyYear + '-' + String(month + 1).padStart(2, '0');
          sum += monthTotals.get(String(bill.id) + '|' + monthKey) || 0;
          count++;
        }
        if (count) { total += sum / count; hasHistory = true; }
      }
      return hasHistory ? this.round2(total) : null;
    });

    this._billsForecastCache = { year, sequence, transactions, payments, bills: this.data.bills, values };
    return values.slice();
  },

  billAmountBaseForMonth(bill, monthKey) {
    const payment = this.getBillPayment(bill.id, monthKey);
    if (payment) return Math.abs(this.billPaymentTotalBase(payment, bill));
    if (!this.billOccursInMonth(bill, monthKey) || bill.amount == null) return 0;
    const native = Math.abs(Number(bill.amount) || 0);
    const currency = bill.currency || this.baseCurrency() || 'RSD';
    if (currency === this.baseCurrency()) return native;
    const accountId = this.billPayFrom(bill);
    const account = accountId && !accountId.startsWith('card:') ? this.data.accounts.find(item => item.id === accountId) : null;
    const fee = (account && account.foreignFee) || 0;
    return this.round2(Math.abs(this.toBase(native, currency)) + this.calcForeignFee(native, fee, currency).feeBase);
  },

  renderBillsChart() {
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    const canvas = document.getElementById('bills-chart');
    if (!canvas) return;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(this.vy() + '-' + String(m).padStart(2, '0'));
    const datasets = [];
    const hc = this.data.settings.highlightColor || '#fa8c3c';
    const initialMonth = Math.max(0, Math.min(11, Number(this.vm()) || 0));
    const activeBills = (this.data.bills || []).filter(bill => bill.active !== false);
    activeBills.forEach(bill => {
      const color = this.billColor(bill);
      datasets.push({
        label: bill.name,
        _billId: bill.id,
        data: months.map(monthKey => this.billAmountBaseForMonth(bill, monthKey)),
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.3,
        cubicInterpolationMode: 'monotone',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0
      });
    });
    datasets.push({
        label: 'TOTAL', _total: true,
        data: months.map(monthKey => this.round2(activeBills.reduce((sum, bill) => sum + this.billAmountBaseForMonth(bill, monthKey), 0))),
        borderColor: hc,
        backgroundColor: hc,
        fill: false,
        tension: 0.3,
        cubicInterpolationMode: 'monotone',
        borderWidth: 2.5,
        pointRadius: 2
    });
    if (this._billsForecastOn === true) {
      datasets.push({
        label: 'EXTRAPOLATED BILL FORECAST · 3-YEAR AVERAGE',
        _forecast: true,
        data: this.billsHistoricalForecast(this.vy()),
        borderColor: '#8a8a8a',
        backgroundColor: '#8a8a8a',
        borderDash: [4, 3],
        fill: false,
        tension: 0.25,
        cubicInterpolationMode: 'monotone',
        borderWidth: 1.25,
        pointRadius: 0,
        pointHoverRadius: 3
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
          tooltip: { enabled: false }
        },
        interaction:{ mode:'index', intersect:false },
        scales: {
          x: { ticks: { color: '#555555', autoSkip: false, maxRotation: 0, font: { size: 11 } }, grid: { color: this.chartGridColor('#141414') } },
          y: { ticks: { color: '#555555', font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: this.chartGridColor('#141414') } }
        }
      },
      plugins:[{
        id:'bills-month-marker',
        afterDatasetsDraw: chart => {
          const index = chart.$billsActiveMonth;
          const x = chart.scales.x && chart.scales.x.getPixelForValue(index);
          if (!Number.isFinite(x)) return;
          const { ctx, chartArea } = chart;
          ctx.save();
          ctx.strokeStyle = hc;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, chartArea.top);
          ctx.lineTo(Math.round(x) + 0.5, chartArea.bottom);
          ctx.stroke();
          ctx.restore();
        }
      }]
    });
    const chart = this.billsChart;
    chart.$billsActiveMonth = initialMonth;
    this._billsHoveredMonth = initialMonth;
    this.renderBillsDonut(initialMonth);
    chart.draw();
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'pan-y';
    const isInsidePlot = event => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const area = chart.chartArea;
      return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
    };
    const setMonth = index => {
      const next = Math.max(0, Math.min(11, index));
      if (chart.$billsActiveMonth === next) return;
      chart.$billsActiveMonth = next;
      this._billsHoveredMonth = next;
      this.renderBillsDonut(next);
      chart.draw();
    };
    const resetMonth = () => setMonth(initialMonth);
    const chooseMonth = event => {
      if (!isInsidePlot(event)) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const area = chart.chartArea;
      const value = chart.scales.x.getValueForPixel(Math.max(area.left, Math.min(area.right, x)));
      if (Number.isFinite(value)) setMonth(Math.round(value));
    };
    canvas.addEventListener('mousemove', event => {
      if (isInsidePlot(event)) chooseMonth(event);
      else resetMonth();
    });
    canvas.addEventListener('mouseleave', resetMonth);
  },

  renderBillsDonut(monthOverride) {
    const canvas = document.getElementById('bills-donut-chart');
    if (!canvas) return;
    const mobileView = !!(window.matchMedia && window.matchMedia('(max-width:500px)').matches);
    const series = (this.data.bills || []).filter(bill => bill.active !== false);
    const monthIndex = Math.max(0, Math.min(11, Number(monthOverride ?? this._billsHoveredMonth ?? this.vm()) || 0));
    const monthKey = this.vy() + '-' + String(monthIndex + 1).padStart(2, '0');
    const monthName = new Date(this.vy(), monthIndex, 1).toLocaleString('en', { month:'long' }).toUpperCase();
    const readout = document.getElementById('bills-month-readout');
    const monthValues = series.map(bill => this.billAmountBaseForMonth(bill, monthKey));
    const monthTotal = monthValues.reduce((sum, value) => sum + value, 0);
    if (readout) readout.textContent = monthName + ' · ' + this.fmtBase(monthTotal);

    if (mobileView) {
      const panel = canvas.closest('.bills-breakdown-panel');
      if (panel && panel.dataset.mobileAutoHeight) {
        panel.style.height = '';
        delete panel.dataset.mobileAutoHeight;
      }
      canvas.setAttribute('aria-label', monthName + ' bill breakdown as a square-root-normalized stacked bar');
      const displayValues = this.sqrtNormalizedValues(monthValues);
      const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const datasets = monthTotal <= 0
        ? [{ label:'No bills', data:[1], stack:'bill-composition', backgroundColor:'#454545', borderColor:background, borderWidth:1 }]
        : series.map((bill, index) => ({
            label:bill.name,
            data:[displayValues[index]],
            _actual:monthValues[index],
            _percentage:this.round2(monthValues[index] / monthTotal * 100),
            stack:'bill-composition',
            backgroundColor:this.billColor(bill),
            borderColor:background,
            borderWidth:1,
            minBarLength:2,
            borderRadius:0,
            borderSkipped:false
          }));
      const tooltip = { legend:{display:false}, tooltip:{enabled:false, external:({chart, tooltip}) => {
        const point = tooltip.dataPoints && tooltip.dataPoints[0];
        const dataset = point && point.dataset;
        this.showDonutTooltip(chart, tooltip, monthTotal > 0 && dataset && dataset._actual != null
          ? dataset.label + ': ' + this.fmtBase(dataset._actual) + ' · ' + dataset._percentage + '%'
          : '');
      } } };
      if (this.billsPieChart) {
        this.billsPieChart.data.labels = [monthName];
        this.billsPieChart.data.datasets = datasets;
        this.billsPieChart.update('none');
        return;
      }
      this.billsPieChart = new Chart(canvas.getContext('2d'), {
        type:'bar',
        data:{ labels:[monthName], datasets:datasets },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          animation:false,
          indexAxis:'y',
          interaction:{mode:'nearest',intersect:true},
          layout:{padding:{left:4,right:4}},
          barThickness:28,
          plugins:tooltip,
          scales:{
            x:{beginAtZero:true,max:1,stacked:true,display:false,grid:{display:false},border:{display:false}},
            y:{stacked:true,display:false,grid:{display:false},border:{display:false}}
          }
        }
      });
      return;
    }

    const monthly = this._billsDonutPeriod === 'month';
    const labels = series.map(bill => bill.name);
    const values = monthly ? monthValues : series.map(bill => {
      let total = 0;
      for (let month = 1; month <= 12; month++) {
        const key = this.vy() + '-' + String(month).padStart(2, '0');
        total += this.billAmountBaseForMonth(bill, key);
      }
      return total;
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    const empty = total <= 0;
    const title = monthly ? monthName + ' ' + this.vy() : 'THIS YEAR';
    const titleEl = document.getElementById('bills-donut-title');
    if (titleEl) titleEl.textContent = title;
    canvas.setAttribute('aria-label', (monthly ? 'Monthly' : 'Yearly') + ' bill breakdown');
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const data = empty ? [1] : this.donutDisplayValues(values);
    const colors = empty ? ['#454545'] : series.map(bill => this.billColor(bill));
    const tooltip = { legend:{display:false}, tooltip:{enabled:false, external:({chart, tooltip}) => {
      const point = tooltip.dataPoints && tooltip.dataPoints[0];
      const index = point && point.dataIndex;
      this.showDonutTooltip(chart, tooltip, !empty && index != null
        ? labels[index] + ': ' + this.fmtBase(values[index]) + ' · ' + this.round2(values[index] / total * 100) + '%'
        : '');
    } } };
    if (this.billsPieChart) this.billsPieChart.destroy();
    this.billsPieChart = new Chart(canvas.getContext('2d'), {
      type:'doughnut',
      data:{ labels:empty ? ['No bills'] : labels, datasets:[{
        data:data,
        backgroundColor:colors,
        borderColor:background,
        borderWidth:1,
        hoverOffset:0
      }] },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        cutout:'52.5%',
        animation:false,
        onClick:() => {
          this._billsDonutPeriod = monthly ? 'year' : 'month';
          this.renderBillsDonut(monthIndex);
        },
        plugins:tooltip
      }
    });
  },
  bindBillReordering(grid) {
    if (!grid) return;
    let active = null;
    const labels = () => Array.from(grid.querySelectorAll('.bill-cell-label[data-reorder-bill]'));
    const itemsForBill = billId => Array.from(grid.querySelectorAll('[data-reorder-bill]')).filter(item => item.dataset.reorderBill === billId);
    const clearTargets = () => labels().forEach(label => label.classList.remove('reorder-target-before', 'reorder-target-after'));
    const finish = event => {
      if (!active || (event && event.pointerId !== active.pointerId)) return;
      const drag = active;
      active = null;
      clearTargets();
      drag.items.forEach(item => item.classList.remove('reorder-dragging'));
      if (!drag.moved) return;
      drag.items.forEach(item => { item._billSuppressClickUntil = Date.now() + 300; });
      if (event.type !== 'pointercancel' && drag.targetIndex !== drag.startIndex) this.reorderBillToIndex(drag.id, drag.targetIndex);
    };
    grid.addEventListener('pointerdown', event => {
      const item = event.target.closest('[data-reorder-bill]');
      if (!item || (event.button != null && event.button !== 0) || event.target.closest('button, a, input, select, textarea')) return;
      const billId = item.dataset.reorderBill;
      const row = labels().find(label => label.dataset.reorderBill === billId);
      if (!row) return;
      const all = labels();
      if (all.length < 2) return;
      const index = all.indexOf(row);
      active = { id:billId, row, items:itemsForBill(billId), pointerId:event.pointerId, startY:event.clientY, startIndex:index, targetIndex:index, moved:false };
      try { item.setPointerCapture(event.pointerId); } catch (err) {}
    }, true);
    grid.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.pointerId) return;
      if (!active.moved && Math.abs(event.clientY - active.startY) < 6) return;
      active.moved = true;
      const all = labels();
      active.items.forEach(item => item.classList.add('reorder-dragging'));
      clearTargets();
      const others = all.filter(label => label !== active.row);
      let target = others.find(label => event.clientY < label.getBoundingClientRect().top + label.getBoundingClientRect().height / 2);
      let side = 'before';
      let targetIndex;
      if (target) targetIndex = all.indexOf(target);
      else {
        target = others[others.length - 1];
        side = 'after';
        targetIndex = all.length;
      }
      if (targetIndex > active.startIndex) targetIndex--;
      active.targetIndex = Math.max(0, Math.min(all.length - 1, targetIndex));
      if (target) target.classList.add(side === 'before' ? 'reorder-target-before' : 'reorder-target-after');
      event.preventDefault();
    }, true);
    grid.addEventListener('pointerup', finish, true);
    grid.addEventListener('pointercancel', finish, true);
    grid.addEventListener('click', event => {
      const item = event.target.closest('[data-reorder-bill]');
      if (item && Date.now() < (item._billSuppressClickUntil || 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  },

  async reorderBillToIndex(billId, targetIndex) {
    const bills = this.data.bills || [];
    const index = bills.findIndex(bill => bill.id === billId);
    if (index < 0 || targetIndex < 0 || targetIndex >= bills.length || index === targetIndex) return;
    const [bill] = bills.splice(index, 1);
    bills.splice(targetIndex, 0, bill);
    if (!(await this.save({ undoable:true, label:'Reorder bills' }))) {
      const nextIndex = bills.indexOf(bill);
      bills.splice(nextIndex, 1);
      bills.splice(index, 0, bill);
      return;
    }
    this.renderBills();
  },

  async reorderBill(billId, direction) {
    const bills = this.data.bills || [];
    const index = bills.findIndex(bill => bill.id === billId);
    return this.reorderBillToIndex(billId, index + Math.sign(direction));
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
