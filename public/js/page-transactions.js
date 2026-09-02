(function () {
Object.assign(window.BlackBook, {
  accountSelectOptions(selectedVal) {
    const opts = this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === selectedVal ? ' selected' : '') + '>' + this.escapeHtml(a.name) + (a.currency && a.currency !== 'RSD' ? ' (' + a.currency + ')' : '') + '</option>');
    for (const c of (this.data.creditCards || [])) {
      opts.push('<option value="card:' + c.id + '"' + ('card:' + c.id === selectedVal ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>');
    }
    return opts.join('');
  },

  openNewTransaction(targetId) {
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-date').value = this.fmtDateInput(this.todayForViewedMonth());
    document.getElementById('tx-type').value = 'expense';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    const cardPrefill = targetId && String(targetId).startsWith('card:') ? targetId : null;
    const defaultAccountId = targetId || this.selectedAccount || '';
    const accSelect = document.getElementById('tx-account');
    accSelect.innerHTML = (defaultAccountId ? '' : '<option value="">-- SELECT ACCOUNT --</option>') + (this.accountSelectOptions(defaultAccountId) || '<option value="">no accounts</option>');
    const selAcc = cardPrefill ? null : this.data.accounts.find(a => a.id === defaultAccountId);
    document.getElementById('tx-currency').value = selAcc ? (selAcc.currency || 'RSD') : 'RSD';
    document.getElementById('tx-currency-select').value = selAcc ? (selAcc.currency || 'RSD') : 'RSD';
    document.getElementById('tx-native-amount').value = '';
    document.getElementById('tx-fee-amount').value = '';
    document.getElementById('tx-preview').textContent = '';
    this.updateTxNativeRow();
    const defaultCatId = this.data.settings.defaultCategoryId || (this.data.categories[0] && this.data.categories[0].id) || '';
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    const defaultCat = this.data.categories.find(c => c.id === defaultCatId);
    if (catInput && catHidden) { catHidden.value = defaultCatId; catInput.value = defaultCat ? defaultCat.name.toUpperCase() : ''; }
    const amountInput = document.getElementById('tx-amount');
    amountInput.oninput = () => { document.getElementById('tx-type').value = amountInput.value.trim().startsWith('+') ? 'income' : 'expense'; };
    this.openModal('transaction-modal');
    setTimeout(() => amountInput.focus(), 50);
    this.initCategoryPicker('tx-category-input', 'tx-category', 'category-dropdown');
    this.bindQuickEntryExtras();
  },

  bindQuickEntryExtras() {
    if (this._quickEntryExtrasBound) return;
    this._quickEntryExtrasBound = true;
    document.getElementById('tx-account').addEventListener('change', (e) => {
      const v = String(e.target.value);
      if (v.startsWith('card:')) {
        document.getElementById('tx-currency').value = 'RSD';
        document.getElementById('tx-currency-select').value = 'RSD';
      } else {
        const acc = this.data.accounts.find(a => a.id === v);
        const cur = acc ? (acc.currency || 'RSD') : 'RSD';
        document.getElementById('tx-currency').value = cur;
        document.getElementById('tx-currency-select').value = cur;
      }
      this.updateTxNativeRow();
      this.updateTxPreview();
    });
    document.getElementById('tx-currency-select').addEventListener('change', (e) => {
      document.getElementById('tx-currency').value = e.target.value;
      this.updateTxNativeRow();
      this.updateTxPreview();
    });
    document.getElementById('tx-amount').addEventListener('input', () => this.updateTxPreview());
    document.getElementById('tx-native-amount').addEventListener('input', () => this.updateTxPreview());
    document.getElementById('tx-fee-amount').addEventListener('input', () => this.updateTxPreview());
  },

  updateTxNativeRow() {
    const accountVal = document.getElementById('tx-account').value;
    const cur = document.getElementById('tx-currency-select').value;
    const row = document.getElementById('tx-native-row');
    const feeRow = document.getElementById('tx-fee-row');
    const label = row ? row.querySelector('label') : null;
    if (!accountVal || accountVal.startsWith('card:') || cur === 'RSD') {
      row.style.display = 'none';
      if (feeRow) feeRow.style.display = 'none';
      return;
    }
    const acc = this.data.accounts.find(a => a.id === accountVal);
    const accCur = (acc && acc.currency) || 'RSD';
    if (accCur !== 'RSD') { row.style.display = 'none'; if (feeRow) feeRow.style.display = 'none'; return; }
    row.style.display = '';
    if (feeRow) feeRow.style.display = '';
    if (label) label.textContent = 'NATIVE AMOUNT (' + cur + ')';
  },

  updateTxPreview() {
    const previewEl = document.getElementById('tx-preview');
    if (!previewEl) return;
    const accountVal = document.getElementById('tx-account').value;
    const cur = document.getElementById('tx-currency-select').value;
    if (!accountVal || accountVal.startsWith('card:') || cur === 'RSD') { previewEl.textContent = ''; return; }
    const acc = this.data.accounts.find(a => a.id === accountVal);
    const accCur = (acc && acc.currency) || 'RSD';
    if (accCur !== 'RSD') { previewEl.textContent = ''; return; }
    const nativeEl = document.getElementById('tx-native-amount');
    const nativeVal = nativeEl && nativeEl.value.trim() ? this.evalAmount(nativeEl.value) : null;
    const amtVal = this.evalAmount(document.getElementById('tx-amount').value);
    const feeEl = document.getElementById('tx-fee-amount');
    const manualFee = feeEl && feeEl.value.trim() ? this.evalAmount(feeEl.value) : null;
    const fee = (acc && acc.foreignFee) || 0;
    const parts = [];
    if (amtVal > 0 && fee > 0 && (nativeVal > 0 || manualFee > 0)) {
      const autoRes = nativeVal > 0 ? this.calcForeignFee(nativeVal, fee, cur) : { feeNative: null, feeRsd: 0 };
      const feeRsd = manualFee > 0 ? manualFee : autoRes.feeRsd;
      const total = this.round2(amtVal + feeRsd);
      let feeTxt = 'FEE ' + feeRsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD';
      if (manualFee > 0) feeTxt += ' (manual)';
      else if (autoRes.feeNative != null) feeTxt += ' (' + autoRes.feeNative.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur + ')';
      parts.push(feeTxt + ' \u2192 ' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD');
    } else if (nativeVal > 0) {
      parts.push('\u2248 ' + nativeVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur);
    }
    previewEl.textContent = parts.join(' \u00b7 ');
  },

  openTransferModal() {
    this._transferSourceIds = null;
    const vis = this.visibleAccounts();
    if (vis.length < 2) { alert('You need at least two accounts to transfer.'); return; }
    const opts = vis.map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + ' (' + (a.currency || 'RSD') + ')</option>').join('');
    document.getElementById('tr-from').innerHTML = opts;
    document.getElementById('tr-to').innerHTML = opts;
    document.getElementById('tr-from').value = (this.selectedAccount && vis.some(a => a.id === this.selectedAccount) && this.selectedAccount !== vis[0].id) ? this.selectedAccount : vis[0].id;
    const toSel = document.getElementById('tr-to');
    toSel.value = toSel.options[0].value === document.getElementById('tr-from').value ? toSel.options[1].value : toSel.options[0].value;
    document.getElementById('tr-amount').value = '';
    document.getElementById('tr-amount-in').value = '';
    this._transferNoteBase = null;
    this.updateTransferNote();
    document.getElementById('tr-date').value = this.fmtDateInput(this.today());
    this.updateTransferCurrencyLabels();
    this.openModal('transfer-modal');
    setTimeout(() => document.getElementById('tr-amount').focus(), 50);
  },

  openEditTransfer(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    this._transferSourceIds = null;
    if (!tx || tx.type !== 'transfer') return this.openEditTransaction(txId);
    const vis = this.visibleAccounts();
    const opts = vis.map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + ' (' + (a.currency || 'RSD') + ')</option>').join('');
    document.getElementById('tr-from').innerHTML = opts;
    document.getElementById('tr-to').innerHTML = opts;
    document.getElementById('tr-from').value = tx.fromAccountId;
    document.getElementById('tr-to').value = tx.toAccountId;
    document.getElementById('tr-amount').value = Math.abs(tx.amount);
    document.getElementById('tr-amount-in').value = tx.amountIn != null ? Math.abs(tx.amountIn) : '';
    const noteRaw = tx.note || '';
    document.getElementById('tr-note').value = noteRaw;
    this._transferNoteBase = this.transferNoteBase();
    document.getElementById('tr-date').value = this.fmtDateInput(tx.date);
    this._editingTransferId = txId;
    this.updateTransferCurrencyLabels();
    this.openModal('transfer-modal');
    setTimeout(() => document.getElementById('tr-amount').focus(), 50);
  },

  transferNoteBase() {
    const f = document.getElementById('tr-from');
    const t = document.getElementById('tr-to');
    const fromAcc = f ? this.data.accounts.find(a => a.id === f.value) : null;
    const toAcc = t ? this.data.accounts.find(a => a.id === t.value) : null;
    return (fromAcc ? fromAcc.name : '?') + ' → ' + (toAcc ? toAcc.name : '?');
  },

  updateTransferNote() {
    const noteEl = document.getElementById('tr-note');
    if (!noteEl) return;
    const base = this.transferNoteBase();
    if (this._transferNoteBase) {
      const cur = noteEl.value;
      if (cur.indexOf(this._transferNoteBase) === 0) {
        noteEl.value = base + cur.slice(this._transferNoteBase.length);
      }
    } else {
      noteEl.value = base;
    }
    this._transferNoteBase = base;
  },

  updateTransferCurrencyLabels() {
    const fromAcc = this.data.accounts.find(a => a.id === document.getElementById('tr-from').value);
    const toAcc = this.data.accounts.find(a => a.id === document.getElementById('tr-to').value);
    const curF = fromAcc ? (fromAcc.currency || 'RSD') : 'RSD';
    const curT = toAcc ? (toAcc.currency || 'RSD') : 'RSD';
    document.getElementById('tr-out-label').textContent = 'Amount out (' + curF + ')';
    document.getElementById('tr-in-label').textContent = 'Amount in (' + curT + ')';
  },

  convertBetweenCurrencies(amount, curFrom, curTo) {
    if (!amount || isNaN(amount)) return null;
    if (curFrom === curTo) return Math.round(amount * 100) / 100;
    const rateFrom = curFrom === 'RSD' ? 1 : (this.getRates()[curFrom] || {}).rate;
    const rateTo = curTo === 'RSD' ? 1 : (this.getRates()[curTo] || {}).rate;
    if (!rateFrom || !rateTo) return null;
    const rsd = amount * rateFrom;
    return Math.round(rsd / rateTo * 100) / 100;
  },

  async doTransfer(fromId, toId, amountOut, noteExtra, date, amountInOverride) {
    const cat = this.transferCategoryObj();
    const fromAcc = this.data.accounts.find(a => a.id === fromId);
    const toAcc = this.data.accounts.find(a => a.id === toId);
    if (!fromAcc || !toAcc || fromId === toId || isNaN(amountOut) || amountOut <= 0) return false;
    const curF = fromAcc.currency || 'RSD';
    const curT = toAcc.currency || 'RSD';
    let amountIn = amountInOverride;
    if (amountIn == null || isNaN(amountIn)) amountIn = this.convertBetweenCurrencies(amountOut, curF, curT);
    if (amountIn == null || isNaN(amountIn)) amountIn = amountOut;
    const pairId = 'pair-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const noteBase = fromAcc.name + ' → ' + toAcc.name;
    const note = noteExtra
      ? (noteExtra.indexOf(noteBase) === 0 ? noteExtra : noteBase + ' · ' + noteExtra)
      : noteBase;
    this.data.transactions.unshift({
      id: 'tx-' + pairId,
      type: 'transfer',
      amount: Math.round(Math.abs(amountOut) * 100) / 100,
      amountIn: Math.round(Math.abs(amountIn) * 100) / 100,
      currency: curF,
      currencyIn: curT,
      fromAccountId: fromId,
      toAccountId: toId,
      categoryId: cat.id,
      date: date,
      note: note,
      pairId: pairId
    });
    await this.save();
    return true;
  },

  bindTransferForm() {
    const amtOut = document.getElementById('tr-amount');
    const amtIn = document.getElementById('tr-amount-in');
    amtOut.addEventListener('input', () => {
      const f = document.getElementById('tr-from');
      const t = document.getElementById('tr-to');
      const curF = (this.data.accounts.find(a => a.id === f.value) || {}).currency || 'RSD';
      const curT = (this.data.accounts.find(a => a.id === t.value) || {}).currency || 'RSD';
      const converted = this.convertBetweenCurrencies(this.evalAmount(amtOut.value), curF, curT);
      if (converted != null) amtIn.value = converted;
    });
    ['tr-from', 'tr-to'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.updateTransferCurrencyLabels();
        this.updateTransferNote();
        if (amtOut.value) amtOut.dispatchEvent(new Event('input'));
      });
    });
    document.getElementById('transfer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const from = document.getElementById('tr-from').value;
      const to = document.getElementById('tr-to').value;
      const amountOut = this.evalAmount(amtOut.value);
      const amountInRaw = amtIn.value.trim();
      const amountIn = amountInRaw === '' ? null : this.evalAmount(amountInRaw);
      const date = this.parseDateInput(document.getElementById('tr-date').value) || this.today();
      const noteExtra = document.getElementById('tr-note').value.trim();
      if (this._editingTransferId) {
        const tx = this.data.transactions.find(t => t.id === this._editingTransferId);
        if (tx) {
          const fromAcc = this.data.accounts.find(a => a.id === from);
          const toAcc = this.data.accounts.find(a => a.id === to);
          const curF = fromAcc ? (fromAcc.currency || 'RSD') : 'RSD';
          const curT = toAcc ? (toAcc.currency || 'RSD') : 'RSD';
          let finalAmountIn = amountIn;
          if (finalAmountIn == null || isNaN(finalAmountIn)) finalAmountIn = this.convertBetweenCurrencies(amountOut, curF, curT);
          if (finalAmountIn == null || isNaN(finalAmountIn)) finalAmountIn = amountOut;
          tx.fromAccountId = from;
          tx.toAccountId = to;
          tx.amount = Math.round(Math.abs(amountOut) * 100) / 100;
          tx.amountIn = Math.round(Math.abs(finalAmountIn) * 100) / 100;
          tx.currency = curF;
          tx.currencyIn = curT;
          tx.date = date;
          tx.note = noteExtra || (fromAcc ? fromAcc.name : '?') + ' → ' + (toAcc ? toAcc.name : '?');
          await this.save();
          this._editingTransferId = null;
        }
      } else {
        const ok = await this.doTransfer(from, to, amountOut, noteExtra, date, amountIn);
        if (!ok) return;
        if (this._transferSourceIds && this._transferSourceIds.length === 2) {
          const src = this._transferSourceIds;
          this._transferSourceIds = null;
          this._mergeIds = null;
          this._bulkSel = new Set();
          this._bulkOnly = false;
          this.data.transactions = this.data.transactions.filter(t => !src.includes(t.id));
          await this.save();
        }
      }
      this.closeModal('transfer-modal');
      this.syncViewToDate(date);
      this.renderPage(this.currentPage);
    });
  },

  openEditTransaction(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) return;
    if (tx.type === 'transfer') { this.openEditTransfer(txId); return; }
    document.getElementById('tx-id').value = tx.id;
    document.getElementById('tx-date').value = this.fmtDateInput(tx.date);
    document.getElementById('tx-type').value = tx.type;
    document.getElementById('tx-amount').value = tx.baseAmount != null ? Math.abs(tx.baseAmount) : Math.abs(tx.amount);
    document.getElementById('tx-currency').value = tx.currency;
    document.getElementById('tx-currency-select').value = tx.nativeCurrency || tx.currency;
    document.getElementById('tx-native-amount').value = tx.nativeAmount != null ? Math.abs(tx.nativeAmount) : '';
    document.getElementById('tx-fee-amount').value = tx.feeAmount != null ? Math.abs(tx.feeAmount) : '';
    document.getElementById('tx-note').value = tx.note || '';
    document.getElementById('tx-account').innerHTML = (tx.cardId
      ? this.accountSelectOptions('card:' + tx.cardId)
      : this.accountSelectOptions(tx.accountId));
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    if (catInput && catHidden) { catHidden.value = tx.categoryId; const cat = this.data.categories.find(c => c.id === tx.categoryId); catInput.value = cat ? cat.name.toUpperCase() : ''; }
    this.openModal('transaction-modal');
    setTimeout(() => document.getElementById('tx-amount').focus(), 50);
    this.initCategoryPicker('tx-category-input', 'tx-category', 'category-dropdown');
    this.bindQuickEntryExtras();
    this.updateTxNativeRow();
    this.updateTxPreview();
  },

  editHoveredTransaction() { if (this.hoveredTxId) this.openEditTransaction(this.hoveredTxId); },

  async deleteTransaction(txId) {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    const removed = this.data.transactions.find(t => t.id === txId);
    this.data.transactions = this.data.transactions.filter(t => t.id !== txId);
    const bp = (this.data.billPayments || []).find(p => p.txId === txId);
    if (bp) {
      this.data.billPayments = this.data.billPayments.filter(p => p !== bp);
      const bill = (this.data.bills || []).find(b => b.id === bp.billId);
      if (bill) bill.active = false;
    }
    try { await this.save(); } catch (e) { if (removed) this.data.transactions.push(removed); }
    this.renderPage(this.currentPage);
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  bulkToggle(id, shiftKey) {
    if (!this._bulkSel) this._bulkSel = new Set();
    if (shiftKey && this._lastBulkTxId && this._lastBulkTxId !== id) {
      const rows = Array.from(document.querySelectorAll('.tx-row'));
      const ids = rows.map(r => { const m = (r.getAttribute('onclick') || '').match(/'([^']+)'/); return m ? m[1] : null; }).filter(Boolean);
      const fromIdx = ids.indexOf(this._lastBulkTxId);
      const toIdx = ids.indexOf(id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx), end = Math.max(fromIdx, toIdx);
        for (let i = start; i <= end; i++) this._bulkSel.add(ids[i]);
      }
    } else {
      const on = !this._bulkSel.has(id);
      if (on) this._bulkSel.add(id); else this._bulkSel.delete(id);
    }
    this._lastBulkTxId = id;
    document.querySelectorAll('.tx-row').forEach(r => {
      const m = (r.getAttribute('onclick') || '').match(/'([^']+)'/);
      if (m) r.classList.toggle('bulk-selected', this._bulkSel.has(m[1]));
    });
    const wrap = document.querySelector('.tx-list-wrap');
    if (wrap) { const sc = wrap.scrollTop; this.renderOverview(); const nw = document.querySelector('.tx-list-wrap'); if (nw) nw.scrollTop = sc; }
  },

  bulkClear() {
    this._bulkSel = new Set();
    this._bulkOnly = false;
    this.renderPage(this.currentPage);
  },

  openBulkEdit() {
    if (!this._bulkSel || !this._bulkSel.size) return;
    const catSel = document.getElementById('bulk-category');
    const accSel = document.getElementById('bulk-account');
    catSel.innerHTML = '<option value="">-- keep current --</option>' + this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
    accSel.innerHTML = '<option value="">-- keep current --</option>' + this.visibleAccounts().map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + '</option>').join('');
    catSel.value = ''; accSel.value = '';
    document.getElementById('bulk-count-title').textContent = 'Bulk Edit \u00b7 ' + this._bulkSel.size + ' transaction' + (this._bulkSel.size === 1 ? '' : 's');
    const dates = Array.from(this._bulkSel).map(id => this.data.transactions.find(t => t.id === id)?.date).filter(Boolean);
    const uniqueDates = [...new Set(dates)];
    const dateInput = document.getElementById('bulk-date-smart');
    const hintEl = document.getElementById('bulk-date-hint');
    dateInput.value = '';
    dateInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('bulk-edit-form').requestSubmit(); } };
    if (uniqueDates.length === 1) {
      dateInput.value = this.fmtDateInput(uniqueDates[0]);
      hintEl.textContent = 'All selected share this date. Enter offset (-10) or new date (5/8/2025).';
    } else if (uniqueDates.length > 1) {
      hintEl.textContent = 'Multiple Dates (' + uniqueDates.length + ' different). Enter offset (-10) or new date (5/8/2025) to set all.';
    } else {
      hintEl.textContent = 'Enter offset (-10) or new date (5/8/2025).';
    }
    this.openModal('bulk-edit-modal');
  },

  async submitBulkEdit() {
    const catId = document.getElementById('bulk-category').value;
    const accId = document.getElementById('bulk-account').value;
    const smartDate = document.getElementById('bulk-date-smart').value;
    const parsed = this.parseSmartDate(smartDate);
    if (!catId && !accId && parsed.type === 'none') {
      await this.confirmModal({ title: 'Bulk Edit', message: 'Choose a category, account, or date adjustment to apply.', danger: false });
      return;
    }
    if (parsed.type === 'invalid') {
      await this.confirmModal({ title: 'Bulk Edit', message: 'Invalid date format: ' + parsed.raw, danger: false });
      return;
    }
    if (!this._bulkSel || this._bulkSel.size === 0) {
      await this.confirmModal({ title: 'Bulk Edit', message: 'No transactions selected. Click rows to select, then press E.', danger: false });
      return;
    }
    let changed = 0;
    for (const t of this.data.transactions) {
      if (!this._bulkSel.has(t.id)) continue;
      if (catId) t.categoryId = catId;
      if (accId && !t.cardId) { t.accountId = accId; }
      if (parsed.type === 'offset') {
        t.date = this.shiftDate(t.date, parsed.value);
      } else if (parsed.type === 'exact') {
        t.date = parsed.value;
      }
      changed++;
    }
    if (changed === 0) {
      await this.confirmModal({ title: 'Bulk Edit', message: 'Selected transactions not found in data (' + this._bulkSel.size + ' selected).', danger: false });
      return;
    }
    await this.save();
    this.closeModal('bulk-edit-modal');
    this.bulkClear();
    await this.confirmModal({ title: 'Bulk Edit', message: 'Updated ' + changed + ' transaction' + (changed === 1 ? '' : 's') + '.', danger: false });
  },

  async bulkDelete() {
    const n = this._bulkSel ? this._bulkSel.size : 0;
    if (!n) return;
    if (!(await this.confirmModal({ title: 'Delete Transactions', message: 'Delete ' + n + ' selected transaction' + (n === 1 ? '' : 's') + '?' }))) return;
    this.data.transactions = this.data.transactions.filter(t => !this._bulkSel.has(t.id));
    await this.save();
    this.bulkClear();
  },

  openMergeModal() {
    const ids = this._bulkSel ? Array.from(this._bulkSel) : [];
    if (ids.length < 2) {
      this.confirmModal({ title: 'Merge Transactions', message: 'Select at least 2 transactions to merge (click rows to select, then press M).', danger: false });
      return;
    }
    const txs = this.data.transactions.filter(t => ids.includes(t.id));
    const accMap = Object.fromEntries((this.data.accounts || []).map(a => [a.id, a]));
    const catMap = Object.fromEntries((this.data.categories || []).map(c => [c.id, c]));
    const curs = new Set(txs.map(t => t.currency || 'RSD'));
    const accs = new Set(txs.map(t => t.cardId ? ('card:' + t.cardId) : (t.accountId || '')));
    this._mergeIds = txs.map(t => t.id);
    this._mergeCurrency = txs[0].currency || 'RSD';
    this._mergeOk = curs.size === 1 && accs.size === 1;
    this._mergeSelected = 0;
    let list = '<div style="max-height:280px;overflow:auto;">';
    txs.forEach((t, i) => {
      const acc = t.cardId ? (this.data.creditCards || []).find(c => c.id === t.cardId) : accMap[t.accountId];
      const cat = catMap[t.categoryId];
      list += '<div class="merge-row' + (i === 0 ? ' merge-target' : '') + '" data-idx="' + i + '" onclick="BlackBook.selectMergeTarget(' + i + ')">' +
        '<span class="merge-radio"></span>' +
        '<span class="merge-date">' + this.escapeHtml(t.date) + '</span>' +
        '<span class="merge-cat" style="color:' + (cat ? BlackBook.categoryColor(cat) : 'var(--text-muted)') + '">' + this.escapeHtml(cat ? cat.name : 'Uncategorized') + '</span>' +
        '<span class="merge-acct">' + this.escapeHtml(acc ? acc.name : '?') + '</span>' +
        '<span class="merge-note">' + this.escapeHtml(t.note || '') + '</span>' +
        '<span class="merge-amt">' + this.fmtAmount(t.amount, this._mergeCurrency) + '</span></div>';
    });
    list += '</div>';
    document.getElementById('merge-list').innerHTML = list;
    document.getElementById('merge-title').textContent = 'Merge Transactions \u00b7 ' + txs.length;
    this.renderMergeSummary();
    if (txs.length === 2) {
      document.getElementById('merge-summary').insertAdjacentHTML('beforeend', '<div style="color:var(--text-muted);margin-top:4px;">Tip: you can also convert these into a transfer between their accounts.</div>');
    }
    if (!this._mergeOk) {
      document.getElementById('merge-summary').insertAdjacentHTML('beforeend', '<div style="color:var(--expense);margin-top:4px;">Cannot merge: transactions use different currencies or accounts/cards. Select a matching group.</div>');
    }
    this.openModal('merge-modal');
    const trBtn = document.getElementById('merge-transfer-btn');
    if (trBtn) trBtn.style.display = (txs.length === 2) ? '' : 'none';
  },

  selectMergeTarget(idx) {
    this._mergeSelected = idx;
    document.querySelectorAll('#merge-list .merge-row').forEach((r, i) => r.classList.toggle('merge-target', i === idx));
    this.renderMergeSummary();
  },

  renderMergeSummary() {
    if (!this._mergeIds) return;
    const txs = this.data.transactions.filter(t => this._mergeIds.includes(t.id));
    const el = document.getElementById('merge-summary');
    if (!el) return;
    const sum = Math.round(txs.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
    const notes = txs.map(t => (t.note || '').trim()).filter(Boolean);
    const tgt = txs[this._mergeSelected];
    const accMap = Object.fromEntries((this.data.accounts || []).map(a => [a.id, a]));
    const catMap = Object.fromEntries((this.data.categories || []).map(c => [c.id, c]));
    const acc = tgt.cardId ? (this.data.creditCards || []).find(c => c.id === tgt.cardId) : accMap[tgt.accountId];
    const cat = catMap[tgt.categoryId];
    el.innerHTML = 'Target: <b>' + this.escapeHtml(tgt.date) + '</b> ' + this.escapeHtml(cat ? cat.name : 'Uncategorized') +
      ' / ' + this.escapeHtml(acc ? acc.name : '?') +
      ' &middot; Combined total: <b>' + this.fmtAmount(sum, this._mergeCurrency) + '</b> (' + txs.length + ' into 1)' +
      (notes.length ? ' &middot; Note: "' + this.escapeHtml(notes.join('; ')) + '"' : '');
  },

  async submitMerge() {
    if (!this._mergeIds || this._mergeIds.length < 2) return;
    if (!this._mergeOk) { alert('Cannot merge: transactions use different currencies or accounts.'); return; }
    const txs = this.data.transactions.filter(t => this._mergeIds.includes(t.id));
    const tgt = txs[this._mergeSelected];
    if (!tgt) return;
    const sum = Math.round(txs.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
    const notes = txs.map(t => (t.note || '').trim()).filter(Boolean);
    tgt.amount = sum;
    tgt.note = notes.join('; ');
    delete tgt.nativeAmount; delete tgt.nativeCurrency; delete tgt.baseAmount; delete tgt.feeAmount;
    const keep = tgt.id;
    this.data.transactions = this.data.transactions.filter(t => t.id === keep || !this._mergeIds.includes(t.id));
    await this.save();
    this.closeModal('merge-modal');
    this.bulkClear();
    alert('Merged ' + this._mergeIds.length + ' transactions into 1 (' + this.fmtAmount(sum, this._mergeCurrency) + ').');
  },

  mergeAsTransfer() {
    if (!this._mergeIds || this._mergeIds.length !== 2) return;
    const txs = this.data.transactions.filter(t => this._mergeIds.includes(t.id));
    if (txs.length !== 2) return;
    const accMap = Object.fromEntries((this.data.accounts || []).map(a => [a.id, a]));
    const accs = txs.map(t => accMap[t.accountId]);
    const exp = txs.find(t => (t.amount || 0) < 0);
    const inc = txs.find(t => (t.amount || 0) > 0);
    const reason = txs.some(t => t.cardId) ? 'one of the selected transactions is on a credit card.' :
      (!accs[0] || !accs[1] || accs[0].id === accs[1].id) ? 'the two transactions must be on different accounts.' :
      (!exp || !inc) ? 'one transaction must be an expense and one an income.' : null;
    if (reason) { alert('Cannot convert to transfer: ' + reason); return; }
    this._transferSourceIds = [exp.id, inc.id];
    const fromAcc = accMap[exp.accountId];
    const toAcc = accMap[inc.accountId];
    const opts = this.data.accounts.filter(a => a.type !== 'credit' && a.type !== 'creditcard').map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + ' (' + (a.currency || 'RSD') + ')</option>').join('');
    const fSel = document.getElementById('tr-from');
    const tSel = document.getElementById('tr-to');
    fSel.innerHTML = opts;
    tSel.innerHTML = opts;
    fSel.value = fromAcc.id;
    tSel.value = toAcc.id;
    const amtOut = document.getElementById('tr-amount');
    const amtIn = document.getElementById('tr-amount-in');
    amtOut.value = Math.abs(exp.amount);
    amtOut.dispatchEvent(new Event('input'));
    if ((inc.currency || 'RSD') === (toAcc.currency || 'RSD')) amtIn.value = Math.abs(inc.amount);
    const tgt = txs[this._mergeSelected] || exp;
    document.getElementById('tr-date').value = this.fmtDateInput(tgt.date);
    document.getElementById('tr-note').value = txs.map(t => (t.note || '').trim()).filter(Boolean).join('; ');
    this._transferNoteBase = this.transferNoteBase();
    this.updateTransferNote();
    this.updateTransferCurrencyLabels();
    this.closeModal('merge-modal');
    this.openModal('transfer-modal');
    setTimeout(() => amtOut.focus(), 50);
  },

  bindModalSubmit() {
    const form = document.getElementById('transaction-form');
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); form.requestSubmit(); }
    });
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('tx-id').value;
      const rawParsed = this.evalAmount(document.getElementById('tx-amount').value);
      if (isNaN(rawParsed)) { alert('Please enter a valid amount.'); return; }
      const txDate = this.parseDateInput(document.getElementById('tx-date').value);
      if (!txDate) { alert('Enter a valid date (DD/MM/YYYY).'); return; }
      const rawAmt = Math.abs(Math.round(rawParsed * 100) / 100);
      const txType = document.getElementById('tx-type').value;
      const accountVal = document.getElementById('tx-account').value;
      if (!accountVal) { alert('Select an account first.'); return; }
      const txData = { date: txDate, type: txType, amount: txType === 'income' ? rawAmt : -rawAmt, currency: document.getElementById('tx-currency-select').value, accountId: accountVal.startsWith('card:') ? null : accountVal, categoryId: document.getElementById('tx-category').value, note: document.getElementById('tx-note').value };
      if (!accountVal.startsWith('card:') && txData.currency && txData.currency !== 'RSD') {
        const acc = this.data.accounts.find(a => a.id === accountVal);
        const accCur = (acc && acc.currency) || 'RSD';
        if (accCur === 'RSD') {
          const nativeEl = document.getElementById('tx-native-amount');
          const nativeVal = nativeEl && nativeEl.value.trim() ? this.evalAmount(nativeEl.value) : null;
          const fee = (acc && acc.foreignFee) || 0;
          if (nativeVal > 0) {
            txData.nativeAmount = txType === 'income' ? Math.round(nativeVal * 100) / 100 : -Math.round(nativeVal * 100) / 100;
            txData.nativeCurrency = txData.currency;
          }
          const feeEl = document.getElementById('tx-fee-amount');
          const manualFee = feeEl && feeEl.value.trim() ? this.evalAmount(feeEl.value) : null;
          if (fee > 0 || manualFee > 0) {
            let feeRsd;
            if (manualFee != null) {
              feeRsd = this.round2(manualFee);
            } else {
              const nativeAbs = nativeVal > 0 ? nativeVal : (this.convertBetweenCurrencies(rawAmt, 'RSD', txData.currency) || 0);
              feeRsd = this.calcForeignFee(nativeAbs, fee, txData.currency).feeRsd;
            }
            txData.amount = txType === 'income' ? this.round2(rawAmt + feeRsd) : -this.round2(rawAmt + feeRsd);
            txData.baseAmount = rawAmt;
            txData.feeAmount = feeRsd;
          } else {
            txData.amount = txType === 'income' ? rawAmt : -rawAmt;
          }
          txData.currency = accCur;
        }
      } else {
        delete txData.nativeAmount;
        delete txData.nativeCurrency;
        delete txData.baseAmount;
        delete txData.feeAmount;
      }
      const orig = id ? this.data.transactions.find(t => t.id === id) : null;
      if (orig && orig.cardId) { txData.cardId = orig.cardId; txData.accountId = null; }
      else if (accountVal.startsWith('card:')) { txData.cardId = accountVal.slice(5); }
      if (id) { const tx = this.data.transactions.find(t => t.id === id); if (tx) Object.assign(tx, txData); }
      else {
        txData.id = crypto.randomUUID(); this.data.transactions.push(txData);
      }
      this.syncViewToDate(txData.date);
      const wrap = document.querySelector('.tx-list-wrap');
      const scrollTop = wrap ? wrap.scrollTop : 0;
      await this.save(); this.closeModal('transaction-modal'); this.renderPage(this.currentPage);
      const nw = document.querySelector('.tx-list-wrap');
      if (nw) nw.scrollTop = scrollTop;
    });
  },

});
})();
