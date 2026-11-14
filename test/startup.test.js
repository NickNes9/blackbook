import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
function fixture(fetcher, saved = '') {
  const view = { innerHTML: '' };
  let removed = false;
  const context = { window: {}, fetch: fetcher, URLSearchParams, localStorage: {
    getItem: () => saved, removeItem: () => { removed = true; }
  }, document: { getElementById: () => view } };
  vm.runInNewContext(source, context);
  const app = context.window.BlackBook;
  app.enhancePasswordFields = app.applyTheme = app.setSaveState = () => {};
  return { app, view, removed: () => removed };
}

test('profile listing failure displays a retry screen, not a frozen empty shell', async () => {
  const { app, view } = fixture(async () => ({ ok: false, json: async () => ({ error: 'Folder unavailable' }) }));
  await app.init();
  assert.match(view.innerHTML, /LOADING FAILED/);
  assert.match(view.innerHTML, /Folder unavailable/);
  assert.match(view.innerHTML, /RETRY/);
  assert.equal(app.data, null);
});

test('failed load is never treated as a financial profile', async () => {
  const { app, view } = fixture(async url => url === '/api/profiles'
    ? { ok: true, json: async () => ({ profiles: [] }) }
    : { ok: false, status: 500, json: async () => ({ error: 'Cannot save' }) });
  await app.init();
  assert.match(view.innerHTML, /Cannot save/);
  assert.equal(app.data, null);
});

test('a stale remembered profile is cleared instead of recreated in another installation', async () => {
  const requests = [];
  const state = fixture(async url => {
    requests.push(url);
    return url === '/api/profiles' ? { ok: true, json: async () => ({ profiles: [] }) } : { status: 401 };
  }, 'Old Profile');
  state.app.showUnlockOverlay = () => {};
  await state.app.init();
  assert.equal(state.app.profile, '');
  assert.equal(state.removed(), true);
  assert.deepEqual(requests, ['/api/profiles', '/api/load?initialTransactions=1000']);
});

test('background transaction hydration restores source order without losing live edits, deletions, or new entries', async () => {
  const original = [
    { id: 'tx-0', amount: 10 }, { id: 'tx-1', amount: 20 },
    { id: 'tx-2', amount: 30 }, { id: 'tx-3', amount: 40 }
  ];
  const sourceIndex = Symbol('sourceIndex');
  Object.defineProperty(original[3], sourceIndex, { value: 3, configurable: true });
  Object.defineProperty(original[2], sourceIndex, { value: 2, configurable: true });
  const requests = [];
  const state = fixture(async url => {
    requests.push(url);
    return { ok: true, json: async () => ({
      transactions: [original[0], original[1]], indexes: [0, 1], nextOffset: 4, total: 4, done: true
    }) };
  });
  const app = state.app;
  original[2].amount = 31;
  const added = { id: 'new-during-load', amount: 5 };
  app.data = { transactions: [original[2], added] };
  app.profile = '';
  app.currentPage = 'overview';
  app._transactionLoad = { id: 'session', total: 4, nextOffset: 2, chunkSize: 2, sourceIndex };
  app._saveQueue = Promise.resolve();
  app.setSaveState = () => {};
  app.migrateTransfers = () => false;
  let saveCalls = 0;
  app.save = async () => { saveCalls++; return true; };
  app.renderPage = () => {};
  app.showToast = () => {};

  await app.loadRemainingTransactions('session');

  assert.equal(app.data.transactions.map(transaction => transaction.id).join(','),
    'new-during-load,tx-0,tx-1,tx-2');
  assert.equal(app.data.transactions.find(transaction => transaction.id === 'tx-2').amount, 31);
  assert.equal(app._transactionLoad, null);
  assert.equal(saveCalls, 0, 'unchanged hydration does not rewrite the full profile');
  assert.equal(requests.map(url => String(url).split('?')[0]).join(','), '/api/load-chunk,/api/load-complete');
});

test('hydration writes the full profile when a save happened during partial loading', async () => {
  const requests = [];
  const state = fixture(async url => {
    requests.push(url);
    return { ok: true, json: async () => ({}) };
  });
  const app = state.app;
  app.data = { transactions: [] };
  app.profile = '';
  app.currentPage = 'overview';
  app._transactionLoad = { id: 'session', total: 0, nextOffset: 0, chunkSize: 2, sourceIndex: Symbol('sourceIndex') };
  app._partialLoadSaveOccurred = true;
  app._saveQueue = Promise.resolve();
  app.setSaveState = () => {};
  app.migrateTransfers = () => false;
  let saveCalls = 0;
  app.save = async () => { saveCalls++; return true; };
  app.renderPage = () => {};
  app.showToast = () => {};

  await app.loadRemainingTransactions('session');

  assert.equal(saveCalls, 1, 'partial saves are consolidated into one full save after hydration');
  assert.deepEqual(requests, ['/api/load-complete']);
});
