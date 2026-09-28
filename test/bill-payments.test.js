import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/page-bills.js', import.meta.url), 'utf8');

function makeApp() {
  const context = { window: { BlackBook: {} }, crypto: { randomUUID: () => 'test-id' } };
  vm.runInNewContext(source, context);
  const app = context.window.BlackBook;
  app.data = {
    bills: [], billPayments: [], transactions: [],
    accounts: [{ id: 'bank', currency: 'RSD' }], settings: { defaultAccountId: 'bank' }
  };
  app.baseCurrency = () => 'RSD';
  app.visibleAccounts = () => app.data.accounts;
  app.isTransfer = () => false;
  app.toBase = n => n;
  return app;
}

test('January payment cannot consume an existing February expense', () => {
  const app = makeApp();
  const bill = { id: 'google', name: 'Google One', amount: 212.1, currency: 'RSD', dueDay: 7, payAccountId: 'bank', categoryId: 'bills' };
  const febTx = { id: 'feb-google', date: '2026-02-09', type: 'expense', amount: -212.1, currency: 'RSD', accountId: 'bank', categoryId: 'bills', note: 'Google' };
  app.data.transactions.push(febTx);
  app.data.billPayments.push({ billId: bill.id, month: '2026-02', paid: true, amount: 212.1 });

  const janPay = { billId: bill.id, month: '2026-01', paid: true, amount: 212.1, accountId: 'bank' };
  app.attachBillTransaction(bill, janPay);
  assert.equal(janPay.txId, 'bil-test-id');
  assert.equal(app.data.transactions.find(t => t.id === janPay.txId).date, '2026-01-07');
  assert.equal(app.data.transactions.find(t => t.id === 'feb-google'), febTx);

  const febPay = app.data.billPayments[0];
  app.attachBillTransaction(bill, febPay);
  assert.equal(febPay.txId, 'feb-google');
  assert.equal(febTx.note, 'Google One');
  assert.equal(app.data.transactions.length, 2);
});

test('a unique matching expense links without changing its amount; ambiguous matches do not', () => {
  const app = makeApp();
  const bill = { id: 'gas', name: 'BeoGas', amount: 100, currency: 'RSD', payAccountId: 'bank', categoryId: 'bills' };
  const tx = { id: 'existing', date: '2026-03-13', type: 'expense', amount: -120, currency: 'RSD', accountId: 'bank', categoryId: 'bills', note: 'Gas' };
  app.data.transactions.push(tx);
  const pay = { billId: bill.id, month: '2026-03', paid: true, amount: 120 };
  assert.equal(app.billMatchTx(bill, pay), tx, 'the paid amount, not the bill default, governs matching');
  app.attachBillTransaction(bill, pay);
  assert.equal(pay.txId, 'existing');
  assert.equal(tx.amount, -120);
  assert.equal(tx.note, 'BeoGas');

  const ambiguous = { id: 'duplicate', ...tx };
  ambiguous.id = 'duplicate';
  app.data.transactions.push(ambiguous);
  assert.equal(app.billMatchTx(bill, { month: '2026-03', amount: 120 }), null);
});
