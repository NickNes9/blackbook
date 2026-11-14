(function () {
Object.assign(window.BlackBook, {
  transferSettlementFieldsChanged(existing, proposed) {
    const effectiveOld = {
      ...existing,
      amountIn: existing.amountIn == null ? existing.amount : existing.amountIn,
      currencyIn: existing.currencyIn || existing.currency
    };
    return ['fromAccountId', 'toAccountId', 'amount', 'amountIn', 'currency', 'currencyIn', 'date']
      .some(key => effectiveOld[key] !== proposed[key]);
  },

  transactionSettlementFieldsChanged(existing, proposed) {
    const optional = new Set(['accountId', 'cardId', 'nativeAmount', 'nativeCurrency']);
    return ['date', 'type', 'amount', 'currency', 'accountId', 'cardId', 'nativeAmount', 'nativeCurrency']
      .some(key => optional.has(key)
        ? (existing[key] ?? null) !== (proposed[key] ?? null)
        : existing[key] !== proposed[key]);
  },

  accountSelectOptions(selectedVal) {
    const opts = this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === selectedVal ? ' selected' : '') + '>' + this.escapeHtml(a.name) + (a.currency && a.currency !== this.baseCurrency() ? ' (' + a.currency + ')' : '') + '</option>');
    for (const c of (this.data.creditCards || [])) {
      opts.push('<option value="card:' + c.id + '"' + ('card:' + c.id === selectedVal ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>');
    }
    return opts.join('');
  },

  recurringCategoryFor(note, source) {
    const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const rule = (this.data.recurringRules || []).find(item => item && item.active !== false && item.action === 'category' && item.categoryId && item.match && normalize(note).includes(normalize(item.match)) && (!item.source || item.source === source));
    return rule ? rule.categoryId : null;
  },

  setTransactionSplitMode(enabled, parts = [], remainderEnabled = null) {
    const sourceParts = Array.isArray(parts) ? parts : [];
    const remainder = sourceParts.find(part => part && part.autoRemainder);
    this._txSplitEnabled = !!enabled;
    this._txSplitRemainderEnabled = !!enabled && (!!remainder || !!remainderEnabled);
    this._txSplitRemainderId = remainder && remainder.id || '';
    this._txSplitRemainderCategoryId = remainder && remainder.categoryId || (enabled && remainderEnabled ? sourceParts.find(part => part && !part.autoRemainder)?.categoryId || '' : '');
    this._txSplitParts = enabled ? sourceParts.filter(part => part && !part.autoRemainder).map(part => ({
      id: part.id || crypto.randomUUID(),
      description: String(part.description || ''),
      categoryId: part.categoryId || '',
      quantity: part.quantity == null ? '1' : String(part.quantity),
      quantitySpecified: part.quantitySpecified == null ? Number(part.quantity) > 1 : !!part.quantitySpecified,
      unitAmount: part.unitAmount == null ? (part.amount == null ? '' : String(Math.abs(Number(part.amount) || 0))) : String(Math.abs(Number(part.unitAmount) || 0)),
      amount: part.amount == null || String(part.amount).trim() === '' ? '' : String(Math.abs(Number(part.amount) || 0)),
      amountMode: part.amountMode === 'total' || (part.amountMode !== 'unit' && part.unitAmount == null && part.amount != null) ? 'total' : 'unit',
      personIds: [...new Set(Array.isArray(part.personIds) ? part.personIds : [])]
    })) : [];
    this.renderTransactionSplitEditor();
  },

  readTransactionSplitPart(index, part) {
    const row = document.querySelector('#tx-split-rows [data-split-index="' + index + '"]');
    const quantityInput = row && row.querySelector('.tx-split-quantity');
    const unitInput = row && row.querySelector('.tx-split-unit-amount');
    const totalInput = row && row.querySelector('.tx-split-line-total');
    const descriptionInput = document.getElementById('tx-split-description-' + index);
    const categoryInput = row && row.querySelector('.tx-split-category');
    const quantityRaw = String(quantityInput ? quantityInput.value : part.quantity == null ? '1' : part.quantity).trim();
    const unitRaw = String(unitInput ? unitInput.value : part.unitAmount == null ? '' : part.unitAmount).trim();
    const amountRaw = String(totalInput ? totalInput.value : part.amount == null ? '' : part.amount).trim();
    const quantity = quantityRaw ? this.evalAmount(quantityRaw) : NaN;
    const amountMode = part.amountMode === 'total' ? 'total' : 'unit';
    const validQuantity = Number.isFinite(quantity) && quantity > 0;
    let unitAmount = unitRaw ? this.evalAmount(unitRaw) : NaN;
    let unitCents = null;
    let lineCents = null;
    let valid = false;
    if (amountMode === 'total') {
      const enteredTotal = amountRaw ? this.evalAmount(amountRaw) : NaN;
      if (validQuantity && Number.isFinite(enteredTotal) && enteredTotal > 0) {
        lineCents = Math.round(Math.abs(enteredTotal) * 100);
        unitAmount = lineCents > 0 ? lineCents / 100 / quantity : NaN;
        valid = lineCents > 0 && Number.isFinite(unitAmount) && unitAmount > 0;
      }
    } else if (validQuantity && Number.isFinite(unitAmount) && unitAmount > 0) {
      unitCents = Math.round(Math.abs(unitAmount) * 100);
      lineCents = Math.round(unitCents * quantity);
      unitAmount = unitCents / 100;
      valid = lineCents > 0;
    }
    return {
      quantityRaw, unitRaw, amountRaw, quantity, unitAmount, unitCents, lineCents, amountMode, valid,
      description: String(descriptionInput ? descriptionInput.value : part.description || '').trim(),
      categoryId: categoryInput ? categoryInput.value || null : part.categoryId || null,
      lineTotal: valid ? lineCents / 100 : null
    };
  },
  sanitizeTransactionNumber(value, allowOperators = false) {
    const raw = String(value == null ? '' : value).replace(
      allowOperators ? /[^0-9.,+\-*\/()]/g : /[^0-9.,]/g,
      ''
    );
    if (allowOperators) {
      return raw.replace(/,/g, '.').replace(/[0-9.]+/g, token => {
        const decimal = token.indexOf('.');
        return decimal < 0 ? token : token.slice(0, decimal + 1) + token.slice(decimal + 1).replace(/\./g, '');
      });
    }
    const separator = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
    if (separator < 0) return raw;
    const whole = raw.slice(0, separator).replace(/[.,]/g, '');
    const fraction = raw.slice(separator + 1).replace(/[.,]/g, '');
    return whole + '.' + fraction;
  },

  bindTransactionNumericInput(input, allowOperators = false) {
    if (!input || input.dataset.numericOnlyBound === 'true') return;
    input.dataset.numericOnlyBound = 'true';
    const invalidCharacter = allowOperators ? /[^0-9.,+\-*\/()]/ : /[^0-9.,]/;
    input.addEventListener('beforeinput', event => {
      if (event.data && invalidCharacter.test(event.data)) event.preventDefault();
    });
    input.addEventListener('paste', event => {
      const pasted = event.clipboardData && event.clipboardData.getData('text');
      if (typeof pasted !== 'string') return;
      const cleaned = this.sanitizeTransactionNumber(pasted, allowOperators);
      if (cleaned === pasted) return;
      event.preventDefault();
      const start = input.selectionStart == null ? input.value.length : input.selectionStart;
      const end = input.selectionEnd == null ? start : input.selectionEnd;
      input.setRangeText(cleaned, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.addEventListener('input', event => {
      const target = event.currentTarget;
      const original = target.value;
      const start = target.selectionStart == null ? original.length : target.selectionStart;
      const cleaned = this.sanitizeTransactionNumber(original, allowOperators);
      if (cleaned === original) return;
      const caret = this.sanitizeTransactionNumber(original.slice(0, start), allowOperators).length;
      target.value = cleaned;
      if (typeof target.setSelectionRange === 'function') target.setSelectionRange(caret, caret);
    }, true);
  },
  async toggleTransactionSplit() {
    if (this._txSplitEnabled) {
      this.updateTransactionSplitStatus();
      const baseCategoryId = document.getElementById('tx-category').value || '';
      const totalAmount = this.evalAmount(document.getElementById('tx-amount').value);
      const hasEnteredData = (this._txSplitParts || []).some((part, index) => {
        const line = this.readTransactionSplitPart(index, part);
        const people = this.transactionPeopleDraft('tx-split-description-' + index);
        const defaultFirstAmount = index === 0 && line.valid && Math.round(line.lineCents) === Math.round(Math.abs(totalAmount) * 100) &&
          !line.description && (line.categoryId || '') === baseCategoryId && Math.abs(line.quantity - 1) < 0.000001 && !people.length;
        return line.description || (line.categoryId || '') !== baseCategoryId || people.length || ((line.unitRaw || line.amountRaw) && !defaultFirstAmount) ||
          (line.quantityRaw && Math.abs((Number.isFinite(line.quantity) ? line.quantity : 1) - 1) > 0.000001);
      });
      const hasTotal = Number.isFinite(totalAmount) && Math.round(Math.abs(totalAmount) * 100) > 0;
      if (hasEnteredData && hasTotal && !(await this.confirmModal({ title: 'Remove split', message: 'This will turn the itemized parts back into one transaction. The first part’s category will be kept.', confirmText: 'Remove split', danger: true }))) return;
      const first = (this._txSplitParts || [])[0];
      if (first) {
        const category = this.data.categories.find(item => item.id === first.categoryId);
        document.getElementById('tx-category').value = first.categoryId || '';
        document.getElementById('tx-category-input').value = category ? this.categoryLabel(category).toUpperCase() : '';
        this._peopleDrafts ||= {};
        this._peopleDrafts['tx-note'] = [...new Set([...this.transactionPeopleDraft('tx-note'), ...(this._txSplitParts || []).flatMap(part => part.personIds || [])])];
        this.renderPeopleEntry('tx-note');
      }
      this.setTransactionSplitMode(false);
      return;
    }
    const categoryId = document.getElementById('tx-category').value || '';
    const entered = this.evalAmount(document.getElementById('tx-amount').value);
    const hasAmount = Number.isFinite(entered) && entered > 0;
    const initialAmount = hasAmount ? String(Math.abs(entered)) : '';
    const noteInput = document.getElementById('tx-note');
    const description = noteInput ? noteInput.value : '';
    const personIds = this.transactionPeopleDraft('tx-note');
    this._peopleDrafts ||= {};
    this._peopleDrafts['tx-note'] = [];
    if (noteInput) noteInput.value = '';
    this.setTransactionSplitMode(true, [
      { id: crypto.randomUUID(), description, categoryId, quantity: '1', quantitySpecified: false, unitAmount: initialAmount, amount: initialAmount, amountMode: hasAmount ? 'total' : 'unit', personIds }
    ], false);
    this.renderPeopleEntry('tx-note');
  },

  toggleTransactionSplitRemainder() {
    if (!this._txSplitEnabled) return;
    this.updateTransactionSplitStatus();
    const total = this.evalAmount(document.getElementById('tx-amount').value);
    if (!this._txSplitRemainderEnabled) {
      const first = (this._txSplitParts || [])[0];
      this._txSplitRemainderEnabled = true;
      this._txSplitRemainderId ||= crypto.randomUUID();
      this._txSplitRemainderCategoryId = document.getElementById('tx-category').value || first && first.categoryId || '';
    } else {
      if (!Number.isFinite(total) || total <= 0) {
        this._txSplitRemainderEnabled = false;
        this._txSplitRemainderId = '';
        this._txSplitRemainderCategoryId = '';
        this.renderTransactionSplitEditor();
        return;
      }
      const amountCents = Math.round(Math.abs(total || 0) * 100);
      const allocatedCents = (this._txSplitParts || []).reduce((sum, part, index) => {
        const line = this.readTransactionSplitPart(index, part);
        return sum + (line.valid ? line.lineCents : 0);
      }, 0);
      const remainingCents = amountCents - allocatedCents;
      if (remainingCents < 0) {
        this.showToast(remainingCents < 0 ? 'Itemized amounts exceed the total. Adjust them before turning off auto remainder.' : 'Enter the full transaction total first.');
        return;
      }
      if (remainingCents > 0) this._txSplitParts.push({
        id: this._txSplitRemainderId || crypto.randomUUID(), description: 'Other items',
        categoryId: this._txSplitRemainderCategoryId || document.getElementById('tx-category').value || '',
        quantity: '1', unitAmount: (remainingCents / 100).toFixed(2), amount: (remainingCents / 100).toFixed(2), amountMode: 'unit', personIds: []
      });

      this._txSplitRemainderEnabled = false;
      this._txSplitRemainderId = '';
      this._txSplitRemainderCategoryId = '';
    }
    this.renderTransactionSplitEditor();
  },

  addTransactionSplitPart() {
    this._txSplitParts ||= [];
    this._txSplitParts.push({ id: crypto.randomUUID(), description: '', categoryId: document.getElementById('tx-category').value || '', quantity: '1', quantitySpecified: false, unitAmount: '', amount: '', amountMode: 'unit', personIds: [] });
    this.renderTransactionSplitEditor();
  },

  removeTransactionSplitPart(index) {
    if (!this._txSplitParts || this._txSplitParts.length <= 1) {
      this.showToast('Keep at least one itemized part.');
      return;
    }
    this._txSplitParts.splice(index, 1);
    this.renderTransactionSplitEditor();
  },

  renderTransactionSplitEditor() {
    const enabled = !!this._txSplitEnabled;
    const toggle = document.getElementById('tx-split-toggle');
    const addPart = document.getElementById('tx-split-add-part');
    const remainderToggle = document.getElementById('tx-split-remainder-toggle');
    const editor = document.getElementById('tx-split-editor');
    const categoryControl = document.getElementById('qe-category-control');
    const amountInput = document.getElementById('tx-amount');
    const amountLabel = document.getElementById('tx-amount-label');
    if (!toggle || !editor || !categoryControl) return;
    toggle.textContent = 'SPLIT';
    if (addPart) addPart.classList.toggle('hidden', !enabled);
    if (remainderToggle) {
      remainderToggle.classList.toggle('hidden', !enabled);
      remainderToggle.classList.toggle('btn-primary', enabled && !!this._txSplitRemainderEnabled);
      remainderToggle.classList.toggle('btn-secondary', !enabled || !this._txSplitRemainderEnabled);
      remainderToggle.setAttribute('aria-pressed', String(enabled && !!this._txSplitRemainderEnabled));
    }
    toggle.classList.toggle('btn-primary', enabled);
    toggle.classList.toggle('btn-secondary', !enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    editor.classList.toggle('hidden', !enabled);
    categoryControl.classList.toggle('hidden', enabled);
    if (amountInput) {
      amountInput.readOnly = enabled && !this._txSplitRemainderEnabled;
      amountInput.disabled = enabled && !this._txSplitRemainderEnabled;
      amountInput.classList.toggle('qe-amount-auto', enabled && !this._txSplitRemainderEnabled);
      amountInput.title = enabled && !this._txSplitRemainderEnabled ? 'Automatically summed from quantity × unit price' : '';
    }
    if (amountLabel) amountLabel.textContent = enabled ? 'TOTAL' : 'AMOUNT';
    if (!enabled) { this.updateTransactionSplitStatus(); return; }

    const date = this.parseDateInput((document.getElementById('tx-date') || {}).value) || this.today();
    const available = this.categoriesAvailableOn(date);
    const retained = new Set([...(this._txSplitParts || []).map(part => part.categoryId), this._txSplitRemainderCategoryId].filter(Boolean));
    const categories = [...available, ...(this.data.categories || []).filter(category => retained.has(category.id) && !available.some(item => item.id === category.id))];
    const options = selected => '<option value="">NONE</option>' + categories.map(category => '<option value="' + this.escapeHtml(category.id) + '"' + (category.id === selected ? ' selected' : '') + '>' + this.escapeHtml(this.categoryLabel(category)) + '</option>').join('');
    const rows = document.getElementById('tx-split-rows');
    rows.innerHTML = '<div class="tx-split-head" aria-hidden="true"><span>ITEM · PERSON</span><span>CATEGORY</span><span>QTY</span><span>PRICE EACH</span><span>LINE TOTAL</span><span></span></div>' +
      (this._txSplitParts || []).map((part, index) => {
        const noteId = 'tx-split-description-' + index;
        return '<div class="tx-split-item"><div class="tx-split-row" data-split-index="' + index + '">' +
          '<input type="text" id="' + noteId + '" class="input tx-split-description" aria-label="Split item description" placeholder="ITEM · @ PERSON" autocomplete="off" value="' + this.escapeHtml(part.description) + '">' +
          '<select class="input tx-split-category" aria-label="Part category">' + options(part.categoryId) + '</select>' +
          '<input type="text" inputmode="text" class="input tx-split-quantity" aria-label="Quantity" title="Enter a quantity or arithmetic expression" value="' + this.escapeHtml(part.quantity == null ? '1' : part.quantity) + '">' +
          '<input type="text" inputmode="text" class="input tx-split-unit-amount" aria-label="Unit price" placeholder="PRICE" title="Enter a unit price or arithmetic expression" value="' + this.escapeHtml(part.unitAmount) + '">' +
          '<input type="text" inputmode="text" class="input tx-split-line-total" aria-label="Line total" placeholder="TOTAL" title="Enter the total; price each is calculated as total divided by quantity. Arithmetic is allowed." value="' + this.escapeHtml(part.amount) + '">' +
          '<button type="button" class="btn btn-sm btn-danger btn-icon tx-split-remove" title="Remove part" aria-label="Remove part" onclick="BlackBook.removeTransactionSplitPart(' + index + ')">' + this.xIcon() + '</button></div>' +
          '<div class="transaction-people" id="' + noteId + '-people"></div></div>';
      }).join('');
    const remainder = document.getElementById('tx-split-remainder');
    if (remainder) {
      remainder.classList.toggle('hidden', !this._txSplitRemainderEnabled);
      remainder.innerHTML = this._txSplitRemainderEnabled
        ? '<div class="tx-split-remainder-row"><span class="tx-split-remainder-label">OTHER ITEMS · AUTO</span><select id="tx-split-remainder-category" class="input" aria-label="Other items category">' + options(this._txSplitRemainderCategoryId) + '</select><span id="tx-split-remainder-value" class="tx-split-remainder-value">—</span></div><div id="tx-split-status" class="tx-split-status" role="status" aria-live="polite"></div>'
        : '<div id="tx-split-status" class="tx-split-status" role="status" aria-live="polite"></div>';
      const remainderCategory = document.getElementById('tx-split-remainder-category');
      if (remainderCategory) remainderCategory.addEventListener('change', () => {
        this._txSplitRemainderCategoryId = remainderCategory.value || '';
        this.updateTransactionSplitStatus();
      });
    }
    (this._txSplitParts || []).forEach((part, index) => {
      const noteId = 'tx-split-description-' + index;
      this.initPeopleEntry(part.personIds, noteId);
      const row = rows.querySelector('[data-split-index="' + index + '"]');
      const description = document.getElementById(noteId);
      const category = row && row.querySelector('.tx-split-category');
      const quantity = row && row.querySelector('.tx-split-quantity');
      const unitAmount = row && row.querySelector('.tx-split-unit-amount');
      const lineTotal = row && row.querySelector('.tx-split-line-total');
      if (description) description.addEventListener('input', () => { this._txSplitParts[index].description = description.value; });
      if (category) category.addEventListener('change', () => { this._txSplitParts[index].categoryId = category.value; });
      if (quantity) {
        this.bindTransactionNumericInput(quantity, true);
        quantity.addEventListener('focus', () => quantity.select());
        quantity.addEventListener('blur', () => { if (!quantity.value.trim()) { quantity.value = '1'; this._txSplitParts[index].quantity = '1'; this._txSplitParts[index].quantitySpecified = false; this.updateTransactionSplitStatus(); } });
        quantity.addEventListener('input', () => { this._txSplitParts[index].quantity = quantity.value; this._txSplitParts[index].quantitySpecified = quantity.value.trim() !== ''; this.updateTransactionSplitStatus(); });
      }
      if (unitAmount) {
        this.bindTransactionNumericInput(unitAmount, true);
        unitAmount.addEventListener('focus', () => {
          unitAmount.select();
          if (/^[-+]?0+(?:[.,]0+)?$/.test(unitAmount.value.trim())) { unitAmount.value = ''; this._txSplitParts[index].unitAmount = ''; this.updateTransactionSplitStatus(); }
        });
        unitAmount.addEventListener('input', () => {
          this._txSplitParts[index].amountMode = 'unit';
          this._txSplitParts[index].unitAmount = unitAmount.value;
          this.updateTransactionSplitStatus();
        });
      }
      if (lineTotal) {
        this.bindTransactionNumericInput(lineTotal, true);
        lineTotal.addEventListener('focus', () => {
          lineTotal.select();
          if (/^[-+]?0+(?:[.,]0+)?$/.test(lineTotal.value.trim())) { lineTotal.value = ''; this._txSplitParts[index].amount = ''; this.updateTransactionSplitStatus(); }
        });
        lineTotal.addEventListener('input', () => {
          this._txSplitParts[index].amountMode = 'total';
          this._txSplitParts[index].amount = lineTotal.value;
          this.updateTransactionSplitStatus();
        });
      }
    });
    this.updateTransactionSplitStatus();
  },

  updateTransactionSplitStatus() {
    const amountInput = document.getElementById('tx-amount');
    const amountLabel = document.getElementById('tx-amount-label');
    if (!amountInput) return;
    if (!this._txSplitEnabled) {
      amountInput.readOnly = false;
      amountInput.disabled = false;
      amountInput.classList.remove('qe-amount-auto');
      amountInput.title = '';
      if (amountLabel) amountLabel.textContent = 'AMOUNT';
      const status = document.getElementById('tx-split-status');
      if (status) { status.textContent = ''; status.classList.remove('is-error'); }
      return;
    }
    const autoRemainder = !!this._txSplitRemainderEnabled;
    amountInput.readOnly = !autoRemainder;
    amountInput.disabled = !autoRemainder;
    amountInput.classList.toggle('qe-amount-auto', !autoRemainder);
    amountInput.title = autoRemainder ? 'Enter the full transaction total; the other items amount is calculated automatically.' : 'Automatically summed from item totals';
    if (amountLabel) amountLabel.textContent = 'TOTAL';
    const currency = document.getElementById('tx-currency-select').value || this.baseCurrency();
    const lines = (this._txSplitParts || []).map((part, index) => {
      const line = this.readTransactionSplitPart(index, part);
      part.quantity = line.quantityRaw;
      part.amountMode = line.amountMode;
      const row = document.querySelector('#tx-split-rows [data-split-index="' + index + '"]');
      const unitInput = row && row.querySelector('.tx-split-unit-amount');
      const totalInput = row && row.querySelector('.tx-split-line-total');
      if (line.valid) {
        part.amount = (line.lineCents / 100).toFixed(2);
        if (line.amountMode === 'total') {
          const derivedUnit = String(Math.round(line.unitAmount * 1000000) / 1000000);
          part.unitAmount = derivedUnit;
          if (unitInput && document.activeElement !== unitInput) unitInput.value = derivedUnit;
        } else {
          part.unitAmount = line.unitRaw;
          if (totalInput && document.activeElement !== totalInput) totalInput.value = (line.lineCents / 100).toFixed(2);
        }
      } else if (line.amountMode === 'total') {
        part.amount = line.amountRaw;
        part.unitAmount = '';
        if (unitInput && document.activeElement !== unitInput) unitInput.value = '';
      } else {
        part.unitAmount = line.unitRaw;
        part.amount = '';
        if (totalInput && document.activeElement !== totalInput) totalInput.value = '';
      }
      return line;
    });
    const allocatedCents = lines.reduce((sum, line) => sum + (line.valid ? line.lineCents : 0), 0);
    const status = document.getElementById('tx-split-status');
    if (autoRemainder) {
      const total = this.evalAmount(amountInput.value);
      const totalCents = Number.isFinite(total) && total > 0 ? Math.round(total * 100) : null;
      const remainingCents = totalCents == null ? null : totalCents - allocatedCents;
      const value = document.getElementById('tx-split-remainder-value');
      if (value) {
        value.textContent = remainingCents == null ? 'ENTER TOTAL' : remainingCents < 0 ? 'OVER BY ' + this.fmtAmount(Math.abs(remainingCents) / 100, currency) : this.fmtAmount(remainingCents / 100, currency);
        value.classList.toggle('is-error', remainingCents != null && remainingCents < 0);
      }
      if (status) {
        status.textContent = remainingCents != null && remainingCents < 0 ? 'Itemized amounts exceed the transaction total by ' + this.fmtAmount(Math.abs(remainingCents) / 100, currency) + '.' : '';
        status.classList.toggle('is-error', remainingCents != null && remainingCents < 0);
      }
    } else {
      amountInput.value = (allocatedCents / 100).toFixed(2);
      if (status) { status.textContent = ''; status.classList.remove('is-error'); }
    }
    this.updateTxPreview();
  },
  openNewTransaction(targetId) {
    this._copyTransactionDraft = false;
    this._txDualCurrencyEdit = null;
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) delete transactionForm.dataset.wishlistPurchaseId;
    const usable = this.visibleAccounts().length + (this.data.creditCards || []).length;
    if (!usable) { alert('Create an account first — use CREATE FIRST ACCOUNT on the overview, or Settings → Accounts → + ADD.'); return; }
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-date').value = this.fmtDateInput(this.todayForViewedMonth());
    document.getElementById('tx-type').value = this.data.settings.transactionDefaultType === 'income' ? 'income' : 'expense';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    const cardPrefill = targetId && String(targetId).startsWith('card:') ? targetId : null;
    const defaultAccountId = targetId || this.selectedAccount || '';
    const accSelect = document.getElementById('tx-account');
    accSelect.innerHTML = (defaultAccountId ? '' : '<option value="">— SELECT ACCOUNT —</option>') + (this.accountSelectOptions(defaultAccountId) || '<option value="">no accounts</option>');
    const selAcc = cardPrefill ? (this.cardById(String(cardPrefill).slice(5)) || null) : this.data.accounts.find(a => a.id === defaultAccountId);
    document.getElementById('tx-currency').value = selAcc ? (selAcc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
    document.getElementById('tx-currency-select').value = selAcc ? (selAcc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
    document.getElementById('tx-currency-select').disabled = false;
    document.getElementById('tx-native-amount').value = '';
    const secondaryCurrency = document.getElementById('tx-native-currency-select');
    secondaryCurrency.value = document.getElementById('tx-currency-select').value;
    this.syncCustomSelect('tx-currency-select');
    this.syncCustomSelect(secondaryCurrency);
    document.getElementById('tx-native-row').dataset.enabled = 'false';
    document.getElementById('tx-fee-amount').value = '';
    document.getElementById('tx-preview').textContent = '';
    this.updateTxNativeRow();
    const availableCats = this.categoriesAvailableOn(this.todayForViewedMonth());
    const defaultCatId = availableCats.some(c => c.id === this.data.settings.defaultCategoryId)
      ? this.data.settings.defaultCategoryId : (availableCats[0] && availableCats[0].id) || '';
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    const defaultCat = this.data.categories.find(c => c.id === defaultCatId);
    if (catInput && catHidden) { catHidden.value = defaultCatId; catInput.value = defaultCat ? defaultCat.name.toUpperCase() : ''; }
    const amountInput = document.getElementById('tx-amount');
    amountInput.dataset.fallbackType = document.getElementById('tx-type').value;
    amountInput.oninput = () => { this.updateTransactionSign(); this.updateTransactionSplitStatus(); };
    this.updateTransactionSign();
    this.setTransactionSplitMode(false);
    this.initPeopleEntry([]);
    this.openModal('transaction-modal');
    setTimeout(() => amountInput.focus(), 50);
    this.initCategoryPicker('tx-category-input', 'tx-category', 'category-dropdown');
    this.bindQuickEntryExtras();
  },

  updateTransactionSign() {
    const amountInput = document.getElementById('tx-amount');
    const raw = amountInput.value.trim();
    const type = raw.startsWith('+') ? 'income' : raw.startsWith('-') ? 'expense' : (amountInput.dataset.fallbackType || 'expense');
    document.getElementById('tx-type').value = type;
    const button = document.getElementById('tx-sign-toggle');
    button.textContent = type === 'income' ? '+' : '−';
    button.classList.toggle('income', type === 'income');
    button.classList.toggle('expense', type !== 'income');
    button.setAttribute('aria-label', (type === 'income' ? 'Income' : 'Expense') + '. Click for ' + (type === 'income' ? 'expense' : 'income'));
  },

  async toggleTransactionSign() {
    const amountInput = document.getElementById('tx-amount');
    const type = document.getElementById('tx-type').value === 'income' ? 'expense' : 'income';
    amountInput.dataset.fallbackType = type;
    amountInput.value = amountInput.value.replace(/^\s*[+-]\s*/, '');
    this.updateTransactionSign();
    this.updateTxPreview();
    if (!document.getElementById('tx-id').value) {
      this.data.settings.transactionDefaultType = type;
      await this.save();
    }
    amountInput.focus();
  },

  bindQuickEntryExtras() {
    if (this._quickEntryExtrasBound) return;
    this._quickEntryExtrasBound = true;
    document.getElementById('tx-account').addEventListener('change', (e) => {
      const v = String(e.target.value);
      const secondary = document.getElementById('tx-native-currency-select');
      const followsAccount = secondary.value === document.getElementById('tx-currency-select').value;
      const dualEdit = this._txDualCurrencyEdit && this._txDualCurrencyEdit.txId === document.getElementById('tx-id').value;
      if (dualEdit) {
        this.syncDualTransactionAmounts(v);
      } else {
        if (v.startsWith('card:')) {
          const card = this.cardById(v.slice(5));
          const cur = (card && card.currency) || this.baseCurrency();
          document.getElementById('tx-currency').value = cur;
          document.getElementById('tx-currency-select').value = cur;
        } else {
          const acc = this.data.accounts.find(a => a.id === v);
          const cur = acc ? (acc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
          document.getElementById('tx-currency').value = cur;
          document.getElementById('tx-currency-select').value = cur;
        }
        this.syncCustomSelect('tx-currency-select');
        if (followsAccount) { secondary.value = document.getElementById('tx-currency-select').value; this.syncCustomSelect(secondary); }
      }
      this.updateTxNativeRow();
      this.updateTxPreview();
    });
    document.getElementById('tx-currency-select').addEventListener('change', (e) => {
      document.getElementById('tx-currency').value = e.target.value;
      const secondary = document.getElementById('tx-native-currency-select');
      this.syncCustomSelect(secondary);
      this.updateTxNativeRow();
      this.updateTxPreview();
    });
    document.getElementById('tx-native-currency-select').addEventListener('change', (e) => {
      this.updateTxNativeRow();
      this.updateTxPreview();
    });
    document.getElementById('tx-amount').addEventListener('input', () => this.updateTxPreview());
    document.getElementById('tx-native-amount').addEventListener('input', () => this.updateTxPreview());
    document.getElementById('tx-fee-amount').addEventListener('input', () => this.updateTxPreview());
  },

  updateTxNativeRow() {
    const row = document.getElementById('tx-native-row');
    const feeRow = document.getElementById('tx-fee-row');
    const primary = document.getElementById('tx-currency-select').value;
    const secondary = document.getElementById('tx-native-currency-select').value;
    const shown = !!(secondary && secondary !== primary);
    row.dataset.enabled = shown ? 'true' : 'false';
    row.style.display = '';
    const amount = document.getElementById('tx-native-amount');
    amount.hidden = false;
    amount.disabled = !shown;
    amount.required = shown;
    amount.placeholder = 'AMOUNT';
    document.getElementById('tx-account-currency').textContent = primary;
    document.getElementById('tx-amount').placeholder = 'AMOUNT';
    if (feeRow) feeRow.style.display = 'none';
  },

  updateTxPreview() {
    const previewEl = document.getElementById('tx-preview');
    if (!previewEl) return;
    previewEl.textContent = '';
  },

  openTransferModal() {
    this._copyTransactionDraft = false;
    this._transferSourceIds = null;
    const vis = this.visibleAccounts();
    if (vis.length < 2) { alert('You need at least two accounts to transfer.'); return; }
    const opts = vis.map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + ' (' + (a.currency || this.baseCurrency() || 'RSD') + ')</option>').join('');
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
    this.initPeopleEntry([], 'tr-note');
    this.updateTransferCurrencyLabels();
    this.openModal('transfer-modal');
    setTimeout(() => document.getElementById('tr-amount').focus(), 50);
  },

  openEditTransfer(txId) {
    this._copyTransactionDraft = false;
    const tx = this.data.transactions.find(t => t.id === txId);
    this._transferSourceIds = null;
    if (!tx || tx.type !== 'transfer') return this.openEditTransaction(txId);
    const vis = this.visibleAccounts();
    const hiddenLinked = [tx.fromAccountId, tx.toAccountId].map(id => (this.data.accounts || []).find(account => account.id === id && account.hidden)).filter(Boolean);
    const options = [...vis, ...hiddenLinked.filter(account => !vis.some(item => item.id === account.id))];
    const opts = options.map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + (a.hidden ? ' (HIDDEN)' : '') + ' (' + (a.currency || this.baseCurrency() || 'RSD') + ')</option>').join('');
    const missingOption = '<option value="" selected>— ACCOUNT MISSING —</option>';
    const fromSelect = document.getElementById('tr-from');
    const toSelect = document.getElementById('tr-to');
    fromSelect.innerHTML = (options.some(a => a.id === tx.fromAccountId) ? '' : missingOption) + opts;
    toSelect.innerHTML = (options.some(a => a.id === tx.toAccountId) ? '' : missingOption) + opts;
    fromSelect.value = options.some(a => a.id === tx.fromAccountId) ? tx.fromAccountId : '';
    toSelect.value = options.some(a => a.id === tx.toAccountId) ? tx.toAccountId : '';
    document.getElementById('tr-amount').value = Math.abs(tx.amount);
    document.getElementById('tr-amount-in').value = tx.amountIn != null ? Math.abs(tx.amountIn) : '';
    const noteRaw = tx.note || '';
    document.getElementById('tr-note').value = noteRaw;
    this._transferNoteBase = this.transferNoteBase();
    document.getElementById('tr-date').value = this.fmtDateInput(tx.date);
    this._editingTransferId = txId;
    this.initPeopleEntry(tx.personIds || [], 'tr-note');
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
    const curF = fromAcc ? (fromAcc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
    const curT = toAcc ? (toAcc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
    document.getElementById('tr-out-label').textContent = 'Amount out (' + curF + ')';
    document.getElementById('tr-in-label').textContent = 'Amount in (' + curT + ')';
  },

  convertBetweenCurrencies(amount, curFrom, curTo) {
    if (!amount || isNaN(amount)) return null;
    if (curFrom === curTo) return Math.round(amount * 100) / 100;
    const rates = this.getRates();
    const rateFrom = (curFrom === 'EUR') ? 1 : (rates[curFrom] || {}).rate;
    const rateTo = (curTo === 'EUR') ? 1 : (rates[curTo] || {}).rate;
    if (!rateFrom || !rateTo) return null;
    const eur = amount * rateFrom;
    return Math.round(eur / rateTo * 100) / 100;
  },

  async doTransfer(fromId, toId, amountOut, noteExtra, date, amountInOverride, deferSave = false, personIds = []) {
    const cat = this.transferCategoryObj();
    const fromAcc = this.data.accounts.find(a => a.id === fromId);
    const toAcc = this.data.accounts.find(a => a.id === toId);
    if (!fromAcc || !toAcc || fromId === toId || isNaN(amountOut) || amountOut <= 0) return false;
    const curF = fromAcc.currency || this.baseCurrency() || 'RSD';
    const curT = toAcc.currency || this.baseCurrency() || 'RSD';
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
      pairId: pairId,
      personIds: [...personIds]
    });
    if (!deferSave) await this.save({ undoable: true, label: 'Transfer money' });
    return true;
  },

  bindTransferForm() {
    const amtOut = document.getElementById('tr-amount');
    const amtIn = document.getElementById('tr-amount-in');
    amtOut.addEventListener('input', () => {
      const f = document.getElementById('tr-from');
      const t = document.getElementById('tr-to');
      const curF = (this.data.accounts.find(a => a.id === f.value) || {}).currency || this.baseCurrency() || 'RSD';
      const curT = (this.data.accounts.find(a => a.id === t.value) || {}).currency || this.baseCurrency() || 'RSD';
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
      if (!from || !to) { alert('An account is missing. Please select both accounts before saving.'); return; }
      if (from === to) { alert('Choose two different accounts.'); return; }
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
          const curF = fromAcc ? (fromAcc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
          const curT = toAcc ? (toAcc.currency || this.baseCurrency() || 'RSD') : this.baseCurrency();
          let finalAmountIn = amountIn;
          if (finalAmountIn == null || isNaN(finalAmountIn)) finalAmountIn = this.convertBetweenCurrencies(amountOut, curF, curT);
          if (finalAmountIn == null || isNaN(finalAmountIn)) finalAmountIn = amountOut;
          const nextAmounts = {
            fromAccountId: from,
            toAccountId: to,
            amount: Math.round(Math.abs(amountOut) * 100) / 100,
            amountIn: Math.round(Math.abs(finalAmountIn) * 100) / 100,
            currency: curF,
            currencyIn: curT,
            date
          };
          if (tx.settlements && this.transferSettlementFieldsChanged(tx, nextAmounts)) delete tx.settlements;
          tx.fromAccountId = from;
          tx.toAccountId = to;
          tx.amount = nextAmounts.amount;
          tx.amountIn = nextAmounts.amountIn;
          tx.currency = curF;
          tx.currencyIn = curT;
          tx.date = date;
          tx.note = noteExtra || (fromAcc ? fromAcc.name : '?') + ' → ' + (toAcc ? toAcc.name : '?');
          tx.personIds = this.transactionPeopleDraft('tr-note');
          await this.save({ undoable: true, label: 'Edit transfer' });
          this._editingTransferId = null;
        }
      } else {
        const mergeSources = this._transferSourceIds && this._transferSourceIds.length === 2;
        const ok = await this.doTransfer(from, to, amountOut, noteExtra, date, amountIn, !!mergeSources, this.transactionPeopleDraft('tr-note'));
        if (!ok) return;
        if (mergeSources) {
          const src = this._transferSourceIds;
          this._transferSourceIds = null;
          this._mergeIds = null;
          this._bulkSel = new Set();
          this._bulkOnly = false;
          this.data.transactions = this.data.transactions.filter(t => !src.includes(t.id));
          await this.save({ undoable: true, label: 'Merge into transfer' });
        }
      }
      this.closeModal('transfer-modal');
      this.syncViewToDate(date);
      this.renderPage(this.currentPage);
      if (this._copyTransactionDraft && this._lastSaveSuccess === this._saveSequence) {
        this._copyTransactionDraft = false;
        this.openLinkedTransaction(this.data.transactions[0].id);
        this.showToast('Transaction copied');
      }
    });
  },

  openEditTransaction(txId) {
    this._copyTransactionDraft = false;
    this._txDualCurrencyEdit = null;
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) delete transactionForm.dataset.wishlistPurchaseId;
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) return;
    if (tx.type === 'transfer') { this.openEditTransfer(txId); return; }
    document.getElementById('tx-id').value = tx.id;
    document.getElementById('tx-date').value = this.fmtDateInput(tx.date);
    document.getElementById('tx-type').value = tx.type;
    document.getElementById('tx-amount').value = Math.abs(tx.amount);
    document.getElementById('tx-amount').dataset.fallbackType = tx.type;
    document.getElementById('tx-amount').oninput = () => { this.updateTransactionSign(); this.updateTransactionSplitStatus(); };
    this.updateTransactionSign();
    document.getElementById('tx-currency').value = tx.currency;
    document.getElementById('tx-currency-select').value = tx.currency;
    document.getElementById('tx-currency-select').disabled = false;
    document.getElementById('tx-native-amount').value = tx.nativeAmount != null ? Math.abs(tx.nativeAmount) : '';
    document.getElementById('tx-native-currency-select').value = tx.nativeCurrency || tx.currency;
    this.syncCustomSelect('tx-currency-select');
    this.syncCustomSelect('tx-native-currency-select');
    document.getElementById('tx-native-row').dataset.enabled = tx.nativeAmount != null && tx.nativeCurrency && tx.nativeCurrency !== tx.currency ? 'true' : 'false';
    document.getElementById('tx-fee-amount').value = tx.feeAmount != null ? Math.abs(tx.feeAmount) : '';
    document.getElementById('tx-note').value = tx.note || '';
    const accountSelect = document.getElementById('tx-account');
    const selectedAccount = tx.cardId ? 'card:' + tx.cardId : tx.accountId;
    const accountExists = tx.cardId
      ? (this.data.creditCards || []).some(card => card.id === tx.cardId)
      : (this.data.accounts || []).some(account => account.id === tx.accountId);
    const hiddenAccount = !tx.cardId && accountExists ? (this.data.accounts || []).find(account => account.id === tx.accountId && account.hidden) : null;
    const accountOptions = this.accountSelectOptions(accountExists ? selectedAccount : '') + (hiddenAccount && !this.visibleAccounts().some(account => account.id === hiddenAccount.id) ? '<option value="' + this.escapeHtml(hiddenAccount.id) + '" selected>' + this.escapeHtml(hiddenAccount.name + ' (HIDDEN)') + '</option>' : '');
    accountSelect.innerHTML = (accountExists ? '' : '<option value="" selected>— ACCOUNT MISSING —</option>') + accountOptions;
    accountSelect.value = accountExists ? selectedAccount : '';
    if (tx.nativeAmount != null && tx.nativeCurrency && tx.nativeCurrency !== tx.currency) {
      this._txDualCurrencyEdit = {
        txId: tx.id,
        primaryCurrency: tx.currency,
        otherCurrency: tx.nativeCurrency,
        swapped: false
      };
      this.syncDualTransactionAmounts(accountSelect.value);
    }
    const catInput = document.getElementById('tx-category-input');
    const catHidden = document.getElementById('tx-category');
    if (catInput && catHidden) { catHidden.value = tx.categoryId; const cat = this.data.categories.find(c => c.id === tx.categoryId); catInput.value = cat ? this.categoryLabel(cat).toUpperCase() : ''; }
    this.setTransactionSplitMode(Array.isArray(tx.parts) && tx.parts.length > 0, tx.parts || [], !!tx.splitRemainder);
    this.initPeopleEntry(tx.personIds || []);
    this.openModal('transaction-modal');
    setTimeout(() => document.getElementById('tx-amount').focus(), 50);
    this.initCategoryPicker('tx-category-input', 'tx-category', 'category-dropdown');
    this.bindQuickEntryExtras();
    this.updateTxNativeRow();
    this.updateTxPreview();
  },

  syncDualTransactionAmounts(accountVal) {
    const pair = this._txDualCurrencyEdit;
    if (!pair || pair.txId !== document.getElementById('tx-id').value) return;
    const amountEl = document.getElementById('tx-amount');
    const otherAmountEl = document.getElementById('tx-native-amount');
    const accountId = String(accountVal || '');
    if (!accountId) return;
    const account = accountId.startsWith('card:')
      ? (this.cardById(accountId.slice(5)) || {})
      : (this.data.accounts || []).find(item => item.id === accountId) || {};
    const accountCurrency = account.currency || this.baseCurrency();
    const primarySelect = document.getElementById('tx-currency-select');
    const secondarySelect = document.getElementById('tx-native-currency-select');
    if (accountCurrency === secondarySelect.value && accountCurrency !== primarySelect.value) {
      const amount = amountEl.value;
      amountEl.value = otherAmountEl.value;
      otherAmountEl.value = amount;
      const currency = primarySelect.value;
      primarySelect.value = secondarySelect.value;
      secondarySelect.value = currency;
      this.syncCustomSelect(primarySelect);
      this.syncCustomSelect(secondarySelect);
      pair.swapped = !pair.swapped;
    }
    amountEl.placeholder = 'AMOUNT (' + primarySelect.value + ')';
    document.getElementById('tx-currency').value = primarySelect.value;
  },

  editHoveredTransaction(txId = this.hoveredTransactionId()) { if (txId) this.openEditTransaction(txId); },

  copySelectedTransaction() {
    const selected = this._bulkSel ? [...this._bulkSel] : [];
    if (selected.length > 1) return;
    const id = selected.length === 1 ? selected[0] : this.hoveredTransactionId();
    const tx = this.data.transactions.find(item => item.id === id);
    if (!tx) return;
    this.openEditTransaction(id);
    this._copyTransactionDraft = true;
    if (tx.type === 'transfer') {
      this._editingTransferId = null;
    } else {
      document.getElementById('tx-id').value = '';
      if (this._txDualCurrencyEdit) this._txDualCurrencyEdit.txId = '';
    }
  },

  async deleteTransaction(txId) {
    const wrap = document.querySelector('.tx-list-wrap');
    const scrollTop = wrap ? wrap.scrollTop : 0;
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) return;

    const context = this.describeTransactionLinked(tx);
    const linked = context.detail && context.detail !== 'plain' && context.detail !== 'transfer';
    if (linked) {
      const ok = await this.confirmModal({
        title: context.title,
        message: context.message,
        confirmText: 'Delete',
        danger: true
      });
      if (!ok) return;
    }

    this.applyTransactionLinkRemove(tx);
    const removed = tx;
    this.data.transactions = this.data.transactions.filter(t => t.id !== txId);
    await this.save({ undoable: true, label: 'Delete transaction' });
    this.renderPage(this.currentPage);
    const nw = document.querySelector('.tx-list-wrap');
    if (nw) nw.scrollTop = scrollTop;
  },

  describeTransactionLinked(tx) {
    const amtP = tx.nativeAmount != null ? this.fmtAmount(Math.abs(tx.nativeAmount), tx.nativeCurrency || tx.currency) : this.fmtAmount(Math.abs(tx.amount), tx.currency);
    const due = 'Delete this linked transaction?';

    const bp = this.billPaymentForTx(tx.id);
    if (bp) {
      const bill = (this.data.bills || []).find(b => b.id === bp.billId);
      const label = bill ? bill.name : 'this bill';
      return {
        title: 'Delete Bill Payment',
        message: 'Linked to "' + label + '". Deleting will mark that month UNPAID.',
        detail: 'bill'
      };
    }

    const debt = this.debtForPaymentTx(tx.id);
    if (debt) {
      const isAddition = tx.debtEntryType === 'addition';
      return {
        title: isAddition ? 'Delete Added Debt Amount' : 'Delete Debt Payment',
        message: isAddition
          ? 'This ' + amtP + ' is an added amount on the debt for "' + (debt.person || '') + '". Deleting it removes that amount from the debt total.'
          : 'This ' + amtP + ' payment is linked to the debt "' + (debt.person || '') + '". Deleting it reverses only this payment and increases the remaining balance.',
        detail: 'debt'
      };
    }

    const inv = this.invoiceForPaymentTx(tx.id);
    if (inv && inv.paymentIndex >= 0) {
      const v = inv.invoice;
      return {
        title: 'Delete Invoice Payment',
        message: 'This ' + amtP + ' payment is linked to invoice "' + (v.number || v.party || '') + '". Deleting it reverses only this payment and increases the outstanding balance.',
        detail: 'invoice'
      };
    }

    const sav = this.savingsForTx(tx.id);
    if (sav) {
      return {
        title: 'Delete Savings Contribution',
        message: 'This contribution is linked to the savings goal "' + (sav.goal.name || '') + '". Deleting it will reduce that goal\u2019s saved amount.',
        detail: 'savings'
      };
    }

    if (tx.cardBillPayment) {
      return {
        title: 'Delete Credit Card Payment',
        message: 'This is one payment for the card bill. Deleting it will remove its allocation from every purchase on that card.',
        detail: 'card'
      };
    }

    const inst = this.installmentForTx(tx.id);
    if (inst && inst.seq != null) {
      return {
        title: 'Delete Installment Payment',
        message: 'This installment payment is linked to the purchase plan "' + ((inst.inst && inst.inst.name) || '') + '" (period ' + inst.seq + '). Deleting it will reduce the amount paid toward that installment.',
        detail: 'card'
      };
    }

    if (tx && tx.type === 'transfer') {
      return {
        title: 'Delete Transfer',
        message: due + ' The money will be returned to its source account.',
        detail: 'transfer'
      };
    }

    return {
      title: 'Delete Transaction',
      message: (tx.note || '') ? 'Delete this transaction: "' + tx.note + '" (' + amtP + ')?' : ('Delete this ' + amtP + ' transaction?'),
      detail: 'plain'
    };
  },

  applyTransactionLinkRemove(tx) {
    const bp = this.billPaymentForTx(tx.id);
    if (bp) {
      const remaining = this.billPaymentTransactionIds(bp).filter(id => id !== tx.id);
      if (!remaining.length) this.data.billPayments = this.data.billPayments.filter(p => p !== bp);
      else {
        bp.relatedTxIds = remaining;
        this.syncBillPaymentTransactions(bp, this.data.bills.find(bill => bill.id === bp.billId));
      }
    }
    const debt = this.debtForPaymentTx(tx.id);
    if (debt) {
      this.removeDebtPayment(tx.id);
    }
    const inv = this.invoiceForPaymentTx(tx.id);
    if (inv) {
      this.removeInvoicePaymentByTx(tx.id);
    }
    const sav = this.savingsForTx(tx.id);
    if (sav) {
      sav.goal.entries.splice(sav.entryIndex, 1);
    }
    if (tx.cardBillPayment && Array.isArray(tx.installmentAllocations)) {
      for (const allocation of tx.installmentAllocations) {
        const inst = (this.data.installments || []).find(item => item.id === allocation.installmentId);
        if (inst && Array.isArray(inst.paid)) inst.paid = inst.paid.filter(entry => !(entry && entry.seq === allocation.seq && entry.via === 'tx'));
      }
    } else {
      const inst = this.installmentForTx(tx.id);
      if (inst && inst.inst && inst.seq != null && Array.isArray(inst.inst.paid)) {
        inst.inst.paid = inst.inst.paid.filter(e => !(e && (e.seq === inst.seq && e.via === 'tx')));
      }
    }
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
    this.updateFooterHotkeys();
  },

  bulkClear() {
    this._bulkSel = new Set();
    this._bulkOnly = false;
    this.renderPage(this.currentPage);
  },

  openBulkEdit() {
    if (!this._bulkSel || !this._bulkSel.size) return;
    if (this._bulkSel.size === 1) {
      this.openEditTransaction(this._bulkSel.values().next().value);
      return;
    }
    const catSel = document.getElementById('bulk-category');
    const accSel = document.getElementById('bulk-account');
    catSel.innerHTML = '<option value="">-- keep current --</option>' + this.categoriesAvailableOn(this.today()).map(c => '<option value="' + c.id + '">' + this.escapeHtml(c.name) + '</option>').join('');
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
    await this.save({ undoable: true, label: 'Edit transactions' });
    this.closeModal('bulk-edit-modal');
    this.bulkClear();
    await this.confirmModal({ title: 'Bulk Edit', message: 'Updated ' + changed + ' transaction' + (changed === 1 ? '' : 's') + '.', danger: false });
  },

  async bulkDelete() {
    const n = this._bulkSel ? this._bulkSel.size : 0;
    if (!n) return;
    if (!(await this.confirmModal({ title: 'Delete Transactions', message: 'Delete ' + n + ' selected transaction' + (n === 1 ? '' : 's') + '?' }))) return;
    this.data.transactions = this.data.transactions.filter(t => !this._bulkSel.has(t.id));
    await this.save({ undoable: true, label: 'Delete transactions' });
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
    const curs = new Set(txs.map(t => t.currency || this.baseCurrency() || 'RSD'));
    const accs = new Set(txs.map(t => t.cardId ? ('card:' + t.cardId) : (t.accountId || '')));
    const hasSplits = txs.some(tx => Array.isArray(tx.parts) && tx.parts.length);
    const signs = new Set(txs.map(tx => Math.sign(Number(tx.amount) || 0)));
    this._mergeIds = txs.map(t => t.id);
    this._mergeCurrency = txs[0].currency || this.baseCurrency() || 'RSD';
    this._mergeOk = curs.size === 1 && accs.size === 1 && (!hasSplits || signs.size === 1 && !signs.has(0));
    this._mergeSplitOk = curs.size === 1 && accs.size === 1 && signs.size === 1 && !signs.has(0);
    this._mergeReason = this._mergeOk ? '' : curs.size !== 1 || accs.size !== 1 ? 'Transactions must use the same currency and account/card.' : 'Split transactions must all have the same income/expense direction.';
    this._mergeSelected = 0;
    let list = '<div style="max-height:280px;overflow:auto;">';
    txs.forEach((t, i) => {
      const acc = t.cardId ? (this.data.creditCards || []).find(c => c.id === t.cardId) : accMap[t.accountId];
      const cat = catMap[t.categoryId];
      list += '<div class="merge-row' + (i === 0 ? ' merge-target' : '') + '" data-idx="' + i + '" onclick="BlackBook.selectMergeTarget(' + i + ')">' +
        '<span class="merge-date">' + this.escapeHtml(t.date) + '</span>' +
        '<span class="merge-cat" style="color:' + (cat ? BlackBook.categoryColor(cat) : 'var(--text-muted)') + '">' + this.escapeHtml(cat ? this.categoryLabel(cat) : 'None') + '</span>' +
        '<span class="merge-acct">' + this.escapeHtml(acc ? acc.name : '?') + '</span>' +
        '<span class="merge-note">' + this.transactionDescriptionHtml(t) + '</span>' +
        '<span class="merge-amt">' + this.fmtAmount(t.amount, this._mergeCurrency) + '</span></div>';
    });
    list += '</div>';
    document.getElementById('merge-list').innerHTML = list;
    document.getElementById('merge-title').textContent = 'Merge Transactions \u00b7 ' + txs.length;
    this.renderMergeSummary();
    if (txs.length === 2 && !hasSplits) {
      document.getElementById('merge-summary').insertAdjacentHTML('beforeend', '<div style="color:var(--text-muted);margin-top:4px;">Tip: you can also convert these into a transfer between their accounts.</div>');
    }
    if (!this._mergeOk) {
      document.getElementById('merge-summary').insertAdjacentHTML('beforeend', '<div style="color:var(--expense);margin-top:4px;">Cannot merge: ' + this.escapeHtml(this._mergeReason) + '</div>');
    }
    this.openModal('merge-modal');
    const trBtn = document.getElementById('merge-transfer-btn');
    if (trBtn) trBtn.style.display = (txs.length === 2 && !hasSplits) ? '' : 'none';
    const splitBtn = document.getElementById('merge-split-btn');
    if (splitBtn) splitBtn.style.display = this._mergeSplitOk ? '' : 'none';
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
    el.innerHTML = 'Target: <b>' + this.escapeHtml(tgt.date) + '</b> ' + this.escapeHtml(cat ? this.categoryLabel(cat) : 'None') +
      ' / ' + this.escapeHtml(acc ? acc.name : '?') +
      ' &middot; Combined total: <b>' + this.fmtAmount(sum, this._mergeCurrency) + '</b> (' + txs.length + ' into 1)' +
      (notes.length ? ' &middot; Note: "' + this.escapeHtml(notes.join('; ')) + '"' : '');
  },

  async submitMerge(asSplit = false) {
    if (!this._mergeIds || this._mergeIds.length < 2) return;
    if (!this._mergeOk) { alert('Cannot merge: ' + (this._mergeReason || 'choose transactions with compatible accounts and currencies.')); return; }
    const txs = this.data.transactions.filter(t => this._mergeIds.includes(t.id));
    const tgt = txs[this._mergeSelected];
    if (!tgt) return;
    const mergedTransactionIds = new Set(txs.map(tx => tx.id));
    const splitDirections = new Set(txs.map(tx => Math.sign(Number(tx.amount) || 0)));
    if (asSplit && (splitDirections.size !== 1 || splitDirections.has(0))) {
      alert('Cannot merge as split: all transactions must be income or all be expenses.');
      return;
    }
    const sum = Math.round(txs.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
    const notes = txs.map(t => (t.note || '').trim()).filter(Boolean);
    if (asSplit || txs.some(tx => Array.isArray(tx.parts) && tx.parts.length)) {
      const categoryName = id => (this.data.categories || []).find(category => category.id === id)?.name || '';
      tgt.parts = txs.flatMap(tx => {
        const sourceParts = Array.isArray(tx.parts) && tx.parts.length ? tx.parts : [{
          description:(tx.note || '').trim() || categoryName(tx.categoryId) || 'Transaction',
          categoryId:tx.categoryId,
          amount:Math.abs(Number(tx.amount) || 0),
          personIds:tx.personIds || [],
          ...(asSplit && tx.nativeAmount != null ? { nativeAmount:Math.abs(Number(tx.nativeAmount) || 0), nativeCurrency:tx.nativeCurrency || tx.currency || this._mergeCurrency } : {})
        }];
        const hasPartNativeAmount = sourceParts.some(part => part.nativeAmount != null);
        return sourceParts.map((part, index) => {
          const mergedPart = {
            ...part,
            id:crypto.randomUUID(),
            amount:Math.abs(Number(part.amount) || 0),
            personIds:[...new Set([...(asSplit ? tx.personIds || [] : []), ...(part.personIds || [])])]
          };
          if (asSplit && index === 0 && !hasPartNativeAmount && tx.nativeAmount != null) {
            mergedPart.nativeAmount = Math.abs(Number(tx.nativeAmount) || 0);
            mergedPart.nativeCurrency = tx.nativeCurrency || tx.currency || this._mergeCurrency;
          }
          return mergedPart;
        });
      });
      tgt.parts = tgt.parts.map(part => this.categorySelectionAllowed(part.categoryId, tgt.date, part.categoryId) ? part : { ...part, categoryId:null });
      tgt.categoryId = tgt.parts[0]?.categoryId || null;
    } else delete tgt.parts;
    tgt.amount = sum;
    tgt.note = notes.join('; ');
    tgt.personIds = asSplit ? [] : [...new Set(txs.flatMap(tx => tx.personIds || []))];
    delete tgt.nativeAmount; delete tgt.nativeCurrency; delete tgt.baseAmount; delete tgt.feeAmount;
    const bankStatementRows = txs.flatMap(tx => Array.isArray(tx.bankStatementRows) ? tx.bankStatementRows : []);
    if (bankStatementRows.length) {
      tgt.bankStatementRows = [...new Map(bankStatementRows.map(row => [row.key || JSON.stringify(row), row])).values()];
    }
    const keep = tgt.id;
    this.data.transactions = this.data.transactions.filter(t => t.id === keep || !this._mergeIds.includes(t.id));
    for (const payment of this.data.billPayments || []) {
      const linkedIds = this.billPaymentTransactionIds(payment);
      if (!linkedIds.some(id => mergedTransactionIds.has(id))) continue;
      payment.relatedTxIds = [...new Set(linkedIds.map(id => mergedTransactionIds.has(id) ? keep : id))];
      if (mergedTransactionIds.has(payment.txId)) payment.txId = keep;
      this.syncBillPaymentTransactions(payment, (this.data.bills || []).find(bill => bill.id === payment.billId));
    }
    await this.save({ undoable: true, label: 'Merge transactions' });
    this.closeModal('merge-modal');
    this.bulkClear();
    this.showToast('Merged ' + txs.length + ' transactions successfully.');
  },

  mergeAsTransfer() {
    if (!this._mergeIds || this._mergeIds.length !== 2) return;
    const txs = this.data.transactions.filter(t => this._mergeIds.includes(t.id));
    if (txs.length !== 2) return;
    const accMap = Object.fromEntries((this.data.accounts || []).map(a => [a.id, a]));
    const accs = txs.map(t => accMap[t.accountId]);
    const exp = txs.find(t => (t.amount || 0) < 0);
    const inc = txs.find(t => (t.amount || 0) > 0);
    const reason = txs.some(t => (t.parts || []).length) ? 'one of the selected transactions has split parts.' :
      txs.some(t => t.cardId) ? 'one of the selected transactions is on a credit card.' :
      (!accs[0] || !accs[1] || accs[0].id === accs[1].id) ? 'the two transactions must be on different accounts.' :
      (!exp || !inc) ? 'one transaction must be an expense and one an income.' : null;
    if (reason) { alert('Cannot convert to transfer: ' + reason); return; }
    this._transferSourceIds = [exp.id, inc.id];
    this._copyTransactionDraft = false;
    this._editingTransferId = null;
    const fromAcc = accMap[exp.accountId];
    const toAcc = accMap[inc.accountId];
    const opts = this.data.accounts.filter(a => a.type !== 'credit' && a.type !== 'creditcard').map(a => '<option value="' + a.id + '">' + this.escapeHtml(a.name) + ' (' + (a.currency || this.baseCurrency() || 'RSD') + ')</option>').join('');
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
    if ((inc.currency || this.baseCurrency() || 'RSD') === (toAcc.currency || this.baseCurrency() || 'RSD')) amtIn.value = Math.abs(inc.amount);
    const tgt = txs[this._mergeSelected] || exp;
    document.getElementById('tr-date').value = this.fmtDateInput(tgt.date);
    document.getElementById('tr-note').value = txs.map(t => (t.note || '').trim()).filter(Boolean).join('; ');
    this.initPeopleEntry([...new Set(txs.flatMap(tx => tx.personIds || []))], 'tr-note');
    this._transferNoteBase = this.transferNoteBase();
    this.updateTransferNote();
    this.updateTransferCurrencyLabels();
    this.closeModal('merge-modal');
    this.openModal('transfer-modal');
    setTimeout(() => amtOut.focus(), 50);
  },

  bindModalSubmit() {
    const form = document.getElementById('transaction-form');
    ['tx-amount', 'tx-native-amount', 'tx-fee-amount'].forEach(id => this.bindTransactionNumericInput(document.getElementById(id)));
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName !== 'SELECT') { e.preventDefault(); form.requestSubmit(); }
    });
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = document.getElementById('transaction-form');
      const wishlistPurchaseId = form.dataset.wishlistPurchaseId || '';
      const id = document.getElementById('tx-id').value;
      const rawParsed = this.evalAmount(document.getElementById('tx-amount').value);
      if (isNaN(rawParsed)) { alert('Please enter a valid amount.'); return; }
      const txDate = this.parseDateInput(document.getElementById('tx-date').value);
      if (!txDate) { alert('Enter a valid date (' + this.dateFormatPattern() + ').'); return; }
      const rawAmt = Math.abs(Math.round(rawParsed * 100) / 100);
      const txType = document.getElementById('tx-type').value;
      const accountVal = document.getElementById('tx-account').value;
      if (!accountVal) { alert('Select an account first.'); return; }
      const primaryCurrency = document.getElementById('tx-currency-select').value;
      const secondaryRow = document.getElementById('tx-native-row');
      const secondaryInput = document.getElementById('tx-native-amount');
      const secondaryCurrency = document.getElementById('tx-native-currency-select').value;
      const hasSecondary = secondaryRow.dataset.enabled === 'true' && secondaryInput.value.trim() !== '';
      const secondaryParsed = hasSecondary ? this.evalAmount(secondaryInput.value) : null;
      if (hasSecondary && (!Number.isFinite(secondaryParsed) || secondaryParsed <= 0 || secondaryCurrency === primaryCurrency)) {
        alert('Enter a valid secondary amount and choose a different currency.'); return;
      }
      const polarity = txType === 'income' ? 1 : -1;
      const txData = { date: txDate, type: txType, amount: polarity * rawAmt, currency: primaryCurrency, accountId: accountVal.startsWith('card:') ? null : accountVal, categoryId: document.getElementById('tx-category').value, note: document.getElementById('tx-note').value };
      const recurringSource = accountVal.startsWith('card:') ? accountVal : 'account:' + accountVal;
      txData.personIds = this.transactionPeopleDraft();
      const original = id ? this.data.transactions.find(t => t.id === id) : null;
      const splitEnabled = !!this._txSplitEnabled;
      if (splitEnabled) {
        const baseCategoryId = document.getElementById('tx-category').value || '';
        const entries = (this._txSplitParts || []).map((part, index) => {
          const line = this.readTransactionSplitPart(index, part);
          const noteId = 'tx-split-description-' + index;
          const personIds = this.transactionPeopleDraft(noteId);
          const hasNonZeroInput = raw => {
            const text = String(raw || '').trim();
            if (!text) return false;
            const value = this.evalAmount(text);
            return !Number.isFinite(value) || Math.abs(value) > 0.000001;
          };
          const quantityIsEntered = !!line.quantityRaw && (!Number.isFinite(line.quantity) || (Math.abs(line.quantity) > 0.000001 && Math.abs(line.quantity - 1) > 0.000001));
          const hasContent = !!line.description || hasNonZeroInput(line.unitRaw) || hasNonZeroInput(line.amountRaw) || personIds.length > 0 || (line.categoryId || '') !== baseCategoryId || quantityIsEntered;
          return { part, line, personIds, hasContent };
        });
        if (entries.some(entry => entry.hasContent && !entry.line.valid)) { alert('Enter a positive quantity and either a line total or price each for every split item.'); return; }
        const parts = entries.filter(entry => entry.hasContent).map(({ part, line, personIds }) => ({
          id: original ? (part.id || crypto.randomUUID()) : crypto.randomUUID(),
          description: line.description,
          categoryId: line.categoryId,
          quantity: Math.round(line.quantity * 10000) / 10000,
          quantitySpecified: part.quantitySpecified === true,
          unitAmount: Math.round(line.unitAmount * 1000000) / 1000000,
          amount: line.lineCents / 100,
          amountMode: line.amountMode,
          personIds
        }));
        if (this._txSplitRemainderEnabled) {
          if (!Number.isFinite(rawAmt) || rawAmt <= 0) { alert('Enter the full transaction total first.'); return; }
          if (!parts.length) { alert('Add at least one itemized part before saving.'); return; }
          const remainingCents = Math.round(rawAmt * 100) - parts.reduce((sum, part) => sum + Math.round(part.amount * 100), 0);
          if (remainingCents < 0) { alert('Itemized amounts exceed the transaction total by ' + this.fmtAmount(Math.abs(remainingCents) / 100, primaryCurrency) + '.'); return; }
          const previousRemainder = (original && original.parts || []).find(part => part && part.autoRemainder);
          parts.push({
            id: this._txSplitRemainderId || previousRemainder && previousRemainder.id || crypto.randomUUID(),
            description: '',
            categoryId: this._txSplitRemainderCategoryId || null,
            amount: remainingCents / 100,
            autoRemainder: true,
            personIds: []
          });
          txData.splitRemainder = true;
        } else {
          const allocation = this.transactionSplitValidation(rawAmt, parts);
          if (!allocation.valid) {
            const difference = this.fmtAmount(Math.abs(allocation.remainingCents) / 100, primaryCurrency);
            alert(allocation.remainingCents >= 0 ? 'Split parts are short by ' + difference + '.' : 'Split parts exceed the transaction total by ' + difference + '.');
            return;
          }
          delete txData.splitRemainder;
        }
        const oldParts = new Map((original && original.parts || []).map(part => [part.id, part]));
        for (const part of parts) {
          if (part.autoRemainder && !part.amount) continue;
          const previous = oldParts.get(part.id);
          if (!this.categorySelectionAllowed(part.categoryId, txDate, previous && previous.categoryId)) { alert('A split category was archived for this date. Choose another category.'); return; }
        }
        txData.parts = parts;
        txData.categoryId = parts[0] ? parts[0].categoryId : null;
      } else {
        delete txData.parts;
        delete txData.splitRemainder;
        const ruleCategory = this.recurringCategoryFor(txData.note, recurringSource);
        if (ruleCategory && this.categorySelectionAllowed(ruleCategory, txDate, txData.categoryId)) txData.categoryId = ruleCategory;
        if (!this.categorySelectionAllowed(txData.categoryId, txDate, original && original.categoryId)) { alert('That category was archived for this date. Choose another category.'); return; }
      }
      if (hasSecondary) {
        txData.nativeAmount = polarity * Math.round(Math.abs(secondaryParsed) * 100) / 100;
        txData.nativeCurrency = secondaryCurrency;
        if (splitEnabled && Array.isArray(txData.parts) && txData.parts.length) {
          txData.parts.forEach(part => { delete part.nativeAmount; delete part.nativeCurrency; });
          txData.parts[0].nativeAmount = Math.round(Math.abs(secondaryParsed) * 100) / 100;
          txData.parts[0].nativeCurrency = secondaryCurrency;
        }
      } else {
        delete txData.nativeAmount;
        delete txData.nativeCurrency;
        if (splitEnabled && Array.isArray(txData.parts)) {
          txData.parts.forEach(part => { delete part.nativeAmount; delete part.nativeCurrency; });
        }
      }
      if (accountVal.startsWith('card:')) { txData.cardId = accountVal.slice(5); txData.accountId = null; }
      else { txData.cardId = null; txData.accountId = accountVal; }
      if (id) {
        const tx = this.data.transactions.find(t => t.id === id);
        if (tx) {
          const linkedDebt = tx.debtId && (this.data.debts || []).find(debt => debt.id === tx.debtId);
          if (linkedDebt && tx.debtEntryType === 'addition') {
            const editResult = this.adjustDebtAdditionForEdit(linkedDebt, tx, txData);
            if (!editResult.ok) { this.showToast(editResult.message); return; }
          }
          if (tx.cardBillPayment) {
            const editResult = this.adjustCardBillPaymentForEdit(tx, txData);
            if (!editResult.ok) { this.showToast(editResult.message); return; }
          }
          if (tx.settlements && this.transactionSettlementFieldsChanged(tx, txData)) delete tx.settlements;
          Object.assign(tx, txData);
          if (!splitEnabled) { delete tx.parts; delete tx.splitRemainder; }
          else if (!txData.splitRemainder) delete tx.splitRemainder;
          if (!hasSecondary) { delete tx.nativeAmount; delete tx.nativeCurrency; }
          if (tx.debtId) {
            if (linkedDebt) this.syncDebtPaidDate(linkedDebt);
          }
        }
      }
      else {
        txData.id = crypto.randomUUID(); this.data.transactions.push(txData);
      }
      const wishlist = wishlistPurchaseId && !id && Array.isArray(this.data.wishlist) ? this.data.wishlist : null;
      const wishlistIndex = wishlist ? wishlist.findIndex(item => item.id === wishlistPurchaseId) : -1;
      const purchasedWishlistItem = wishlistIndex >= 0 ? wishlist[wishlistIndex] : null;
      if (purchasedWishlistItem) wishlist.splice(wishlistIndex, 1);
      this.syncViewToDate(txData.date);
      const wrap = document.querySelector('.tx-list-wrap');
      const scrollTop = wrap ? wrap.scrollTop : 0;
      const saved = await this.save({ undoable: true, label: purchasedWishlistItem ? 'Buy wishlist item' : id ? 'Edit transaction' : 'Add transaction' });
      if (!saved && purchasedWishlistItem) {
        wishlist.splice(Math.min(wishlistIndex, wishlist.length), 0, purchasedWishlistItem);
        this.data.transactions = this.data.transactions.filter(item => item.id !== txData.id);
        return;
      }
      if (saved && wishlistPurchaseId) delete form.dataset.wishlistPurchaseId;
      this.closeModal('transaction-modal'); this.renderPage(this.currentPage);
      if (saved && !id && this._copyTransactionDraft) {
        this._copyTransactionDraft = false;
        this.openLinkedTransaction(txData.id);
        this.showToast('Transaction copied');
        return;
      }
      const nw = document.querySelector('.tx-list-wrap');
      if (nw) nw.scrollTop = scrollTop;
    });
  },

});
})();
