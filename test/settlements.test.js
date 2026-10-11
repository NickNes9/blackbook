import test from 'node:test';
import assert from 'node:assert/strict';

await import('../public/js/forecast-engine.js');
const { buildForecast, transactionBalanceParts } = globalThis.ForecastEngine;
globalThis.window = { BlackBook: {} };
await import('../public/js/page-transactions.js');
const { transferSettlementFieldsChanged } = globalThis.window.BlackBook;

test('split settlement keeps cross-year dates and exact dual-currency totals', () => {
  const tx = {
    type: 'transfer', fromAccountId: 'rsd', toAccountId: 'eur',
    amount: 3000, currency: 'RSD', amountIn: 30, currencyIn: 'EUR',
    settlements: [
      { date: '2026-12-30', amount: 1000, currency: 'RSD', amountIn: 10, currencyIn: 'EUR' },
      { date: '2027-01-02', amount: 2000, currency: 'RSD', amountIn: 20, currencyIn: 'EUR' }
    ]
  };
  const parts = transactionBalanceParts(tx, 'RSD');
  assert.deepEqual(parts.map(part => part.date), ['2026-12-30', '2027-01-02']);
  assert.equal(parts.filter(part => part.date <= '2026-12-31').reduce((sum, part) => sum + part.amount, 0), 1000);
  assert.equal(parts.filter(part => part.date <= '2026-12-31').reduce((sum, part) => sum + part.amountIn, 0), 10);

  const result = buildForecast({
    settings: { baseCurrency: 'RSD', exchangeRates: { EUR: 117 } },
    accounts: [{ id: 'rsd' }, { id: 'eur' }], transactions: [tx]
  }, { startDate: '2027-01-03', days: 1 });
  assert.equal(result.openingBalances.rsd, -3000);
  assert.equal(result.openingBalances.eur, 3510);
});

test('inconsistent settlement totals fall back to the aggregate transaction', () => {
  const tx = {
    type: 'transfer', fromAccountId: 'rsd', toAccountId: 'eur',
    amount: 3000, currency: 'RSD', amountIn: 30, currencyIn: 'EUR',
    settlements: [{ date: '2026-12-30', amount: 1000, currency: 'RSD', amountIn: 10, currencyIn: 'EUR' }]
  };
  assert.deepEqual(transactionBalanceParts(tx, 'RSD'), [tx]);
  const result = buildForecast({
    settings: { baseCurrency: 'RSD', exchangeRates: { EUR: 117 } },
    accounts: [{ id: 'rsd' }, { id: 'eur' }], transactions: [tx]
  }, { startDate: '2027-01-03', days: 1 });
  assert.equal(result.openingBalances.rsd, -3000);
  assert.equal(result.openingBalances.eur, 3510);
});

test('note-only transfer edits preserve settlements when legacy incoming fields are omitted', () => {
  const tx = {
    type: 'transfer', fromAccountId: 'rsd', toAccountId: 'eur', amount: 250,
    currency: 'RSD', date: '2026-12-30', settlements: [{ date: '2026-12-30', amount: 250, currency: 'RSD' }]
  };
  const noteOnlyFormValues = {
    fromAccountId: 'rsd', toAccountId: 'eur', amount: 250, amountIn: 250,
    currency: 'RSD', currencyIn: 'RSD', date: '2026-12-30'
  };
  assert.equal(transferSettlementFieldsChanged(tx, noteOnlyFormValues), false);
  assert.equal(transferSettlementFieldsChanged(tx, { ...noteOnlyFormValues, amount: 251 }), true);
});
