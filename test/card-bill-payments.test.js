import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../public/js/page-cards.js', import.meta.url), 'utf8');

function loadApp() {
  const context = { window: {}, localStorage: { getItem: () => '' } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(cards, context);
  return context.window.BlackBook;
}

function plan(id, total) {
  return { id, cardId: 'card-1', name: id, total, months: 1, startMonth: '2026-10', dueDay: 15, ratePct: 0, paid: [], advance: 0 };
}

test('card payment shares are even and redistribute when an item has a smaller balance', () => {
  const app = loadApp();
  app.instOutstanding = item => item.outstanding;

  const shares = app.allocateCardBillShares([
    { id: 'a', name: 'A', outstanding: 50 },
    { id: 'b', name: 'B', outstanding: 50 },
    { id: 'c', name: 'C', outstanding: 100 }
  ], 100);

  assert.deepEqual(JSON.parse(JSON.stringify([...shares.entries()])), [['a', 33.34], ['b', 33.33], ['c', 33.33]]);
  const capped = app.allocateCardBillShares([
    { id: 'a', name: 'A', outstanding: 10 },
    { id: 'b', name: 'B', outstanding: 50 },
    { id: 'c', name: 'C', outstanding: 100 }
  ], 100);
  assert.deepEqual(JSON.parse(JSON.stringify([...capped.entries()])), [['a', 10], ['b', 45], ['c', 45]]);
});

test('one card-bill payment is recorded once and allocated across its active plans', async () => {
  const app = loadApp();
  const card = { id: 'card-1', name: 'Visa' };
  app.data = {
    creditCards: [card], installments: [plan('plan-a', 100), plan('plan-b', 50), plan('plan-c', 100)],
    transactions: [], accounts: [{ id: 'bank', currency: 'RSD' }], categories: [{ id: 'card-fee', name: 'Credit Card' }],
    settings: { baseCurrency: 'RSD' }
  };
  app.convertBetweenCurrencies = value => value;
  app.instFeeCategory = () => 'card-fee';
  app.save = async () => true;
  app.renderPage = () => {};

  const transaction = await app.applyCardBillPayment(card.id, 100, '2026-10-25', 'bank');

  assert.equal(app.data.transactions.length, 1);
  assert.equal(transaction.cardBillPayment, true);
  assert.equal(transaction.cardBillPaymentId, card.id);
  assert.equal(transaction.cardId, undefined);
  assert.equal(transaction.accountId, 'bank');
  assert.equal(transaction.amount, -100);
  assert.equal(transaction.date, '2026-10-25');
  assert.deepEqual(Array.from(transaction.installmentAllocations, item => [item.installmentId, item.amount]), [
    ['plan-a', 33.34], ['plan-b', 33.33], ['plan-c', 33.33]
  ]);
  assert.equal(app.instPaymentTxs(app.data.installments[0], 1)[0], transaction);
  assert.equal(app.instSlotPaidAmount(app.data.installments[0], 1), 33.34);
});

test('a plan card has a single card-level pay control and no per-plan pay buttons', () => {
  const app = loadApp();
  const item = plan('plan-a', 100);
  app.data = { creditCards: [{ id: 'card-1', name: 'Visa' }], installments: [item], transactions: [], categories: [], settings: {} };
  app.instCard = () => app.data.creditCards[0];
  app.cardColor = () => '#ff8800';
  app.instIsClosed = () => false;
  app.instPaidEntries = value => value.paid || [];
  app.instSlotPaidAmount = () => 0;
  app.instOutstanding = () => 100;
  app.instGrandTotal = () => 100;
  app.instMonthlyAmount = () => 100;
  app.instInterest = () => 0;
  app.instDueAmount = () => 100;
  app.instPurchaseTx = () => null;
  app.mkOfSeq = () => '2026-10';
  app.monthLabel = () => 'OCT 2026';
  app.fmtBase = amount => String(amount);
  app.focusRecordHtml = () => '';
  app.healthMarker = () => '';
  app.escapeHtml = value => value;
  app.linkedTransactionButton = () => '';
  app.xIcon = () => '×';

  const html = app.cardBlockHtml(app.data.creditCards[0]);
  const planHtml = app.planBlockHtml(item);

  assert.match(html, /openPayCardBill\('card-1'\)[^>]*>PAY BILL/);
  assert.doesNotMatch(planHtml, /openPayInstallment/);
  assert.match(planHtml, />DUE<\/span>/);
});

test('shared card payment transaction links back to its first allocated installment', () => {
  const app = loadApp();
  const item = plan('plan-a', 100);
  const tx = { id: 'card-pay-1', cardBillPayment: true, cardId: 'card-1', installmentAllocations: [{ installmentId: item.id, seq: 1, amount: 25 }] };
  app.data = { transactions: [tx], installments: [item] };

  assert.deepEqual(JSON.parse(JSON.stringify(app.installmentForTx(tx.id))), { inst: item, seq: 1, cardPayment: true });
});

test('editing a card payment amount rebuilds its item allocations evenly', async () => {
  const app = loadApp();
  const card = { id: 'card-1', name: 'Visa' };
  app.data = {
    creditCards: [card], installments: [plan('plan-a', 100), plan('plan-b', 50), plan('plan-c', 100)],
    transactions: [], accounts: [{ id: 'bank', currency: 'RSD' }], categories: [{ id: 'card-fee', name: 'Credit Card' }], settings: { baseCurrency: 'RSD' }
  };
  app.convertBetweenCurrencies = value => value;
  app.instFeeCategory = () => 'card-fee';
  app.save = async () => true;
  const transaction = await app.applyCardBillPayment(card.id, 100, '2026-10-25', 'bank');

  const edited = { type: 'expense', amount: -80, currency: 'RSD' };
  const result = app.adjustCardBillPaymentForEdit(transaction, edited);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true });
  assert.deepEqual(Array.from(edited.installmentAllocations, item => [item.installmentId, item.amount]), [
    ['plan-a', 26.67], ['plan-b', 26.67], ['plan-c', 26.66]
  ]);
});
