import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const transactionTools = readFileSync(new URL('../public/js/transaction-tools.js', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../public/js/page-reports.js', import.meta.url), 'utf8');

function loadApp() {
  const context = { window: {}, localStorage: { getItem: () => null } };
  runInNewContext(core, context);
  runInNewContext(transactionTools, context);
  runInNewContext(reports, context);
  return { app: context.window.BlackBook, matches: context.window.TransactionTools.matches };
}

test('transaction allocation rows keep account totals on the parent and attribute split parts separately', () => {
  const { app } = loadApp();
  const tx = {
    id: 'shop', date: '2026-10-16', type: 'expense', amount: -105, currency: 'RSD',
    accountId: 'bank', categoryId: 'home', note: 'Corner shop', personIds: [],
    parts: [
      { id: 'chair', description: 'Chair', categoryId: 'home', amount: 100, personIds: [] },
      { id: 'fee', description: 'Card fee', categoryId: 'fees', amount: 5, personIds: ['jess'] }
    ]
  };

  const rows = app.transactionAllocationRows(tx);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => ({
    transactionId: row.id, allocationId: row.allocationId, description: row.partDescription,
    amount: row.amount, categoryId: row.categoryId, personIds: row.personIds, accountId: row.accountId
  })))), [
    { transactionId: 'shop', allocationId: 'chair', description: 'Chair', amount: -100, categoryId: 'home', personIds: [], accountId: 'bank' },
    { transactionId: 'shop', allocationId: 'fee', description: 'Card fee', amount: -5, categoryId: 'fees', personIds: ['jess'], accountId: 'bank' }
  ]);
  assert.equal(tx.amount, -105, 'the account ledger amount remains a single parent total');
  app.data = { transactions:[tx], accounts:[], settings:{ baseCurrency:'RSD' } };
  assert.equal(app.accountBalance('bank'), -105, 'split parts do not duplicate the account-balance entry');
});

test('unsplit transactions remain a single allocation row', () => {
  const { app } = loadApp();
  const tx = { id: 'plain', amount: 42, categoryId: 'food', personIds: ['jess'] };

  const rows = app.transactionAllocationRows(tx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 42);
  assert.equal(rows[0].categoryId, 'food');
});

test('split allocations require at least two positive parts that sum to the parent total in cents', () => {
  const { app } = loadApp();

  assert.equal(app.transactionSplitValidation(-105, [{ amount: '100' }, { amount: '5' }]).valid, true);
  assert.equal(app.transactionSplitValidation(10, [{ amount: '3.33' }, { amount: '6.66' }]).valid, false);
  assert.equal(app.transactionSplitValidation(10, [{ amount: '10' }]).valid, false);
  assert.equal(app.transactionSplitValidation(10, [{ amount: '0' }, { amount: '10' }]).valid, false);
});

test('transaction filters match split descriptions, categories, and people once at the parent level', () => {
  const { matches } = loadApp();
  const tx = {
    id: 'shop', date: '2026-10-16', type: 'expense', amount: -105, categoryId: 'home', personIds: [], note: 'Corner shop',
    parts: [
      { description: 'Chair', categoryId: 'home', personIds: [] },
      { description: 'Flowers for Jess', categoryId: 'gifts', personIds: ['jess'] }
    ]
  };

  assert.equal(matches(tx, { find: 'Flowers for Jess' }), true);
  assert.equal(matches(tx, { category: 'gifts' }), true);
  assert.equal(matches(tx, { person: 'jess' }), true);
  assert.equal(matches(tx, { category: '__none__' }), false);
  assert.equal(matches(tx, { person: '__none__' }), false);
});

test('report allocation converts split parts proportionally and preserves the exact parent base total', () => {
  const { app } = loadApp();
  const tx = {
    id:'shop', date:'2026-10-16', type:'expense', amount:-105, currency:'EUR',
    parts:[{ description:'Chair', amount:100 }, { description:'Fee', amount:5 }]
  };
  const rows = app.reportsAllocationRows([{ ...tx, transactionId:'shop', transactionAmount:-105, amount:-97.53 }]);

  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => row.amount))), [-92.89, -4.64]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), -97.53);
});

test('report rows retain the original currency total when allocating converted values', () => {
  const { app } = loadApp();
  const tx = {
    id:'shop', date:'2026-10-16', type:'expense', amount:-105, currency:'EUR', accountId:'euro',
    parts:[{ id:'item', description:'Item', categoryId:'home', amount:100 }, { id:'fee', description:'Fee', categoryId:'fees', amount:5 }]
  };
  app.data = { accounts:[{ id:'euro' }], categories:[], people:[], transactions:[tx], settings:{ baseCurrency:'RSD' } };
  app._reportsState = { year:2026, accountIds:['euro'] };
  app.transactionToBase = transaction => Math.round(transaction.amount * .929047619 * 100) / 100;

  const rows = app.reportsAllocationRows(app.reportsRows());
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => row.amount))), [-92.90, -4.65]);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, -97.55);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => row.categoryId))), ['home', 'fees']);
});

test('a split with original-currency purchase and account-currency fee keeps both in converted totals', () => {
  const { app } = loadApp();
  const tx = {
    id:'paprika', date:'2026-10-16', type:'expense', amount:-728.38, currency:'RSD', accountId:'bank',
    nativeAmount:-5.99, nativeCurrency:'EUR', categoryId:'shop', note:'Paprika Recipe Manager AppStore',
    parts:[
      { id:'purchase', description:'Paprika Recipe Manager AppStore', categoryId:'shop', amount:721.16, nativeAmount:5.99, nativeCurrency:'EUR' },
      { id:'fee', description:'Bank fee', categoryId:'fees', amount:7.22 }
    ]
  };
  app.data = {
    accounts:[{ id:'bank', name:'Bank RSD', currency:'RSD' }], categories:[], people:[], transactions:[tx],
    settings:{ baseCurrency:'EUR', rates:{ EUR:{ rate:1 }, RSD:{ rate:0.0083 } } }
  };
  app._reportsState = { year:2026, accountIds:['bank'] };

  assert.equal(app.transactionToBase(tx), -6.05, 'the native purchase and converted fee both contribute');
  assert.equal(app.accountBalance('bank'), -6.05, 'the account overview includes the converted fee');
  assert.deepEqual(JSON.parse(JSON.stringify(app.accountBalanceNative('bank'))), { amount:-728.38, currency:'RSD' });
  const allocationRows = app.transactionAllocationRows(tx);
  assert.equal(allocationRows[0].nativeAmount, -5.99);
  assert.equal(allocationRows[1].nativeAmount, null, 'the fee does not inherit the purchase native amount');
  const reportRows = app.reportsAllocationRows(app.reportsRows());
  assert.deepEqual(JSON.parse(JSON.stringify(reportRows.map(row => row.amount))), [-5.99, -0.06]);
});
