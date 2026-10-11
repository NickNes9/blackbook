(function () {
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens = /#(description|date|month|year|account|category|person)\b/g;
  const matches = (tx, filter) => (!filter.find || String(tx.note || '').toLocaleLowerCase().includes(filter.find.toLocaleLowerCase())) &&
    (!filter.type || tx.type === filter.type) && (!filter.category || tx.categoryId === filter.category) &&
    (!filter.account || [tx.accountId, tx.fromAccountId, tx.toAccountId, tx.cardId && 'card:' + tx.cardId].includes(filter.account)) &&
    (!filter.person || (tx.personIds || []).includes(filter.person)) && (!filter.from || tx.date >= filter.from) && (!filter.to || tx.date <= filter.to);
  const rewrite = (tx, find, replacement, mode, values) => {
    const expanded = replacement.replace(tokens, (_, token) => String(values[token] ?? ''));
    return mode === 'rewrite' ? expanded : String(tx.note || '').replace(new RegExp(escapeRegex(find), 'gi'), () => expanded);
  };
  window.TransactionTools = { matches, rewrite };
  Object.assign(window.BlackBook, {
    toolsModal(id, title, body) {
      let modal = document.getElementById(id);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = id; modal.className = 'modal hidden';
        modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', id + '-title');
        modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content transaction-tools-modal"><div class="modal-header"><h2 id="' + id + '-title">' + title + '</h2><button type="button" class="modal-close" aria-label="Close">×</button></div>' + body + '</div>';
        modal.querySelector('.modal-backdrop').onclick = modal.querySelector('.modal-close').onclick = () => this.closeModal(id);
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
    openFindReplace() {
      const modal = this.toolsModal('find-replace-modal', 'Find & Replace',
        '<div class="tools-grid"><label>Description contains<input id="replace-find" class="input"></label><label>Account<select id="replace-account" class="input"></select></label><label>Category<select id="replace-category" class="input"></select></label><label>Type<select id="replace-type" class="input"><option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select></label><label>From date<input id="replace-from" class="input"></label><label>To date<input id="replace-to" class="input"></label><label>Person<select id="replace-person" class="input"></select></label><label>Action<select id="replace-mode" class="input"><option value="replace">Replace text</option><option value="rewrite">Rewrite description</option></select></label></div>' +
        '<label class="tools-field">New text / template<input id="replace-text" class="input"></label><p class="health-explanation">#description · #date · #month · #year · #account · #category · #person. Search is plain text, case-insensitive. Preview before applying.</p>' +
        '<div class="tools-actions"><button id="replace-preview" class="btn btn-secondary">PREVIEW</button><button id="replace-apply" class="btn btn-primary" disabled>APPLY</button><span id="replace-count"></span></div><div id="replace-results" class="tools-scroll"></div>');
      modal.querySelector('#replace-account').innerHTML = '<option value="">All accounts</option>' + (this.data.accounts || []).map(a => '<option value="' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + '</option>').join('') + (this.data.creditCards || []).map(a => '<option value="card:' + this.escapeHtml(a.id) + '">' + this.escapeHtml(a.name) + '</option>').join('');
      modal.querySelector('#replace-category').innerHTML = '<option value="">All categories</option>' + (this.data.categories || []).map(c => '<option value="' + this.escapeHtml(c.id) + '">' + this.escapeHtml(c.name) + '</option>').join('');
      modal.querySelector('#replace-person').innerHTML = this.peopleOptions();
      modal.querySelectorAll('input,select').forEach(field => {
        field.value = field.tagName === 'SELECT' && field.id === 'replace-mode' ? 'replace' : '';
        field.oninput = () => { this._replacePreview = null; modal.querySelector('#replace-apply').disabled = true; modal.querySelector('#replace-results').innerHTML = ''; modal.querySelector('#replace-count').textContent = ''; };
      });
      modal.querySelector('#replace-preview').onclick = () => this.previewDescriptionChanges();
      modal.querySelector('#replace-apply').onclick = () => this.applyDescriptionChanges();
      this._replacePreview = null;
      modal.querySelector('#replace-results').innerHTML = ''; modal.querySelector('#replace-count').textContent = '';
      modal.querySelector('#replace-apply').disabled = true;
      this.openModal('find-replace-modal');
      modal.querySelector('#replace-find').focus();
    },
    previewDescriptionChanges() {
      const value = id => document.getElementById('replace-' + id).value;
      const filter = { find: value('find'), account: value('account'), category: value('category'), type: value('type'), person: value('person') };
      for (const key of ['from','to']) {
        filter[key] = value(key).trim() ? this.parseDateInput(value(key)) : '';
        if (value(key).trim() && !filter[key]) { this.showToast('Enter a valid ' + key + ' date'); return; }
      }
      if (filter.from && filter.to && filter.from > filter.to) { this.showToast('From date must be before To date'); return; }
      if (value('mode') === 'replace' && !filter.find) { this.showToast('Enter the text to replace'); return; }
      const rows = (this.data.transactions || []).filter(tx => matches(tx, filter)).slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(tx => {
        const account = (this.data.accounts || []).find(a => a.id === (tx.accountId || tx.fromAccountId)) || (this.data.creditCards || []).find(a => a.id === tx.cardId);
        const category = (this.data.categories || []).find(c => c.id === tx.categoryId);
        const values = { description: tx.note || '', date: this.fmtDateInput(tx.date), year: String(tx.date || '').slice(0,4), month: new Date(String(tx.date) + 'T12:00:00').toLocaleString('en', { month:'long' }), account: account && account.name || '', category: category && category.name || '', person: (this.data.people || []).filter(p => (tx.personIds || []).includes(p.id)).map(p => p.name).join(', ') };
        return { id: tx.id, original: JSON.stringify(tx), before: tx.note || '', after: rewrite(tx, filter.find, value('text'), value('mode'), values), date: tx.date, amount: tx.amount, currency: tx.currency };
      }).filter(row => row.before !== row.after);
      this._replacePreview = rows;
      this._replaceIncluded = new Set(rows.map(row => row.id));
      const results = document.getElementById('replace-results');
      results.innerHTML = rows.length ? rows.map((row,index) => '<label class="replace-row"><input type="checkbox" data-index="' + index + '" checked><span><small>' + this.escapeHtml(this.fmtDateInput(row.date) + ' · ' + this.fmtAmount(row.amount, row.currency || this.baseCurrency())) + '</small><span class="replace-before">' + this.escapeHtml(row.before || '(empty)') + '</span><span class="replace-after">→ ' + this.escapeHtml(row.after || '(empty)') + '</span></span></label>').join('') : '<p>No descriptions would change.</p>';
      results.querySelectorAll('input').forEach(input => { input.onchange = () => { const row = rows[Number(input.dataset.index)]; if (input.checked) this._replaceIncluded.add(row.id); else this._replaceIncluded.delete(row.id); this.updateReplaceCount(); }; });
      this.updateReplaceCount();
    },
    updateReplaceCount() {
      const count = this._replaceIncluded ? this._replaceIncluded.size : 0;
      document.getElementById('replace-count').textContent = count + ' changes selected';
      document.getElementById('replace-apply').disabled = !count;
    },
    async applyDescriptionChanges() {
      const rows = (this._replacePreview || []).filter(row => this._replaceIncluded.has(row.id));
      if (!rows.length || this._replaceBusy) return;
      const transactions = new Map((this.data.transactions || []).map(tx => [tx.id, tx]));
      if (rows.some(row => JSON.stringify(transactions.get(row.id)) !== row.original)) { this.showToast('Transactions changed. Generate a fresh preview.'); return; }
      this._replaceBusy = true; document.getElementById('replace-apply').disabled = true;
      try {
        rows.forEach(row => { transactions.get(row.id).note = row.after; });
        const saved = await this.save({ undoable:true, label:'Find & Replace descriptions' });
        this._replacePreview = null;
        if (!saved) { this.showToast('Changes are unsaved. Retry using the save indicator.'); return; }
        this.closeModal('find-replace-modal'); this.renderPage(this.currentPage);
        this.showToast(rows.length + ' descriptions updated');
      } finally { this._replaceBusy = false; }
    },
    openPeopleDirectory() {
      const modal = this.toolsModal('people-modal', 'People', '<div class="people-layout"><div><button class="btn btn-secondary" id="person-new">+ NEW PERSON</button><div id="people-list" class="tools-scroll"></div></div><div><form id="person-form"><label class="tools-field">Name<input id="person-name" class="input" required></label><label class="tools-field">Account number (optional)<input id="person-account" class="input"></label><label class="tools-field">Notes<textarea id="person-notes" class="input"></textarea></label><div class="tools-actions"><button type="submit" class="btn btn-primary">SAVE PERSON</button><button type="button" id="person-delete" class="btn btn-danger">DELETE</button></div></form><div id="person-summary"></div><div id="person-history" class="tools-scroll"></div></div></div>');
      modal.querySelector('#person-new').onclick = () => this.editPerson(null);
      modal.querySelector('#person-form').onsubmit = event => { event.preventDefault(); this.savePerson(); };
      modal.querySelector('#person-delete').onclick = () => this.deletePerson();
      this.renderPeopleList(); this.editPerson(null); this.openModal('people-modal');
      modal.querySelector('#person-name').focus();
    },
    renderPeopleList() {
      const list = document.getElementById('people-list');
      list.innerHTML = (this.data.people || []).slice().sort((a,b) => a.name.localeCompare(b.name)).map(person => '<button type="button" class="btn btn-secondary" data-person="' + this.escapeHtml(person.id) + '">' + this.escapeHtml(person.name) + '</button>').join('') || '<p>No people yet.</p>';
      list.querySelectorAll('button').forEach(button => { button.onclick = () => this.editPerson(button.dataset.person); });
    },
    editPerson(id) {
      this._personEditId = id;
      const person = (this.data.people || []).find(p => p.id === id) || {};
      document.getElementById('person-name').value = person.name || '';
      document.getElementById('person-account').value = person.accountNumber || '';
      document.getElementById('person-notes').value = person.notes || '';
      document.getElementById('person-delete').hidden = !id;
      const txs = (this.data.transactions || []).filter(tx => (tx.personIds || []).includes(id)).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
      const totals = {};
      const add = (currency, field, amount) => { const item = totals[currency] ||= {income:0,expense:0,out:0,in:0}; item[field] += Math.abs(Number(amount) || 0); };
      txs.forEach(tx => { if (tx.type === 'transfer') { add(tx.currency || this.baseCurrency(),'out',tx.amount); add(tx.currencyIn || tx.currency || this.baseCurrency(),'in',tx.amountIn ?? tx.amount); } else add(tx.currency || this.baseCurrency(),tx.type === 'income' ? 'income' : 'expense',tx.amount); });
      document.getElementById('person-summary').innerHTML = Object.entries(totals).map(([currency,t]) => '<p>' + this.escapeHtml(currency) + ' · INCOME ' + this.fmtNumber(t.income) + ' · EXPENSES ' + this.fmtNumber(t.expense) + ' · NET ' + this.fmtNumber(t.income-t.expense) + (t.out || t.in ? ' · TRANSFERS OUT ' + this.fmtNumber(t.out) + ' / IN ' + this.fmtNumber(t.in) : '') + '</p>').join('') + (txs.some(tx => (tx.personIds || []).length > 1) ? '<p class="health-explanation">Shared transactions show their full amount here; no individual shares are assigned.</p>' : '');
      const history = document.getElementById('person-history');
      history.innerHTML = id ? '<button type="button" class="btn btn-secondary" id="person-show-all">SHOW TRANSACTIONS · ' + txs.length + '</button>' + txs.map((tx,index) => '<div class="person-history-row"><span>' + this.escapeHtml(this.fmtDateInput(tx.date) + ' · ' + this.fmtAmount(tx.amount,tx.currency || this.baseCurrency()) + ' · ' + (tx.note || 'No description')) + '</span><button type="button" class="btn btn-sm btn-secondary" data-index="' + index + '">' + this.transactionLinkIcon() + '</button></div>').join('') : '';
      if (id) {
        document.getElementById('person-show-all').disabled = !txs.length;
        document.getElementById('person-show-all').onclick = () => { this.closeModal('people-modal'); this.openDataHealthTransactions(txs.map(tx=>tx.id)); };
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
      panel.innerHTML = '<div class="people-chips">' + people.filter(p=>ids.includes(p.id)).map(p=>'<button type="button" class="btn btn-sm btn-secondary" data-remove="' + this.escapeHtml(p.id) + '">@' + this.escapeHtml(p.name) + ' ×</button>').join('') + '</div><div class="people-suggestions">' + suggestions.map(p=>'<button type="button" class="btn btn-sm btn-secondary person-suggestion" data-person="' + this.escapeHtml(p.id) + '">@' + this.escapeHtml(p.name) + '</button>').join('') + '</div>';
      panel.querySelectorAll('[data-remove]').forEach(button=> { button.onclick=()=> { this._peopleDrafts[noteId] = ids.filter(id=>id!==button.dataset.remove); this.renderPeopleEntry(noteId); }; });
      panel.querySelectorAll('[data-person]').forEach(button=> { button.onclick=()=> { const person = people.find(p=>p.id===button.dataset.person); this._peopleDrafts[noteId] = [...ids,person.id]; note.value = note.value.slice(0,caret-match[0].length) + '@' + person.name + ' ' + note.value.slice(caret); note.focus(); this.renderPeopleEntry(noteId); }; });
    }
  });
})();
