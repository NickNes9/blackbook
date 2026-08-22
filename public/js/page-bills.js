(function () {
Object.assign(window.BlackBook, {
  billsChipsHtml() {
    const bills = this.data.bills.filter(b => b.active !== false);
    if (!bills.length) return '';
    const mk = this.vy() + '-' + String(this.vm() + 1).padStart(2, '0');
    let html = '<div class="cat-filter">';
    for (const b of bills) {
      const color = b.color || this.billColor(b);
      const paid = (this.data.billPayments || []).some(p => p.billId === b.id && p.month === mk);
      html += '<div class="cat-filter-chip' + (paid ? ' selected' : '') + '" style="' + (paid ? 'background:' + color + ';color:#000;' : 'color:' + color + ';') + '" onclick="BlackBook.toggleBillPayment(\x27' + b.id + '\x27)" title="' + this.escapeHtml(b.name) + ' \u00b7 ' + this.fmtAmount(Math.abs(b.amount), b.currency || 'RSD') + ' \u00b7 click to toggle paid">' + this.escapeHtml(b.name) + '</div>';
    }
    return html + '</div>';
  },

  renderBills() {
    const el = document.getElementById('page-bills');
    if (!el) return;
    el.innerHTML = this.monthPickerHtml() +
      this.billsSummaryHtml() +
      '<div class="list-sep"></div>' +
      this.billsChipsHtml() +
      '<div class="chart-panel chart-panel-full"><canvas id="bills-chart"></canvas></div>' +
      '<div style="display:flex;justify-content:flex-end;margin:8px 0;"><button class="btn btn-primary" onclick="BlackBook.openNewBill()">+ NEW BILL</button></div>' +
      '<div class="page-scroll-wrap"><div class="bills-grid-wrap">' + this.billsGridHtml() + '</div></div>';
    setTimeout(() => this.renderBillsChart(), 50);
  },

  billsSummaryHtml() {
    const active = this.data.bills.filter(b => b.active !== false);
    let total = 0;
    for (const b of active) total += Math.abs(this.toRsd(b.amount, b.currency || 'RSD'));
    return '<div class="month-summary" style="margin-bottom:10px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">MONTHLY TOTAL</span><span class="month-summary-value">' + this.fmtRsd(total) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">ACTIVE BILLS</span><span class="month-summary-value">' + active.length + '</span></div>' +
      '</div>';
  },

  billsGridHtml() {
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    const curYM = now.getFullYear() * 12 + now.getMonth();
    let html = '<div class="bills-grid">';
    html += '<div class="bills-grid-head">BILL</div>';
    for (let m = 0; m < 12; m++) html += '<div class="bills-grid-head">' + MONTHS_S[m] + '</div>';
    if (!this.data.bills.length) {
      html += '<div class="bills-grid-empty">No bills yet. Click + NEW BILL to add one.</div>';
    }
    for (const bill of this.data.bills) {
      const color = this.billColor(bill);
      html += '<div class="bill-cell-label' + (bill.active ? '' : ' inactive') + '">' +
        '<span class="bill-name-line"><span class="cat-dot" style="background:' + color + ';"></span><span class="bill-name-text">' + this.escapeHtml(bill.name) + '</span><span class="bill-due-day">' + this.ordinalDay(bill.dueDay) + '</span></span>' +
        '<span class="bill-actions-mini">' +
        '<button class="btn btn-sm ' + (bill.active ? 'btn-paid' : 'btn-muted') + '" onclick="BlackBook.toggleBillActive(\x27' + bill.id + '\x27)" title="Include in graph">' + (bill.active ? 'ON' : 'OFF') + '</button>' +
        '<button class="btn btn-sm ' + (bill.autopay ? 'btn-primary' : 'btn-muted') + '" onclick="BlackBook.toggleBillAutopay(\x27' + bill.id + '\x27)" title="Auto-mark past months as paid">' + (bill.autopay ? 'AUTO' : 'MAN') + '</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditBill(\x27' + bill.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteBill(\x27' + bill.id + '\x27)">DEL</button></span></div>';
      for (let m = 0; m < 12; m++) {
        const mk = this.vy() + '-' + String(m + 1).padStart(2, '0');
        const ym = this.vy() * 12 + m;
        if (!bill.active) {
          html += '<div class="bill-cell disabled">&middot;</div>';
          continue;
        }
        const paid = this.getBillPayment(bill.id, mk);
        const cls = paid ? 'paid' : (ym <= curYM ? 'unpaid' : '');
        const amtNative = paid && paid.amount != null ? paid.amount : bill.amount;
        const amtLabel = Math.abs(Math.round(this.toRsd(amtNative, bill.currency || 'RSD'))).toLocaleString('en-US');
        const cellStyle = paid ? ' style="background:' + color + ';color:#000;font-weight:700;"' : '';
        html += '<div class="bill-cell ' + cls + '"' + cellStyle + ' onclick="BlackBook.toggleBillPayment(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + this.ordinalDay(bill.dueDay) +
          (paid ? (' \u00b7 paid' + (paid.amount != null ? ' (custom)' : '')) : '') +
          ' &middot; click to toggle &middot; right-click for custom amount">' + amtLabel + '</div>';
      }
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
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.data.categories.map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('bill-modal-title').textContent = 'New Bill';
    this.openModal('bill-modal');
  },

  openEditBill(billId) {
    const bill = this.data.bills.find(b => b.id === billId);
    if (!bill) return;
    document.getElementById('bill-id').value = bill.id;
    document.getElementById('bill-name').value = bill.name;
    document.getElementById('bill-amount').value = bill.amount;
    document.getElementById('bill-currency').value = bill.currency;
    document.getElementById('bill-dueDay').value = bill.dueDay;
    document.getElementById('bill-active').value = String(bill.active);
    document.getElementById('bill-autopay').checked = !!bill.autopay;
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.data.categories.map(c => '<option value="' + c.id + '"' + (c.id === bill.categoryId ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('bill-modal-title').textContent = 'Edit Bill';
    this.openModal('bill-modal');
  },

  async deleteBill(billId) {
    if (!confirm('Delete this bill?')) return;
    this.data.bills = this.data.bills.filter(b => b.id !== billId);
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
    const mk = monthKey || (this.vy() + '-' + String(this.vm() + 1).padStart(2, '0'));
    if (!this.data.billPayments) this.data.billPayments = [];
    const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
    if (idx >= 0) { this.data.billPayments.splice(idx, 1); }
    else { this.data.billPayments.push({ billId: billId, month: mk, paid: true }); }
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
    const nowYM = new Date().getFullYear() * 12 + new Date().getMonth();
    for (let ym = nowYM, i = 0; i < 36; ym--, i++) {
      const y = Math.floor(ym / 12), m = ym % 12;
      const mk = y + '-' + String(m + 1).padStart(2, '0');
      if (!this.data.billPayments.some(p => p.billId === bill.id && p.month === mk)) {
        this.data.billPayments.push({ billId: bill.id, month: mk, paid: true, auto: true });
      }
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

  renderBillsChart() {
    if (this.billsChart) { this.billsChart.destroy(); this.billsChart = null; }
    const canvas = document.getElementById('bills-chart');
    if (!canvas) return;
    const MONTHS_S = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(this.vy() + '-' + String(m).padStart(2, '0'));
    const activeBills = this.data.bills.filter(b => b.active);
    const datasets = activeBills.map(bill => ({
      label: bill.name,
      data: months.map(mk => { const p = this.getBillPayment(bill.id, mk); return p ? this.toRsd(p.amount != null ? p.amount : bill.amount, bill.currency) : 0; }),
      borderColor: this.billColor(bill),
      backgroundColor: 'transparent',
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 3
    }));
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
    if (!bill || !bill.active) return;
    const existing = this.getBillPayment(billId, mk);
    document.getElementById('bpay-bill').value = billId;
    document.getElementById('bpay-month').value = mk;
    document.getElementById('bpay-amount').value = existing && existing.amount != null ? existing.amount : bill.amount;
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
      let amt = Math.round(parseFloat(String(document.getElementById('bpay-amount').value).trim().replace(/\s+/g, '').replace(',', '.')) * 100) / 100;
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      if (!this.data.billPayments) this.data.billPayments = [];
      const idx = this.data.billPayments.findIndex(p => p.billId === billId && p.month === mk);
      if (idx >= 0) this.data.billPayments.splice(idx, 1);
      this.data.billPayments.push({ billId: billId, month: mk, paid: true, amount: amt });
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
