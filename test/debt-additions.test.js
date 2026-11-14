import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const debts = readFileSync(new URL('../public/js/page-debts.js', import.meta.url), 'utf8');

function loadApp() {
  const context = { window: {}, localStorage: { getItem: () => '' } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(debts, context);
  return context.window.BlackBook;
}

test('adding to a debt increases its principal and records a dated account transaction', async () => {
  const app = loadApp();
  const debt = { id: 'debt-1', type: 'in', person: 'Alex', amount: 100, currency: 'USD', categoryId: 'loan', personId: 'alex', openingAmount: 100 };
  app.data = { debts: [debt], transactions: [], settings: { baseCurrency: 'RSD' } };
  app.today = () => '2026-10-25';
  app.debtCategory = () => ({ id: 'loan' });
  app.save = async () => true;

  const tx = await app.applyDebtAddition(debt, 100, '2026-10-24', 'cash-usd');

  assert.equal(debt.amount, 200);
  assert.equal(debt.openingAmount, 100);
  assert.equal(tx.date, '2026-10-24');
  assert.equal(tx.accountId, 'cash-usd');
  assert.equal(tx.type, 'expense');
  assert.equal(tx.amount, -100);
  assert.equal(tx.debtId, debt.id);
  assert.equal(tx.debtEntryType, 'addition');
});

test('additional borrowing increases an I OWE debt without counting as repayment', async () => {
  const app = loadApp();
  const debt = { id: 'debt-2', type: 'out', person: 'Sam', amount: 80, amountPaid: 20, currency: 'EUR', openingAmount: 80 };
  app.data = {
    debts: [debt], settings: { baseCurrency: 'RSD' },
    transactions: [{ id: 'pay-1', debtId: debt.id, date: '2026-10-20', type: 'expense', amount: -20, currency: 'EUR' }]
  };
  app.today = () => '2026-10-25';
  app.debtCategory = () => null;
  app.save = async () => true;

  const tx = await app.applyDebtAddition(debt, 40, '2026-10-22', 'bank-eur');

  assert.equal(debt.amount, 120);
  assert.equal(tx.type, 'income');
  assert.equal(tx.amount, 40);
  assert.equal(app.debtPaidNative(debt), 20);
  assert.equal(app.debtRemainingNative(debt), 100);
});

test('deleting an added-principal transaction reduces the debt without undoing repayments', () => {
  const app = loadApp();
  const debt = { id: 'debt-3', type: 'in', amount: 200, amountPaid: 30, currency: 'RSD', openingAmount: 100 };
  const addition = { id: 'add-1', debtId: debt.id, debtEntryType: 'addition', amount: -100, type: 'expense', currency: 'RSD' };
  const payment = { id: 'pay-1', debtId: debt.id, amount: 30, type: 'income', currency: 'RSD' };
  app.data = { debts: [debt], transactions: [addition, payment] };
  app.syncDebtPaidDate = () => '';

  app.removeDebtPayment(addition.id);

  assert.equal(debt.amount, 100);
  assert.equal(debt.amountPaid, 30);
  assert.deepEqual(app.data.transactions.map(tx => tx.id), ['pay-1']);
});

test('editing a debt keeps added amounts out of its opening transaction', () => {
  const app = loadApp();
  const debt = { id: 'debt-5', type: 'in', amount: 200, openingAmount: 100, currency: 'RSD', date: '2026-10-01', openingTransactionId: 'open-1' };
  const opening = { id: 'open-1', amount: -100, type: 'expense', date: '2026-10-01' };
  const addition = { id: 'add-1', debtId: debt.id, debtEntryType: 'addition', amount: -100, type: 'expense', date: '2026-10-10' };
  app.data = { debts: [debt], transactions: [opening, addition] };
  app.syncDebtPaidDate = () => '';
  Object.assign(debt, { amount: 250, openingAmount: 150, date: '2026-10-02' });

  app.syncDebtLinkedTransactions(debt);

  assert.equal(opening.amount, -150);
  assert.equal(opening.date, '2026-10-02');
  assert.equal(addition.amount, -100);
});

test('editing an added amount adjusts the debt total and rejects a different direction or currency', () => {
  const app = loadApp();
  const debt = { id: 'debt-6', type: 'in', amount: 200, currency: 'EUR', openingAmount: 100 };
  const addition = { id: 'add-2', debtId: debt.id, debtEntryType: 'addition', amount: -100, type: 'expense', currency: 'EUR' };
  app.data = { transactions: [addition] };

  const edited = app.adjustDebtAdditionForEdit(debt, addition, { type: 'expense', amount: -125, currency: 'EUR' });
  assert.deepEqual(JSON.parse(JSON.stringify(edited)), { ok: true });
  assert.equal(debt.amount, 225);
  assert.deepEqual(JSON.parse(JSON.stringify(app.adjustDebtAdditionForEdit(debt, addition, { type: 'income', amount: 125, currency: 'EUR' }))), {
    ok: false, message: 'An added debt amount must stay in the same direction as the original debt.'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(app.adjustDebtAdditionForEdit(debt, addition, { type: 'expense', amount: -125, currency: 'USD' }))), {
    ok: false, message: 'Change the debt currency from the debt entry to keep its added amounts aligned.'
  });
  assert.equal(debt.amount, 225);
});

test('debt history presents additions and repayments as distinct dated entries', () => {
  const app = loadApp();
  app.data = { transactions: [
    { id: 'add-1', debtId: 'debt-4', debtEntryType: 'addition', date: '2026-10-21', type: 'expense', amount: -40, currency: 'RSD' },
    { id: 'pay-1', debtId: 'debt-4', date: '2026-10-23', type: 'income', amount: 10, currency: 'RSD' }
  ] };
  app.fmtDateInput = date => date;
  app.fmtAmount = (amount, currency) => `${amount} ${currency}`;
  app.linkedTransactionButton = id => `<a>${id}</a>`;
  app.xIcon = () => '×';
  const history = app.debtHistoryEntries({ id: 'debt-4' });
  const html = app.debtPaymentHistoryHtml({ id: 'debt-4', currency: 'RSD' }, history);

  assert.deepEqual(Array.from(history, item => item.kind).sort(), ['addition', 'payment']);
  assert.match(html, /PAID/);
  assert.match(html, /ADDED/);
  assert.match(html, /2026-10-21/);
  assert.match(html, /2026-10-23/);
});
