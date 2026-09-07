(function () {
  Object.assign(window.BlackBook, {
    forecastResult() {
      return window.ForecastEngine.buildForecast(this.data, {
        startDate: this.today(), days: this._forecastDays || 30,
        accountIds: this._forecastAccountIds || [], baseCurrency: this.baseCurrency(), rates: this.getRates()
      });
    },

    renderForecast() {
      const el = document.getElementById('page-forecast');
      if (!el || !window.ForecastEngine) return;
      const result = this.forecastResult();
      const accounts = this.visibleAccounts();
      const selected = new Set(this._forecastAccountIds || []);
      const final = result.daily[result.daily.length - 1];
      const eventRows = result.events.length ? result.events.map(event =>
        '<div class="forecast-event"><span>' + this.escapeHtml(event.date) + '</span><span class="forecast-kind">' + this.escapeHtml(event.kind.toUpperCase()) + '</span><span>' + this.escapeHtml(event.name) + '</span><span class="' + (event.baseAmount < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(event.baseAmount) + '</span></div>').join('') :
        '<div class="empty-state"><div class="empty-state-text">Nothing scheduled in this period.</div></div>';
      el.innerHTML = '<div class="month-picker"><span class="mp-year-label">CASH FORECAST</span><span style="flex:1"></span>' +
        [30, 60, 90].map(days => '<button class="btn btn-sm ' + ((this._forecastDays || 30) === days ? 'btn-primary' : 'btn-secondary') + '" onclick="BlackBook.setForecastDays(' + days + ')">' + days + ' DAYS</button>').join(' ') +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.openRecurringTemplate()">+ RECURRING</button></div>' +
        '<div class="forecast-account-filters">' + accounts.map(account => '<label><input type="checkbox" ' + (!selected.size || selected.has(account.id) ? 'checked' : '') + ' onchange="BlackBook.toggleForecastAccount(\'' + account.id + '\', this.checked)"> ' + this.escapeHtml(account.name) + '</label>').join('') + '</div>' +
        '<div class="month-summary"><div class="month-summary-item"><span class="month-summary-label">OPENING</span><span class="month-summary-value">' + this.fmtBase(Object.values(result.openingBalances).reduce((sum, amount) => sum + amount, 0)) + '</span></div><div class="month-summary-item"><span class="month-summary-label">ENDING</span><span class="month-summary-value ' + (final && final.total < 0 ? 'amount-negative' : 'amount-positive') + '">' + this.fmtBase(final ? final.total : 0) + '</span></div><div class="month-summary-item"><span class="month-summary-label">SHORTFALLS</span><span class="month-summary-value ' + (result.shortfalls.length ? 'amount-negative' : 'amount-positive') + '">' + result.shortfalls.length + '</span></div></div>' +
        (result.warnings.length ? '<div class="forecast-warning">' + this.escapeHtml(result.warnings.join(' · ')) + '. Amounts without a rate are excluded.</div>' : '') +
        '<div class="list-sep"></div><div class="page-scroll-wrap"><div class="forecast-list">' + eventRows + '</div></div>';
    },

    setForecastDays(days) { this._forecastDays = days; this.renderForecast(); },
    toggleForecastAccount(id, checked) {
      const all = this.visibleAccounts().map(account => account.id);
      const selected = new Set(this._forecastAccountIds || all);
      if (checked) selected.add(id); else selected.delete(id);
      this._forecastAccountIds = [...selected]; this.renderForecast();
    },

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
