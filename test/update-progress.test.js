import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { Updater } from '../lib/updater.js';

test('applyUpdate reports downloaded bytes and install stages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bb-update-progress-'));
  const previousFetch = globalThis.fetch;
  try {
    mkdirSync(join(dir, 'public'), { recursive: true });
    const zip = Buffer.from(zipSync({ 'public/app.js': strToU8('new version'), 'server.js': strToU8('// server'), 'lib/updater.js': strToU8('// updater'), 'public/index.html': strToU8('<html>App</html>'), 'package.json': strToU8(JSON.stringify({ version: '99.0.0' })) }));
    const assetName = 'black-book-v99.0.0-win.zip';
    const checksum = createHash('sha256').update(zip).digest('hex') + '  ' + assetName + '\n';
    const release = { tag_name: 'v99.0.0', assets: [
      { name: assetName, size: zip.length, browser_download_url: 'https://example.test/update.zip' },
      { name: 'checksums.sha256', browser_download_url: 'https://example.test/checksums' }
    ] };
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/checksums')) return new Response(checksum);
      const stream = new ReadableStream({ start(controller) {
        const split = Math.ceil(zip.length / 2);
        controller.enqueue(zip.subarray(0, split));
        controller.enqueue(zip.subarray(split));
        controller.close();
      } });
      return new Response(stream, { headers: { 'content-length': String(zip.length) } });
    };

    const updater = new Updater({
      rootDir: dir,
      platformName: 'win32',
      fetchJson: async () => release,
      log: () => {}
    });
    const events = [];
    await updater.applyUpdate({ onProgress: (event) => events.push(event) });

    assert.deepEqual(events.filter(event => event.stage === 'downloading').map(event => event.received), [0, Math.ceil(zip.length / 2), zip.length]);
    assert.deepEqual(events.map(event => event.stage), ['downloading', 'downloading', 'downloading', 'verifying', 'installing', 'restarting']);
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
