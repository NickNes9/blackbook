(function () {
  Object.assign(window.BlackBook, {
    forecastResult() {
      const reportForecast = this.currentPage === 'reports' && this.reportsState && this.reportsState().view === 'forecast';
      const accountIds = reportForecast
        ? [...this.reportsSelectedAccounts()]
        : this._forecastAccountIds == null ? this.visibleAccounts().map(account => account.id) : this._forecastAccountIds;
      return window.ForecastEngine.buildForecast(this.data, {
        startDate: this.today(), days: this._forecastDays || 30,
        accountIds, baseCurrency: this.baseCurrency(), rates: this.getRates(),
        includeInvoices: false, includeDebts: false
      });
    },

    forecastReportsContent() {
      if (!window.ForecastEngine) return { summary: '', html: '<div class="reports-empty">Forecast is unavailable.</div>' };
      const result = this.forecastResult();
      const final = result.daily[result.daily.length - 1];
      const eventRows = result.events.length ? result.events.map(event =>
        '<div class="forecast-event"><span>' + this.escapeHtml(this.fmtDateInput(event.date)) + '</span><span class="forecast-kind">' + this.escapeHtml(event.kind.toUpperCase()) + '</span><span>' + this.escapeHtml(event.name) + '</span><span class="' + (event.baseAmount < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(event.baseAmount) + '</span></div>').join('') :
        '<div class="reports-empty">Nothing scheduled in this period.</div>';
      const mobileGraphView = window.matchMedia && window.matchMedia('(max-width:500px)').matches;
      const hideGraph = mobileGraphView ? this._mobileForecastGraphOn !== true : !!(this.data.settings && this.data.settings.hideForecastGraph);
      const opening = Object.values(result.openingBalances).reduce((sum, amount) => sum + amount, 0);
      return {
        summary: this.reportsSummaryHtml([
          ['Opening', this.fmtBase(opening)],
          ['Projected End', this.fmtBase(final ? final.total : 0), final && final.total < 0 ? 'negative' : 'positive'],
          ['Shortfalls', String(result.shortfalls.length), result.shortfalls.length ? 'negative' : 'positive']
        ]),
        forecastResult: result,
        html: '<div class="forecast-report-view"><div class="forecast-report-toolbar">' +
        [30, 60, 90].map(days => '<button class="btn btn-sm page-control ' + ((this._forecastDays || 30) === days ? 'btn-primary' : 'btn-secondary') + '" onclick="BlackBook.setForecastDays(' + days + ')">' + days + ' DAYS</button>').join(' ') +
        '<button class="btn btn-sm btn-secondary page-control" onclick="BlackBook.openRecurringTemplate()">+ RECURRING</button></div>' +
        this.forecastWarningsHtml(result.warnings) +
        '<div class="forecast-events-panel"><div class="chart-head-row"><span class="chart-title-text">SCHEDULED EVENTS</span></div><div class="forecast-list">' + eventRows + '</div></div>' +
        (hideGraph ? '' : '<div class="overview-charts"><div class="chart-panel overview-line-panel reports-chart-wrap"><div class="chart-head-row"><span class="chart-title-text">PROJECTED CASH BALANCE</span></div><canvas id="forecast-chart"></canvas></div></div>') +
        '</div>'
      };
    },

    renderForecast() {
      if (this.currentPage === 'reports' && this.reportsState && this.reportsState().view === 'forecast') this.renderPage('reports');
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
      if (window.matchMedia && window.matchMedia('(max-width:500px)').matches) {
        this._mobileForecastGraphOn = this._mobileForecastGraphOn !== true;
        if (this.currentPage === 'reports') this.renderPage('reports');
        else this.renderForecast();
        this.updateGraphFooter();
        return;
      }
      this.data.settings.hideForecastGraph = !(this.data.settings && this.data.settings.hideForecastGraph);
      await this.save();
      if (this.currentPage === 'reports') this.renderPage('reports');
      else this.renderForecast();
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
            cubicInterpolationMode: 'monotone',
            segment: { borderColor: (c) => (c.p0.parsed.y < 0 || c.p1.parsed.y < 0 ? expCol : incCol) }
          }]
        },
        options: this.lineChartOptions({ autoSkip: true, maxTicksLimit: 8 })
      });
    },

    setForecastDays(days) { this._forecastDays = days; this.renderForecast(); },
    toggleForecastAccount(id, ev) {
      const all = this.visibleAccounts().map(account => account.id);
      const selected = new Set(this._forecastAccountIds == null ? all : this._forecastAccountIds);
      if (ev && ev.altKey) {
        selected.clear();
        selected.add(id);
      } else if (selected.has(id)) selected.delete(id);
      else selected.add(id);
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
