import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function scan(data) {
  const window = {};
  runInNewContext(readFileSync(new URL('../public/js/data-health.js', import.meta.url), 'utf8'), { window });
  return window.DataHealth.scan(data);
}
test('health check detects dangling references without altering financial data', () => {
  const data = { accounts: [{ id: 'a' }], categories: [{ id: 'c' }], transactions: [{ id: 't', accountId: 'missing', categoryId: 'c', amount: -10, date: '2026-01-01' }], bills: [{ id: 'b' }], billPayments: [{ billId: 'b', txId: 'gone', month: '2026-01' }], invoices: [{ id: 'i', payments: [{ txId: 'gone' }] }] };
  const before = JSON.stringify(data);
  const issues = scan(data);
  assert.ok(issues.some(i => i.collection === 'transactions' && i.id === 't'));
  assert.ok(issues.some(i => i.collection === 'bills' && i.id === 'b'));
  assert.ok(issues.some(i => i.collection === 'invoices' && i.id === 'i'));
  assert.equal(JSON.stringify(data), before);
});
test('valid card and transfer references are accepted and legacy unlinked records are not called broken', () => {
  const data = { accounts: [{ id: 'a' }, { id: 'b' }], creditCards: [{ id: 'card' }], categories: [{ id: 'c' }], transactions: [{ id: 't', cardId: 'card', categoryId: 'c' }, { id: 'tr', type: 'transfer', fromAccountId: 'a', toAccountId: 'b' }], invoices: [{ id: 'i', payments: [{ amount: 5 }] }] };
  assert.equal(scan(data).length, 0);
});
test('duplicate identifiers, missing rates, and suspicious duplicate transactions are separate warnings', () => {
  const data = { accounts: [{ id: 'a', currency: 'USD' }], transactions: [{ id: 't', accountId: 'a', date: '2026-01-01', amount: -5, note: 'Coffee' }, { id: 't', accountId: 'a', date: '2026-01-01', amount: -5, note: 'Coffee' }], settings: { baseCurrency: 'EUR' } };
  const issues = scan(data);
  assert.ok(issues.some(i => i.kind === 'duplicate-id'));
  assert.ok(issues.some(i => i.kind === 'possible-duplicate'));
  assert.ok(issues.some(i => i.kind === 'missing-rate'));
});
test('missing funding accounts and savings-entry transactions are reported at their owning records', () => {
  const issues = scan({ bills: [{ id: 'b', payAccountId: 'gone' }], creditCards: [{ id: 'c', payAccountId: 'gone' }], savingsGoals: [{ id: 's', entries: [{ id: 'e' }] }] });
  for (const collection of ['bills', 'creditCards', 'savingsGoals']) assert.ok(issues.some(i => i.collection === collection && i.kind === 'broken-link'));
});
