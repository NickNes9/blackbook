import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../public/js/page-cards.js', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../public/js/page-overview.js', import.meta.url), 'utf8');
const savings = readFileSync(new URL('../public/js/page-savings.js', import.meta.url), 'utf8');
const debts = readFileSync(new URL('../public/js/page-debts.js', import.meta.url), 'utf8');
const invoices = readFileSync(new URL('../public/js/page-invoices.js', import.meta.url), 'utf8');
const bills = readFileSync(new URL('../public/js/page-bills.js', import.meta.url), 'utf8');

function loadApp(...sources) {
  const context = { window: {}, localStorage: { getItem: () => '' } };
  vm.runInNewContext(core, context);
  for (const source of sources) vm.runInNewContext(source, context);
  return context.window.BlackBook;
}

test('linked transaction navigation sets the transaction month and requests an exact Overview focus', () => {
  const app = loadApp();
  const tx = { id: 'tx-linked-1', date: '2026-04-17' };
  app.data = { transactions: [tx] };
  app.ymOf = date => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 });
  let navigatedTo = null;
  app.navigateTo = page => { navigatedTo = page; };

  app.openLinkedTransaction(tx.id);

  assert.equal(app._linkedTransactionFocusId, tx.id);
  assert.deepEqual(Array.from(app._bulkSel), [tx.id]);
  assert.equal(app._bulkOnly, false);
  assert.deepEqual(JSON.parse(JSON.stringify(app._pageView.overview)), { y: 2026, m: 3 });
  assert.equal(navigatedTo, 'overview');
});

test('linked transaction actions are omitted for missing transactions and target the exact ID otherwise', () => {
  const app = loadApp();
  app.data = { transactions: [{ id: 'tx-one' }] };
  assert.equal(app.linkedTransactionButton('missing'), '');
  const button = app.linkedTransactionButton('tx-one');
  assert.match(button, /data-tx-id="tx-one"/);
  assert.match(button, /openLinkedTransaction\(this\.dataset\.txId\)/);
  assert.match(button, /class="transaction-link-icon"/);
  assert.doesNotMatch(button, /↗|&#8594;|→/);
});

test('a linked transaction stays visible and selected even when Overview filters would hide it', () => {
  const app = loadApp(overview);
  const tx = { id: 'tx-hidden-by-filter', date: '2026-04-17', type: 'expense', amount: -25, currency: 'RSD', accountId: 'account-1', categoryId: 'category-1', note: 'Linked payment' };
  app.data = { transactions: [tx], accounts: [{ id: 'account-1', shortName: 'CHK', name: 'Checking' }], creditCards: [], categories: [{ id: 'category-1', name: 'Bills' }], settings: {} };
  app._linkedTransactionFocusId = tx.id;
  app._bulkSel = new Set([tx.id]);
  app.selectedAccount = 'another-account';
  app.ymOf = date => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 });
  app.vy = () => 2026;
  app.vm = () => 3;
  app.overviewCategoryMatches = () => false;
  app.ovActiveTypes = () => 'income';
  app.toBase = value => value;
  app.accountColor = () => '#fff';
  app.categoryColor = () => '#fff';
  app.fmtDateInput = value => value;
  app.fmtDualCurrency = () => '25 RSD';
  app.linkedRecordType = () => null;
  app.matchingUnpaidBill = () => null;
  app.xIcon = () => 'x';

  const html = app.recentTransactionsHtml();

  assert.match(html, /id="tx-row-tx-hidden-by-filter"/);
  assert.match(html, /class="tx-row linked-transaction-focus bulk-selected"/);
});

test('installment progress marks each boundary between installments', () => {
  const app = loadApp(cards);
  const markers = app.installmentProgressMarkers(4);
  assert.deepEqual(markers.match(/<i class="inst-progress-marker" style="left:\d+%;"><\/i>/g),
    [25, 50, 75].map(percent => `<i class="inst-progress-marker" style="left:${percent}%;"></i>`));
  assert.equal(app.installmentProgressMarkers(1), '');
});

