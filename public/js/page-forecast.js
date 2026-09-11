(function () {
  Object.assign(window.BlackBook, {
    forecastResult() {
      return window.ForecastEngine.buildForecast(this.data, {
        startDate: this.today(), days: this._forecastDays || 30,
        accountIds: this._forecastAccountIds || [], baseCurrency: this.baseCurrency(), rates: this.getRates(),
        includeInvoices: !!this._forecastIncludeInvoices, includeDebts: !!this._forecastIncludeDebts,
        forecastAccountId: this._forecastSettlementAccount || this.data.settings.defaultAccountId
      });
    },

    renderForecast() {
      const el = document.getElementById('page-forecast');
      if (!el || !window.ForecastEngine) return;
      if (this.forecastChart) { this.forecastChart.destroy(); this.forecastChart = null; }
      const result = this.forecastResult();
      const accounts = this.visibleAccounts();
      const selected = new Set(this._forecastAccountIds || []);
      const final = result.daily[result.daily.length - 1];
      const eventRows = result.events.length ? result.events.map(event =>
        '<div class="forecast-event"><span>' + this.escapeHtml(event.date) + '</span><span class="forecast-kind">' + this.escapeHtml(event.kind.toUpperCase()) + '</span><span>' + this.escapeHtml(event.name) + '</span><span class="' + (event.baseAmount < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(event.baseAmount) + '</span></div>').join('') :
        '<div class="empty-state"><div class="empty-state-text">Nothing scheduled in this period.</div></div>';
      const hideGraph = !!(this.data.settings && this.data.settings.hideForecastGraph);
      el.innerHTML = '<div class="month-picker"><span style="flex:1"></span>' +
        [30, 60, 90].map(days => '<button class="btn btn-sm ' + ((this._forecastDays || 30) === days ? 'btn-primary' : 'btn-secondary') + '" onclick="BlackBook.setForecastDays(' + days + ')">' + days + ' DAYS</button>').join(' ') +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openRecurringTemplate()">+ RECURRING</button></div>' +
        '<div class="forecast-account-filters">' + accounts.map(account => '<label><input type="checkbox" ' + (!selected.size || selected.has(account.id) ? 'checked' : '') + ' onchange="BlackBook.toggleForecastAccount(\'' + account.id + '\', this.checked)"> ' + this.escapeHtml(account.name) + '</label>').join('') + '</div>' +
        '<div class="forecast-account-filters"><label><input type="checkbox" ' + (this._forecastIncludeInvoices ? 'checked' : '') + ' onchange="BlackBook.toggleForecastOption(\'invoices\', this.checked)"> Include unpaid invoices</label><label><input type="checkbox" ' + (this._forecastIncludeDebts ? 'checked' : '') + ' onchange="BlackBook.toggleForecastOption(\'debts\', this.checked)"> Include open personal debts</label><span class="forecast-kind">These use the default account.</span></div>' +
        '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">OPENING</span><span class="month-summary-value">' + this.fmtBase(Object.values(result.openingBalances).reduce((sum, amount) => sum + amount, 0)) + '</span></div><div class="month-summary-item"><span class="month-summary-label">ENDING</span><span class="month-summary-value ' + (final && final.total < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(final ? final.total : 0) + '</span></div><div class="month-summary-item"><span class="month-summary-label">SHORTFALLS</span><span class="month-summary-value ' + (result.shortfalls.length ? 'amount-negative' : 'amount-positive') + '">' + result.shortfalls.length + '</span></div></div>' +
        this.forecastWarningsHtml(result.warnings) +
        '<div class="page-scroll-wrap"><div class="forecast-list">' + eventRows + '</div></div>' +
        (hideGraph
          ? ''
          : '<div class="list-sep"></div><div class="overview-charts"><div class="chart-panel overview-line-panel"><div class="chart-head-row"><span class="chart-title-text">PROJECTED CASH BALANCE</span></div><canvas id="forecast-chart"></canvas></div></div>');
      if (!hideGraph) setTimeout(() => this.renderForecastChart(result), 30);
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
    toggleForecastAccount(id, checked) {
      const all = this.visibleAccounts().map(account => account.id);
      const selected = new Set(this._forecastAccountIds || all);
      if (checked) selected.add(id); else selected.delete(id);
      this._forecastAccountIds = [...selected]; this.renderForecast();
    },
    toggleForecastOption(name, checked) { if (name === 'invoices') this._forecastIncludeInvoices = checked; if (name === 'debts') this._forecastIncludeDebts = checked; this.renderForecast(); },

    async openRecurringTemplate() {
      const name = await this.promptModal({ title: 'Recurring forecast item', message: 'Name (for example, salary or groceries)', placeholder: 'Name' });
      if (!name) return;
      const amountText = await this.promptModal({ title: 'Recurring forecast item', message: 'Amount: income is positive, expense is negative.', placeholder: '-100' });
      const amount = Number(String(amountText || '').replace(',', '.'));
      if (!Number.isFinite(amount) || !amount) { alert('Enter a valid non-zero amount.'); return; }
      const account = this.visibleAccounts()[0];
      if (!account) { alert('Create an account first.'); return; }
      this.data.recurringTemplates.push({ id: crypto.randomUUID(), name: String(name).trim(), amount, accountId: account.id, currency: account.currency || this.baseCurrency(), interval: 'monthly', startDate: this.today(), active: true });
      await this.save(); this.renderForecast();
    }
  });
})();
