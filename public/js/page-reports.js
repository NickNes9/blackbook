/* Reports layout preview. All values come from ReportsPreview, never a profile. */
(function () {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const VIEWS = [['categories', 'Categories'], ['compare', 'Compare'], ['people', 'People'], ['cashflow', 'Cash Flow'], ['calendar', 'Calendar']];
  const sum = rows => Math.round(rows.reduce((value, row) => value + row.amount, 0) * 100) / 100;
  const totals = rows => ({ income: sum(rows.filter(row => row.amount > 0)), expenses: -sum(rows.filter(row => row.amount < 0)), net: sum(rows), count: rows.length });
  const key = (year, month) => year + '-' + String(month + 1).padStart(2, '0');
  const nameOf = (items, id, fallback) => (items.find(item => item.id === id) || {}).name || fallback;

  Object.assign(window.BlackBook, {
    reportsState() {
      if (!this._reportsState) {
        const [year, month] = this.today().split('-').map(Number);
        const previous = new Date(Date.UTC(year, month - 2, 1));
        this._reportsState = { view: 'categories', year, month: month - 1, accountIds: null, category: 'all', person: 'alex', against: key(previous.getUTCFullYear(), previous.getUTCMonth()), day: null };
      }
      return this._reportsState;
    },

    reportsMoney(amount) { return this.fmtNumber(amount) + ' EUR'; },

    reportsSelectedAccounts() {
      const ids = this.reportsState().accountIds;
      return new Set(ids == null ? window.ReportsPreview.accounts.map(account => account.id) : ids);
    },

    reportsRows(year) {
      const state = this.reportsState();
      const selected = this.reportsSelectedAccounts();
      return window.ReportsPreview.rows(year == null ? state.year : year).filter(row => selected.has(row.accountId));
    },

    reportsMonthRows(year, month) { return this.reportsRows(year).filter(row => row.date.startsWith(key(year, month))); },

    destroyReportsCharts() {
      for (const chart of this._reportsCharts || []) chart.destroy();
      this._reportsCharts = [];
      this.hideDonutTooltip();
    },

    renderReports() {
      const root = document.getElementById('page-reports');
      if (!root) return;
      this.destroyReportsCharts();
      if (!window.ReportsPreview) { root.innerHTML = '<div class="empty-state">The Reports preview could not load. Reload to retry.</div>'; return; }
      const state = this.reportsState();
      const sample = window.ReportsPreview;
      const e = value => this.escapeHtml(String(value));
      const field = (label, id, options, selected) => '<label class="reports-field" for="' + id + '">' + label + '<select class="input" id="' + id + '" onchange="BlackBook.setReportsFilter(\'' + id.replace('reports-', '') + '\',this.value)">' + options.map(item => '<option value="' + e(item.id) + '"' + (item.id === selected ? ' selected' : '') + '>' + e(item.name) + '</option>').join('') + '</select></label>';
      const annual = state.view === 'categories' || state.view === 'people';
      let controls = '<div class="reports-period-controls"><button type="button" class="btn btn-secondary page-control" aria-label="Previous ' + (annual ? 'year' : 'month') + '" onclick="BlackBook.shiftReportsPeriod(-1)">◀</button><span class="reports-period-label">' + (annual ? state.year : MONTHS[state.month].toUpperCase() + ' ' + state.year) + '</span><button type="button" class="btn btn-secondary page-control" aria-label="Next ' + (annual ? 'year' : 'month') + '" onclick="BlackBook.shiftReportsPeriod(1)">▶</button><button type="button" class="btn btn-secondary page-control" onclick="BlackBook.reportsToday()">TODAY</button></div>';
      const selected = this.reportsSelectedAccounts();
      controls += '<div class="reports-account-picker"><span class="reports-account-label">ACCOUNTS</span><div class="reports-account-filters" role="group" aria-label="Sample accounts">' + sample.accounts.map(account => '<button type="button" class="cat-filter-chip page-control reports-account-chip' + (selected.has(account.id) ? ' selected' : '') + '" style="--cc:' + account.color + ';' + (selected.has(account.id) ? 'background:var(--cc);color:var(--on-fill);' : 'color:var(--cc);') + '" aria-pressed="' + selected.has(account.id) + '" title="Click: toggle · Shift-click: keep multiple selected · Alt-click: isolate" onclick="BlackBook.toggleReportsAccount(\'' + account.id + '\',event)">' + e(account.name) + '</button>').join('') + '</div></div>';
      if (state.view === 'categories') controls += field('Category', 'reports-category', [{ id: 'all', name: 'All expenses' }, ...sample.categories.filter(category => category.id !== 'paycheck'), { id: 'none', name: 'Uncategorized' }], state.category);
      if (state.view === 'people') controls += field('Person', 'reports-person', [{ id: 'all', name: 'All people' }, ...sample.people], state.person);
      if (state.view === 'compare') controls += '<label class="reports-field" for="reports-against">Compare with<input class="input" type="month" id="reports-against" value="' + state.against + '" min="1900-01" max="2099-12" onchange="BlackBook.setReportsFilter(\'against\',this.value)"></label>';
      const content = selected.size ? this.reportsViewContent() : { summary: this.reportsSummaryHtml([['Income', this.reportsMoney(0), 'positive'], ['Expenses', this.reportsMoney(0), 'negative'], ['Net', this.reportsMoney(0)], ['Transactions', '0']]), html: '<div class="reports-empty">Select one or more accounts to preview this report.</div>', chart: null };
      root.innerHTML = '<div class="reports-shell"><div class="reports-topline"><nav class="reports-tabs" role="tablist" aria-label="Report views" onkeydown="BlackBook.reportsTabKey(event)">' + VIEWS.map(([id, label]) => '<button type="button" role="tab" class="btn page-control ' + (state.view === id ? 'btn-primary' : 'btn-secondary') + '" id="reports-view-' + id + '" aria-controls="reports-panel" aria-selected="' + (state.view === id) + '" tabindex="' + (state.view === id ? '0' : '-1') + '" onclick="BlackBook.setReportsView(\'' + id + '\')">' + label.toUpperCase() + '</button>').join('') + '</nav><span class="reports-preview-label" title="Illustrative EUR values for reviewing this layout. Nothing is added to your profile.">LAYOUT PREVIEW · SAMPLE DATA</span></div><div class="reports-toolbar">' + controls + '</div>' + content.summary + '<div class="list-sep"></div><div class="reports-content" id="reports-panel" role="tabpanel" aria-labelledby="reports-view-' + state.view + '">' + content.html + '</div></div>';
      this.renderReportsChart(content.chart);
      root.querySelector('.reports-tabs [aria-selected="true"]').scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },

    reportsSummaryHtml(stats) {
      return '<div class="reports-summary">' + stats.map(([label, value, color]) => {
        let content = this.escapeHtml(value);
        if (/^[+-]?[\d,]+\.\d{2} EUR$/.test(value)) {
          const amount = parseFloat(value.replaceAll(',', ''));
          const compact = Math.abs(amount) < 1000 ? value : (value.startsWith('+') ? '+' : '') + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount).toLowerCase() + ' EUR';
          content = '<span class="reports-stat-full">' + content + '</span><span class="reports-stat-compact" aria-hidden="true">' + this.escapeHtml(compact) + '</span>';
        }
        return '<div class="reports-stat"><span class="reports-stat-label">' + this.escapeHtml(label) + '</span><span class="reports-stat-value' + (color ? ' amount-' + color : '') + '" title="' + this.escapeHtml(value) + '" aria-label="' + this.escapeHtml(value) + '">' + content + '</span></div>';
      }).join('') + '</div>';
    },

    reportsChartHtml(title, note) {
      return '<section class="reports-chart-panel"><div class="reports-panel-heading"><h3>' + this.escapeHtml(title) + '</h3><span class="reports-panel-note">' + this.escapeHtml(note) + '</span></div><div class="reports-chart-wrap"><canvas id="reports-chart" role="img" aria-label="' + this.escapeHtml(title) + '; values are also listed in the table below."></canvas></div></section>';
    },

    reportsTableHtml(headers, rows) {
      return '<div class="reports-table-wrap"><table class="reports-table"><thead><tr>' + headers.map((label, index) => '<th scope="col"' + (index ? ' class="reports-amount"' : '') + '>' + this.escapeHtml(label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map((value, index) => '<td' + (index ? ' class="reports-amount"' : '') + '>' + this.escapeHtml(String(value)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    },

    reportsBreakdownHtml(rows, title) {
      const categories = [...window.ReportsPreview.categories, { id: 'none', name: 'Uncategorized', color: this.reportsColor('--text-dim') }];
      const spend = categories.map(category => ({ ...category, amount: -sum(rows.filter(row => row.amount < 0 && (row.categoryId || 'none') === category.id)) })).filter(category => category.amount > 0).sort((a, b) => b.amount - a.amount);
      const total = spend.reduce((value, category) => value + category.amount, 0);
      return '<section class="reports-side-panel"><h3 class="reports-section-title">' + this.escapeHtml(title) + '</h3><div class="reports-breakdown">' + spend.map(category => '<div class="reports-breakdown-row"><div class="reports-breakdown-head"><span>' + this.escapeHtml(category.name) + '</span><span>' + this.reportsMoney(category.amount) + ' · ' + (category.amount / total * 100).toFixed(1) + '%</span></div><div class="reports-bar-track"><div class="reports-bar-fill" style="width:' + (category.amount / total * 100) + '%;background:' + category.color + '"></div></div></div>').join('') + (spend.length ? '' : '<div class="reports-empty">No expenses in this sample selection.</div>') + '</div></section>';
    },

    reportsViewContent() {
      const state = this.reportsState();
      if (state.view === 'compare') return this.reportsCompareContent();
      if (state.view === 'people') return this.reportsPeopleContent();
      if (state.view === 'cashflow') return this.reportsCashFlowContent();
      if (state.view === 'calendar') return this.reportsCalendarContent();
      const rows = this.reportsRows().filter(row => state.category === 'all' || (row.categoryId || 'none') === state.category);
      const info = totals(rows);
      const expenses = MONTHS.map((_, month) => -totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)).expenses);
      const peak = expenses.indexOf(Math.min(...expenses));
      const category = nameOf(window.ReportsPreview.categories, state.category, state.category === 'none' ? 'Uncategorized' : 'All expenses');
      return {
        summary: this.reportsSummaryHtml([['Year expenses', this.reportsMoney(info.expenses), 'negative'], ['Monthly average', this.reportsMoney(info.expenses / 12)], [info.expenses ? 'Highest spending · ' + MONTHS[peak] : 'Highest spending', info.expenses ? this.reportsMoney(-expenses[peak]) : '—'], ['Transactions', String(info.count)]]),
        html: '<div class="reports-grid">' + this.reportsChartHtml('Monthly spending', category + ' · ' + state.year + ' · EUR') + this.reportsBreakdownHtml(rows, 'Category share') + '</div><section class="reports-history"><h3 class="reports-section-title">Monthly breakdown</h3>' + this.reportsTableHtml(['Month', 'Income', 'Expenses', 'Net', 'Transactions'], MONTHS.map((month, index) => {
          const monthly = totals(rows.filter(row => Number(row.date.slice(5, 7)) === index + 1));
          return [month + ' ' + state.year, this.reportsMoney(monthly.income), this.reportsMoney(-monthly.expenses), this.reportsMoney(monthly.net), monthly.count];
        }).reverse()) + '</section>',
        chart: { type: 'line', labels: MONTHS, datasets: [{ label: 'Expenses', data: expenses, borderColor: this.reportsColor('--expense'), backgroundColor: this.hexToRgba(this.reportsColor('--expense'), 0.08), fill: 'origin', tension: 0.3, cubicInterpolationMode: 'monotone' }] }
      };
    },

    reportsCompareContent() {
      const state = this.reportsState();
      const [year, month] = state.against.split('-').map(Number);
      const current = this.reportsMonthRows(state.year, state.month);
      const previous = this.reportsMonthRows(year, month - 1);
      const a = totals(current), b = totals(previous);
      const currentLabel = MONTHS[state.month] + ' ' + state.year, previousLabel = MONTHS[month - 1] + ' ' + year;
      const difference = a.expenses - b.expenses;
      const percent = b.expenses ? (Math.abs(difference) / b.expenses * 100).toFixed(1) + '% ' + (difference > 0 ? 'more' : difference < 0 ? 'less' : 'same') : 'No previous spending';
      const categories = [...window.ReportsPreview.categories.filter(category => category.id !== 'paycheck'), { id: 'none', name: 'Uncategorized' }];
      return {
        summary: this.reportsSummaryHtml([['Current expenses', this.reportsMoney(a.expenses), 'negative'], ['Previous expenses', this.reportsMoney(b.expenses)], ['Spending change', (difference > 0 ? '+' : '') + this.reportsMoney(difference), difference > 0 ? 'negative' : 'positive'], ['Compared with', percent]]),
        html: this.reportsChartHtml('Period comparison', currentLabel + ' / ' + previousLabel + ' · EUR') + '<section class="reports-history"><h3 class="reports-section-title">Category differences</h3>' + this.reportsTableHtml(['Category', currentLabel, previousLabel, 'Change'], categories.map(category => {
          const cost = rows => -sum(rows.filter(row => row.amount < 0 && (row.categoryId || 'none') === category.id));
          const latest = cost(current), earlier = cost(previous);
          return [category.name, this.reportsMoney(latest), this.reportsMoney(earlier), (latest > earlier ? '+' : '') + this.reportsMoney(latest - earlier)];
        })) + '</section>',
        chart: { type: 'bar', labels: ['Income', 'Expenses', 'Net'], datasets: [{ label: currentLabel, data: [a.income, -a.expenses, a.net], backgroundColor: this.reportsColor('--accent') }, { label: previousLabel, data: [b.income, -b.expenses, b.net], backgroundColor: '#7bb4cc' }] }
      };
    },

    reportsPeopleContent() {
      const state = this.reportsState();
      const rows = this.reportsRows().filter(row => state.person === 'all' ? !!row.personId : row.personId === state.person);
      const info = totals(rows);
      const monthly = MONTHS.map((_, month) => totals(rows.filter(row => Number(row.date.slice(5, 7)) === month + 1)));
      const person = nameOf(window.ReportsPreview.people, state.person, 'All people');
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], ['Net', this.reportsMoney(info.net), info.net < 0 ? 'negative' : 'positive'], ['Transactions', String(info.count)]]),
        html: '<div class="reports-grid">' + this.reportsChartHtml('Person history', person + ' · ' + state.year + ' · EUR') + this.reportsBreakdownHtml(rows, 'Spending categories') + '</div>' + this.reportsTransactionsHtml(rows, 'Tagged transactions'),
        chart: { type: 'line', labels: MONTHS, datasets: [{ label: 'Income', data: monthly.map(value => value.income), borderColor: this.reportsColor('--income'), tension: 0.3, cubicInterpolationMode: 'monotone' }, { label: 'Expenses', data: monthly.map(value => -value.expenses), borderColor: this.reportsColor('--expense'), tension: 0.3, cubicInterpolationMode: 'monotone' }] }
      };
    },

    reportsTransactionsHtml(rows, title) {
      const e = value => this.escapeHtml(String(value));
      return '<section class="reports-history"><h3 class="reports-section-title">' + e(title) + ' · ' + rows.length + '</h3><div class="reports-table-wrap"><table class="reports-table reports-transactions"><thead><tr><th scope="col">Date</th><th scope="col">Category</th><th scope="col">Description</th><th scope="col" class="reports-amount">Amount</th></tr></thead><tbody>' + rows.slice().sort((a, b) => b.date.localeCompare(a.date)).map(row => '<tr><td>' + e(this.fmtDateInput(row.date)) + '</td><td>' + e(nameOf(window.ReportsPreview.categories, row.categoryId, 'Uncategorized')) + '</td><td>' + e(row.description) + (row.personId ? ' <span class="reports-person-mention">@' + e(nameOf(window.ReportsPreview.people, row.personId, '')) + '</span>' : '') + '</td><td class="reports-amount amount-' + (row.amount < 0 ? 'negative' : 'positive') + '">' + this.reportsMoney(row.amount) + '</td></tr>').join('') + '</tbody></table></div>' + (!rows.length ? '<div class="reports-empty">No sample transactions for this selection.</div>' : '') + '</section>';
    },

    reportsCashFlowContent() {
      const state = this.reportsState();
      const rows = this.reportsMonthRows(state.year, state.month);
      const info = totals(rows);
      const initial = { bank: 4200, cash: 1600, travel: 3000 };
      const selected = this.reportsSelectedAccounts();
      const starting = Object.entries(initial).filter(([id]) => selected.has(id)).reduce((value, [, amount]) => value + amount, 0);
      const opening = starting + sum(this.reportsRows().filter(row => row.date < key(state.year, state.month) + '-01'));
      const steps = [{ name: 'Opening', amount: opening, start: 0, end: opening, color: this.reportsColor('--accent') }];
      let balance = opening;
      const add = (name, amount, color) => { steps.push({ name, amount, start: balance, end: balance + amount, color }); balance += amount; };
      add('Income', info.income, this.reportsColor('--income'));
      for (const category of [...window.ReportsPreview.categories, { id: 'none', name: 'Other' }]) {
        const amount = sum(rows.filter(row => row.amount < 0 && (row.categoryId || 'none') === category.id));
        if (amount) add(category.name, amount, this.reportsColor('--expense'));
      }
      steps.push({ name: 'Closing', amount: balance, start: 0, end: balance, color: '#7bb4cc' });
      return {
        summary: this.reportsSummaryHtml([['Opening', this.reportsMoney(opening)], ['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], ['Closing', this.reportsMoney(balance), balance < 0 ? 'negative' : 'positive']]),
        html: this.reportsChartHtml('Where the money went', MONTHS[state.month] + ' ' + state.year + ' · EUR') + '<section class="reports-history"><h3 class="reports-section-title">From opening to closing</h3>' + this.reportsTableHtml(['Step', 'Amount', 'Balance after'], steps.map(step => [step.name, this.reportsMoney(step.amount), this.reportsMoney(step.end)])) + '</section>',
        chart: { type: 'bar', labels: steps.map(step => step.name), datasets: [{ label: 'Cash flow', data: steps.map(step => [step.start, step.end]), amounts: steps.map(step => step.amount), backgroundColor: steps.map(step => step.color), barPercentage: 0.7 }], steps }
      };
    },

    reportsCalendarContent() {
      const state = this.reportsState();
      const rows = this.reportsMonthRows(state.year, state.month);
      const info = totals(rows);
      const offset = (new Date(Date.UTC(state.year, state.month, 1)).getUTCDay() + 6) % 7;
      const days = new Date(Date.UTC(state.year, state.month + 1, 0)).getUTCDate();
      const count = Math.ceil((offset + days) / 7) * 7;
      const e = value => this.escapeHtml(String(value));
      let grid = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => '<div class="reports-calendar-weekday">' + day + '</div>').join('');
      for (let index = 0; index < count; index++) {
        const day = index - offset + 1;
        if (day < 1 || day > days) { grid += '<div class="reports-calendar-day outside" aria-hidden="true"></div>'; continue; }
        const date = key(state.year, state.month) + '-' + String(day).padStart(2, '0');
        const entries = rows.filter(row => row.date === date);
        grid += '<button type="button" class="reports-calendar-day' + (date === this.today() ? ' today' : '') + (state.day === date ? ' selected' : '') + '" aria-pressed="' + (state.day === date) + '" aria-label="' + e(this.fmtDateInput(date)) + ', ' + entries.length + ' sample transactions" onclick="BlackBook.setReportsFilter(\'day\',\'' + date + '\')"><span class="reports-day-number">' + day + '</span>' + entries.slice(0, 2).map(row => '<span class="reports-calendar-entry ' + (row.amount < 0 ? 'expense' : 'income') + '" title="' + e(row.description + ' · ' + this.reportsMoney(row.amount)) + '"><span class="reports-calendar-name">' + e(row.description) + '</span><span class="reports-calendar-amount amount-' + (row.amount < 0 ? 'negative' : 'positive') + '">' + (row.amount > 0 ? '+' : '−') + '<span class="reports-calendar-full">' + this.fmtNumber(Math.abs(row.amount)) + '</span><span class="reports-calendar-compact">' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(row.amount)).toLowerCase() + '</span></span></span>').join('') + (entries.length > 2 ? '<span class="reports-calendar-note">+' + (entries.length - 2) + ' more</span>' : '') + '</button>';
      }
      return {
        summary: this.reportsSummaryHtml([['Income', this.reportsMoney(info.income), 'positive'], ['Expenses', this.reportsMoney(info.expenses), 'negative'], ['Net', this.reportsMoney(info.net), info.net < 0 ? 'negative' : 'positive'], ['Active days', String(new Set(rows.map(row => row.date)).size)]]),
        html: '<div class="reports-panel-heading"><h3>Transaction calendar</h3><span class="reports-panel-note">Select a day to see its entries · EUR</span></div><div class="reports-calendar-grid">' + grid + '</div><div class="reports-calendar-detail">' + this.reportsTransactionsHtml(state.day ? rows.filter(row => row.date === state.day) : rows, state.day ? this.fmtDateInput(state.day) : 'This month') + (state.day ? '<button type="button" class="btn btn-secondary page-control" onclick="BlackBook.setReportsFilter(\'day\',null)">ALL DAYS</button>' : '') + '</div>',
        chart: null
      };
    },

    reportsColor(token) { return getComputedStyle(document.documentElement).getPropertyValue(token).trim(); },

    renderReportsChart(spec) {
      const canvas = document.getElementById('reports-chart');
      if (!spec || !canvas || !window.Chart) return;
      const options = this.lineChartOptions({ autoSkip: true, maxTicksLimit: 12 });
      for (const axis of Object.values(options.scales)) {
        axis.grid.color = this.reportsColor('--border');
        axis.ticks.color = this.reportsColor('--text-dim');
        axis.ticks.font.family = "'Hack', 'Courier New', monospace";
      }
      options.scales.y.beginAtZero = true;
      for (const dataset of spec.datasets) {
        if (spec.type === 'line') { dataset.pointBackgroundColor = dataset.borderColor; dataset.pointRadius = 3; }
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

    reportsTabKey(event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const current = VIEWS.findIndex(([id]) => id === this.reportsState().view);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + VIEWS.length) % VIEWS.length;
      this.setReportsView(VIEWS[next][0]);
    },

    setReportsFilter(name, value) {
      const state = this.reportsState(), preview = window.ReportsPreview;
      if (name === 'category' && (['all', 'none'].includes(value) || preview.categories.some(item => item.id === value))) state.category = value;
      else if (name === 'person' && (value === 'all' || preview.people.some(item => item.id === value))) state.person = value;
      else if (name === 'against' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) state.against = value;
      else if (name === 'day' && (value === null || /^\d{4}-\d{2}-\d{2}$/.test(value))) state.day = value;
      else return;
      this.renderPage('reports');
      const field = document.getElementById('reports-' + name);
      if (field) (field.parentElement.querySelector('.custom-select-btn') || field).focus();
      if (name === 'day' && value) document.querySelector('#page-reports .reports-calendar-detail').scrollIntoView({ block: 'nearest' });
    },

    toggleReportsAccount(id, event) {
      if (!window.ReportsPreview.accounts.some(account => account.id === id)) return;
      const selected = this.reportsSelectedAccounts();
      if (event && event.altKey) { selected.clear(); selected.add(id); }
      else if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      this.reportsState().accountIds = [...selected];
      this.renderPage('reports');
      const card = [...document.querySelectorAll('#page-reports .reports-account-chip')].find(button => button.textContent === nameOf(window.ReportsPreview.accounts, id, ''));
      if (card) card.focus();
    },

    shiftReportsPeriod(direction) {
      const state = this.reportsState();
      const annual = state.view === 'categories' || state.view === 'people';
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
