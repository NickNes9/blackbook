import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('Bills donut reflects the yearly series and excludes TOTAL', () => {
  const canvas = { getContext: () => ({}), setAttribute: () => {} };
  let chart;
  const window = { BlackBook: {} };
  runInNewContext(readFileSync(new URL('../public/js/page-bills.js', import.meta.url), 'utf8'), { window, document: { getElementById: () => canvas }, Chart: function (_ctx, config) { chart = config; } });
  const app = window.BlackBook;
  app.billsChart = { data: { datasets: [{ label: 'TOTAL', data: [30], _total: true }, { label: 'Rent', data: [10, 10], backgroundColor: '#abc' }, { label: 'Internet', data: [5, 5], backgroundColor: '#def' }] } };
  app.vm = () => 0; app.vy = () => 2026;
  app.fmtBase = String; app.round2 = x => Math.round(x * 100) / 100;
  app.renderBillsDonut();
  assert.equal(chart.type, 'doughnut');
  assert.deepEqual(Array.from(chart.data.labels), ['Rent', 'Internet']);
  assert.deepEqual(Array.from(chart.data.datasets[0].data), [20, 10]);
  assert.equal(chart.options.cutout, '67%');
});
test('sticky Bills totals keep their own header on narrow screens', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.bills-grid-head:nth-child\(14\)\s*\{[^}]*right:\s*0/s);
});
