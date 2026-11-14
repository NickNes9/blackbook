/* Read-only reports for the active profile. */
(function () {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const VIEWS = [['categories', 'Categories'], ['compare', 'Compare'], ['people', 'People'], ['items', 'Items'], ['moneyflow', 'Money Flow'], ['calendar', 'Calendar'], ['forecast', 'Forecast']];
  const sum = rows => Math.round(rows.reduce((value, row) => value + row.amount, 0) * 100) / 100;
  const totals = rows => ({ income: sum(rows.filter(row => row.amount > 0)), expenses: -sum(rows.filter(row => row.amount < 0)), net: sum(rows), count: new Set(rows.map(row => row.transactionId || row.id)).size });
  const key = (year, month) => year + '-' + String(month + 1).padStart(2, '0');
  const nameOf = (items, id, fallback) => {
    const name = (items.find(item => item.id === id) || {}).name || fallback || '';
    return String(name).trim().toLocaleLowerCase() === 'uncategorized' ? 'None' : name;
  };

  function reportItemTags(value) {
    const tags = new Map();
    const pattern = /(?:^|\s)\$\s*([\p{L}][^$\u2063]*?)(?=\u2063|\s+\$|\s+@[\p{L}]|$)/giu;
    for (const match of String(value || '').matchAll(pattern)) {
      const name = String(match[1] || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      if (!tags.has(key)) tags.set(key, { name, key });
    }
    return [...tags.values()];
  }

  function cleanReportItemDescription(value) {
    return String(value || '').replace(/(?:^|\s)\$\s*[\p{L}][^$\u2063]*?(?:\u2063|(?=\s+\$|\s+@[\p{L}]|$))/giu, ' ')
      .replace(/\u2063/g, '').replace(/\s+/g, ' ').trim();
  }

  function samplePriceHistory(rows, limit = 1200) {
    if (rows.length <= limit) return rows;
    const bucketCount = Math.max(1, Math.floor(limit / 2));
    const indices = new Set([0, rows.length - 1]);
    for (let bucket = 0; bucket < bucketCount; bucket++) {
      const start = Math.floor(bucket * rows.length / bucketCount);
      const end = Math.max(start + 1, Math.floor((bucket + 1) * rows.length / bucketCount));
      let minIndex = start, maxIndex = start;
      for (let index = start + 1; index < Math.min(end, rows.length); index++) {
        if (rows[index].amount < rows[minIndex].amount) minIndex = index;
        if (rows[index].amount > rows[maxIndex].amount) maxIndex = index;
      }
      indices.add(minIndex);
      indices.add(maxIndex);
    }
    return [...indices].sort((a, b) => a - b).map(index => rows[index]);
  }

  function donutLayout(fractions) {
    const cleanFractions = fractions.map(value => Math.max(0, Number(value) || 0));
    const total = cleanFractions.reduce((value, fraction) => value + fraction, 0);
    if (!total) return [];
    const normalized = cleanFractions.map(value => value / total);
    let rotation = -Math.PI / 2, bestScore = Infinity;
    for (let candidate = 0; candidate < Math.PI * 2; candidate += Math.PI / 360) {
      let left = 0, right = 0, tangentPenalty = 0, angle = candidate;
      for (const fraction of normalized) {
        const middle = angle + fraction * Math.PI;
        Math.cos(middle) >= 0 ? right++ : left++;
        tangentPenalty += Math.max(0, .5 - Math.abs(Math.cos(middle))) / .5;
        angle += fraction * Math.PI * 2;
      }
      const score = Math.abs(left - right) * 100 + Math.max(left, right) + tangentPenalty;
      if (score < bestScore) { bestScore = score; rotation = candidate; }
    }

    const segments = [];
    let angle = rotation;
    for (const fraction of normalized) {
      const start = angle;
      angle += fraction * Math.PI * 2;
      const end = angle, middle = (start + end) / 2;
      segments.push({ start, end, middle, side: Math.cos(middle) >= 0 ? 1 : -1 });
    }

    for (const item of segments) {
      const inset = Math.min(Math.PI / 360, (item.end - item.start) * .08);
      const arcStart = item.start + inset, arcEnd = item.end - inset;
      const sideAngleWindow = Math.PI * .33;
      const safeArcs = item.side > 0
        ? [[0, sideAngleWindow], [Math.PI * 2 - sideAngleWindow, Math.PI * 2]]
        : [[Math.PI - sideAngleWindow, Math.PI + sideAngleWindow]];
      let best = item.middle, bestDistance = Infinity;
      const firstTurn = Math.floor(arcStart / (Math.PI * 2)) - 1;
      const lastTurn = Math.ceil(arcEnd / (Math.PI * 2)) + 1;
      for (let turn = firstTurn; turn <= lastTurn; turn++) {
        for (const [safeStart, safeEnd] of safeArcs) {
          const low = Math.max(arcStart, safeStart + turn * Math.PI * 2);
          const high = Math.min(arcEnd, safeEnd + turn * Math.PI * 2);
          if (low > high) continue;
          const candidate = Math.max(low, Math.min(high, item.middle));
          const distance = Math.abs(candidate - item.middle);
          if (distance < bestDistance) { best = candidate; bestDistance = distance; }
        }
      }
      item.anchorAngle = best;
    }
    return segments;
  }

  Object.assign(window.BlackBook, {
    reportsDonutLayout(fractions) { return donutLayout(fractions); },
    reportsState() {
      if (!this._reportsState) {
        const [year, month] = this.today().split('-').map(Number);
        const previous = new Date(Date.UTC(year, month - 2, 1));
        this._reportsState = { view: 'categories', year, month: month - 1, accountIds: null, category: 'all', person: 'all', personIds: null, against: key(previous.getUTCFullYear(), previous.getUTCMonth()), day: null, calendarMode: 'month', calendarYearMonth: null, calendarDisplay: 'totals', flowPeriod: 'month', itemKey: null, itemSearch: '', itemRange: 'lifetime', itemYear: year, itemChartMode: 'amount' };
      }
      if (!Object.prototype.hasOwnProperty.call(this._reportsState, 'itemKey')) this._reportsState.itemKey = null;
      if (!Object.prototype.hasOwnProperty.call(this._reportsState, 'itemSearch')) this._reportsState.itemSearch = '';
      if (!['lifetime', 'year', '3m', '6m', '1y', '3y'].includes(this._reportsState.itemRange)) this._reportsState.itemRange = 'lifetime';
      if (!['amount', 'change'].includes(this._reportsState.itemChartMode)) this._reportsState.itemChartMode = 'amount';
      if (!Number.isInteger(this._reportsState.itemYear)) this._reportsState.itemYear = Number(this.today().slice(0, 4)) || new Date().getFullYear();
      return this._reportsState;
    },

    reportsCatalog() {
      if (!this._reportsCatalogCache) this._reportsCatalogCache = { accounts: this.data.accounts || [], categories: this.data.categories || [], people: [...(this.data.people || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) };
      return this._reportsCatalogCache;
    },
    reportsCategoryIndex() {
      if (this._reportsCategoryIndexCache) return this._reportsCategoryIndexCache;
      const categories = this.reportsCatalog().categories;
      const uncategorized = categories.filter(category => String(category.name || '').trim().toLowerCase() === 'uncategorized');
      const uncategorizedId = uncategorized[0]?.id || 'none';
      const items = [...categories.filter(category => String(category.name || '').trim().toLowerCase() !== 'uncategorized'), uncategorized[0] ? { ...uncategorized[0], name: 'None' } : { id: 'none', name: 'None', color: this.reportsColor('--text-dim') }];
      this._reportsCategoryIndexCache = { byId: new Map(categories.map(category => [String(category.id), category])), uncategorizedIds: new Set(uncategorized.map(category => String(category.id))), uncategorizedId, items };
      return this._reportsCategoryIndexCache;
    },
    reportsUncategorizedId() { return this.reportsCategoryIndex().uncategorizedId; },
    reportsCategoryKey(row) {
      const index = this.reportsCategoryIndex();
      const categoryId = String(row.categoryId || '');
      return !categoryId || categoryId === 'none' || index.uncategorizedIds.has(categoryId) ? index.uncategorizedId : index.byId.get(categoryId)?.id ?? row.categoryId;
    },
    reportsCategoryItems() { return this.reportsCategoryIndex().items; },
    reportsMoney(amount) { return this.fmtNumber(amount) + ' ' + this.baseCurrency(); },

    reportsSelectedAccounts() {
      const ids = this.reportsState().accountIds;
      return new Set(ids == null ? this.reportsCatalog().accounts.map(account => account.id) : ids);
    },

    reportsRows(year) {
      const state = this.reportsState();
      const selected = this.reportsSelectedAccounts();
      const transactions = this.data.transactions || [];
      const accountKey = [...selected].map(String).sort().join('|');
      if (!this._reportsRowsCache || this._reportsRowsCache.transactions !== transactions || this._reportsRowsCache.accountKey !== accountKey) {
        const byYear = new Map();
        for (const tx of transactions) {
          if (this.isTransfer(tx) || !selected.has(tx.accountId) || !/^\d{4}-/.test(tx.date || '')) continue;
          const txYear = String(tx.date).slice(0, 4);
          if (!byYear.has(txYear)) byYear.set(txYear, []);
          byYear.get(txYear).push({ ...tx, description: tx.note || '', personId: (tx.personIds || [])[0], transactionAmount:Number(tx.amount) || 0, amount: Math.abs(this.transactionToBase(tx)) * (tx.type === 'income' ? 1 : -1) });
        }
        this._reportsRowsCache = { transactions, accountKey, byYear };
      }
      return (this._reportsRowsCache.byYear.get(String(year == null ? state.year : year)) || []).map(row => ({ ...row, transactionId:row.id }));
    },

    reportsAllocationRows(rows = this.reportsRows()) {
      const result = [];
      for (const row of rows) {
        const source = { ...row, amount:row.transactionAmount == null ? row.amount : row.transactionAmount };
        const allocations = this.transactionAllocationRows ? this.transactionAllocationRows(source) : [source];
        const baseTotal = Math.abs(Number(row.amount) || 0);
        const sourceTotal = Math.abs(Number(row.transactionAmount == null ? row.amount : row.transactionAmount) || 0);
        const nativeSplit = Array.isArray(row.parts) && row.parts.some(part => part && part.nativeAmount != null);
        let assigned = 0;
        allocations.forEach((allocation, index) => {
          const converted = !row.parts || !row.parts.length
            ? baseTotal
            : nativeSplit && index < allocations.length - 1
              ? Math.round(Math.abs(this.transactionToBase({ ...allocation, parts: null })) * 100) / 100
            : index === allocations.length - 1
              ? Math.round((baseTotal - assigned) * 100) / 100
              : Math.round(baseTotal * (sourceTotal ? Math.abs(allocation.amount) / sourceTotal : 0) * 100) / 100;
          assigned += converted;
          result.push({ ...row, ...allocation, transactionId:row.id, id:row.id, parentAmount:row.amount, amount:(row.amount < 0 ? -1 : 1) * converted });
        });
      }
      return result;
    },

    reportsMonthRows(year, month) { return this.reportsRows(year).filter(row => row.date.startsWith(key(year, month))); },

    reportsItemsIndex() {
      const transactions = Array.isArray(this.data.transactions) ? this.data.transactions : [];
      const sequence = this._saveSequence || 0;
      const cached = this._reportsItemIndexCache;
      if (cached && cached.transactions === transactions && cached.sequence === sequence && cached.length === transactions.length) return cached.items;

      const itemsByKey = new Map();
      const accountNames = new Map((this.data.accounts || []).map(account => [account.id, account.name]));
      for (const card of this.data.cards || []) accountNames.set('card:' + card.id, card.name);
      const add = (tags, tx, part, amountValue, partIndex = -1) => {
        if (!tags.length) return;
        const amount = tags.length === 1 && amountValue != null && Number.isFinite(Number(amountValue))
          ? Math.round(Math.abs(Number(amountValue)) * 100) / 100
          : null;
        const accountId = tx.accountId || (tx.cardId ? 'card:' + tx.cardId : null);
        const description = cleanReportItemDescription(part ? part.description : tx.note) ||
          cleanReportItemDescription(tx.note) || nameOf(this.data.categories || [], tx.categoryId, 'Purchase');
        for (const tag of tags) {
          const itemQuantity = Number(tx.itemQuantities && tx.itemQuantities[tag.key]);
          const rawPartQuantity = Number(part && part.quantity);
          const quantity = part
            ? Number.isFinite(rawPartQuantity) && rawPartQuantity > 0 ? rawPartQuantity : 1
            : Number.isFinite(itemQuantity) && itemQuantity > 0 ? itemQuantity : 1;
          const quantityKnown = part
            ? part.quantitySpecified === true || (part.quantitySpecified == null && Math.abs(quantity - 1) > 0.000001)
            : Number.isFinite(itemQuantity) && itemQuantity > 0;
          const purchaseAmount = amount == null ? null : part && part.amount != null && Number.isFinite(Number(part.amount))
            ? Math.round(Math.abs(Number(part.amount)) * 100) / 100
            : amount;
          if (!itemsByKey.has(tag.key)) itemsByKey.set(tag.key, { key: tag.key, name: tag.name, entries: [] });
          itemsByKey.get(tag.key).entries.push({
            transactionId: tx.id,
            allocationId: part ? (part.id || tx.id + ':part:' + partIndex) : tx.id,
            date: tx.date,
            amount,
            purchaseAmount,
            quantity,
            quantityKnown,
            partIndex: part ? partIndex : null,
            itemKey: tag.key,
            currency: (part && part.currency) || tx.currency || this.baseCurrency(),
            accountId,
            accountName: accountNames.get(accountId) || 'Account',
            description
          });
        }
      };

      for (const tx of transactions) {
        if (!tx || this.isTransfer(tx) || !(Number(tx.amount) < 0) || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date || '')) continue;
        const parentTags = reportItemTags(tx.note);
        const parts = Array.isArray(tx.parts) ? tx.parts : [];
        if (parts.length) {
          const taggedParts = parts.map((part, index) => ({ part, index, tags: reportItemTags(part && part.description) })).filter(row => row.tags.length);
          if (taggedParts.length) {
            for (const row of taggedParts) add(row.tags, tx, row.part, row.part.unitAmount == null ? row.part.amount : row.part.unitAmount, row.index);
          } else if (parentTags.length) add(parentTags, tx, null, tx.amount);
        } else if (parentTags.length) add(parentTags, tx, null, tx.amount);
      }

      const items = [...itemsByKey.values()].map(item => ({
        ...item,
        entries: item.entries.sort((a, b) => a.date.localeCompare(b.date) || String(a.allocationId).localeCompare(String(b.allocationId)))
      })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      this._reportsItemIndexCache = { transactions, sequence, length: transactions.length, items };
      return items;
    },

    destroyReportsCharts() {
      if (this._reportsShareObserver) this._reportsShareObserver.disconnect();
      this._reportsShareObserver = null;
      for (const chart of this._reportsCharts || []) chart.destroy();
      this._reportsCharts = [];
      this.hideDonutTooltip();
    },

    renderReports() {
      const root = document.getElementById('page-reports');
      if (!root) return;
      this._reportsCatalogCache = null;
      this._reportsCategoryIndexCache = null;
      this._reportsRowsCache = null;
      this._reportsCompareCategoryCache = null;
      this.destroyReportsCharts();
      if (this.forecastChart) { this.forecastChart.destroy(); this.forecastChart = null; }
      const state = this.reportsState();
      state.flowPeriod = state.flowPeriod === 'year' ? 'year' : 'month';
      const sample = this.reportsCatalog();
      const e = value => this.escapeHtml(String(value));
      const calendar = state.view === 'items' ? this.reportsItemsPicker() : state.view === 'forecast' ? this.reportsForecastPicker() : ['categories', 'compare', 'people'].includes(state.view) || (state.view === 'moneyflow' && state.flowPeriod === 'year') ? this.reportsYearPicker() : this.reportsCalendarPicker(state.year, state.month);
      let controls = '';
      const selected = this.reportsSelectedAccounts();
      controls += '<div class="reports-account-picker"><div class="reports-account-filters" role="group" aria-label="Accounts">' + sample.accounts.map(account => '<button type="button" class="cat-filter-chip page-control reports-account-chip' + (selected.has(account.id) ? ' selected' : '') + '" style="--cc:' + this.accountColor(account) + ';' + (selected.has(account.id) ? 'background:var(--cc);color:var(--on-fill);' : 'background:var(--block);color:var(--cc);') + '" aria-pressed="' + selected.has(account.id) + '" title="Click: toggle · Shift-click: keep multiple selected · Alt-click: isolate" onclick="BlackBook.toggleReportsAccount(\'' + account.id + '\',event)">' + e(account.name) + '</button>').join('') + '</div></div>';
      if (state.view === 'categories') controls += this.reportsCategoryChipControls();
      if (state.view === 'people') controls += '<div class="reports-chip-field reports-people-filter-field"><div class="reports-account-filters" role="group" aria-label="People"><button type="button" class="cat-filter-chip page-control" style="background:var(--accent);color:var(--on-fill)" aria-pressed="' + (state.personIds == null || sample.people.every(person => state.personIds.includes(person.id))) + '" onclick="BlackBook.selectAllReportPeople()">ALL</button>' + sample.people.map(person => '<button class="cat-filter-chip page-control" aria-pressed="' + (state.personIds == null || state.personIds.includes(person.id)) + '" style="--cc:' + this.personColor(person) + ';' + (state.personIds == null || state.personIds.includes(person.id) ? 'background:var(--cc);color:var(--on-fill)' : 'background:var(--block);color:var(--cc)') + '" title="Click to isolate · Ctrl-click to select multiple" onclick="BlackBook.toggleReportsPerson(\'' + e(person.id) + '\',event)">@' + e(person.name) + '</button>').join('') + '</div></div>';
      if (state.view === 'compare') controls += this.reportsCompareControls();
      const content = this.reportsViewContent();
      if (!selected.size && content.chart) {
        for (const dataset of content.chart.datasets) dataset.data = dataset.data.map(() => null);
      }
      root.innerHTML = '<div class="reports-shell"><div class="reports-topline"><nav class="reports-tabs" role="tablist" aria-label="Report views" onkeydown="BlackBook.reportsTabKey(event)">' + VIEWS.map(([id, label]) => '<button type="button" role="tab" class="btn page-control ' + (state.view === id ? 'btn-primary' : 'btn-secondary') + '" id="reports-view-' + id + '" aria-controls="reports-panel" aria-selected="' + (state.view === id) + '" tabindex="' + (state.view === id ? '0' : '-1') + '" onclick="BlackBook.setReportsView(\'' + id + '\')">' + label.toUpperCase() + '</button>').join('') + '</nav></div><div class="reports-toolbar">' + controls + '</div>' + content.summary + '<div class="list-sep"></div><div class="reports-content' + (state.view === 'moneyflow' ? ' reports-moneyflow-content' : '') + '" id="reports-panel" role="tabpanel" aria-labelledby="reports-view-' + state.view + '">' + content.html + '</div></div>';
      root.querySelector('.reports-topline').insertAdjacentHTML('beforebegin', calendar);
      root.querySelector('.reports-topline').insertAdjacentHTML('afterend', '<div class="list-sep reports-header-separator"></div>');
      const contentDivider = root.querySelector('.reports-summary + .list-sep');
      if (contentDivider) contentDivider.remove();
      if (state.view === 'compare') {
        const picker = root.querySelector('.month-picker');
        picker.classList.add('reports-compare-picker');
        picker.append(root.querySelector('.reports-range-controls'), root.querySelector('.reports-metric-control'));
        root.querySelector('.reports-compare-options').remove();
        if (this.reportsCompareSettings().range !== 1) root.querySelectorAll('.reports-history tbody tr').forEach(row => {
          const yearCell = row.querySelector('td');
          const year = Number(yearCell.textContent);
          yearCell.style.color = year === state.year ? this.reportsColor('--accent') : this.colorForName(String(year));
          yearCell.style.fontWeight = '700';
          yearCell.insertAdjacentHTML('afterbegin', '<span class="reports-year-dot" aria-hidden="true"></span>');
        });
      }
      const calendarPicker = root.querySelector('.month-picker');
      if (calendarPicker) {
        const topControls = document.createElement('div');
        topControls.className = 'reports-mobile-date-page-row';
        const pageLabel = document.createElement('div');
        pageLabel.className = 'reports-mobile-page-label';
        pageLabel.setAttribute('aria-current', 'page');
        pageLabel.textContent = (VIEWS.find(([id]) => id === state.view) || VIEWS[0])[1].toUpperCase();
        calendarPicker.before(topControls);
        topControls.append(calendarPicker, pageLabel);
        this.setupReportsMobileControls(root);
      }
      if (calendarPicker && !['forecast', 'items'].includes(state.view)) calendarPicker.addEventListener('wheel', event => {
        const onMonths = event.target.closest('.mp-months');
        const onYear = event.target.closest('.mp-year');
        if (!event.deltaY || (!onMonths && !onYear)) return;
        event.preventDefault();
        event.stopPropagation();
        const direction = event.deltaY > 0 ? 1 : -1;
        if (onMonths) {
          const date = new Date(Date.UTC(state.year, state.month + direction, 1));
          this.changeReportsCalendar('period', date.getUTCFullYear(), date.getUTCMonth());
        } else this.changeReportsCalendar('period', state.year - direction, state.month);
      }, { passive: false });
      const summary = root.querySelector('.reports-summary');
      const tabs = root.querySelector('.reports-topline');
      const separator = root.querySelector('.reports-header-separator');
      const summaryValues = document.createElement('div');
      summaryValues.className = 'reports-summary-values';
      while (summary.firstChild) summaryValues.append(summary.firstChild);
      summary.append(summaryValues, tabs);
      const mobileTopControls = root.querySelector('.reports-mobile-date-page-row');
      const reportsToolbar = root.querySelector('.reports-toolbar');
      if (mobileTopControls) {
        mobileTopControls.after(reportsToolbar);
        reportsToolbar.after(summary);
      } else {
        calendarPicker.insertAdjacentElement('afterend', summary);
        calendarPicker.insertAdjacentElement('afterend', reportsToolbar);
      }
      summary.insertAdjacentElement('afterend', separator);
      if (state.view === 'forecast') {
        if (selected.size && !(this.data.settings && this.data.settings.hideForecastGraph)) this.renderForecastChart(content.forecastResult);
      } else this.renderReportsChart(content.chart);
      this.renderReportsShareDonut();
      this.bindReportsChartPopups(root);
      if (!selected.size) {
        root.querySelectorAll('.reports-stat-value').forEach(value => { value.textContent = 'No data'; value.classList.remove('amount-positive', 'amount-negative'); });
        root.querySelectorAll('.reports-chart-wrap').forEach(wrap => wrap.insertAdjacentHTML('beforeend', '<div class="reports-no-data" role="status">No data · Select an account</div>'));
        root.querySelectorAll('.reports-empty').forEach(empty => { empty.textContent = 'No data · Select an account'; });
        root.querySelectorAll('.reports-table').forEach(table => { table.querySelector('tbody').innerHTML = '<tr><td colspan="' + table.querySelectorAll('thead th').length + '" class="reports-empty">No data · Select an account</td></tr>'; });
      }
      if (state.view === 'items') {
        root.querySelectorAll('[data-report-item-chart-mode]').forEach(button => button.addEventListener('click', () => {
          state.itemChartMode = state.itemChartMode === 'change' ? 'amount' : 'change';
          this.renderPage('reports');
        }));
        root.querySelectorAll('[data-report-item-year]').forEach(button => button.addEventListener('click', () => {
          const year = state.itemYear + Number(button.dataset.reportItemYear || 0);
          if (year < 1900 || year > 2099) return;
          state.itemYear = year;
          state.itemRange = 'year';
          this.renderPage('reports');
        }));
        root.querySelectorAll('[data-report-item-range]').forEach(button => button.addEventListener('click', () => {
          state.itemRange = ['lifetime', 'year', '3m', '6m', '1y', '3y'].includes(button.dataset.reportItemRange) ? button.dataset.reportItemRange : 'lifetime';
          this.renderPage('reports');
        }));
        root.querySelectorAll('[data-report-item-tracking]').forEach(button => button.addEventListener('click', async () => {
          const item = this.reportsItemsIndex().find(row => row.key === state.itemKey);
          if (!item) return;
          this.data.settings ||= {};
          this.data.settings.itemTracking ||= {};
          const saved = this.data.settings.itemTracking[item.key] || {};
          this.data.settings.itemTracking[item.key] = { ...saved, mode: button.dataset.mode === 'unit' ? 'purchase' : 'unit' };
          await this.save();
          this.renderPage('reports');
        }));
        root.querySelectorAll('[data-report-item-add-qty]').forEach(button => button.addEventListener('click', () => this.openReportItemQuantity(button)));
        root.querySelectorAll('.reports-item-option').forEach(button => button.addEventListener('click', () => {
          state.itemKey = state.itemKey === button.dataset.reportItemKey ? null : button.dataset.reportItemKey;
          this.renderPage('reports');
        }));
        const search = root.querySelector('#reports-item-search');
        if (search) search.addEventListener('input', () => {
          state.itemSearch = search.value;
          const query = search.value.trim().toLocaleLowerCase();
          let visible = 0;
          root.querySelectorAll('.reports-item-card').forEach(card => {
            card.hidden = !card.querySelector('.reports-item-option')?.dataset.itemName.toLocaleLowerCase().includes(query);
            if (!card.hidden) visible++;
          });
          const empty = root.querySelector('.reports-items-filter-empty');
          if (empty) empty.hidden = visible > 0;
        });
      }
      const activeTab = root.querySelector('.reports-tabs [aria-selected="true"]');
      if (activeTab && !window.matchMedia('(max-width: 500px)').matches) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },

    reportsMobileViewOptions() { return VIEWS.map(([id, label]) => ({ id, label })); },

    setupReportsMobileControls(root) {
      const toolbar = root.querySelector('.reports-toolbar');
      if (!toolbar) return;
      const candidates = [
        ['.reports-account-picker', 'accounts', 'ACCOUNTS'],
        ['.reports-category-filter-field', 'categories', 'CATEGORIES'],
        ['.reports-people-filter-field', 'people', 'PEOPLE'],
        ['.reports-chip-field:not(.reports-category-filter-field)', 'categories', 'CATEGORIES']
      ];
      candidates.forEach(([selector, key, label]) => {
        toolbar.querySelectorAll(selector).forEach(field => {
          if (field.classList.contains('reports-mobile-filter-control')) return;
          const chipGroup = field.querySelector('.reports-account-filters');
          if (!chipGroup) return;
          field.classList.add('reports-mobile-filter-control', 'reports-mobile-filter-' + key);
          const trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.className = 'btn btn-secondary page-control reports-mobile-filter-trigger';
          trigger.textContent = label;
          trigger.setAttribute('aria-expanded', 'false');
          trigger.addEventListener('click', () => this.toggleReportsFilterMenu(key));
          const menu = document.createElement('div');
          menu.className = 'reports-mobile-filter-menu';
          chipGroup.parentNode.insertBefore(trigger, chipGroup);
          menu.appendChild(chipGroup);
          field.appendChild(menu);
        });
      });
      if (!root._reportsMobileDismissBound) {
        root._reportsMobileDismissBound = true;
        document.addEventListener('click', event => {
          if (event.target.closest('#page-reports .reports-mobile-filter-control')) return;
          root.querySelectorAll('.reports-mobile-filter-control.is-open').forEach(field => {
            field.classList.remove('is-open');
            field.querySelector('.reports-mobile-filter-trigger')?.setAttribute('aria-expanded', 'false');
          });
        });
      }
    },

    toggleReportsFilterMenu(key) {
      const root = document.getElementById('page-reports');
      const field = root && root.querySelector('.reports-mobile-filter-control.reports-mobile-filter-' + key);
      if (!field) return;
      const opening = !field.classList.contains('is-open');
      root.querySelectorAll('.reports-mobile-filter-control.is-open').forEach(item => {
        item.classList.remove('is-open');
        item.querySelector('.reports-mobile-filter-trigger')?.setAttribute('aria-expanded', 'false');
      });
      if (opening) {
        field.classList.add('is-open');
        field.querySelector('.reports-mobile-filter-trigger')?.setAttribute('aria-expanded', 'true');
      }
    },

    reportsCalendarPicker(year, month, comparison = false) {
      const receiver = comparison ? 'comparison' : 'period';
      return '<div class="month-picker"><span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.changeReportsCalendar(\'' + receiver + '\',' + (year - 1) + ',' + month + ')">◀</button><span class="mp-year-label">' + year + '</span><button class="mp-year-btn" onclick="BlackBook.changeReportsCalendar(\'' + receiver + '\',' + (year + 1) + ',' + month + ')">▶</button></span><div class="mp-months">' + MONTHS.map((name, i) => {
        const enterMonth = !comparison && this.reportsState().view === 'calendar' && this.reportsState().calendarMode === 'year';
        const state = this.reportsState();
        const action = enterMonth ? 'BlackBook.toggleReportsYearMonthFilter(' + i + ')' : "BlackBook.changeReportsCalendar('" + receiver + "'," + year + ',' + i + ')';
        const selected = enterMonth ? state.calendarYearMonth === i : i === month;
        return '<button class="mp-month' + (selected ? ' selected' : '') + '" onclick="' + action + '"><span class="month-name-full">' + ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][i] + '</span><span class="month-name-short">' + name.toUpperCase() + '</span><span class="month-name-number">' + (i + 1) + '</span></button>';
      }).join('') + '</div><button class="mp-today" onclick="BlackBook.reportsToday()">TODAY</button></div>';
    },

    reportsForecastPicker() {
      return '<div class="month-picker reports-forecast-picker"><span class="mp-year"><span class="mp-year-label">FORECAST FROM TODAY</span></span><span class="mp-today">' + this.escapeHtml(this.fmtDateInput(this.today())) + '</span></div>';
    },
    reportsItemsPicker() {
      const state = this.reportsState();
      const ranges = [['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['3y', '3Y'], ['year', 'YEAR'], ['lifetime', 'LIFETIME']];
      const buttons = ranges.map(([id, label]) => '<button type="button" class="mp-today reports-item-range' + (state.itemRange === id ? ' mp-today-active' : '') + '" data-report-item-range="' + id + '" aria-pressed="' + (state.itemRange === id) + '">' + label + '</button>').join('');
      const yearPicker = state.itemRange === 'year'
        ? '<span class="mp-year" aria-label="Calendar year"><button type="button" class="mp-year-btn" data-report-item-year="-1" aria-label="Previous year">◀</button><span class="mp-year-label">' + state.itemYear + '</span><button type="button" class="mp-year-btn" data-report-item-year="1" aria-label="Next year">▶</button></span>'
        : '';
      return '<div class="month-picker reports-items-picker"><div class="reports-item-ranges" aria-label="Item graph time range">' + buttons + '</div>' + yearPicker + '</div>';
    },
    async openReportItemQuantity(button) {
      const tx = (this.data.transactions || []).find(item => item.id === button.dataset.txId);
      if (!tx) return;
      let partIndex = Number(button.dataset.partIndex);
      if (partIndex < 0 && Array.isArray(tx.parts) && tx.parts.length) {
        this.showToast('Add the item tag to its split part before entering a quantity.');
        return;
      }
      this.openEditTransaction(tx.id);
      if (partIndex < 0 && !(Array.isArray(tx.parts) && tx.parts.length)) {
        await this.toggleTransactionSplit();
        partIndex = 0;
      }
      if (this._txSplitParts && this._txSplitParts[partIndex]) {
        this._txSplitParts[partIndex].amountMode = 'total';
        this.renderTransactionSplitEditor();
      }
      setTimeout(() => {
        const input = document.querySelector('#tx-split-rows [data-split-index="' + partIndex + '"] .tx-split-quantity');
        if (input) { input.focus(); input.select(); }
      }, 60);
    },
    changeReportsCalendar(target, year, month) { if (year < 1900 || year > 2099) return; const state = this.reportsState(); if (target === 'comparison') state.against = key(year, month); else Object.assign(state, { year, month, day: null }); this.renderPage('reports'); },
    toggleReportsYearMonthFilter(month) {
      if (!Number.isInteger(month) || month < 0 || month > 11) return;
      const state = this.reportsState();
      state.calendarYearMonth = state.calendarYearMonth === month ? null : month;
      state.month = month;
      state.day = null;
      this.renderPage('reports');
    },
    toggleReportsPerson(id, event) { const state = this.reportsState(); if (!event.ctrlKey) state.personIds = [id]; else { const ids = new Set(state.personIds || [id]); if (ids.has(id)) ids.delete(id); else ids.add(id); state.personIds = [...ids]; } this.renderPage('reports'); },
    selectAllReportPeople() { this.reportsState().personIds = null; this.renderPage('reports'); },

    reportsSummaryHtml(stats) {
      return '<div class="reports-summary" aria-label="Report summary">' + stats.map(([label, value, color], index) => {
        const content = this.escapeHtml(value);
        return (index ? '<span class="reports-summary-separator" aria-hidden="true">·</span>' : '') + '<span class="reports-stat"><span class="reports-stat-label">' + this.escapeHtml(label) + '</span><span class="reports-stat-value' + (color ? ' amount-' + color : '') + '" title="' + this.escapeHtml(value) + '" aria-label="' + this.escapeHtml(value) + '">' + content + '</span></span>';
      }).join('') + '</div>';
    },

    reportsChartToggleHtml(mode, action, next) {
      const bars = mode === 'bars' || mode === 'vertical';
      let shapes;
      if (mode === 'donut') {
        const point = (radius, angle) => [12 + radius * Math.cos(angle * Math.PI / 180), 12 + radius * Math.sin(angle * Math.PI / 180)];
        let start = -90;
        shapes = [42, 58, 86, 104, 70].map(degrees => {
          const end = start + degrees, outerStart = point(10, start), outerEnd = point(10, end), innerEnd = point(5, end), innerStart = point(5, start);
          const path = 'M' + outerStart.join(',') + ' A10 10 0 0 1 ' + outerEnd.join(',') + ' L' + innerEnd.join(',') + ' A5 5 0 0 0 ' + innerStart.join(',') + ' Z';
          start = end;
          return '<path d="' + path + '" fill="currentColor" stroke="var(--block)" stroke-width=".8"/>';
        }).join('');
      } else if (mode === 'graph') shapes = '<path d="M4 4v16h16M5 17l5-7 4 3 6-8"/>';
      else if (bars) shapes = '<g fill="currentColor" stroke="none" shape-rendering="crispEdges"><rect x="2" y="8" width="4" height="10"/><rect x="8" y="2" width="4" height="16"/><rect x="14" y="5" width="4" height="13"/></g>';
      else shapes = '<path d="M4 5h16M4 12h11M4 19h14" stroke-width="2.5"/>';
      return '<button type="button" class="btn btn-secondary page-control reports-chart-toggle' + (mode === 'donut' ? ' reports-chart-toggle-donut' : '') + '" title="Switch to ' + next + '" aria-label="Switch to ' + next + '" onclick="BlackBook.' + action + '()"><svg viewBox="0 0 ' + (bars ? '20 20' : '24 24') + '" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + shapes + '</svg></button>';
    },

    toggleReportsShareChart() { const state = this.reportsState(); state.shareChart = state.shareChart === 'donut' ? 'bars' : 'donut'; this.renderPage('reports'); },
    toggleReportsCompareChart() { const settings = this.reportsCompareSettings(); settings.chart = settings.chart === 'bars' ? 'graph' : 'bars'; this.renderPage('reports'); },

    setReportsCompareView(view) {
      if (view === 'totals' || view === 'categories') this.reportsCompareSettings().view = view;
      this.renderPage('reports');
    },

    reportsChartHtml(title, note, action = '', titleMarkup = '') {
      const heading = titleMarkup || '<h3>' + this.escapeHtml(title) + '</h3>';
      const panelNote = note ? '<span class="reports-panel-note">' + this.escapeHtml(note) + '</span>' : '';
      return '<section class="reports-chart-panel"><div class="reports-panel-heading">' + heading + panelNote + action + '</div><div class="reports-chart-wrap"><canvas id="reports-chart" role="img" aria-label="' + this.escapeHtml(title) + '; values are also listed in the table below."></canvas></div></section>';
    },

    reportsCategoryChipControls() {
      const state = this.reportsState();
      const uncategorizedId = this.reportsUncategorizedId();
      if (state.category !== 'all' && this.reportsCategoryKey({ categoryId: state.category }) !== state.category) state.category = uncategorizedId;
      const used = new Set(this.reportsAllocationRows(this.reportsRows()).filter(row => row.amount !== 0).map(row => this.reportsCategoryKey(row)));
      if (state.category !== 'all' && !used.has(state.category)) state.category = 'all';
      const categories = this.reportsCategoryItems().filter(category => used.has(category.id)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const e = value => this.escapeHtml(String(value));
      const allSelected = state.category === 'all';
      const allColor = this.reportsColor('--accent');
      return '<div class="reports-chip-field reports-category-filter-field"><div class="reports-account-filters" role="group" aria-label="Categories"><button type="button"' + (allSelected ? ' id="reports-category"' : '') + ' class="cat-filter-chip page-control' + (allSelected ? ' selected' : '') + '" style="' + (allSelected ? 'background:var(--accent);color:var(--on-fill)' : 'background:var(--block);color:' + allColor) + '" aria-pressed="' + allSelected + '" onclick="BlackBook.setReportsFilter(\'category\',\'all\')">ALL</button>' + categories.map(category => {
        const selected = state.category === category.id;
        const color = this.categoryColor(category);
        return '<button type="button"' + (selected ? ' id="reports-category"' : '') + ' class="cat-filter-chip page-control' + (selected ? ' selected' : '') + '" style="--cc:' + color + ';' + (selected ? 'background:var(--cc);color:var(--on-fill)' : 'background:var(--block);color:var(--cc)') + '" aria-pressed="' + selected + '" onclick="BlackBook.setReportsFilter(\'category\',\'' + e(category.id) + '\')">' + e(category.name) + '</button>';
      }).join('') + '</div></div>';
    },

    reportsTableHtml(headers, rows, className = '') {
      const separatorIndex = headers.includes('In %') ? rows.findIndex((row, index) => index > 0 && row[3] !== '—') : -1;
      return '<div class="reports-table-wrap"><table class="reports-table' + (className ? ' ' + className : '') + '"><thead><tr>' + headers.map((label, index) => '<th scope="col"' + (index ? ' class="reports-amount"' : '') + '>' + this.escapeHtml(label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row, index) => '<tr' + (index === separatorIndex ? ' class="reports-flow-out-separator"' : '') + '>' + row.map((value, index) => '<td data-label="' + this.escapeHtml(String(headers[index] || '')) + '"' + (index ? ' class="reports-amount"' : '') + '>' + (/^[↑↓]/.test(String(value)) ? '<span class="amount-' + (String(value).startsWith('↑') ? 'positive' : 'negative') + '">' + this.escapeHtml(String(value)) + '</span>' : this.escapeHtml(String(value))) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    },

    reportsBreakdownHtml(rows, title, allRows = rows, useHighlightColor = false) {
      const categories = this.reportsCategoryItems();
      const spend = categories.map(category => ({ ...category, amount: -sum(rows.filter(row => row.amount < 0 && this.reportsCategoryKey(row) === category.id)) })).filter(category => category.amount > 0).sort((a, b) => b.amount - a.amount);
      const total = -sum(allRows.filter(row => row.amount < 0));
      const donut = this.reportsState().shareChart === 'donut';
      this._reportsShareData = { items: spend.map(category => ({ ...category, color: this.categoryColor(category) })), total };
      return '<section class="reports-side-panel"><div class="reports-panel-heading"><h3 class="reports-section-title">' + this.escapeHtml(title) + '</h3>' + this.reportsChartToggleHtml(donut ? 'donut' : 'bars', 'toggleReportsShareChart', donut ? 'bars' : 'donut') + '</div>' + (donut ? '<div class="reports-share-donut"></div>' : '<div class="reports-breakdown">' + spend.map(category => {
        const percent = total ? category.amount / total * 100 : 0;
        const hoverLabel = category.name + ': ' + this.reportsMoney(category.amount) + ' · ' + percent.toFixed(1) + '%';
        return '<div class="reports-breakdown-row" data-report-hover="' + this.escapeHtml(hoverLabel) + '"><div class="reports-breakdown-head"><span>' + this.escapeHtml(category.name) + '</span><span>' + this.reportsMoney(category.amount) + ' · ' + percent.toFixed(1) + '%</span></div><div class="reports-bar-track"><div class="reports-bar-fill" style="width:' + percent + '%;background:' + (useHighlightColor ? 'var(--accent)' : this.categoryColor(category)) + '"></div></div></div>';
      }).join('') + (spend.length ? '' : '<div class="reports-empty">No expenses in this selection.</div>') + '</div>') + '</section>';
    },

    reportsCategoryStatsHtml(rows, category, year) {
      const info = totals(rows);
      const activeMonths = new Set(rows.map(row => Number(row.date.slice(5, 7)))).size;
      const averagePerTransaction = info.count ? (info.income + info.expenses) / info.count : 0;
      const stats = [
        ['Transactions', String(info.count)],
        ['Active months', String(activeMonths)],
        ['Income', this.reportsMoney(info.income), 'positive'],
        ['Expenses', this.reportsMoney(-info.expenses), 'negative'],
        ['Net', this.reportsMoney(info.net), info.net < 0 ? 'negative' : 'positive'],
        ['Average / transaction', this.reportsMoney(averagePerTransaction)]
      ];
      return '<section class="reports-side-panel reports-category-stats-panel"><div class="reports-panel-heading"><h3 class="reports-section-title">Category stats</h3><span class="reports-panel-note">' + this.escapeHtml(category + ' · ' + year) + '</span></div><div class="reports-category-stats" aria-label="' + this.escapeHtml(category + ' statistics for ' + year) + '">' + stats.map(([label, value, color]) => '<div class="reports-category-stat"><span class="reports-category-stat-label">' + this.escapeHtml(label) + '</span><span class="reports-category-stat-value' + (color ? ' amount-' + color : '') + '">' + this.escapeHtml(value) + '</span></div>').join('') + '</div></section>';
    },

    bindReportsChartPopups(root) {
      root.querySelectorAll('[data-report-hover]').forEach(target => {
        if (target.dataset.reportHoverBound) return;
        target.dataset.reportHoverBound = 'true';
        target.setAttribute('tabindex', '0');
        target.setAttribute('aria-label', target.dataset.reportHover);
        const show = () => {
          const bounds = target.getBoundingClientRect();
          this.showDonutTooltip({ canvas: target }, { opacity: 1, caretX: bounds.width / 2, caretY: 0 }, target.dataset.reportHover);
        };
        const hide = () => this.hideDonutTooltip();
        target.addEventListener('mouseenter', show);
        target.addEventListener('focus', show);
        target.addEventListener('mouseleave', hide);
        target.addEventListener('blur', hide);
      });
    },

    renderReportsShareDonut() {
      const host = document.querySelector('#page-reports .reports-share-donut');
      if (!host) return;
      const draw = () => {
        const { items, total } = this._reportsShareData;
        const e = value => this.escapeHtml(String(value));
        if (!items.length || !total) { host.innerHTML = '<div class="reports-empty">No expenses in this selection.</div>'; return; }
        const rankedSegments = items.map(item => ({ ...item })).sort((a, b) => b.amount - a.amount);
        const segments = rankedSegments.slice(0, 17);
        const omittedAmount = rankedSegments.slice(17).reduce((value, item) => value + item.amount, 0);
        const uncategorizedRemainder = Math.max(0, total - rankedSegments.reduce((value, item) => value + item.amount, 0));
        const otherAmount = omittedAmount + uncategorizedRemainder;
        if (otherAmount > .01) segments.push({ name: 'Other', amount: otherAmount, color: this.reportsColor('--text-muted') });
        const distributionOrder = [...segments].sort((a, b) => b.amount - a.amount);
        const distributedSegments = [];
        while (distributionOrder.length) {
          distributedSegments.push(distributionOrder.shift());
          if (distributionOrder.length) distributedSegments.push(distributionOrder.pop());
        }
        segments.splice(0, segments.length, ...distributedSegments);
        const width = Math.max(1, Math.round(host.clientWidth)), height = Math.max(1, Math.round(host.clientHeight));
        const displayFractions = this.donutDisplayValues(segments.map(item => Math.sqrt(item.amount)), 4);
        const layout = donutLayout(displayFractions);
        segments.forEach((item, index) => Object.assign(item, layout[index]));
        const sides = [-1, 1].map(side => segments.filter(item => item.side === side).sort((a, b) => Math.sin(a.anchorAngle) - Math.sin(b.anchorAngle)));
        const cx = Math.round(width / 2), cy = Math.round(height / 2 - 18), radius = Math.round(Math.min(width * .21, (height - 44) / 2)), inner = Math.round(radius * .62);
        const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        const measure = document.createElement('canvas').getContext('2d');
        measure.font = '14px Hack, monospace';
        const fit = (text, available) => { let label = text; while (label.length && measure.measureText(label + (label === text ? '' : '…')).width > available) label = label.slice(0, -1); return label === text ? text : label + '…'; };
        let svg = '', leaders = '', labelsSvg = '';
        for (const [index, item] of segments.entries()) {
          const span = Math.min(item.end - item.start, Math.PI * 2 - .0001), end = item.start + span;
          const a = point(radius, item.start), b = point(radius, end), c = point(inner, end), d = point(inner, item.start), large = span > Math.PI ? 1 : 0;
          item.donutIndex = index;
          svg += '<path class="reports-share-segment" data-report-segment="' + index + '" d="M' + a.join(',') + ' A' + radius + ',' + radius + ' 0 ' + large + ' 1 ' + b.join(',') + ' L' + c.join(',') + ' A' + inner + ',' + inner + ' 0 ' + large + ' 0 ' + d.join(',') + ' Z" fill="' + e(item.color) + '" stroke="' + e(this.reportsColor('--bg')) + '" stroke-width="1"/>';
        }
        const labelCount = Math.max(1, ...sides.map(side => side.length));
        const labelStep = labelCount > 1 ? (height - 28) / (labelCount - 1) : height / 2;
        const denseLabels = labelStep < 22;
        for (const side of sides) {
          measure.font = (denseLabels ? '9.5px' : '11px') + ' Hack, monospace';
          const sideStep = side.length > 1 ? (height - 28) / (side.length - 1) : height / 2;
          side.forEach((item, index) => { item.labelY = side.length > 1 ? 14 + sideStep * index : height / 2; });
          const laneGap = 4;
          const labelWidth = Math.max(42, Math.min(width * .34, width / 2 - radius - 20 - side.length * laneGap));
          const rightSide = side[0]?.side > 0;
          const textX = rightSide ? width - 5 : 5;
          const align = rightSide ? 'end' : 'start';
          for (const item of side) {
            const label = this.reportsMoney(item.amount) + ' / ' + (item.amount / total * 100).toFixed(1) + '%';
            const compactMoney = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(item.amount);
            const dense = denseLabels;
            const labelY = Math.max(9, Math.min(height - 4, item.labelY));
            const nameText = fit(item.name, labelWidth);
            const detailText = fit(measure.measureText(label).width <= labelWidth ? label : compactMoney + ' / ' + (item.amount / total * 100).toFixed(1) + '%', labelWidth);
            const labelBaseline = labelY - (dense ? 3 : 4);
            const nameWidth = measure.measureText(nameText).width;
            const endX = rightSide ? textX - nameWidth - 4 : textX + nameWidth + 4;
            const sideDirection = rightSide ? 1 : -1;
            const bendX = cx + sideDirection * (radius + 12);
            const [startX, startY] = point(radius - 2, item.anchorAngle);
            const exitX = startX + sideDirection * 9;
            leaders += '<polyline class="reports-share-leader" data-report-leader="' + item.donutIndex + '" points="' + startX + ',' + startY + ' ' + exitX + ',' + startY + ' ' + bendX + ',' + labelBaseline + ' ' + endX + ',' + labelBaseline + '" stroke="' + e(item.color) + '"/>';
            labelsSvg += '<g><title>' + e(item.name + ': ' + label) + '</title><text x="' + textX + '" y="' + labelBaseline + '" text-anchor="' + align + '" fill="' + e(item.color) + '" font-size="' + (dense ? '9.5' : '11') + '">' + e(nameText) + '</text><text x="' + textX + '" y="' + (labelY + (dense ? 7 : 8)) + '" text-anchor="' + align + '" fill="' + e(this.reportsColor('--text-dim')) + '" font-size="' + (dense ? '8' : '10') + '">' + e(detailText) + '</text></g>';
          }
        }
        host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="100%" role="img" aria-label="Category spending shares" style="font-family:inherit">' + leaders + svg + labelsSvg + '</svg>';
        host.querySelectorAll('[data-report-segment]').forEach(segment => {
          const leader = host.querySelector('[data-report-leader="' + segment.dataset.reportSegment + '"]');
          const activate = () => leader?.classList.add('is-active');
          const deactivate = () => leader?.classList.remove('is-active');
          segment.addEventListener('mouseenter', activate);
          segment.addEventListener('focus', activate);
          segment.addEventListener('mouseleave', deactivate);
          segment.addEventListener('blur', deactivate);
        });
      };
      this._reportsShareObserver = new ResizeObserver(draw);
      this._reportsShareObserver.observe(host);
      draw();
    },

    reportsViewContent() {
      const state = this.reportsState();
      if (state.view === 'forecast') return this.forecastReportsContent();
      if (state.view === 'compare') return this.reportsCompareContent();
      if (state.view === 'people') return this.reportsPeopleContent();
      if (state.view === 'moneyflow') return this.reportsMoneyFlowContent();
      if (state.view === 'items') return this.reportsItemsContent();
      if (state.view === 'calendar') return this.reportsCalendarContent();
      const allRows = this.reportsAllocationRows(this.reportsRows());
      const rows = allRows.filter(row => state.category === 'all' || this.reportsCategoryKey(row) === state.category);
      const info = totals(rows);
      const expenses = MONTHS.map((_, month) => -totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)).expenses);
      const peak = expenses.indexOf(Math.min(...expenses));
      const [currentYear, currentMonth] = this.today().split('-').map(Number);
      const visibleMonthCount = state.year < currentYear ? MONTHS.length : state.year === currentYear ? currentMonth : 0;
      const visibleMonths = MONTHS.slice(0, visibleMonthCount);
      const category = nameOf(this.reportsCategoryItems(), state.category, state.category === 'none' ? 'None' : 'All expenses');
      const categoryPanel = state.category === 'all'
        ? this.reportsBreakdownHtml(rows, 'Category share', allRows, true)
        : this.reportsCategoryStatsHtml(rows, category, state.year);
      return {
        summary: this.reportsSummaryHtml([['Year expenses', this.reportsMoney(info.expenses), 'negative'], ['Monthly average', this.reportsMoney(info.expenses / 12)], ['Transactions', String(info.count)]]),
        html: '<div class="reports-grid">' + this.reportsChartHtml('Income vs expenses', '') + categoryPanel + '</div><section class="reports-history"><h3 class="reports-section-title">Monthly breakdown</h3>' + this.reportsTableHtml(['Month', 'Income', 'Expenses', 'Net', 'Change', 'Transactions'], visibleMonths.map((month, index) => {
          const monthly = totals(rows.filter(row => Number(row.date.slice(5, 7)) === index + 1));
          const previousRows = this.reportsAllocationRows(this.reportsMonthRows(index ? state.year : state.year - 1, index ? index - 1 : 11));
          const previous = totals(previousRows.filter(row => state.category === 'all' || this.reportsCategoryKey(row) === state.category));
          const change = monthly.count ? monthly.net - previous.net : 0;
          return [month + ' ' + state.year, this.reportsMoney(monthly.income), this.reportsMoney(-monthly.expenses), this.reportsMoney(monthly.net), (change > 0 ? '↑ ' : change < 0 ? '↓ ' : '') + this.reportsMoney(Math.abs(change)) + this.reportsChangePercent(change, previous.net), monthly.count];
        }).reverse()) + '</section>',
        chart: { type: 'line', labels: MONTHS, datasets: [{ label: 'Income', data: MONTHS.map((_, month) => totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)).income), borderColor: this.reportsColor('--income'), tension: 0.3, cubicInterpolationMode: 'monotone' }, { label: 'Expenses', data: expenses, borderColor: this.reportsColor('--expense'), backgroundColor: this.hexToRgba(this.reportsColor('--expense'), 0.08), fill: 'origin', tension: 0.3, cubicInterpolationMode: 'monotone' }] }
      };
    },

    reportsItemsContent() {
      const state = this.reportsState();
      const selectedAccounts = this.reportsSelectedAccounts();
      const allAccountsSelected = state.accountIds == null;
      const baseCurrency = this.baseCurrency();
      const items = this.reportsItemsIndex().map(item => ({
        ...item,
        entries: item.entries.filter(entry =>
          (entry.accountId && selectedAccounts.has(entry.accountId)) ||
          (entry.accountId && entry.accountId.startsWith('card:') && allAccountsSelected)
        ).map(entry => ({ ...entry }))
      })).filter(item => item.entries.length).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.key.localeCompare(b.key));
      const selectedItem = items.find(item => item.key === state.itemKey) || null;
      if (!selectedItem) state.itemKey = null;

      const sortNewest = (a, b) => b.date.localeCompare(a.date) || String(b.allocationId).localeCompare(String(a.allocationId));
      const itemTrackingFor = item => {
        const saved = this.data.settings && this.data.settings.itemTracking && this.data.settings.itemTracking[item.key] || {};
        const hasRecordedQuantity = item.entries.some(entry => entry.quantityKnown && entry.quantity > 1);
        return { mode: saved.mode === 'unit' || saved.mode === 'purchase' ? saved.mode : hasRecordedQuantity ? 'unit' : 'purchase' };
      };
      const selectedTracking = selectedItem ? itemTrackingFor(selectedItem) : { mode: 'purchase' };
      const metricAmount = (entry, mode) => {
        if (entry.purchaseAmount == null) return null;
        if (mode !== 'unit') return Number(entry.purchaseAmount);
        return entry.quantityKnown && Number(entry.quantity) > 0 ? Number(entry.purchaseAmount) / Number(entry.quantity) : null;
      };
      const amountInBase = (amount, entry) => amount == null ? null : this.toBase(Number(amount) || 0, entry.currency || baseCurrency);
      const history = selectedItem ? selectedItem.entries.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.allocationId).localeCompare(String(b.allocationId))) : [];
      let previousPriced = null;
      for (const entry of history) {
        entry.metricAmount = metricAmount(entry, selectedTracking.mode);
        entry.baseAmount = amountInBase(entry.metricAmount, entry);
        entry.purchaseBaseAmount = amountInBase(entry.purchaseAmount, entry);
        entry.changePercent = entry.baseAmount != null && previousPriced && previousPriced.baseAmount !== 0
          ? ((entry.baseAmount - previousPriced.baseAmount) / previousPriced.baseAmount) * 100
          : null;
        if (entry.baseAmount != null) previousPriced = entry;
      }
      const rollingMonths = { '3m': 3, '6m': 6, '1y': 12, '3y': 36 }[state.itemRange];
      let historyForView = history;
      if (state.itemRange === 'year') historyForView = history.filter(entry => Number(entry.date.slice(0, 4)) === state.itemYear);
      else if (rollingMonths) {
        const end = new Date(this.today() + 'T00:00:00Z');
        const start = new Date(end);
        start.setUTCMonth(start.getUTCMonth() - rollingMonths);
        const fromDate = start.toISOString().slice(0, 10);
        const throughDate = this.today();
        historyForView = history.filter(entry => entry.date >= fromDate && entry.date <= throughDate);
      }
      const latestVisiblePriced = historyForView.filter(entry => entry.baseAmount != null).sort(sortNewest)[0] || null;
      const pricedHistory = historyForView.filter(entry => entry.baseAmount != null).map(entry => ({ ...entry, amount: entry.baseAmount, currency: baseCurrency }));
      const changeHistory = historyForView.filter(entry => entry.changePercent != null).map(entry => ({ ...entry, amount: entry.changePercent }));
      const chartHistory = state.itemChartMode === 'change' ? changeHistory : pricedHistory;
      const chartRows = samplePriceHistory(chartHistory);
      const chartLabels = chartRows.map(entry => {
        const [year, month, day] = entry.date.split('-').map(Number);
        return String(day).padStart(2, '0') + ' ' + (MONTHS_FULL[month - 1] || '') + ' ' + year;
      });
      const chart = selectedItem ? {
        type: 'line',
        currency: state.itemChartMode === 'amount' ? baseCurrency : null,
        percent: state.itemChartMode === 'change',
        fitYAxis: true,
        labels: chartLabels,
        datasets: [{ label: state.itemChartMode === 'change' ? 'Change' : selectedTracking.mode === 'unit' ? 'Per unit' : 'Transaction', data: chartRows.map(entry => entry.amount), borderColor: this.reportsColor('--accent'), backgroundColor: this.hexToRgba(this.reportsColor('--accent'), 0.08), fill: false, tension: 0.25, cubicInterpolationMode: 'monotone', pointRadius: 3, pointHoverRadius: 5 }]
      } : null;

      const historyRows = historyForView.slice().sort(sortNewest).map(entry => {
        const change = entry.changePercent == null ? 'N/A' : (entry.changePercent > 0 ? '↑ ' : entry.changePercent < 0 ? '↓ ' : '') + Math.abs(entry.changePercent).toFixed(1) + '%';
        const changeClass = entry.changePercent == null || entry.changePercent === 0 ? '' : entry.changePercent > 0 ? ' amount-negative' : ' amount-positive';
        const price = entry.baseAmount == null
          ? selectedTracking.mode === 'unit' && entry.purchaseBaseAmount != null
            ? '<span class="reports-item-history-price">' + this.escapeHtml(this.fmtAmount(entry.purchaseBaseAmount, baseCurrency)) + '</span><small class="reports-item-native-price">TOTAL SPENT</small>'
            : '<span class="reports-item-needs-split">SPLIT TO TRACK PRICE</span>'
          : '<span class="reports-item-history-price">' + this.escapeHtml(this.fmtAmount(entry.baseAmount, baseCurrency)) + '</span>' + (entry.quantityKnown ? '<small class="reports-item-quantity">' + this.escapeHtml('× ' + String(entry.quantity)) + '</small>' : '');
        const nativePrice = entry.purchaseBaseAmount != null && entry.currency !== baseCurrency
          ? '<small class="reports-item-native-price">PAID ' + this.escapeHtml(this.fmtAmount(entry.purchaseAmount, entry.currency)) + '</small>'
          : '';
        const quantityAction = selectedTracking.mode === 'unit' && !entry.quantityKnown && entry.purchaseAmount != null
          ? '<button type="button" class="btn btn-sm btn-secondary reports-item-add-qty" data-report-item-add-qty data-tx-id="' + this.escapeHtml(entry.transactionId) + '" data-part-index="' + (entry.partIndex == null ? '-1' : entry.partIndex) + '" title="Add quantity to calculate price per unit">ADD QTY</button>'
          : '<span class="reports-item-history-change' + changeClass + '">' + this.escapeHtml(change) + '</span>';
        const transactionAction = this.linkedTransactionButton ? this.linkedTransactionButton(entry.transactionId).replace('linked-tx-action', 'linked-tx-action reports-item-transaction-action') : '';
        return '<div class="reports-item-history-entry"><div class="reports-item-history-main"><span class="reports-item-history-date">' + this.escapeHtml(this.fmtDateInput(entry.date)) + '</span><span class="reports-item-history-name">' + this.escapeHtml(entry.description || 'Transaction') + '</span><small class="reports-item-history-account">' + this.escapeHtml(entry.accountName) + '</small></div><div class="reports-item-history-value"><span class="reports-item-history-price-stack">' + price + nativePrice + '</span>' + quantityAction + transactionAction + '</div></div>';
      }).join('');
      const noPriceMessage = !historyForView.length
        ? 'No purchases for ' + (state.itemRange === 'year' ? state.itemYear : 'this period') + '.'
        : selectedTracking.mode === 'unit' && !pricedHistory.length && historyForView.some(entry => entry.purchaseAmount != null)
          ? 'Add a quantity to a transaction to see its price per unit.'
        : state.itemChartMode === 'change'
          ? changeHistory.length ? '' : 'Add another separately priced purchase to see the percentage change.'
          : historyForView.some(entry => entry.purchaseAmount != null)
            ? 'No separately priced purchases for ' + (state.itemRange === 'year' ? state.itemYear : 'this period') + '.'
            : 'No separate prices yet. Put one item tag on each split part to track individual prices.';
      const itemTotalEntries = historyForView.filter(entry => entry.purchaseBaseAmount != null);
      const itemTotal = itemTotalEntries.reduce((sum, entry) => sum + entry.purchaseBaseAmount, 0);
      const itemTotalText = itemTotalEntries.length ? this.fmtAmount(itemTotal, baseCurrency) : '—';
      const itemTotalLabel = state.itemRange === 'year' ? state.itemYear + ' total' : ({ '3m': '3 months total', '6m': '6 months total', '1y': '1 year total', '3y': '3 years total', lifetime: 'Lifetime total' }[state.itemRange] || 'Lifetime total');
      const trackingButton = selectedItem
        ? '<button type="button" class="btn btn-sm btn-secondary reports-item-toggle" data-report-item-tracking data-mode="' + selectedTracking.mode + '" aria-label="Switch price basis to ' + (selectedTracking.mode === 'unit' ? 'transaction' : 'per unit') + '" title="Switch between transaction and per-unit prices">' + (selectedTracking.mode === 'unit' ? 'PER UNIT' : 'TRANSACTION') + '</button>'
        : '';
      const chartModeButton = selectedItem
        ? '<button type="button" class="btn btn-sm btn-secondary reports-item-toggle" data-report-item-chart-mode aria-label="Switch graph to ' + (state.itemChartMode === 'change' ? 'amount' : 'percent change') + '" title="Switch between amount and percent change">' + (state.itemChartMode === 'change' ? '% CHANGE' : 'AMOUNT') + '</button>'
        : '';
      const graphHeading = selectedItem
        ? '<div class="reports-items-current-heading"><div class="reports-items-current-title"><h2>' + this.escapeHtml(selectedItem.name) + '</h2><span>' + historyForView.length + ' transaction' + (historyForView.length === 1 ? '' : 's') + '</span></div><div class="reports-item-header-controls">' + trackingButton + chartModeButton + '</div><strong class="reports-items-total"><small>' + this.escapeHtml(itemTotalLabel) + '</small>' + this.escapeHtml(itemTotalText) + '</strong></div>'
        : '<div class="reports-items-current-heading"><h2>Item price history</h2></div>';
      const noPriceRows = !chartRows.length ? '<div class="reports-items-chart-empty">' + noPriceMessage + '</div>' : '';
      const chartRangeLabel = state.itemRange === 'year' ? String(state.itemYear) : ({ '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last year', '3y': 'Last 3 years', lifetime: 'Lifetime' }[state.itemRange] || 'Lifetime');
      const chartMetricLabel = state.itemChartMode === 'change' ? 'percent change' : selectedTracking.mode === 'unit' ? 'price per unit · ' + baseCurrency : 'price per transaction · ' + baseCurrency;
      const detail = '<section class="reports-items-detail reports-chart-panel">' + graphHeading +
        (selectedItem ? '<div class="reports-items-chart-heading"><span>' + this.escapeHtml(chartRangeLabel + ' · ' + chartMetricLabel) + '</span>' + (chartHistory.length > chartRows.length ? '<small>' + chartRows.length.toLocaleString() + ' graph points</small>' : '') + '</div><div class="reports-chart-wrap"><canvas id="reports-chart" role="img" aria-label="' + this.escapeHtml(chartRangeLabel + ' ' + (state.itemChartMode === 'change' ? 'percent change' : selectedTracking.mode === 'unit' ? 'price per unit' : 'transaction price') + ' for ' + selectedItem.name + (state.itemChartMode === 'amount' ? ' in ' + baseCurrency : '')) + '"></canvas>' + noPriceRows + '</div>' : '<div class="reports-items-empty-graph">' + (selectedAccounts.size ? 'Select an item to see its price history.' : 'Select an account to see item history.') + '</div>') +
        '</section>';

      const itemQuery = String(state.itemSearch || '').trim().toLocaleLowerCase();
      const filteredItemCount = items.filter(item => item.name.toLocaleLowerCase().includes(itemQuery)).length;
      const selectedHistoryPanel = selectedItem
        ? '<div class="reports-item-expanded-history"><div class="reports-item-expanded-heading">PURCHASE HISTORY <span>' + historyForView.length + '</span></div>' + (historyRows || '<div class="reports-empty">No tagged purchases for this period.</div>') + '</div>'
        : '';
      const itemOptions = items.map(item => {
        const visible = item.name.toLocaleLowerCase().includes(itemQuery);
        const itemTracking = itemTrackingFor(item);
        const priced = item.entries.map(entry => ({ ...entry, baseAmount: amountInBase(metricAmount(entry, itemTracking.mode), entry) })).filter(entry => entry.baseAmount != null).sort(sortNewest);
        const newest = priced[0] || null;
        const previous = newest ? priced[1] || null : null;
        const priceChange = newest && previous ? newest.baseAmount - previous.baseAmount : 0;
        const priceChangeClass = priceChange > 0 ? ' amount-negative' : priceChange < 0 ? ' amount-positive' : '';
        const needsQuantity = itemTracking.mode === 'unit' && item.entries.some(entry => entry.purchaseAmount != null && !entry.quantityKnown);
        const price = newest ? this.fmtAmount(newest.baseAmount, baseCurrency) : needsQuantity ? 'QTY NEEDED' : 'SPLIT TO TRACK PRICE';
        const changePercent = previous && previous.baseAmount !== 0 ? Math.abs(priceChange / previous.baseAmount * 100).toFixed(1) + '%' : '';
        const changeLabel = priceChange > 0 ? '↑ ' + changePercent : priceChange < 0 ? '↓ ' + changePercent : '';
        const count = item.entries.length;
        const isSelected = !!selectedItem && selectedItem.key === item.key;
        const option = '<button type="button" class="reports-item-option"' + (visible ? '' : ' hidden') + ' data-report-item-key="' + this.escapeHtml(item.key) + '" data-item-name="' + this.escapeHtml(item.name) + '" aria-expanded="' + isSelected + '" aria-pressed="' + isSelected + '"><span class="reports-item-option-main"><span class="reports-item-option-name">' + this.escapeHtml(item.name) + '</span><span class="reports-item-option-price' + priceChangeClass + '">' + this.escapeHtml(price) + '</span></span><span class="reports-item-option-meta"><span>' + count + ' purchase' + (count === 1 ? '' : 's') + '</span>' + (changeLabel ? '<span class="reports-item-option-change' + priceChangeClass + '">' + this.escapeHtml(changeLabel) + '</span>' : '') + '</span></button>';
        return '<div class="reports-item-card' + (isSelected ? ' is-expanded' : '') + '"' + (visible ? '' : ' hidden') + '>' + option + (isSelected ? selectedHistoryPanel : '') + '</div>';
      }).join('');
      const emptyItems = !items.length
        ? '<div class="reports-empty reports-items-empty">' + (selectedAccounts.size ? 'No tracked items yet. Add <code>$Item name</code> to the end of a purchase description.' : 'Select an account to see tracked items.') + '</div>'
        : '<div class="reports-empty reports-items-filter-empty"' + (filteredItemCount ? ' hidden' : '') + '>No items match this search.</div>';
      const itemList = '<aside class="reports-items-list-panel"><div class="reports-panel-heading"><h3>Items · ' + items.length + '</h3></div><input id="reports-item-search" class="input reports-item-search" type="search" placeholder="SEARCH ITEMS" value="' + this.escapeHtml(state.itemSearch || '') + '" aria-label="Search tracked items" autocomplete="off"><div class="reports-items-list" role="listbox" aria-label="Tracked items">' + itemOptions + emptyItems + '</div><div class="reports-items-hint">Tag a purchase with <code>$Toilet paper</code>. Spaces belong to the item name; add another <code>$</code> to start another item. For multiple items, tag each split part.</div></aside>';

      const latestDate = latestVisiblePriced ? this.fmtDateInput(latestVisiblePriced.date) : '—';
      const purchases = selectedItem ? new Set(historyForView.map(entry => entry.transactionId)).size : 0;
      return {
        summary: this.reportsSummaryHtml([['Tracked items', String(items.length)], ['Purchases', String(purchases)], ['Latest purchase', latestDate]]),
        html: '<div class="reports-items-layout">' + detail + itemList + '</div>',
        chart
      };
    },
    reportsCompareSettings() {
      const state = this.reportsState();
      if (!state.compare) state.compare = { range: 3, metric: 'net', categoryIds: null, view: 'totals' };
      if (!['totals', 'categories'].includes(state.compare.view)) state.compare.view = 'totals';
      const uncategorizedId = this.reportsUncategorizedId();
      if (Array.isArray(state.compare.categoryIds)) {
        const uncategorizedIds = new Set(this.reportsCatalog().categories.filter(category => String(category.name || '').trim().toLowerCase() === 'uncategorized').map(category => String(category.id)));
        state.compare.categoryIds = [...new Set(state.compare.categoryIds.map(id => id === 'none' || uncategorizedIds.has(String(id)) ? uncategorizedId : id))];
      }
      return state.compare;
    },

    reportsCompareStartYear() {
      const state = this.reportsState(), range = this.reportsCompareSettings().range;
      if (range !== 'lifetime') return state.year - Number(range) + 1;
      this.reportsRows(state.year); // Build the account-filtered year index once for the report render.
      const years = [...this._reportsRowsCache.byYear.keys()].map(Number).filter(year => year <= state.year);
      return years.length ? Math.min(...years) : state.year;
    },

    reportsYearPicker() {
      const state = this.reportsState();
      return '<div class="month-picker"><span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.changeReportsCalendar(\'period\',' + (state.year - 1) + ',' + state.month + ')">◀</button><span class="mp-year-label">' + state.year + '</span><button class="mp-year-btn" onclick="BlackBook.changeReportsCalendar(\'period\',' + (state.year + 1) + ',' + state.month + ')">▶</button></span><button class="mp-today" onclick="BlackBook.reportsToday()">TODAY</button></div>';
    },

    reportsCompareCategories() {
      const state = this.reportsState();
      const settings = this.reportsCompareSettings();
      const startYear = this.reportsCompareStartYear();
      const accountsKey = [...this.reportsSelectedAccounts()].map(String).sort().join('|');
      const cacheKey = startYear + ':' + state.year + ':' + accountsKey + ':' + settings.metric;
      if (this._reportsCompareCategoryCache?.key === cacheKey) return this._reportsCompareCategoryCache.categories;
      const ids = new Set();
      for (let y = startYear; y <= state.year; y++) {
        this.reportsAllocationRows(this.reportsRows(y)).forEach(row => {
          if (settings.metric === 'net' || (settings.metric === 'income' ? row.amount > 0 : row.amount < 0)) ids.add(this.reportsCategoryKey(row));
        });
      }
      const categories = this.reportsCategoryItems().filter(category => ids.has(category.id)).sort((a, b) => a.name.localeCompare(b.name));
      this._reportsCompareCategoryCache = { key: cacheKey, categories };
      return categories;
    },

    reportsCompareControls() {
      const settings = this.reportsCompareSettings(), e = value => this.escapeHtml(String(value));
      const ranges = [[1, '1Y'], [3, '3Y'], [5, '5Y'], [10, '10Y'], ['lifetime', 'LIFETIME']];
      return '<div class="reports-compare-options"><div class="reports-account-filters reports-range-controls" role="group" aria-label="Comparison range">' + ranges.map(([range, label]) => '<button class="btn page-control ' + (range === settings.range ? 'btn-primary' : 'btn-secondary') + '" onclick="BlackBook.setReportsCompare(\'range\',\'' + range + '\')">' + label + '</button>').join('') + '</div><button class="btn btn-secondary page-control reports-metric-control" style="width:110px" onclick="BlackBook.cycleReportsCompareMetric()">' + settings.metric.toUpperCase() + '</button></div><div class="reports-chip-field"><div class="reports-account-filters" role="group" aria-label="Comparison categories"><button type="button" class="cat-filter-chip page-control" style="background:var(--accent);color:var(--on-fill)" aria-pressed="' + (settings.categoryIds == null || this.reportsCompareCategories().every(category => settings.categoryIds.includes(category.id))) + '" onclick="BlackBook.setReportsCompare(\'all\')">ALL</button>' + this.reportsCompareCategories().map(category => {
        const active = settings.categoryIds == null || settings.categoryIds.includes(category.id);
        return '<button class="cat-filter-chip page-control' + (active ? ' selected' : '') + '" style="--cc:' + this.categoryColor(category) + ';background:' + (active ? 'var(--cc);color:var(--on-fill)' : 'var(--block);color:var(--cc)') + '" aria-pressed="' + active + '" onclick="BlackBook.toggleReportsCompareCategory(\'' + e(category.id) + '\',event)">' + e(category.name) + '</button>';
      }).join('') + '</div></div>';
    },

    setReportsCompare(name, value) {
      if (name === 'all') this.reportsCompareSettings().categoryIds = null;
      if (name === 'range' && ([1,3,5,10].includes(Number(value)) || value === 'lifetime')) {
        const settings = this.reportsCompareSettings();
        settings.range = value === 'lifetime' ? value : Number(value);
        if (settings.range === 1) settings.view = 'totals';
      }
      this.renderPage('reports');
    },
    cycleReportsCompareMetric() {
      const settings = this.reportsCompareSettings(), metrics = ['expenses','income','net'];
      settings.metric = metrics[(metrics.indexOf(settings.metric) + 1) % metrics.length];
      this.renderPage('reports');
    },
    toggleReportsCompareCategory(id, event) {
      const settings = this.reportsCompareSettings();
      const ids = new Set(settings.categoryIds == null ? this.reportsCompareCategories().map(category => category.id) : settings.categoryIds);
      if (!event.shiftKey || event.altKey) { ids.clear(); ids.add(id); } else if (ids.has(id)) ids.delete(id); else ids.add(id);
      settings.categoryIds = [...ids]; this.renderPage('reports');
    },

    reportsCompareContent() {
      const state = this.reportsState(), settings = this.reportsCompareSettings();
      if (settings.range === 1) settings.view = 'totals';
      const matches = row => settings.categoryIds == null || settings.categoryIds.includes(this.reportsCategoryKey(row));
      const metric = rows => { const values = totals(rows); return settings.metric === 'expenses' ? -values.expenses : settings.metric === 'income' ? values.income : values.net; };
      const startYear = this.reportsCompareStartYear();
      const years = Array.from({ length: Math.max(1, state.year - startYear + 1) }, (_, index) => startYear + index);
      const [todayYear, todayMonth] = this.today().slice(0, 7).split('-').map(Number);
      const elapsedMonths = year => year < todayYear ? 12 : year === todayYear ? todayMonth : 0;
      const data = years.map(year => {
        const rows = this.reportsAllocationRows(this.reportsRows(year)).filter(matches);
        const categoryTotals = new Map();
        for (const row of rows) {
          const id = this.reportsCategoryKey(row);
          const item = categoryTotals.get(id) || { income: 0, expenses: 0, net: 0 };
          if (row.amount > 0) item.income += row.amount;
          else item.expenses -= row.amount;
          item.net += row.amount;
          categoryTotals.set(id, item);
        }
        return { year, rows, categoryTotals, totals: totals(rows), monthsElapsed: elapsedMonths(year), total: metric(rows), monthly: MONTHS.map((_, month) => {
          // Do not portray future months in the current year as zero spending.
          if (key(year, month) > this.today().slice(0,7)) return null;
          return metric(rows.filter(row => Number(row.date.slice(5,7)) === month + 1));
        }) };
      });
      const line = (label, values, color, extra = {}) => ({ label, data: values, borderColor: color, tension: .3, cubicInterpolationMode: 'monotone', ...extra });
      const metricColor = name => this.reportsColor(name === 'income' ? '--income' : name === 'expenses' ? '--expense' : '--text-muted');
      const emphasize = name => ({ borderWidth: settings.metric === name ? 3 : 1.5 });
      const monthTotals = MONTHS.map((_, month) => {
        if (key(state.year, month) > this.today().slice(0,7)) return null;
        return totals(data[0].rows.filter(row => Number(row.date.slice(5,7)) === month + 1));
      });
      const trendLabels = settings.range === 1 ? MONTHS : data.map(year => String(year.year));
      const trendValues = name => settings.range === 1
        ? monthTotals.map(value => value == null ? null : name === 'income' ? value.income : name === 'expenses' ? -value.expenses : value.net)
        : data.map(year => name === 'income' ? year.totals.income : name === 'expenses' ? -year.totals.expenses : year.totals.net);
      const datasets = ['income', 'expenses', 'net'].map(name => line(name[0].toUpperCase() + name.slice(1), trendValues(name), metricColor(name), emphasize(name)));
      const current = data[data.length - 1];
      const categoryMode = settings.view === 'categories';
      const barMode = settings.chart === 'bars';
      const barCategories = this.reportsCompareCategories().filter(category => settings.categoryIds == null || settings.categoryIds.includes(category.id));
      const categoryAmount = (year, category) => {
        const values = year.categoryTotals.get(category.id);
        if (!values) return 0;
        const amount = settings.metric === 'expenses' ? -values.expenses : settings.metric === 'income' ? values.income : values.net;
        return Math.round(amount * 100) / 100;
      };
      const categoryLineDatasets = barCategories.map(category => line(category.name, data.map(year => categoryAmount(year, category)), this.categoryColor(category), { borderWidth: 2, pointRadius: 2 }));
      const categoryBarDatasets = barCategories.map(category => ({ label: category.name, data: data.map(year => categoryAmount(year, category)), backgroundColor: this.categoryColor(category), borderWidth: 0 }));
      const totalBarDatasets = ['income', 'expenses', 'net'].map(name => ({ label: name[0].toUpperCase() + name.slice(1), data: trendValues(name), backgroundColor: metricColor(name), borderWidth: 0 }));
      const historyRows = settings.range === 1
        ? current.monthly.map((amount, month) => ({
          month,
          amount,
          rows: current.rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)
        })).filter(item => item.amount != null).map((item, index, months) => {
          const previous = index ? months[index - 1].amount : null;
          const change = previous == null ? null : item.amount - previous;
          const good = change > 0;
          const monthTotals = totals(item.rows);
          return [MONTHS_FULL[item.month], this.reportsMoney(monthTotals.income), this.reportsMoney(-monthTotals.expenses), this.reportsMoney(monthTotals.net), change == null ? 'N/A' : (good ? '↑ ' : change ? '↓ ' : '') + this.reportsMoney(Math.abs(change)) + this.reportsChangePercent(change, previous), monthTotals.count];
        }).reverse()
        : data.map((year, index) => {
          const difference = index ? year.total - data[index - 1].total : null;
          const good = difference > 0;
          const average = amount => year.monthsElapsed ? this.reportsMoney(amount / year.monthsElapsed) : 'N/A';
          return [String(year.year), this.reportsMoney(year.totals.income), this.reportsMoney(-year.totals.expenses), this.reportsMoney(year.totals.net), average(year.totals.income), average(-year.totals.expenses), average(year.totals.net), difference == null ? 'N/A' : (good ? '↑ ' : difference ? '↓ ' : '') + this.reportsMoney(Math.abs(difference)) + this.reportsChangePercent(difference, data[index - 1].total), year.totals.count];
        }).reverse();
      if (settings.range === 1 && current.monthsElapsed) {
        const average = amount => this.reportsMoney(amount / current.monthsElapsed);
        historyRows.unshift(['Avg / month', average(current.totals.income), average(-current.totals.expenses), average(current.totals.net), '—', '—']);
      }
      const rangeLabel = settings.range === 'lifetime' ? 'Lifetime' : settings.range === 1 ? '1 year' : settings.range + ' years';
      const chartTitle = categoryMode ? 'Category totals by year' : settings.range === 1 ? 'Monthly income, expenses & net' : 'Yearly income, expenses & net';
      const chartNote = '';
      const viewToggle = settings.range === 1 ? '' : '<div class="reports-view-toggle" role="group" aria-label="Compare data">' + [['totals', 'TOTALS'], ['categories', 'CATEGORIES']].map(([view, label]) => '<button type="button" class="btn page-control ' + (settings.view === view ? 'btn-primary' : 'btn-secondary') + '" aria-pressed="' + (settings.view === view) + '" onclick="BlackBook.setReportsCompareView(\'' + view + '\')">' + label + '</button>').join('') + '</div>';
      const chartTypeToggle = this.reportsChartToggleHtml(barMode ? 'vertical' : 'graph', 'toggleReportsCompareChart', barMode ? 'graph' : 'bars');
      const chartDatasets = categoryMode ? (barMode ? categoryBarDatasets : categoryLineDatasets) : (barMode ? totalBarDatasets : datasets);
      return {
        summary: this.reportsSummaryHtml([['Selected year', String(state.year)], ['Period', rangeLabel]]),
        html: this.reportsChartHtml(chartTitle, chartNote, chartTypeToggle, viewToggle) + '<section class="reports-history"><h3 class="reports-section-title">' + (settings.range === 1 ? 'Monthly totals · current month is month to date' : 'Yearly totals · current year is year to date') + '</h3>' + this.reportsTableHtml(settings.range === 1 ? ['Month', 'Income', 'Expenses', 'Net', settings.metric.toUpperCase() + ' change', 'Transactions'] : ['Year', 'Income', 'Expenses', 'Net', 'Avg income/mo', 'Avg expenses/mo', 'Avg net/mo', settings.metric.toUpperCase() + ' change', 'Transactions'], historyRows, settings.range === 1 ? 'reports-month-table reports-average-table' : '') + '</section>',
        chart: { type: barMode ? 'bar' : 'line', labels: categoryMode ? data.map(year => String(year.year)) : trendLabels, datasets: chartDatasets, groupedBars: barMode }
      };
    },

    reportsChangePercent(change, previous) {
      return previous && change ? ' · ' + (Math.abs(change) / Math.abs(previous) * 100).toFixed(1) + '%' : '';
    },

    reportsPeopleContent() {
      const state = this.reportsState();
      const rows = this.reportsAllocationRows(this.reportsRows()).filter(row => (row.personIds || []).some(id => state.personIds == null || state.personIds.includes(id)));
      const info = totals(rows);
      const monthly = MONTHS.map((_, month) => totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)));
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], ['Net', this.reportsMoney(info.net), info.net < 0 ? 'negative' : 'positive'], ['Transactions', String(info.count)]]),
        html: '<div class="reports-grid">' + this.reportsChartHtml('Person history', '') + this.reportsBreakdownHtml(rows, 'Spending categories') + '</div>' + this.reportsTransactionsHtml(rows, 'Tagged transactions'),
        chart: { type: 'line', labels: MONTHS, datasets: [{ label: 'Income', data: monthly.map(value => value.income), borderColor: this.reportsColor('--income'), tension: 0.3, cubicInterpolationMode: 'monotone' }, { label: 'Expenses', data: monthly.map(value => -value.expenses), borderColor: this.reportsColor('--expense'), tension: 0.3, cubicInterpolationMode: 'monotone' }] }
      };
    },

    reportsTransactionsHtml(rows, title, calendar = false, action = '') {
      const e = value => this.escapeHtml(String(value));
      const transactionCount = totals(rows).count;
      const heading = calendar ? e(title) + ': ' + transactionCount + ' TRANSACTIONS' : e(title) + ' · ' + transactionCount;
      const headingHtml = calendar ? '<div class="reports-history-heading"><h3 class="reports-section-title">' + heading + '</h3>' + action + '</div>' : '<h3 class="reports-section-title">' + heading + '</h3>';
      return '<section class="reports-history">' + headingHtml + '<div class="reports-table-wrap"><table class="reports-table reports-transactions"><thead><tr><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Description</th><th scope="col" class="reports-amount">Amount</th></tr></thead><tbody>' + rows.slice().sort((a, b) => b.date.localeCompare(a.date)).map(row => {
        const note = [String(row.note || row.description || ''), row.isSplitPart && row.partDescription].filter(Boolean).join(' · ');
        const taggedPeople = (row.personIds || []).map(id => this.reportsCatalog().people.find(person => person.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const missingTags = taggedPeople.filter(person => {
          const name = person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return !new RegExp('(^|[^\\p{L}\\p{N}_@])@?' + name + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(note);
        });
        const description = this.transactionDescriptionHtml(row, '');
        return '<tr><td data-label="Date">' + e(this.fmtDateInput(row.date)) + '</td><td data-label="Category">' + e(nameOf(this.reportsCategoryItems(), row.categoryId, 'None')) + '</td><td data-label="Description">' + description + missingTags.map(person => ' ' + this.personNameHtml(person)).join('') + '</td><td data-label="Amount" class="reports-amount amount-' + (row.amount < 0 ? 'negative' : 'positive') + '">' + this.reportsMoney(row.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (!rows.length ? '<div class="reports-empty">No transactions for this selection.</div>' : '') + '</section>';
    },

    toggleReportsFlowGroup() { const state = this.reportsState(); state.flowGroup = state.flowGroup === 'people' ? 'categories' : 'people'; this.renderPage('reports'); },

    setReportsFlowPeriod(period) { if (!['month', 'year'].includes(period)) return; this.reportsState().flowPeriod = period; this.renderPage('reports'); },

    toggleReportsCalendarDisplay() { const state = this.reportsState(); state.calendarDisplay = state.calendarDisplay === 'totals' ? 'transactions' : 'totals'; this.renderPage('reports'); },

    reportsMoneyFlowContent() {
      const state = this.reportsState();
      const flowPeriod = state.flowPeriod === 'year' ? 'year' : 'month';
      const sourceRows = flowPeriod === 'year' ? this.reportsRows(state.year) : this.reportsMonthRows(state.year, state.month);
      const rows = this.reportsAllocationRows(sourceRows), info = totals(rows);
      const peopleMode = state.flowGroup === 'people';
      const groups = peopleMode ? [...this.reportsCatalog().people.map(person => ({ ...person, color: this.personColor(person) })), { id: 'none', name: 'No person', color: this.reportsColor('--text-dim') }] : this.reportsCategoryItems().map(category => ({ ...category, color: this.categoryColor(category) }));
      // Shared-person amounts are divided evenly so the flow still balances.
      const share = (row, id) => {
        if (!peopleMode) return this.reportsCategoryKey(row) === id ? 1 : 0;
        const ids = [...new Set(row.personIds || [])];
        return ids.length ? (ids.includes(id) ? 1 / ids.length : 0) : id === 'none' ? 1 : 0;
      };
      const group = positive => groups.map(item => {
        const entries = rows.filter(row => (row.amount > 0) === positive && share(row, item.id));
        return { ...item, amount: entries.reduce((value,row) => value + Math.abs(row.amount) * share(row,item.id), 0), count: new Set(entries.map(row => row.transactionId || row.id)).size };
      }).filter(item => item.amount > 0).sort((a,b) => peopleMode ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : b.amount - a.amount);
      const incoming = group(true), outgoing = group(false);
      if (info.net < 0) incoming.push({ name: 'From balance', amount: -info.net, color: this.reportsColor('--text-dim') });
      if (info.net > 0) outgoing.push({ name: 'Money left', amount: info.net, color: this.reportsColor('--income') });
      const total = Math.max(info.income, info.expenses);
      const e = value => this.escapeHtml(String(value));
      const height = Math.max(360, Math.max(incoming.length, outgoing.length) * 54 + 50);
      const gap = 16, available = height - 60 - gap * (Math.max(incoming.length, outgoing.length) - 1);
      const scale = total ? available / total : 0;
      const centerHeight = total * scale, centerY = (height - centerHeight) / 2;
      let svg = '';
      const side = (items, left) => {
        let y = (height - (centerHeight + gap * (items.length - 1))) / 2, middle = centerY;
        for (const item of items) {
          const thickness = item.amount * scale;
          const x1 = left ? 190 : 510, x2 = left ? 490 : 810;
          const a = left ? y : middle, b = left ? middle : y;
          const path = 'M' + x1 + ',' + a + ' C' + (x1 + 100) + ',' + a + ' ' + (x2 - 100) + ',' + b + ' ' + x2 + ',' + b + ' L' + x2 + ',' + (b + thickness) + ' C' + (x2 - 100) + ',' + (b + thickness) + ' ' + (x1 + 100) + ',' + (a + thickness) + ' ' + x1 + ',' + (a + thickness) + ' Z';
          const label = item.name + ': ' + this.reportsMoney(item.amount) + ' · ' + (item.amount / total * 100).toFixed(1) + '%';
          svg += '<g class="reports-flow-item" data-report-hover="' + e(label) + '"><path d="' + path + '" fill="' + e(item.color) + '" class="reports-flow-band"/><rect x="' + (left ? 178 : 810) + '" y="' + y + '" width="12" height="' + thickness + '" fill="' + e(item.color) + '"/><text x="' + (left ? 166 : 834) + '" y="' + (y + thickness / 2 + 4) + '" text-anchor="' + (left ? 'end' : 'start') + '">' + e(item.name) + '</text></g>';
          y += thickness + gap; middle += thickness;
        }
      };
      if (total) { side(incoming, true); side(outgoing, false); }
      svg += '<rect x="490" y="' + centerY + '" width="20" height="' + centerHeight + '" fill="' + e(this.reportsColor('--accent')) + '"/>';
      const flowList = (items, className) => items.map(item => '<div class="reports-mobile-flow-item ' + className + '"><div class="reports-mobile-flow-name"><i style="--flow-color:' + e(item.color || this.reportsColor('--text-dim')) + '"></i><span>' + e(item.name) + '</span></div><div class="reports-mobile-flow-value"><strong>' + e(this.reportsMoney(item.amount)) + '</strong><small>' + (total ? (item.amount / total * 100).toFixed(1) + '% · ' : '') + (item.count == null ? '' : item.count + ' TX') + '</small></div></div>').join('');
      const mobileFlowHtml = '<div class="reports-mobile-flow"><div class="reports-mobile-flow-totals"><div class="reports-mobile-flow-total"><span>INCOME</span><i><b class="income" style="width:' + (total ? info.income / total * 100 : 0) + '%"></b></i><strong>' + e(this.reportsMoney(info.income)) + '</strong></div><div class="reports-mobile-flow-total"><span>EXPENSES</span><i><b class="expense" style="width:' + (total ? info.expenses / total * 100 : 0) + '%"></b></i><strong>' + e(this.reportsMoney(-info.expenses)) + '</strong></div></div><section><h4>INCOME SOURCES</h4>' + (flowList(incoming, 'income') || '<div class="reports-empty">No income for this period.</div>') + '</section><section><h4>OUTFLOWS</h4>' + (flowList(outgoing, 'expense') || '<div class="reports-empty">No expenses for this period.</div>') + '</section></div>';
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], [info.net < 0 ? 'From balance' : 'Money left', this.reportsMoney(Math.abs(info.net)), info.net < 0 ? 'negative' : 'positive'], ['Transactions', String(info.count)]]),
        html: '<div class="reports-money-grid"><section class="reports-chart-panel"><div class="reports-panel-heading"><div class="reports-moneyflow-controls"><button class="btn btn-secondary page-control" style="width:110px" onclick="BlackBook.toggleReportsFlowGroup()">' + (peopleMode ? 'PEOPLE' : 'CATEGORIES') + '</button><div class="reports-calendar-mode" role="group" aria-label="Money Flow period">' + ['month', 'year'].map(mode => '<button type="button" class="btn page-control ' + (flowPeriod === mode ? 'btn-primary' : 'btn-secondary') + '" aria-pressed="' + (flowPeriod === mode) + '" onclick="BlackBook.setReportsFlowPeriod(\'' + mode + '\')">' + mode.toUpperCase() + '</button>').join('') + '</div></div></div>' + (total ? '<div class="reports-flow-wrap"><svg class="reports-flow" viewBox="0 0 1000 ' + height + '" role="img" aria-label="Income sources join and split into expenses and money left. Exact amounts and percentages are listed beside the chart.">' + svg + '</svg></div>' : '<div class="reports-empty">No activity for this period.</div>') + '</section><section class="reports-history"><h3 class="reports-section-title">Flow breakdown</h3>' + mobileFlowHtml + this.reportsTableHtml([peopleMode ? 'Person' : 'Category', 'In', 'In %', 'Out', 'Out %', 'TX'], [...incoming.map(item => [item.name, this.reportsMoney(item.amount), total ? (item.amount / total * 100).toFixed(1) + '%' : 'N/A', '—', '—', item.count == null ? '—' : item.count]), ...outgoing.map(item => [item.name, '—', '—', this.reportsMoney(item.amount), total ? (item.amount / total * 100).toFixed(1) + '%' : 'N/A', item.count == null ? '—' : item.count])]) + (peopleMode ? '<div class="reports-panel-note">Shared-person amounts are divided evenly; percentages show each share of total flow, and counts include each tagged transaction.</div>' : '') + '</section></div>',
        chart: null
      };
    },

    reportsCalendarContent() {
      const state = this.reportsState();
      state.calendarMode = state.calendarMode || 'month';
      state.calendarDisplay = state.calendarDisplay || 'totals';
      const e = value => this.escapeHtml(String(value));
      const buildMonthGrid = (year, month) => {
        const monthRows = this.reportsMonthRows(year, month);
        const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
        const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const slots = Math.ceil((offset + days) / 7) * 7;
        let grid = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => '<div class="reports-calendar-weekday">' + day + '</div>').join('');
        for (let index = 0; index < slots; index++) {
          const day = index - offset + 1;
          if (day < 1 || day > days) { grid += '<div class="reports-calendar-day outside" aria-hidden="true"></div>'; continue; }
          const date = key(year, month) + '-' + String(day).padStart(2, '0');
          const entries = monthRows.filter(row => row.date === date);
          const daily = totals(entries);
          const calendarTotal = (value, amountClass) => value === 0 ? '' : '<span class="reports-calendar-total ' + amountClass + '"><span class="reports-calendar-full">' + this.fmtNumber(value) + '</span></span>';
          const cellContents = state.calendarDisplay === 'totals'
            ? '<span class="reports-calendar-totals">' + calendarTotal(daily.income, 'amount-positive') + calendarTotal(daily.expenses, 'amount-negative') + '</span>'
            : entries.map(row => '<span class="reports-calendar-entry ' + (row.amount < 0 ? 'expense' : 'income') + '" title="' + e(row.description + ' · ' + this.reportsMoney(row.amount)) + '"><span class="reports-calendar-name">' + e(row.description) + '</span><span class="reports-calendar-amount amount-' + (row.amount < 0 ? 'negative' : 'positive') + '">' + (row.amount > 0 ? '+' : '−') + '<span class="reports-calendar-full">' + this.fmtNumber(Math.abs(row.amount)) + '</span></span></span>').join('');
          grid += '<button type="button" class="reports-calendar-day' + (date === this.today() ? ' today' : '') + (state.day === date ? ' selected' : '') + '" aria-pressed="' + (state.day === date) + '" aria-label="' + e(this.fmtDateInput(date)) + ', ' + entries.length + ' transactions" onclick="BlackBook.setReportsFilter(\'day\',\'' + date + '\')"><span class="reports-day-number">' + day + '</span>' + cellContents + '</button>';
        }
        return '<div class="reports-calendar-grid" style="--calendar-weeks:' + Math.ceil(slots / 7) + '">' + grid + '</div>';
      };
      const rows = state.calendarMode === 'year' ? this.reportsRows(state.year) : this.reportsMonthRows(state.year, state.month);
      const info = totals(rows);
      const weekly = state.calendarMode === 'month' ? (() => {
        const offset = (new Date(Date.UTC(state.year, state.month, 1)).getUTCDay() + 6) % 7;
        const days = new Date(Date.UTC(state.year, state.month + 1, 0)).getUTCDate();
        const weeks = Math.ceil((offset + days) / 7);
        const weekTotals = Array.from({ length: weeks }, (_, week) => {
          const weekRows = rows.filter(row => Math.floor((Number(row.date.slice(8, 10)) - 1 + offset) / 7) === week);
          return totals(weekRows);
        });
        const maxIncome = Math.max(1, ...weekTotals.map(amount => amount.income));
        const maxExpense = Math.max(1, ...weekTotals.map(amount => amount.expenses));
        return '<div class="reports-calendar-weekly"><div class="reports-calendar-weekly-title">WEEKLY TOTALS</div><div class="reports-calendar-weekly-heading"><span></span><div class="reports-calendar-weekly-chart"><span>INCOME</span><span></span><span>EXPENSE</span></div></div>' + weekTotals.map((amount, week) => {
          const incomeWidth = amount.income ? Math.max(2, amount.income / maxIncome * 100) : 0;
          const expenseWidth = amount.expenses ? Math.max(2, amount.expenses / maxExpense * 100) : 0;
          return '<div class="reports-calendar-weekly-row"><span class="reports-calendar-week-label">WEEK ' + (week + 1) + '</span><div class="reports-calendar-weekly-chart"><div class="reports-calendar-weekly-side income"><span class="reports-calendar-weekly-amount amount-positive">' + this.fmtNumber(amount.income) + '</span><span class="reports-calendar-weekly-track"><span class="reports-calendar-weekly-bar amount-positive" style="width:' + incomeWidth + '%"></span></span></div><span class="reports-calendar-weekly-axis"></span><div class="reports-calendar-weekly-side expense"><span class="reports-calendar-weekly-track"><span class="reports-calendar-weekly-bar amount-negative" style="width:' + expenseWidth + '%"></span></span><span class="reports-calendar-weekly-amount amount-negative">' + this.fmtNumber(amount.expenses) + '</span></div></div></div>';
        }).join('') + '</div>';
      })() : '';
      const monthCalendar = buildMonthGrid(state.year, state.month);
      const yearCalendar = '<div class="reports-calendar-year-grid">' + MONTHS.map((month, index) => {
        const monthInfo = totals(this.reportsMonthRows(state.year, index));
        const amount = (value, className) => '<span class="reports-calendar-month-total ' + className + '">' + (value === 0 ? '' : '<span class="reports-calendar-month-full">' + this.fmtNumber(value) + '</span>') + '</span>';
        return '<button type="button" class="reports-calendar-month' + (state.calendarYearMonth === index ? ' selected' : '') + '" aria-label="' + MONTHS_FULL[index] + ' ' + state.year + ', income ' + this.fmtNumber(monthInfo.income) + ', expenses ' + this.fmtNumber(monthInfo.expenses) + '" onclick="BlackBook.toggleReportsYearMonthFilter(' + index + ')"><span class="reports-calendar-month-title">' + MONTHS_FULL[index].toUpperCase() + '</span><span class="reports-calendar-month-totals">' + amount(monthInfo.income, 'amount-positive') + amount(monthInfo.expenses, 'amount-negative') + '</span></button>';
      }).join('') + '</div>';
      const calendarControls = '<div class="reports-calendar-controls"><div class="reports-calendar-mode" role="group" aria-label="Calendar period">' + ['month', 'year'].map(mode => '<button type="button" class="btn page-control ' + (state.calendarMode === mode ? 'btn-primary' : 'btn-secondary') + '" aria-pressed="' + (state.calendarMode === mode) + '" onclick="BlackBook.setReportsCalendarMode(\'' + mode + '\')">' + mode.toUpperCase() + '</button>').join('') + '</div>' + (state.calendarMode === 'month' ? '<button type="button" class="btn btn-secondary page-control" aria-pressed="' + (state.calendarDisplay === 'totals') + '" onclick="BlackBook.toggleReportsCalendarDisplay()">' + (state.calendarDisplay === 'totals' ? 'DAILY TOTALS' : 'TRANSACTIONS') + '</button>' : '') + '</div>';
      const transactionRows = state.day ? rows.filter(row => row.date === state.day) : (state.calendarMode === 'year' && Number.isInteger(state.calendarYearMonth) ? this.reportsMonthRows(state.year, state.calendarYearMonth) : rows);
      const transactionTitle = state.day ? this.fmtDateInput(state.day) : (state.calendarMode === 'year' ? (Number.isInteger(state.calendarYearMonth) ? MONTHS_FULL[state.calendarYearMonth].toUpperCase() + ' ' + state.year : 'THIS YEAR') : 'THIS MONTH');
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], ['Net', this.reportsMoney(info.net), info.net < 0 ? 'negative' : 'positive'], ['Active days', String(new Set(rows.map(row => row.date)).size)]]),
        html: '<div class="reports-calendar-layout"><div class="reports-calendar-main">' + calendarControls + (state.calendarMode === 'year' ? yearCalendar : monthCalendar) + '</div><div class="reports-calendar-detail">' + weekly + this.reportsTransactionsHtml(transactionRows, transactionTitle, true) + '</div></div>',
        chart: null
      };
    },

    setReportsCalendarMode(mode, month) {
      if (!['month', 'year'].includes(mode)) return;
      const state = this.reportsState();
      if (state.calendarMode !== mode) state.calendarYearMonth = null;
      state.calendarMode = mode;
      if (Number.isInteger(month) && month >= 0 && month <= 11) { state.month = month; state.day = null; }
      this.renderPage('reports');
    },

    reportsColor(token) { return getComputedStyle(document.documentElement).getPropertyValue(token).trim(); },

    renderReportsChart(spec) {
      const canvas = document.getElementById('reports-chart');
      if (!spec || !canvas || !window.Chart) return;
      if (spec.minWidth) {
        const stage = document.createElement('div');
        stage.className = 'reports-chart-stage';
        stage.style.minWidth = spec.minWidth + 'px';
        canvas.parentNode.classList.add('reports-chart-scroll');
        canvas.parentNode.append(stage);
        stage.append(canvas);
      }
      const options = this.lineChartOptions({ autoSkip: true, maxTicksLimit: 12 });
      for (const axis of Object.values(options.scales)) {
        axis.grid.color = this.chartGridColor(this.reportsColor('--border'));
        axis.ticks.color = this.reportsColor('--text-dim');
        axis.ticks.font.family = "'Hack', 'Courier New', monospace";
      }
      if (spec.fitYAxis) {
        const values = spec.datasets.flatMap(dataset => (dataset.data || []).map(Number)).filter(Number.isFinite);
        if (values.length) {
          let dataMin = Infinity, dataMax = -Infinity;
          for (const value of values) { if (value < dataMin) dataMin = value; if (value > dataMax) dataMax = value; }
          const spread = dataMax - dataMin;
          const padding = spread > 0 ? spread * 0.08 : Math.max(Math.abs(dataMax) * 0.05, 1);
          const rawMin = spec.percent ? Math.min(0, dataMin - padding) : dataMin - padding;
          const rawMax = spec.percent ? Math.max(0, dataMax + padding) : dataMax + padding;
          const percentSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
          const targetStep = (rawMax - rawMin) / 6;
          const step = spec.percent
            ? percentSteps.find(value => value >= targetStep) || Math.ceil(targetStep / 1000) * 1000
            : Math.max(10, Math.ceil(targetStep / 10) * 10);
          const axisMin = Math.floor(rawMin / step) * step;
          const axisMax = Math.ceil(rawMax / step) * step;
          options.scales.y.beginAtZero = false;
          options.scales.y.min = axisMin;
          options.scales.y.max = axisMax;
          options.scales.y.ticks.stepSize = step;
          options.scales.y.ticks.precision = spec.percent && step < 1 ? 1 : 0;
          options.scales.y.ticks.maxTicksLimit = Math.min(12, Math.ceil((axisMax - axisMin) / step) + 1);
        } else options.scales.y.beginAtZero = true;
      } else options.scales.y.beginAtZero = true;
      if (spec.percent) options.scales.y.ticks.callback = value => Number(value).toFixed(options.scales.y.ticks.precision || 0) + '%';
      else if (spec.currency) options.scales.y.ticks.callback = value => this.fmtNumber(spec.fitYAxis ? Math.round(Number(value)) : value);
      if (spec.type === 'bar') {
        options.scales.x.ticks.autoSkip = true;
        options.scales.x.ticks.maxTicksLimit = Math.min(12, spec.labels.length);
        options.scales.x.ticks.maxRotation = 35;
        if (spec.groupedBars) {
          options.datasets = options.datasets || {};
          options.datasets.bar = { ...(options.datasets.bar || {}), categoryPercentage: 0.76, barPercentage: 0.98 };
        }
        if (spec.reverseY) options.scales.y.reverse = true;
      }
      for (const dataset of spec.datasets) {
        if (spec.type === 'line') { dataset.pointBackgroundColor = dataset.borderColor; if (dataset.pointRadius == null) dataset.pointRadius = 3; }
      }
      options.plugins.tooltip.external = ({ chart, tooltip }) => this.showDonutTooltip(chart, tooltip,
        tooltip.dataPoints && tooltip.dataPoints.length ? [tooltip.title && tooltip.title[0], ...tooltip.dataPoints.map(point => { const amount = point.dataset.amounts ? point.dataset.amounts[point.dataIndex] : point.parsed.y; const formatted = spec.percent ? Number(amount).toFixed(1) + '%' : spec.currency ? this.fmtAmount(amount, spec.currency) + (spec.unitLabel ? ' / ' + spec.unitLabel : '') : this.reportsMoney(amount); return point.dataset.label + ': ' + formatted; })].filter(Boolean).join('\n') : '');
      const connectors = {
        id: 'reports-waterfall-connectors',
        afterDatasetsDraw(chart) {
          if (!spec.steps) return;
          const bars = chart.getDatasetMeta(0).data, context = chart.ctx;
          context.save(); context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(); context.setLineDash([3, 3]);
          for (let index = 0; index < bars.length - 1; index++) {
            const y = chart.scales.y.getPixelForValue(spec.steps[index].end);
            context.beginPath(); context.moveTo(bars[index].x + bars[index].width / 2, y); context.lineTo(bars[index + 1].x - bars[index + 1].width / 2, y); context.stroke();
          }
          context.restore();
        }
      };
      this._reportsCharts = [new Chart(canvas, { type: spec.type, data: { labels: spec.labels, datasets: spec.datasets }, options, plugins: spec.steps ? [connectors] : [] })];
    },

    setReportsView(view) {
      if (!VIEWS.some(([id]) => id === view)) return;
      this.reportsState().view = view;
      this.renderPage('reports');
      const tab = document.getElementById('reports-view-' + view);
      if (window.matchMedia('(max-width: 500px)').matches) {
        document.querySelector('.mobile-action-bar[data-page="reports"] .mobile-action-add')?.focus();
      } else if (tab) {
        tab.focus();
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },

    cycleReportsView(direction = 1) {
      const current = VIEWS.findIndex(([id]) => id === this.reportsState().view);
      const next = (current + direction + VIEWS.length) % VIEWS.length;
      this.setReportsView(VIEWS[next][0]);
    },

    reportsTabKey(event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const current = VIEWS.findIndex(([id]) => id === this.reportsState().view);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + VIEWS.length) % VIEWS.length;
      this.setReportsView(VIEWS[next][0]);
    },

    setReportsFilter(name, value) {
      const state = this.reportsState(), preview = this.reportsCatalog();
      if (name === 'category' && (['all', 'none'].includes(value) || preview.categories.some(item => String(item.id) === String(value)))) state.category = (preview.categories.find(item => String(item.id) === String(value)) || { id: value }).id;
      else if (name === 'person' && (value === 'all' || preview.people.some(item => item.id === value))) state.person = value;
      else if (name === 'against' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) state.against = value;
      else if (name === 'day' && (value === null || /^\d{4}-\d{2}-\d{2}$/.test(value))) state.day = value === state.day ? null : value;
      else return;
      this.renderPage('reports');
      const field = document.getElementById('reports-' + name);
      if (field) (field.parentElement.querySelector('.custom-select-btn') || field).focus();
      if (name === 'day' && value) document.querySelector('#page-reports .reports-calendar-detail').scrollIntoView({ block: 'nearest' });
    },

    toggleReportsAccount(id, event) {
      if (!this.reportsCatalog().accounts.some(account => account.id === id)) return;
      const selected = this.reportsSelectedAccounts();
      if (event && event.altKey) { selected.clear(); selected.add(id); }
      else if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      this.reportsState().accountIds = [...selected];
      this.renderPage('reports');
      const card = [...document.querySelectorAll('#page-reports .reports-account-chip')].find(button => button.textContent === nameOf(this.reportsCatalog().accounts, id, ''));
      if (card) card.focus();
    },

    shiftReportsPeriod(direction) {
      const state = this.reportsState();
      if (['items', 'forecast'].includes(state.view)) return;
      const annual = ['categories', 'people', 'compare'].includes(state.view);
      const date = new Date(Date.UTC(state.year + (annual ? direction : 0), state.month + (annual ? 0 : direction), 1));
      if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2099) return;
      state.year = date.getUTCFullYear(); state.month = date.getUTCMonth(); state.day = null;
      this.renderPage('reports');
    },

    reportsToday() {
      const [year, month] = this.today().split('-').map(Number);
      Object.assign(this.reportsState(), { year, month: month - 1, day: null });
      this.renderPage('reports');
    }
  });
}());
