import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/js/page-overview.js', import.meta.url), 'utf8');

test('Overview chart series follow Type, Expenses, and Income filters', () => {
  const window = { BlackBook: {} };
  runInNewContext(source, { window });
  const app = window.BlackBook;
  const expected = [
    { filter: null, income: true, expenses: true },
    { filter: 'expense', income: false, expenses: true },
    { filter: 'income', income: true, expenses: false }
  ];

  for (const item of expected) {
    app.ovActiveTypes = () => item.filter;
    assert.deepEqual({ ...app.overviewChartVisibility() }, { income: item.income, expenses: item.expenses });
  }
});
