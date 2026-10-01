import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/js/page-overview.js', import.meta.url), 'utf8');

function breakdownFor(filter) {
  const window = { BlackBook: {} };
  runInNewContext(source, { window });
  const app = window.BlackBook;
  app.data = {
    transactions: [
      { id: 'e1', date: '2026-01-05', type: 'expense', categoryId: 'food', amount: 30 },
      { id: 'i1', date: '2026-01-08', type: 'income', categoryId: 'salary', amount: 80 },
      { id: 'e2', date: '2026-01-12', type: 'expense', categoryId: 'salary', amount: 20 },
      { id: 'i2', date: '2026-01-18', type: 'income', categoryId: 'food', amount: 5 },
      { id: 'old', date: '2025-12-18', type: 'income', categoryId: 'other', amount: 500 }
    ],
    categories: [
      { id: 'food', name: 'Food', color: '#123456' },
      { id: 'salary', name: 'Salary', color: '#654321' },
      { id: 'other', name: 'Other', color: '#abcdef' }
    ]
  };
  app.vy = () => 2026;
  app.vm = () => 0;
  app.ymOf = date => {
    const parsed = new Date(date);
    return { y: parsed.getUTCFullYear(), m: parsed.getUTCMonth() };
  };
  app.isTransfer = tx => !!tx.transfer;
  app.toBase = amount => amount;
  app.fmtBase = amount => String(amount);
  app.categoryColor = category => category.color;
  app.escapeHtml = value => String(value);
  app.ovActiveTypes = () => filter;

  return [...app.categoryBreakdownHtml().matchAll(/data-name="([^"]+)" data-amt="([^"]+)" data-pct="([^"]+)" data-count="([^"]+)"/g)]
    .map(([, name, amount, percent, count]) => ({ name, amount, percent: Number(percent), count: Number(count) }));
}

test('Overview category bar nets each category in Type mode and filters by Income or Expenses', () => {
  assert.deepEqual(breakdownFor(null), [
    { name: 'Salary', amount: '60', percent: 70.6, count: 2 },
    { name: 'Food', amount: '-25', percent: 29.4, count: 2 }
  ]);
  assert.deepEqual(breakdownFor('income'), [
    { name: 'Salary', amount: '80', percent: 94.1, count: 1 },
    { name: 'Food', amount: '5', percent: 5.9, count: 1 }
  ]);
  assert.deepEqual(breakdownFor('expense'), [
    { name: 'Food', amount: '30', percent: 60, count: 1 },
    { name: 'Salary', amount: '20', percent: 40, count: 1 }
  ]);
});
