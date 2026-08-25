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
    this.repairBillPayments();
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
    for (const b of this.data.bills) { if (b.amount != null) {
      const cur = b.currency || 'RSD';
      if (cur === 'RSD') { total += Math.abs(b.amount); }
      else {
        const from = this.billPayFrom(b);
        const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
        const fee = (acc && acc.foreignFee) || 0;
        const feeRes = this.calcForeignFee(b.amount, fee, cur);
        total += Math.abs(this.toRsd(b.amount, cur)) + feeRes.feeRsd;
      }
    } }
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
        const tx = p.txId ? this.data.transactions.find(t => t.id === p.txId) : null;
        if (tx) {
          const txCur = tx.currency || bill.currency || 'RSD';
          if (txCur === 'RSD') { yearTotal += Math.abs(tx.amount); }
          else { yearTotal += Math.abs(this.toRsd(tx.amount, txCur)); }
        } else if (p.nativeAmount != null) {
          yearTotal += Math.abs(p.amount);
        } else {
          const native = p.amount != null ? p.amount : bill.amount;
          if (native != null) yearTotal += Math.abs(this.toRsd(native, bill.currency || 'RSD'));
        }
        yearHasPaid = true;
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
          const tx = paid.txId ? this.data.transactions.find(t => t.id === paid.txId) : null;
          let rsdAmount, nativeAbs;
          if (tx) {
            const txCur = tx.currency || bill.currency || 'RSD';
            if (txCur === 'RSD') {
              rsdAmount = Math.abs(tx.amount);
            } else {
              rsdAmount = Math.abs(this.toRsd(tx.amount, txCur));
            }
            nativeAbs = tx.nativeAmount != null ? Math.abs(tx.nativeAmount) : (txCur !== 'RSD' ? Math.abs(tx.amount) : null);
          } else {
            rsdAmount = Math.abs(paid.amount);
            nativeAbs = paid.nativeAmount != null ? Math.abs(paid.nativeAmount) : null;
          }
          const natCur = (tx && tx.nativeCurrency) || paid.nativeCurrency || bill.currency || 'RSD';
          const rsd = rsdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          amtLabel = nativeAbs != null && natCur !== 'RSD'
            ? rsd + '<br>(' + nativeAbs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + natCur + ')'
            : rsd;
        } else {
          amtLabel = '';
        }
        const cellStyle = paid ? ' style="background:' + color + ';color:var(--on-fill);font-weight:700;"' : '';
        const clickFn = 'toggleBillPayment';
        html += '<div class="bill-cell' + alt + (paid ? ' paid' : '') + '"' + cellStyle + ' onclick="BlackBook.' + clickFn + '(\x27' + bill.id + '\x27,\x27' + mk + '\x27)" oncontextmenu="BlackBook.openBillPayModal(\x27' + bill.id + '\x27,\x27' + mk + '\x27);return false;" title="' +
          bill.name + ' \u00b7 due ' + this.ordinalDay(bill.dueDay) +
          (paid ? ' \u00b7 paid \u00b7 click to unpay' : ' \u00b7 click to mark paid') +
          ' &middot; right-click for custom amount">' + amtLabel + '</div>';
      }
      html += '<div class="bill-cell-total' + alt + '"' + (yearHasPaid ? ' style="background:' + color + '22;color:' + color + ';font-weight:700;"' : '') + '>' + (yearHasPaid ? yearTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') + '</div>';
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
    this.updateBillAmountLabel();
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
    this.updateBillAmountLabel();
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

  updateBillAmountLabel() {
    const cur = document.getElementById('bill-currency').value || 'RSD';
    const lbl = document.getElementById('bill-amount-label');
    if (lbl) lbl.textContent = cur === 'RSD' ? 'Amount (empty if unknown)' : 'Amount in ' + cur + ' (empty if unknown)';
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
      const pay = { billId: billId, month: mk, paid: true, amount: bill ? bill.amount : null };
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
    const pay = { billId: bill.id, month: mk, paid: true, auto: true, amount: bill.amount };
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
    const billCur = bill.currency || 'RSD';
    const tx = { id: txId, date: y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), type: 'expense', categoryId: bill.categoryId || null, note: bill.name };
    if (from.startsWith('card:')) {
      tx.cardId = from.slice(5);
      tx.amount = -Math.abs(amt);
      tx.currency = billCur;
    } else {
      const acc = this.data.accounts.find(a => a.id === from);
      const accCur = (acc && acc.currency) || 'RSD';
      if (billCur !== accCur && billCur !== 'RSD' && accCur === 'RSD') {
        const fee = (acc && acc.foreignFee) || 0;
        const amtCur = pay.amountCurrency || billCur;
        const nativeAbs = pay.nativeAmount != null ? Math.abs(pay.nativeAmount) : (amtCur !== 'RSD' ? Math.abs(amt) : Math.abs(bill.amount || 0));
        const rsdBase = amtCur === 'RSD' ? Math.abs(amt) : Math.abs(this.toRsd(amt, amtCur));
        let feeRsd;
        if (pay.feeAmountOverride != null) {
          feeRsd = this.round2(Math.abs(pay.feeAmountOverride));
        } else if (fee > 0 && nativeAbs > 0) {
          feeRsd = this.calcForeignFee(nativeAbs, fee, billCur).feeRsd;
        } else {
          feeRsd = 0;
        }
        tx.amount = -this.round2(rsdBase + feeRsd);
        tx.currency = accCur;
        tx.baseAmount = this.round2(rsdBase);
        tx.feeAmount = feeRsd;
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
            if (p) {
              const tx = p.txId ? this.data.transactions.find(t => t.id === p.txId) : null;
              if (tx) {
                const txCur = tx.currency || b.currency || 'RSD';
                if (txCur === 'RSD') { s += Math.abs(tx.amount); }
                else { s += Math.abs(this.toRsd(tx.amount, txCur)); }
              }
              else if (p.nativeAmount != null) { s += Math.abs(p.amount); }
              else { const native = p.amount != null ? p.amount : b.amount; if (native != null) s += Math.abs(this.toRsd(native, b.currency || 'RSD')); }
            } else {
              const native = b.amount;
              if (native != null) {
                const cur = b.currency || 'RSD';
                if (cur === 'RSD') { s += Math.abs(native); }
                else {
                  const from = this.billPayFrom(b);
                  const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
                  const fee = (acc && acc.foreignFee) || 0;
                  const feeRes = this.calcForeignFee(native, fee, cur);
                  s += Math.abs(this.toRsd(native, cur)) + feeRes.feeRsd;
                }
              }
            }
          }
          return this.round2(s);
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
        data: months.map(mk => {
          const p = this.getBillPayment(bill.id, mk);
          if (p) {
            const tx = p.txId ? this.data.transactions.find(t => t.id === p.txId) : null;
            if (tx) {
              const txCur = tx.currency || bill.currency || 'RSD';
              return this.round2(txCur === 'RSD' ? Math.abs(tx.amount) : Math.abs(this.toRsd(tx.amount, txCur)));
            }
            if (p.nativeAmount != null) return this.round2(Math.abs(p.amount));
            const native = p.amount != null ? p.amount : bill.amount;
            return native != null ? this.round2(this.toRsd(native, bill.currency)) : 0;
          }
          const native = bill.amount;
          if (native == null) return 0;
          const cur = bill.currency || 'RSD';
          if (cur === 'RSD') return Math.abs(native);
          const from = this.billPayFrom(bill);
          const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
          const fee = (acc && acc.foreignFee) || 0;
          const feeRes = this.calcForeignFee(native, fee, cur);
          return this.round2(Math.abs(this.toRsd(native, cur)) + feeRes.feeRsd);
        }),
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
    const cur = bill.currency || 'RSD';
    const from = this.billPayFrom(bill);
    const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
    const accCur = (acc && acc.currency) || 'RSD';
    const isForeign = cur !== accCur && cur !== 'RSD' && accCur === 'RSD';
    document.getElementById('bpay-bill').value = billId;
    document.getElementById('bpay-month').value = mk;
    document.getElementById('bpay-amount-label').textContent = isForeign ? 'Amount (RSD)' : 'Amount (' + cur + ')';
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
      feeLabel.textContent = 'Fee (RSD)' + (feePctModal > 0 ? ' \u00b7 ' + feePctModal + '% of native' : '');
      feeInput.value = existing && existing.feeAmount != null ? Math.abs(existing.feeAmount) : '';
    } else {
      nativeRow.style.display = 'none';
      feeRow.style.display = 'none';
      document.getElementById('bpay-amount').value = existing ? (existing.baseAmount != null ? Math.abs(existing.baseAmount) : (existing.amount != null ? existing.amount : (bill.amount != null ? bill.amount : ''))) : (bill.amount != null ? bill.amount : '');
    }
    document.getElementById('bill-pay-title').textContent = bill.name + ' \u00b7 ' + mk;
    const previewEl = document.getElementById('bpay-preview');
    const updatePreview = () => {
      if (!isForeign) { previewEl.textContent = ''; return; }
      const val = this.evalAmount(document.getElementById('bpay-amount').value);
      const nativeVal = nativeInput.value.trim() ? this.evalAmount(nativeInput.value) : null;
      const manualFee = feeInput.value.trim() ? this.evalAmount(feeInput.value) : null;
      const parts = [];
      if (val > 0 && feePctModal > 0 && (nativeVal > 0 || manualFee > 0)) {
        const autoRes = nativeVal > 0 ? this.calcForeignFee(nativeVal, feePctModal, cur) : { feeNative: null, feeRsd: 0 };
        const feeRsd = manualFee > 0 ? manualFee : autoRes.feeRsd;
        const total = this.round2(val + feeRsd);
        let feeTxt = 'FEE ' + feeRsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD';
        if (manualFee > 0) feeTxt += ' (manual)';
        else if (autoRes.feeNative != null) feeTxt += ' (' + autoRes.feeNative.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur + ')';
        parts.push(feeTxt + ' \u2192 ' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD');
      } else if (nativeVal > 0) {
        parts.push('\u2248 ' + nativeVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur);
      }
      previewEl.textContent = parts.join(' \u00b7 ');
    };
    document.getElementById('bpay-amount').oninput = updatePreview;
    nativeInput.oninput = updatePreview;
    feeInput.oninput = updatePreview;
    updatePreview();
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
        const billCur = bill.currency || 'RSD';
        const from = this.billPayFrom(bill);
        const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
        const accCur = (acc && acc.currency) || 'RSD';
        const isForeign = billCur !== accCur && billCur !== 'RSD' && accCur === 'RSD';
        if (isForeign) pay.amountCurrency = 'RSD';
        this.attachBillTransaction(bill, pay);
      }
      this.data.billPayments.push(pay);
      await this.save();
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
      if (!p.txId) continue;
      const tx = this.data.transactions.find(t => t.id === p.txId);
      if (!tx) continue;
      const bill = this.data.bills.find(b => b.id === p.billId);
      const billCur = (bill && bill.currency) || 'RSD';
      const from = bill ? this.billPayFrom(bill) : null;
      const acc = from && !from.startsWith('card:') ? this.data.accounts.find(a => a.id === from) : null;
      const accCur = (acc && acc.currency) || 'RSD';
      if ((tx.currency || 'RSD') === 'RSD' && tx.nativeAmount != null && billCur !== 'RSD' && accCur === 'RSD') {
        const fee = (acc && acc.foreignFee) || 0;
        const nativeAbs = Math.abs(tx.nativeAmount);
        const buggy = this.round2(nativeAbs * (1 + fee / 100));
        if (Math.abs(tx.amount) === buggy) {
          const curR = tx.nativeCurrency || billCur;
          const feeRes = this.calcForeignFee(nativeAbs, fee, curR);
          const fixed = -this.round2(Math.abs(this.toRsd(nativeAbs, curR)) + feeRes.feeRsd);
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
  fmtBillAmount(bill) { const rsd = this.toRsd(bill.amount, bill.currency); return rsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD' + (bill.currency && bill.currency !== 'RSD' ? ' (' + bill.amount + ' ' + bill.currency + ')' : ''); },

  // ==================== SAVINGS ====================
});
})();
