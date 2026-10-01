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
      if (item[field] && !ids[target].has(item[field])) add(collection, item, 'Linked ' + label + ' no longer exists (' + item[field] + ').');
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
      if (pay.txId && !ids.transactions.has(pay.txId)) add('bills', owner, 'Missing payment transaction for ' + (pay.month || 'this bill') + '.');
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
  window.DataHealth = { scan };
})();
