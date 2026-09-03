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
    let html = '<div class="settings-row"><span class="settings-row-name">DEFAULT' + (!this.profile ? ' &#10003;' : '') + '</span><span class="settings-row-meta">' + (this.profile ? 'switch to default data set' : 'active') + '</span>' +
      (!this.profile ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.renameProfile(\'\')">RENAME</button>' : '<button class="btn btn-sm btn-secondary" onclick="BlackBook.switchProfile(\'\')">OPEN</button>') + '</div>';
    if (!profiles.length) html += '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No extra profiles yet.</div>';
    for (const p of profiles) {
      const active = p.name === this.profile;
      html += '<div class="settings-row">' +
        '<span class="settings-row-name">' + this.escapeHtml(p.name).toUpperCase() + (active ? ' &#10003;' : '') + '</span>' +
        '<span class="settings-row-meta">' + (active ? 'active profile' : '') + '</span>' +
        (!active ? '<button class="btn btn-sm btn-secondary" onclick="BlackBook.switchProfile(\x27' + this.escapeHtml(p.name) + '\x27)">OPEN</button>' : '') +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.renameProfile(\x27' + this.escapeHtml(p.name) + '\x27)">RENAME</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteProfile(\x27' + this.escapeHtml(p.name) + '\x27)">DEL</button></div>';
    }
    el.innerHTML = html;
  },

  switchProfile(name) {
    localStorage.setItem('mb_profile', name || '');
    location.reload();
  },
  async createProfile() {
    const name = prompt('New profile name:');
    if (!name || !name.trim()) return;
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', name: name.trim() }) });
    const out = await res.json();
    if (!res.ok) { alert(out.error || 'Failed'); return; }
    await this.save();
    this.switchProfile(name.trim());
  },
  async renameProfile(name) {
    const newName = prompt(name ? 'Rename profile:' : 'Name the default profile (becomes a named profile):', name || 'default');
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
    const catByName = (cell) => {
      if (!cell) return null;
      const s = cell.toLowerCase();
      if (catMap[s]) return catMap[s];
      for (const [name, id] of Object.entries(catMap)) {
        if (name.length > 3 && (s.includes(name) || name.includes(s))) return id;
      }
      const cat = { id: crypto.randomUUID(), name: cell.trim(), color: this.nextCategoryColor() };
      this.data.categories.push(cat);
      catMap[s] = cat.id;
      return cat.id;
    };
    let imported = 0, skipped = 0;
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
      const currency = ['RSD', 'EUR', 'USD', 'XAU'].includes(currencyRaw) ? currencyRaw : 'RSD';
      this.data.transactions.push({
        id: crypto.randomUUID(), date: date, type: type,
        amount: Math.round((type === 'income' ? Math.abs(amt) : -Math.abs(amt)) * 100) / 100,
        currency: currency, accountId: accountId, cardId: null,
        categoryId: catByName(g(r, catCol)), note: g(r, descCol)
      });
      imported++;
    }
    await this.save();
    this.closeModal('csv-import-modal');
    this.renderPage(this.currentPage);
    alert('Imported ' + imported + ' transaction' + (imported === 1 ? '' : 's') + (skipped ? ' \u00b7 skipped ' + skipped + ' unparseable row' + (skipped === 1 ? '' : 's') : '') + '.');
  },

  exportCsv() {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['date', 'type', 'amount', 'currency', 'account', 'card', 'category', 'note']];
    for (const t of this.data.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const acc = this.data.accounts.find(a => a.id === t.accountId);
      const card = t.cardId ? this.cardById(t.cardId) : null;
      const cat = this.data.categories.find(c => c.id === t.categoryId);
      rows.push([t.date, t.type, t.amount, t.currency || 'RSD', acc ? acc.name : '', card ? card.name : '', cat ? cat.name : '', t.note || '']);
    }
    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'blackbook-transactions-' + this.today() + '.csv';
    a.click();
  },

  ratesTableHtml() {
    const rates = this.getRates();
    let rows = '<div class="rate-grid-row rate-grid-head"><span>CUR</span><span>RATE</span><span>SOURCE</span><span>UPDATED</span><span>MANUAL OVERRIDE</span><span></span><span></span></div>';
    for (const code of ['EUR', 'USD', 'XAU']) {
      const r = rates[code] || { rate: null, source: null, updated: null };
      const rateVal = r.rate != null ? r.rate.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' <span class="rate-unit">RSD</span>' : '--';
      const updated = r.updated ? new Date(r.updated).toLocaleString() : '--';
      rows += '<div class="rate-grid-row">' +
        '<span class="rate-code">' + code + '</span>' +
        '<span class="rate-val">' + rateVal + '</span>' +
        '<span class="rate-src">' + this.escapeHtml(r.source || '--') + '</span>' +
        '<span class="rate-upd">' + updated + '</span>' +
        '<input type="number" step="0.0001" class="input rate-manual-input" id="rate-manual-' + code + '" placeholder="set manually" value="' + (r.rate != null ? r.rate : '') + '">' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.saveManualRate(\x27' + code + '\x27)">SET</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.refreshRate(\x27' + code + '\x27)">REFRESH</button>' +
        '</div>';
    }
    return rows;
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
        await this.save();
        this.migrateCreditCards();
        await this.save();
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
    document.getElementById('settings-account-currency').value = 'RSD';
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
    document.getElementById('settings-account-currency').value = 'RSD';
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
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteAccount(\x27' + a.id + '\x27)">DEL</button></div>';
    }
    for (const c of (this.data.creditCards || [])) {
      accountsList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + this.cardColor(c) + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(c.name) + '</span>' +
        '<span class="settings-row-meta">CREDIT CARD &middot; INT ' + (c.ratePct != null ? c.ratePct : 5) + '%</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditAccount(\x27card:' + c.id + '\x27)">EDIT</button>' +
        '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCard(\x27' + c.id + '\x27)">DEL</button></div>';
    }
    if (!visibleAccts.length && !(this.data.creditCards || []).length) accountsList = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No accounts yet.</div>';

    let categoriesList = '';
    const sortedCats = this.data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const c of sortedCats) {
      const txCount = this.data.transactions.filter(t => t.categoryId === c.id).length;
      const isProtected = c.name.toLowerCase() === 'transfer' || c.name.toLowerCase() === 'uncategorized' || c.name.toLowerCase() === 'invoice';
      categoriesList += '<div class="settings-row">' +
        '<span class="row-swatch" style="background:' + this.categoryColor(c) + ';"></span>' +
        '<span class="settings-row-name">' + this.escapeHtml(c.name) + '</span>' +
        '<span class="settings-row-meta">' + txCount + ' transaction' + (txCount === 1 ? '' : 's') + '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openEditCategory(\x27' + c.id + '\x27)">EDIT</button>' +
        (isProtected ? '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCategory(\x27' + c.id + '\x27)" disabled style="opacity:0.5;cursor:not-allowed;" title="Protected category">DEL</button>' : '<button class="btn btn-sm btn-danger" onclick="BlackBook.deleteCategory(\x27' + c.id + '\x27)">DEL</button>') + '</div>';
    }
    if (!this.data.categories.length) categoriesList = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No categories yet.</div>';

    const defaultAccountOpts = '<option value="">None</option>' + this.visibleAccounts().map(a => '<option value="' + a.id + '"' + (a.id === defaultAccountId ? ' selected' : '') + '>' + this.escapeHtml(a.name) + '</option>').join('');
    const defaultCategoryOpts = '<option value="">None</option>' + this.sortedCategories().map(c => '<option value="' + c.id + '"' + (c.id === defaultCategoryId ? ' selected' : '') + '>' + this.escapeHtml(c.name) + '</option>').join('');

    let pagesList = '';
    const PAGE_LABELS = { bills: 'Bills', budget: 'Budget', cards: 'Credit Cards', savings: 'Savings', debts: 'Debts', invoices: 'Invoices' };
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
      '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">DEFAULTS</span></div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
      '<div class="form-group"><label>Default Account</label><select id="settings-default-account" class="input">' + defaultAccountOpts + '</select></div>' +
      '<div class="form-group"><label>Default Category</label><select id="settings-default-category" class="input">' + defaultCategoryOpts + '</select></div></div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">PAGES &middot; PROFILE ' + this.escapeHtml((this.profile || 'default').toUpperCase()) + '</span></div>' +
      '<div class="settings-list">' + pagesList + '</div></div>' +
      '</div>' +

      '<div>' +
      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">EXCHANGE RATES &middot; 1 UNIT IN RSD</span><button class="btn btn-sm btn-secondary" id="settings-refresh-all-rates">REFRESH ALL</button></div>' +
      '<div class="settings-rate-card">' + this.ratesTableHtml() + '</div></div>' +

      '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">PROFILES</span><button class="btn btn-sm btn-primary" onclick="BlackBook.createProfile()">+ NEW PROFILE</button></div>' +
      '<div class="settings-list" id="profiles-list">' + this.profilesListHtml() + '</div></div>' +
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

      '<div class="settings-footer">BLACK BOOK v0.7.3 &middot; Created by Nikola Ne&scaron;i&#263;</div>';
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

  async saveManualRate(code) {
    const input = document.getElementById('rate-manual-' + code);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val <= 0) { alert('Invalid rate value.'); return; }
    this.getRates()[code] = { rate: val, source: 'manual', updated: new Date().toISOString() };
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
    const isProtected = cat.name.toLowerCase() === 'transfer' || cat.name.toLowerCase() === 'uncategorized' || cat.name.toLowerCase() === 'invoice';
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
