(function () {
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens = /#(description|date|month|year|account|category|person)\b/g;
  const descriptionMatches = (note, text, wholeWord) => !text || (wholeWord
    ? new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegex(text) + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(String(note || ''))
    : String(note || '').toLocaleLowerCase().includes(text.toLocaleLowerCase()));
  const filterMatch = (value, condition, negated) => !value || (negated ? !condition : condition);
  const matches = (tx, filter) => (!filter.ids || filter.ids.includes(tx.id)) && descriptionMatches(tx.note, filter.find, filter.wholeWord) &&
    (!filter.type || tx.type === filter.type) && filterMatch(filter.category, filter.category === '__none__' ? !tx.categoryId : tx.categoryId === filter.category, filter.notCategory) &&
    filterMatch(filter.account, filter.account === '__none__' ? ![tx.accountId, tx.fromAccountId, tx.toAccountId, tx.cardId].some(Boolean) : [tx.accountId, tx.fromAccountId, tx.toAccountId, tx.cardId && 'card:' + tx.cardId].includes(filter.account), filter.notAccount) &&
    filterMatch(filter.person, filter.person === '__none__' ? !(tx.personIds || []).length : (tx.personIds || []).includes(filter.person), filter.notPerson) && (!filter.from || tx.date >= filter.from) && (!filter.to || tx.date <= filter.to);
  const rewrite = (tx, find, replacement, mode, values) => {
    const expanded = replacement.replace(tokens, (_, token) => String(values[token] ?? ''));
    return mode === 'rewrite' ? expanded : String(tx.note || '').replace(new RegExp(escapeRegex(find), 'gi'), () => expanded);
  };
  window.TransactionTools = { matches, rewrite };
  Object.assign(window.BlackBook, {
    personColor(person) {
      return /^#[0-9a-f]{6}$/i.test(person.color || '') ? person.color : this.colorForName(person.name || person.id);
    },
    personNameHtml(person, mention = true) {
      return '<strong class="person-mention" style="color:' + this.personColor(person) + '">' + this.escapeHtml((mention ? '@' : '') + person.name) + '</strong>';
    },
    transactionDescriptionHtml(tx, fallback = '') {
      const note = String(tx.note || fallback);
      const people = (this.data.people || []).filter(p => p.name).slice().sort((a,b) => b.name.length - a.name.length);
      if (!people.length) return this.escapeHtml(note);
      const pattern = new RegExp('(^|[^\\p{L}\\p{N}_@])(@?)(' + people.map(p => escapeRegex(p.name)).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'giu');
      let html = '', cursor = 0;
      for (const match of note.matchAll(pattern)) {
        html += this.escapeHtml(note.slice(cursor, match.index) + match[1]);
        const person = people.find(p => p.name.toLocaleLowerCase() === match[3].toLocaleLowerCase());
        html += match[2] || (tx.personIds || []).includes(person.id) ? this.personNameHtml(person, !!match[2]) : this.escapeHtml(match[3]);
        cursor = match.index + match[0].length;
      }
      return html + this.escapeHtml(note.slice(cursor));
    },
    toolsModal(id, title, body) {
      let modal = document.getElementById(id);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = id; modal.className = 'modal hidden';
        modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', id + '-title');
        modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content transaction-tools-modal"><div class="modal-header"><h2 id="' + id + '-title">' + title + '</h2><button type="button" class="modal-close" aria-label="Close">×</button></div>' + body + '</div>';
        modal.querySelector('.modal-backdrop').onclick = modal.querySelector('.modal-close').onclick = () => this.closeModal(id);
        modal.querySelector('.modal-backdrop').addEventListener('wheel', event => event.preventDefault(), { passive:false });
        modal.querySelector('.modal-backdrop').addEventListener('touchmove', event => event.preventDefault(), { passive:false });
        modal.addEventListener('keydown', event => {
          if (event.key !== 'Tab') return;
          const items = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(item => item.offsetParent !== null);
          if (!items.length) return;
          if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length-1].focus(); }
          else if (!event.shiftKey && document.activeElement === items[items.length-1]) { event.preventDefault(); items[0].focus(); }
        });
        document.body.appendChild(modal);
      }
      return modal;
    },
    peopleOptions(blank = 'All people') {
      return '<option value="">' + blank + '</option>' + (this.data.people || []).slice().sort((a,b) => a.name.localeCompare(b.name)).map(person => '<option value="' + this.escapeHtml(person.id) + '">' + this.escapeHtml(person.name) + '</option>').join('');
    },
    openFindReplace(restoreCustom = false, transactionIds = null) {
      const modal = this.toolsModal('find-replace-modal', 'Find & Replace',
        '<div class="tools-grid"><label>Description contains<input id="replace-find" class="input"></label><label>Account<select id="replace-account" class="input"></select></label><label>Category<select id="replace-category" class="input"></select></label><label>Type<select id="replace-type" class="input"><option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select></label><label>From date<input id="replace-from" class="input"></label><label>To date<input id="replace-to" class="input"></label><label>Person<select id="replace-person" class="input"></select></label><label>Action<select id="replace-mode" class="input"><option value="replace">Replace text</option><option value="rewrite">Rewrite description</option><option value="assign-person">Assign person</option></select></label></div>' +
        '<div class="tools-grid"><label class="tools-field" id="replace-needle-field">Text to replace<input id="replace-needle" class="input"></label><label class="tools-field"><span id="replace-text-label">New text</span><input id="replace-text" class="input"></label></div><p id="replace-action-help" class="health-explanation"></p><p class="health-explanation">#description · #date · #month · #year · #account · #category. Use @Name for people. Search is plain text, case-insensitive. Preview before applying.</p>' +
        '<div class="tools-grid" id="replace-target-person-field" hidden><label class="tools-field">Assign person<select id="replace-target-person" class="input"></select></label><label class="tools-field">Name to replace (optional)<input id="replace-person-name" class="input" placeholder="Name currently in the description"></label></div><div class="tools-actions"><button id="replace-preview" class="btn btn-secondary">PREVIEW</button><button id="replace-apply" class="btn btn-primary" disabled>APPLY</button><span id="replace-count"></span></div><div id="replace-results" class="tools-scroll"></div>');
      modal.querySelector('#replace-account').innerHTML = '<option value="">All accounts</option>' + (this.data.accounts || []).map(a => '<option value="' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + '</option>').join('') + (this.data.creditCards || []).map(a => '<option value="card:' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + '</option>').join('');
      modal.querySelector('#replace-category').innerHTML = '<option value="">All categories</option>' + (this.data.categories || []).map(c => '<option value="' + this.escapeHtml(c.id) + '">' + this.escapeHtml(c.name) + '</option>').join('');
      modal.querySelector('#replace-person').innerHTML = this.peopleOptions();
      this._replaceNegated = {};
      for (const field of ['person','category','account']) {
        let button = modal.querySelector('#replace-not-' + field);
        if (!button) {
          const select = modal.querySelector('#replace-' + field);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;';
          button = document.createElement('button'); button.type = 'button'; button.id = 'replace-not-' + field;
          button.style.cssText = 'width:var(--control-h,32px);min-width:var(--control-h,32px);height:var(--control-h,32px);flex-shrink:0;padding:4px;';
          button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14M16 4L8 20" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
          select.before(row); select.style.minWidth = '0'; row.append(select,button);
        }
        const update = () => {
          const negated = !!this._replaceNegated[field];
          button.className = 'btn btn-icon ' + (negated ? 'btn-primary' : 'btn-secondary');
          button.setAttribute('aria-pressed',String(negated));
          button.setAttribute('aria-label','Exclude selected ' + field);
          button.title = (negated ? 'Exclude' : 'Include') + ' selected ' + field + ' · click to invert';
        };
        update();
        button.onclick = () => { this._replaceNegated[field] = !this._replaceNegated[field]; update(); this.previewDescriptionChanges(true); };
      }
      const actionSelect = modal.querySelector('#replace-mode');
      if (!modal.querySelector('#replace-custom')) {
        const custom = document.createElement('button');
        custom.type = 'button'; custom.id = 'replace-custom'; custom.className = 'btn btn-secondary'; custom.textContent = 'CUSTOM';
        custom.title = 'Use these search filters on Overview';
        modal.querySelector('#replace-preview').before(custom);
      }
      modal.querySelector('#replace-custom').onclick = () => this.applyCustomOverviewFilter();
      this._replaceGroupIds = transactionIds ? [...new Set(transactionIds)] : restoreCustom && this._overviewCustomFilter?.profile === this.profile ? this._overviewCustomFilter.filter.ids || null : null;
      let scope = modal.querySelector('#replace-group-scope');
      if (!scope) {
        scope = document.createElement('div'); scope.id = 'replace-group-scope'; scope.className = 'tools-actions';
        modal.querySelector('.tools-grid').before(scope);
      }
      scope.hidden = !this._replaceGroupIds;
      scope.innerHTML = this._replaceGroupIds ? '<span>GROUP · ' + this._replaceGroupIds.length + ' ENTRIES</span><button type="button" class="btn btn-secondary" id="replace-clear-group">CLEAR GROUP</button>' : '';
      if (this._replaceGroupIds) scope.querySelector('button').onclick = () => { this._replaceGroupIds = null; scope.hidden = true; this.previewDescriptionChanges(true); };
      if (!modal.querySelector('#replace-match-mode')) {
        const button = document.createElement('button');
        button.id = 'replace-match-mode'; button.type = 'button'; button.className = 'btn btn-secondary btn-icon';
        button.style.cssText = 'width:var(--control-h,32px);min-width:var(--control-h,32px);height:var(--control-h,32px);flex-shrink:0;padding:4px;';
        button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6v12M21 6v12" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" fill="currentColor" font-family="monospace" font-size="12" font-weight="700">ab</text></svg>';
        const input = modal.querySelector('#replace-find');
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;';
        input.before(row); input.style.minWidth = '0'; row.append(input,button);
      }
      this._replaceWholeWord = false;
      const matchButton = modal.querySelector('#replace-match-mode');
      const updateMatchButton = () => {
        matchButton.title = this._replaceWholeWord ? 'Whole word: match complete words or phrases' : 'Partial: match text anywhere, including inside words';
        matchButton.setAttribute('aria-label', 'Whole-word matching');
        matchButton.setAttribute('aria-pressed',String(this._replaceWholeWord));
        matchButton.classList.toggle('btn-primary',this._replaceWholeWord);
        matchButton.classList.toggle('btn-secondary',!this._replaceWholeWord);
      };
      updateMatchButton();
      matchButton.classList.remove('btn-primary'); matchButton.classList.add('btn-secondary');
      matchButton.onclick = () => {
        this._replaceWholeWord = !this._replaceWholeWord;
        updateMatchButton();
        this.previewDescriptionChanges(true);
      };
      if (!actionSelect.querySelector('[value="set-category"]')) {
        actionSelect.insertAdjacentHTML('beforeend', '<option value="set-category">Set category</option><option value="delete">Delete transactions</option><option value="remove-person">Remove person</option><option value="link-bill">Link to bill</option><option value="set-account">Set account</option>');
        modal.querySelector('.tools-actions').insertAdjacentHTML('beforebegin', '<div class="tools-grid" id="replace-extra-fields" hidden><label class="tools-field"><span id="replace-target-label">Target</span><select id="replace-target" class="input"></select></label><label class="tools-field" id="replace-account-side-field" hidden>Change<select id="replace-account-side" class="input"><option value="accountId">Transaction account</option><option value="fromAccountId">Transfer source</option><option value="toAccountId">Transfer destination</option></select></label></div>');
      }
      for (const [field, label] of [['person','No person'], ['category','No category'], ['account','No account']]) {
        const select = modal.querySelector('#replace-' + field);
        select.options[0].insertAdjacentHTML('afterend', '<option value="__none__">' + label + '</option>');
      }
      modal.querySelector('#replace-target-person').innerHTML = '<option value="">Choose a person</option>' + (this.data.people || []).slice().sort((a,b) => a.name.localeCompare(b.name)).map(p => '<option value="' + this.escapeHtml(p.id) + '">@' + this.escapeHtml(p.name) + '</option>').join('');
      modal.querySelectorAll('input,select').forEach(field => {
        field.value = field.id === 'replace-mode' ? 'replace' : field.id === 'replace-account-side' ? 'accountId' : '';
        field.oninput = () => {
          this._replacePreview = null;
          modal.querySelector('#replace-apply').disabled = true;
          this.updateReplaceAction();
          clearTimeout(this._replaceLiveTimer);
          this._replaceLiveTimer = setTimeout(() => {
            if (!modal.classList.contains('hidden')) this.previewDescriptionChanges(true);
          }, 150);
        };
      });
      modal.querySelector('#replace-preview').onclick = () => this.previewDescriptionChanges();
      modal.querySelector('#replace-apply').onclick = () => this.applyDescriptionChanges();
      this._replacePreview = null;
      clearTimeout(this._replaceLiveTimer);
      this._replaceIncluded = new Set();
      modal.querySelector('#replace-results').innerHTML = ''; modal.querySelector('#replace-count').textContent = '';
      modal.querySelector('#replace-apply').disabled = true;
      this.updateReplaceAction();
      this.openModal('find-replace-modal');
      if (restoreCustom && this._overviewCustomFilter?.profile === this.profile) {
        const filter = this._overviewCustomFilter.filter;
        for (const field of ['find','account','category','type','person']) modal.querySelector('#replace-' + field).value = filter[field] || (field === 'account' ? this.selectedAccount || '' : '');
        for (const field of ['from','to']) modal.querySelector('#replace-' + field).value = filter[field] ? this.fmtDateInput(filter[field]) : '';
        if (filter.wholeWord) modal.querySelector('#replace-match-mode').click();
        for (const field of ['person','category','account']) if (filter['not' + field[0].toUpperCase() + field.slice(1)]) modal.querySelector('#replace-not-' + field).click();
        modal.querySelectorAll('select').forEach(select => this.syncCustomSelect(select));
        this.previewDescriptionChanges(true);
      }
      if (this._replaceGroupIds && !restoreCustom) this.previewDescriptionChanges(true);
      modal.querySelector('#replace-find').focus();
    },
    updateReplaceAction() {
      const mode = document.getElementById('replace-mode').value;
      const rewrite = mode === 'rewrite';
      const assign = mode === 'assign-person';
      const textAction = mode === 'replace' || rewrite;
      document.getElementById('replace-needle-field').hidden = mode !== 'replace';
      document.getElementById('replace-text').closest('label').hidden = !textAction;
      document.getElementById('replace-target-person-field').hidden = !assign;
      document.getElementById('replace-text-label').textContent = rewrite ? 'New description' : 'New text';
      const extra = ['set-category','remove-person','link-bill','set-account'].includes(mode);
      document.getElementById('replace-extra-fields').hidden = !extra;
      document.getElementById('replace-account-side-field').hidden = mode !== 'set-account';
      const target = document.getElementById('replace-target');
      if (target.dataset.mode !== mode) {
        target.dataset.mode = mode;
        const entries = mode === 'set-category' ? this.data.categories || [] : mode === 'remove-person' ? this.data.people || [] : mode === 'link-bill' ? this.data.bills || [] : mode === 'set-account' ? [...(this.data.accounts || []), ...(this.data.creditCards || []).map(card => ({...card,id:'card:' + card.id}))] : [];
        document.getElementById('replace-target-label').textContent = mode === 'set-category' ? 'Category' : mode === 'remove-person' ? 'Person to remove' : mode === 'link-bill' ? 'Bill' : 'Account';
        target.innerHTML = '<option value="">Choose…</option>' + (mode === 'remove-person' ? '<option value="__all__">All people</option>' : '') + entries.slice().sort((a,b) => a.name.localeCompare(b.name)).map(item => '<option value="' + this.escapeHtml(item.id) + '">' + this.escapeHtml((mode === 'remove-person' ? '@' : '') + item.name + (mode === 'set-account' ? ' · ' + (item.currency || this.baseCurrency()) : '')) + '</option>').join('');
      }
      const help = {
        'assign-person':'Add this person without removing existing people. Optionally replace a name with @Name; dates and the rest of the description stay unchanged.',
        rewrite:'Replace the entire description of each matching transaction with the new description.',
        replace:'Replace only the specified text; keep the rest of each description unchanged.',
        'set-category':'Set the category on matching transactions. Categories archived for a transaction’s date are skipped.',
        delete:'Delete selected transactions after confirmation. Linked payments are reversed; Undo restores the batch.',
        'remove-person':'Remove the chosen person, or all person tags. Description text stays unchanged.',
        'link-bill':'Link existing expense transactions to a bill and mark their months paid. No new transactions are created. Conflicting links are skipped.',
        'set-account':'Change the selected account or transfer side. Exact currency values are preserved; incompatible currencies and protected linked records are skipped.'
      };
      document.getElementById('replace-action-help').textContent = help[mode];
      document.getElementById('replace-apply').classList.toggle('btn-danger', mode === 'delete');
      document.getElementById('replace-apply').classList.toggle('btn-primary', mode !== 'delete');
    },
    applyCustomOverviewFilter() {
      const value = id => document.getElementById('replace-' + id).value;
      const filter = {find:value('find').trim(),account:value('account'),category:value('category'),type:value('type'),person:value('person'),wholeWord:!!this._replaceWholeWord,notAccount:!!this._replaceNegated?.account,notCategory:!!this._replaceNegated?.category,notPerson:!!this._replaceNegated?.person};
      for (const key of ['from','to']) {
        filter[key] = value(key).trim() ? this.parseDateInput(value(key)) : '';
        if (value(key).trim() && !filter[key]) { this.showToast('Enter a valid ' + key + ' date'); return; }
      }
      if (filter.from && filter.to && filter.from > filter.to) { this.showToast('From date must be before To date'); return; }
      if (this._replaceGroupIds) filter.ids = this._replaceGroupIds.slice();
      if (![filter.find,filter.account,filter.category,filter.type,filter.person,filter.from,filter.to,filter.ids].some(Boolean)) { this.showToast('Choose at least one search filter'); return; }
      this.selectedAccount = filter.account && !filter.notAccount && filter.account !== '__none__' && !filter.account.startsWith('card:') ? filter.account : null;
      if (this.selectedAccount) filter.account = '';
      this._ovInc = filter.type === 'income'; this._ovExp = filter.type === 'expense';
      this.selectedCategories = null;
      this._bulkOnly = false; this._bulkSel = new Set();
      this._linkedTransactionFocusId = null;
      this._overviewCustomFilter = {profile:this.profile,filter};
      clearTimeout(this._replaceLiveTimer);
      this.closeModal('find-replace-modal');
      this.navigateTo('overview');
      this.renderPage('overview');
    },
    overviewCustomMatches(tx) {
      const custom = this._overviewCustomFilter;
      if (!custom || custom.profile !== this.profile) return true;
      if (!matches(tx,custom.filter)) return false;
      if (this.selectedAccount && ![tx.accountId,tx.cardId,tx.fromAccountId,tx.toAccountId].includes(this.selectedAccount)) return false;
      return true;
    },
    customOverviewFilterHtml() {
      return '';
    },
    toggleOverviewFindReplace() {
      if (this._overviewCustomFilter && this._overviewCustomFilter.profile === this.profile) this.clearCustomOverviewFilter();
      else this.openFindReplace();
    },
    clearCustomOverviewFilter() { this._overviewCustomFilter = null; this.renderPage('overview'); },
    transactionBulkPlan(tx, mode, target, side = 'accountId') {
      const patch = {};
      const blocked = reason => ({ changed:false, blocked:reason, previewAfter:'Skipped: ' + reason });
      if (mode === 'delete') return { changed:true, delete:true, previewAfter:'DELETE TRANSACTION' };
      if (!target) return { changed:false };
      if (mode === 'remove-person') {
        patch.personIds = target === '__all__' ? [] : (tx.personIds || []).filter(id => id !== target);
        return { patch, changed:JSON.stringify(patch.personIds) !== JSON.stringify(tx.personIds || []), previewAfter:target === '__all__' ? 'Remove all person tags' : 'Remove @' + ((this.data.people || []).find(p => p.id === target)?.name || '') };
      }
      if (mode === 'set-category') {
        const category = (this.data.categories || []).find(c => c.id === target);
        if (!category) return blocked('Category unavailable');
        if (!this.categorySelectionAllowed(target, tx.date, tx.categoryId)) return blocked('Category archived for this date');
        return { patch:{categoryId:target}, changed:tx.categoryId !== target, previewAfter:'Category → ' + category.name };
      }
      if (mode === 'link-bill') {
        const bill = (this.data.bills || []).find(b => b.id === target);
        if (!bill) return blocked('Bill unavailable');
        if (tx.type !== 'expense') return blocked('Expense transactions only');
        if (this.debtForPaymentTx(tx.id) || this.invoiceForPaymentTx(tx.id) || this.savingsForTx(tx.id) || this.installmentForTx(tx.id)) return blocked('Already linked to another payment record');
        const month = String(tx.date || '').slice(0,7);
        if (!/^\d{4}-\d{2}$/.test(month) || !this.billOccursInMonth(bill, month)) return blocked('Bill not scheduled for this month');
        const payment = this.billPaymentForTx(tx.id);
        if (payment && payment.billId !== target) return blocked('Already linked to another bill');
        return { changed:!payment, billId:target, month, previewAfter:'Link to ' + bill.name + ' · ' + month };
      }
      if (mode === 'set-account') {
        const card = target.startsWith('card:');
        const account = (card ? this.data.creditCards || [] : this.data.accounts || []).find(a => a.id === (card ? target.slice(5) : target));
        if (!account) return blocked('Account unavailable');
        if (tx.settlements || this.debtForPaymentTx(tx.id) || this.invoiceForPaymentTx(tx.id) || this.savingsForTx(tx.id) || this.installmentForTx(tx.id)) return blocked('Edit this linked record individually');
        const currency = account.currency || this.baseCurrency();
        if (tx.type === 'transfer') {
          if (side === 'accountId' || card) return blocked('Choose a transfer side and a bank/cash account');
          const other = side === 'fromAccountId' ? tx.toAccountId : tx.fromAccountId;
          if (other === target) return blocked('Transfer accounts must be different');
          const recordedCurrency = side === 'toAccountId' ? tx.currencyIn || tx.currency : tx.currency;
          if ((recordedCurrency || this.baseCurrency()) !== currency) return blocked('No exact amount recorded in target currency');
          patch[side] = target;
        } else {
          if (side !== 'accountId') return blocked('Transfer entries only for this action');
          if (!['expense','income'].includes(tx.type)) return blocked('Unsupported transaction type');
          if ((tx.currency || this.baseCurrency()) !== currency) {
            if (tx.nativeCurrency !== currency || !Number.isFinite(tx.nativeAmount)) return blocked('No exact amount recorded in target currency');
            Object.assign(patch,{amount:tx.nativeAmount,currency:tx.nativeCurrency,nativeAmount:tx.amount,nativeCurrency:tx.currency || this.baseCurrency()});
          }
          patch.accountId = card ? null : target;
          patch.cardId = card ? target.slice(5) : null;
        }
        return { patch, changed:Object.entries(patch).some(([key,val]) => (tx[key] ?? null) !== val), previewAfter:'Account → ' + account.name + ' · ' + currency };
      }
      return {changed:false};
    },
    previewDescriptionChanges(live = false) {
      clearTimeout(this._replaceLiveTimer);
      this._replacePreview = null;
      document.getElementById('replace-apply').disabled = true;
      const value = id => document.getElementById('replace-' + id).value;
      const filter = { find: value('find').trim(), account: value('account'), category: value('category'), type: value('type'), person: value('person') };
      const results = document.getElementById('replace-results');
      const invalid = message => { results.textContent = message; document.getElementById('replace-count').textContent = ''; if (!live) this.showToast(message); };
      if (!Object.values(filter).some(Boolean) && !value('from').trim() && !value('to').trim() && !this._replaceGroupIds) {
        results.innerHTML = ''; document.getElementById('replace-count').textContent = ''; return;
      }
      filter.wholeWord = this._replaceWholeWord;
      if (this._replaceGroupIds) filter.ids = this._replaceGroupIds;
      filter.notPerson = !!this._replaceNegated?.person;
      filter.notCategory = !!this._replaceNegated?.category;
      filter.notAccount = !!this._replaceNegated?.account;
      for (const key of ['from','to']) {
        filter[key] = value(key).trim() ? this.parseDateInput(value(key)) : '';
        if (value(key).trim() && !filter[key]) { invalid('Enter a valid ' + key + ' date'); return; }
      }
      if (filter.from && filter.to && filter.from > filter.to) { invalid('From date must be before To date'); return; }
      const assignedPerson = value('mode') === 'assign-person' ? (this.data.people || []).find(p => p.id === value('target-person')) : null;
      const mode = value('mode');
      const bulkAction = ['set-category','delete','remove-person','link-bill','set-account'].includes(mode);
      const ready = bulkAction ? mode === 'delete' || !!value('target') : mode === 'assign-person' ? !!assignedPerson : mode === 'replace' ? !!value('needle') : !!value('text');
      const rows = (this.data.transactions || []).filter(tx => matches(tx, filter)).slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(tx => {
        const account = (this.data.accounts || []).find(a => a.id === (tx.accountId || tx.fromAccountId)) || (this.data.creditCards || []).find(a => a.id === tx.cardId);
        const category = (this.data.categories || []).find(c => c.id === tx.categoryId);
        const values = { description: tx.note || '', date: this.fmtDateInput(tx.date), year: String(tx.date || '').slice(0,4), month: new Date(String(tx.date) + 'T12:00:00').toLocaleString('en', { month:'long' }), account: account && account.name || '', category: category && category.name || '', person: (this.data.people || []).filter(p => (tx.personIds || []).includes(p.id)).map(p => p.name).join(', ') };
        let after = tx.note || '';
        if (ready && assignedPerson) {
          const name = value('person-name').trim().replace(/^@/, '');
          if (name) after = after.replace(new RegExp('(^|[^\\p{L}\\p{N}_@])@?' + escapeRegex(name) + '(?=$|[^\\p{L}\\p{N}_])', 'giu'), (_, prefix) => prefix + '@' + assignedPerson.name);
        } else if (ready && !bulkAction) after = rewrite(tx, value('needle'), value('text'), value('mode'), values);
        const changed = ready && ((tx.note || '') !== after || (assignedPerson && !(tx.personIds || []).includes(assignedPerson.id)));
        const previewAfter = assignedPerson ? after + ' · Assign @' + assignedPerson.name : after;
        const plan = bulkAction ? this.transactionBulkPlan(tx,mode,value('target'),value('account-side')) : {};
        return { id: tx.id, original: JSON.stringify(tx), before: tx.note || '', after, previewAfter, changed, personId: assignedPerson?.id, date: tx.date, amount: tx.amount, currency: tx.currency, ...plan };
      }).sort((a,b) => Number(b.changed) - Number(a.changed) || String(b.date).localeCompare(String(a.date)));
      this._replacePreview = rows;
      this._replaceContext = this.transactionBulkContext();
      this._replaceAction = mode;
      const visibleIds = new Set(rows.filter(row => !row.blocked).map(row => row.id));
      this._replaceIncluded = new Set([...(this._replaceIncluded || [])].filter(id => visibleIds.has(id)));
      results.innerHTML = rows.length ? rows.map((row,index) => {
        const included = this._replaceIncluded.has(row.id);
        return '<button type="button" class="replace-row selection-row' + (included && !row.blocked ? ' is-selected' : '') + '" data-index="' + index + '" aria-pressed="' + (included && !row.blocked) + '"' + (row.blocked ? ' disabled' : '') + '><span><small>' + this.escapeHtml(this.fmtDateInput(row.date) + ' · ' + this.fmtAmount(row.amount, row.currency || this.baseCurrency())) + '</small><span class="replace-before">' + this.escapeHtml(row.before || '(empty)') + '</span>' + (row.changed || row.blocked ? '<span class="replace-after">→ ' + this.escapeHtml(row.previewAfter || '(empty)') + '</span>' : '') + '</span></button>';
      }).join('') : '<p>No matching transactions.</p>';
      results.querySelectorAll('.replace-row').forEach(button => { button.onclick = () => { const row = rows[Number(button.dataset.index)]; const included = !this._replaceIncluded.has(row.id); if (included) this._replaceIncluded.add(row.id); else this._replaceIncluded.delete(row.id); button.classList.toggle('is-selected', included); button.setAttribute('aria-pressed', String(included)); this.updateReplaceCount(); }; });
      this.updateReplaceCount();
    },
    updateReplaceCount() {
      const rows = this._replacePreview || [];
      const selected = this._replaceIncluded?.size || 0;
      const count = rows.filter(row => row.changed && (!selected || this._replaceIncluded.has(row.id))).length;
      const skipped = rows.filter(row => row.blocked).length;
      document.getElementById('replace-count').textContent = rows.length + ' matches · ' + (selected ? selected + ' selected · ' + count + ' changes' : 'All matches · ' + count + ' changes') + (skipped ? ' · ' + skipped + ' skipped' : '');
      document.getElementById('replace-apply').disabled = !count || !!this._replaceBusy;
    },
    transactionBulkContext() {
      return JSON.stringify([this.data.accounts,this.data.creditCards,this.data.categories,this.data.people,this.data.bills,this.data.billPayments,this.data.debts,this.data.invoices,this.data.savingsGoals,this.data.installments,this.data.balanceCheckpoints]);
    },
    async applyDescriptionChanges() {
      const selected = this._replaceIncluded?.size || 0;
      const rows = (this._replacePreview || []).filter(row => row.changed && (!selected || this._replaceIncluded.has(row.id)));
      if (!rows.length || this._replaceBusy) return;
      const transactions = new Map((this.data.transactions || []).map(tx => [tx.id, tx]));
      const context = () => this.transactionBulkContext();
      const fresh = () => rows.every(row => JSON.stringify((this.data.transactions || []).find(tx => tx.id === row.id)) === row.original) && context() === this._replaceContext;
      if (!fresh()) { this.showToast('Data changed. Generate a fresh preview.'); return; }
      const mode = this._replaceAction;
      this._replaceBusy = true; document.getElementById('replace-apply').disabled = true;
      clearTimeout(this._replaceLiveTimer);
      const controls = [...document.querySelectorAll('#find-replace-modal input, #find-replace-modal select, #find-replace-modal button')];
      const disabledStates = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      try {
        if (mode === 'delete') {
          const confirmation = document.getElementById('confirm-modal');
          const previousLayer = confirmation.style.zIndex;
          confirmation.style.zIndex = '20000';
          let confirmed;
          try { confirmed = await this.confirmModal({ title:'Delete Transactions', message:'Delete ' + rows.length + ' selected transactions? Linked bill, debt, invoice, savings, and card payments will be updated. Undo can restore this batch.', confirmText:'Delete', danger:true }); }
          finally { confirmation.style.zIndex = previousLayer; }
          if (!confirmed) return;
          if (!fresh()) { this.showToast('Data changed. Generate a fresh preview.'); return; }
        }
        if (rows.some(row => row.personId && !(this.data.people || []).some(p => p.id === row.personId))) { this.showToast('Person changed. Generate a fresh preview.'); return; }
        const beforeBatch = JSON.parse(JSON.stringify(this.data));
        try {
          rows.forEach(row => {
            const tx = transactions.get(row.id);
            if (row.delete) {
              this.applyTransactionLinkRemove(tx);
              this.data.transactions = this.data.transactions.filter(item => item.id !== row.id);
              this._bulkSel?.delete(row.id);
            } else if (row.billId) {
              this.data.billPayments ||= [];
              let payment = this.data.billPayments.find(p => p.billId === row.billId && p.month === row.month);
              if (!payment) { payment = {billId:row.billId,month:row.month,paid:true,relatedTxIds:[]}; this.data.billPayments.push(payment); }
              payment.paid = true;
              payment.relatedTxIds = [...new Set([...this.billPaymentTransactionIds(payment),row.id])];
            } else if (row.patch) Object.assign(tx,row.patch);
            else { if (row.personId) tx.personIds = [...new Set([...(tx.personIds || []), row.personId])]; tx.note = row.after; }
          });
          if (mode === 'link-bill' || mode === 'set-account' || mode === 'delete') {
            (this.data.billPayments || []).forEach(payment => this.syncBillPaymentTransactions(payment,(this.data.bills || []).find(bill => bill.id === payment.billId)));
          }
        } catch (error) {
          this.data = beforeBatch;
          this.showToast('Changes could not be applied. Nothing was changed.');
          return;
        }
        const assigned = rows.some(row => row.personId);
        const labels = {'set-category':'Set transaction categories',delete:'Delete transactions','remove-person':'Remove transaction people','link-bill':'Link transactions to bill','set-account':'Set transaction accounts'};
        const saved = await this.save({ undoable:true, label:labels[mode] || (assigned ? 'Assign person to transactions' : 'Find & Replace descriptions') });
        this._replacePreview = null;
        if (!saved) { this.showToast('Changes are unsaved. Retry using the save indicator.'); return; }
        this.renderPage(this.currentPage);
        this.previewDescriptionChanges(true);
        this.showToast(rows.length + (mode === 'delete' ? ' transactions deleted' : ' transactions updated'));
      } finally {
        this._replaceBusy = false;
        controls.forEach((control,index) => { control.disabled = disabledStates[index]; });
        this.updateReplaceCount();
      }
    },
    openPeopleDirectory() {
      const modal = this.toolsModal('people-modal', 'People', '<div class="people-layout"><div><button class="btn btn-secondary" id="person-new">+ NEW PERSON</button><div id="people-list" class="tools-scroll"></div></div><div><form id="person-form"><label class="tools-field">Name<input id="person-name" class="input" required></label><label class="tools-field">Account number (optional)<input id="person-account" class="input"></label><label class="tools-field">Notes<textarea id="person-notes" class="input"></textarea></label><div class="tools-actions"><button type="submit" class="btn btn-primary">SAVE PERSON</button><button type="button" id="person-delete" class="btn btn-danger">DELETE</button></div></form><div id="person-summary"></div><div id="person-history" class="tools-scroll"></div></div></div>');
      modal.querySelector('#person-new').onclick = () => this.editPerson(null);
      modal.querySelector('#person-form').onsubmit = event => { event.preventDefault(); this.savePerson(); };
      modal.querySelector('#person-delete').onclick = () => this.deletePerson();
      const colorField = document.createElement('label');
      colorField.className = 'tools-field';
      colorField.innerHTML = 'Color<div class="color-picker-row"><input type="color" id="person-color" class="color-input"><input id="person-color-hex" class="input hex-input" aria-label="Person color hex"><button type="button" id="person-color-reset" class="btn btn-secondary btn-icon color-reset-button" aria-label="Automatic color">' + this.refreshIcon() + '</button></div>';
      if (!modal.querySelector('#person-color')) modal.querySelector('#person-notes').closest('label').before(colorField);
      if (!modal.querySelector('.person-name-color-row')) {
        const nameField = modal.querySelector('#person-name').closest('label');
        const row = document.createElement('div');
        row.className = 'person-name-color-row';
        nameField.before(row);
        row.append(nameField, modal.querySelector('#person-color').closest('label'));
      }
      if (!modal.querySelector('#person-transaction-count')) {
        const count = document.createElement('div');
        count.id = 'person-transaction-count';
        modal.querySelector('#person-history').before(count);
      }
      modal.querySelector('#person-new').classList.replace('btn-secondary', 'btn-primary');
      this.bindColorPicker('person-color', 'person-color-hex', 'person-color-reset');
      this.renderPeopleList(); this.editPerson(null); this.openModal('people-modal');
      modal.querySelector('#person-name').focus();
    },
    renderPeopleList() {
      const list = document.getElementById('people-list');
      list.innerHTML = (this.data.people || []).slice().sort((a,b) => a.name.localeCompare(b.name)).map(person => '<button type="button" class="btn btn-secondary" data-person="' + this.escapeHtml(person.id) + '">' + this.personNameHtml(person, false) + '</button>').join('') || '<p>No people yet.</p>';
      list.querySelectorAll('button').forEach(button => { button.onclick = () => this.editPerson(button.dataset.person); });
    },
    editPerson(id) {
      this._personEditId = id;
      document.querySelectorAll('#people-list [data-person]').forEach(button => {
        const selected = button.dataset.person === id;
        button.classList.toggle('btn-primary', selected);
        button.classList.toggle('btn-secondary', !selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const person = (this.data.people || []).find(p => p.id === id) || {};
      const color = this.personColor(person);
      document.getElementById('person-color').value = color;
      document.getElementById('person-color-hex').value = color;
      document.getElementById('person-name').value = person.name || '';
      document.getElementById('person-account').value = person.accountNumber || '';
      document.getElementById('person-notes').value = person.notes || '';
      document.getElementById('person-delete').hidden = !id;
      const txs = (this.data.transactions || []).filter(tx => (tx.personIds || []).includes(id)).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
      const totals = {};
      const add = (currency, field, amount) => { const item = totals[currency] ||= {income:0,expense:0,out:0,in:0}; item[field] += Math.abs(Number(amount) || 0); };
      txs.forEach(tx => { if (tx.type === 'transfer') { add(tx.currency || this.baseCurrency(),'out',tx.amount); add(tx.currencyIn || tx.currency || this.baseCurrency(),'in',tx.amountIn ?? tx.amount); } else add(tx.currency || this.baseCurrency(),tx.type === 'income' ? 'income' : 'expense',tx.amount); });
      document.getElementById('person-summary').innerHTML = Object.entries(totals).map(([currency,t]) => {
        const net = t.income - t.expense;
        return '<div class="person-summary-line"><strong>' + this.escapeHtml(currency) + '</strong><span>INCOME <strong class="amt-income">' + this.fmtNumber(t.income) + '</strong></span><span>EXPENSES <strong class="amt-expense">' + this.fmtNumber(t.expense) + '</strong></span><span>NET <strong class="' + (net > 0 ? 'amt-income' : net < 0 ? 'amt-expense' : '') + '">' + this.fmtNumber(net) + '</strong></span>' + (t.out || t.in ? '<span>TRANSFERS OUT ' + this.fmtNumber(t.out) + ' / IN ' + this.fmtNumber(t.in) + '</span>' : '') + '</div>';
      }).join('') + (txs.some(tx => (tx.personIds || []).length > 1) ? '<p class="health-explanation">Shared transactions show their full amount here; no individual shares are assigned.</p>' : '');
      const history = document.getElementById('person-history');
      document.getElementById('person-transaction-count').textContent = id ? txs.length + ' TRANSACTION' + (txs.length === 1 ? '' : 'S') : '';
      history.innerHTML = id ? txs.map((tx,index) => '<div class="person-history-row"><span>' + this.escapeHtml(this.fmtDateInput(tx.date)) + ' · <span class="' + (tx.type === 'income' ? 'amt-income' : tx.type === 'expense' ? 'amt-expense' : 'amt-transfer') + '">' + this.escapeHtml(this.fmtAmount(tx.amount,tx.currency || this.baseCurrency())) + '</span> · ' + this.transactionDescriptionHtml(tx, 'No description') + '</span><button type="button" class="btn btn-sm btn-icon person-history-link" data-index="' + index + '" aria-label="Show transaction" title="Show transaction">' + this.transactionLinkIcon() + '</button></div>').join('') : '';
      if (id) {
        history.querySelectorAll('[data-index]').forEach(button => { button.onclick = () => { this.closeModal('people-modal'); this.openLinkedTransaction(txs[Number(button.dataset.index)].id); }; });
      }
    },
    async savePerson() {
      if (this._personBusy) return;
      const name = document.getElementById('person-name').value.trim();
      const people = this.data.people ||= [];
      if (!name || /[@\r\n]/.test(name)) { this.showToast('Enter a name without @ or line breaks'); return; }
      if (people.some(p => p.id !== this._personEditId && p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { this.showToast('A person with that name already exists'); return; }
      const person = people.find(p => p.id === this._personEditId) || {id:crypto.randomUUID()};
      const color = document.getElementById('person-color-hex').value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(color)) { this.showToast('Enter a valid six-digit color'); return; }
      person.color = color;
      Object.assign(person,{name,accountNumber:document.getElementById('person-account').value.trim(),notes:document.getElementById('person-notes').value.trim()});
      if (!this._personEditId) people.push(person);
      this._personEditId = person.id; this._personBusy = true;
      try { if (await this.save({undoable:true,label:'Save person'})) { this.renderPeopleList(); this.editPerson(person.id); this.showToast('Person saved'); } else this.showToast('Person is unsaved. Retry using the save indicator.'); } finally { this._personBusy = false; }
    },
    async deletePerson() {
      const id = this._personEditId;
      if (!id || this._personBusy || !(await this.confirmModal({title:'Delete person',message:'Remove this person and their transaction associations? Transaction descriptions and amounts are kept.',confirmText:'Delete',danger:true}))) return;
      this.data.people = (this.data.people || []).filter(p=>p.id!==id);
      (this.data.transactions || []).forEach(tx=> { if ((tx.personIds || []).includes(id)) tx.personIds = tx.personIds.filter(value=>value!==id); });
      await this.save({undoable:true,label:'Delete person'}); this.renderPeopleList(); this.editPerson(null);
    },
    initPeopleEntry(ids, noteId = 'tx-note') {
      const note = document.getElementById(noteId);
      if (!note) return;
      if (!note.dataset.peopleHint) { note.placeholder = (note.placeholder || 'Description') + ' · @ person'; note.dataset.peopleHint = 'true'; }
      this._peopleDrafts ||= {};
      this._peopleDrafts[noteId] = [...new Set(ids || [])].filter(id => (this.data.people || []).some(p=>p.id===id));
      let panel = document.getElementById(noteId + '-people');
      if (!panel) {
        panel = document.createElement('div'); panel.id = noteId + '-people'; panel.className = 'transaction-people';
        note.parentElement.insertAdjacentElement('afterend',panel);
        note.addEventListener('input',()=>this.renderPeopleEntry(noteId));
        note.addEventListener('keydown',event=> { if (event.key === 'Enter' && panel.querySelector('.person-suggestion')) { event.preventDefault(); panel.querySelector('.person-suggestion').click(); } });
      }
      this.renderPeopleEntry(noteId);
    },
    transactionPeopleDraft(noteId = 'tx-note') { return [...(this._peopleDrafts && this._peopleDrafts[noteId] || [])].filter(id => (this.data.people || []).some(person => person.id === id)); },
    renderPeopleEntry(noteId) {
      const note = document.getElementById(noteId), panel = document.getElementById(noteId + '-people');
      const ids = this.transactionPeopleDraft(noteId), people = this.data.people || [];
      const caret = note.selectionStart ?? note.value.length;
      const match = note.value.slice(0,caret).match(/@([^@\n]*)$/);
      const suggestions = match ? people.filter(p=>!ids.includes(p.id) && p.name.toLocaleLowerCase().includes(match[1].toLocaleLowerCase())).slice(0,8) : [];
      panel.innerHTML = '<div class="people-chips">' + people.filter(p=>ids.includes(p.id)).map(p=>'<button type="button" class="btn btn-sm btn-secondary" data-remove="' + this.escapeHtml(p.id) + '">@' + this.personNameHtml(p, false) + ' ×</button>').join('') + '</div><div class="people-suggestions">' + suggestions.map(p=>'<button type="button" class="btn btn-sm btn-secondary person-suggestion" data-person="' + this.escapeHtml(p.id) + '">@' + this.personNameHtml(p, false) + '</button>').join('') + '</div>';
      panel.querySelectorAll('[data-remove]').forEach(button=> { button.onclick=()=> { this._peopleDrafts[noteId] = ids.filter(id=>id!==button.dataset.remove); this.renderPeopleEntry(noteId); }; });
      panel.querySelectorAll('[data-person]').forEach(button=> { button.onclick=()=> { const person = people.find(p=>p.id===button.dataset.person); this._peopleDrafts[noteId] = [...ids,person.id]; note.value = note.value.slice(0,caret-match[0].length) + '@' + person.name + ' ' + note.value.slice(caret); note.focus(); this.renderPeopleEntry(noteId); }; });
    }
  });
})();
