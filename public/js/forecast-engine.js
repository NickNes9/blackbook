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

  function transactionToBase(tx, baseCurrency, rates) {
    if (tx && tx.currency === baseCurrency) return Number(tx.amount) || 0;
    if (tx && tx.nativeCurrency === baseCurrency && tx.nativeAmount != null) return Number(tx.nativeAmount) || 0;
    return tx ? toBase(tx.amount, tx.currency || baseCurrency, baseCurrency, rates) : 0;
  }

  function transactionBalanceParts(tx, baseCurrency) {
    const settlements = tx && tx.settlements;
    if (!tx || !Array.isArray(settlements) || !settlements.length) return [tx];
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
    const close = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 0.005;
    const primaryCurrency = tx.currency || baseCurrency;
    const incomingCurrency = tx.currencyIn || primaryCurrency;
    const isTransfer = tx.type === 'transfer';
    let amountTotal = 0;
    let amountInTotal = 0;
    let nativeTotal = 0;
    const parts = [];

    for (const item of settlements) {
      if (!item || !validDate(item.date) || item.currency !== primaryCurrency || item.amount == null || !Number.isFinite(Number(item.amount))) return [tx];
      const part = { ...item, amount: Number(item.amount) };
      amountTotal += part.amount;
      if (isTransfer) {
        if (tx.amountIn != null) {
          if (item.amountIn == null || !Number.isFinite(Number(item.amountIn)) || (item.currencyIn || incomingCurrency) !== incomingCurrency) return [tx];
          part.amountIn = Number(item.amountIn);
          part.currencyIn = item.currencyIn || incomingCurrency;
          amountInTotal += part.amountIn;
        } else if (item.amountIn != null || item.currencyIn != null) return [tx];
        if (item.nativeAmount != null || item.nativeCurrency != null) return [tx];
      } else {
        if (item.amountIn != null || item.currencyIn != null) return [tx];
        if (tx.nativeAmount != null) {
          const nativeCurrency = tx.nativeCurrency || primaryCurrency;
          if (item.nativeAmount == null || !Number.isFinite(Number(item.nativeAmount)) || (item.nativeCurrency || nativeCurrency) !== nativeCurrency) return [tx];
          part.nativeAmount = Number(item.nativeAmount);
          part.nativeCurrency = item.nativeCurrency || nativeCurrency;
          nativeTotal += part.nativeAmount;
        } else if (item.nativeAmount != null || item.nativeCurrency != null) return [tx];
      }
      parts.push(part);
    }

    if (!close(amountTotal, tx.amount)) return [tx];
    if (isTransfer && tx.amountIn != null && !close(amountInTotal, tx.amountIn)) return [tx];
    if (!isTransfer && tx.nativeAmount != null && !close(nativeTotal, tx.nativeAmount)) return [tx];
    return parts;
  }

  function buildForecast(data, options) {
    const profile = data || {};
    const settings = profile.settings || {};
    const baseCurrency = options && options.baseCurrency || settings.baseCurrency || 'RSD';
    const rates = options && options.rates || settings.exchangeRates || {};
    const start = atMidnight(options && options.startDate || new Date()) || atMidnight(new Date());
    const days = Math.max(1, Math.min(365, Number(options && options.days) || 30));
    const end = addDays(start, days - 1);
    const hasAccountFilter = !!(options && Array.isArray(options.accountIds));
    const accountIds = new Set(hasAccountFilter ? options.accountIds.filter(Boolean) : []);
    const accounts = (profile.accounts || []).filter(a => !hasAccountFilter || accountIds.has(a.id));
    const balances = {};
    const warnings = [];
    const events = [];
    const included = new Set(accounts.map(a => a.id));

    for (const account of accounts) balances[account.id] = 0;
    for (const tx of profile.transactions || []) {
      for (const part of transactionBalanceParts(tx, baseCurrency)) {
        if (tx.type === 'transfer') {
          if (included.has(tx.fromAccountId)) {
            const amount = toBase(part.amount, part.currency || baseCurrency, baseCurrency, rates);
            if (amount == null) warnings.push('Missing exchange rate for ' + (part.currency || baseCurrency)); else balances[tx.fromAccountId] -= amount;
          }
          if (included.has(tx.toAccountId)) {
            const amount = toBase(part.amountIn == null ? part.amount : part.amountIn, part.currencyIn || part.currency || baseCurrency, baseCurrency, rates);
            if (amount == null) warnings.push('Missing exchange rate for ' + (part.currencyIn || part.currency || baseCurrency)); else balances[tx.toAccountId] += amount;
          }
        } else if (included.has(tx.accountId)) {
          const amount = transactionToBase(part, baseCurrency, rates);
          if (amount == null) warnings.push('Missing exchange rate for ' + (part.currency || baseCurrency)); else balances[tx.accountId] += amount;
        }
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
        if (bill.frequency === 'annual' && (Number(bill.dueMonth) || 1) !== cursor.getMonth() + 1) continue;
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

  root.ForecastEngine = { buildForecast, toBase, transactionBalanceParts };
})(globalThis);
