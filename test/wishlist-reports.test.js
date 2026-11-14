import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../public/js/page-reports.js', import.meta.url), 'utf8');
const wishlist = readFileSync(new URL('../public/js/page-wishlist.js', import.meta.url), 'utf8');
const forecast = readFileSync(new URL('../public/js/page-forecast.js', import.meta.url), 'utf8');
const savings = readFileSync(new URL('../public/js/page-savings.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');

function load(source) {
  const context = { window: { BlackBook: {} }, crypto: { randomUUID: () => 'wish-1' }, Date };
  vm.runInNewContext(source, context);
  return context;
}

test('WISHLIST is a Savings subpage and Forecast is the final Reports tab', () => {
  assert.match(index, /data-page="savings"[^>]*>SAVINGS/);
  assert.doesNotMatch(index, /data-page="wishlist"|id="page-wishlist"/);
  assert.match(core, /'savings',[\s\S]*?'reports'/);
  assert.match(core, /if \(page === 'wishlist'\).*?_savingsView = 'wishlist'; page = 'savings';/);
  assert.match(savings, /\['goals', 'GOALS'\], \['wishlist', 'WISHLIST'\]/);
  assert.match(savings, /this\.wishlistListHtml\(\)/);
  assert.doesNotMatch(index, /data-page="forecast"|id="page-forecast"/);
  assert.match(reports, /\['calendar', 'Calendar'\], \['forecast', 'Forecast'\]/);
});

test('saving a wishlist item stores its details without creating a transaction', async () => {
  const context = load(wishlist);
  const app = context.window.BlackBook;
  const values = {
    'wishlist-id': { value: '' },
    'wishlist-name': { value: 'Desk lamp' },
    'wishlist-price': { value: '45.50' },
    'wishlist-currency': { value: 'EUR' },
    'wishlist-want-by': { value: '' },
    'wishlist-category': { value: 'home' },
    'wishlist-note': { value: 'https://example.com/lamp' },
    'wishlist-form': { dataset: {}, reset() {} }
  };
  app.data = { settings: { baseCurrency: 'RSD' }, categories: [{ id: 'home', name: 'Home' }], wishlist: [] };
  app.evalAmount = Number;
  app.today = () => '2026-11-01';
  app.parseDateInput = value => value;
  app.dateFormatPattern = () => 'DD/MM/YYYY';
  app.categorySelectionAllowed = () => true;
  app.save = async () => true;
  app.closeModal = () => {};
  app.renderPage = () => {};
  app.showToast = message => assert.fail(message);
  app.escapeHtml = value => String(value);
  app.fmtDateInput = value => value;
  app.categoryColor = () => '#ff8000';
  app.fmtAmount = (value, currency) => `${value} ${currency}`;
  app.focusRecordHtml = () => '';
  app.xIcon = () => '×';
  app.wishlistItems = () => { if (!Array.isArray(app.data.wishlist)) app.data.wishlist = []; return app.data.wishlist; };
  context.document = { getElementById: id => values[id] };

  try {
    await app.saveWishlistItem();
    assert.equal(app.data.wishlist.length, 1);
    assert.deepEqual({
      name: app.data.wishlist[0].name,
      estimatedPrice: app.data.wishlist[0].estimatedPrice,
      currency: app.data.wishlist[0].currency,
      categoryId: app.data.wishlist[0].categoryId,
      note: app.data.wishlist[0].note,
      wantBy: app.data.wishlist[0].wantBy
    }, { name: 'Desk lamp', estimatedPrice: 45.5, currency: 'EUR', categoryId: 'home', note: 'https://example.com/lamp', wantBy: '' });
    assert.equal(app.data.transactions, undefined);
  } finally {
    delete context.document;
  }
});

test('marking a wishlist item bought opens the normal expense form and keeps the item until it saves', () => {
  const context = load(wishlist);
  const app = context.window.BlackBook;
  const values = new Map();
  const field = (id, value = '') => {
    const item = { value, dataset: {}, disabled: false };
    values.set(id, item);
    return item;
  };
  const modal = { classList: { contains: () => false } };
  const form = { dataset: {} };
  values.set('transaction-modal', modal);
  values.set('transaction-form', form);
  field('tx-type'); field('tx-amount'); field('tx-account', 'bank'); field('tx-note');
  field('tx-category'); field('tx-category-input'); field('tx-native-amount'); field('tx-native-currency-select');
  app.data = {
    settings: { baseCurrency: 'RSD' },
    accounts: [{ id: 'bank', currency: 'RSD' }],
    categories: [{ id: 'home', name: 'Home' }],
    wishlist: [{ id: 'wish-1', name: 'Desk lamp', estimatedPrice: 45.5, currency: 'RSD', categoryId: 'home', note: 'Warm light' }]
  };
  app.wishlistItems = () => app.data.wishlist;
  app.defaultAccountForCurrency = () => 'bank';
  app.today = () => '2026-11-01';
  app.openNewTransaction = () => {};
  app.convertBetweenCurrencies = () => null;
  app.categorySelectionAllowed = () => true;
  app.cardById = () => null;
  app.syncCustomSelect = () => {};
  app.updateTxNativeRow = () => {};
  app.updateTransactionSign = () => {};
  app.initCategoryPicker = () => {};
  app.updateTxPreview = () => {};
  app.escapeHtml = value => String(value);
  app.showToast = message => assert.fail(message);
  context.document = { getElementById: id => values.get(id) };

  try {
    app.buyWishlistItem('wish-1');
    assert.equal(values.get('tx-type').value, 'expense');
    assert.equal(values.get('tx-amount').value, '45.50');
    assert.equal(values.get('tx-note').value, 'Desk lamp — Warm light');
    assert.equal(values.get('tx-category').value, 'home');
    assert.equal(form.dataset.wishlistPurchaseId, 'wish-1');
    assert.equal(app.data.wishlist.length, 1);
  } finally {
    delete context.document;
  }
});

test('Forecast report reuses the Reports account selection', () => {
  const context = load(forecast);
  const app = context.window.BlackBook;
  let options;
  app.currentPage = 'reports';
  app.reportsState = () => ({ view: 'forecast' });
  app.reportsSelectedAccounts = () => new Set(['bank']);
  app.today = () => '2026-11-01';
  app.baseCurrency = () => 'RSD';
  app.getRates = () => ({});
  app.data = {};
  context.window.ForecastEngine = { buildForecast(_data, value) { options = value; return {}; } };

  try {
    app.forecastResult();
    assert.deepEqual(Array.from(options.accountIds), ['bank']);
  } finally {
    delete context.window.ForecastEngine;
  }
});
