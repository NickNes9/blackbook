import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
function fixture(fetcher, saved = '') {
  const view = { innerHTML: '' };
  let removed = false;
  const context = { window: {}, fetch: fetcher, localStorage: {
    getItem: () => saved, removeItem: () => { removed = true; }
  }, document: { getElementById: () => view } };
  vm.runInNewContext(source, context);
  const app = context.window.BlackBook;
  app.enhancePasswordFields = app.applyTheme = () => {};
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
  assert.deepEqual(requests, ['/api/profiles', '/api/load']);
});
