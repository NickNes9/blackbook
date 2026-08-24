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
    document.getElementById('tx-date').value = this.fmtDateInput(this.today());
    document.getElementById('tx-type').value = 'expense';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    const cardPrefill = targetId && String(targetId).startsWith('card:') ? targetId : null;
    const defaultAccountId = targetId || this.selectedAccount || '';
    const accSelect = document.getElementById('tx-account');
    accSelect.innerHTML = (defaultAccountId ? '' : '<option value="">-- SELECT ACCOUNT --</option>') + (this.accountSelectOptions(defaultAccountId) || '<option value="">no accounts</option>');
    const selAcc = cardPrefill ? null : this.data.accounts.find(a => a.id === defaultAccountId);
    document.getElementById('tx-currency').value = selAcc ? (selAcc.currency || 'RSD') : 'RSD';
    const defaultCatId = this.data.settings.defaultCategoryId || (this.data.categories[0] && this.data.categories[0].id) || '';
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    const defaultCat = this.data.categories.find(c => c.id === defaultCatId);
    if (catInput && catHidden) { catHidden.value = defaultCatId; catInput.value = defaultCat ? defaultCat.name.toUpperCase() : ''; }
    const amountInput = document.getElementById('tx-amount');
    amountInput.oninput = () => { document.getElementById('tx-type').value = amountInput.value.trim().startsWith('+') ? 'income' : 'expense'; };
    this.openModal('transaction-modal');
    setTimeout(() => amountInput.focus(), 50);
    this.initCategoryPicker();
    this.bindQuickEntryExtras();
    const form = document.getElementById('transaction-form');
    if (!form._enterBound) { form._enterBound = true; form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); form.requestSubmit(); } }); }
  },

  bindQuickEntryExtras() {
    if (this._quickEntryExtrasBound) return;
    this._quickEntryExtrasBound = true;
    document.getElementById('tx-account').addEventListener('change', (e) => {
      const v = String(e.target.value);
      if (v.startsWith('card:')) {
        document.getElementById('tx-currency').value = 'RSD';
      } else {
        const acc = this.data.accounts.find(a => a.id === v);
        document.getElementById('tx-currency').value = acc ? (acc.currency || 'RSD') : 'RSD';
      }
    });
  },

  openTransferModal() {
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
    document.getElementById('tr-note').value = '';
    document.getElementById('tr-date').value = this.fmtDateInput(this.today());
    this.updateTransferCurrencyLabels();
    this.openModal('transfer-modal');
    setTimeout(() => document.getElementById('tr-amount').focus(), 50);
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
    const noteBase = 'Transfer ' + fromAcc.name + ' \u2192 ' + toAcc.name + (noteExtra ? ' \u00b7 ' + noteExtra : '');
    this.data.transactions.unshift({
      id: 'tx-' + Date.now() + '-a', type: 'expense', amount: -Math.abs(Math.round(amountOut * 100) / 100), currency: curF,
      accountId: fromId, categoryId: cat.id, date: date, note: noteBase, pairId: pairId
    });
    this.data.transactions.unshift({
      id: 'tx-' + Date.now() + '-b', type: 'income', amount: Math.abs(Math.round(amountIn * 100) / 100), currency: curT,
      accountId: toId, categoryId: cat.id, date: date, note: noteBase, pairId: pairId
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
      const ok = await this.doTransfer(from, to, amountOut, noteExtra, date, amountIn);
      if (!ok) return;
      this.closeModal('transfer-modal');
      this.syncViewToDate(date);
      this.renderPage(this.currentPage);
    });
  },

  openEditTransaction(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) return;
    document.getElementById('tx-id').value = tx.id;
    document.getElementById('tx-date').value = this.fmtDateInput(tx.date);
    document.getElementById('tx-type').value = tx.type;
    document.getElementById('tx-amount').value = Math.abs(tx.amount);
    document.getElementById('tx-currency').value = tx.currency;
    document.getElementById('tx-note').value = tx.note || '';
    document.getElementById('tx-account').innerHTML = (tx.cardId
      ? this.accountSelectOptions('card:' + tx.cardId)
      : this.accountSelectOptions(tx.accountId));
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    if (catInput && catHidden) { catHidden.value = tx.categoryId; const cat = this.data.categories.find(c => c.id === tx.categoryId); catInput.value = cat ? cat.name.toUpperCase() : ''; }
    this.openModal('transaction-modal');
    setTimeout(() => document.getElementById('tx-amount').focus(), 50);
    this.initCategoryPicker();
    this.bindQuickEntryExtras();
  },

  editHoveredTransaction() { if (this.hoveredTxId) this.openEditTransaction(this.hoveredTxId); },

  async deleteTransaction(txId) {
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
  },

  bulkToggle(id) {
    if (!this._bulkSel) this._bulkSel = new Set();
    const on = !this._bulkSel.has(id);
    if (on) this._bulkSel.add(id); else this._bulkSel.delete(id);
    document.querySelectorAll('.tx-row').forEach(r => {
      const m = (r.getAttribute('onclick') || '').match(/'([^']+)'/);
      if (m && m[1] === id) r.classList.toggle('bulk-selected', on);
    });
    const wrap = document.querySelector('.tx-list-wrap');
    if (wrap) { const sc = wrap.scrollTop; this.renderOverview(); wrap.scrollTop = sc; }
  },

  bulkClear() {
    this._bulkSel = new Set();
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
    this.openModal('bulk-edit-modal');
  },

  async submitBulkEdit() {
    const catId = document.getElementById('bulk-category').value;
    const accId = document.getElementById('bulk-account').value;
    if (!catId && !accId) { alert('Choose a category or an account to apply.'); return; }
    let changed = 0;
    for (const t of this.data.transactions) {
      if (!this._bulkSel.has(t.id)) continue;
      if (catId) t.categoryId = catId;
      if (accId && !t.cardId) { t.accountId = accId; }
      changed++;
    }
    await this.save();
    this.closeModal('bulk-edit-modal');
    this.bulkClear();
    alert('Updated ' + changed + ' transaction' + (changed === 1 ? '' : 's') + '.');
  },

  async bulkDelete() {
    const n = this._bulkSel ? this._bulkSel.size : 0;
    if (!n) return;
    if (!confirm('Delete ' + n + ' selected transaction' + (n === 1 ? '' : 's') + '?')) return;
    this.data.transactions = this.data.transactions.filter(t => !this._bulkSel.has(t.id));
    await this.save();
    this.bulkClear();
  },

  bindModalSubmit() {
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('tx-id').value;
      const rawParsed = this.evalAmount(document.getElementById('tx-amount').value);
      if (isNaN(rawParsed)) { alert('Please enter a valid amount.'); return; }
      const txDate = this.parseDateInput(document.getElementById('tx-date').value);
      if (!txDate) { alert('Enter a valid date (DD.MM.YYYY).'); return; }
      const rawAmt = Math.abs(Math.round(rawParsed * 100) / 100);
      const txType = document.getElementById('tx-type').value;
      const accountVal = document.getElementById('tx-account').value;
      if (!accountVal) { alert('Select an account first.'); return; }
      const txData = { date: txDate, type: txType, amount: txType === 'income' ? rawAmt : -rawAmt, currency: document.getElementById('tx-currency').value, accountId: accountVal.startsWith('card:') ? null : accountVal, categoryId: document.getElementById('tx-category').value, note: document.getElementById('tx-note').value };
      const orig = id ? this.data.transactions.find(t => t.id === id) : null;
      if (orig && orig.cardId) { txData.cardId = orig.cardId; txData.accountId = null; }
      else if (accountVal.startsWith('card:')) { txData.cardId = accountVal.slice(5); }
      if (id) { const tx = this.data.transactions.find(t => t.id === id); if (tx) Object.assign(tx, txData); }
      else {
        txData.id = crypto.randomUUID(); this.data.transactions.push(txData);
      }
      this.syncViewToDate(txData.date);
      await this.save(); this.closeModal('transaction-modal'); this.renderPage(this.currentPage);
    });
  },

  initCategoryPicker() {
    if (this._catPickBound) return;
    const input = document.getElementById('tx-category-input');
    const hidden = document.getElementById('tx-category');
    const dropdown = document.getElementById('category-dropdown');
    if (!input || !dropdown) return;
    this._catPickBound = true;

    const sortedCats = () => this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    const closeDropdown = () => dropdown.classList.add('hidden');
    const pick = (cat) => {
      if (!cat) return;
      input.value = cat.name.toUpperCase();
      hidden.value = cat.id;
      input.classList.remove('pick-empty');
      closeDropdown();
    };
    const cycle = (dir) => {
      const cats = sortedCats();
      if (!cats.length) return;
      const idx = cats.findIndex(c => c.id === hidden.value);
      const next = idx < 0 ? (dir > 0 ? 0 : cats.length - 1) : (idx + dir + cats.length) % cats.length;
      pick(cats[next]);
    };

    input.addEventListener('click', openDropdown);
    input.addEventListener('focus', openDropdown);

    function openDropdown() {
      const cats = sortedCats();
      dropdown.innerHTML = cats.length ? cats.map(c =>
        '<div class="category-dropdown-item' + (c.id === hidden.value ? ' active' : '') + '" data-id="' + c.id + '"><span class="cat-dot" style="background:' + c.color + ';"></span>' + BlackBook.escapeHtml(c.name) + '</div>'
      ).join('') : '<div class="category-dropdown-empty">No categories yet</div>';
      const act = dropdown.querySelector('.category-dropdown-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
      dropdown.classList.remove('hidden');
    }

    input.addEventListener('wheel', (e) => { e.preventDefault(); cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cycle(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycle(-1); }
      else if (e.key === 'Escape') {
        if (!dropdown.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); }
        closeDropdown();
      } else if (e.key === 'Enter' && !dropdown.classList.contains('hidden')) {
        e.preventDefault(); e.stopPropagation(); closeDropdown();
      }
    });

    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.category-dropdown-item');
      if (!item || !item.dataset.id) return;
      pick(this.data.categories.find(c => c.id === item.dataset.id));
    });

    document.addEventListener('pointerdown', (e) => {
      if (dropdown.classList.contains('hidden')) return;
      const root = document.getElementById('category-autocomplete');
      if (!root || !root.contains(e.target)) closeDropdown();
    });
  },
});
})();
