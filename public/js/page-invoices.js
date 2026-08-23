(function () {
Object.assign(window.BlackBook, {

  renderInvoices() {
    const el = document.getElementById('page-invoices');
    if (!el) return;
    if (!this.data.invoices) this.data.invoices = [];
    const offToday = this.vy() !== new Date().getFullYear();
    let html = '<div class="month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<button class="mp-today' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '<span style="flex:1;"></span>' +
      this.invoiceFilterChipsHtml() +
      '<button class="btn btn-primary" onclick="BlackBook.openNewInvoice()">+ NEW INVOICE</button>' +
      '</div>';
    html += this.invoicesSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.invoicesListHtml() + '</div>';
    el.innerHTML = html;
  },

  setInvoiceFilter(f) { this._invFilter = f; this.renderPage('invoices'); },

  invoiceFilterChipsHtml() {
    const f = this._invFilter || 'all';
    const chip = (key, label) => '<div class="cat-filter-chip' + (f === key ? ' selected' : '') + '" onclick="BlackBook.setInvoiceFilter(\x27' + key + '\x27)">' + label + '</div>';
    return '<div class="cat-filter" style="margin-bottom:0;margin-right:10px;">' + chip('out', 'INCOMES') + chip('in', 'EXPENSES') + chip('all', 'ALL') + '</div>';
  },

  _invoicesForYear() {
    const y = String(this.vy());
    return this.data.invoices.filter(v => String(v.date || '').slice(0, 4) === y);
  },

  invTotal(inv) {
    let t = 0;
    for (const l of (inv.lines || [])) t += (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0);
    return Math.round(t * 100) / 100;
  },
  invPaid(inv) { return Math.min(this.invTotal(inv), Math.abs(inv.amountPaid || 0)); },
  invRemaining(inv) { return Math.round((this.invTotal(inv) - this.invPaid(inv)) * 100) / 100; },
  invIsPaid(inv) { return this.invTotal(inv) > 0 && this.invRemaining(inv) <= 0.009; },
  invOverdue(inv) { return !this.invIsPaid(inv) && !!inv.dueDate && inv.dueDate < this.today(); },
  invRsd(inv) { return Math.abs(this.toRsd(this.invTotal(inv), inv.currency || 'RSD')); },

  invoicesSummaryHtml() {
    let owedMe = 0, iOwe = 0, overdueCnt = 0, overdueAmt = 0;
    for (const v of this.data.invoices) {
      const rem = this.invRemaining(v);
      if (rem <= 0.009) continue;
      const remRsd = Math.abs(this.toRsd(rem, v.currency || 'RSD'));
      if (v.dir === 'out') owedMe += remRsd; else iOwe += remRsd;
      if (this.invOverdue(v)) { overdueCnt++; overdueAmt += remRsd; }
    }
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(owedMe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">EXPENSE</span><span class="month-summary-value amount-negative">' + this.fmtRsd(iOwe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">OVERDUE</span><span class="month-summary-value ' + (overdueCnt ? 'amount-negative' : '') + '">' + (overdueCnt ? overdueCnt + ' &middot; ' + this.fmtRsd(overdueAmt) : this.fmtRsd(0)) + '</span></div></div>';
  },

  invoicesListHtml() {
    const f = this._invFilter || 'all';
    const all = f === 'all' ? this._invoicesForYear() : this._invoicesForYear().filter(v => (v.dir === 'out') === (f === 'out'));
    if (!all.length) return '<div class="empty-state"><div class="empty-state-text">' + (this._invoicesForYear().length ? 'No invoices in this filter.' : 'No invoices issued in ' + this.vy() + '. Click + NEW INVOICE to create one.') + '</div></div>';
    const sorted = all.slice().sort((a, b) => {
      const pa = this.invIsPaid(a) ? 1 : 0, pb = this.invIsPaid(b) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return String(a.dueDate || a.date || '').localeCompare(String(b.dueDate || b.date || ''));
    });
    return sorted.map(v => this.invoiceCardHtml(v)).join('');
  },

  invoiceCardHtml(v) {
    const total = this.invTotal(v), paid = this.invPaid(v);
    const pct = total > 0 ? Math.min(Math.round(paid / total * 100), 100) : 0;
    const isPaid = this.invIsPaid(v), overdue = this.invOverdue(v);
    const cur = v.currency || 'RSD';
    let html = '<div class="savings-card invoice-card"' + (isPaid ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + (v.dir === 'out' ? 'var(--income)' : 'var(--expense)') + ';"></span> ' + this.escapeHtml(v.party || '?') +
      ' <span class="inv-number">#' + this.escapeHtml(v.number || '-') + '</span></span>' +
      '<span class="savings-actions">' +
      '<span class="debt-badge ' + (v.dir === 'out' ? 'debt-badge-in' : 'debt-badge-out') + '">' + (v.dir === 'out' ? 'BILLED' : 'RECEIVED') + '</span>' +
      (isPaid ? '<span class="debt-badge debt-badge-settled">&#10003; PAID</span>' : '') +
      (!isPaid && paid > 0.009 ? '<span class="debt-badge inv-badge-partial">PARTIAL</span>' : '') +
      (!isPaid && !overdue ? '<button class="btn btn-sm btn-primary" onclick="BlackBook.openInvPayModal(\x27' + v.id + '\x27)">+ PAY</button>' : '') +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditInvoice(\x27' + v.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteInvoice(\x27' + v.id + '\x27)">DEL</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + this.fmtAmount(paid, cur) + ' of ' + this.fmtAmount(total, cur) + '</span><span>' + pct + '%</span></div>' +
      '<div class="savings-progress-bar"><div class="savings-progress-fill" style="width:' + pct + '%;background:' + (v.dir === 'out' ? 'var(--income)' : 'var(--accent)') + ';"></div></div>';
    let linesHtml = '';
    for (const l of (v.lines || []).slice(0, 4)) {
      linesHtml += '<div class="inv-line-view"><span class="inv-line-desc">' + this.escapeHtml(l.desc || '&mdash;') + '</span><span class="inv-line-math">' + l.qty + ' &times; ' + this.fmtAmount(l.price, cur) + '</span><span class="inv-line-sum">' + this.fmtAmount((parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), cur) + '</span></div>';
    }
    if ((v.lines || []).length > 4) linesHtml += '<div class="inv-line-view"><span class="inv-line-desc">+' + (v.lines.length - 4) + ' more lines</span></div>';
    if (linesHtml) html += '<div class="inv-lines-box">' + linesHtml + '</div>';
    html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
      'ISSUED ' + (v.date || '?') +
      ' &middot; <span class="' + (overdue ? 'amount-negative" title="Overdue"' : '"') + '>DUE ' + (v.dueDate || '-') + '</span>' +
      (overdue ? ' &middot; <span class="amount-negative">OVERDUE</span>' : '') +
      (v.note ? ' &middot; ' + this.escapeHtml(v.note) : '') + '</div>';
    html += '</div>';
    return html;
  },

  _bindInvLineEvents() {
    const box = document.getElementById('inv-lines');
    if (!box || box._bound) return;
    box._bound = true;
    box.addEventListener('click', (e) => {
      if (!e.target.classList.contains('inv-line-del')) return;
      const rows = box.querySelectorAll('.inv-line');
      if (rows.length <= 1) return;
      e.target.closest('.inv-line').remove();
      this._recalcInvTotal();
    });
    box.addEventListener('input', () => this._recalcInvTotal());
  },
  _invLineRow(desc, qty, price) {
    return '<div class="inv-line">' +
      '<input type="text" class="input inv-line-desc" placeholder="Description" value="' + this.escapeHtml(desc || '') + '">' +
      '<input type="text" inputmode="decimal" class="input inv-line-qty" placeholder="Qty" value="' + (qty != null && qty !== '' ? qty : '') + '" autocomplete="off">' +
      '<input type="text" inputmode="decimal" class="input inv-line-price" placeholder="Unit price" value="' + (price != null && price !== '' ? price : '') + '" autocomplete="off">' +
      '<span class="inv-line-total">0</span>' +
      '<button type="button" class="btn btn-sm btn-danger inv-line-del">&times;</button></div>';
  },
  _recalcInvTotal() {
    let total = 0;
    document.querySelectorAll('#inv-lines .inv-line').forEach(row => {
      const qty = this.evalAmount(String(row.querySelector('.inv-line-qty').value)) || 0;
      const price = this.evalAmount(String(row.querySelector('.inv-line-price').value)) || 0;
      const lineT = Math.round(qty * price * 100) / 100;
      row.querySelector('.inv-line-total').textContent = lineT.toLocaleString('en-US', { maximumFractionDigits: 2 });
      total += lineT;
    });
    const el = document.getElementById('inv-total-live');
    if (el) el.textContent = (Math.round(total * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  },

  _addInvLineRow() {
    const box = document.getElementById('inv-lines');
    if (!box) return;
    box.insertAdjacentHTML('beforeend', this._invLineRow('', '', ''));
    this._recalcInvTotal();
    const rows = box.querySelectorAll('.inv-line-desc');
    if (rows.length) rows[rows.length - 1].focus();
  },

  _setInvDir(dir) {
    const hidden = document.getElementById('invoice-dir');
    if (hidden) hidden.value = dir;
    const btn = document.getElementById('invoice-dir-toggle');
    if (!btn) return;
    btn.dataset.dir = dir;
    btn.innerHTML = dir === 'out' ? 'ISSUED' : 'RECEIVED';
  },

  toggleInvoiceDir() {
    const cur = (document.getElementById('invoice-dir') || {}).value === 'out' ? 'in' : 'out';
    this._setInvDir(cur);
  },

  openNewInvoice() {
    document.getElementById('invoice-id').value = '';
    this._setInvDir('out');
    document.getElementById('invoice-party').value = '';
    document.getElementById('invoice-number').value = '';
    document.getElementById('invoice-date').value = this.fmtDateInput(this.today());
    const in14 = new Date(Date.now() + 14 * 86400000);
    document.getElementById('invoice-due').value = this.fmtDateInput(in14.toISOString().slice(0, 10));
    document.getElementById('invoice-currency').value = 'RSD';
    document.getElementById('invoice-note').value = '';
    document.getElementById('inv-lines').innerHTML = this._invLineRow('', '', '');
    document.getElementById('invoice-modal-title').textContent = 'New Invoice';
    this._bindInvLineEvents();
    this._recalcInvTotal();
    this.bindInvoiceForm();
    this.openModal('invoice-modal');
    setTimeout(() => document.getElementById('invoice-party').focus(), 50);
  },

  openEditInvoice(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v) return;
    document.getElementById('invoice-id').value = v.id;
    this._setInvDir(v.dir || 'out');
    document.getElementById('invoice-party').value = v.party || '';
    document.getElementById('invoice-number').value = v.number || '';
    document.getElementById('invoice-date').value = this.fmtDateInput(v.date || '');
    document.getElementById('invoice-due').value = this.fmtDateInput(v.dueDate || '');
    document.getElementById('invoice-currency').value = v.currency || 'RSD';
    document.getElementById('invoice-note').value = v.note || '';
    const lines = (v.lines && v.lines.length) ? v.lines : [{ desc: '', qty: '', price: '' }];
    document.getElementById('inv-lines').innerHTML = lines.map(l => this._invLineRow(l.desc, l.qty, l.price)).join('');
    document.getElementById('invoice-modal-title').textContent = 'Edit Invoice';
    this._bindInvLineEvents();
    this._recalcInvTotal();
    this.bindInvoiceForm();
    this.openModal('invoice-modal');
  },

  bindInvoiceForm() {
    const f = document.getElementById('invoice-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('invoice-id').value;
      const party = document.getElementById('invoice-party').value.trim();
      if (!party) return;
      const parseNum = (s) => { const n = this.evalAmount(s); return isNaN(n) ? 0 : n; };
      const lines = [];
      document.querySelectorAll('#inv-lines .inv-line').forEach(row => {
        const desc = row.querySelector('.inv-line-desc').value.trim();
        const qty = parseNum(row.querySelector('.inv-line-qty').value);
        const price = parseNum(row.querySelector('.inv-line-price').value);
        if (desc || qty || price) lines.push({ desc: desc, qty: qty, price: price });
      });
      if (!lines.length) { alert('Add at least one line item.'); return; }
      const invDate = this.parseDateInput(document.getElementById('invoice-date').value) || this.today();
      const invDue = this.parseDateInput(document.getElementById('invoice-due').value);
      if (document.getElementById('invoice-due').value.trim() && !invDue) { alert('Enter a valid due date (DD.MM.YYYY).'); return; }
      const data = { dir: document.getElementById('invoice-dir').value, party: party, number: document.getElementById('invoice-number').value.trim(), date: invDate, dueDate: invDue || '', currency: document.getElementById('invoice-currency').value, note: document.getElementById('invoice-note').value.trim(), lines: lines };
      if (!this.data.invoices) this.data.invoices = [];
      if (id) {
        const v = this.data.invoices.find(x => x.id === id);
        if (v) Object.assign(v, data);
      } else {
        data.id = 'inv-' + Date.now();
        data.amountPaid = 0;
        data.payments = [];
        this.data.invoices.push(data);
      }
      await this.save();
      this.closeModal('invoice-modal');
      this.renderPage(this.currentPage === 'invoices' ? 'invoices' : this.currentPage);
    });
  },

  async deleteInvoice(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v) return;
    if (!confirm('Delete invoice #' + (v.number || v.id) + ' for "' + v.party + '"?\nLinked payment transactions are removed too.')) return;
    const prefix = 'inv-' + id + '-p';
    this.data.transactions = this.data.transactions.filter(t => !String(t.pairId || '').startsWith(prefix));
    this.data.invoices = this.data.invoices.filter(x => x.id !== id);
    await this.save();
    this.renderPage(this.currentPage === 'invoices' ? 'invoices' : this.currentPage);
  },

  openInvPayModal(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v || this.invIsPaid(v)) return;
    document.getElementById('ipay-id').value = id;
    document.getElementById('ipay-amount').value = this.invRemaining(v).toFixed(2);
    document.getElementById('ipay-account').innerHTML = this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.currency === (v.currency || 'RSD') ? ' selected' : '') + '>' + this.escapeHtml(a.name) + ' (' + a.currency + ')</option>').join('');
    document.getElementById('ipay-category').innerHTML = this.sortedCategories().map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('ipay-date').value = this.fmtDateInput(this.today());
    document.getElementById('invoice-pay-title').textContent = 'Payment \u2014 ' + (v.party || 'invoice') + ' #' + (v.number || '-');
    this.bindInvPayForm();
    this.openModal('invoice-pay-modal');
    setTimeout(() => { const a = document.getElementById('ipay-amount'); a.focus(); a.select(); }, 50);
  },

  bindInvPayForm() {
    const f = document.getElementById('invoice-pay-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = this.data.invoices.find(x => x.id === document.getElementById('ipay-id').value);
      if (!v) return;
      let amt = this.evalAmount(document.getElementById('ipay-amount').value);
      if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
      const remaining = this.invRemaining(v);
      if (amt > remaining) amt = remaining;
      const payDate = this.parseDateInput(document.getElementById('ipay-date').value) || this.today();
      await this.applyInvoicePayment(v, amt, document.getElementById('ipay-account').value, document.getElementById('ipay-category').value, payDate);
      this.closeModal('invoice-pay-modal');
      this.renderPage(this.currentPage === 'invoices' ? 'invoices' : this.currentPage);
    });
  },

  async applyInvoicePayment(v, amt, accountId, categoryId, date) {
    if (!(amt > 0)) return;
    const remaining = this.invRemaining(v);
    if (remaining <= 0.009) return;
    if (amt > remaining) amt = remaining;
    if (!v.payments) v.payments = [];
    const seqN = v.payments.length + 1;
    const pairId = 'inv-' + v.id + '-p' + seqN;
    const txId = 'tx-' + pairId;
    const cur = v.currency || 'RSD';
    const type = v.dir === 'out' ? 'income' : 'expense';
    this.data.transactions.unshift({ id: txId, type: type, amount: type === 'income' ? amt : -amt, currency: cur, accountId: accountId || null, categoryId: categoryId || null, date: date, note: 'Invoice ' + (v.number ? '#' + v.number + ' ' : '') + (v.party || ''), pairId: pairId });
    v.payments.push({ date: date, amount: amt, accountId: accountId || null, categoryId: categoryId || null, txId: txId });
    v.amountPaid = Math.round(((v.amountPaid || 0) + amt) * 100) / 100;
    await this.save();
  },

});
})();
