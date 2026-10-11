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
    const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const rules = Array.isArray(data.recurringRules) ? data.recurringRules.filter(rule => rule && rule.active !== false) : [];
    const ignoredByRule = (note, source) => rules.some(rule => rule.action === 'ignore' && rule.match && normalize(note).includes(normalize(rule.match)) && (!rule.source || rule.source === source));
    const ignored = new Set(['payment','purchase','transaction','transfer','card','online','monthly','invoice','bill','paid','for','the','and','rsd','eur','usd','january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec','reference','ref']);
    const tokens = value => [...new Set(normalize(value).split(' ').filter(token => token.length > 1 && !/\d/.test(token) && !ignored.has(token)))];
    const similar = (left, right) => {
      if (left === right) return true;
      const a = new Set(tokens(left)), b = new Set(tokens(right));
      if (!a.size || !b.size) return false;
      let common = 0;
      for (const token of a) if (b.has(token)) common++;
      const union = a.size + b.size - common;
      if (common >= 2 && (common / union >= 0.65 || common / Math.max(a.size,b.size) >= 0.8)) return true;
      return a.size === 1 && b.size === 1 && common === 1;
    };
    const dayNumber = value => {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
      if (!match) return NaN;
      const date = new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
      if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2])-1 || date.getUTCDate() !== Number(match[3])) return NaN;
      return Math.floor(date.getTime()/86400000);
    };
    const cadenceFor = (left,right) => {
      const gap = right.day-left.day;
      const a = new Date(left.day*86400000), b = new Date(right.day*86400000);
      const months = (b.getUTCFullYear()-a.getUTCFullYear())*12 + b.getUTCMonth()-a.getUTCMonth();
      const endA = a.getUTCDate() >= new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0)).getUTCDate()-2;
      const endB = b.getUTCDate() >= new Date(Date.UTC(b.getUTCFullYear(),b.getUTCMonth()+1,0)).getUTCDate()-2;
      const alignedDay = Math.abs(a.getUTCDate()-b.getUTCDate()) <= 7 || endA && endB;
      if (months >= 1 && months <= 3 && alignedDay && gap >= 20) return 'monthly';
      if ((months === 12 || months === 24) && alignedDay && Math.abs(gap-months/12*365) <= 14) return 'annual';
      if (gap >= 5 && gap <= 30 && Math.abs(gap-Math.round(gap/7)*7) <= 2) return 'weekly';
      return null;
    };
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
      const key = 'descriptions';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ tx, note, currency, source });
    }
    for (const bucket of buckets.values()) {
      const clusters = [];
      const tokenIndex = new Map();
      for (const item of bucket.slice().sort((a,b) => tokens(a.note).length-tokens(b.note).length || a.note.localeCompare(b.note) || String(a.tx.date).localeCompare(String(b.tx.date)))) {
        const words = tokens(item.note);
        const candidates = new Set(words.flatMap(word => [...(tokenIndex.get(word) || [])]));
        const mentionMatch = candidate => {
          const original = String(candidate.items[0]?.tx.note || '').trim().toLowerCase();
          return original.startsWith('@') && String(item.tx.note).toLowerCase().includes(original);
        };
        let cluster = [...candidates].filter(candidate => similar(candidate.note,item.note)).sort((a,b) => Number(b.note === item.note)-Number(a.note === item.note) || Number(mentionMatch(b))-Number(mentionMatch(a)) || tokens(a.note).length-tokens(b.note).length)[0];
        if (!cluster) { cluster = { note:item.note, samples:[item.note], items:[] }; clusters.push(cluster); }
        if (!cluster.samples.includes(item.note) && cluster.samples.length < 8) cluster.samples.push(item.note);
        cluster.items.push(item);
        for (const word of words) { if (!tokenIndex.has(word)) tokenIndex.set(word,new Set()); tokenIndex.get(word).add(cluster); }
      }
      for (const cluster of clusters) {
        if (cluster.items.length < 2) continue;
        const dated = cluster.items.map(item => ({ ...item, day: dayNumber(item.tx.date) })).filter(item => Number.isFinite(item.day)).sort((a, b) => a.day - b.day);
        if (dated.length < 2) continue;
        const counts = { weekly: 0, monthly: 0, annual: 0 };
        const members = { weekly: new Set(), monthly: new Set(), annual: new Set() };
        for (let i = 1; i < dated.length; i++) {
          if (dated[i].day === dated[i-1].day) continue;
          const cadence = cadenceFor(dated[i - 1],dated[i]);
          if (!cadence) continue;
          counts[cadence]++;
          members[cadence].add(dated[i - 1]);
          members[cadence].add(dated[i]);
        }
        let cadence = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const distinctDays = new Set(dated.map(item => item.day)).size;
        if (!counts[cadence] || counts[cadence] / Math.max(1,distinctDays-1) < 0.6) cadence = 'irregular';
        const occurrences = dated;
        const latest = occurrences[occurrences.length - 1];
        const amounts = occurrences.map(item => Math.abs(Number(item.tx.nativeAmount ?? item.tx.amount) || 0));
        const categoryRule = rules.find(rule => rule.action === 'category' && rule.categoryId && rule.match && normalize(latest.tx.note).includes(normalize(rule.match)) && (!rule.source || rule.source === latest.source));
        const categories = new Set(occurrences.map(item => item.tx.categoryId || ''));
        const deltas = [];
        for (let i = 1; i < occurrences.length; i++) deltas.push(occurrences[i].day - occurrences[i - 1].day);
        const medianGap = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] || 30;
        const descriptionVariants = new Set(occurrences.map(item => item.note));
        const sources = [...new Set(occurrences.map(item => item.source))];
        const types = [...new Set(occurrences.map(item => item.tx.type))];
        const currencies = [...new Set(occurrences.map(item => item.currency))];
        const amountRanges = currencies.map(currency => {
          const values = occurrences.filter(item => item.currency === currency).map(item => Math.abs(Number(item.tx.nativeAmount ?? item.tx.amount) || 0));
          return {currency,min:Math.min(...values),max:Math.max(...values)};
        });
        const patternBuckets = new Map();
        for (const item of occurrences) {
          const key = [item.source,item.tx.type,item.currency].join('|');
          if (!patternBuckets.has(key)) patternBuckets.set(key,[]);
          patternBuckets.get(key).push(item);
        }
        const patterns = [];
        for (const entries of patternBuckets.values()) {
          const unique = [...new Map(entries.map(item => [item.day,item])).values()];
          const intervals = {weekly:0,monthly:0,annual:0};
          for (let i=1;i<unique.length;i++) { const detected = cadenceFor(unique[i-1],unique[i]); if (detected) intervals[detected]++; }
          const best = Object.keys(intervals).sort((a,b)=>intervals[b]-intervals[a])[0];
          if (unique.length >= 2 && intervals[best]/(unique.length-1) >= 0.6) patterns.push({source:entries[0].source,type:entries[0].tx.type,currency:entries[0].currency,cadence:best,count:entries.length});
        }
        if (patterns.length) cadence = [...new Set(patterns.map(pattern=>pattern.cadence))].length === 1 ? patterns[0].cadence : 'mixed';
        else cadence = 'irregular';
        groups.push({
          description: latest.tx.note,
          type: types.length === 1 ? types[0] : 'mixed',
          currency: latest.currency,
          source: sources.length === 1 ? sources[0] : '',
          sources, types, currencies, amountRanges, patterns,
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
