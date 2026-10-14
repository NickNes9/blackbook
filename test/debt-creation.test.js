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
