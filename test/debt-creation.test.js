import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const debts = readFileSync(new URL('../public/js/page-debts.js', import.meta.url), 'utf8');

function loadApp(document = {}) {
  const context = { window: {}, localStorage: { getItem: () => '' }, document, setTimeout: callback => callback() };
  vm.runInNewContext(core, context);
  vm.runInNewContext(debts, context);
  return context.window.BlackBook;
}

test('creating a debt opening entry moves money out when they owe me', () => {
  const app = loadApp();
  const tx = app.debtOpeningTransaction({ id: 'debt-1', type: 'in', person: 'Alex', amount: 120, currency: 'EUR', date: '2026-10-12', categoryId: 'family', note: 'Trip loan' }, 'cash-eur', 'tx-open-1');

  assert.equal(tx.id, 'tx-open-1');
  assert.equal(tx.type, 'expense');
  assert.equal(tx.amount, -120);
  assert.equal(tx.accountId, 'cash-eur');
  assert.equal(tx.date, '2026-10-12');
  assert.equal(tx.currency, 'EUR');
  assert.equal(tx.categoryId, 'family');
  assert.equal(tx.note, 'Loan to Alex · Trip loan');
  assert.equal(tx.debtId, undefined);
});

test('creating a debt opening entry adds money when I owe them', () => {
  const app = loadApp();
  const tx = app.debtOpeningTransaction({ id: 'debt-2', type: 'out', person: 'Sam', amount: 85, currency: 'RSD', date: '2026-10-12', categoryId: null, note: '' }, 'bank-rsd', 'tx-open-2');

  assert.equal(tx.type, 'income');
  assert.equal(tx.amount, 85);
  assert.equal(tx.accountId, 'bank-rsd');
  assert.equal(tx.note, 'Borrowed from Sam');
  assert.equal(tx.debtId, undefined);
});

test('opening debt transactions keep their person association', () => {
  const app = loadApp();
  const tx = app.debtOpeningTransaction({ type: 'in', person: 'Iva', personId: 'person-iva', amount: 100, currency: 'EUR', date: '2026-10-13', categoryId: null, note: '' }, 'cash-eur', 'tx-open-iva');

  assert.deepEqual(Array.from(tx.personIds), ['person-iva']);
  app.data = { people: [{ id: 'person-iva', name: 'Iva' }] };
  assert.equal(app.debtPersonForName('@IVA').id, 'person-iva');
});

test('a settled debt uses its latest linked payment date and clears it if reopened', () => {
  const app = loadApp();
  const debt = { id: 'debt-3', type: 'in', person: 'Alex', amount: 30, amountPaid: 30, currency: 'RSD', paidDate: '2026-10-01' };
  app.data = {
    settings: { baseCurrency: 'RSD' },
    debts: [debt],
    transactions: [
      { id: 'pay-1', debtId: debt.id, date: '2026-10-02', type: 'income', amount: 10, currency: 'RSD' },
      { id: 'pay-2', debtId: debt.id, date: '2026-10-08', type: 'income', amount: 20, currency: 'RSD' }
    ]
  };

  assert.equal(app.syncDebtPaidDate(debt), '2026-10-08');
  assert.equal(debt.paidDate, '2026-10-08');
  debt.amount = 35;
  assert.equal(app.syncDebtPaidDate(debt), '');
  assert.equal(debt.paidDate, '');
});

test('editing debt details synchronizes the opening entry and linked payment direction', () => {
  const app = loadApp();
  const debt = {
    id: 'debt-4', type: 'out', person: 'Sam', personId: 'sam', amount: 85, amountPaid: 20,
    currency: 'RSD', date: '2026-10-12', categoryId: 'family', note: 'Trip', openingTransactionId: 'open-4'
  };
  const opening = { ...app.debtOpeningTransaction(debt, 'bank-rsd', 'open-4') };
  const payment = { id: 'pay-4', debtId: debt.id, date: '2026-10-13', type: 'expense', amount: -20, currency: 'RSD', note: 'Debt payment: Sam', personIds: ['sam'] };
  app.data = { settings: { baseCurrency: 'RSD' }, debts: [debt], people: [{ id: 'jess', name: 'Jess' }], transactions: [opening, payment] };
  const previousPersonId = debt.personId;
  const previousPerson = debt.person;
  Object.assign(debt, { type: 'in', person: 'Jess', personId: 'jess', amount: 100, date: '2026-10-15', categoryId: 'home', note: 'New note' });

  app.syncDebtLinkedTransactions(debt, previousPersonId, previousPerson);

  assert.equal(opening.type, 'expense');
  assert.equal(opening.amount, -100);
  assert.equal(opening.date, '2026-10-15');
  assert.equal(opening.categoryId, 'home');
  assert.equal(opening.note, 'Loan to Jess · New note');
  assert.equal(opening.accountId, 'bank-rsd');
  assert.equal(payment.type, 'income');
  assert.equal(payment.amount, 20);
  assert.equal(payment.note, 'Debt payment: Jess');
  assert.deepEqual(Array.from(payment.personIds), ['jess']);
});

test('editing a debt disables the hidden account field so it cannot block form submission', () => {
  const fields = new Map();
  const document = { getElementById: id => {
    if (!fields.has(id)) fields.set(id, { value: '', hidden: false, required: true, disabled: false, textContent: '', focus() {} });
    return fields.get(id);
  } };
  const app = loadApp(document);
  app.data = {
    debts: [{ id:'debt-5', person:'Alex', type:'in', amount:20, currency:'RSD', date:'2026-10-01', paidDate:'', note:'', categoryId:null }],
    people:[], categories:[], transactions:[], settings:{ baseCurrency:'RSD' }
  };
  app.populateDebtPersonOptions = () => {};
  app._setDebtDir = () => {};
  app.initCategoryPicker = () => {};
  app.bindDebtForm = () => {};
  app.openModal = () => {};
  app.fmtDateInput = value => value;

  app.openEditDebt('debt-5');

  assert.equal(document.getElementById('debt-account-field').hidden, true);
  assert.equal(document.getElementById('debt-account').disabled, true);
  assert.equal(document.getElementById('debt-account').required, false);
});
