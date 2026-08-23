(function () {
Object.assign(window.BlackBook, {
  billsChipsHtml() {
    const bills = this.data.bills;
    if (!bills.length) return '';
    let html = '<div class="cat-filter">';
    const hc = this.data.settings.highlightColor || '#f9a05c';
    const totOn = this._billsTotalOn !== false;
    html += '<div class="cat-filter-chip' + (totOn ? ' selected' : '') + '" style="' + (totOn ? 'background:' + hc + ';color:#000;' : 'color:' + hc + ';') + '" onclick="BlackBook.toggleBillsTotal()" title="Monthly total line \u00b7 click to toggle">' +
      '<span style="' + (totOn ? '' : 'opacity:0.5;') + '">TOTAL</span></div>';
    for (const b of bills) {
      const color = b.color || this.billColor(b);
      const on = b.active !== false;
      const amt = b.amount != null ? ' \u00b7 ' + this.fmtAmount(Math.abs(b.amount), b.currency || 'RSD') : '';
      html += '<div class="cat-filter-chip' + (on ? ' selected' : '') + '" style="' + (on ? 'background:' + color + ';color:#000;' : 'color:' + color + ';') + (on ? '' : ';opacity:0.55;') + '" onclick="BlackBook.toggleBillActive(\x27' + b.id + '\x27)" title="' + this.escapeHtml(b.name) + amt + ' \u00b7 click to show/hide in graph">' + this.escapeHtml(b.name) + '</div>';
    }
    return html + '</div>';
  },

  toggleBillsTotal() {
    this._billsTotalOn = (this._billsTotalOn === false);
    this.renderBills();
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
    let total = 0;
    for (const b of this.data.bills) { if (b.amount != null) total += Math.abs(this.toRsd(b.amount, b.currency || 'RSD')); }
    return '<div class="month-summary" style="margin-bottom:10px;">' +
      '<div class="month-summary-item"><span class="month-summary-label">MONTHLY TOTAL</span><span class="month-summary-value">' + this.fmtRsd(total) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">BILLS</span><span class="month-summary-value">' + this.data.bills.length + '</span></div>' +
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
      const color = bill.color || this.billColor(bill);
      html += '<div class="bill-cell-label' + (bill.active ? '' : ' inactive') + '">' +
        '<span class="bill-name-line"><span class="cat-dot" style="background:' + color + ';"></span><span class="bill-name-text">' + this.escapeHtml(bill.name) + '</span><span class="bill-due-day">' + this.ordinalDay(bill.dueDay) + '</span></span>' +
        '<span class="bill-actions-mini">' +
        '<button class="btn btn-sm ' + (bill.autopay ? 'btn-primary' : 'btn-muted') + '" onclick="BlackBook.toggleBillAutopay(\x27' + bill.id + '\x27)" title="Auto-mark past months as paid">' + (bill.autopay ? 'AUTO' : 'MAN') + '</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditBill(\x27' + bill.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteBill(\x27' + bill.id + '\x27)">DEL</button></span></div>';
      for (let m = 0; m < 12; m++) {
        const mk = this.vy() + '-' + String(m + 1).padStart(2, '0');
        const ym = this.vy() * 12 + m;
        const paid = this.getBillPayment(bill.id, mk);
        const cls = paid ? 'paid' : (ym <= curYM ? 'unpaid' : '');
        let amtLabel;
        if (paid && paid.amount != null) amtLabel = Math.abs(Math.round(this.toRsd(paid.amount, bill.currency || 'RSD'))).toLocaleString('en-US');
        else if (bill.amount == null) amtLabel = paid ? '\u2713' : '&mdash;';
        else amtLabel = Math.abs(Math.round(this.toRsd(bill.amount, bill.currency || 'RSD'))).toLocaleString('en-US');
        const cellStyle = paid ? ' style="background:' + color + ';color:#000;font-weight:700;"' : '';
        const clickFn = (!paid && bill.amount == null) ? 'openBillPayModal' : 'toggleBillPayment';
        const hint = (!paid && bill.amount == null) ? 'click to set amount &amp; mark paid' : 'click to toggle';
        html += '<div class="bill-cell ' + cls + '"' + cellStyle + ' onclick="BlackBook.' + clickFn + '(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + this.ordinalDay(bill.dueDay) +
          (paid ? (' \u00b7 paid' + (paid.amount != null ? ' (custom)' : '')) : '') +
          ' &middot; ' + hint + ' &middot; right-click for custom amount">' + amtLabel + '</div>';
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
    document.getElementById('bill-color-auto').checked = true;
    const colorEl = document.getElementById('bill-color');
    colorEl.value = '#888888';
    colorEl.disabled = true;
    const catSelect = document.getElementById('bill-category');
    catSelect.innerHTML = this.sortedCategories().map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
    const billCat = this.data.categories.find(c => /^bill/i.test(String(c.name).trim()));
    if (billCat) catSelect.value = billCat.id;
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
    document.getElementById('bill-modal-title').textContent = 'Edit Bill';
    this.openModal('bill-modal');
  },

  billColorAutoChanged() {
    document.getElementById('bill-color').disabled = document.getElementById('bill-color-auto').checked;
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
    const datasets = [];
    if (this._billsTotalOn !== false) {
      const hc = this.data.settings.highlightColor || '#f9a05c';
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
