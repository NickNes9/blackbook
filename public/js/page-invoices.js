(function () {
let pendingInvHandle = null;
Object.assign(window.BlackBook, {

  _resetInvoiceFileUI(name) {
    pendingInvHandle = null;
    const el = document.getElementById('invoice-file-name');
    if (el) el.textContent = name || 'No file attached';
  },

  _bindInvoiceFilePicker() {
    const btn = document.getElementById('invoice-file-btn');
    if (!btn) return;
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const response = await fetch('/api/invoice-file/pick', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: this.profile || '' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The file picker could not open.');
        if (result.cancelled) return;
        pendingInvHandle = { kind: 'local-path', name: result.fileName, path: result.filePath };
        document.getElementById('invoice-file-name').textContent = result.fileName + ' (linked)';
      } catch (error) {
        alert(error.message || 'Could not select the invoice file.');
      } finally {
        btn.disabled = false;
      }
    });
  },

  renderInvoices() {
    const el = document.getElementById('page-invoices');
    if (!el) return;
    if (!this.data.invoices) this.data.invoices = [];
    if (!this.data.invoiceTemplates) this.data.invoiceTemplates = [];
    const offToday = this.vy() !== new Date().getFullYear();
    let html = '<div class="month-picker">' +
      '<span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.shiftYear(-1)">&#9664;</button><span class="mp-year-label">' + this.vy() + '</span><button class="mp-year-btn" onclick="BlackBook.shiftYear(1)">&#9654;</button></span>' +
      '<button class="mp-today' + (offToday ? ' mp-today-active' : '') + '" onclick="BlackBook.gotoToday()">TODAY</button>' +
      '<span style="flex:1;"></span>' +
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
  invoicePaidDate(inv) {
    if (!inv) return '';
    if (inv.paidDate) return inv.paidDate;
    if (!this.invIsPaid(inv)) return '';
    const dates = (inv.payments || []).map(payment => payment && payment.date).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  },
  invBase(inv) { return Math.abs(this.toBase(this.invTotal(inv), inv.currency || this.baseCurrency() || 'RSD')); },
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
    const year = this.vy();
    let owedMe = 0, iOwe = 0, paidTotal = 0;
    for (const v of this.data.invoices) {
      if (this.invYear(v) !== year) continue;
      const rem = this.invRemaining(v);
      const currency = v.currency || this.baseCurrency() || 'RSD';
      const remBase = Math.abs(this.toBase(rem, currency));
      if (rem > 0.009) { if (v.dir === 'out') owedMe += remBase; else iOwe += remBase; }
      paidTotal += Math.abs(this.toBase(this.invPaid(v), currency));
    }
    const f = this._invFilter || 'all';
    const filterLabel = f === 'out' ? 'INCOMES' : f === 'in' ? 'EXPENSES' : 'ALL';
    return '<div class="month-summary">' +
      '<div class="month-summary-item"><span class="month-summary-label">INCOME</span><span class="month-summary-value amount-positive">' + this.fmtBase(owedMe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">EXPENSE</span><span class="month-summary-value amount-negative">' + this.fmtBase(iOwe) + '</span></div>' +
      '<div class="month-summary-item"><span class="month-summary-label">PAID</span><span class="month-summary-value amount-positive">' + this.fmtBase(paidTotal) + '</span></div>' +
      '<span style="flex:1;"></span>' +
      '<span style="display:flex;gap:4px;align-items:center;">' +
      '<button class="btn btn-sm btn-secondary page-control inv-filter-cycle" onclick="BlackBook.cycleInvoiceFilter()" title="Cycle filter: Incomes → Expenses → All" style="min-width:100px;text-align:center;">' + filterLabel + '</button>' +
      '</span></div>';
  },

  invoicesListHtml() {
    const f = this._invFilter || 'all';
    const year = this.vy();
    const filtered = f === 'all' ? (this.data.invoices || []) : (this.data.invoices || []).filter(v => (v.dir === 'out') === (f === 'out'));
    const all = filtered.filter(v => this.invYear(v) === year);
    if (!all.length) return '<div class="empty-state"><div class="empty-state-text">' + ((this.data.invoices || []).length ? 'No invoices for ' + year + '.' : 'No invoices yet. Click + NEW INVOICE to create one.') + '</div></div>';
    const sorted = all.slice().sort((a, b) => {
      const parseNum = (inv) => {
        const p = this.parseInvNumber(inv);
        return p ? p.seq : 0;
      };
      return parseNum(a) - parseNum(b);
    });
    if (!this._expandedInvoices) this._expandedInvoices = {};
    let html = '';
    for (const inv of sorted) {
      html += this.invoiceCardHtml(inv);
    }
    return html;
  },

  invoiceCardHtml(v) {
    const total = this.invTotal(v), paid = this.invPaid(v);
    const isPaid = this.invIsPaid(v);
    const cur = v.currency || this.baseCurrency() || 'RSD';
    const dirColor = v.dir === 'out' ? 'var(--income)' : 'var(--expense)';
    const expanded = this._expandedInvoices[v.id];
    let html = '<div class="savings-card invoice-card' + this.focusRecordHtml('invoice', v.id) + '"' + (isPaid ? ' style="opacity:0.55;"' : '') + '>';
    html += '<div class="savings-header">' +
      '<span class="savings-name"><span class="cat-dot" style="background:' + dirColor + ';"></span> ' + this.escapeHtml(v.party || '?') + this.healthMarker('invoices', v.id) +
      ' <span class="inv-number">#' + this.escapeHtml(v.number || '-') + '</span></span>' +
      '<span class="savings-actions">' +
      ((v.payments || []).some(payment => payment.txId && (this.data.transactions || []).some(tx => tx.id === payment.txId)) ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openInvoicePayments(\x27' + v.id + '\x27)" title="Open the latest linked payment">LINK</button>' : '') +
      '<button class="btn btn-sm ' + (isPaid ? 'btn-secondary' : 'btn-primary') + ' invoice-paid-btn" onclick="BlackBook.toggleInvoicePaid(\x27' + v.id + '\x27)" title="' + (isPaid ? 'Mark as unpaid' : 'Mark as paid') + '">' + (isPaid ? 'UNPAID' : 'PAID') + '</button>' +
      (v.fileName ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openInvoiceFile(\x27' + v.id + '\x27)" title="Open attached file: ' + this.escapeHtml(v.fileName) + '">INVOICE</button>' : '') +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditInvoice(\x27' + v.id + '\x27)">EDIT</button>' +
      '<button class="btn btn-sm btn-danger btn-icon" title="Delete invoice" onclick="BlackBook.deleteInvoice(\x27' + v.id + '\x27)">' + this.xIcon() + '</button>' +
      '<button class="btn btn-sm btn-secondary savings-expand-btn" onclick="BlackBook.toggleInvoiceExpanded(\x27' + v.id + '\x27)">' + (expanded ? '&#9650; HIDE' : '&#9660; SHOW') + ' DETAILS</button></span></div>';
    html += '<div class="savings-progress-text"><span>' + this.fmtAmount(total, cur) + '</span><span>' + (isPaid ? 'PAID' : (paid > 0.009 ? 'PARTIAL (' + this.fmtAmount(paid, cur) + ' paid)' : 'UNPAID')) + '</span></div>';
    if (expanded) {
      let linesHtml = '';
      for (const l of (v.lines || [])) {
        linesHtml += '<div class="inv-line-view"><span class="inv-line-desc">' + this.escapeHtml(l.desc || '&mdash;') + '</span><span class="inv-line-math">' + l.qty + ' &times; ' + this.fmtAmount(l.price, cur) + '</span><span class="inv-line-sum">' + this.fmtAmount((parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), cur) + '</span></div>';
      }
      html += '<div class="inv-lines-box">' + linesHtml + '</div>';
      html += this.invoicePaymentHistoryHtml(v);
      html += '<div class="bill-meta-line" style="display:block;margin-top:6px;">' +
        'ISSUED ' + (this.fmtDateInput(v.date || '') || '?') +
        ' &middot; PAID ' + (isPaid ? (this.fmtDateInput(this.invoicePaidDate(v)) || '-') : '-') +
        (v.note ? ' &middot; ' + this.escapeHtml(v.note) : '') + '</div>';
    }
    html += '</div>';
    return html;
  },

  invoicePaymentHistoryHtml(v) {
    if (!(v.payments || []).length) return '';
    const currency = v.currency || this.baseCurrency() || 'RSD';
    const rows = v.payments.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(payment => {
      const tx = payment.txId ? (this.data.transactions || []).find(item => item.id === payment.txId) : null;
      const date = tx ? tx.date : payment.date;
      const amount = tx ? Math.abs(tx.amount) : Math.abs(payment.amount || 0);
      return '<div class="linked-payment-row"><span class="linked-payment-date">' + this.escapeHtml(this.fmtDateInput(date || '') || '—') + '</span><span class="linked-payment-amount">' + this.fmtAmount(amount, currency) + '</span>' +
        (tx ? this.linkedTransactionButton(tx.id) : '<span class="linked-payment-unlinked" title="No transaction is linked to this payment">UNLINKED</span>') + '</div>';
    }).join('');
    return '<div class="linked-payment-history"><div class="linked-payment-heading">PAYMENTS</div>' + rows + '</div>';
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

  invoiceTemplateDraftFromForm() {
    const lines = [...document.querySelectorAll('#inv-lines .inv-line')].map(row => ({
      desc: row.querySelector('.inv-line-desc').value.trim(),
      qty: row.querySelector('.inv-line-qty').value.trim(),
      price: row.querySelector('.inv-line-price').value.trim()
    })).filter(line => line.desc || line.qty || line.price);
    return {
      dir: document.getElementById('invoice-dir').value,
      party: document.getElementById('invoice-party').value.trim(),
      currency: document.getElementById('invoice-currency').value,
      categoryId: document.getElementById('invoice-category').value || null,
      note: document.getElementById('invoice-note').value.trim(),
      lines: lines
    };
  },

  refreshInvoiceTemplateControls(selectedId) {
    const select = document.getElementById('invoice-template-select');
    if (!select) return;
    const templates = this.data.invoiceTemplates || [];
    const current = selectedId || select.value;
    select.innerHTML = '<option value="">' + (templates.length ? 'Choose a template...' : 'No saved templates') + '</option>' +
      templates.map(template => '<option value="' + this.escapeHtml(template.id) + '">' + this.escapeHtml(template.name) + '</option>').join('');
    select.value = templates.some(template => template.id === current) ? current : '';
    this.updateInvoiceTemplateButtons();
  },

  updateInvoiceTemplateButtons() {
    const selected = !!(document.getElementById('invoice-template-select') || {}).value;
    const use = document.getElementById('invoice-template-use');
    const del = document.getElementById('invoice-template-delete');
    if (use) use.disabled = !selected;
    if (del) del.disabled = !selected;
  },

  applyInvoiceTemplate() {
    const id = (document.getElementById('invoice-template-select') || {}).value;
    const template = (this.data.invoiceTemplates || []).find(item => item.id === id);
    if (!template) return;
    this._setInvDir(template.dir === 'in' ? 'in' : 'out');
    document.getElementById('invoice-party').value = template.party || '';
    document.getElementById('invoice-currency').value = template.currency || this.baseCurrency();
    document.getElementById('invoice-note').value = template.note || '';
    const catInput = document.getElementById('invoice-category-input');
    const catHidden = document.getElementById('invoice-category');
    const available = this.categoriesAvailableOn(this.today());
    const category = available.find(item => item.id === template.categoryId) ||
      available.find(item => item.name.toLowerCase() === 'invoice') || available[0];
    if (catInput && catHidden) {
      catHidden.value = category ? category.id : '';
      catInput.value = category ? category.name.toUpperCase() : '';
      this.initCategoryPicker('invoice-category-input', 'invoice-category', 'invoice-category-dropdown');
    }
    document.getElementById('inv-lines').innerHTML = (template.lines && template.lines.length ? template.lines : [{ desc: '', qty: '1', price: '' }])
      .map(line => this._invLineRow(line.desc, line.qty, line.price)).join('');
    if (!document.getElementById('invoice-id').value) {
      document.getElementById('invoice-date').value = this.fmtDateInput(this.today());
      document.getElementById('invoice-paid-date').value = '';
      this._resetInvoiceFileUI('');
    }
    this._bindInvLineEvents();
    this._recalcInvTotal();
  },

  openInvoiceTemplateSave() {
    const draft = this.invoiceTemplateDraftFromForm();
    if (!draft.party) { alert('Enter a party before saving an invoice template.'); return; }
    if (!draft.lines.length) { alert('Add at least one line item before saving an invoice template.'); return; }
    this._invoiceTemplateDraft = draft;
    document.getElementById('invoice-template-name').value = draft.party;
    this.openModal('invoice-template-modal');
    setTimeout(() => document.getElementById('invoice-template-name').focus(), 50);
  },

  async saveInvoiceTemplate() {
    const name = document.getElementById('invoice-template-name').value.trim();
    if (!name) { alert('Enter a template name.'); return; }
    const draft = this._invoiceTemplateDraft;
    if (!draft) return;
    if (!this.data.invoiceTemplates) this.data.invoiceTemplates = [];
    const existing = this.data.invoiceTemplates.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing && !(await this.confirmModal({ title: 'Replace Template', message: 'A template named "' + name + '" already exists. Replace it?', confirmText: 'Replace' }))) return;
    if (existing) Object.assign(existing, draft, { name: name });
    else this.data.invoiceTemplates.push({ id: 'invoice-template-' + Date.now(), name: name, ...draft });
    await this.save();
    this.refreshInvoiceTemplateControls(existing && existing.id);
    this.closeModal('invoice-template-modal');
    this._invoiceTemplateDraft = null;
  },

  async deleteInvoiceTemplate() {
    const id = (document.getElementById('invoice-template-select') || {}).value;
    const template = (this.data.invoiceTemplates || []).find(item => item.id === id);
    if (!template) return;
    if (!(await this.confirmModal({ title: 'Delete Template', message: 'Delete the saved invoice template "' + template.name + '"?', confirmText: 'Delete' }))) return;
    this.data.invoiceTemplates = this.data.invoiceTemplates.filter(item => item.id !== id);
    await this.save();
    this.refreshInvoiceTemplateControls();
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
    document.getElementById('invoice-paid-date').value = '';
    document.getElementById('invoice-currency').value = this.baseCurrency();
    document.getElementById('invoice-note').value = '';
    const catInput = document.getElementById('invoice-category-input');
    const catHidden = document.getElementById('invoice-category');
    if (catInput && catHidden) {
      catHidden.value = '';
      catInput.value = '';
      this.initCategoryPicker('invoice-category-input', 'invoice-category', 'invoice-category-dropdown');
    }
    const availableCats = this.categoriesAvailableOn(this.today());
    const invoiceCat = availableCats.find(c => c.name.toLowerCase() === 'invoice');
    const defCat = invoiceCat ? invoiceCat.id : (availableCats.some(c => c.id === this.data.settings.defaultCategoryId) ? this.data.settings.defaultCategoryId : availableCats[0]?.id);
    if (defCat) { catHidden.value = defCat; catInput.value = this.data.categories.find(c => c.id === defCat)?.name?.toUpperCase() || ''; }
    document.getElementById('inv-lines').innerHTML = this._invLineRow('', '', '');
    document.getElementById('invoice-modal-title').textContent = 'New Invoice';
    this.refreshInvoiceTemplateControls();
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
    document.getElementById('invoice-paid-date').value = this.fmtDateInput(v.paidDate || this.invoicePaidDate(v));
    document.getElementById('invoice-currency').value = v.currency || this.baseCurrency() || 'RSD';
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
    this.refreshInvoiceTemplateControls();
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
      const paidDateText = document.getElementById('invoice-paid-date').value.trim();
      const paidDate = this.parseDateInput(paidDateText);
      if (paidDateText && !paidDate) { alert('Enter a valid paid date (' + this.dateFormatPattern() + ').'); return; }
      const data = { dir: document.getElementById('invoice-dir').value, party: party, number: document.getElementById('invoice-number').value.trim(), date: invDate, paidDate: paidDate || '', currency: document.getElementById('invoice-currency').value, note: document.getElementById('invoice-note').value.trim(), lines: lines, categoryId: document.getElementById('invoice-category').value || null };
      const original = id ? this.data.invoices.find(item => item.id === id) : null;
      if (!this.categorySelectionAllowed(data.categoryId, invDate, original && original.categoryId)) { alert('That category was archived for this date. Choose another category.'); return; }
      let invId = id;
      if (!invId) {
        invId = 'inv-' + Date.now();
        data.id = invId;
      }
      if (pendingInvHandle) {
        data.fileName = pendingInvHandle.name;
        data.filePath = pendingInvHandle.path;
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
          if (pendingInvHandle && pendingInvHandle.kind !== 'local-path' && !(await this._invFilePut(invId, pendingInvHandle))) {
            alert('Could not save the local file link in this browser. The invoice was not saved.');
            return;
          }
          if (this.invIsPaid(v) && data.paidDate && data.paidDate !== this.invoicePaidDate(v)) {
            const finalPayment = (v.payments || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0) || String(a.date || '').localeCompare(String(b.date || ''))).pop();
            if (finalPayment) {
              finalPayment.date = data.paidDate;
              const linkedTx = this.data.transactions.find(tx => tx.id === finalPayment.txId);
              if (linkedTx) linkedTx.date = data.paidDate;
            }
          }
          Object.assign(v, data);
          if (data.fileName) delete v.fileData;
        }
      } else {
        if (pendingInvHandle && pendingInvHandle.kind !== 'local-path' && !(await this._invFilePut(invId, pendingInvHandle))) {
          alert('Could not save the local file link in this browser. The invoice was not saved.');
          return;
        }
        data.amountPaid = 0;
        data.payments = [];
        this.data.invoices.push(data);
      }
      pendingInvHandle = null;
      await this.save({ undoable: true, label: id ? 'Edit invoice' : 'Add invoice' });
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
    await this.save({ undoable: true, label: 'Delete invoice' });
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
      v.paidDate = '';
    } else {
      if (this.invRemaining(v) <= 0.009) return;
      this.openInvPayModal(id);
      return;
    }
    await this.save({ undoable: true, label: 'Change invoice payment' });
    this.renderPage(this.currentPage === 'invoices' ? 'invoices' : this.currentPage);
  },

  async openInvoicePayments(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v) return;
    const latest = (v.payments || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .find(payment => (this.data.transactions || []).some(tx => tx.id === payment.txId));
    if (latest) this.openLinkedTransaction(latest.txId);
  },

  openInvPayModal(id) {
    const v = this.data.invoices.find(x => x.id === id);
    if (!v || this.invIsPaid(v)) return;
    const previousPaymentDate = (v.payments || []).map(payment => payment && payment.date).filter(Boolean).sort().pop();
    const payDate = v.paidDate || previousPaymentDate || v.date || this.today();
    document.getElementById('ipay-id').value = id;
    document.getElementById('ipay-amount').value = this.invRemaining(v).toFixed(2);
    const payAccount = this.visibleAccounts().find(a => a.id === this.data.settings.defaultAccountId) ||
      this.visibleAccounts().find(a => a.currency === (v.currency || this.baseCurrency() || 'RSD')) || this.visibleAccounts()[0];
    document.getElementById('ipay-account').innerHTML = this.visibleAccounts().map(a => '<option value="' + this.escapeHtml(a.id) + '"' + (payAccount && a.id === payAccount.id ? ' selected' : '') + '>' + this.escapeHtml(a.name) + ' (' + this.escapeHtml(a.currency) + ')</option>').join('');
    const categories = this.categoriesAvailableOn(payDate, v.categoryId);
    const payCategory = categories.find(c => c.id === v.categoryId) || categories.find(c => c.name.toLowerCase() === 'invoice') || categories[0];
    document.getElementById('ipay-category').innerHTML = categories.map(c => '<option value="' + this.escapeHtml(c.id) + '"' + (payCategory && c.id === payCategory.id ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');
    document.getElementById('ipay-date').value = this.fmtDateInput(payDate);
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
      const payDate = this.parseDateInput(document.getElementById('ipay-date').value);
      if (!payDate) { alert('Enter a valid paid date (' + this.dateFormatPattern() + ').'); return; }
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
    const cur = v.currency || this.baseCurrency() || 'RSD';
    const type = v.dir === 'out' ? 'income' : 'expense';
    this.data.transactions.unshift({ id: txId, type: type, amount: type === 'income' ? amt : -amt, currency: cur, accountId: accountId || null, categoryId: categoryId || null, date: date, note: 'Invoice ' + (v.number ? '#' + v.number + ' ' : '') + (v.party || ''), pairId: pairId });
    v.payments.push({ date: date, amount: amt, accountId: accountId || null, categoryId: categoryId || null, txId: txId, seq: seqN });
    v.amountPaid = Math.round(((v.amountPaid || 0) + amt) * 100) / 100;
    v.paidDate = this.invIsPaid(v) ? date : '';
    await this.save({ undoable: true, label: 'Record invoice payment' });
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
    v.paidDate = this.invIsPaid(v) ? this.invoicePaidDate(v) : '';
  },

});
})();
