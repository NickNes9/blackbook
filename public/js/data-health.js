(function () {
  function scan(data) {
    const issues = [], lists = {}, ids = {};
    for (const name of ['accounts', 'creditCards', 'categories', 'transactions', 'bills', 'invoices', 'debts', 'savingsGoals', 'installments']) {
      lists[name] = Array.isArray(data[name]) ? data[name].filter(Boolean) : [];
      ids[name] = new Set();
      for (const item of lists[name]) {
        if (item.id && ids[name].has(item.id)) issues.push({ collection: name, id: item.id, kind: 'duplicate-id', message: 'Duplicate record identifier; links may be ambiguous.' });
        if (item.id) ids[name].add(item.id);
      }
    }
    const add = (collection, item, message, kind = 'broken-link') => {
      const issue = { collection, id: item.id, kind, message };
      issues.push(issue);
      return issue;
    };
    const ref = (collection, item, field, target) => {
      const label = { accounts: 'account', creditCards: 'credit card', categories: 'category', debts: 'debt', invoices: 'invoice', bills: 'bill', installments: 'installment plan' }[target] || target;
      if (item[field] && !ids[target].has(item[field])) {
        const issue = add(collection, item, 'Linked ' + label + ' no longer exists (' + item[field] + ').');
        issue.field = field;
        issue.target = target;
      }
    };
    const signatures = new Map();
    const entries = new Set(lists.savingsGoals.flatMap(g => (g.entries || []).map(e => e.id)));
    for (const tx of lists.transactions) {
      for (const [field, target] of Object.entries({ accountId: 'accounts', fromAccountId: 'accounts', toAccountId: 'accounts', cardId: 'creditCards', categoryId: 'categories', debtId: 'debts', invoiceId: 'invoices', billId: 'bills', installId: 'installments' })) ref('transactions', tx, field, target);
      if (tx.linkId && !entries.has(tx.linkId)) add('transactions', tx, 'Missing savings entry.');
      const slot = /^inst-(.+)-s\d+$/.exec(tx.pairId || '');
      if (slot && !ids.installments.has(slot[1])) add('transactions', tx, 'Missing installment plan.');
      if (!tx.date || !Number.isFinite(tx.amount)) continue;
      const signature = JSON.stringify([tx.type, tx.date, tx.amount, tx.currency, tx.accountId, tx.cardId, tx.fromAccountId, tx.toAccountId, tx.categoryId, tx.note || '']);
      if (signatures.has(signature)) {
        const previous = signatures.get(signature);
        const relatedIds = [...previous, tx].map(item => item.id).filter(Boolean);
        for (const item of previous) {
          let priorIssue = issues.find(issue => issue.collection === 'transactions' && issue.kind === 'possible-duplicate' && issue.id === item.id);
          if (!priorIssue) priorIssue = add('transactions', item, 'Possible duplicate transaction; review before changing anything.', 'possible-duplicate');
          priorIssue.relatedIds = relatedIds;
        }
        const currentIssue = add('transactions', tx, 'Possible duplicate transaction; review before changing anything.', 'possible-duplicate');
        currentIssue.relatedIds = relatedIds;
        previous.push(tx);
      } else signatures.set(signature, [tx]);
    }
    for (const pay of (data.billPayments || [])) {
      const bill = lists.bills.find(b => b.id === pay.billId);
      const owner = bill || { id: pay.billId };
      if (!bill) add('bills', owner, 'Payment refers to a missing bill.');
      const paymentTxIds = [...(Array.isArray(pay.relatedTxIds) ? pay.relatedTxIds : []), pay.txId];
      for (const txId of paymentTxIds) if (txId && !ids.transactions.has(txId)) add('bills', owner, 'Missing payment transaction for ' + (pay.month || 'this bill') + ': ' + txId + '.');
    }
    for (const collection of ['invoices', 'debts']) for (const item of lists[collection]) {
      for (const pay of (item.payments || [])) if (pay.txId && !ids.transactions.has(pay.txId)) add(collection, item, 'Missing payment transaction: ' + pay.txId);
    }
    for (const item of lists.bills) {
      ref('bills', item, 'categoryId', 'categories');
      const paymentAccount = item.payAccountId || item.payFrom;
      if (paymentAccount) {
        const card = String(paymentAccount).startsWith('card:');
        if (!(card ? ids.creditCards : ids.accounts).has(card ? paymentAccount.slice(5) : paymentAccount)) add('bills', item, 'Missing payment account.');
      }
    }
    for (const item of lists.installments) { ref('installments', item, 'cardId', 'creditCards'); ref('installments', item, 'accountId', 'accounts'); ref('installments', item, 'payAccountId', 'accounts'); }
    for (const item of lists.creditCards) ref('creditCards', item, 'payAccountId', 'accounts');
    for (const collection of ['invoices', 'debts']) for (const item of lists[collection]) ref(collection, item, 'categoryId', 'categories');
    const linkedEntries = new Set(lists.transactions.flatMap(tx => [tx.id, tx.linkId]).filter(Boolean));
    for (const goal of lists.savingsGoals) for (const entry of (goal.entries || [])) {
      if (!linkedEntries.has(entry.id)) add('savingsGoals', goal, 'Savings entry has no linked transaction: ' + entry.id);
    }
    const settings = data.settings || {}, base = settings.baseCurrency || 'RSD', rates = settings.rates || {};
    const rateOk = code => code === 'EUR' || Number.isFinite(Number(rates[code] && rates[code].rate)) && Number(rates[code].rate) > 0;
    for (const account of lists.accounts) {
      const currency = account.currency || base;
      if (currency !== base && (!rateOk(currency) || !rateOk(base))) add('accounts', account, 'Missing exchange rate for ' + currency + ' → ' + base + '.', 'missing-rate');
    }
    return issues;
  }

  function recurring(data) {
    const transactions = Array.isArray(data.transactions) ? data.transactions.filter(Boolean) : [];
    const accountIds = new Set((data.accounts || []).map(item => item.id));
    const cardIds = new Set((data.creditCards || []).map(item => item.id));
    const linked = new Set();
    for (const item of [...(data.billPayments || []), ...(data.invoices || []), ...(data.debts || [])]) {
      if (item.txId) linked.add(item.txId);
      if (Array.isArray(item.relatedTxIds)) for (const txId of item.relatedTxIds) if (txId) linked.add(txId);
      for (const payment of item.payments || []) if (payment && payment.txId) linked.add(payment.txId);
    }
    for (const goal of data.savingsGoals || []) for (const entry of goal.entries || []) if (entry && entry.txId) linked.add(entry.txId);
    const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const rules = Array.isArray(data.recurringRules) ? data.recurringRules.filter(rule => rule && rule.active !== false) : [];
    const ignoredByRule = (note, source) => rules.some(rule => rule.action === 'ignore' && rule.match && normalize(note).includes(normalize(rule.match)) && (!rule.source || rule.source === source));
    const ignored = new Set(['payment', 'purchase', 'transaction', 'transfer', 'card', 'online', 'monthly', 'invoice', 'bill']);
    const tokens = value => normalize(value).split(' ').filter(token => token.length > 2 && !/^\d+$/.test(token));
    const similar = (left, right) => {
      if (left === right) return true;
      const a = new Set(tokens(left)), b = new Set(tokens(right));
      if (!a.size || !b.size) return false;
      let common = 0;
      for (const token of a) if (b.has(token)) common++;
      return common / Math.min(a.size, b.size) >= 0.5 || left.includes(right) || right.includes(left);
    };
    const dayNumber = value => {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
      return match ? Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000) : NaN;
    };
    const cadenceFor = gap => gap >= 5 && gap <= 9 ? 'weekly' : gap >= 24 && gap <= 38 ? 'monthly' : gap >= 330 && gap <= 400 ? 'annual' : null;
    const groups = [];
    const buckets = new Map();
    for (const tx of transactions) {
      if (!tx || tx.balanceCorrection || tx.type === 'transfer' || !['expense', 'income'].includes(tx.type) || !tx.note || linked.has(tx.id)) continue;
      if (tx.billId || tx.invoiceId || tx.debtId || tx.linkId || tx.installId || tx.pairId) continue;
      const source = tx.cardId ? 'card:' + tx.cardId : tx.accountId ? 'account:' + tx.accountId : '';
      if (!source) continue;
      if (source.startsWith('card:') ? !cardIds.has(source.slice(5)) : !accountIds.has(source.slice('account:'.length))) continue;
      if (ignoredByRule(tx.note, source)) continue;
      const note = normalize(tx.note);
      const firstToken = tokens(note).find(token => !ignored.has(token));
      if (!note || !firstToken) continue;
      const currency = tx.nativeCurrency || tx.currency || (data.settings || {}).baseCurrency || 'RSD';
      const key = [tx.type, source, currency, firstToken].join('|');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ tx, note, currency, source });
    }
    for (const bucket of buckets.values()) {
      const clusters = [];
      for (const item of bucket) {
        let cluster = clusters.find(candidate => similar(candidate.note, item.note));
        if (!cluster) { cluster = { note: item.note, items: [] }; clusters.push(cluster); }
        cluster.items.push(item);
      }
      for (const cluster of clusters) {
        if (cluster.items.length < 2) continue;
        const dated = cluster.items.map(item => ({ ...item, day: dayNumber(item.tx.date) })).filter(item => Number.isFinite(item.day)).sort((a, b) => a.day - b.day);
        if (dated.length < 2) continue;
        const counts = { weekly: 0, monthly: 0, annual: 0 };
        const members = { weekly: new Set(), monthly: new Set(), annual: new Set() };
        for (let i = 1; i < dated.length; i++) {
          const cadence = cadenceFor(dated[i].day - dated[i - 1].day);
          if (!cadence) continue;
          counts[cadence]++;
          members[cadence].add(dated[i - 1]);
          members[cadence].add(dated[i]);
        }
        const cadence = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        if (!counts[cadence]) continue;
        const occurrences = [...members[cadence]].sort((a, b) => a.day - b.day);
        const latest = occurrences[occurrences.length - 1];
        const amounts = occurrences.map(item => Math.abs(Number(item.tx.nativeAmount ?? item.tx.amount) || 0));
        const categoryRule = rules.find(rule => rule.action === 'category' && rule.categoryId && rule.match && normalize(latest.tx.note).includes(normalize(rule.match)) && (!rule.source || rule.source === latest.source));
        const categories = new Set(occurrences.map(item => item.tx.categoryId || ''));
        const deltas = [];
        for (let i = 1; i < occurrences.length; i++) deltas.push(occurrences[i].day - occurrences[i - 1].day);
        const medianGap = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] || 30;
        const descriptionVariants = new Set(occurrences.map(item => item.note));
        groups.push({
          description: latest.tx.note,
          type: latest.tx.type,
          currency: latest.currency,
          source: latest.source,
          cadence,
          intervalDays: medianGap,
          transactions: occurrences.map(item => item.tx),
          amountMin: Math.min(...amounts),
          amountMax: Math.max(...amounts),
          suggestedAmount: amounts[amounts.length - 1],
          dueDay: Number(String(latest.tx.date).slice(8, 10)) || 1,
          dueMonth: Number(String(latest.tx.date).slice(5, 7)) || 1,
          installmentClue: latest.source.startsWith('card:') && /\b(?:installment|instalment|part\s+\d+\s*(?:of|\/)\s*\d+|\d+\s*\/\s*\d+)\b/i.test(latest.tx.note || ''),
          categoryId: categoryRule ? categoryRule.categoryId : categories.size === 1 ? occurrences[0].tx.categoryId || '' : '',
          confidence: occurrences.length >= 3 && descriptionVariants.size === 1 ? 'Likely' : 'Possible'
        });
      }
    }
    return groups.sort((a, b) => String(a.description).localeCompare(String(b.description), undefined, { sensitivity: 'base' }));
  }
  window.DataHealth = { scan, recurring };
})();
