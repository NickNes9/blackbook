(function () {
  Object.assign(window.BlackBook, {
    forecastResult() {
      const accountIds = this._forecastAccountIds == null ? this.visibleAccounts().map(account => account.id) : this._forecastAccountIds;
      return window.ForecastEngine.buildForecast(this.data, {
        startDate: this.today(), days: this._forecastDays || 30,
        accountIds, baseCurrency: this.baseCurrency(), rates: this.getRates(),
        includeInvoices: false, includeDebts: false
      });
    },

    renderForecast() {
      const el = document.getElementById('page-forecast');
      if (!el || !window.ForecastEngine) return;
      const chartHeights = this.captureChartPanelHeights(el);
      this.hideDonutTooltip();
      if (this.forecastChart) { this.forecastChart.destroy(); this.forecastChart = null; }
      const result = this.forecastResult();
      const accounts = this.visibleAccounts();
      const selected = new Set(this._forecastAccountIds == null ? accounts.map(account => account.id) : this._forecastAccountIds);
      const final = result.daily[result.daily.length - 1];
      const eventRows = result.events.length ? result.events.map(event =>
        '<div class="forecast-event"><span>' + this.escapeHtml(this.fmtDateInput(event.date)) + '</span><span class="forecast-kind">' + this.escapeHtml(event.kind.toUpperCase()) + '</span><span>' + this.escapeHtml(event.name) + '</span><span class="' + (event.baseAmount < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(event.baseAmount) + '</span></div>').join('') :
        '<div class="empty-state"><div class="empty-state-text">Nothing scheduled in this period.</div></div>';
      const hideGraph = !!(this.data.settings && this.data.settings.hideForecastGraph);
      el.innerHTML = '<div class="month-picker"><span style="flex:1"></span>' +
        [30, 60, 90].map(days => '<button class="btn btn-sm page-control ' + ((this._forecastDays || 30) === days ? 'btn-primary' : 'btn-secondary') + '" onclick="BlackBook.setForecastDays(' + days + ')">' + days + ' DAYS</button>').join(' ') +
        '<button class="btn btn-sm btn-secondary page-control" onclick="BlackBook.openRecurringTemplate()">+ RECURRING</button></div>' +
        '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">OPENING</span><span class="month-summary-value">' + this.fmtBase(Object.values(result.openingBalances).reduce((sum, amount) => sum + amount, 0)) + '</span></div><div class="month-summary-item"><span class="month-summary-label">ENDING</span><span class="month-summary-value ' + (final && final.total < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(final ? final.total : 0) + '</span></div><div class="month-summary-item"><span class="month-summary-label">SHORTFALLS</span><span class="month-summary-value ' + (result.shortfalls.length ? 'amount-negative' : 'amount-positive') + '">' + result.shortfalls.length + '</span></div></div>' +
        '<div class="list-sep"></div>' +
        '<div class="forecast-account-filters">' + accounts.map(account => '<button type="button" class="cat-filter-chip page-control' + (selected.has(account.id) ? ' selected' : '') + '" style="--cc:' + this.accountColor(account) + ';' + (selected.has(account.id) ? 'background:' + this.accountColor(account) + ';color:var(--on-fill);' : 'opacity:.55;') + '" aria-pressed="' + selected.has(account.id) + '" onclick="BlackBook.toggleForecastAccount(\'' + account.id + '\')">' + this.escapeHtml(account.name) + '</button>').join('') + '</div>' +
        (!selected.size ? '<div class="form-hint">Select an account to see its cash forecast.</div>' : '') +
        this.forecastWarningsHtml(result.warnings) +
        '<div class="page-scroll-wrap"><div class="forecast-list">' + eventRows + '</div></div>' +
        (hideGraph
          ? ''
          : '<div class="list-sep"></div><div class="overview-charts"><div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">PROJECTED CASH BALANCE</span></div><canvas id="forecast-chart"></canvas></div></div>');
      this.restoreChartPanelHeights(el, chartHeights);
      if (!hideGraph) this.renderForecastChart(result);
    },

    forecastWarningsHtml(warnings) {
      if (!warnings.length) return '';
      const shown = warnings[0];
      const extra = warnings.length - 1;
      return '<div class="forecast-warning">' + this.escapeHtml(shown) +
        (extra > 0 ? ' <button class="btn btn-sm btn-secondary" onclick="BlackBook.showForecastWarnings()">+' + extra + ' MORE</button>' : '') +
        '. Amounts without a rate are excluded.</div>';
    },

    showForecastWarnings() {
      const warnings = this.forecastResult().warnings;
      if (!warnings.length) return;
      const list = document.getElementById('warnings-list');
      if (!list) return;
      const title = document.getElementById('warnings-title');
      if (title) title.textContent = 'Forecast Warnings (' + warnings.length + ')';
      list.innerHTML = warnings.map((w, i) => '<div class="warning-item"><span class="warning-num">' + (i + 1) + '.</span><span class="warning-text">' + this.escapeHtml(w) + '</span></div>').join('');
      this.openModal('warnings-modal');
    },

    async toggleForecastGraph() {
      this.data.settings.hideForecastGraph = !(this.data.settings && this.data.settings.hideForecastGraph);
      await this.save();
      this.renderForecast();
      this.updateGraphFooter();
    },

    renderForecastChart(result) {
      const canvas = document.getElementById('forecast-chart');
      if (!canvas || !window.Chart) return;
      if (this.forecastChart) this.forecastChart.destroy();
      const incCol = this.data.settings.incomeColor || '#4ade80';
      const expCol = this.data.settings.expenseColor || '#f87171';
      this.forecastChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: result.daily.map(day => day.date.slice(5)),
          datasets: [{
            label: 'Projected balance',
            data: result.daily.map(day => day.total),
            borderColor: incCol,
            backgroundColor: expCol,
            fill: { target: 'origin', above: this.hexToRgba(incCol, 0.1), below: this.hexToRgba(expCol, 0.1) },
            tension: 0.3,
            segment: { borderColor: (c) => (c.p0.parsed.y < 0 || c.p1.parsed.y < 0 ? expCol : incCol) }
          }]
        },
        options: this.lineChartOptions({ autoSkip: true, maxTicksLimit: 8 })
      });
    },

    setForecastDays(days) { this._forecastDays = days; this.renderForecast(); },
    toggleForecastAccount(id) {
      const all = this.visibleAccounts().map(account => account.id);
      const selected = new Set(this._forecastAccountIds == null ? all : this._forecastAccountIds);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      this._forecastAccountIds = [...selected]; this.renderForecast();
    },

    openRecurringTemplate() {
      const account = this.visibleAccounts()[0];
      if (!account) { alert('Create an account first.'); return; }
      document.getElementById('forecast-recurring-name').value = '';
      document.getElementById('forecast-recurring-amount').value = '';
      this.openModal('forecast-recurring-modal');
      document.getElementById('forecast-recurring-name').focus();
    },

    async saveRecurringTemplate(event) {
      event.preventDefault();
      const name = document.getElementById('forecast-recurring-name').value.trim();
      const amount = Number(document.getElementById('forecast-recurring-amount').value.trim().replace(',', '.'));
      if (!name || !Number.isFinite(amount) || !amount) { alert('Enter a name and a non-zero amount.'); return; }
      const account = this.visibleAccounts()[0];
      if (!account) { alert('Create an account first.'); return; }
      this.data.recurringTemplates = this.data.recurringTemplates || [];
      this.data.recurringTemplates.push({ id: crypto.randomUUID(), name, amount, accountId: account.id, currency: account.currency || this.baseCurrency(), interval: 'monthly', startDate: this.today(), active: true });
      if (!(await this.save())) return;
      this.closeModal('forecast-recurring-modal');
      this.renderForecast();
    }
  });
})();
