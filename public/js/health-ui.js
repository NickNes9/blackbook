(function () {
Object.assign(window.BlackBook, {
  refreshDataHealth() {
    this._healthIssues = window.DataHealth.scan(this.data);
    const modal = document.getElementById('data-health-modal');
    if (modal && !modal.classList.contains('hidden') && this._dataToolsTab === 'check') this.renderDataHealth();
  },
  healthMarker(collection, id) {
    const issues = (this._healthIssues || []).filter(i => i.collection === collection && i.id === id && (i.kind === 'broken-link' || i.kind === 'duplicate-id'));
    if (!issues.length) return '';
    return '<button type="button" class="health-link" title="' + this.escapeHtml(issues.map(i => i.message).join('\n')) + '" aria-label="Review broken links" onclick="event.stopPropagation();BlackBook.openDataHealth()">' + this.transactionLinkIcon() + '</button>';
  },
  healthSummaryHtml() {
    const count = (this._healthIssues || []).length;
    return '<button type="button" class="btn btn-secondary" onclick="BlackBook.openDataHealth()">CHECK DATA' + (count ? ' · ' + count : '') + '</button><button type="button" class="btn btn-secondary" onclick="BlackBook.openFindReplace()">FIND &amp; REPLACE</button><button type="button" class="btn btn-secondary" onclick="BlackBook.openPeopleDirectory()">PEOPLE</button>';
  },
  dataHealthTransactionButton(ids) {
    const validIds = [...new Set(ids || [])].filter(id => (this.data.transactions || []).some(tx => tx && tx.id === id));
    if (!validIds.length) return '';
    const encoded = validIds.map(encodeURIComponent).join(',');
    return '<button type="button" class="btn btn-sm btn-secondary linked-tx-action" data-tx-ids="' + this.escapeHtml(encoded) + '" onclick="event.stopPropagation();BlackBook.openDataHealthTransactions(this.dataset.txIds.split(\',\').map(decodeURIComponent))" title="Show ' + validIds.length + ' related transaction' + (validIds.length === 1 ? '' : 's') + ' on Overview" aria-label="Show related transactions on Overview">' + this.transactionLinkIcon() + '</button>';
  },
  openDataHealth(tab = 'check') {
    this.openModal('data-health-modal');
    this.setDataToolsTab(tab);
    const modal = document.getElementById('data-health-modal');
    if (!modal._dataToolsKeysBound) {
      modal.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled)')].filter(item => item.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      modal._dataToolsKeysBound = true;
    }
  },
  setDataToolsTab(tab) {
    this._dataToolsTab = tab === 'recurring' ? 'recurring' : 'check';
    const check = this._dataToolsTab === 'check';
    document.getElementById('data-tools-check-tab').classList.toggle('btn-primary', check);
    document.getElementById('data-tools-check-tab').classList.toggle('btn-secondary', !check);
    document.getElementById('data-tools-recurring-tab').classList.toggle('btn-primary', !check);
    document.getElementById('data-tools-recurring-tab').classList.toggle('btn-secondary', check);
    document.getElementById('data-tools-check-tab').setAttribute('aria-selected', String(check));
    document.getElementById('data-tools-recurring-tab').setAttribute('aria-selected', String(!check));
    const checkPanel = document.getElementById('data-tools-check-panel');
    const recurringPanel = document.getElementById('data-tools-recurring-panel');
    checkPanel.classList.toggle('hidden', !check);
    recurringPanel.classList.toggle('hidden', check);
    checkPanel.setAttribute('aria-hidden', String(!check));
    recurringPanel.setAttribute('aria-hidden', String(check));
    checkPanel.inert = !check;
    recurringPanel.inert = check;
    if (check) {
      this._healthIssues = window.DataHealth.scan(this.data);
      this.renderDataHealth();
    } else {
      this._recurringGroups = window.DataHealth.recurring(this.data);
      this._recurringSelection = new Set();
      this.renderRecurringPayments();
    }
  },
  renderDataHealth() {
    const issues = this._healthIssues || [];
    const names = { transactions: 'Transaction', accounts: 'Account', bills: 'Bill', invoices: 'Invoice', debts: 'Debt', savingsGoals: 'Savings goal', installments: 'Card plan', categories: 'Category', creditCards: 'Credit card' };
    const transactionSummary = (tx, issue) => {
      const category = (this.data.categories || []).find(item => item.id === tx.categoryId);
      const account = (this.data.accounts || []).find(item => item.id === tx.accountId) ||
        (this.data.accounts || []).find(item => item.id === tx.fromAccountId) ||
        (this.data.accounts || []).find(item => item.id === tx.toAccountId);
      const amount = this.fmtAmount(Math.abs(Number(tx.amount) || 0), tx.currency || this.baseCurrency());
      const date = tx.date ? this.fmtDateInput(tx.date) : 'No date';
      const type = String(tx.type || 'transaction').toUpperCase();
      const repair = issue.collection === 'transactions' && ['accountId', 'fromAccountId', 'toAccountId'].includes(issue.field)
        ? this.missingAccountRepairHtml(tx, issue) : '';
      return '<div class="health-transaction-summary"><div class="health-transaction-main"><strong>' + this.escapeHtml(type) + ' · ' + this.escapeHtml(date) + ' · ' + this.escapeHtml(amount) + '</strong>' +
        '<span>' + this.transactionDescriptionHtml(tx, 'No description') + '</span></div><div class="health-transaction-meta">' +
        (category ? '<span>' + this.escapeHtml(category.name) + '</span>' : '') + (account ? '<span>' + this.escapeHtml(account.name) + '</span>' : '') +
        this.dataHealthTransactionButton(issue.relatedIds || [tx.id]) + '</div></div>' + repair;
    };
    const rows = issues.map(issue => {
      const record = (this.data[issue.collection] || []).find(item => item.id === issue.id) || {};
      const label = issue.collection === 'transactions' ? 'Transaction details' : (record.name || record.party || record.person || record.note || 'Unknown record');
      const summary = issue.collection === 'transactions' ? transactionSummary(record, issue) : '';
      const safeMessage = issue.message.replace(/\s*\([^)]*\)/g, '');
      const kind = ['accountId','fromAccountId','toAccountId'].includes(issue.field) ? 'MISSING ACCOUNT' : ({'possible-duplicate':'POSSIBLE DUPLICATE','duplicate-id':'DUPLICATE ID','broken-link':'BROKEN LINK','missing-rate':'MISSING RATE'}[issue.kind] || 'REVIEW');
      const description = issue.collection === 'transactions' ? this.transactionDescriptionHtml(record,'No description') : this.escapeHtml(label);
      const date = record.date ? this.fmtDateInput(record.date) : '';
      const amount = record.amount != null ? this.fmtAmount(record.amount,record.currency || this.baseCurrency()) : '';
      return '<details class="health-issue"><summary class="health-issue-heading"><span class="health-kind">' + kind + '</span><span class="health-issue-date">' + this.escapeHtml(date) + '</span><span class="health-issue-description">' + description + '</span><span class="' + (record.type === 'income' ? 'amt-income' : record.type === 'expense' ? 'amt-expense' : '') + '">' + this.escapeHtml(amount) + '</span><span class="health-expand">+</span></summary><div class="health-issue-body">' + summary + '<span class="health-issue-message">' + this.escapeHtml(safeMessage) + '</span></div></details>';
    }).join('');
    const missingAccounts = issues.filter(issue => ['accountId','fromAccountId','toAccountId'].includes(issue.field)).length;
    const duplicates = issues.filter(issue => ['possible-duplicate','duplicate-id'].includes(issue.kind)).length;
    document.getElementById('data-health-results').innerHTML = '<div class="data-tools-summary">' + issues.length + ' ISSUES' + (missingAccounts ? ' · ' + missingAccounts + ' MISSING ACCOUNTS' : '') + (duplicates ? ' · ' + duplicates + ' DUPLICATES TO REVIEW' : '') + '</div>' + (rows || '<div class="data-tools-empty">NO ISSUES FOUND</div>');
  },
  missingAccountRepairHtml(tx, issue) {
    const field = issue.field;
    const label = field === 'fromAccountId' ? 'TRANSFER FROM' : field === 'toAccountId' ? 'TRANSFER TO' : 'ACCOUNT';
    const currentOther = field === 'fromAccountId' ? tx.toAccountId : field === 'toAccountId' ? tx.fromAccountId : '';
    const options = (this.data.accounts || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(account =>
      '<option value="' + this.escapeHtml(account.id) + '"' + (account.id === currentOther ? ' disabled' : '') + '>' + this.escapeHtml(account.name) + ' · ' + this.escapeHtml(account.currency || this.baseCurrency()) + '</option>'
    ).join('');
    return '<div class="health-repair-row"><label>' + label + '</label><select class="input health-account-replacement" aria-label="Replacement ' + label.toLowerCase() + ' account"><option value="">Choose account</option>' + options + '</select><button type="button" class="btn btn-primary health-repair-button" data-tx-id="' + this.escapeHtml(tx.id) + '" data-field="' + field + '" onclick="BlackBook.repairMissingTransactionAccount(this)">SAVE ACCOUNT</button></div>';
  },
  async repairMissingTransactionAccount(button) {
    const txId = button && button.dataset.txId;
    const field = button && button.dataset.field;
    const row = button && button.closest('.health-repair-row');
    const accountId = row && row.querySelector('.health-account-replacement').value;
    const tx = (this.data.transactions || []).find(item => item.id === txId);
    const account = (this.data.accounts || []).find(item => item.id === accountId);
    if (!tx || !['accountId', 'fromAccountId', 'toAccountId'].includes(field) || !account) { this.showToast('Choose an available account'); return; }
    if (field === 'fromAccountId' && tx.toAccountId === accountId || field === 'toAccountId' && tx.fromAccountId === accountId) { this.showToast('A transfer must use two different accounts'); return; }
    const previous = tx[field];
    tx[field] = accountId;
    if (!(await this.save({ undoable: true, label: 'Repair missing account link' }))) {
      tx[field] = previous;
      this._healthIssues = window.DataHealth.scan(this.data);
      this.renderDataHealth();
      this.showToast('Account repair could not be saved');
      return;
    }
    this._healthIssues = window.DataHealth.scan(this.data);
    this.renderDataHealth();
    this.showToast('Account link repaired');
  },
  renderRecurringPayments() {
    const host = document.getElementById('recurring-payment-results');
    const groups = this._recurringGroups || [];
    const minimum = Math.min(12,Math.max(1,this._recurringMinEntries ?? 10));
    let threshold = document.getElementById('recurring-min-entries');
    if (!threshold) {
      const control = document.createElement('label');
      control.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0;font-size:12px;';
      control.innerHTML = '<span>MINIMUM ENTRIES <strong id="recurring-min-value"></strong></span><input type="range" id="recurring-min-entries" min="1" step="1" aria-label="Minimum entries per recurring group" style="width:180px;max-width:100%;accent-color:var(--accent)"><span id="recurring-visible-count" style="color:var(--text-dim)"></span>';
      host.before(control);
      threshold = control.querySelector('input');
      threshold.oninput = () => {
        document.getElementById('recurring-min-value').textContent = threshold.value;
        clearTimeout(this._recurringSliderTimer);
        this._recurringSliderTimer = setTimeout(() => {
          this._recurringMinEntries = Number(threshold.value);
          const visibleIds = new Set((this._recurringGroups || []).filter(group => group.transactions.length >= this._recurringMinEntries).flatMap(group => group.transactions.map(tx => tx.id)));
          this._recurringSelection = new Set([...(this._recurringSelection || [])].filter(id => visibleIds.has(id)));
          this.renderRecurringPayments();
        }, 200);
      };
    }
    threshold.max = '12';
    threshold.value = String(minimum);
    document.getElementById('recurring-min-value').textContent = minimum;
    const visibleCount = groups.filter(group => group.transactions.length >= minimum).length;
    document.getElementById('recurring-visible-count').textContent = visibleCount + ' of ' + groups.length + ' groups';
    const savedRules = this.data.recurringRules || [];
    const rulesHtml = savedRules.length ? '<div class="recurring-saved-rules"><strong>SAVED MATCH RULES</strong>' + savedRules.map(rule => {
      const category = rule.categoryId && (this.data.categories || []).find(item => item.id === rule.categoryId);
      return '<div><span>' + this.escapeHtml(rule.action === 'ignore' ? 'DISREGARD' : 'CATEGORY → ' + (category ? category.name : 'Missing category')) + ' · “' + this.escapeHtml(rule.match) + '”</span><button type="button" class="btn btn-sm btn-secondary" onclick="BlackBook.deleteRecurringRule(\'' + this.escapeHtml(rule.id) + '\')">REMOVE</button></div>';
    }).join('') + '</div>' : '';
    if (!groups.length) {
      host.innerHTML = rulesHtml + '<div class="data-tools-empty">NO RECURRING GROUPS FOUND</div>';
      this.compactRecurringActions(host);
      return;
    }
    if (!visibleCount) {
      host.innerHTML = rulesHtml + '<div class="data-tools-empty">NO GROUPS AT THIS MINIMUM · LOWER THE SLIDER</div>';
      this.compactRecurringActions(host);
      return;
    }
    host.innerHTML = rulesHtml + '<p class="health-explanation">Similar descriptions are grouped by account, currency, and recurring timing. Select entries to standardize their description, or turn a group into a bill.</p>' + groups.map((group, index) => {
      if (group.transactions.length < minimum) return '';
      const sourceParts = group.source.split(':');
      const source = sourceParts[0] === 'card'
        ? (this.data.creditCards || []).find(item => item.id === sourceParts[1])
        : (this.data.accounts || []).find(item => item.id === sourceParts[1]);
      const range = (group.amountRanges || [{currency:group.currency,min:group.amountMin,max:group.amountMax}]).map(item => this.fmtAmount(item.min,item.currency) + (Math.abs(item.max-item.min) > 0.009 ? '–' + this.fmtAmount(item.max,item.currency) : '')).join(' · ');
      const canCreateBill = group.transactions.some(tx => tx.type === 'expense');
      const accountCount = (group.sources || [group.source]).length;
      const incomeCount = group.transactions.filter(tx => tx.type === 'income').length;
      const expenseCount = group.transactions.filter(tx => tx.type === 'expense').length;
      const groupMeta = group.transactions.length + ' ENTRIES · ' + (incomeCount ? incomeCount + ' INCOME · ' : '') + (expenseCount ? expenseCount + ' EXPENSES · ' : '') + (accountCount > 1 ? accountCount + ' ACCOUNTS' : source ? source.name : 'Missing account') + ' · ' + (group.cadence === 'irregular' ? 'SIMILAR DESCRIPTIONS' : group.cadence === 'mixed' ? 'MIXED TIMING' : 'POSSIBLY ' + group.cadence.toUpperCase());
      const rows = group.transactions.slice().sort((a, b) => String(a.note || '').localeCompare(String(b.note || ''), undefined, { sensitivity: 'base' }) || String(a.date).localeCompare(String(b.date))).map(tx => {
        const selected = this._recurringSelection?.has(tx.id) || false;
        const category = (this.data.categories || []).find(item => item.id === tx.categoryId);
        const signedAmount = (tx.type === 'income' ? 1 : -1) * Math.abs(tx.nativeAmount ?? tx.amount);
        return '<div class="recurring-occurrence selection-row' + (selected ? ' is-selected' : '') + '" role="checkbox" tabindex="0" aria-checked="' + selected + '" data-recurring-group="' + index + '" data-tx-id="' + this.escapeHtml(tx.id) + '" onclick="BlackBook.toggleRecurringOccurrence(this)" onkeydown="if(event.target===this && (event.key===\x27 \x27 || event.key===\x27Enter\x27)){event.preventDefault();event.stopPropagation();BlackBook.toggleRecurringOccurrence(this)}"><span class="recurring-date">' + this.escapeHtml(this.fmtDateInput(tx.date)) + '</span><span class="recurring-category" style="color:' + this.escapeHtml(category ? this.categoryColor(category) : 'var(--text-dim)') + '">' + this.escapeHtml(category?.name || 'Uncategorized') + '</span><span class="recurring-description">' + this.transactionDescriptionHtml(tx, group.description) + '</span><span class="recurring-amount ' + (tx.type === 'income' ? 'amt-income' : 'amt-expense') + '">' + this.escapeHtml(this.fmtAmount(signedAmount, tx.nativeCurrency || tx.currency || group.currency)) + '</span><button type="button" class="btn btn-sm btn-secondary" data-recurring-group="' + index + '" data-tx-id="' + this.escapeHtml(tx.id) + '" onclick="event.stopPropagation();BlackBook.openRecurringTransactionFrom(this)">EDIT</button></div>';
      }).join('');
      const matchText = group.description || '';
      const categoryOptions = this.categoriesAvailableOn(this.today()).map(category => '<option value="' + this.escapeHtml(category.id) + '"' + (category.id === group.categoryId ? ' selected' : '') + '>' + this.escapeHtml(category.name) + '</option>').join('');
      const billOptions = (this.data.bills || []).map(bill => '<option value="' + this.escapeHtml(bill.id) + '">' + this.escapeHtml(bill.name + (bill.active === false ? ' (INACTIVE)' : '')) + '</option>').join('');
      const billAction = canCreateBill ? '<div class="recurring-bill-action"><select class="input" data-recurring-bill="' + index + '"><option value="">MAKE THIS A BILL…</option><option value="__new__">Create a new bill</option>' + billOptions + '</select><button type="button" class="btn btn-primary" onclick="BlackBook.convertRecurringToBill(' + index + ')">CONTINUE</button></div>' : '';
      return '<article class="recurring-group"><details><summary class="recurring-group-header"><div><h3>' + this.escapeHtml(group.description) + '</h3><span>' + this.escapeHtml(groupMeta) + '</span></div><strong>' + this.escapeHtml(range) + '</strong></summary><div class="recurring-occurrences">' + rows + '</div><div class="recurring-group-actions"><button type="button" class="btn btn-secondary" onclick="BlackBook.editRecurringGroup(' + index + ')">BULK EDIT</button><button type="button" class="btn btn-secondary" onclick="BlackBook.unifyRecurringDescription(' + index + ')">UNIFY DESCRIPTION</button></div><label class="recurring-unify-label">STANDARD DESCRIPTION<input class="input" data-recurring-unify="' + index + '" value="' + this.escapeHtml(matchText) + '"></label>' + billAction + '<details class="recurring-rule-details"><summary>RULES</summary><div class="recurring-rule-tools"><label>MATCH TEXT<input class="input" data-recurring-match="' + index + '" value="' + this.escapeHtml(matchText) + '"></label><div class="recurring-group-actions"><select class="input" data-recurring-category="' + index + '"><option value="">CATEGORY RULE…</option>' + categoryOptions + '</select><button type="button" class="btn btn-secondary" onclick="BlackBook.saveRecurringCategoryRule(' + index + ')">SAVE CATEGORY RULE</button><button type="button" class="btn btn-secondary" onclick="BlackBook.ignoreRecurringGroup(' + index + ')">DISREGARD MATCH</button></div></div></details></details></article>';
    }).join('');
    this.compactRecurringActions(host);
  },
  compactRecurringActions(host) {
    const saved = host.querySelector('.recurring-saved-rules');
    if (saved) {
      const details = document.createElement('details'); details.className = 'recurring-saved-rules';
      const title = document.createElement('summary'); title.textContent = 'SAVED RULES · ' + (this.data.recurringRules || []).length;
      saved.querySelector(':scope > strong')?.remove();
      details.append(title,...saved.childNodes); saved.remove(); host.append(details);
    }
    host.querySelector(':scope > .health-explanation')?.remove();
    host.querySelectorAll('.recurring-group').forEach(group => {
      const details = group.querySelector(':scope > details');
      const actions = group.querySelector('.recurring-group-actions');
      if (!actions) return;
      const toolbar = document.createElement('div'); toolbar.className = 'recurring-match-row';
      const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'btn btn-secondary'; editButton.textContent = 'BULK EDIT';
      const index = Number(group.querySelector('.recurring-occurrence').dataset.recurringGroup);
      editButton.onclick = () => this.openRecurringGroupInFindReplace(index);
      group.querySelector('.recurring-unify-label')?.remove();
      const bill = group.querySelector('.recurring-bill-action');
      const rules = group.querySelector('.recurring-rule-details');
      let categoryRow;
      if (rules) {
        const match = rules.querySelector('.recurring-rule-tools > label');
        match.classList.add('recurring-match-field');
        toolbar.append(match, editButton, rules.querySelector('button[onclick*="ignoreRecurringGroup"]'));
        categoryRow = document.createElement('div'); categoryRow.className = 'recurring-control-row';
        categoryRow.append(rules.querySelector('select'), rules.querySelector('button[onclick*="saveRecurringCategoryRule"]'));
        rules.remove();
      }
      actions.remove();
      details.append(toolbar);
      const ruleRow = document.createElement('div'); ruleRow.className = 'recurring-rules-row';
      if (bill) { bill.classList.add('recurring-control-row'); ruleRow.append(bill); }
      if (categoryRow) ruleRow.append(categoryRow);
      details.append(ruleRow);
    });
  },
  openRecurringGroupInFindReplace(index) {
    const entries = this.recurringSelection(index);
    if (!entries.length) return;
    this.closeModal('data-health-modal');
    this.openFindReplace(false,entries.map(tx => tx.id));
  },
  toggleRecurringOccurrence(input) {
    const selected = this._recurringSelection || (this._recurringSelection = new Set());
    const included = !selected.has(input.dataset.txId);
    if (included) selected.add(input.dataset.txId); else selected.delete(input.dataset.txId);
    input.classList.toggle('is-selected', included);
    input.setAttribute('aria-checked', String(included));
    const groupIndex = Number(input.dataset.recurringGroup);
    const group = this._recurringGroups[groupIndex];
    const groupIds = new Set(group.transactions.map(tx => tx.id));
    const count = [...selected].filter(id => groupIds.has(id)).length;
    const button = document.querySelector('[data-recurring-merge="' + groupIndex + '"]');
    if (button) button.disabled = count < 2;
  },
  recurringSelection(index, useAll = true) {
    const group = (this._recurringGroups || [])[index];
    if (!group) return [];
    const selected = new Set(this._recurringSelection || []);
    const matches = group.transactions.filter(tx => selected.has(tx.id));
    return matches.length || !useAll ? matches : group.transactions.slice();
  },
  openRecurringTransaction(index, txId) {
    if (!(this._recurringGroups || [])[index]?.transactions.some(tx => tx.id === txId)) return;
    this.openLinkedTransaction(txId);
  },
  openRecurringTransactionFrom(button) { this.openRecurringTransaction(Number(button.dataset.recurringGroup), button.dataset.txId); },
  recurringRuleMatch(index) { return (document.querySelector('[data-recurring-match="' + index + '"]') || {}).value?.trim() || ''; },
  async unifyRecurringDescription(index) {
    const group = (this._recurringGroups || [])[index];
    const value = (document.querySelector('[data-recurring-unify="' + index + '"]') || {}).value?.trim();
    if (!group || !value) { this.showToast('Enter the description to use'); return; }
    const selected = new Set(this._recurringSelection || []);
    const targets = this.recurringSelection(index);
    for (const tx of targets) tx.note = value;
    if (!(await this.save({ undoable: true, label: 'Unify recurring descriptions' }))) return;
    this._recurringSelection = new Set();
    this._recurringGroups = window.DataHealth.recurring(this.data);
    this.renderRecurringPayments();
    this.showToast(targets.length + ' descriptions unified');
  },
  convertRecurringToBill(index) {
    const selected = (document.querySelector('[data-recurring-bill="' + index + '"]') || {}).value;
    if (selected === '__new__') return this.createBillFromRecurring(index);
    if (selected) return this.linkRecurringGroupToBill(index);
    this.showToast('Choose an existing bill or create a new one');
  },
  async deleteRecurringRule(id) {
    const previous = this.data.recurringRules || [];
    this.data.recurringRules = previous.filter(rule => rule.id !== id);
    if (!(await this.save({ undoable: true, label: 'Remove recurring rule' }))) { this.data.recurringRules = previous; return; }
    this._recurringGroups = window.DataHealth.recurring(this.data);
    this.renderRecurringPayments();
    this.showToast('Saved rule removed');
  },
  async saveRecurringCategoryRule(index) {
    const group = (this._recurringGroups || [])[index];
    const categoryId = (document.querySelector('[data-recurring-category="' + index + '"]') || {}).value;
    const match = this.recurringRuleMatch(index);
    if (!group || !categoryId || !match || !match.replace(/[^\p{L}\p{N}]/gu, '')) { this.showToast('Choose a category and enter match text'); return; }
    this.data.recurringRules = this.data.recurringRules || [];
    const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const sources = group.sources || [group.source];
    this.data.recurringRules = this.data.recurringRules.filter(rule => !(rule.action === 'category' && normalize(rule.match) === normalize(match) && sources.includes(rule.source)));
    for (const source of sources) this.data.recurringRules.push({ id: crypto.randomUUID(), action: 'category', match, source, categoryId, active: true });
    for (const tx of group.transactions) {
      if (normalize(tx.note).includes(normalize(match)) && this.categorySelectionAllowed(categoryId, tx.date, tx.categoryId)) tx.categoryId = categoryId;
    }
    if (!(await this.save({ undoable: true, label: 'Save recurring category rule' }))) return;
    this.refreshDataHealth();
    this._recurringGroups = window.DataHealth.recurring(this.data);
    this.renderRecurringPayments();
    this.showToast('Category rule saved');
  },
  async ignoreRecurringGroup(index) {
    const group = (this._recurringGroups || [])[index];
    const match = this.recurringRuleMatch(index);
    if (!group || !match || !match.replace(/[^\p{L}\p{N}]/gu, '')) { this.showToast('Enter the text to disregard'); return; }
    this.data.recurringRules = this.data.recurringRules || [];
    const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const sources = group.sources || [group.source];
    this.data.recurringRules = this.data.recurringRules.filter(rule => !(rule.action === 'ignore' && normalize(rule.match) === normalize(match) && sources.includes(rule.source)));
    for (const source of sources) this.data.recurringRules.push({ id: crypto.randomUUID(), action: 'ignore', match, source, active: true });
    if (!(await this.save({ undoable: true, label: 'Disregard recurring match' }))) return;
    this.refreshDataHealth();
    this._recurringGroups = window.DataHealth.recurring(this.data);
    this.renderRecurringPayments();
    this.showToast('Recurring match will be disregarded');
  },
  async linkRecurringGroupToBill(index) {
    const group = (this._recurringGroups || [])[index];
    const billId = (document.querySelector('[data-recurring-bill="' + index + '"]') || {}).value;
    const bill = (this.data.bills || []).find(item => item.id === billId);
    if (!group || !bill) { this.showToast('Choose a bill to link'); return; }
    const selectedIds = new Set(this._recurringSelection || []);
    const transactions = this.recurringSelection(index).filter(tx => tx.type === 'expense');
    if (!transactions.length) { this.showToast('Select expense entries to link'); return; }
    const payments = this.data.billPayments || (this.data.billPayments = []);
    const links = transactions.map(tx => {
      const { y, m } = this.ymOf(tx.date);
      const month = y + '-' + String(m + 1).padStart(2, '0');
      return { tx, month, existing: payments.find(payment => payment.billId === bill.id && payment.month === month) };
    });
    const invalidMonths = links.filter(link => !this.billOccursInMonth(bill, link.month));
    if (invalidMonths.length) { this.showToast('This bill is not scheduled for ' + invalidMonths.length + ' selected month(s)'); return; }
    let changed = 0;
    for (const link of links) {
      const linkedElsewhere = this.billPaymentForTx(link.tx.id);
      if (linkedElsewhere && linkedElsewhere !== link.existing) continue;
      let payment = link.existing;
      if (!payment) {
        payment = { billId: bill.id, month: link.month, paid: true, relatedTxIds: [] };
        payments.push(payment);
      }
      const ids = new Set(this.billPaymentTransactionIds(payment));
      if (ids.has(link.tx.id)) continue;
      // Replacing a generated placeholder with real historical entries avoids
      // counting the bill's synthetic transaction alongside the actual charges.
      if ([...ids].length && [...ids].every(id => String(id).startsWith('bil-'))) this.removeBillTransaction(payment);
      payment.paid = true;
      payment.relatedTxIds = [...new Set([...this.billPaymentTransactionIds(payment), link.tx.id])];
      this.syncBillPaymentTransactions(payment, bill);
      changed++;
    }
    if (!changed) { this.showToast('These entries are already linked or belong to another bill'); return; }
    if (!(await this.save({ undoable: true, label: 'Link recurring payments to bill' }))) return;
    this._recurringGroups = window.DataHealth.recurring(this.data);
    this.renderRecurringPayments();
    this.showToast(changed + ' payment(s) linked to ' + bill.name);
  },
  editRecurringGroup(index) {
    const txs = this.recurringSelection(index);
    if (!txs.length) return;
    this.closeModal('data-health-modal');
    this._bulkSel = new Set(txs.map(tx => tx.id));
    this._bulkOnly = false;
    if (txs.length === 1) this.openEditTransaction(txs[0].id); else this.openBulkEdit();
  },
  async mergeRecurringSelection(index) {
    const txs = this.recurringSelection(index, false);
    if (txs.length < 2) return;
    const ok = await this.confirmModal({ title: 'Merge Recurring Entries?', message: 'These may be separate recurring charges. Merging removes the selected entries and combines them into one transaction. Continue only if you selected duplicates.', confirmText: 'Continue' });
    if (!ok) return;
    this.closeModal('data-health-modal');
    this._bulkSel = new Set(txs.map(tx => tx.id));
    this.openMergeModal();
  },
  createBillFromRecurring(index) {
    const group = (this._recurringGroups || [])[index];
    if (!group) return;
    const selectedIds = new Set(this._recurringSelection || []);
    const candidates = this.recurringSelection(index).filter(tx => tx.type === 'expense');
    if (!candidates.length) { this.showToast('Select expense entries to create a bill'); return; }
    const transactionIds = candidates.filter(tx => tx.type === 'expense').map(tx => tx.id);
    const exemplar = candidates.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
    const accountRef = exemplar.cardId ? 'card:' + exemplar.cardId : exemplar.accountId;
    this.closeModal('data-health-modal');
    this.openNewBill();
    this._pendingRecurringBillTxIds = transactionIds;
    document.getElementById('bill-name').value = group.description;
    document.getElementById('bill-amount').value = String(Math.abs(exemplar.nativeAmount ?? exemplar.amount));
    document.getElementById('bill-currency').value = exemplar.nativeCurrency || exemplar.currency || this.baseCurrency();
    const payFrom = document.getElementById('bill-payfrom');
    payFrom.innerHTML = this.accountSelectOptions(accountRef);
    if (!accountRef.startsWith('card:')) {
      const accountId = accountRef;
      if (![...payFrom.options].some(option => option.value === accountId)) {
        const account = (this.data.accounts || []).find(item => item.id === accountId);
        if (account) payFrom.insertAdjacentHTML('afterbegin', '<option value="' + this.escapeHtml(account.id) + '">' + this.escapeHtml(account.name + ' (Hidden)') + '</option>');
      }
      payFrom.value = accountId;
    } else payFrom.value = accountRef;
    if (group.categoryId && this.categoriesAvailableOn(this.today()).some(category => category.id === group.categoryId)) {
      document.getElementById('bill-category').value = group.categoryId;
      const category = this.data.categories.find(item => item.id === group.categoryId);
      document.getElementById('bill-category-input').value = category ? category.name.toUpperCase() : '';
    } else {
      document.getElementById('bill-category').value = '';
      document.getElementById('bill-category-input').value = '';
    }
    document.getElementById('bill-dueDay').value = String(Number(exemplar.date.slice(8,10)));
    document.getElementById('bill-frequency-toggle').dataset.frequency = group.cadence === 'annual' ? 'annual' : 'monthly';
    document.getElementById('bill-dueMonth').value = String(Number(exemplar.date.slice(5,7)));
    this.updateBillFrequencyFields();
    this.updateBillAmountLabel();
  }
});
})();