test('installment progress markers are 2px wide and use the app background color', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const rule = css.match(/\.inst-progress-marker\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(rule, /width\s*:\s*2px/);
  assert.match(rule, /background\s*:\s*var\(--bg\)/);
  assert.doesNotMatch(rule, /opacity\s*:/);
});

test('installment plan progress shows the boundaries and links a paid installment to its own transaction', () => {
  const app = loadApp(cards);
  const tx = { id: 'payment-1', pairId: 'inst-plan-1-s1', date: '2026-01-15' };
  app.data = { transactions: [tx] };
  app.cardColor = () => '#123456';
  app.instCard = () => ({ id: 'card-1' });
  app.instIsClosed = () => false;
  app.instPaidEntries = () => [{ seq: 1, via: 'tx' }];
  app.instOutstanding = () => 75;
  app.instGrandTotal = () => 100;
  app.instMonthlyAmount = () => 25;
  app.instInterest = () => 0;
  app.instPurchaseTx = () => null;
  app.instDueAmount = () => 25;
  app.mkOfSeq = () => '2026-01';
  app.monthLabel = () => 'JAN 2026';
  app.fmtBase = amount => String(amount);
  app.fmtDateInput = date => date;
  app.focusRecordHtml = () => '';
  app.xIcon = () => 'x';

  const html = app.planBlockHtml({ id: 'plan-1', cardId: 'card-1', name: 'Phone', total: 100, months: 4, startMonth: '2026-01', paid: [{ seq: 1, via: 'tx' }] });

  assert.equal((html.match(/class="inst-progress-marker"/g) || []).length, 3);
  assert.match(html, /inst-paid-date">2026-01-15/);
  assert.match(html, /data-tx-id="payment-1"/);
});

test('savings, debt, and invoice histories show their linked payment date and exact transaction action', () => {
  const app = loadApp(savings, debts, invoices);
  const tx = { id: 'tx-history', linkId: 'entry-1', date: '2026-03-09', amount: -18, currency: 'EUR' };
  app.data = { transactions: [tx] };
  app.fmtBase = amount => String(amount);
  app.fmtAmount = (amount, currency) => `${amount} ${currency}`;
  app.fmtDateInput = date => date;
  app.xIcon = () => '×';

  const savingsHtml = app.savingsEntriesHtml({ id: 'goal-1', entries: [{ id: 'entry-1', date: tx.date, amount: 18 }] });
  const debtHtml = app.debtPaymentHistoryHtml({ id: 'debt-1', currency: 'EUR' }, [{ txId: tx.id, date: tx.date, amount: 18 }]);
  const invoiceHtml = app.invoicePaymentHistoryHtml({ currency: 'EUR', payments: [{ txId: tx.id, date: tx.date, amount: 18 }] });

  for (const html of [savingsHtml, debtHtml, invoiceHtml]) {
    assert.match(html, /2026-03-09/);
    assert.match(html, /data-tx-id="tx-history"/);
  }
  assert.match(debtHtml, /deleteTransaction\('tx-history'\)/);
});

test('debt progress marks zero, each cumulative payment, and the full amount', () => {
  const app = loadApp(debts);
  const markers = app.debtProgressMarkers({ amount: 100 }, [{ amount: 20 }, { amount: 25 }]);
  assert.deepEqual(Array.from(markers.matchAll(/left:(\d+)%/g), match => Number(match[1])), [0, 20, 45, 100]);
});

test('linked payment actions are wired into savings, debt, invoice, and bill history surfaces', () => {
  assert.match(savings, /linkedTransactionButton\(\(this\.savingsTransactionForEntry\(e\) \|\| \{\}\)\.id\)/);
  assert.match(debts, /this\.linkedTransactionButton\(tx\.id\)/);
  assert.match(invoices, /this\.linkedTransactionButton\(tx\.id\)/);
  assert.match(bills, /this\.linkedTransactionButton\(paid\.txId\)/);
  assert.match(cards, /inst-progress-marker/);
  assert.match(cards, /this\.linkedTransactionButton\(paymentTx\.id\)/);
});
