import test from 'node:test';
import assert from 'node:assert/strict';

await import('../public/js/forecast-engine.js');
const { buildForecast } = globalThis.ForecastEngine;

test('forecast includes an unpaid future bill and prevents a paid duplicate', () => {
  const data = { settings: { baseCurrency: 'RSD' }, accounts: [{ id: 'cash' }], transactions: [{ id: 'a', accountId: 'cash', type: 'income', amount: 1000, currency: 'RSD' }], bills: [{ id: 'rent', name: 'Rent', amount: 300, currency: 'RSD', dueDay: 5, payAccountId: 'cash', active: true }], billPayments: [] };
  const result = buildForecast(data, { startDate: '2026-09-01', days: 10 });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].baseAmount, -300);
  data.billPayments.push({ billId: 'rent', month: '2026-09' });
  assert.equal(buildForecast(data, { startDate: '2026-09-01', days: 10 }).events.length, 0);
});

test('forecast tracks recurring entries and reports account shortfalls', () => {
  const data = { settings: { baseCurrency: 'RSD' }, accounts: [{ id: 'cash' }], transactions: [], recurringTemplates: [{ id: 'wages', name: 'Wages', accountId: 'cash', amount: 50, currency: 'RSD', interval: 'weekly', startDate: '2026-09-02' }, { id: 'food', name: 'Food', accountId: 'cash', amount: -100, currency: 'RSD', interval: 'weekly', startDate: '2026-09-03' }] };
  const result = buildForecast(data, { startDate: '2026-09-01', days: 10 });
  assert.equal(result.events.length, 4);
  assert.equal(result.shortfalls[0].date, '2026-09-03');
});

test('forecast includes invoices only when explicitly enabled', () => {
  const data = { settings: { baseCurrency: 'RSD', defaultAccountId: 'cash' }, accounts: [{ id: 'cash' }], transactions: [], invoices: [{ id: 'invoice', party: 'Client', dir: 'out', dueDate: '2026-09-04', currency: 'RSD', lines: [{ qty: 1, price: 300 }] }] };
  assert.equal(buildForecast(data, { startDate: '2026-09-01', days: 10 }).events.length, 0);
  assert.equal(buildForecast(data, { startDate: '2026-09-01', days: 10, includeInvoices: true }).events[0].baseAmount, 300);
});
