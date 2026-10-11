/* Read-only reports for the active profile. */
(function () {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const VIEWS = [['categories', 'Categories'], ['compare', 'Compare'], ['people', 'People'], ['moneyflow', 'Money Flow'], ['calendar', 'Calendar']];
  const sum = rows => Math.round(rows.reduce((value, row) => value + row.amount, 0) * 100) / 100;
  const totals = rows => ({ income: sum(rows.filter(row => row.amount > 0)), expenses: -sum(rows.filter(row => row.amount < 0)), net: sum(rows), count: rows.length });
  const key = (year, month) => year + '-' + String(month + 1).padStart(2, '0');
  const nameOf = (items, id, fallback) => (items.find(item => item.id === id) || {}).name || fallback;

  Object.assign(window.BlackBook, {
    reportsState() {
      if (!this._reportsState) {
        const [year, month] = this.today().split('-').map(Number);
        const previous = new Date(Date.UTC(year, month - 2, 1));
        this._reportsState = { view: 'categories', year, month: month - 1, accountIds: null, category: 'all', person: 'all', personIds: null, against: key(previous.getUTCFullYear(), previous.getUTCMonth()), day: null, calendarMode: 'month', calendarYearMonth: null, calendarDisplay: 'totals' };
      }
      return this._reportsState;
    },

    reportsCatalog() { return { accounts: this.data.accounts || [], categories: this.data.categories || [], people: [...(this.data.people || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) }; },
    reportsMoney(amount) { return this.fmtNumber(amount) + ' ' + this.baseCurrency(); },

    reportsSelectedAccounts() {
      const ids = this.reportsState().accountIds;
      return new Set(ids == null ? this.reportsCatalog().accounts.map(account => account.id) : ids);
    },

    reportsRows(year) {
      const state = this.reportsState();
      const selected = this.reportsSelectedAccounts();
      return (this.data.transactions || []).filter(tx => !this.isTransfer(tx) && selected.has(tx.accountId) && String(tx.date || '').startsWith(String(year == null ? state.year : year) + '-')).map(tx => ({ ...tx, description: tx.note || '', personId: (tx.personIds || [])[0], amount: Math.abs(this.transactionToBase(tx)) * (tx.type === 'income' ? 1 : -1) }));
    },

    reportsMonthRows(year, month) { return this.reportsRows(year).filter(row => row.date.startsWith(key(year, month))); },

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
      this.destroyReportsCharts();
      const state = this.reportsState();
      const sample = this.reportsCatalog();
      const e = value => this.escapeHtml(String(value));
      const field = (label, id, options, selected) => '<label class="reports-field" for="' + id + '"><span class="sr-only">' + e(label) + '</span><select class="input" id="' + id + '" aria-label="' + e(label) + '" onchange="BlackBook.setReportsFilter(\'' + id.replace('reports-', '') + '\',this.value)">' + options.map(item => '<option value="' + e(item.id) + '"' + (item.id === selected ? ' selected' : '') + '>' + e(item.name) + '</option>').join('') + '</select></label>';
      const calendar = ['categories', 'compare', 'people'].includes(state.view) ? this.reportsYearPicker() : this.reportsCalendarPicker(state.year, state.month);
      let controls = '';
      const selected = this.reportsSelectedAccounts();
      controls += '<div class="reports-account-picker"><div class="reports-account-filters" role="group" aria-label="Accounts">' + sample.accounts.map(account => '<button type="button" class="cat-filter-chip page-control reports-account-chip' + (selected.has(account.id) ? ' selected' : '') + '" style="--cc:' + this.accountColor(account) + ';' + (selected.has(account.id) ? 'background:var(--cc);color:var(--on-fill);' : 'background:var(--block);color:var(--cc);') + '" aria-pressed="' + selected.has(account.id) + '" title="Click: toggle · Shift-click: keep multiple selected · Alt-click: isolate" onclick="BlackBook.toggleReportsAccount(\'' + account.id + '\',event)">' + e(account.name) + '</button>').join('') + '</div></div>';
      if (state.view === 'categories') controls += field('Category', 'reports-category', [{ id: 'all', name: 'All categories' }, ...[...sample.categories, { id: 'none', name: 'Uncategorized' }].sort((a,b) => a.name.localeCompare(b.name))], state.category);
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
        if (this.reportsCompareSettings().range > 1) root.querySelectorAll('.reports-history tbody tr').forEach(row => {
          const yearCell = row.querySelector('td');
          const year = Number(yearCell.textContent);
          yearCell.style.color = year === state.year ? this.reportsColor('--accent') : this.colorForName(String(year));
          yearCell.style.fontWeight = '700';
          yearCell.insertAdjacentHTML('afterbegin', '<span class="reports-year-dot" aria-hidden="true"></span>');
        });
      }
      const calendarPicker = root.querySelector('.month-picker');
      calendarPicker.addEventListener('wheel', event => {
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
      calendarPicker.insertAdjacentElement('afterend', summary);
      summary.insertAdjacentElement('afterend', separator);
      this.renderReportsChart(content.chart);
      this.renderReportsShareDonut();
      this.bindReportsChartPopups(root);
      if (!selected.size) {
        root.querySelectorAll('.reports-stat-value').forEach(value => { value.textContent = 'No data'; value.classList.remove('amount-positive', 'amount-negative'); });
        root.querySelectorAll('.reports-chart-wrap').forEach(wrap => wrap.insertAdjacentHTML('beforeend', '<div class="reports-no-data" role="status">No data · Select an account</div>'));
        root.querySelectorAll('.reports-empty').forEach(empty => { empty.textContent = 'No data · Select an account'; });
        root.querySelectorAll('.reports-table').forEach(table => { table.querySelector('tbody').innerHTML = '<tr><td colspan="' + table.querySelectorAll('thead th').length + '" class="reports-empty">No data · Select an account</td></tr>'; });
      }
      root.querySelector('.reports-tabs [aria-selected="true"]').scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
        let content = this.escapeHtml(value);
        if (/^[+-]?[\d,]+\.\d{2} [A-Z]{3}$/.test(value)) {
          const amount = parseFloat(value.replaceAll(',', ''));
          const compact = Math.abs(amount) < 1000 ? value : (value.startsWith('+') ? '+' : '') + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount).toLowerCase() + ' ' + this.baseCurrency();
          content = '<span class="reports-stat-full">' + content + '</span><span class="reports-stat-compact" aria-hidden="true">' + this.escapeHtml(compact) + '</span>';
        }
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

    reportsChartHtml(title, note, action = '') {
      return '<section class="reports-chart-panel"><div class="reports-panel-heading"><h3>' + this.escapeHtml(title) + '</h3><span class="reports-panel-note">' + this.escapeHtml(note) + '</span>' + action + '</div><div class="reports-chart-wrap"><canvas id="reports-chart" role="img" aria-label="' + this.escapeHtml(title) + '; values are also listed in the table below."></canvas></div></section>';
    },

    reportsTableHtml(headers, rows, className = '') {
      const separatorIndex = headers.includes('In %') ? rows.findIndex((row, index) => index > 0 && row[3] !== '—') : -1;
      return '<div class="reports-table-wrap"><table class="reports-table' + (className ? ' ' + className : '') + '"><thead><tr>' + headers.map((label, index) => '<th scope="col"' + (index ? ' class="reports-amount"' : '') + '>' + this.escapeHtml(label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row, index) => '<tr' + (index === separatorIndex ? ' class="reports-flow-out-separator"' : '') + '>' + row.map((value, index) => '<td' + (index ? ' class="reports-amount"' : '') + '>' + (/^[↑↓]/.test(String(value)) ? '<span class="amount-' + (String(value).startsWith('↑') ? 'positive' : 'negative') + '">' + this.escapeHtml(String(value)) + '</span>' : this.escapeHtml(String(value))) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    },

    reportsBreakdownHtml(rows, title, allRows = rows, useHighlightColor = false) {
      const categories = [...this.reportsCatalog().categories, { id: 'none', name: 'Uncategorized', color: this.reportsColor('--text-dim') }];
      const spend = categories.map(category => ({ ...category, amount: -sum(rows.filter(row => row.amount < 0 && (row.categoryId || 'none') === category.id)) })).filter(category => category.amount > 0).sort((a, b) => b.amount - a.amount);
      const total = -sum(allRows.filter(row => row.amount < 0));
      const donut = this.reportsState().shareChart === 'donut';
      this._reportsShareData = { items: spend.map(category => ({ ...category, color: this.categoryColor(category) })), total };
      return '<section class="reports-side-panel"><div class="reports-panel-heading"><h3 class="reports-section-title">' + this.escapeHtml(title) + '</h3>' + this.reportsChartToggleHtml(donut ? 'donut' : 'bars', 'toggleReportsShareChart', donut ? 'bars' : 'donut') + '</div>' + (donut ? '<div class="reports-share-donut"></div>' : '<div class="reports-breakdown">' + spend.map(category => {
        const percent = total ? category.amount / total * 100 : 0;
        const hoverLabel = category.name + ': ' + this.reportsMoney(category.amount) + ' · ' + percent.toFixed(1) + '%';
        return '<div class="reports-breakdown-row" data-report-hover="' + this.escapeHtml(hoverLabel) + '"><div class="reports-breakdown-head"><span>' + this.escapeHtml(category.name) + '</span><span>' + this.reportsMoney(category.amount) + ' · ' + percent.toFixed(1) + '%</span></div><div class="reports-bar-track"><div class="reports-bar-fill" style="width:' + percent + '%;background:' + (useHighlightColor ? 'var(--accent)' : this.categoryColor(category)) + '"></div></div></div>';
      }).join('') + (spend.length ? '' : '<div class="reports-empty">No expenses in this selection.</div>') + '</div>') + '</section>';
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
        const displayFractions = this.donutDisplayValues(segments.map(item => item.amount), 4);
        let rotation = -Math.PI / 2, bestScore = Infinity;
        for (let candidate = 0; candidate < Math.PI * 2; candidate += Math.PI / 360) {
          let left = 0, right = 0, angle = candidate;
          for (const [index] of segments.entries()) { const middle = angle + displayFractions[index] * Math.PI; Math.cos(middle) >= 0 ? right++ : left++; angle += displayFractions[index] * Math.PI * 2; }
          const score = Math.abs(left - right) * 100 + Math.max(left, right);
          if (score < bestScore) { bestScore = score; rotation = candidate; }
        }
        let angle = rotation;
        for (const [index, item] of segments.entries()) { item.start = angle; angle += displayFractions[index] * Math.PI * 2; item.end = angle; item.middle = (item.start + item.end) / 2; item.side = Math.cos(item.middle) >= 0 ? 1 : -1; }
        const sides = [-1, 1].map(side => segments.filter(item => item.side === side).sort((a, b) => Math.sin(a.middle) - Math.sin(b.middle)));
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
            const [startX, startY] = point(radius - .5, item.middle);
            const exitX = startX + sideDirection * 9;
            leaders += '<polyline class="reports-share-leader" data-report-leader="' + item.donutIndex + '" points="' + startX + ',' + startY + ' ' + exitX + ',' + startY + ' ' + bendX + ',' + labelBaseline + ' ' + endX + ',' + labelBaseline + '" stroke="' + e(item.color) + '"/>';
            labelsSvg += '<g><title>' + e(item.name + ': ' + label) + '</title><text x="' + textX + '" y="' + labelBaseline + '" text-anchor="' + align + '" fill="' + e(item.color) + '" font-size="' + (dense ? '9.5' : '11') + '">' + e(nameText) + '</text><text x="' + textX + '" y="' + (labelY + (dense ? 7 : 8)) + '" text-anchor="' + align + '" fill="' + e(this.reportsColor('--text-dim')) + '" font-size="' + (dense ? '8' : '10') + '">' + e(detailText) + '</text></g>';
          }
        }
        host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="100%" role="img" aria-label="Category spending shares" style="font-family:inherit">' + svg + leaders + labelsSvg + '</svg>';
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
      if (state.view === 'compare') return this.reportsCompareContent();
      if (state.view === 'people') return this.reportsPeopleContent();
      if (state.view === 'moneyflow') return this.reportsMoneyFlowContent();
      if (state.view === 'calendar') return this.reportsCalendarContent();
      const rows = this.reportsRows().filter(row => state.category === 'all' || (row.categoryId || 'none') === state.category);
      const info = totals(rows);
      const expenses = MONTHS.map((_, month) => -totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)).expenses);
      const peak = expenses.indexOf(Math.min(...expenses));
      const category = nameOf(this.reportsCatalog().categories, state.category, state.category === 'none' ? 'Uncategorized' : 'All expenses');
      return {
        summary: this.reportsSummaryHtml([['Year expenses', this.reportsMoney(info.expenses), 'negative'], ['Monthly average', this.reportsMoney(info.expenses / 12)], ['Transactions', String(info.count)]]),
        html: '<div class="reports-grid">' + this.reportsChartHtml('Income vs expenses', category + ' · ' + state.year + ' · ' + this.baseCurrency()) + this.reportsBreakdownHtml(rows, 'Category share', this.reportsRows(), true) + '</div><section class="reports-history"><h3 class="reports-section-title">Monthly breakdown</h3>' + this.reportsTableHtml(['Month', 'Income', 'Expenses', 'Net', 'Change', 'Transactions'], MONTHS.map((month, index) => {
          const monthly = totals(rows.filter(row => Number(row.date.slice(5, 7)) === index + 1));
          const previous = totals(this.reportsMonthRows(index ? state.year : state.year - 1, index ? index - 1 : 11).filter(row => state.category === 'all' || (row.categoryId || 'none') === state.category));
          const change = monthly.count ? monthly.net - previous.net : 0;
          return [month + ' ' + state.year, this.reportsMoney(monthly.income), this.reportsMoney(-monthly.expenses), this.reportsMoney(monthly.net), (change > 0 ? '↑ ' : change < 0 ? '↓ ' : '') + this.reportsMoney(Math.abs(change)) + this.reportsChangePercent(change, previous.net), monthly.count];
        }).reverse()) + '</section>',
        chart: { type: 'line', labels: MONTHS, datasets: [{ label: 'Income', data: MONTHS.map((_, month) => totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)).income), borderColor: this.reportsColor('--income'), tension: 0.3, cubicInterpolationMode: 'monotone' }, { label: 'Expenses', data: expenses, borderColor: this.reportsColor('--expense'), backgroundColor: this.hexToRgba(this.reportsColor('--expense'), 0.08), fill: 'origin', tension: 0.3, cubicInterpolationMode: 'monotone' }] }
      };
    },

    reportsCompareSettings() {
      const state = this.reportsState();
      if (!state.compare) state.compare = { range: 3, metric: 'expenses', categoryIds: null };
      return state.compare;
    },

    reportsYearPicker() {
      const state = this.reportsState();
      return '<div class="month-picker"><span class="mp-year"><button class="mp-year-btn" onclick="BlackBook.changeReportsCalendar(\'period\',' + (state.year - 1) + ',' + state.month + ')">◀</button><span class="mp-year-label">' + state.year + '</span><button class="mp-year-btn" onclick="BlackBook.changeReportsCalendar(\'period\',' + (state.year + 1) + ',' + state.month + ')">▶</button></span><button class="mp-today" onclick="BlackBook.reportsToday()">TODAY</button></div>';
    },

    reportsCompareCategories() {
      const state = this.reportsState(), settings = this.reportsCompareSettings();
      const ids = new Set();
      for (let y = state.year - settings.range + 1; y <= state.year; y++) {
        this.reportsRows(y).forEach(row => {
          if (settings.metric === 'net' || (settings.metric === 'income' ? row.amount > 0 : row.amount < 0)) ids.add(row.categoryId || 'none');
        });
      }
      return [...this.reportsCatalog().categories, { id: 'none', name: 'Uncategorized', color: this.reportsColor('--text-dim') }].filter(category => ids.has(category.id)).sort((a, b) => a.name.localeCompare(b.name));
    },

    reportsCompareControls() {
      const settings = this.reportsCompareSettings(), e = value => this.escapeHtml(String(value));
      return '<div class="reports-compare-options"><div class="reports-account-filters reports-range-controls" role="group" aria-label="Comparison range">' + [1,3,5,10].map(range => '<button class="btn page-control ' + (range === settings.range ? 'btn-primary' : 'btn-secondary') + '" onclick="BlackBook.setReportsCompare(\'range\',' + range + ')">' + range + 'Y</button>').join('') + '</div><button class="btn btn-secondary page-control reports-metric-control" style="width:110px" onclick="BlackBook.cycleReportsCompareMetric()">' + settings.metric.toUpperCase() + '</button></div><div class="reports-chip-field"><div class="reports-account-filters" role="group" aria-label="Comparison categories"><button type="button" class="cat-filter-chip page-control" style="background:var(--accent);color:var(--on-fill)" aria-pressed="' + (settings.categoryIds == null || this.reportsCompareCategories().every(category => settings.categoryIds.includes(category.id))) + '" onclick="BlackBook.setReportsCompare(\'all\')">ALL</button>' + this.reportsCompareCategories().map(category => {
        const active = settings.categoryIds == null || settings.categoryIds.includes(category.id);
        return '<button class="cat-filter-chip page-control' + (active ? ' selected' : '') + '" style="--cc:' + this.categoryColor(category) + ';background:' + (active ? 'var(--cc);color:var(--on-fill)' : 'var(--block);color:var(--cc)') + '" aria-pressed="' + active + '" onclick="BlackBook.toggleReportsCompareCategory(\'' + e(category.id) + '\',event)">' + e(category.name) + '</button>';
      }).join('') + '</div></div>';
    },

    setReportsCompare(name, value) {
      if (name === 'all') this.reportsCompareSettings().categoryIds = null;
      if (name === 'range' && [1,3,5,10].includes(value)) this.reportsCompareSettings().range = value;
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
      const matches = row => settings.categoryIds == null || settings.categoryIds.includes(row.categoryId || 'none');
      const metric = rows => { const values = totals(rows); return settings.metric === 'expenses' ? -values.expenses : settings.metric === 'income' ? values.income : values.net; };
      const years = Array.from({ length: settings.range }, (_, index) => state.year - settings.range + 1 + index);
      const data = years.map(year => {
        const rows = this.reportsRows(year).filter(matches);
        return { year, rows, total: metric(rows), monthly: MONTHS.map((_, month) => {
          // Do not portray future months in the current year as zero spending.
          if (key(year, month) > this.today().slice(0,7)) return null;
          return metric(rows.filter(row => Number(row.date.slice(5,7)) === month + 1));
        }) };
      });
      const line = (label, values, color, extra = {}) => ({ label, data: values, borderColor: color, tension: .3, cubicInterpolationMode: 'monotone', ...extra });
      let datasets;
      if (settings.range === 1) datasets = this.reportsCompareCategories().filter(category => settings.categoryIds == null || settings.categoryIds.includes(category.id)).map(category => line(category.name, data[0].monthly.map((value, month) => value == null ? null : metric(data[0].rows.filter(row => (row.categoryId || 'none') === category.id && Number(row.date.slice(5,7)) === month + 1))), this.categoryColor(category)));
      else if (settings.range < 10) datasets = data.map((year, index) => line(String(year.year), year.monthly, index === data.length - 1 ? this.reportsColor('--accent') : this.colorForName(String(year.year)), { borderWidth: index === data.length - 1 ? 3 : 1.5 }));
      else {
        const history = data.slice(0,-1);
        const values = month => history.map(year => year.monthly[month]).filter(value => value != null);
        datasets = [
          line('Historical minimum', MONTHS.map((_, m) => Math.min(...values(m))), this.reportsColor('--text-muted'), { pointRadius: 0, borderWidth: 0 }),
          line('Historical maximum', MONTHS.map((_, m) => Math.max(...values(m))), this.reportsColor('--text-muted'), { pointRadius: 0, borderWidth: 0, fill: '-1', backgroundColor: this.hexToRgba(this.reportsColor('--text-dim'), .15) }),
          line('Historical average', MONTHS.map((_, m) => values(m).reduce((sum,value) => sum + value, 0) / values(m).length), '#7bb4cc', { borderDash: [5,4] }),
          line(String(state.year), data[data.length - 1].monthly, this.reportsColor('--accent'), { borderWidth: 3 })
        ];
      }
      const current = data[data.length - 1];
      const barMode = settings.chart === 'bars';
      const barCategories = this.reportsCompareCategories().filter(category => settings.categoryIds == null || settings.categoryIds.includes(category.id));
      let barDatasets;
      if (barMode) {
        const categoryAmount = (year, category) => metric(year.rows.filter(row => (row.categoryId || 'none') === category.id));
        barDatasets = settings.range === 1
          ? [{ label: String(state.year), data: barCategories.map(category => categoryAmount(current, category)), backgroundColor: barCategories.map(category => this.categoryColor(category)), borderWidth: 0, maxBarThickness: 44 }]
          : barCategories.map(category => ({ label: category.name, data: data.map(year => categoryAmount(year, category)), backgroundColor: this.categoryColor(category), borderWidth: 0, maxBarThickness: 20 }));
      }
      const historyRows = settings.range === 1
        ? current.monthly.map((amount, month) => ({
          month,
          amount,
          rows: current.rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)
        })).filter(item => item.amount != null).map((item, index, months) => {
          const previous = index ? months[index - 1].amount : null;
          const change = previous == null ? null : item.amount - previous;
          const good = change > 0;
          return [MONTHS_FULL[item.month], this.reportsMoney(item.amount), change == null ? 'N/A' : (good ? '↑ ' : change ? '↓ ' : '') + this.reportsMoney(Math.abs(change)) + this.reportsChangePercent(change, previous), item.rows.length];
        }).reverse()
        : data.map((year, index) => {
          const difference = index ? year.total - data[index - 1].total : null;
          const good = difference > 0;
          return [String(year.year), this.reportsMoney(year.total), difference == null ? 'N/A' : (good ? '↑ ' : difference ? '↓ ' : '') + this.reportsMoney(Math.abs(difference)) + this.reportsChangePercent(difference, data[index - 1].total), year.rows.length];
        }).reverse();
      return {
        summary: this.reportsSummaryHtml([['Selected year', String(state.year)], ['Years compared', String(settings.range)], [settings.metric, this.reportsMoney(current.total)], ['Transactions', String(current.rows.length)]]),
        html: this.reportsChartHtml(barMode ? 'Category totals by year' : settings.range === 1 ? 'Monthly category comparison' : 'Year comparison', settings.metric.toUpperCase() + ' · ' + this.baseCurrency(), this.reportsChartToggleHtml(barMode ? 'vertical' : 'graph', 'toggleReportsCompareChart', barMode ? 'graph' : 'bars')) + '<section class="reports-history"><h3 class="reports-section-title">' + (settings.range === 1 ? 'Monthly totals · current month is month to date' : 'Yearly totals · current year is year to date') + '</h3>' + this.reportsTableHtml([settings.range === 1 ? 'Month' : 'Year', settings.metric, 'Change', 'Transactions'], historyRows, settings.range === 1 ? 'reports-month-table' : '') + '</section>',
        chart: barMode ? { type: 'bar', labels: settings.range === 1 ? barCategories.map(category => category.name) : data.map(year => String(year.year)), datasets: barDatasets, reverseY: settings.metric === 'expenses' } : { type: 'line', labels: MONTHS, datasets }
      };
    },

    reportsChangePercent(change, previous) {
      return previous && change ? ' · ' + (Math.abs(change) / Math.abs(previous) * 100).toFixed(1) + '%' : '';
    },

    reportsPeopleContent() {
      const state = this.reportsState();
      const rows = this.reportsRows().filter(row => (row.personIds || []).some(id => state.personIds == null || state.personIds.includes(id)));
      const info = totals(rows);
      const monthly = MONTHS.map((_, month) => totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)));
      const person = 'Selected people';
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], ['Net', this.reportsMoney(info.net), info.net < 0 ? 'negative' : 'positive'], ['Transactions', String(info.count)]]),
        html: '<div class="reports-grid">' + this.reportsChartHtml('Person history', person + ' · ' + state.year + ' · ' + this.baseCurrency()) + this.reportsBreakdownHtml(rows, 'Spending categories') + '</div>' + this.reportsTransactionsHtml(rows, 'Tagged transactions'),
        chart: { type: 'line', labels: MONTHS, datasets: [{ label: 'Income', data: monthly.map(value => value.income), borderColor: this.reportsColor('--income'), tension: 0.3, cubicInterpolationMode: 'monotone' }, { label: 'Expenses', data: monthly.map(value => -value.expenses), borderColor: this.reportsColor('--expense'), tension: 0.3, cubicInterpolationMode: 'monotone' }] }
      };
    },

    reportsTransactionsHtml(rows, title, calendar = false, action = '') {
      const e = value => this.escapeHtml(String(value));
      const heading = calendar ? e(title) + ': ' + rows.length + ' TRANSACTIONS' : e(title) + ' · ' + rows.length;
      const headingHtml = calendar ? '<div class="reports-history-heading"><h3 class="reports-section-title">' + heading + '</h3>' + action + '</div>' : '<h3 class="reports-section-title">' + heading + '</h3>';
      return '<section class="reports-history">' + headingHtml + '<div class="reports-table-wrap"><table class="reports-table reports-transactions"><thead><tr><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Description</th><th scope="col" class="reports-amount">Amount</th></tr></thead><tbody>' + rows.slice().sort((a, b) => b.date.localeCompare(a.date)).map(row => {
        const note = String(row.note || row.description || '');
        const taggedPeople = (row.personIds || []).map(id => this.reportsCatalog().people.find(person => person.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const missingTags = taggedPeople.filter(person => {
          const name = person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return !new RegExp('(^|[^\\p{L}\\p{N}_@])@?' + name + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(note);
        });
        const description = this.transactionDescriptionHtml(row, '');
        return '<tr><td>' + e(this.fmtDateInput(row.date)) + '</td><td>' + e(nameOf(this.reportsCatalog().categories, row.categoryId, 'Uncategorized')) + '</td><td>' + description + missingTags.map(person => ' ' + this.personNameHtml(person)).join('') + '</td><td class="reports-amount amount-' + (row.amount < 0 ? 'negative' : 'positive') + '">' + this.reportsMoney(row.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (!rows.length ? '<div class="reports-empty">No transactions for this selection.</div>' : '') + '</section>';
    },

    toggleReportsFlowGroup() { const state = this.reportsState(); state.flowGroup = state.flowGroup === 'people' ? 'categories' : 'people'; this.renderPage('reports'); },

    toggleReportsCalendarDisplay() { const state = this.reportsState(); state.calendarDisplay = state.calendarDisplay === 'totals' ? 'transactions' : 'totals'; this.renderPage('reports'); },

    reportsMoneyFlowContent() {
      const state = this.reportsState();
      const rows = this.reportsMonthRows(state.year, state.month), info = totals(rows);
      const peopleMode = state.flowGroup === 'people';
      const groups = peopleMode ? [...this.reportsCatalog().people.map(person => ({ ...person, color: this.personColor(person) })), { id: 'none', name: 'No person', color: this.reportsColor('--text-dim') }] : [...this.reportsCatalog().categories.map(category => ({ ...category, color: this.categoryColor(category) })), { id: 'none', name: 'Uncategorized', color: this.reportsColor('--text-dim') }];
      // Shared-person amounts are divided evenly so the flow still balances.
      const share = (row, id) => {
        if (!peopleMode) return (row.categoryId || 'none') === id ? 1 : 0;
        const ids = [...new Set(row.personIds || [])];
        return ids.length ? (ids.includes(id) ? 1 / ids.length : 0) : id === 'none' ? 1 : 0;
      };
      const group = positive => groups.map(item => {
        const entries = rows.filter(row => (row.amount > 0) === positive && share(row, item.id));
        return { ...item, amount: entries.reduce((value,row) => value + Math.abs(row.amount) * share(row,item.id), 0), count: entries.length };
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
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], [info.net < 0 ? 'From balance' : 'Money left', this.reportsMoney(Math.abs(info.net)), info.net < 0 ? 'negative' : 'positive'], ['Transactions', String(info.count)]]),
        html: '<div class="reports-money-grid"><section class="reports-chart-panel"><div class="reports-panel-heading"><button class="btn btn-secondary page-control" style="width:110px" onclick="BlackBook.toggleReportsFlowGroup()">' + (peopleMode ? 'PEOPLE' : 'CATEGORIES') + '</button><span class="reports-panel-note">' + MONTHS[state.month] + ' ' + state.year + ' · ' + this.baseCurrency() + '</span></div>' + (total ? '<div class="reports-flow-wrap"><svg class="reports-flow" viewBox="0 0 1000 ' + height + '" role="img" aria-label="Income sources join and split into expenses and money left. Exact amounts and percentages are listed beside the chart.">' + svg + '</svg></div>' : '<div class="reports-empty">No activity for this period.</div>') + '</section><section class="reports-history"><h3 class="reports-section-title">Flow breakdown</h3>' + this.reportsTableHtml([peopleMode ? 'Person' : 'Category', 'In', 'In %', 'Out', 'Out %', 'TX'], [...incoming.map(item => [item.name, this.reportsMoney(item.amount), total ? (item.amount / total * 100).toFixed(1) + '%' : 'N/A', '—', '—', item.count == null ? '—' : item.count]), ...outgoing.map(item => [item.name, '—', '—', this.reportsMoney(item.amount), total ? (item.amount / total * 100).toFixed(1) + '%' : 'N/A', item.count == null ? '—' : item.count])]) + (peopleMode ? '<div class="reports-panel-note">Shared-person amounts are divided evenly; percentages show each share of total flow, and counts include each tagged transaction.</div>' : '') + '</section></div>',
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
          const calendarTotal = (value, amountClass) => value === 0 ? '' : '<span class="reports-calendar-total ' + amountClass + '"><span class="reports-calendar-full">' + this.fmtNumber(value) + '</span><span class="reports-calendar-compact">' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value).toLowerCase() + '</span></span>';
          const cellContents = state.calendarDisplay === 'totals'
            ? '<span class="reports-calendar-totals">' + calendarTotal(daily.income, 'amount-positive') + calendarTotal(daily.expenses, 'amount-negative') + '</span>'
            : entries.map(row => '<span class="reports-calendar-entry ' + (row.amount < 0 ? 'expense' : 'income') + '" title="' + e(row.description + ' · ' + this.reportsMoney(row.amount)) + '"><span class="reports-calendar-name">' + e(row.description) + '</span><span class="reports-calendar-amount amount-' + (row.amount < 0 ? 'negative' : 'positive') + '">' + (row.amount > 0 ? '+' : '−') + '<span class="reports-calendar-full">' + this.fmtNumber(Math.abs(row.amount)) + '</span><span class="reports-calendar-compact">' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(row.amount)).toLowerCase() + '</span></span></span>').join('');
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
        const amount = (value, className) => '<span class="reports-calendar-month-total ' + className + '">' + (value === 0 ? '' : '<span class="reports-calendar-month-full">' + this.fmtNumber(value) + '</span><span class="reports-calendar-month-compact">' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value).toLowerCase() + '</span>') + '</span>';
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
        axis.grid.color = this.reportsColor('--border');
        axis.ticks.color = this.reportsColor('--text-dim');
        axis.ticks.font.family = "'Hack', 'Courier New', monospace";
      }
      options.scales.y.beginAtZero = true;
      if (spec.type === 'bar') {
        options.scales.x.ticks.autoSkip = true;
        options.scales.x.ticks.maxTicksLimit = Math.min(12, spec.labels.length);
        options.scales.x.ticks.maxRotation = 35;
        if (spec.reverseY) options.scales.y.reverse = true;
      }
      for (const dataset of spec.datasets) {
        if (spec.type === 'line') { dataset.pointBackgroundColor = dataset.borderColor; if (dataset.pointRadius == null) dataset.pointRadius = 3; }
      }
      options.plugins.tooltip.external = ({ chart, tooltip }) => this.showDonutTooltip(chart, tooltip,
        tooltip.dataPoints && tooltip.dataPoints.length ? [tooltip.title && tooltip.title[0], ...tooltip.dataPoints.map(point => point.dataset.label + ': ' + this.reportsMoney(point.dataset.amounts ? point.dataset.amounts[point.dataIndex] : point.parsed.y))].filter(Boolean).join('\n') : '');
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
      tab.focus();
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
