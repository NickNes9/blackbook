(function (root) {
  'use strict';

  const DAY = 86400000;
  const iso = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const atMidnight = (value) => {
    const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const addDays = (date, days) => new Date(date.getTime() + days * DAY);
  const monthKey = (date) => iso(date).slice(0, 7);
  const monthDate = (year, month, day) => new Date(year, month, Math.min(Math.max(day || 1, 1), new Date(year, month + 1, 0).getDate()));

  function rateFor(currency, baseCurrency, rates) {
    if (!currency || currency === baseCurrency) return 1;
    const entry = rates && rates[currency];
    const value = entry && typeof entry === 'object' ? entry.rate : entry;
    return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  }

  function toBase(amount, currency, baseCurrency, rates) {
    const rate = rateFor(currency, baseCurrency, rates);
    return rate == null ? null : Number(amount || 0) * rate;
  }

  function buildForecast(data, options) {
    const profile = data || {};
    const settings = profile.settings || {};
    const baseCurrency = options && options.baseCurrency || settings.baseCurrency || 'RSD';
    const rates = options && options.rates || settings.exchangeRates || {};
    const start = atMidnight(options && options.startDate || new Date()) || atMidnight(new Date());
    const days = Math.max(1, Math.min(365, Number(options && options.days) || 30));
    const end = addDays(start, days - 1);
    const accountIds = new Set((options && options.accountIds || []).filter(Boolean));
    const accounts = (profile.accounts || []).filter(a => !accountIds.size || accountIds.has(a.id));
    const balances = {};
    const warnings = [];
    const events = [];
    const included = new Set(accounts.map(a => a.id));

    for (const account of accounts) balances[account.id] = 0;
    for (const tx of profile.transactions || []) {
      if (tx.type === 'transfer') {
        if (included.has(tx.fromAccountId)) {
          const amount = toBase(tx.amount, tx.currency || baseCurrency, baseCurrency, rates);
          if (amount == null) warnings.push('Missing exchange rate for ' + (tx.currency || baseCurrency)); else balances[tx.fromAccountId] -= amount;
        }
        if (included.has(tx.toAccountId)) {
          const amount = toBase(tx.amountIn == null ? tx.amount : tx.amountIn, tx.currencyIn || tx.currency || baseCurrency, baseCurrency, rates);
          if (amount == null) warnings.push('Missing exchange rate for ' + (tx.currencyIn || tx.currency || baseCurrency)); else balances[tx.toAccountId] += amount;
        }
      } else if (included.has(tx.accountId)) {
        const amount = toBase(tx.amount, tx.currency || baseCurrency, baseCurrency, rates);
        if (amount == null) warnings.push('Missing exchange rate for ' + (tx.currency || baseCurrency)); else balances[tx.accountId] += amount;
      }
    }

    const push = (event) => {
      const date = atMidnight(event.date);
      if (!date || date < start || date > end || !included.has(event.accountId)) return;
      const amount = toBase(event.amount, event.currency || baseCurrency, baseCurrency, rates);
      if (amount == null) { warnings.push('Missing exchange rate for ' + (event.currency || baseCurrency)); return; }
      events.push({ ...event, date: iso(date), baseAmount: amount });
    };
    const hasBillPayment = (bill, key) => (profile.billPayments || []).some(p => p.billId === bill.id && p.month === key) ||
      (profile.transactions || []).some(tx => tx.billId === bill.id && String(tx.date || '').slice(0, 7) === key);

    for (const bill of profile.bills || []) {
      if (bill.active === false || bill.amount == null || !bill.payAccountId || String(bill.payAccountId).startsWith('card:')) continue;
      for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
        const due = monthDate(cursor.getFullYear(), cursor.getMonth(), Number(bill.dueDay) || 1);
        const key = monthKey(due);
        if (!hasBillPayment(bill, key)) push({ kind: 'bill', name: bill.name || 'Bill', date: iso(due), amount: -Math.abs(Number(bill.amount)), currency: bill.currency, accountId: bill.payAccountId, sourceId: bill.id });
      }
    }

    for (const item of profile.recurringTemplates || []) {
      if (item.active === false || !item.accountId || !item.amount) continue;
      const interval = item.interval === 'weekly' ? 7 : item.interval === 'biweekly' ? 14 : 30;
      let due = atMidnight(item.startDate || start) || start;
      while (due < start) due = addDays(due, interval);
      while (due <= end) {
        push({ kind: 'recurring', name: item.name || 'Recurring item', date: iso(due), amount: Number(item.amount), currency: item.currency, accountId: item.accountId, sourceId: item.id });
        due = addDays(due, interval);
      }
    }

    for (const inst of profile.installments || []) {
      if (!inst.cardId || !inst.startMonth || !inst.months) continue;
      const card = (profile.creditCards || []).find(c => c.id === inst.cardId);
      const accountId = inst.payAccountId || card && card.payAccountId;
      if (!accountId || !included.has(accountId)) continue;
      const paid = Array.isArray(inst.paid) ? inst.paid : [];
      for (let seq = 1; seq <= Number(inst.months); seq++) {
        if (paid.some(p => (typeof p === 'number' ? p : p.seq) === seq)) continue;
        const startMonth = atMidnight(inst.startMonth + '-01');
        if (!startMonth) continue;
        const due = monthDate(startMonth.getFullYear(), startMonth.getMonth() + seq - 1, Number(inst.dueDay) || card && card.dueDay || 15);
        const monthly = Number(inst.total || 0) / Number(inst.months || 1);
        const interest = seq === 1 ? Number(inst.total || 0) * Number(inst.ratePct == null ? 5 : inst.ratePct) / 100 : 0;
        push({ kind: 'installment', name: inst.name || 'Card installment', date: iso(due), amount: -(monthly + interest), currency: inst.currency || baseCurrency, accountId, sourceId: inst.id });
      }
    }

    // Invoices and personal debts have no account field today. When enabled, they
    // deliberately use the selected/default cash account rather than silently
    // affecting every account.
    const forecastAccountId = options && options.forecastAccountId || settings.defaultAccountId;
    if (forecastAccountId && included.has(forecastAccountId) && options && options.includeInvoices) {
      for (const invoice of profile.invoices || []) {
        const total = (invoice.lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0);
        const remaining = Math.max(0, total - Math.abs(Number(invoice.amountPaid || 0)));
        if (!remaining || !invoice.dueDate) continue;
        push({ kind: 'invoice', name: invoice.party || 'Invoice', date: invoice.dueDate, amount: invoice.dir === 'out' ? remaining : -remaining, currency: invoice.currency, accountId: forecastAccountId, sourceId: invoice.id });
      }
    }
    if (forecastAccountId && included.has(forecastAccountId) && options && options.includeDebts) {
      for (const debt of profile.debts || []) {
        const paid = (debt.payments || []).reduce((sum, payment) => sum + Math.abs(Number(payment.amount || 0)), 0);
        const remaining = Math.max(0, Math.abs(Number(debt.amount || 0)) - paid);
        if (!remaining || !debt.dueDate) continue;
        push({ kind: 'debt', name: debt.person || 'Debt', date: debt.dueDate, amount: debt.type === 'in' ? remaining : -remaining, currency: debt.currency, accountId: forecastAccountId, sourceId: debt.id });
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const daily = [];
    const running = { ...balances };
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = iso(cursor);
      const dayEvents = events.filter(event => event.date === key);
      for (const event of dayEvents) running[event.accountId] = (running[event.accountId] || 0) + event.baseAmount;
      daily.push({ date: key, events: dayEvents, balances: { ...running }, total: Object.values(running).reduce((sum, value) => sum + value, 0) });
    }
    const shortfalls = daily.flatMap(day => Object.entries(day.balances).filter(([, value]) => value < -0.009).map(([accountId, balance]) => ({ date: day.date, accountId, balance })));
    return { baseCurrency, start: iso(start), end: iso(end), openingBalances: balances, events, daily, shortfalls, warnings: [...new Set(warnings)] };
  }

  root.ForecastEngine = { buildForecast, toBase };
})(globalThis);
