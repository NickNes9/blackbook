(function () {
Object.assign(window.BlackBook, {
  renderSettings() {
    const el = document.getElementById('page-settings');
    if (!el) return;
    el.innerHTML = this.settingsHtml();
    this.upgradeAllSelects(el);
    this.bindSettingsEvents(el);
    this.bindSettingsModals();
    this.refreshProfilesList();
  },

  profilesListHtml() {
    return '<div style="padding:8px;color:var(--text-muted);font-size:13px;">Loading profiles&hellip;</div>';
  },

  async refreshProfilesList() {
    const el = document.getElementById('profiles-list');
    if (!el) return;
    let profiles = [];
    try {
      const res = await fetch('/api/profiles');
      profiles = (await res.json()).profiles || [];
    } catch (e) {}
    let html = '<div class="settings-row' + (!this.profile ? ' settings-row-active' : '') + '"><span class="settings-row-name">DEFAULT</span><span class="settings-row-meta">' + (this.profile ? 'switch to default data set' : 'active') + '</span>' +
      (!this.profile ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.renameProfile(\'\')">RENAME</button>' : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.switchProfile(\'\')">OPEN</button>') + '</div>';
    if (!profiles.length) html += '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No extra profiles yet.</div>';
    for (const p of profiles) {
      const active = p.name === this.profile;
      html += '<div class="settings-row' + (active ? ' settings-row-active' : '') + '">' +
        '<span class="settings-row-name">' + this.escapeHtml(p.name).toUpperCase() + '</span>' +
        '<span class="settings-row-meta">' + (active ? 'active profile' : '') + '</span>' +
        (!active ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.switchProfile(\x27' + this.escapeHtml(p.name) + '\x27)">OPEN</button>' : '') +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.renameProfile(\x27' + this.escapeHtml(p.name) + '\x27)">RENAME</button>' +
        '<button class="btn btn-sm btn-danger btn-icon" title="Delete profile" onclick="BlackBook.deleteProfile(\x27' + this.escapeHtml(p.name) + '\x27)">' + this.xIcon() + '</button></div>';
    }
    el.innerHTML = html;
  },

  switchProfile(name) {
    localStorage.setItem('mb_profile', name || '');
    location.reload();
  },
  createProfile() {
    this.populateNewProfileModal();
    this.openModal('new-profile-modal');
    setTimeout(() => { const f = document.getElementById('new-profile-name'); if (f) f.focus(); }, 30);
  },

  allCurrencyCodes() {
    return ['AED','AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP','HKD','HRK','HUF','IDR','ILS','INR','ISK','JPY','KRW','MXN','MYR','NOK','NZD','PHP','PLN','RON','RSD','SEK','SGD','THB','TRY','TWD','USD','XAU','ZAR'];
  },

  populateNewProfileModal() {
    const sel = document.getElementById('new-profile-currency');
    if (!sel) return;
    const curs = this.allCurrencyCodes();
    sel.innerHTML = curs.map(c => '<option value="' + this.escapeHtml(c) + '">' + this.escapeHtml(c) + '</option>').join('');
    const def = this.baseCurrency();
    if (curs.includes(def)) sel.value = def;
  },

  async submitNewProfile(e) {
    if (e) e.preventDefault();
    const nameEl = document.getElementById('new-profile-name');
    const accEl = document.getElementById('new-profile-account');
    const curEl = document.getElementById('new-profile-currency');
    const name = nameEl.value.trim();
    const account = accEl.value.trim();
    const currency = curEl.value;
    if (!name) { alert('Enter a name for the new profile.'); nameEl.focus(); return; }
    if (!account) { alert('Enter a name for the first account.'); accEl.focus(); return; }
    if (!currency) { alert('Choose a default currency.'); curEl.focus(); return; }
    try {
      await this._createProfile(name, account, currency);
    } catch (err) {
      alert('Could not create the profile \u2014 the Black Book server appears to be down.');
      return;
    }
    this.closeModal('new-profile-modal');
  },

  async _createProfile(name, account, currency) {
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', name: name }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    const fresh = await (await fetch('/api/load?profile=' + encodeURIComponent(name))).json();
    fresh.settings = fresh.settings || {};
    fresh.settings.baseCurrency = currency;
    fresh.settings.enabledCurrencies = [currency];
    fresh.settings.currencyPreset = true;
    fresh.accounts = fresh.accounts || [];
    fresh.accounts.push({ id: crypto.randomUUID(), name: account, shortName: account.slice(0, 3).toUpperCase(), currency: currency, type: 'cash', color: null });
    const saveRes = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: name, data: fresh }) });
    if (!saveRes.ok) throw new Error('save failed');
    await this.save();
    this.switchProfile(name);
  },
  async renameProfile(name) {
    const newName = await this.promptModal({
      title: name ? 'Rename Profile' : 'Name Default Profile',
      message: name ? 'Rename profile "' + name + '":' : 'Name the default profile (it becomes a named profile):',
      defaultValue: name || 'default',
      confirmText: 'Save'
    });
    if (!newName || !newName.trim() || newName.trim() === name) return;
    const wasActive = this.profile === name;
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', name: name, newName: newName.trim() }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    if (wasActive) this.switchProfile(newName.trim());
    else this.refreshProfilesList();
  },
  async deleteProfile(name) {
    if (!(await this.confirmModal({ title: 'Delete Profile', message: 'Delete profile "' + name + '" and all of its data?', confirmText: 'Delete' }))) return;
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', name: name }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    if (this.profile === name) this.switchProfile('');
    else this.refreshProfilesList();
  },

  parseCsvText(text) {
    const firstLine = (text.split(/\r?\n/).find(l => l.trim() !== '') || '');
    let commas = 0, semis = 0, tabs = 0, q = false;
    for (const ch of firstLine) {
      if (ch === '"') q = !q;
      else if (!q) { if (ch === ',') commas++; else if (ch === ';') semis++; else if (ch === '\t') tabs++; }
    }
    const delim = tabs > commas && tabs > semis ? '\t' : (semis > commas ? ';' : ',');
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQ = false;
        } else cell += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  },

  parseCsvAmount(raw) {
    const orig = String(raw == null ? '' : raw).trim();
    let s = orig.replace(/[^\d.,\-+()]/g, '');
    if (!s) return NaN;
    const neg = s.startsWith('-') || /^\(.*\)$/.test(s);
    s = s.replace(/[()\-\+]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\.(?=\d{3}\b)/g, '');
    }
    const n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -Math.abs(n) : n;
  },

  normalizeCsvDate(raw, fmt) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
      const m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
      return m ? m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0') : '';
    }
    const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
    if (!m) return '';
    let d, mo, y;
    if (fmt === 'mdy' || (fmt === 'auto' && m[0].includes('/'))) { mo = +m[1]; d = +m[2]; }
    else { d = +m[1]; mo = +m[2]; }
    y = +m[3];
    if (y < 100) y += y > 70 ? 1900 : 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  },

  openCsvImportModal(textOrRows) {
    this._csvRows = Array.isArray(textOrRows) ? textOrRows : this.parseCsvText(textOrRows);
    if (!this._csvRows.length) { alert('No rows found in CSV.'); return; }
    const maxCols = Math.max(...this._csvRows.slice(0, 20).map(r => r.length));
    const colOpts = Array.from({ length: maxCols }, (_, i) => '<option value="' + i + '">COL ' + (i + 1) + (this._csvRows[0][i] ? ' (' + this.escapeHtml(String(this._csvRows[0][i]).slice(0, 18)) + ')' : '') + '</option>').join('');
    document.getElementById('csv-col-date').innerHTML = colOpts;
    document.getElementById('csv-col-amount').innerHTML = colOpts;
    document.getElementById('csv-col-desc').innerHTML = colOpts;
    document.getElementById('csv-col-type').innerHTML = '<option value="-">-- none --</option>' + colOpts;
    document.getElementById('csv-col-currency').innerHTML = '<option value="-">-- fixed RSD --</option>' + colOpts;
    document.getElementById('csv-col-category').innerHTML = '<option value="-">-- none --</option>' + colOpts;
    const guess = (re) => { const i = this._csvRows[0].findIndex(c => re.test(String(c || '').toLowerCase())); return i >= 0 ? String(i) : '0'; };
    document.getElementById('csv-col-date').value = guess(/date|datum|valuta/);
    document.getElementById('csv-col-desc').value = guess(/desc|info|note|opis|naziv|purpose|payer|recipient|details/);
    document.getElementById('csv-col-amount').value = guess(/amount|iznos|value|sum|total|ukupno/);
    const tIdx = guess(/type|tip/);
    if (tIdx !== '0' || /type|tip/i.test(String(this._csvRows[0][0]))) document.getElementById('csv-col-type').value = tIdx;
    const cIdx = guess(/currency|valuta/);
    if (cIdx !== '0' || /currency|valuta/i.test(String(this._csvRows[0][0]))) document.getElementById('csv-col-currency').value = cIdx;
    document.getElementById('csv-col-category').value = guess(/categor|kategor/);
    const accSel = document.getElementById('csv-account');
    const defAcc = this.data.settings.defaultAccountId;
    accSel.innerHTML = this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === defAcc ? ' selected' : '') + '>' + this.escapeHtml(a.name) + '</option>').join('');
    document.getElementById('csv-skip-header').checked = true;
    document.getElementById('csv-sign').value = 'neg';
    document.getElementById('csv-datefmt').value = 'auto';
    const pv = this._csvRows.slice(0, 6);
    document.getElementById('csv-preview').innerHTML = '<table class="csv-preview-table"><thead><tr>' +
      Array.from({ length: maxCols }, (_, i) => '<th>COL ' + (i + 1) + '</th>').join('') + '</tr></thead><tbody>' +
      pv.map(r => '<tr>' + Array.from({ length: maxCols }, (_, i) => '<td>' + this.escapeHtml(String(r[i] == null ? '' : r[i]).slice(0, 26)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    this.bindCsvImportForm();
    this.openModal('csv-import-modal');
  },

  bindCsvImportForm() {
    const f = document.getElementById('csv-import-form');
    if (!f || f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (e) => { e.preventDefault(); await this.doCsvImport(); });
  },

  async doCsvImport() {
    const rows = this._csvRows || [];
    const g = (r, sel) => { const i = parseInt(sel, 10); return (sel !== '-' && !isNaN(i) && i >= 0 && i < r.length) ? String(r[i]).trim() : ''; };
    const dateCol = document.getElementById('csv-col-date').value;
    const amtCol = document.getElementById('csv-col-amount').value;
    const descCol = document.getElementById('csv-col-desc').value;
    const typeCol = document.getElementById('csv-col-type').value;
    const curCol = document.getElementById('csv-col-currency').value;
    const catCol = document.getElementById('csv-col-category').value;
    const signMode = document.getElementById('csv-sign').value;
    const dateFmt = document.getElementById('csv-datefmt').value;
    const accountId = document.getElementById('csv-account').value;
    const skipHeader = document.getElementById('csv-skip-header').checked;
    if (!accountId) { alert('Choose a target account.'); return; }
    const catMap = {};
    for (const c of this.data.categories) catMap[String(c.name).trim().toLowerCase()] = c.id;
    const newCategories = [];
    const catByName = (cell, note) => {
      const rule = (this.data.importRules || []).find(r => r.active !== false && r.categoryId && r.match && String(note || '').toLowerCase().includes(String(r.match).toLowerCase()));
      if (rule) return rule.categoryId;
      if (!cell) return null;
      const s = cell.toLowerCase();
      if (catMap[s]) return catMap[s];
      for (const [name, id] of Object.entries(catMap)) {
        if (name.length > 3 && (s.includes(name) || name.includes(s))) return id;
      }
      const cat = { id: crypto.randomUUID(), name: cell.trim(), color: this.nextCategoryColor() };
      newCategories.push(cat);
      catMap[s] = cat.id;
      return cat.id;
    };
    const staged = [];
    let skipped = 0;
    for (let i = skipHeader ? 1 : 0; i < rows.length; i++) {
      const r = rows[i];
      const date = this.normalizeCsvDate(g(r, dateCol), dateFmt);
      const amt = this.parseCsvAmount(g(r, amtCol));
      if (!date || isNaN(amt)) { skipped++; continue; }
      let type = null;
      const typeCell = g(r, typeCol).toLowerCase();
      if (typeCol !== '-' && typeCell) {
        if (/^(in|credit|prihod|ulaz)/.test(typeCell) || typeCell.includes('credit')) type = 'income';
        else if (/^(out|exp|debit|potr|troš|tros)/.test(typeCell)) type = 'expense';
      }
      if (!type) type = signMode === 'pos' ? (amt > 0 ? 'expense' : 'income') : (amt < 0 ? 'expense' : 'income');
      const currencyRaw = g(r, curCol).toUpperCase();
      const currency = (this.currencyList().includes(currencyRaw) || currencyRaw === 'XAU') ? currencyRaw : this.baseCurrency();
      const note = g(r, descCol);
      staged.push({
        id: crypto.randomUUID(), date: date, type: type,
        amount: Math.round((type === 'income' ? Math.abs(amt) : -Math.abs(amt)) * 100) / 100,
        currency: currency, accountId: accountId, cardId: null,
        categoryId: catByName(g(r, catCol), note), note: note
      });
    }
    const duplicateCount = staged.filter(candidate => (this.data.transactions || []).some(existing => {
      if (existing.accountId !== candidate.accountId || existing.currency !== candidate.currency || Math.abs(Number(existing.amount) - candidate.amount) > 0.009) return false;
      const days = Math.abs((new Date(existing.date + 'T00:00:00') - new Date(candidate.date + 'T00:00:00')) / 86400000);
      return days <= 3;
    })).length;
    if (!staged.length) { alert('No valid rows to import.'); return; }
    const ok = await this.confirmModal({ title: 'Review import', message: staged.length + ' valid row' + (staged.length === 1 ? '' : 's') + ' ready. ' + (duplicateCount ? duplicateCount + ' may duplicate existing transactions (same account, amount, currency, within 3 days). ' : '') + 'Import all staged rows?', confirmText: 'Import all', danger: false });
    if (!ok) return;
    this.data.categories.push(...newCategories);
    this.data.transactions.push(...staged);
    const imported = staged.length;
    await this.save();
    this.closeModal('csv-import-modal');
    this.renderPage(this.currentPage);
    alert('Imported ' + imported + ' transaction' + (imported === 1 ? '' : 's') + (skipped ? ' \u00b7 skipped ' + skipped + ' unparseable row' + (skipped === 1 ? '' : 's') : '') + '.');
  },

  async openImportRule() {
    const match = await this.promptModal({ title: 'Import rule', message: 'When the description contains:', placeholder: 'for example, supermarket' });
    if (!match) return;
    const categoryName = await this.promptModal({ title: 'Import rule', message: 'Assign matching rows to this category:', placeholder: 'Category name' });
    if (!categoryName) return;
    let category = this.data.categories.find(c => c.name.toLowerCase() === String(categoryName).trim().toLowerCase());
    if (!category) { category = { id: crypto.randomUUID(), name: String(categoryName).trim(), color: this.nextCategoryColor() }; this.data.categories.push(category); }
    this.data.importRules.push({ id: crypto.randomUUID(), match: String(match).trim(), categoryId: category.id, active: true });
    await this.save(); this.renderSettings();
  },

  async deleteImportRule(id) {
    this.data.importRules = this.data.importRules.filter(rule => rule.id !== id);
    await this.save(); this.renderSettings();
  },

  exportCsv() {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['date', 'type', 'amount', 'currency', 'account', 'card', 'category', 'note']];
    for (const t of this.data.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const acc = this.data.accounts.find(a => a.id === t.accountId);
      const card = t.cardId ? this.cardById(t.cardId) : null;
      const cat = this.data.categories.find(c => c.id === t.categoryId);
      rows.push([t.date, t.type, t.amount, t.currency || this.baseCurrency(), acc ? acc.name : '', card ? card.name : '', cat ? cat.name : '', t.note || '']);
    }
    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'blackbook-transactions-' + this.today() + '.csv';
    a.click();
  },

  refreshIcon() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="vertical-align:-2px;fill:currentColor;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
  },

  xIcon() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="vertical-align:-2px;fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  },

  fmtUpd24(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    if (isNaN(d)) return '--';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  ratesTableHtml() {
    const rates = this.getRates();
    const enabled = this.currencyList();
    const used = new Set(enabled);
    for (const t of (this.data.transactions || [])) if (t.currency) used.add(t.currency);
    for (const a of (this.data.accounts || [])) if (a.currency) used.add(a.currency);
    for (const b of (this.data.bills || [])) if (b.currency) used.add(b.currency);
    for (const g of (this.data.savingsGoals || [])) if (g.currency) used.add(g.currency);
    for (const d of (this.data.debts || [])) if (d.currency) used.add(d.currency);
    const enabledList = Array.from(used);
    const base = this.baseCurrency();
    const baseRate = base === 'EUR' ? 1 : (rates[base] || {}).rate;
    const orderArr = this.data.settings.enabledCurrencies || [];
    const shownFor = (code, r) => {
      if (code === base) return 1;
      if (!r || r.rate == null || !baseRate) return null;
      return this.rnd4(r.rate / baseRate);
    };
    const fmtRate = (v) => v != null
      ? v.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' <span class="rate-unit">' + base + '</span>'
      : '--';
    let rows = '<div class="rate-grid-row rate-grid-head"><span>CUR</span><span>RATE (in ' + base + ')</span><span>UPDATED</span><span>SET</span><span>ORDER</span><span></span><span>DEFAULT</span><span></span><span></span></div>';
    for (const code of enabledList) {
      const r = rates[code] || { rate: null, source: null, updated: null };
      const shown = shownFor(code, r);
      const rateVal = fmtRate(shown);
      const updated = r.source === 'manual' ? '<span class="rate-manual-tag">manual</span>' : this.fmtUpd24(r.updated);
      const isBase = code === base;
      const removable = !isBase;
      const idx = orderArr.indexOf(code);
      const canUp = !isBase && idx > 0 && orderArr[idx - 1] !== base;
      const canDown = !isBase && idx >= 0 && idx < orderArr.length - 1 && orderArr[idx + 1] !== base;
      const setCell = '<button class="btn btn-sm btn-secondary" ' +
        (isBase ? 'disabled title="Base currency is always 1"' : 'title="Set manually" onclick="BlackBook.openManualRateModal(\x27' + code + '\x27)"') +
        '>SET</button>';
      const orderCell = '<span class="settings-row-order">' +
        '<button type="button" class="btn btn-sm btn-secondary" ' + (canUp ? 'onclick="BlackBook.moveCurrency(\x27' + code + '\x27,-1)"' : 'disabled') + ' title="Move up">&#9650;</button>' +
        '<button type="button" class="btn btn-sm btn-secondary" ' + (canDown ? 'onclick="BlackBook.moveCurrency(\x27' + code + '\x27,1)"' : 'disabled') + ' title="Move down">&#9660;</button>' +
        '</span>';
      const refreshCell = '<button class="btn btn-sm btn-secondary btn-icon" title="Refresh rate" onclick="BlackBook.refreshRate(\x27' + code + '\x27)">' + this.refreshIcon() + '</button>';
      const defaultCell = isBase
        ? '<button class="btn btn-sm btn-muted" disabled title="Current default currency">DEFAULT</button>'
        : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.setDefaultCurrency(\x27' + code + '\x27)">SET DEFAULT</button>';
      rows += '<div class="rate-grid-row">' +
        '<span class="rate-code">' + code + '</span>' +
        '<span class="rate-val">' + rateVal + '</span>' +
        '<span class="rate-upd">' + updated + '</span>' +
        setCell +
        orderCell +
        refreshCell +
        defaultCell +
        (removable ? '<button class="btn btn-sm btn-danger btn-icon" title="Remove currency" onclick="BlackBook.removeCurrency(\x27' + code + '\x27)">' + this.xIcon() + '</button>' : '<span></span>') +
        '<span></span>' +
        '</div>';
    }
    return rows;
  },

  openManualRateModal(code) {
    if (!code) return;
    const rates = this.getRates();
    const base = this.baseCurrency();
    const baseRate = (base === 'EUR' ? 1 : (rates[base] || {}).rate);
    const r = rates[code];
    const shown = (r && r.rate != null && baseRate) ? this.rnd4(r.rate / baseRate) : '';
    const html = '<div class="modal-backdrop" onclick="BlackBook.closeManualRateModal()"></div>' +
      '<div class="modal-content" style="max-width:340px;">' +
      '<div class="modal-header"><span class="modal-title">Set ' + code + ' rate</span><button class="modal-close" onclick="BlackBook.closeManualRateModal()">&times;</button></div>' +
      '<div class="modal-body" style="padding:14px;">' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">1 ' + code + ' = <input type="number" step="any" min="0" id="manual-rate-input" class="input" style="width:120px;display:inline-block;" value="' + (shown || '') + '" autofocus> ' + base + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">' +
      '<button class="btn btn-sm btn-secondary" onclick="BlackBook.closeManualRateModal()">CANCEL</button>' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.confirmManualRate(\x27' + code + '\x27)">SAVE</button>' +
      '</div></div></div>';
    const wrapper = document.createElement('div');
    wrapper.id = 'manual-rate-modal';
    wrapper.className = 'modal hidden';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    this.openModal('manual-rate-modal');
    const inp = document.getElementById('manual-rate-input');
    if (inp) { inp.focus(); inp.select(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.confirmManualRate(code); } }); }
  },

  closeManualRateModal() { this.closeModal('manual-rate-modal'); },

  async confirmManualRate(code) {
    const input = document.getElementById('manual-rate-input');
    const val = parseFloat(input ? input.value : NaN);
    this.closeManualRateModal();
    if (isNaN(val) || val <= 0) { alert('Invalid rate value.'); return; }
    const base = this.baseCurrency();
    const baseRate = (base === 'EUR' ? 1 : (this.getRates()[base] || {}).rate);
    const eurPerUnit = baseRate ? val * baseRate : val;
    this.getRates()[code] = { rate: eurPerUnit, source: 'manual', updated: new Date().toISOString() };
    await this.save();
    this.renderSettings();
  },

  async moveCurrency(code, dir) {
    const arr = this.data.settings.enabledCurrencies;
    if (!Array.isArray(arr)) return;
    const i = arr.indexOf(code);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    if (arr[i] === this.baseCurrency() || arr[j] === this.baseCurrency()) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    await this.save();
    this.renderPage(this.currentPage);
    this.populateCurrencyDropdowns();
  },

  async setDefaultCurrency(code) {
    if (!code || code === this.baseCurrency()) return;
    this.data.settings.baseCurrency = code;
    this.populateCurrencyDropdowns();
    this.updateBaseCurrencyLabels();
    await this.save();
    this.renderSettings();
  },

  bindSettingsEvents(el) {
    el.querySelectorAll('[data-theme-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTheme(btn.getAttribute('data-theme-btn'));
        this.renderSettings();
      });
    });
    const highlightInput = el.querySelector('#settings-highlight-color');
    if (highlightInput) {
      highlightInput.addEventListener('input', async () => {
        this.data.settings.highlightColor = highlightInput.value;
        this.applyThemeColors();
        this.renderSettings();
        await this.save();
      });
    }
    const incomeInput = el.querySelector('#settings-income-color');
    if (incomeInput) {
      incomeInput.addEventListener('input', async () => {
        this.data.settings.incomeColor = incomeInput.value;
        this.applyThemeColors();
        this.renderSettings();
        await this.save();
      });
    }
    const expenseInput = el.querySelector('#settings-expense-color');
    if (expenseInput) {
      expenseInput.addEventListener('input', async () => {
        this.data.settings.expenseColor = expenseInput.value;
        this.applyThemeColors();
        this.renderSettings();
        await this.save();
      });
    }
    const dateSeparatorInput = el.querySelector('#settings-date-separator');
    if (dateSeparatorInput) {
      dateSeparatorInput.addEventListener('change', async () => {
        this.data.settings.dateSeparator = dateSeparatorInput.value;
        this.renderSettings();
        await this.save();
      });
    }
    const refreshAllBtn = el.querySelector('#settings-refresh-all-rates');
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener('click', () => this.refreshAllRates());
    }
    const exportBtn = el.querySelector('#settings-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'blackbook-backup-' + this.today() + '.json';
        a.click();
      });
    }
    const exportCsvBtn = el.querySelector('#settings-export-csv');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportCsv());
    const csvImportBtn = el.querySelector('#settings-import-csv-btn');
    const csvImportFile = el.querySelector('#settings-import-csv-file');
    if (csvImportBtn && csvImportFile) {
      csvImportBtn.addEventListener('click', () => csvImportFile.click());
      csvImportFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (/\.(xlsx|xls)$/i.test(file.name || '')) {
          if (typeof XLSX === 'undefined') { alert('Excel import needs the xlsx library (must be loaded from the CDN once). Convert the file to CSV instead.'); e.target.value = ''; return; }
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) || [])
                .map(r => r.map(c => String(c == null ? '' : c).replace(/\uFEFF/g, '').trim()))
                .filter(r => r.some(c => c !== ''));
              if (!rows.length) { alert('No rows found in ' + file.name + '.'); return; }
              this.openCsvImportModal(rows);
            } catch (err) { alert('Could not read ' + file.name + ': ' + err.message); }
          };
          reader.readAsArrayBuffer(file);
        } else {
          const reader = new FileReader();
          reader.onload = (ev) => this.openCsvImportModal(String(ev.target.result));
          reader.readAsText(file);
        }
        e.target.value = '';
      });
    }
    const importBtn = el.querySelector('#settings-import-btn');
    const importFile = el.querySelector('#settings-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const imported = JSON.parse(ev.target.result);
            this.data = imported;
            if (!this.data.bills) this.data.bills = [];
            if (!this.data.billPayments) this.data.billPayments = [];
            if (!this.data.savingsGoals) this.data.savingsGoals = [];
    if (!this.data.budgets) this.data.budgets = [];
    if (!this.data.installments) this.data.installments = [];
    if (!this.data.debts) this.data.debts = [];
    this.migrateCreditCards();
    if (this.applyAutopay()) await this.save();
    this.applyThemeColors();
            if (!this.data.settings) this.data.settings = {};
            await this.save();
            this.renderSettings();
            alert('Data imported successfully.');
          } catch (e) { alert('Invalid JSON file.'); }
        };
        reader.readAsText(file);
      });
    }
    const defaultAcc = el.querySelector('#settings-default-account');
    if (defaultAcc) {
      defaultAcc.addEventListener('change', async () => {
        this.data.settings.defaultAccountId = defaultAcc.value || null;
        await this.save();
      });
    }
    const defaultCat = el.querySelector('#settings-default-category');
    if (defaultCat) {
      defaultCat.addEventListener('change', async () => {
        this.data.settings.defaultCategoryId = defaultCat.value || null;
        await this.save();
      });
    }
  },

  bindSettingsModals() {
    const npForm = document.getElementById('new-profile-form');
    if (npForm && !npForm._bound) {
      npForm._bound = true;
      npForm.addEventListener('submit', (e) => this.submitNewProfile(e));
    }
    const accForm = document.getElementById('settings-account-form');
    if (accForm && !accForm._bound) {
      accForm._bound = true;
      document.getElementById('settings-account-type').addEventListener('change', () => this.updateCreditFieldsVisibility());
      accForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idVal = document.getElementById('settings-account-id').value;
        const name = document.getElementById('settings-account-name').value.trim();
        const shortName = document.getElementById('settings-account-shortname').value.trim().slice(0, 3);
        const currency = document.getElementById('settings-account-currency').value;
        const type = document.getElementById('settings-account-type').value;
        if (!name) return;
        const prevCounts = { accounts: this.data.accounts.length, cards: (this.data.creditCards || []).length, accSnap: null, cardSnap: null };
        if (idVal && !idVal.startsWith('card:')) {
          const acc = this.data.accounts.find(a => a.id === idVal);
          if (acc) prevCounts.accSnap = Object.assign({}, acc);
        }
        if (idVal.startsWith('card:')) {
          const card = this.cardById(idVal.slice(5));
          if (card) prevCounts.cardSnap = Object.assign({}, card);
        }
        const colorEl = document.getElementById('settings-account-color');
        const hexEl = document.getElementById('settings-account-color-hex');
        const isAuto = hexEl && hexEl.dataset.auto === '1';
        const colorVal = isAuto ? null : this.normalizeHex(hexEl ? hexEl.value : colorEl.value);
        if (idVal.startsWith('card:') || (!idVal && type === 'creditcard')) {
          const rateVal = parseFloat(String(document.getElementById('settings-account-rate').value).replace(',', '.'));
          const cardData = { name: name, shortName: shortName, ratePct: isNaN(rateVal) ? 5 : rateVal, dueDay: parseInt(document.getElementById('settings-account-due-day').value, 10) || 15, color: colorVal };
          if (!this.data.creditCards) this.data.creditCards = [];
          if (idVal.startsWith('card:')) {
            const card = this.cardById(idVal.slice(5));
            if (card) Object.assign(card, cardData);
          } else {
            this.data.creditCards.push(Object.assign({ id: 'card-' + Math.random().toString(36).slice(2, 10) }, cardData));
          }
        } else {
          const extra = {};
          const feeVal = parseFloat(String(document.getElementById('settings-account-fee').value).replace(',', '.'));
          extra.foreignFee = isNaN(feeVal) ? 0 : feeVal;
          extra.color = colorVal;
          if (type === 'creditcard') {
            const rateVal = parseFloat(String(document.getElementById('settings-account-rate').value).replace(',', '.'));
            extra.ratePct = isNaN(rateVal) ? 5 : rateVal;
            extra.dueDay = parseInt(document.getElementById('settings-account-due-day').value, 10) || null;
          }
          if (idVal) {
            const acc = this.data.accounts.find(a => a.id === idVal);
            if (acc) Object.assign(acc, { name: name, shortName: shortName, currency: currency, type: type, foreignFee: extra.foreignFee, color: extra.color, description: document.getElementById('settings-account-description').value.trim() || undefined });
          } else {
            this.data.accounts.push(Object.assign({ id: crypto.randomUUID(), name: name, shortName: shortName, currency: currency, type: type, color: extra.color, description: document.getElementById('settings-account-description').value.trim() || undefined }, extra));
          }
        }
        try {
          await this.save();
          this.migrateCreditCards();
          await this.save();
        } catch (e) {
          if (prevCounts.accSnap) {
            const acc = this.data.accounts.find(a => a.id === idVal);
            if (acc) Object.assign(acc, prevCounts.accSnap);
          } else if (prevCounts.cardSnap) {
            const card = this.cardById(idVal.slice(5));
            if (card) Object.assign(card, prevCounts.cardSnap);
          } else {
            while (this.data.accounts.length > prevCounts.accounts) this.data.accounts.pop();
            while ((this.data.creditCards || []).length > prevCounts.cards) this.data.creditCards.pop();
          }
          alert('Could not save \u2014 the Black Book server appears to be down. The changes were rolled back; please try again.');
          return;
        }
        this.closeModal('settings-account-modal');
        this.renderSettings();
        if (this.currentPage !== 'settings') this.renderPage(this.currentPage);
      });
    }
    const catForm = document.getElementById('settings-category-form');
    if (catForm && !catForm._bound) {
      catForm._bound = true;
      catForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('settings-category-id').value;
        const name = document.getElementById('settings-category-name').value.trim();
        if (!name) return;
        const colorEl = document.getElementById('settings-category-color');
        const hexEl = document.getElementById('settings-category-color-hex');
        const isAuto = hexEl && hexEl.dataset.auto === '1';
        const color = isAuto ? null : this.normalizeHex(hexEl ? hexEl.value : colorEl.value);
        if (id) {
          const cat = this.data.categories.find(c => c.id === id);
          if (cat) { cat.name = name; cat.color = color; }
        } else {
          this.data.categories.push({ id: crypto.randomUUID(), name: name, color: color });
        }
        await this.save();
        this.closeModal('settings-category-modal');
        this.renderSettings();
      });
    }
  },

  updateCreditFieldsVisibility() {
    const typeSel = document.getElementById('settings-account-type');
    if (!typeSel) return;
    document.getElementById('credit-fields').classList.toggle('hidden', typeSel.value !== 'creditcard');
  },

  openNewAccount() {
    document.getElementById('settings-account-id').value = '';
    document.getElementById('settings-account-name').value = '';
    document.getElementById('settings-account-description').value = '';
    document.getElementById('settings-account-shortname').value = '';
    const accColor = this.nextCategoryColor();
    const colorEl = document.getElementById('settings-account-color');
    colorEl.value = accColor;
    colorEl.disabled = false;
    const hexEl = document.getElementById('settings-account-color-hex');
    if (hexEl) { hexEl.value = accColor; hexEl.dataset.auto = '1'; }
    const resetBtn = document.getElementById('settings-account-color-reset');
    if (resetBtn) { resetBtn.dataset.name = ''; resetBtn.dataset.kind = 'account'; }
    this.bindColorPicker('settings-account-color', 'settings-account-color-hex', 'settings-account-color-reset');
    document.getElementById('settings-account-currency').value = this.baseCurrency();
    const firstAcc = this.visibleAccounts()[0];
    if (firstAcc && firstAcc.currency) document.getElementById('settings-account-currency').value = firstAcc.currency;
    document.getElementById('settings-account-fee').value = '0';
    document.getElementById('settings-account-type').value = 'cash';
    document.getElementById('settings-account-rate').value = '5';
    document.getElementById('settings-account-due-day').value = '15';
    this.updateCreditFieldsVisibility();
    document.getElementById('settings-account-modal-title').textContent = 'New Account / Card';
    this.openModal('settings-account-modal');
  },

  openEditAccount(id) {
    if (String(id).startsWith('card:')) return this.openEditAccountCard(String(id).slice(5));
    const acc = this.data.accounts.find(a => a.id === id);
    if (!acc) return;
    document.getElementById('settings-account-id').value = acc.id;
    document.getElementById('settings-account-name').value = acc.name;
    document.getElementById('settings-account-description').value = acc.description || '';
    document.getElementById('settings-account-shortname').value = acc.shortName || '';
    const colorEl = document.getElementById('settings-account-color');
    colorEl.value = this.accountColor(acc);
    colorEl.disabled = false;
    const hexEl = document.getElementById('settings-account-color-hex');
    if (hexEl) { hexEl.value = this.accountColor(acc); hexEl.dataset.auto = acc.color ? '0' : '1'; }
    const resetBtn = document.getElementById('settings-account-color-reset');
    if (resetBtn) { resetBtn.dataset.name = (acc.name || acc.shortName || acc.id || ''); resetBtn.dataset.kind = 'account'; }
    this.bindColorPicker('settings-account-color', 'settings-account-color-hex', 'settings-account-color-reset');
    document.getElementById('settings-account-currency').value = acc.currency;
    document.getElementById('settings-account-fee').value = acc.foreignFee != null ? acc.foreignFee : 0;
    document.getElementById('settings-account-type').value = (acc.type === 'credit' ? 'creditcard' : (acc.type || 'cash'));
    document.getElementById('settings-account-rate').value = acc.ratePct != null ? acc.ratePct : 5;
    document.getElementById('settings-account-due-day').value = acc.dueDay || 15;
    this.updateCreditFieldsVisibility();
    document.getElementById('settings-account-modal-title').textContent = 'Edit Account';
    this.openModal('settings-account-modal');
  },

  openEditAccountCard(cardId) {
    const card = this.cardById(cardId);
    if (!card) return;
    document.getElementById('settings-account-id').value = 'card:' + cardId;
    document.getElementById('settings-account-name').value = card.name;
    document.getElementById('settings-account-description').value = '';
    document.getElementById('settings-account-shortname').value = card.shortName || '';
    const colorEl = document.getElementById('settings-account-color');
    colorEl.value = this.cardColor(card);
    colorEl.disabled = false;
    const hexEl = document.getElementById('settings-account-color-hex');
    if (hexEl) { hexEl.value = this.cardColor(card); hexEl.dataset.auto = card.color ? '0' : '1'; }
    const resetBtn = document.getElementById('settings-account-color-reset');
    if (resetBtn) { resetBtn.dataset.name = (card.name || card.id || ''); resetBtn.dataset.kind = 'card'; }
    this.bindColorPicker('settings-account-color', 'settings-account-color-hex', 'settings-account-color-reset');
    document.getElementById('settings-account-currency').value = this.baseCurrency();
    document.getElementById('settings-account-type').value = 'creditcard';
    document.getElementById('settings-account-rate').value = card.ratePct != null ? card.ratePct : 5;
    document.getElementById('settings-account-due-day').value = card.dueDay || 15;
    this.updateCreditFieldsVisibility();
    document.getElementById('settings-account-modal-title').textContent = 'Edit Credit Card';
    this.openModal('settings-account-modal');
  },

  async moveAccount(id, dir) {
    const arr = this.data.accounts;
    const i = arr.findIndex(a => a.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    await this.save();
    this.renderPage(this.currentPage);
    if (this.syncAccountsPanel) this.syncAccountsPanel();
  },

  async deleteAccount(id) {
    const acc = this.data.accounts.find(a => a.id === id);
    if (!acc) return;
    if (this.data.accounts.length <= 1) {
      await this.confirmModal({ title: 'Cannot Delete', message: 'You need at least one account.', danger: false });
      return;
    }
    const txCount = this.data.transactions.filter(t => {
      if (t.type === 'transfer') return t.fromAccountId === id || t.toAccountId === id;
      return t.accountId === id;
    }).length;
    let purgeTxs = false;
    if (txCount > 0) {
      if (!(await this.confirmModal({ title: 'Delete Account & Transactions', message: '"' + acc.name + '" has ' + txCount + ' transaction' + (txCount === 1 ? '' : 's') + '.\n\nConfirm = delete the account AND its transactions.\nCancel = do nothing.', confirmText: 'Delete' }))) return;
      purgeTxs = true;
    } else {
      if (!(await this.confirmModal({ title: 'Delete Account', message: 'Delete account "' + acc.name + '"?' , confirmText: 'Delete' }))) return;
    }
    this.data.accounts = this.data.accounts.filter(a => a.id !== id);
    if (purgeTxs) {
      this.data.transactions = this.data.transactions.filter(t => {
        if (t.type === 'transfer') return t.fromAccountId !== id && t.toAccountId !== id;
        return t.accountId !== id;
      });
    }
    if (this.selectedAccount === id) this.selectedAccount = null;
    if (this.data.settings.defaultAccountId === id) this.data.settings.defaultAccountId = null;
    this.data.installments = (this.data.installments || []).filter(i => i.accountId !== id);
    await this.save();
    this.renderPage(this.currentPage);
  },
  settingsHtml() {
    const defaultAccountId = this.data.settings.defaultAccountId || '';
    const defaultCategoryId = this.data.settings.defaultCategoryId || '';

    let accountsList = '';
    const visibleAccts = this.visibleAccounts();
    for (const a of visibleAccts) {
      const typeLabel = (a.type || 'cash').toUpperCase();
      const arrIdx = this.data.accounts.findIndex(x => x.id === a.id);
      const canUp = arrIdx > 0;
      const canDown = arrIdx < this.data.accounts.length - 1;
      accountsList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + this.accountColor(a) + ';"></span>' +
        '<div class="settings-row-name-wrap"><span class="settings-row-name">' + this.escapeHtml(a.name) + '</span>' + (a.description ? '<span class="settings-row-desc">' + this.escapeHtml(a.description) + '</span>' : '') + '</div>' +
        '<span class="settings-row-meta">' + a.currency + ' &middot; ' + typeLabel + '</span>' +
        '<span class="settings-row-order">' +
        '<button type="button" class="btn btn-sm btn-secondary" ' + (canUp ? 'onclick="BlackBook.moveAccount(\x27' + a.id + '\x27,-1)"' : 'disabled') + ' title="Move up">&#9650;</button>' +
        '<button type="button" class="btn btn-sm btn-secondary" ' + (canDown ? 'onclick="BlackBook.moveAccount(\x27' + a.id + '\x27,1)"' : 'disabled') + ' title="Move down">&#9660;</button>' +
        '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27' + a.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger btn-icon" title="Delete account" onclick="BlackBook.deleteAccount(\x27' + a.id + '\x27)">' + this.xIcon() + '</button></div>';
    }
    for (const c of (this.data.creditCards || [])) {
      accountsList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + this.cardColor(c) + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(c.name) + '</span>' +
        '<span class="settings-row-meta">CREDIT CARD &middot; INT ' + (c.ratePct != null ? c.ratePct : 5) + '%</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27card:' + c.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger btn-icon" title="Delete card" onclick="BlackBook.deleteCard(\x27' + c.id + '\x27)">' + this.xIcon() + '</button></div>';
    }
    if (!visibleAccts.length && !(this.data.creditCards || []).length) accountsList = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No accounts yet.</div>';

    let categoriesList = '';
    const sortedCats = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sortedCats) {
      const txCount = this.data.transactions.filter(t => t.categoryId === c.id).length;
      const isProtected = c.name.toLowerCase() === 'transfer' || c.name.toLowerCase() === 'uncategorized' || c.name.toLowerCase() === 'invoice' || c.name.toLowerCase() === 'debt';
      categoriesList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + this.categoryColor(c) + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(c.name) + '</span>' +
        '<span class="settings-row-meta">' + txCount + ' transaction' + (txCount === 1 ? '' : 's') + '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditCategory(\x27' + c.id + '\x27)">EDIT</button>' +
        (isProtected ? '<button class="btn btn-sm btn-danger btn-icon" onclick="BlackBook.deleteCategory(\x27' + c.id + '\x27)" disabled style="opacity:0.5;cursor:not-allowed;" title="Protected category">' + this.xIcon() + '</button>' : '<button class="btn btn-sm btn-danger btn-icon" title="Delete category" onclick="BlackBook.deleteCategory(\x27' + c.id + '\x27)">' + this.xIcon() + '</button>') + '</div>';
    }
    if (!this.data.categories.length) categoriesList = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No categories yet.</div>';

    const defaultAccountOpts = '<option value="">None</option>' + this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === defaultAccountId ? ' selected' : '') + '>' + this.escapeHtml(a.name) + '</option>').join('');
    const defaultCategoryOpts = '<option value="">None</option>' + this.sortedCategories().map(c => '<option value="' + c.id + '"' + (c.id === defaultCategoryId ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');

    let pagesList = '';
    const PAGE_LABELS = { forecast: 'Forecast', bills: 'Bills', budget: 'Budget', cards: 'Credit Cards', savings: 'Savings', debts: 'Debts', invoices: 'Invoices' };
    for (const p of Object.keys(PAGE_LABELS)) {
      const on = this.isPageEnabled(p);
      pagesList += '<div class="settings-row">' +
        '<span class="row-swatch" style="visibility:hidden;"></span>' +
        '<span class="settings-row-name">' + PAGE_LABELS[p] + '</span>' +
        '<button class="btn btn-sm ' + (on ? 'btn-paid' : 'btn-muted') + '" style="width:56px;margin-left:auto;" onclick="BlackBook.togglePageEnabled(\'' + p + '\')" title="Show/hide this page for the current profile">' + (on ? 'ON' : 'OFF') + '</button></div>';
    }

    return '<div class="settings-cols">' +
      '<div>' +
      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">APPEARANCE</span></div>' +
      '<div class="form-group" style="margin-bottom:10px;"><label>Theme</label><div style="display:flex;gap:6px;">' +
      '<button class="btn btn-sm ' + (this.currentTheme() === 'dark' ? 'btn-primary' : 'btn-secondary') + '" data-theme-btn="dark">DARK</button>' +
      '<button class="btn btn-sm ' + (this.currentTheme() === 'light' ? 'btn-primary' : 'btn-secondary') + '" data-theme-btn="light">LIGHT</button>' +
      '</div></div>' +
      '<div class="form-row-2col">' +
      '<div class="form-group"><label>Highlight Color</label><div style="display:flex;align-items:center;gap:8px;"><input type="color" id="settings-highlight-color" value="' + (this.data.settings.highlightColor || '#fa8c3c') + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;"><span style="font-size:13px;color:var(--text-dim);">' + (this.data.settings.highlightColor || '#fa8c3c') + '</span></div></div>' +
      '<div class="form-group"><label>Income Color</label><div style="display:flex;align-items:center;gap:8px;"><input type="color" id="settings-income-color" value="' + (this.data.settings.incomeColor || '#4ade80') + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;"><span style="font-size:13px;color:var(--text-dim);">' + (this.data.settings.incomeColor || '#4ade80') + '</span></div></div>' +
      '<div class="form-group"><label>Expense Color</label><div style="display:flex;align-items:center;gap:8px;"><input type="color" id="settings-expense-color" value="' + (this.data.settings.expenseColor || '#f87171') + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;"><span style="font-size:13px;color:var(--text-dim);">' + (this.data.settings.expenseColor || '#f87171') + '</span></div></div>' +
      '<div class="form-group"><label>Date Separator</label><select id="settings-date-separator" class="input">' +
      '<option value="/"' + ((this.data.settings.dateSeparator || '/') === '/' ? ' selected' : '') + '>/ (' + this.fmtDateInput(this.today()).replace(/\//g, '/') + ')</option>' +
      '<option value="-"' + ((this.data.settings.dateSeparator || '/') === '-' ? ' selected' : '') + '>- (' + this.fmtDateInput(this.today()).replace(/\//g, '-') + ')</option>' +
      '<option value="."' + ((this.data.settings.dateSeparator || '/') === '.' ? ' selected' : '') + '>. (' + this.fmtDateInput(this.today()).replace(/\//g, '.') + ')</option>' +
      '<option value=","' + ((this.data.settings.dateSeparator || '/') === ',' ? ' selected' : '') + '>, (' + this.fmtDateInput(this.today()).replace(/\//g, ',') + ')</option>' +
      '<option value="|"' + ((this.data.settings.dateSeparator || '/') === '|' ? ' selected' : '') + '>| (' + this.fmtDateInput(this.today()).replace(/\//g, '|') + ')</option>' +
      '</select></div>' +
      '</div><div class="form-group"><label>Attention Bar</label><button class="btn btn-sm ' + (this.data.settings.attentionBarHidden ? 'btn-secondary' : 'btn-primary') + '" onclick="BlackBook.' + (this.data.settings.attentionBarHidden ? 'showAttentionBar()' : 'hideAttentionBar()') + '">' + (this.data.settings.attentionBarHidden ? 'SHOW' : 'HIDE') + '</button></div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">DEFAULTS</span></div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
      '<div class="form-group"><label>Default Account</label><select id="settings-default-account" class="input">' + defaultAccountOpts + '</select></div>' +
      '<div class="form-group"><label>Default Category</label><select id="settings-default-category" class="input">' + defaultCategoryOpts + '</select></div>' +
      '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">PAGES &middot; PROFILE ' + this.escapeHtml((this.profile || 'default').toUpperCase()) + '</span></div>' +
      '<div class="settings-list">' + pagesList + '</div></div>' +
      '</div>' +

      '<div>' +
      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">EXCHANGE RATES</span>' +
      '<span style="display:inline-flex;gap:6px;align-items:center;">' +
      '<button class="btn btn-sm btn-secondary btn-icon" id="settings-refresh-all-rates" title="Refresh all rates">' + this.refreshIcon() + '</button>' +
      '<button class="btn btn-sm btn-primary" onclick="BlackBook.openAddCurrencyModal()">+ ADD CURRENCY</button>' +
      '</span></div>' +
      '<div class="settings-rate-card">' + this.ratesTableHtml() + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">PROFILES</span><button class="btn btn-sm btn-primary" onclick="BlackBook.createProfile()">+ NEW PROFILE</button></div>' +
      '<div class="settings-list" id="profiles-list">' + this.profilesListHtml() + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">IMPORT RULES</span><button class="btn btn-sm btn-primary" onclick="BlackBook.openImportRule()">+ RULE</button></div>' +
      '<div class="settings-list">' + ((this.data.importRules || []).map(rule => { const cat = this.data.categories.find(c => c.id === rule.categoryId); return '<div class="settings-row"><span class="settings-row-name">IF DESCRIPTION HAS “' + this.escapeHtml(rule.match) + '”</span><span class="settings-row-meta">→ ' + this.escapeHtml(cat ? cat.name : 'missing category') + '</span><button class="btn btn-sm btn-danger btn-icon" onclick="BlackBook.deleteImportRule(\'' + rule.id + '\')">' + this.xIcon() + '</button></div>'; }).join('') || '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No rules yet. Rules apply while rows are staged for import.</div>') + '</div></div>' +
      '</div>' +
    '</div>' +

    '<div class="settings-cols">' +
      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">ACCOUNTS</span><button class="btn btn-sm btn-primary" onclick="BlackBook.openNewAccount()">+ ADD</button></div>' +
      '<div class="settings-list">' + accountsList + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">CATEGORIES</span><button class="btn btn-sm btn-primary" onclick="BlackBook.openNewCategory()">+ ADD</button></div>' +
      '<div class="settings-list">' + categoriesList + '</div></div>' +
    '</div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">DATA</span></div>' +
      '<div class="settings-data-actions"><button class="btn btn-secondary" id="settings-export">EXPORT JSON</button>' +
      '<button class="btn btn-secondary" id="settings-export-csv">EXPORT CSV</button>' +
      '<button class="btn btn-secondary" id="settings-import-btn">IMPORT JSON</button>' +
      '<input type="file" id="settings-import-file" accept=".json" style="display:none;">' +
      '<button class="btn btn-secondary" id="settings-import-csv-btn">IMPORT CSV/XLSX</button>' +
      '<input type="file" id="settings-import-csv-file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none;">' +
      '</div></div>' +

      '<div class="settings-footer">BLACK BOOK v0.8.2 &middot; Created by Nikola Ne&scaron;i&#263;</div>';
  },

  async refreshRate(code) {
    try {
      const resp = await fetch('/api/exchange-rate?cur=' + code);
      const result = await resp.json();
      if (result.rates && result.rates[code]) {
        this.getRates()[code] = result.rates[code];
        await this.save();
      } else {
        alert('No rate available for ' + code + '.');
      }
    } catch (e) { alert('Failed to refresh rate for ' + code + '.'); }
    this.renderSettings();
  },

  async refreshAllRates() {
    try {
      const resp = await fetch('/api/exchange-rate');
      const result = await resp.json();
      if (result.rates) {
        Object.assign(this.getRates(), result.rates);
        await this.save();
      }
    } catch (e) { alert('Failed to refresh rates.'); }
    this.renderSettings();
  },

  openAddCurrencyModal() {
    const enabled = new Set(this.currencyList());
    const allCodes = this.allCurrencyCodes();
    const available = allCodes.filter(c => !enabled.has(c));
    if (!available.length) { alert('All common currencies are already enabled.'); return; }
    const list = available.map(c => '<button class="btn btn-sm btn-secondary" style="margin:2px;cursor:pointer;" onclick="BlackBook.addCurrency(\x27' + c + '\x27)">' + c + '</button>').join(' ');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.id = 'add-currency-overlay';
    overlay.innerHTML = '<div style="background:var(--bg,#111);border:1px solid var(--border,#333);border-radius:8px;width:520px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;">' +
      '<div class="modal-header"><span style="font-weight:bold;">SELECT CURRENCY TO ADD</span><button class="modal-close" onclick="BlackBook.closeAddCurrencyModal()">&times;</button></div>' +
      '<div style="padding:14px 20px;overflow-y:auto;">' + list +
      '<div style="margin-top:12px;"><button class="btn btn-sm btn-secondary" onclick="BlackBook.closeAddCurrencyModal()">CLOSE</button></div></div></div>';
    document.body.appendChild(overlay);
  },

  closeAddCurrencyModal() {
    const el = document.getElementById('add-currency-overlay');
    if (el) el.remove();
  },

  async addCurrency(code) {
    if (!code) return;
    let enabled = this.data.settings.enabledCurrencies;
    if (!Array.isArray(enabled) || enabled.length === 0) {
      enabled = this.currencyList();
    }
    if (!enabled.includes(code)) {
      enabled = enabled.slice();
      enabled.push(code);
      this.data.settings.enabledCurrencies = enabled;
    }
    this.populateCurrencyDropdowns();
    await this.save();
    try {
      const resp = await fetch('/api/exchange-rate?cur=' + code);
      const result = await resp.json();
      if (result.rates && result.rates[code]) {
        this.getRates()[code] = result.rates[code];
        await this.save();
      }
    } catch (e) {}
    this.closeAddCurrencyModal();
    this.renderSettings();
  },

  async removeCurrency(code) {
    if (!code || code === (this.data.settings.baseCurrency || 'RSD')) return;
    if (!(await this.confirmModal({ title: 'Remove Currency', message: 'Remove ' + code + ' from enabled currencies?\n\nHistorical data is preserved.', confirmText: 'Remove' }))) return;
    this.data.settings.enabledCurrencies = (this.data.settings.enabledCurrencies || []).filter(c => c !== code);
    this.populateCurrencyDropdowns();
    await this.save();
    this.renderSettings();
  },

  openNewCategory() {
    document.getElementById('settings-category-id').value = '';
    document.getElementById('settings-category-name').value = '';
    const colorEl = document.getElementById('settings-category-color');
    colorEl.value = this.nextCategoryColor();
    colorEl.disabled = false;
    const hexEl = document.getElementById('settings-category-color-hex');
    if (hexEl) { hexEl.value = colorEl.value; hexEl.dataset.auto = '1'; }
    const resetBtn = document.getElementById('settings-category-color-reset');
    if (resetBtn) resetBtn.dataset.name = '';
    this.bindColorPicker('settings-category-color', 'settings-category-color-hex', 'settings-category-color-reset');
    document.getElementById('settings-category-modal-title').textContent = 'New Category';
    this.openModal('settings-category-modal');
  },

  openEditCategory(id) {
    const cat = this.data.categories.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('settings-category-id').value = cat.id;
    document.getElementById('settings-category-name').value = cat.name;
    const colorEl = document.getElementById('settings-category-color');
    colorEl.value = this.categoryColor(cat);
    colorEl.disabled = false;
    const hexEl = document.getElementById('settings-category-color-hex');
    if (hexEl) { hexEl.value = this.categoryColor(cat); hexEl.dataset.auto = cat.color ? '0' : '1'; }
    const resetBtn = document.getElementById('settings-category-color-reset');
    if (resetBtn) resetBtn.dataset.name = cat.name || cat.id || '';
    this.bindColorPicker('settings-category-color', 'settings-category-color-hex', 'settings-category-color-reset');
    document.getElementById('settings-category-modal-title').textContent = 'Edit Category';
    this.openModal('settings-category-modal');
  },

  async deleteCategory(id) {
    const cat = this.data.categories.find(c => c.id === id);
    if (!cat) return;
    const isProtected = cat.name.toLowerCase() === 'transfer' || cat.name.toLowerCase() === 'uncategorized' || cat.name.toLowerCase() === 'invoice' || cat.name.toLowerCase() === 'debt';
    if (isProtected) {
      await this.confirmModal({ title: 'Protected Category', message: '"' + cat.name + '" is a system category and cannot be deleted.', danger: false });
      return;
    }
    const txCount = this.data.transactions.filter(t => t.categoryId === id).length;
    let purgeTxs = false;
    if (txCount > 0) {
      if (!(await this.confirmModal({ title: 'Delete Category & Transactions', message: '"' + cat.name + '" is used by ' + txCount + ' transaction' + (txCount === 1 ? '' : 's') + '.\n\nConfirm = delete the category AND its transactions.\nCancel = do nothing.', confirmText: 'Delete' }))) return;
      purgeTxs = true;
    } else {
      if (!(await this.confirmModal({ title: 'Delete Category', message: 'Delete category "' + cat.name + '"?' , confirmText: 'Delete' }))) return;
    }
    this.data.categories = this.data.categories.filter(c => c.id !== id);
    if (purgeTxs) this.data.transactions = this.data.transactions.filter(t => t.categoryId !== id);
    if (this.selectedCategory === id) this.selectedCategory = null;
    if (this.data.settings.defaultCategoryId === id) this.data.settings.defaultCategoryId = null;
    this.data.budgets = (this.data.budgets || []).filter(b => b.categoryId !== id);
    await this.save();
    this.renderPage(this.currentPage);
  },

  // ==================== TRANSACTIONS ====================

});
})();
