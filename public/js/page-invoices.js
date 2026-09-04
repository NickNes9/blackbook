(function () {
let pendingInvFile = null;
Object.assign(window.BlackBook, {

  _resetInvoiceFileUI(name) {
    pendingInvFile = null;
    const input = document.getElementById('invoice-file-input');
    if (input) input.value = '';
    const el = document.getElementById('invoice-file-name');
    if (el) el.textContent = name || 'No file attached';
  },

  _bindInvoiceFilePicker() {
    const btn = document.getElementById('invoice-file-btn');
    const input = document.getElementById('invoice-file-input');
    if (!btn || !input) return;
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files[0];
      if (!f) return;
      pendingInvFile = f;
      document.getElementById('invoice-file-name').textContent = f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)';
    });
  },

  renderInvoices() {
    const el = document.getElementById('page-invoices');
    if (!el) return;
    if (!this.data.invoices) this.data.invoices = [];
    let html = '<div class="month-picker" style="justify-content:flex-end;">' +
      '<button class="btn btn-primary" onclick="BlackBook.openNewInvoice()">+ NEW INVOICE</button>' +
      '</div>';
    html += this.invoicesSummaryHtml();
    html += '<div class="list-sep"></div>';
    html += '<div class="page-scroll-wrap">' + this.invoicesListHtml() + '</div>';
    el.innerHTML = html;
    this.finishFocus('invoice');
  },

  setInvoiceFilter(f) { this._invFilter = f; this.renderPage('invoices'); },

  cycleInvoiceFilter() {
    const modes = ['out', 'in', 'all'];
    const idx = modes.indexOf(this._invFilter || 'all');
    this._invFilter = modes[(idx + 1) % modes.length];
    this.renderPage('invoices');
  },

  invoiceFilterChipsHtml() {
    const f = this._invFilter || 'all';
    const chip = (key, label) => '<div class="cat-filter-chip' + (f === key ? ' selected' : '') + '" onclick="BlackBook.setInvoiceFilter(\x27' + key + '\x27)">' + label + '</div>';
    return '<div class="cat-filter" style="margin-bottom:0;margin-right:10px;">' + chip('out', 'INCOMES') + chip('in', 'EXPENSES') + chip('all', 'ALL') + '</div>';
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
  parseInvNumber(inv) {
    const num = (inv && inv.number || '').trim();
    const slash = num.match(/^\s*(\d{1,4})\s*\/\s*(\d{4})\s*$/);
    if (slash) return { seq: parseInt(slash[1], 10), year: parseInt(slash[2], 10) };
    const hyphen = num.match(/^\s*(\d{4})\s*-\s*(\d{1,4})\s*$/);
    if (hyphen) return { year: parseInt(hyphen[1], 10), seq: parseInt(hyphen[2], 10) };
    return null;
  },

  invYear(inv) {
    const p = this.parseInvNumber(inv);
    if (p) return p.year;
    if (inv.date) {
      const y = parseInt(inv.date.substring(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  },

  invoicesSummaryHtml() {
    let owedMe = 0, iOwe = 0, overdueCnt = 0, overdueAmt = 0;
    for (const v of this.data.invoices) {
      const rem = this.invRemaining(v);
      if (rem <= 0.009) continue;
      const remRsd = Math.abs(this.toRsd(rem, v.currency || 'RSD'));
      if (v.dir === 'out') owedMe += remRsd; else iOwe += remRsd;
      if (this.invOverdue(v)) { overdueCnt++; overdueAmt += remRsd; }
    }
    const f = this._invFilter || 'all';
    const filterLabel = f === 'out' ? 'INCOMES' : f === 'in' ? 'EXPENSES' : 'ALL';
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtRsd(owedMe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">EXPENSE</span><span class="month-summary-value amount-negative">' + this.fmtRsd(iOwe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">OVERDUE</span><span class="month-summary-value ' + (overdueCnt ? 'amount-negative' : '') + '">' + (overdueCnt ? overdueCnt + ' &middot; ' + this.fmtRsd(overdueAmt) : this.fmtRsd(0)) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:4px;align-items:center;">' +
      '<button class="btn btn-sm btn-secondary inv-filter-cycle" onclick="BlackBook.cycleInvoiceFilter()" title="Cycle filter: Incomes → Expenses → All" style="min-width:100px;text-align:center;">' + filterLabel + '</button>' +
      '</span></div>';
  },

  invoicesListHtml() {
    const f = this._invFilter || 'all';
    const all = f === 'all' ? (this.data.invoices || []) : (this.data.invoices || []).filter(v => (v.dir === 'out') === (f === 'out'));
    if (!all.length) return '<div class="empty-state"><div class="empty-state-text">' + ((this.data.invoices || []).length ? 'No invoices in this filter.' : 'No invoices yet. Click + NEW INVOICE to create one.') + '</div></div>';
    const sorted = all.slice().sort((a, b) => {
      const ya = this.invYear(a), yb = this.invYear(b);
      if (ya !== yb) return yb - ya;
      const parseNum = (inv) => {
        const p = this.parseInvNumber(inv);
        return p ? p.seq : 0;
      };
      return parseNum(a) - parseNum(b);
    });
    if (!this._expandedInvoices) this._expandedInvoices = {};
    let html = '';
    let lastYear = null;
    for (const inv of sorted) {
      const year = this.invYear(inv);
      if (year !== lastYear) {
        html += '<div class="inv-year-header">\u2500\u2500 ' + year + ' \u2500\u2500</div>';
        lastYear = year;
      }
      html += this.invoiceCardHtml(inv);
    }
    return html;
  },

  invoiceCardHtml(v) {
    const total = this.invTotal(v), paid = this.invPaid(v);
    const isPaid = this.invIsPaid(v), overdue = this.invOverdue(v);
    const cur = v.currency || 'RSD';
    const dirColor = v.dir === 'out' ? 'var(--income)' : 'var(--expense)';
    const expanded = this._expandedInvoices[v.id];
    let html = '<div class="savings-card invoice-card' + this.focusRecordHtml('invoice', v.id) + '"' + (isPaid ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + dirColor + ';"></span> ' + this.escapeHtml(v.party || '?') +
      ' <span class="inv-number">#' + this.escapeHtml(v.number || '-') + '</span></span>' +
      '<span class="savings-actions">' +
      ((v.payments && v.payments.length) ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openInvoicePayments(\x27' + v.id + '\x27)" title="View payments in transactions">LINK</button>' : '') +
      '<button class="btn btn-sm ' + (isPaid ? 'btn-secondary' : 'btn-primary') + ' invoice-paid-btn" onclick="BlackBook.toggleInvoicePaid(\x27' + v.id + '\x27)" title="' + (isPaid ? 'Mark as unpaid' : 'Mark as paid') + '">' + (isPaid ? 'UNPAID' : 'PAID') + '</button>' +
      (v.fileName ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openInvoiceFile(\x27' + v.id + '\x27)" title="Open attached file: ' + this.escapeHtml(v.fileName) + '">INVOICE</button>' : '') +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditInvoice(\x27' + v.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteInvoice(\x27' + v.id + '\x27)">DEL</button>' +
      '<button class="btn btn-sm btn-secondary savings-expand-btn" onclick="BlackBook.toggleInvoiceExpanded(\x27' + v.id + '\x27)">' + (expanded ? '&#9650; HIDE' : '&#9660; SHOW') + ' DETAILS</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + this.fmtAmount(total, cur) + '</span><span>' + (isPaid ? 'PAID' : (paid > 0.009 ? 'PARTIAL (' + this.fmtAmount(paid, cur) + ' paid)' : 'UNPAID')) + '</span></div>';
    if (expanded) {
      let linesHtml = '';
      for (const l of (v.lines || [])) {
        linesHtml += '<div class="inv-line-view"><span class="inv-line-desc">' + this.escapeHtml(l.desc || '&mdash;') + '</span><span class="inv-line-math">' + l.qty + ' &times; ' + this.fmtAmount(l.price, cur) + '</span><span class="inv-line-sum">' + this.fmtAmount((parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), cur) + '</span></div>';
      }
      html += '<div class="inv-lines-box">' + linesHtml + '</div>';
      html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
        'ISSUED ' + (v.date || '?') +
        ' &middot; <span class="' + (overdue ? 'amount-negative" title="Overdue"' : '"') + '>DUE ' + (v.dueDate || '-') + '</span>' +
        (overdue ? ' &middot; <span class="amount-negative">OVERDUE</span>' : '') +
        (v.note ? ' &middot; ' + this.escapeHtml(v.note) : '') + '</div>';
    }
    html += '</div>';
    return html;
  },

  toggleInvoiceExpanded(id) {
    if (!this._expandedInvoices) this._expandedInvoices = {};
    this._expandedInvoices[id] = !this._expandedInvoices[id];
    this.renderPage('invoices');
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
      '<input type="text" inputmode="decimal" class="input inv-line-qty" placeholder="Qty" value="' + (qty != null && qty !== '' ? qty : '1') + '" autocomplete="off">' +
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
    this._resetInvoiceFileUI('');
    this._bindInvoiceFilePicker();
    document.getElementById('invoice-id').value = '';
    this._setInvDir('out');
    document.getElementById('invoice-party').value = '';
    const year = new Date().getFullYear();
    let maxSeq = 0;
    for (const v of (this.data.invoices || [])) {
      if (!v.number) continue;
      const p = this.parseInvNumber(v);
      if (p && p.year === year && p.seq > maxSeq) maxSeq = p.seq;
    }
    document.getElementById('invoice-number').value = String(maxSeq + 1).padStart(3, '0') + ' / ' + year;
    document.getElementById('invoice-date').value = this.fmtDateInput(this.today());
    const in14 = new Date(Date.now() + 14 * 86400000);
    document.getElementById('invoice-due').value = this.fmtDateInput(in14.toISOString().slice(0, 10));
    document.getElementById('invoice-currency').value = this.baseCurrency();
    document.getElementById('invoice-note').value = '';
    const catInput = document.getElementById('invoice-category-input');
    const catHidden = document.getElementById('invoice-category');
    if (catInput && catHidden) {
      catHidden.value = '';
      catInput.value = '';
      this.initCategoryPicker('invoice-category-input', 'invoice-category', 'invoice-category-dropdown');
    }
    const invoiceCat = this.data.categories.find(c => c.name.toLowerCase() === 'invoice');
    const defCat = invoiceCat ? invoiceCat.id : (this.data.settings.defaultCategoryId || (this.data.categories[0] && this.data.categories[0].id));
    if (defCat) { catHidden.value = defCat; catInput.value = this.data.categories.find(c => c.id === defCat)?.name?.toUpperCase() || ''; }
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
    this._resetInvoiceFileUI(v.fileName || '');
    this._bindInvoiceFilePicker();
    document.getElementById('invoice-id').value = v.id;
    this._setInvDir(v.dir || 'out');
    document.getElementById('invoice-party').value = v.party || '';
    document.getElementById('invoice-number').value = v.number || '';
    document.getElementById('invoice-date').value = this.fmtDateInput(v.date || '');
    document.getElementById('invoice-due').value = this.fmtDateInput(v.dueDate || '');
    document.getElementById('invoice-currency').value = v.currency || 'RSD';
    document.getElementById('invoice-note').value = v.note || '';
    const catInput = document.getElementById('invoice-category-input');
    const catHidden = document.getElementById('invoice-category');
    if (catInput && catHidden) {
      catHidden.value = v.categoryId || '';
      catInput.value = v.categoryId ? this.data.categories.find(c => c.id === v.categoryId)?.name?.toUpperCase() || '' : '';
      this.initCategoryPicker('invoice-category-input', 'invoice-category', 'invoice-category-dropdown');
    }
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
      if (document.getElementById('invoice-due').value.trim() && !invDue) { alert('Enter a valid due date (DD/MM/YYYY).'); return; }
      const data = { dir: document.getElementById('invoice-dir').value, party: party, number: document.getElementById('invoice-number').value.trim(), date: invDate, dueDate: invDue || '', currency: document.getElementById('invoice-currency').value, note: document.getElementById('invoice-note').value.trim(), lines: lines, categoryId: document.getElementById('invoice-category').value || null };
      let invId = id;
      if (!invId) {
        invId = 'inv-' + Date.now();
        data.id = invId;
      }
      if (pendingInvFile) {
        data.fileName = pendingInvFile.name;
        if (!(await this._invFilePut(invId, pendingInvFile))) {
          data.fileData = await this._fileToDataURL(pendingInvFile);
        }
        pendingInvFile = null;
      }
      if (!this.data.invoices) this.data.invoices = [];
      if (id) {
        const v = this.data.invoices.find(x => x.id === id);
        if (v) {
          const hasPays = (v.payments && v.payments.length) > 0;
          if (hasPays) {
            const newTotal = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), 0);
            const oldTotal = this.invTotal(v);
            const curChanged = v.currency !== data.currency;
            const dirChanged = v.dir !== data.dir;
            if (Math.abs(newTotal - oldTotal) > 0.009 || curChanged || dirChanged) {
              const ok = await this.confirmModal({ title: 'Edit Linked Invoice', message: 'This invoice has linked payment transaction(s). Changing its total, currency, or direction can change the outstanding balance.\n\nContinue?', confirmText: 'Continue' });
              if (!ok) return;
            }
          }
          Object.assign(v, data);
        }
      } else {
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
    if (!(await this.confirmModal({ title: 'Delete Invoice', message: 'Delete invoice #' + (v.number || v.id) + ' for "' + v.party + '"?\nLinked payment transactions are removed too.' , confirmText: 'Delete' }))) return;
    const prefix = 'inv-' + id + '-p';
    this.data.transactions = this.data.transactions.filter(t => !String(t.pairId || '').startsWith(prefix));
    this.data.invoices = this.data.invoices.filter(x => x.id !== id);
    await this._invFileDel(id);
    await this.save();
    this.renderPage(this.currentPage === 'invoices' ? 'invoices' : this.currentPage);
  },

  async toggleInvoicePaid(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v) return;
    const isPaid = this.invIsPaid(v);
    if (isPaid) {
      if (!(await this.confirmModal({ title: 'Mark Unpaid', message: 'Mark this invoice as unpaid? The payment transaction will be removed.', confirmText: 'Unpaid' }))) return;
      const prefix = 'inv-' + id + '-p';
      this.data.transactions = this.data.transactions.filter(t => !String(t.pairId || '').startsWith(prefix));
      v.payments = [];
      v.amountPaid = 0;
    } else {
      const remaining = this.invRemaining(v);
      if (remaining <= 0.009) return;
      const accountId = this.data.settings.defaultAccountId || (this.data.accounts[0] && this.data.accounts[0].id);
      const categoryId = v.categoryId || this.invoiceCategory().id;
      const date = this.today();
      const type = v.dir === 'out' ? 'income' : 'expense';
      const pairId = 'inv-' + v.id + '-p1';
      const txId = 'tx-' + pairId;
      const cur = v.currency || 'RSD';
      this.data.transactions.unshift({ id: txId, type: type, amount: type === 'income' ? remaining : -remaining, currency: cur, accountId: accountId || null, categoryId: categoryId, date: date, note: 'Invoice ' + (v.number ? '#' + v.number + ' ' : '') + (v.party || ''), pairId: pairId });
      v.payments = [{ date: date, amount: remaining, accountId: accountId || null, categoryId: categoryId, txId: txId }];
      v.amountPaid = remaining;
    }
    await this.save();
    this.renderPage(this.currentPage === 'invoices' ? 'invoices' : this.currentPage);
  },

  async openInvoicePayments(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v) return;
    const first = (v.payments || [])[0];
    if (first && first.date) this.syncViewToDate(first.date);
    this.navigateTo('overview');
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

  invNextSeq(v) {
    const used = new Set((v.payments || []).map(p => p && p.seq));
    let seq = 1;
    while (used.has(seq)) seq++;
    return seq;
  },

  async applyInvoicePayment(v, amt, accountId, categoryId, date) {
    if (!(amt > 0)) return;
    const remaining = this.invRemaining(v);
    if (remaining <= 0.009) return;
    if (amt > remaining) amt = remaining;
    if (!v.payments) v.payments = [];
    const seqN = this.invNextSeq(v);
    const pairId = 'inv-' + v.id + '-p' + seqN;
    const txId = 'tx-' + pairId;
    const cur = v.currency || 'RSD';
    const type = v.dir === 'out' ? 'income' : 'expense';
    this.data.transactions.unshift({ id: txId, type: type, amount: type === 'income' ? amt : -amt, currency: cur, accountId: accountId || null, categoryId: categoryId || null, date: date, note: 'Invoice ' + (v.number ? '#' + v.number + ' ' : '') + (v.party || ''), pairId: pairId });
    v.payments.push({ date: date, amount: amt, accountId: accountId || null, categoryId: categoryId || null, txId: txId, seq: seqN });
    v.amountPaid = Math.round(((v.amountPaid || 0) + amt) * 100) / 100;
    await this.save();
  },

  removeInvoicePaymentByTx(txId) {
    const found = this.invoiceForPaymentTx(txId);
    if (!found) return;
    const v = found.invoice;
    const idx = found.paymentIndex;
    if (idx < 0 || idx >= (v.payments || []).length) return;
    const pay = v.payments[idx];
    if (v.payments) v.payments.splice(idx, 1);
    const amt = pay ? (pay.amount || 0) : 0;
    v.amountPaid = Math.max(0, Math.round(((v.amountPaid || 0) - amt) * 100) / 100);
  },

});
})();
