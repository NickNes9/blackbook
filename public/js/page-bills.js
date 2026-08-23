(function () {
Object.assign(window.BlackBook, {
  billsChipsHtml() {
    const bills = this.data.bills;
    let html = '<div class="cat-filter">';
    const hc = this.data.settings.highlightColor || '#fa8c3c';
    const totOn = this._billsTotalOn !== false;
    html += '<div class="cat-filter-chip' + (totOn ? ' selected' : '') + '" style="--cc:' + hc + ';' + (totOn ? 'background:' + hc + ';color:var(--on-fill);' : '') + '" onclick="BlackBook.toggleBillsTotal()" title="Monthly total line \u00b7 click to toggle">' +
      '<span style="' + (totOn ? '' : 'opacity:0.5;') + '">TOTAL</span></div>';
    for (const b of bills) {
      const color = b.color || this.billColor(b);
      const on = b.active !== false;
      const amt = b.amount != null ? ' \u00b7 ' + this.fmtAmount(Math.abs(b.amount), b.currency || 'RSD') : '';
      html += '<div class="cat-filter-chip' + (on ? ' selected' : '') + '" style="--cc:' + color + ';' + (on ? 'background:' + color + ';color:var(--on-fill);' : '') + (on ? '' : 'opacity:0.55;') + '" onclick="BlackBook.toggleBillActive(\x27' + b.id + '\x27)" title="' + this.escapeHtml(b.name) + amt + ' \u00b7 click to show/hide in graph">' + this.escapeHtml(b.name) + '</div>';
    }
    html += '<span style="flex:1;"></span>';
    html += '<button class="btn btn-sm btn-secondary" style="margin-left:4px;" onclick="BlackBook.toggleBillsGraph()" title="Hide bills graph (H)">HIDE</button>';
    return html + '</div>';
  },

  toggleBillsTotal() {
    this._billsTotalOn = (this._billsTotalOn === false);
    this.renderBills();
  },

  renderBills() {
    const el = document.getElementById('page-bills');
    if (!el) return;
    const hideGraph = !!(this.data.settings && this.data.settings.hideBillsGraph);
    const offToday = this.vy() !== new Date().getFullYear();
    el.innerHTML = '<div class="month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<span style="flex:1;"></span>' +
      '<button class="btn btn-primary" onclick="BlackBook.openNewBill()">+ NEW BILL</button>' +
      '<button class="mp-today' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '</div>' +
      this.billsSummaryHtml() +
      '<div class="list-sep"></div>' +
      '<div class="page-scroll-wrap"><div class="bills-grid-wrap">' + this.billsGridHtml() + '</div></div>' +
      '<div class="list-sep"></div>' +
      (hideGraph
        ? '<div class="graph-show-row"><button class="btn btn-sm btn-secondary" onclick="BlackBook.toggleBillsGraph()">SHOW GRAPH</button></div>'
        : this.billsChipsHtml() +
          '<div class="overview-charts"><div class="chart-panel chart-panel-full"><canvas id="bills-chart"></canvas></div></div>');
    if (!hideGraph) setTimeout(() => this.renderBillsChart(), 50);
  },

  async toggleBillsGraph() {
    this.data.settings.hideBillsGraph = !(this.data.settings && this.data.settings.hideBillsGraph);
    await this.save();
    this.renderPage('bills');
  },

  billsSummaryHtml() {
    let total = 0;
    for (const b of this.data.bills) { if (b.amount != null) total += Math.abs(this.toRsd(b.amount, b.currency || 'RSD')); }
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">MONTHLY TOTAL</span><span class="month-summary-value">' + this.fmtRsd(total) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">BILLS</span><span class="month-summary-value">' + this.data.bills.length + '</span></div>' +
      '</div>';
  },

  billsGridHtml() {
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
      const color = bill.color || this.billColor(bill);
      let yearTotal = 0;
      let yearHasPaid = false;
      for (let m = 0; m < 12; m++) {
        const p = this.getBillPayment(bill.id, this.vy() + '-' + String(m + 1).padStart(2, '0'));
        if (!p) continue;
        const native = p.amount != null ? p.amount : bill.amount;
        if (native != null) { yearTotal += Math.abs(this.toRsd(native, bill.currency || 'RSD')); yearHasPaid = true; }
      }
      html += '<div class="bill-cell-label' + alt + (bill.active ? '' : ' inactive') + '">' +
        '<span class="bill-name-line"><span class="cat-dot" style="background:' + color + ';"></span><span class="bill-name-text">' + this.escapeHtml(bill.name) + '</span><span class="bill-due-day">' + this.ordinalDay(bill.dueDay) + '</span></span>' +
        '<span class="bill-actions-mini">' +
        '<button class="btn btn-sm ' + (bill.autopay ? 'btn-primary' : 'btn-muted') + '" onclick="BlackBook.toggleBillAutopay(\x27' + bill.id + '\x27)" title="Auto-mark upcoming months as paid">' + (bill.autopay ? 'AUTO' : 'MAN') + '</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditBill(\x27' + bill.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteBill(\x27' + bill.id + '\x27)">DEL</button></span></div>';
      for (let m = 0; m < 12; m++) {
        const mk = this.vy() + '-' + String(m + 1).padStart(2, '0');
        const paid = this.getBillPayment(bill.id, mk);
        let amtLabel;
        if (paid) {
          const native = paid.amount != null ? paid.amount : bill.amount;
          amtLabel = native != null ? Math.abs(Math.round(this.toRsd(native, bill.currency || 'RSD'))).toLocaleString('en-US') : '\u2713';
        } else {
          amtLabel = '';
        }
        const cellStyle = paid ? ' style="background:' + color + ';color:var(--on-fill);font-weight:700;"' : '';
        const clickFn = paid ? 'toggleBillPayment' : 'openBillPayModal';
        html += '<div class="bill-cell' + alt + (paid ? ' paid' : '') + '"' + cellStyle + ' onclick="BlackBook.' + clickFn + '(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + this.ordinalDay(bill.dueDay) +
          (paid ? ' \u00b7 paid \u00b7 click to unpay' : ' \u00b7 click to enter amount &amp; mark paid') +
          ' &middot; right-click for custom amount">' + amtLabel + '</div>';
      }
      html += '<div class="bill-cell-total' + alt + '"' + (yearHasPaid ? ' style="background:' + color + '22;color:' + color + ';font-weight:700;"' : '') + '>' + (yearHasPaid ? Math.round(yearTotal).toLocaleString('en-US') : '') + '</div>';
      bi++;
    }
    html += '</div>';
    return html;
  },

  openNewBill() {
    document.getElementById('bill-id').value = '';
    document.getElementById('bill-name').value = '';
    document.getElementById('bill-amount').value = '';
    document.getElementById('bill-currency').value = 'RSD';
    document.getElementById('bill-dueDay').value = '';
    document.getElementById('bill-active').value = 'true';
    document.getElementById('bill-autopay').checked = false;
    document.getElementById('bill-color-auto').checked = true;
    const colorEl = document.getElementById('bill-color');
    colorEl.value = '#888888';
    colorEl.disabled = true;
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.sortedCategories().map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
    const billCat = this.data.categories.find(c => /^bill/i.test(String(c.name).trim()));
    if (billCat) catSelect.value = billCat.id;
    const paySel = document.getElementById('bill-payfrom');
    paySel.innerHTML = this.accountSelectOptions(this.data.settings.defaultAccountId || '');
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
    document.getElementById('bill-dueDay').value = bill.dueDay;
    document.getElementById('bill-active').value = String(bill.active);
    document.getElementById('bill-autopay').checked = !!bill.autopay;
    document.getElementById('bill-color-auto').checked = !bill.color;
    const colorEl = document.getElementById('bill-color');
    colorEl.value = bill.color || this.billColor(bill);
    colorEl.disabled = !bill.color;
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.sortedCategories().map(c => '<option value="' + c.id + '"' + (c.id === bill.categoryId ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    const paySel = document.getElementById('bill-payfrom');
    paySel.innerHTML = this.accountSelectOptions(bill.payAccountId || this.data.settings.defaultAccountId || '');
    document.getElementById('bill-modal-title').textContent = 'Edit Bill';
    this.openModal('bill-modal');
  },

  billColorAutoChanged() {
    document.getElementById('bill-color').disabled = document.getElementById('bill-color-auto').checked;
  },

  async deleteBill(billId) {
    if (!confirm('Delete this bill?')) return;
    this.data.bills = this.data.bills.filter(b => b.id !== billId);
    for (const p of (this.data.billPayments || [])) { if (p.billId === billId) this.removeBillTransaction(p); }
    this.data.billPayments = (this.data.billPayments || []).filter(p => p.billId !== billId);
    await this.save();
    this.renderBills();
  },

  async toggleBillActive(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    bill.active = !bill.active;
    await this.save();
    this.renderBills();
  },

  async toggleBillPayment(billId, monthKey) {
    const n = new Date();
    const mk = monthKey || (n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'));
    if (!this.data.billPayments) this.data.billPayments = [];
    const bill = this.data.bills.find(b => b.id === billId);
    const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
    if (idx >= 0) {
      this.removeBillTransaction(this.data.billPayments[idx]);
      this.data.billPayments.splice(idx, 1);
    } else {
      const pay = { billId: billId, month: mk, paid: true };
      if (bill) this.attachBillTransaction(bill, pay);
      this.data.billPayments.push(pay);
    }
    await this.save();
    this.renderBills();
  },

  async toggleBillAutopay(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    bill.autopay = !bill.autopay;
    if (bill.autopay) this.applyAutopayForBill(bill);
    await this.save();
    this.renderBills();
  },

  applyAutopayForBill(bill) {
    const n = new Date();
    const mk = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
    this.ensureBillPaid(bill, mk);
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
    const pay = { billId: bill.id, month: mk, paid: true, auto: true };
    this.attachBillTransaction(bill, pay);
    this.data.billPayments.push(pay);
  },

  billPayFrom(bill) {
    const sel = bill.payAccountId;
    if (sel && sel.startsWith('card:')) return sel;
    if (sel && this.visibleAccounts().some(a => a.id === sel)) return sel;
    const def = this.data.settings.defaultAccountId;
    const fallback = this.visibleAccounts().find(a => a.id === def) || this.visibleAccounts()[0];
    return fallback ? fallback.id : null;
  },

  attachBillTransaction(bill, pay) {
    if (pay.txId) return;
    const amt = pay.amount != null ? pay.amount : bill.amount;
    const from = this.billPayFrom(bill);
    if (amt == null || !from) return;
    const mp = pay.month.split('-');
    const y = parseInt(mp[0]), m = parseInt(mp[1]);
    const day = Math.min(Math.max(parseInt(bill.dueDay) || 1, 1), new Date(y, m, 0).getDate());
    const txId = 'bil-' + crypto.randomUUID();
    const tx = { id: txId, date: y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), type: 'expense', amount: -Math.abs(amt), currency: bill.currency || 'RSD', categoryId: bill.categoryId || null, note: bill.name };
    if (from.startsWith('card:')) { tx.cardId = from.slice(5); }
    else { tx.accountId = from; }
    this.data.transactions.unshift(tx);
    pay.txId = txId;
  },

  removeBillTransaction(pay) {
    if (!pay.txId) return;
    this.data.transactions = (this.data.transactions || []).filter(t => t.id !== pay.txId);
    delete pay.txId;
  },

  renderBillsChart() {
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    const canvas = document.getElementById('bills-chart');
    if (!canvas) return;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(this.vy() + '-' + String(m).padStart(2, '0'));
    const datasets = [];
    if (this._billsTotalOn !== false) {
      const hc = this.data.settings.highlightColor || '#fa8c3c';
      datasets.push({
        label: 'TOTAL',
        data: months.map(mk => {
          let s = 0;
          for (const b of this.data.bills) {
            const p = this.getBillPayment(b.id, mk);
            const native = p ? (p.amount != null ? p.amount : b.amount) : b.amount;
            if (native != null) s += Math.abs(this.toRsd(native, b.currency || 'RSD'));
          }
          return Math.round(s * 100) / 100;
        }),
        borderColor: hc,
        backgroundColor: 'transparent',
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 2
      });
    }
    const activeBills = this.data.bills.filter(b => b.active);
    for (const bill of activeBills) {
      datasets.push({
        label: bill.name,
        data: months.map(mk => { const p = this.getBillPayment(bill.id, mk); const native = p ? (p.amount != null ? p.amount : bill.amount) : bill.amount; return native != null ? this.toRsd(native, bill.currency) : 0; }),
        borderColor: bill.color || this.billColor(bill),
        backgroundColor: 'transparent',
        tension: 0.3,
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
        plugins: {
          legend: { display: false },
          title: { display: false }
        },
        scales: {
          x: { ticks: { color: '#555555' }, grid: { color: '#141414' } },
          y: { ticks: { color: '#555555' }, grid: { color: '#141414' } }
        }
      }
    });
  },

  openBillPayModal(billId, mk) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    const existing = this.getBillPayment(billId, mk);
    document.getElementById('bpay-bill').value = billId;
    document.getElementById('bpay-month').value = mk;
    document.getElementById('bpay-amount').value = existing && existing.amount != null ? existing.amount : (bill.amount != null ? bill.amount : '');
    document.getElementById('bill-pay-title').textContent = bill.name + ' \u00b7 ' + mk;
    this.bindBillPayForm();
    this.openModal('bill-pay-modal');
    setTimeout(() => { const a = document.getElementById('bpay-amount'); a.focus(); a.select(); }, 50);
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
      if (bill) this.attachBillTransaction(bill, pay);
      this.data.billPayments.push(pay);
      await this.save();
      this.closeModal('bill-pay-modal');
      this.renderBills();
    });
  },

  getBillPayment(billId, monthKey) { return (this.data.billPayments || []).find(p => p.billId === billId && p.month === monthKey); },
  fmtBillAmount(bill) { const rsd = this.toRsd(bill.amount, bill.currency); return rsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD' + (bill.currency && bill.currency !== 'RSD' ? ' (' + bill.amount + ' ' + bill.currency + ')' : ''); },

  // ==================== SAVINGS ====================
});
})();
