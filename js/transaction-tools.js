(function () {
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ITEM_TAG_END = '\u2063';
  const cleanDescription = value => String(value || '').replace(/\u2063/g, '');
  const replaceItemText = (text, oldName, newName, wholeWord = false) => {
    const name = String(oldName || '').trim().replace(/^\$\s*/, '').replace(/\s+/g, ' ');
    if (!name) return { value:String(text || ''), replaced:false };
    const original = String(text || '');
    const tagPattern = new RegExp('(^|[^\\p{L}\\p{N}_])\\$\\s*' + escapeRegex(name) + '(?:\\u2063|(?=$|\\s+\\$|\\s+@[\\p{L}]))', 'giu');
    let tagReplaced = false;
    const taggedValue = original.replace(tagPattern, (_, prefix) => {
      tagReplaced = true;
      return prefix + '$' + newName + ITEM_TAG_END;
    });
    if (tagReplaced) return { value:taggedValue, replaced:true };
    const textPattern = wholeWord
      ? new RegExp('(^|[^\\p{L}\\p{N}_])\\$?' + escapeRegex(name) + '(?=$|[^\\p{L}\\p{N}_])', 'giu')
      : new RegExp('(^|[^$])\\$?' + escapeRegex(name), 'giu');
    let replaced = false;
    const value = original.replace(textPattern, (match, prefix) => {
      replaced = true;
      return prefix + '$' + newName + ITEM_TAG_END;
    });
    return { value, replaced };
  };
  const tokens = /#(description|date|month|year|account|category|person)\b/g;
  const descriptionMatches = (note, text, wholeWord) => !text || (wholeWord
    ? new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegex(text) + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(String(note || ''))
    : String(note || '').toLocaleLowerCase().includes(text.toLocaleLowerCase()));
  const filterMatch = (value, condition, negated) => !value || (negated ? !condition : condition);
  const splitParts = tx => Array.isArray(tx.parts) ? tx.parts : [];
  const categoryIds = tx => splitParts(tx).length ? splitParts(tx).map(part => part.categoryId).filter(Boolean) : [tx.categoryId].filter(Boolean);
  const peopleIds = tx => [...new Set([...(tx.personIds || []), ...splitParts(tx).flatMap(part => part.personIds || [])])];
  const descriptions = tx => [tx.note, ...splitParts(tx).map(part => part.description)].filter(Boolean).map(cleanDescription).join('\n');
  const itemTags = value => {
    const names = new Set();
    const pattern = /(?:^|\s)\$\s*([\p{L}][^$\u2063]*?)(?=\u2063|\s+\$|\s+@[\p{L}]|$)/giu;
    for (const match of String(value || '').matchAll(pattern)) {
      const name = String(match[1] || '').replace(/\s+/g, ' ').trim();
      if (name) names.add(name.toLocaleLowerCase());
    }
    return names;
  };
  const itemKeys = tx => {
    const keys = new Set(itemTags(tx.note));
    for (const part of splitParts(tx)) for (const key of itemTags(part.description)) keys.add(key);
    return keys;
  };
  const matchesItem = (tx, filter) => {
    if (!filter.item) return true;
    const keys = itemKeys(tx);
    const condition = filter.item === '__none__' ? !keys.size : keys.has(filter.item);
    return filter.notItem ? !condition : condition;
  };
  const matches = (tx, filter) => (!filter.ids || filter.ids.includes(tx.id)) && descriptionMatches(descriptions(tx), filter.find, filter.wholeWord) &&
    (!filter.type || tx.type === filter.type) && filterMatch(filter.category, filter.category === '__none__' ? !categoryIds(tx).length : filter.category === '__split__' ? splitParts(tx).length > 0 : categoryIds(tx).includes(filter.category), filter.notCategory) &&
    filterMatch(filter.account, filter.account === '__none__' ? ![tx.accountId, tx.fromAccountId, tx.toAccountId, tx.cardId].some(Boolean) : [tx.accountId, tx.fromAccountId, tx.toAccountId, tx.cardId && 'card:' + tx.cardId].includes(filter.account), filter.notAccount) &&
    filterMatch(filter.person, filter.person === '__none__' ? !peopleIds(tx).length : peopleIds(tx).includes(filter.person), filter.notPerson) &&
    matchesItem(tx, filter) && (!filter.from || tx.date >= filter.from) && (!filter.to || tx.date <= filter.to);
  const rewrite = (tx, find, replacement, mode, values) => {
    const expanded = replacement.replace(tokens, (_, token) => String(values[token] ?? ''));
    return mode === 'rewrite' ? expanded : String(tx.note || '').replace(new RegExp(escapeRegex(find), 'gi'), () => expanded);
  };
  window.TransactionTools = { matches, rewrite, cleanDescription };
  Object.assign(window.BlackBook, {
    personColor(person) {
      return /^#[0-9a-f]{6}$/i.test(person.color || '') ? person.color : this.colorForName(person.name || person.id);
    },
    personNameHtml(person, mention = true) {
      return '<strong class="person-mention" style="color:' + this.personColor(person) + '">' + this.escapeHtml((mention ? '@' : '') + person.name) + '</strong>';
    },
    transactionDescriptionHtml(tx, fallback = '') {
      const note = String(tx.note || fallback);
      const tokens = [];
      const itemPattern = /(?:^|\s)(\$\s*[\p{L}][^$\u2063]*?)(?=\u2063|\s+\$|\s+@[\p{L}]|$)/giu;
      for (const match of note.matchAll(itemPattern)) {
        const start = match.index + match[0].indexOf(match[1]);
        tokens.push({ start, end: start + match[1].length, type: 'item', text: match[1] });
      }
      const itemTokens = tokens.filter(token => token.type === 'item');
      const people = (this.data.people || []).filter(person => person.name).slice().sort((a,b) => b.name.length - a.name.length);
      if (people.length) {
        const pattern = new RegExp('(^|[^\\p{L}\\p{N}_@])(@?)(' + people.map(person => escapeRegex(person.name)).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'giu');
        for (const match of note.matchAll(pattern)) {
          const person = people.find(item => item.name.toLocaleLowerCase() === match[3].toLocaleLowerCase());
          if (!person) continue;
          const start = match.index + match[1].length;
          const end = match.index + match[0].length;
          if (itemTokens.some(token => start < token.end && end > token.start)) continue;
          tokens.push({ start, end, type: 'person', person, mention: !!match[2], text: match[3] });
        }
      }
      tokens.sort((a,b) => a.start - b.start || b.end - a.end);
      let html = '', cursor = 0;
      for (const token of tokens) {
        if (token.start < cursor) continue;
        html += this.escapeHtml(cleanDescription(note.slice(cursor, token.start)));
        html += token.type === 'item'
          ? '<strong class="item-mention">' + this.escapeHtml(token.text) + '</strong>'
          : this.personNameHtml(token.person, token.mention);
        cursor = token.end;
      }
      return html + this.escapeHtml(cleanDescription(note.slice(cursor)));
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
        '<div class="tools-grid"><label>Description contains<input id="replace-find" class="input"></label><label>Account<select id="replace-account" class="input"></select></label><label>Category<select id="replace-category" class="input"></select></label><label>Type<select id="replace-type" class="input"><option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select></label><label>From date<input id="replace-from" class="input"></label><label>To date<input id="replace-to" class="input"></label><label>Person<select id="replace-person" class="input"></select></label><label>Item<select id="replace-item" class="input"><option value="">All items</option></select></label></div>' +
        '<div class="tools-grid replace-action-row" id="replace-action-row"><label>Action<select id="replace-mode" class="input"><option value="replace">Replace text</option><option value="rewrite">Rewrite description</option><option value="assign-person">Assign person</option><option value="assign-item">Assign item</option></select></label><label id="replace-needle-field">Text to replace<input id="replace-needle" class="input"></label><label id="replace-text-field"><span id="replace-text-label">New text</span><input id="replace-text" class="input"></label><label id="replace-assignee-field" hidden><span id="replace-assignee-label">Name of person/item</span><input id="replace-assignee" class="input" type="text" autocomplete="off" aria-autocomplete="list" aria-controls="replace-assignee-suggestions" aria-expanded="false"><div id="replace-assignee-suggestions" class="people-suggestions replace-assignee-suggestions hidden" role="listbox" aria-label="Existing people and items"></div></label><label id="replace-name-to-replace-field" hidden>Text to replace<input id="replace-name-to-replace" class="input"></label></div>' +
        '<div class="tools-actions"><button id="replace-preview" class="btn btn-secondary">PREVIEW</button><button id="replace-apply" class="btn btn-primary" disabled>APPLY</button><span id="replace-count"></span></div><div id="replace-results" class="tools-scroll"></div><p id="replace-token-help" class="replace-token-help">#description · #date · #month · #year · #account · #category @person</p>');
      modal.querySelector('#replace-account').innerHTML = '<option value="">All accounts</option>' + (this.data.accounts || []).map(a => '<option value="' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + '</option>').join('') + (this.data.creditCards || []).map(a => '<option value="card:' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + '</option>').join('');
      modal.querySelector('#replace-category').innerHTML = '<option value="">All categories</option>' + (this.data.categories || []).map(c => '<option value="' + this.escapeHtml(c.id) + '">' + this.escapeHtml(c.name) + '</option>').join('');
      modal.querySelector('#replace-person').innerHTML = this.peopleOptions();
      const itemSelect = modal.querySelector('#replace-item');
      if (!itemSelect.dataset.itemOptionsBound) {
        itemSelect.dataset.itemOptionsBound = 'true';
        itemSelect.addEventListener('focus', () => this.populateReplaceItemOptions(modal));
      }
      this._replaceNegated = {};
      for (const field of ['person','category','account','item']) {
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
      const assigneeInput = modal.querySelector('#replace-assignee');
      const assigneeSuggestions = modal.querySelector('#replace-assignee-suggestions');
      if (modal.dataset.assigneeSuggestionDismissBound !== 'true') {
        modal.dataset.assigneeSuggestionDismissBound = 'true';
        modal.addEventListener('pointerdown', event => {
          if (event.target.closest?.('#replace-assignee-field')) return;
          modal.querySelector('#replace-assignee-suggestions')?.classList.add('hidden');
          modal.querySelector('#replace-assignee')?.setAttribute('aria-expanded','false');
        }, true);
      }
      assigneeInput.addEventListener('focus', () => this.renderReplaceAssigneeSuggestions(modal));
      assigneeInput.addEventListener('click', () => this.renderReplaceAssigneeSuggestions(modal));
      assigneeInput.addEventListener('input', () => this.renderReplaceAssigneeSuggestions(modal));
      assigneeInput.addEventListener('blur', () => setTimeout(() => { assigneeSuggestions.classList.add('hidden'); assigneeInput.setAttribute('aria-expanded','false'); }, 120));
      assigneeSuggestions.addEventListener('mousedown', event => { if (event.target.closest('.replace-assignee-suggestion')) event.preventDefault(); });
      assigneeSuggestions.addEventListener('click', event => {
        const suggestion = event.target.closest('.replace-assignee-suggestion');
        if (!suggestion) return;
        const prefix = modal.querySelector('#replace-mode').value === 'assign-person' ? '@' : '$';
        assigneeInput.value = prefix + suggestion.dataset.name;
        assigneeInput.dispatchEvent(new Event('input', { bubbles:true }));
        assigneeSuggestions.classList.add('hidden');
        assigneeInput.setAttribute('aria-expanded','false');
      });
      assigneeInput.addEventListener('keydown', event => {
        const options = [...assigneeSuggestions.querySelectorAll('.replace-assignee-suggestion')];
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
          event.preventDefault();
          const current = Number(assigneeSuggestions.dataset.activeIndex || 0);
          const next = event.key === 'ArrowDown' ? (current + 1) % options.length : (current - 1 + options.length) % options.length;
          assigneeSuggestions.dataset.activeIndex = String(next);
          options.forEach((option, index) => { option.classList.toggle('is-active', index === next); option.setAttribute('aria-selected', String(index === next)); });
          return;
        }
        if (event.key === 'Enter' && !assigneeSuggestions.classList.contains('hidden') && options.length) {
          event.preventDefault();
          options[Number(assigneeSuggestions.dataset.activeIndex) || 0].click();
        } else if (event.key === 'Escape') {
          assigneeSuggestions.classList.add('hidden');
          assigneeInput.setAttribute('aria-expanded','false');
        }
      });
      if (!modal.querySelector('#replace-custom')) {
        const custom = document.createElement('button');
        custom.type = 'button'; custom.id = 'replace-custom'; custom.className = 'btn btn-secondary'; custom.textContent = 'FILTER';
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
        modal.querySelector('#replace-action-row').insertAdjacentHTML('beforeend', '<div id="replace-extra-fields" hidden><label><span id="replace-target-label">Target</span><select id="replace-target" class="input"></select></label><label id="replace-account-side-field" hidden>Change<select id="replace-account-side" class="input"><option value="accountId">Transaction account</option><option value="fromAccountId">Transfer source</option><option value="toAccountId">Transfer destination</option></select></label></div>');
      }
      for (const [field, label] of [['person','No person'], ['category','No category'], ['account','No account'], ['item','No item']]) {
        const select = modal.querySelector('#replace-' + field);
        if (!select.querySelector('option[value="__none__"]')) {
          select.options[0].insertAdjacentHTML('afterend', '<option value="__none__">' + label + '</option>' + (field === 'category' ? '<option value="__split__">Split categories</option>' : ''));
        }
      }
      this.populateReplaceItemOptions(modal);
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
        if (filter.item) this.populateReplaceItemOptions(modal);
        for (const field of ['find','account','category','type','person','item']) modal.querySelector('#replace-' + field).value = filter[field] || (field === 'account' ? this.selectedAccount || '' : '');
        for (const field of ['from','to']) modal.querySelector('#replace-' + field).value = filter[field] ? this.fmtDateInput(filter[field]) : '';
        if (filter.wholeWord) modal.querySelector('#replace-match-mode').click();
        for (const field of ['person','category','account','item']) if (filter['not' + field[0].toUpperCase() + field.slice(1)]) modal.querySelector('#replace-not-' + field).click();
        modal.querySelectorAll('select').forEach(select => this.syncCustomSelect(select));
        this.previewDescriptionChanges(true);
      }
      if (this._replaceGroupIds && !restoreCustom) this.previewDescriptionChanges(true);
      modal.querySelector('#replace-find').focus();
    },
    renderReplaceAssigneeSuggestions(modal) {
      const input = modal && modal.querySelector('#replace-assignee');
      const panel = modal && modal.querySelector('#replace-assignee-suggestions');
      const mode = modal && modal.querySelector('#replace-mode')?.value;
      if (!input || !panel || !['assign-person','assign-item'].includes(mode)) {
        panel?.classList.add('hidden');
        input?.setAttribute('aria-expanded','false');
        return;
      }
      const isPerson = mode === 'assign-person';
      const prefix = isPerson ? '@' : '$';
      const typedName = input.value.trim().replace(/^[@$]\s*/, '').replace(/\s+/g, ' ').trim();
      const lowerName = typedName.toLocaleLowerCase();
      const entries = isPerson
        ? (this.data.people || []).slice().sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity:'base' })).map(person => ({ name:person.name, html:'@' + this.personNameHtml(person, false) }))
        : this.existingTrackedItems().slice().sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity:'base' })).map(item => ({ name:item.name, html:'$' + this.escapeHtml(item.name) }));
      const matches = entries.filter(entry => !lowerName || entry.name.toLocaleLowerCase().includes(lowerName)).slice(0, 16);
      const exact = entries.some(entry => entry.name.toLocaleLowerCase() === lowerName);
      let html = matches.map((entry, index) => '<button type="button" role="option" aria-selected="' + (index === 0) + '" class="btn btn-sm btn-secondary replace-assignee-suggestion' + (index === 0 ? ' is-active' : '') + '" data-name="' + this.escapeHtml(entry.name) + '">' + entry.html + '</button>').join('');
      const rawPersonName = input.value.trim().replace(/^@\s*/, '');
      const validNewName = typedName && (!isPerson || !/[@\r\n]/.test(rawPersonName));
      if (validNewName && !exact) html += '<button type="button" role="option" aria-selected="' + (!matches.length) + '" class="btn btn-sm btn-secondary replace-assignee-suggestion replace-assignee-new-option' + (!matches.length ? ' is-active' : '') + '" data-name="' + this.escapeHtml(typedName) + '">+ NEW ' + prefix + this.escapeHtml(typedName) + '</button>';
      panel.innerHTML = html;
      panel.dataset.activeIndex = '0';
      panel.classList.toggle('hidden', !html);
      input.setAttribute('aria-expanded', String(!!html));
    },
    updateReplaceAction() {
      const mode = document.getElementById('replace-mode').value;
      const rewrite = mode === 'rewrite';
      const assignPerson = mode === 'assign-person';
      const assignItem = mode === 'assign-item';
      const assign = assignPerson || assignItem;
      const textAction = mode === 'replace' || rewrite;
      document.getElementById('replace-needle-field').hidden = mode !== 'replace';
      document.getElementById('replace-text-field').hidden = !textAction;
      document.getElementById('replace-assignee-field').hidden = !assign;
      document.getElementById('replace-name-to-replace-field').hidden = !assign;
      const assignee = document.getElementById('replace-assignee');
      const suggestions = document.getElementById('replace-assignee-suggestions');
      if (assignee.dataset.mode !== mode) {
        assignee.dataset.mode = mode;
        assignee.value = '';
      }
      assignee.placeholder = assignPerson ? '@Person name' : '$Item name';
      assignee.setAttribute('aria-label', assignPerson ? 'Name of person' : 'Name of item');
      if (!assign) { suggestions.classList.add('hidden'); assignee.setAttribute('aria-expanded','false'); }
      document.getElementById('replace-assignee-label').textContent = assignPerson ? 'Name of person' : 'Name of item';
      document.getElementById('replace-text-label').textContent = rewrite ? 'New description' : 'New text';
      const extra = ['set-category','remove-person','link-bill','set-account'].includes(mode);
      document.getElementById('replace-extra-fields').hidden = !extra;
      document.getElementById('replace-action-row').dataset.mode = mode;
      document.getElementById('replace-account-side-field').hidden = mode !== 'set-account';
      const target = document.getElementById('replace-target');
      if (target.dataset.mode !== mode) {
        target.dataset.mode = mode;
        const entries = mode === 'set-category' ? this.data.categories || [] : mode === 'remove-person' ? this.data.people || [] : mode === 'link-bill' ? this.data.bills || [] : mode === 'set-account' ? [...(this.data.accounts || []), ...(this.data.creditCards || []).map(card => ({...card,id:'card:' + card.id}))] : [];
        document.getElementById('replace-target-label').textContent = mode === 'set-category' ? 'Category' : mode === 'remove-person' ? 'Person to remove' : mode === 'link-bill' ? 'Bill' : 'Account';
        target.innerHTML = '<option value="">Choose…</option>' + (mode === 'remove-person' ? '<option value="__all__">All people</option>' : '') + entries.slice().sort((a,b) => a.name.localeCompare(b.name)).map(item => '<option value="' + this.escapeHtml(item.id) + '">' + this.escapeHtml((mode === 'remove-person' ? '@' : '') + item.name + (mode === 'set-account' ? ' · ' + (item.currency || this.baseCurrency()) : '')) + '</option>').join('');
      }
      document.getElementById('replace-apply').classList.toggle('btn-danger', mode === 'delete');
      document.getElementById('replace-apply').classList.toggle('btn-primary', mode !== 'delete');
    },
    applyCustomOverviewFilter() {
      const value = id => document.getElementById('replace-' + id).value;
      const filter = {find:value('find').trim(),account:value('account'),category:value('category'),type:value('type'),person:value('person'),item:value('item'),wholeWord:!!this._replaceWholeWord,notAccount:!!this._replaceNegated?.account,notCategory:!!this._replaceNegated?.category,notPerson:!!this._replaceNegated?.person,notItem:!!this._replaceNegated?.item};
      for (const key of ['from','to']) {
        filter[key] = value(key).trim() ? this.parseDateInput(value(key)) : '';
        if (value(key).trim() && !filter[key]) { this.showToast('Enter a valid ' + key + ' date'); return; }
      }
      if (filter.from && filter.to && filter.from > filter.to) { this.showToast('From date must be before To date'); return; }
      if (this._replaceGroupIds) filter.ids = this._replaceGroupIds.slice();
      if (![filter.find,filter.account,filter.category,filter.type,filter.person,filter.item,filter.from,filter.to,filter.ids].some(Boolean)) { this.showToast('Choose at least one search filter'); return; }
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
    applyCommandSearchFilter(query) {
      const find = String(query || '').trim();
      if (!find) return;
      this.selectedAccount = null;
      this._ovInc = false; this._ovExp = false;
      this.selectedCategories = null;
      this._bulkOnly = false; this._bulkSel = new Set();
      this._linkedTransactionFocusId = null;
      this._overviewCustomFilter = { profile:this.profile, filter:{find} };
      this.closeCommandPalette();
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
        if (Array.isArray(tx.parts)) patch.parts = tx.parts.map(part => ({ ...part, personIds: target === '__all__' ? [] : (part.personIds || []).filter(id => id !== target) }));
        return { patch, changed:JSON.stringify(patch.personIds) !== JSON.stringify(tx.personIds || []) || JSON.stringify(patch.parts || []) !== JSON.stringify(tx.parts || []), previewAfter:target === '__all__' ? 'Remove all person tags' : 'Remove @' + ((this.data.people || []).find(p => p.id === target)?.name || '') };
      }
      if (mode === 'set-category') {
        const category = (this.data.categories || []).find(c => c.id === target);
        if (!category) return blocked('Category unavailable');
        if (!this.categorySelectionAllowed(target, tx.date, tx.categoryId)) return blocked('Category archived for this date');
        if (Array.isArray(tx.parts) && tx.parts.length) {
          if (tx.parts.some(part => !this.categorySelectionAllowed(target, tx.date, part.categoryId))) return blocked('Category archived for this date');
          patch.parts = tx.parts.map(part => ({ ...part, categoryId:target }));
          patch.categoryId = target;
          return { patch, changed:tx.categoryId !== target || tx.parts.some(part => part.categoryId !== target), previewAfter:'All split parts → ' + category.name };
        }
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
      const filter = { find: value('find').trim(), account: value('account'), category: value('category'), type: value('type'), person: value('person'), item: value('item') };
      const results = document.getElementById('replace-results');
      const invalid = message => { results.textContent = message; document.getElementById('replace-count').textContent = ''; if (!live) this.showToast(message); };
      const mode = value('mode');
      const itemNameToReplace = mode === 'assign-item' ? value('name-to-replace').trim().replace(/^\$\s*/, '').replace(/\s+/g, ' ') : '';
      const hasItemReplacementScope = mode === 'assign-item' && !!value('assignee') && !!itemNameToReplace;
      if (!Object.values(filter).some(Boolean) && !value('from').trim() && !value('to').trim() && !this._replaceGroupIds && !hasItemReplacementScope) {
        results.innerHTML = ''; document.getElementById('replace-count').textContent = ''; return;
      }
      filter.wholeWord = this._replaceWholeWord;
      if (this._replaceGroupIds) filter.ids = this._replaceGroupIds;
      filter.notPerson = !!this._replaceNegated?.person;
      filter.notCategory = !!this._replaceNegated?.category;
      filter.notItem = !!this._replaceNegated?.item;
      filter.notAccount = !!this._replaceNegated?.account;
      for (const key of ['from','to']) {
        filter[key] = value(key).trim() ? this.parseDateInput(value(key)) : '';
        if (value(key).trim() && !filter[key]) { invalid('Enter a valid ' + key + ' date'); return; }
      }
      if (filter.from && filter.to && filter.from > filter.to) { invalid('From date must be before To date'); return; }
      const enteredAssignee = value('assignee').trim();
      const personInputName = enteredAssignee.replace(/^@\s*/, '').replace(/\s+/g, ' ').trim();
      const itemInputName = enteredAssignee.replace(/^\$\s*/, '').replace(/\s+/g, ' ').trim();
      const assignedPerson = mode === 'assign-person' ? (this.data.people || []).find(person => person.name.toLocaleLowerCase() === personInputName.toLocaleLowerCase()) : null;
      const newPersonName = mode === 'assign-person' && personInputName && !assignedPerson && !/[@\r\n]/.test(enteredAssignee.replace(/^@\s*/, '')) ? personInputName : '';
      const assignedItem = mode === 'assign-item' ? this.existingTrackedItems().find(item => item.name.toLocaleLowerCase() === itemInputName.toLocaleLowerCase()) : null;
      const newItemName = mode === 'assign-item' && itemInputName && !assignedItem ? itemInputName : '';
      const assignedPersonName = assignedPerson?.name || newPersonName;
      const assignedItemName = assignedItem?.name || newItemName;

      const bulkAction = ['set-category','delete','remove-person','link-bill','set-account'].includes(mode);
      const ready = bulkAction ? mode === 'delete' || !!value('target') : mode === 'assign-person' ? !!assignedPersonName : mode === 'assign-item' ? !!assignedItemName : mode === 'replace' ? !!value('needle') : !!value('text');
      const rows = (this.data.transactions || []).filter(tx => matches(tx, filter) && (!hasItemReplacementScope || descriptionMatches(tx.note, itemNameToReplace, this._replaceWholeWord))).slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(tx => {
        const account = (this.data.accounts || []).find(a => a.id === (tx.accountId || tx.fromAccountId)) || (this.data.creditCards || []).find(a => a.id === tx.cardId);
        const category = (this.data.categories || []).find(c => c.id === tx.categoryId);
        const values = { description: tx.note || '', date: this.fmtDateInput(tx.date), year: String(tx.date || '').slice(0,4), month: new Date(String(tx.date) + 'T12:00:00').toLocaleString('en', { month:'long' }), account: account && account.name || '', category: category && category.name || '', person: (this.data.people || []).filter(p => (tx.personIds || []).includes(p.id)).map(p => p.name).join(', ') };
        let after = tx.note || '';
        if (ready && assignedPersonName) {
          const name = value('name-to-replace').trim().replace(/^@/, '');
          if (name) {
            after = after.replace(new RegExp('(^|[^\\p{L}\\p{N}_@])@?' + escapeRegex(name) + '(?=$|[^\\p{L}\\p{N}_])', 'giu'), (_, prefix) => prefix + '@' + assignedPersonName);
          } else {
            const mention = '@' + assignedPersonName;
            const mentionPattern = new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegex(mention) + '(?=$|[^\\p{L}\\p{N}_])', 'iu');
            if (!mentionPattern.test(after)) {
              const description = String(after || '').trimEnd();
              after = (description ? description + ' ' : '') + mention;
            }
          }
        } else if (ready && assignedItemName) {
          const name = value('name-to-replace').trim().replace(/^\$\s*/, '');
          if (name) {
            after = replaceItemText(after, name, assignedItemName, this._replaceWholeWord).value;
          } else if (!itemTags(after).has(String(assignedItemName).toLocaleLowerCase())) {
            const description = String(after || '').trimEnd();
            const itemTag = '$' + assignedItemName + ITEM_TAG_END;
            after = (description ? description + ' ' : '') + itemTag;
          }
        } else if (ready && !bulkAction) after = rewrite(tx, value('needle'), value('text'), value('mode'), values);
        const personNeedsLink = !!assignedPersonName && (!!newPersonName || !(tx.personIds || []).includes(assignedPerson?.id));
        const changed = ready && ((tx.note || '') !== after || personNeedsLink);
        const previewAfter = after;
        const plan = bulkAction ? this.transactionBulkPlan(tx,mode,value('target'),value('account-side')) : {};
        return { id: tx.id, original: JSON.stringify(tx), before: tx.note || '', after, previewAfter, changed, personId: assignedPerson?.id, newPersonName, itemKey:assignedItem?.key, date: tx.date, amount: tx.amount, currency: tx.currency, ...plan };
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
        if (rows.some(row => row.itemKey && !this.existingTrackedItems().some(item => item.key === row.itemKey))) { this.showToast('Item changed. Generate a fresh preview.'); return; }
        const requestedNewPersonName = rows.find(row => row.newPersonName)?.newPersonName || '';
        if (requestedNewPersonName && (this.data.people || []).some(person => person.name.toLocaleLowerCase() === requestedNewPersonName.toLocaleLowerCase())) { this.showToast('People changed. Generate a fresh preview.'); return; }
        const newAssignedPerson = requestedNewPersonName ? { id:crypto.randomUUID(), name:requestedNewPersonName, color:this.colorForName(requestedNewPersonName), accountNumber:'', notes:'' } : null;
        const beforeBatch = JSON.parse(JSON.stringify(this.data));
        try {
          if (newAssignedPerson) (this.data.people ||= []).push(newAssignedPerson);
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
            else { const personId = row.personId || (row.newPersonName && newAssignedPerson ? newAssignedPerson.id : null); if (personId) tx.personIds = [...new Set([...(tx.personIds || []), personId])]; tx.note = row.after; }
          });
          if (mode === 'link-bill' || mode === 'set-account' || mode === 'delete') {
            (this.data.billPayments || []).forEach(payment => this.syncBillPaymentTransactions(payment,(this.data.bills || []).find(bill => bill.id === payment.billId)));
          }
        } catch (error) {
          this.data = beforeBatch;
          this.showToast('Changes could not be applied. Nothing was changed.');
          return;
        }
        const assigned = rows.some(row => row.personId || row.newPersonName);
        const labels = {'set-category':'Set transaction categories',delete:'Delete transactions','remove-person':'Remove transaction people','link-bill':'Link transactions to bill','set-account':'Set transaction accounts','assign-item':'Assign items to transactions'};
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
      const txs = (this.data.transactions || []).filter(tx => (tx.personIds || []).includes(id) || (tx.parts || []).some(part => (part.personIds || []).includes(id))).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
      const totals = {};
      const add = (currency, field, amount) => { const item = totals[currency] ||= {income:0,expense:0,out:0,in:0}; item[field] += Math.abs(Number(amount) || 0); };
      const personRows = txs.map(tx => {
        if (tx.type === 'transfer') {
          if ((tx.personIds || []).includes(id)) { add(tx.currency || this.baseCurrency(),'out',tx.amount); add(tx.currencyIn || tx.currency || this.baseCurrency(),'in',tx.amountIn ?? tx.amount); }
          return { tx, amount:tx.amount, description:tx.note || '' };
        }
        const allocations = this.transactionAllocationRows(tx).filter(row => (row.personIds || []).includes(id));
        allocations.forEach(row => add(tx.currency || this.baseCurrency(),tx.type === 'income' ? 'income' : 'expense',row.amount));
        return { tx, amount:allocations.reduce((sum,row) => sum + row.amount,0), description:[tx.note, ...allocations.map(row => row.partDescription).filter(Boolean)].filter(Boolean).join(' · ') };
      });
      document.getElementById('person-summary').innerHTML = Object.entries(totals).map(([currency,t]) => {
        const net = t.income - t.expense;
        return '<div class="person-summary-line"><strong>' + this.escapeHtml(currency) + '</strong><span>INCOME <strong class="amt-income">' + this.fmtNumber(t.income) + '</strong></span><span>EXPENSES <strong class="amt-expense">' + this.fmtNumber(t.expense) + '</strong></span><span>NET <strong class="' + (net > 0 ? 'amt-income' : net < 0 ? 'amt-expense' : '') + '">' + this.fmtNumber(net) + '</strong></span>' + (t.out || t.in ? '<span>TRANSFERS OUT ' + this.fmtNumber(t.out) + ' / IN ' + this.fmtNumber(t.in) + '</span>' : '') + '</div>';
      }).join('') + (txs.some(tx => (tx.personIds || []).length > 1 || this.transactionAllocationRows(tx).some(row => (row.personIds || []).length > 1)) ? '<p class="health-explanation">Shared entries appear in each person’s history; split parts show only their assigned amounts.</p>' : '');
      const history = document.getElementById('person-history');
      document.getElementById('person-transaction-count').textContent = id ? txs.length + ' TRANSACTION' + (txs.length === 1 ? '' : 'S') : '';
      history.innerHTML = id ? personRows.map((row,index) => {
        const tx = row.tx;
        return '<div class="person-history-row"><span>' + this.escapeHtml(this.fmtDateInput(tx.date)) + ' · <span class="' + (tx.type === 'income' ? 'amt-income' : tx.type === 'expense' ? 'amt-expense' : 'amt-transfer') + '">' + this.escapeHtml(this.fmtAmount(row.amount,tx.currency || this.baseCurrency())) + '</span> · ' + this.transactionDescriptionHtml({ ...tx, note:row.description }, 'No description') + '</span><button type="button" class="btn btn-sm btn-icon person-history-link" data-index="' + index + '" aria-label="Show transaction" title="Show transaction">' + this.transactionLinkIcon() + '</button></div>';
      }).join('') : '';
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
      (this.data.transactions || []).forEach(tx=> {
        if ((tx.personIds || []).includes(id)) tx.personIds = tx.personIds.filter(value=>value!==id);
        if (Array.isArray(tx.parts)) tx.parts.forEach(part => { part.personIds = (part.personIds || []).filter(value => value !== id); });
      });
      await this.save({undoable:true,label:'Delete person'}); this.renderPeopleList(); this.editPerson(null);
    },
    existingTrackedItems() {
      return typeof this.reportsItemsIndex === 'function' ? this.reportsItemsIndex() : [];
    },
    populateReplaceItemOptions(modal) {
      const select = modal && modal.querySelector('#replace-item');
      if (!select) return;
      const transactions = this.data.transactions || [];
      const sequence = this._saveSequence || 0;
      const cache = this._replaceItemOptionsCache;
      if (cache && cache.transactions === transactions && cache.sequence === sequence && cache.length === transactions.length) {
        if (select.dataset.itemOptionsLoaded !== 'true') {
          const current = select.value;
          select.innerHTML = '<option value="">All items</option><option value="__none__">No item</option>' + cache.items.map(item => '<option value="' + this.escapeHtml(item.key) + '">$' + this.escapeHtml(item.name) + '</option>').join('');
          select.value = current;
          select.dataset.itemOptionsLoaded = 'true';
          this.syncCustomSelect(select);
        }
        return;
      }
      const items = this.existingTrackedItems().slice().sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity:'base' }) || a.key.localeCompare(b.key));
      this._replaceItemOptionsCache = { transactions, sequence, length: transactions.length, items };
      const current = select.value;
      select.innerHTML = '<option value="">All items</option><option value="__none__">No item</option>' + items.map(item => '<option value="' + this.escapeHtml(item.key) + '">$' + this.escapeHtml(item.name) + '</option>').join('');
      select.value = current;
      select.dataset.itemOptionsLoaded = 'true';
      this.syncCustomSelect(select);
    },
    initItemEntry(noteId) {
      const input = document.getElementById(noteId);
      if (!input) return;
      let panel = document.getElementById(noteId + '-items');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = noteId + '-items';
        panel.className = 'transaction-item-suggestions hidden';
        panel.setAttribute('role', 'listbox');
        panel.setAttribute('aria-label', 'Existing items');
        const splitRow = input.closest('.tx-split-row');
        if (splitRow) splitRow.insertAdjacentElement('afterend', panel);
        else input.parentElement.insertBefore(panel, document.getElementById(noteId + '-people'));
      }
      if (input.dataset.itemEntryBound === 'true') return;
      input.dataset.itemEntryBound = 'true';
      input.addEventListener('input', event => {
        if (event.isTrusted) delete input.dataset.confirmedItem;
        this.renderItemEntrySuggestions(noteId);
      });
      input.addEventListener('keydown', event => {
        const panel = document.getElementById(noteId + '-items');
        const options = panel && !panel.classList.contains('hidden') ? [...panel.querySelectorAll('.transaction-item-suggestion')] : [];
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!options.length) return;
          event.preventDefault();
          const current = Number(panel.dataset.activeIndex || 0);
          const next = event.key === 'ArrowDown'
            ? (current + 1) % options.length
            : (current - 1 + options.length) % options.length;
          panel.dataset.activeIndex = String(next);
          options.forEach((option, index) => {
            option.classList.toggle('is-active', index === next);
            option.setAttribute('aria-selected', String(index === next));
          });
          options[next].scrollIntoView({ block:'nearest' });
          return;
        }
        if (event.key !== 'Enter') return;
        if (options.length) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.chooseTransactionItem(noteId, options[Number(panel.dataset.activeIndex) || 0]?.dataset.itemName || options[0].dataset.itemName);
          return;
        }
        const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
        const start = input.value.lastIndexOf('$', Math.max(0, caret - 1));
        if (start < 0 || (start > 0 && !/\s/.test(input.value[start - 1]))) return;
        const priorEnd = input.value.indexOf(ITEM_TAG_END, start);
        if (priorEnd >= 0 && priorEnd < caret) return;
        if (input.value.lastIndexOf('@', caret - 1) > start) return;
        const confirmed = input.value.slice(start, caret).trim();
        if (!/^\$\s*[\p{L}]/u.test(confirmed) || input.dataset.confirmedItem === confirmed) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const suffix = input.value.slice(caret);
        const separator = suffix && /^\s/.test(suffix) ? '' : ' ';
        input.value = input.value.slice(0, caret) + ITEM_TAG_END + separator + suffix;
        const nextCaret = caret + ITEM_TAG_END.length + separator.length;
        input.setSelectionRange(nextCaret, nextCaret);
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dataset.confirmedItem = confirmed;
      });
      input.addEventListener('blur', () => setTimeout(() => document.getElementById(noteId + '-items')?.classList.add('hidden'), 120));
    },
    renderItemEntrySuggestions(noteId) {
      const input = document.getElementById(noteId);
      const panel = document.getElementById(noteId + '-items');
      if (!input || !panel) return;
      const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
      const start = input.value.lastIndexOf('$', Math.max(0, caret - 1));
      if (start < 0 || (start > 0 && !/\s/.test(input.value[start - 1]))) { panel.innerHTML = ''; panel.classList.add('hidden'); return; }
      const priorEnd = input.value.indexOf(ITEM_TAG_END, start);
      if (priorEnd >= 0 && priorEnd < caret) { panel.innerHTML = ''; panel.classList.add('hidden'); return; }
      const query = input.value.slice(start + 1, caret).replace(/\s+/g, ' ').replace(/^\s+/, '');
      if (/[@#]/.test(query)) { panel.innerHTML = ''; panel.classList.add('hidden'); return; }
      const lowerQuery = query.toLocaleLowerCase();
      const suggestions = this.existingTrackedItems().filter(item => item.name.toLocaleLowerCase().includes(lowerQuery))
        .sort((a,b) => Number(!a.name.toLocaleLowerCase().startsWith(lowerQuery)) - Number(!b.name.toLocaleLowerCase().startsWith(lowerQuery)) || a.name.localeCompare(b.name, undefined, { sensitivity:'base' }))
        .slice(0, 8);
      if (!suggestions.length) { panel.innerHTML = ''; panel.classList.add('hidden'); return; }
      panel.dataset.activeIndex = '0';
      panel.innerHTML = suggestions.map((item, index) => '<button type="button" role="option" aria-selected="' + (index === 0) + '" class="transaction-item-suggestion' + (index === 0 ? ' is-active' : '') + '" data-item-name="' + this.escapeHtml(item.name) + '"><strong>$' + this.escapeHtml(item.name) + '</strong></button>').join('');
      panel.querySelectorAll('.transaction-item-suggestion').forEach(button => {
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => this.chooseTransactionItem(noteId, button.dataset.itemName));
      });
      panel.classList.remove('hidden');
    },
    chooseTransactionItem(noteId, name) {
      const input = document.getElementById(noteId);
      const panel = document.getElementById(noteId + '-items');
      if (!input) return;
      const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
      const start = input.value.lastIndexOf('$', Math.max(0, caret - 1));
      if (start < 0) return;
      const token = '$' + name;
      const suffix = input.value.slice(caret);
      const separator = suffix && /^\s/.test(suffix) ? '' : ' ';
      input.value = input.value.slice(0, start) + token + ITEM_TAG_END + separator + suffix;
      const nextCaret = start + token.length + ITEM_TAG_END.length + separator.length;
      input.setSelectionRange(nextCaret, nextCaret);
      if (panel) { panel.innerHTML = ''; panel.classList.add('hidden'); }
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dataset.confirmedItem = token;
      input.focus();
    },
    renderTransactionTagHighlight(noteId) {
      if (noteId !== 'tx-note' && !noteId.startsWith('tx-split-description-')) return;
      const input = document.getElementById(noteId);
      if (!input || !input.parentElement) return;
      let overlay = document.getElementById(noteId + '-tag-highlight');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = noteId + '-tag-highlight';
        overlay.className = 'transaction-tag-highlight';
        overlay.setAttribute('aria-hidden', 'true');
        input.parentElement.classList.add('transaction-tag-highlight-host');
        input.parentElement.appendChild(overlay);
        input.classList.add('transaction-tag-highlight-source');
        input.addEventListener('input', () => this.renderTransactionTagHighlight(noteId));
        input.addEventListener('scroll', () => this.renderTransactionTagHighlight(noteId), { passive: true });
        input.addEventListener('focus', () => this.renderTransactionTagHighlight(noteId));
        input.addEventListener('blur', () => this.renderTransactionTagHighlight(noteId));
      }

      if (!input.offsetWidth || !input.offsetHeight) {
        if (input.dataset.tagHighlightMeasurePending !== 'true') {
          input.dataset.tagHighlightMeasurePending = 'true';
          requestAnimationFrame(() => {
            delete input.dataset.tagHighlightMeasurePending;
            if (input.isConnected && input.offsetWidth && input.offsetHeight) this.renderTransactionTagHighlight(noteId);
          });
        }
        return;
      }

      const rect = window.getComputedStyle(input);
      overlay.style.left = input.offsetLeft + 'px';
      overlay.style.top = input.offsetTop + 'px';
      overlay.style.width = input.offsetWidth + 'px';
      overlay.style.height = input.offsetHeight + 'px';
      overlay.style.fontFamily = rect.fontFamily;
      overlay.style.fontSize = rect.fontSize;
      overlay.style.fontWeight = rect.fontWeight;
      overlay.style.fontStyle = rect.fontStyle;
      overlay.style.letterSpacing = rect.letterSpacing;
      overlay.style.lineHeight = rect.lineHeight;
      overlay.style.textTransform = rect.textTransform;
      overlay.style.textAlign = rect.textAlign;
      overlay.style.padding = rect.padding;
      overlay.style.borderWidth = rect.borderWidth;
      overlay.style.borderStyle = rect.borderStyle;
      overlay.style.borderColor = document.activeElement === input ? 'var(--accent)' : 'var(--border)';
      overlay.style.borderRadius = rect.borderRadius;
      overlay.style.backgroundColor = document.activeElement === input ? 'var(--block-hover)' : 'var(--surface-raised)';
      overlay.classList.toggle('is-focused', document.activeElement === input);

      const note = String(input.value || '');
      const tokens = [];
      const itemPattern = /(?:^|\s)(\$\s*[\p{L}][^$\u2063]*?)(?=\u2063|\s+\$|\s+@[\p{L}]|$)/giu;
      for (const match of note.matchAll(itemPattern)) {
        const start = match.index + match[0].indexOf(match[1]);
        tokens.push({ start, end: start + match[1].length, type: 'item', text: match[1] });
      }
      const people = (this.data.people || []).filter(person => person && person.name).slice().sort((a, b) => b.name.length - a.name.length);
      for (const person of people) {
        const pattern = new RegExp('(^|[^\\p{L}\\p{N}_@])(@' + escapeRegex(person.name) + ')(?=$|[^\\p{L}\\p{N}_])', 'giu');
        for (const match of note.matchAll(pattern)) {
          const start = match.index + match[1].length;
          tokens.push({ start, end: start + match[2].length, type: 'person', person, text: match[2] });
        }
      }
      const genericPersonPattern = /(^|[^\p{L}\p{N}_@])(@[\p{L}\p{N}_-]+)/gu;
      for (const match of note.matchAll(genericPersonPattern)) {
        const start = match.index + match[1].length;
        tokens.push({ start, end: start + match[2].length, type: 'person', text: match[2] });
      }
      tokens.sort((a, b) => a.start - b.start || b.end - a.end);
      let html = '', cursor = 0;
      for (const token of tokens) {
        if (token.start < cursor) continue;
        html += this.escapeHtml(cleanDescription(note.slice(cursor, token.start)));
        if (token.type === 'item') html += '<span class="transaction-tag-highlight-item">' + this.escapeHtml(token.text) + '</span>';
        else html += '<span class="transaction-tag-highlight-person"' + (token.person ? ' style="color:' + this.personColor(token.person) + '"' : '') + '>' + this.escapeHtml(token.text) + '</span>';
        cursor = token.end;
      }
      html += this.escapeHtml(cleanDescription(note.slice(cursor)));
      overlay.innerHTML = '<span class="transaction-tag-highlight-text">' + html + '</span>';
      const text = overlay.firstElementChild;
      if (text) text.style.transform = 'translateX(-' + input.scrollLeft + 'px)';

      if (!this._transactionTagHighlightResizeBound) {
        this._transactionTagHighlightResizeBound = true;
        window.addEventListener('resize', () => document.querySelectorAll('.transaction-tag-highlight-source').forEach(field => this.renderTransactionTagHighlight(field.id)));
      }
    },
    initPeopleEntry(ids, noteId = 'tx-note') {
      const note = document.getElementById(noteId);
      if (!note) return;
      if (!note.dataset.peopleHint) { if (!/@|person/i.test(note.placeholder || '')) note.placeholder = (note.placeholder || 'Description') + ' · @ person'; note.dataset.peopleHint = 'true'; }
      this._peopleDrafts ||= {};
      this._peopleDrafts[noteId] = [...new Set(ids || [])].filter(id => (this.data.people || []).some(p=>p.id===id));
      let panel = document.getElementById(noteId + '-people');
      if (!panel) {
        panel = document.createElement('div'); panel.id = noteId + '-people'; panel.className = 'transaction-people';
        if (noteId === 'tx-note') note.parentElement.appendChild(panel);
        else note.parentElement.insertAdjacentElement('afterend', panel);
      }
      if (note.dataset.peopleEntryBound !== 'true') {
        note.dataset.peopleEntryBound = 'true';
        note.addEventListener('input', () => this.renderPeopleEntry(noteId));
        note.addEventListener('keydown', event => {
          const itemPanel = document.getElementById(noteId + '-items');
          if (event.key !== 'Enter' || (itemPanel && !itemPanel.classList.contains('hidden') && itemPanel.querySelector('.transaction-item-suggestion'))) return;
          const suggestion = panel.querySelector('.person-suggestion');
          if (!suggestion) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          suggestion.click();
        });
      }
      this.renderPeopleEntry(noteId);
      if (noteId === 'tx-note' || noteId.startsWith('tx-split-description-')) this.initItemEntry(noteId);
    },
    transactionPeopleDraft(noteId = 'tx-note') { return [...(this._peopleDrafts && this._peopleDrafts[noteId] || [])].filter(id => (this.data.people || []).some(person => person.id === id)); },
    renderPeopleEntry(noteId) {
      const note = document.getElementById(noteId), panel = document.getElementById(noteId + '-people');
      this.renderTransactionTagHighlight(noteId);
      const ids = this.transactionPeopleDraft(noteId), people = this.data.people || [];
      const caret = note.selectionStart ?? note.value.length;
      const match = note.value.slice(0,caret).match(/@([^@\n]*)$/);
      const query = match ? String(match[1] || '').trim() : '';
      const suggestions = query ? people.filter(person => !ids.includes(person.id) && person.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((a,b)=>a.name.localeCompare(b.name, undefined, { sensitivity:'base' })).slice(0,5) : [];
      const mentioned = new Set(people.filter(person => new RegExp('(^|[^\\p{L}\\p{N}_@])@' + escapeRegex(person.name) + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(note.value)).map(person => person.id));
      panel.innerHTML = '<div class="people-chips">' + people.filter(person => ids.includes(person.id) && !mentioned.has(person.id)).slice().sort((a,b)=>a.name.localeCompare(b.name, undefined, { sensitivity:'base' })).map(person=>'<button type="button" class="btn btn-sm btn-secondary" data-remove="' + this.escapeHtml(person.id) + '">@' + this.personNameHtml(person, false) + ' ×</button>').join('') + '</div><div class="people-suggestions">' + suggestions.map(person=>'<button type="button" class="btn btn-sm btn-secondary person-suggestion" data-person="' + this.escapeHtml(person.id) + '">@' + this.personNameHtml(person, false) + '</button>').join('') + '</div>';
      panel.querySelectorAll('[data-remove]').forEach(button=> { button.onclick=()=> { this._peopleDrafts[noteId] = ids.filter(id=>id!==button.dataset.remove); this.renderPeopleEntry(noteId); }; });
      panel.querySelectorAll('[data-person]').forEach(button=> { button.onclick=()=> {
        const person = people.find(p=>p.id===button.dataset.person);
        if (!person || !match) return;
        this._peopleDrafts[noteId] = [...ids,person.id];
        const start = caret - match[0].length;
        const suffix = note.value.slice(caret);
        const mention = '@' + person.name;
        const separator = suffix && /^\s/.test(suffix) ? '' : ' ';
        note.value = note.value.slice(0,start) + mention + separator + suffix;
        const nextCaret = start + mention.length + separator.length;
        note.setSelectionRange(nextCaret,nextCaret);
        note.focus();
        this.renderPeopleEntry(noteId);
      }; });
    }
  });
})();
