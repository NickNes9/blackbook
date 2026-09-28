import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/js/updates-ui.js', import.meta.url), 'utf8');

function setup() {
  const notice = { innerHTML: '', classList: { hidden: true, add() { this.hidden = true; }, remove() { this.hidden = false; } } };
  const section = { scrolled: false, scrollIntoView() { this.scrolled = true; } };
  const calls = [];
  const window = { BlackBook: { navigateTo(page) { calls.push(page); } } };
  const document = { getElementById(id) { return id === 'update-notice' ? notice : id === 'settings-updates' ? section : null; } };
  runInNewContext(source, { window, document });
  return { ui: window.UpdateUi, notice, section, calls };
}

test('startup update check shows a versioned header notice and dismissal lasts for the run', async () => {
  const { ui, notice } = setup();
  const requests = [];
  const status = { currentVersion: '0.9.3', updateAvailable: true, reason: 'available', latest: { version: '0.9.4' } };
  const context = { window: { UpdateUi: ui }, document: { getElementById: () => notice }, fetch: async url => {
    requests.push(url);
    return { ok: true, json: async () => status };
  } };
  runInNewContext(source, context);
  await context.window.UpdateUi.init();
  assert.deepEqual(requests, ['/api/updates/status?refresh=1']);
  assert.match(notice.innerHTML, /UPDATE AVAILABLE · .*v0\.9\.4/);
  assert.equal(notice.classList.hidden, false);
  context.window.UpdateUi.dismissBanner();
  context.window.UpdateUi.renderBanner();
  assert.equal(notice.classList.hidden, true);
});

test('update notice opens About & Updates', () => {
  const { ui, section, calls } = setup();
  ui.openUpdates();
  assert.deepEqual(calls, ['settings']);
  assert.equal(section.scrolled, true);
});
