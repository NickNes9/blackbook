import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoProfile } from '../lib/demo-profile.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('fictional demo covers all finance pages with healthy links', () => {
  const data = createDemoProfile(new Date(2026, 8, 30));
  for (const key of ['accounts', 'categories', 'transactions', 'bills', 'billPayments', 'budgets', 'budgetAllocations', 'savingsGoals', 'creditCards', 'installments', 'debts', 'invoices', 'invoiceTemplates', 'recurringTemplates', 'importRules']) assert.ok(data[key].length, key);
  const window = {};
  runInNewContext(readFileSync(new URL('../public/js/data-health.js', import.meta.url), 'utf8'), { window });
  assert.deepEqual(Array.from(window.DataHealth.scan(data)), []);
  assert.ok(data.transactions.some(t => t.note.includes('Nick')));
  assert.equal(data.settings.baseCurrency, 'EUR');
  assert.ok(data.bills.length >= 6, 'Bills should have enough examples to fill the page');
  assert.ok(new Set(data.billPayments.filter(payment => payment.billId === 'demo-electricity').map(payment => payment.amount)).size >= 8, 'variable bills should make the annual chart move');
  const activeMonths = 9;
  const monthlyCounts = Array.from({ length: activeMonths }, (_, index) => {
    const month = '2026-' + String(index + 1).padStart(2, '0');
    return data.transactions.filter(tx => tx.date.startsWith(month)).length;
  });
  assert.ok(monthlyCounts.every(count => count >= 20 && count <= 30), monthlyCounts.join(', '));
  assert.equal(data.transactions.some(tx => tx.date > '2026-10-31'), false, 'demo should not contain future-dated transactions');
  assert.equal(data.billPayments.some(payment => payment.month > '2026-10'), false, 'bill history should stop at the current month');
  assert.equal(new Set(data.transactions.map(tx => tx.id)).size, data.transactions.length);
  assert.ok(new Set(data.transactions.map(tx => tx.note)).size >= data.transactions.length * 0.7, 'most transaction descriptions should be distinct');
  assert.equal(data.transactions.filter(tx => /Nick|Jessica/.test(tx.note)).length, 1);
  assert.equal(data.transactions.find(tx => /Nick|Jessica/.test(tx.note)).note, 'Jessica and Nick');
  assert.equal(data.transactions.find(tx => /Nick|Jessica/.test(tx.note)).date, '2026-01-15');
  const dinner = data.transactions.find(tx => tx.date === '2026-02-09' && tx.note === 'Dinner with J.');
  assert.ok(dinner, 'the demo should include the requested restaurant entry');
  assert.equal(dinner.categoryId, 'demo-cat-restaurant');
  assert.equal(data.transactions.filter(tx => /coffee/i.test(tx.note)).length, 0);
  for (const account of data.accounts) {
    const balance = data.transactions.reduce((sum, tx) => {
      if (tx.type === 'transfer') return sum - (tx.fromAccountId === account.id ? tx.amount : 0) + (tx.toAccountId === account.id ? (tx.amountIn ?? tx.amount) : 0);
      return sum + (tx.accountId === account.id ? tx.amount : 0);
    }, 0);
    assert.ok(balance > 0, account.name + ' should not start with a negative demo balance');
  }
  const savingsProgress = data.savingsGoals.map(goal => goal.entries.reduce((sum, entry) => sum + entry.amount, 0) / goal.targetAmount);
  assert.ok(savingsProgress.includes(1) && savingsProgress.includes(0.5) && savingsProgress.includes(0.25));
  const installmentProgress = data.installments.map(plan => {
    let paid = 0;
    for (let seq = 1; seq <= plan.months; seq++) {
      paid += data.transactions.filter(tx => tx.pairId === 'inst-' + plan.id + '-s' + seq).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    }
    return Math.round(paid / plan.total * 100);
  });
  assert.ok(installmentProgress.includes(100) && installmentProgress.includes(0));
  assert.ok(installmentProgress.some(progress => progress > 0 && progress < 100));
  assert.equal(data.budgetAllocations.length, activeMonths);
  const txIds = new Set(data.transactions.map(tx => tx.id));
  assert.ok(data.billPayments.filter(payment => payment.paid).every(payment => txIds.has(payment.txId)));
  assert.ok(data.savingsGoals.flatMap(goal => goal.entries).every(entry => data.transactions.some(tx => tx.linkId === entry.id)));
  assert.ok(data.invoices.flatMap(invoice => invoice.payments).every(payment => txIds.has(payment.txId)));
  assert.ok(data.debts.flatMap(debt => debt.payments).every(payment => txIds.has(payment.txId)));
});
