import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/js/updates-ui.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('update completion uses app notifications instead of a blocking overlay', () => {
  assert.doesNotMatch(html, /id="update-overlay"/);
});

test('update notification shows accessible download progress and current stage', () => {
  const notice = { innerHTML: '', classList: { add() {}, remove() {} } };
  const window = { BlackBook: {} };
  const document = { getElementById: id => id === 'update-notice' ? notice : null };
  runInNewContext(source, { window, document });

  window.UpdateUi._progress = { stage: 'downloading', received: 50, total: 100, version: '0.9.6' };
  window.UpdateUi.renderBanner();

  assert.match(notice.innerHTML, /Downloading update/);
  assert.match(notice.innerHTML, /role="progressbar"/);
  assert.match(notice.innerHTML, /aria-valuenow="50"/);
  assert.match(notice.innerHTML, /50%/);
});

test('update notification reports verification and restart without a blocking overlay', () => {
  const notice = { innerHTML: '', classList: { add() {}, remove() {} } };
  const window = { BlackBook: {} };
  const document = { getElementById: id => id === 'update-notice' ? notice : null };
  runInNewContext(source, { window, document });

  window.UpdateUi._progress = { stage: 'verifying', received: 100, total: 100, version: '0.9.6' };
  window.UpdateUi.renderBanner();
  assert.match(notice.innerHTML, /Verifying update/);
  assert.doesNotMatch(notice.innerHTML, /update-notice-progress-bar.*aria-valuenow/);
});

test('update action consumes streamed download progress and records the installed version', async () => {
  const notice = { innerHTML: '', classList: { add() {}, remove() {} } };
  const settings = { innerHTML: '' };
  const installed = {};
  const window = { BlackBook: { _updating: false, showToast() {} } };
  const document = { getElementById: id => id === 'update-notice' ? notice : id === 'settings-updates' ? settings : null };
  const encoder = new TextEncoder();
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('{"stage":"downloading","version":"0.9.6","received":50,"total":100}\n'));
    controller.enqueue(encoder.encode('{"type":"complete","ok":true,"toVersion":"0.9.6"}\n'));
    controller.close();
  } });
  const context = {
    window,
    document,
    fetch: async () => ({ ok: true, body }),
    sessionStorage: { setItem: (key, value) => { installed[key] = value; } },
    TextDecoder,
    Uint8Array,
    setTimeout: () => 1,
    clearTimeout() {}
  };
  runInNewContext(source, context);
  context.window.UpdateUi.status = { updateAvailable: true, reason: 'available', latest: { version: '0.9.6' } };
  await context.window.UpdateUi.updateNow();

  assert.equal(installed['blackbook-update-installed-version'], '0.9.6');
  assert.match(notice.innerHTML, /Installed · restarting/);
  assert.match(settings.innerHTML, /UPDATING…/);
});
