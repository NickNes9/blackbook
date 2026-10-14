import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/js/page-reports.js', import.meta.url), 'utf8');

function loadReports() {
  const window = { BlackBook: {} };
  runInNewContext(source, { window });
  return window.BlackBook;
}

test('report rows honor account/year filters, omit transfers, and retain income/expense signs', () => {
  const app = loadReports();
  Object.assign(app, {
    data: {
      accounts: [{ id: 'bank' }, { id: 'cash' }],
      transactions: [
        { id: 'pay', date: '2026-01-10', accountId: 'bank', type: 'income', amount: 500 },
        { id: 'shop', date: '2026-02-10', accountId: 'bank', type: 'expense', amount: 80 },
        { id: 'move', date: '2026-02-11', accountId: 'bank', type: 'transfer', amount: 40 },
        { id: 'other-account', date: '2026-02-12', accountId: 'cash', type: 'expense', amount: 20 },
        { id: 'other-year', date: '2025-02-12', accountId: 'bank', type: 'expense', amount: 10 }
      ]
    },
    _reportsState: { year: 2026, accountIds: ['bank'] },
    isTransfer: transaction => transaction.type === 'transfer',
    transactionToBase: transaction => transaction.amount
  });

  assert.deepEqual(app.reportsRows().map(({ id, amount }) => ({ id, amount })), [
    { id: 'pay', amount: 500 },
    { id: 'shop', amount: -80 }
  ]);
});

test('reports default to the net comparison metric', () => {
  const app = loadReports();
  app._reportsState = { year: 2026 };

  assert.equal(app.reportsCompareSettings().metric, 'net');
});

test('money-flow period only accepts month or year', () => {
  const app = loadReports();
  app._reportsState = { flowPeriod: 'month' };
  app.renderPage = () => { app.renderCount = (app.renderCount || 0) + 1; };

  app.setReportsFlowPeriod('year');
  assert.equal(app._reportsState.flowPeriod, 'year');
  assert.equal(app.renderCount, 1);

  app.setReportsFlowPeriod('lifetime');
  assert.equal(app._reportsState.flowPeriod, 'year');
  assert.equal(app.renderCount, 1);
});

test('donut leader anchors stay on their slice and on the selected label side', () => {
  const app = loadReports();
  const layout = app.reportsDonutLayout([.18, .16, .14, .13, .12, .1, .08, .06, .03]);

  assert.equal(layout.length, 9);
  for (const item of layout) {
    assert.ok(item.anchorAngle >= item.start && item.anchorAngle <= item.end);
    assert.equal(Math.sign(Math.cos(item.anchorAngle)), item.side);
  }
  assert.ok(Math.abs(layout.filter(item => item.side < 0).length - layout.filter(item => item.side > 0).length) <= 1);
});
