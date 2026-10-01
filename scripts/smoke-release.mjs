import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { unzipSync, zipSync } from 'fflate';
import { Updater } from '../lib/updater.js';
import { runtimeExecutable } from '../lib/runtime.js';

const archivePath = resolve(process.argv[2] || 'dist/0.9.5/black-book-v0.9.5-win.zip');
const root = mkdtempSync(join(tmpdir(), 'black-book-clean-install-'));
let child;
try {
  const files = unzipSync(readFileSync(archivePath));
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(!/^(profiles|import|updates|\.git)\//i.test(name), 'Private or development content packaged: ' + name);
    assert.ok(!name.split('/').includes('..') && !name.startsWith('/'));
    const target = join(root, name);
    if (name.endsWith('/')) { mkdirSync(target, { recursive: true }); continue; }
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  }
  async function start() {
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    assert.ok(files['runtime/version.txt'], 'release must include its own runtime');
    child = spawn(runtimeExecutable(root), ['server.js'], { cwd: root, env: { ...process.env, PATH: process.platform === 'win32' ? join(process.env.WINDIR, 'System32') : '/usr/bin:/bin', BLACK_BOOK_DATA_DIR: join(root, 'test-data'), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = ''; child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    const deadline = Date.now() + 10000;
    while (!output.includes('Black Book running') && Date.now() < deadline && child.exitCode == null) await new Promise(resolve => setTimeout(resolve, 25));
    assert.match(output, /Black Book running/, output);
    return 'http://127.0.0.1:' + port;
  }
  async function stop() { if (child && child.exitCode == null) { const exited = once(child, 'exit'); child.kill(); await exited; } child = null; }
  let origin = await start();
  const html = await fetch(origin).then(r => r.text());
  assert.match(html, /data-health\.js/);
  assert.deepEqual((await fetch(origin + '/api/profiles').then(r => r.json())).profiles, [], 'clean install should have no sample or user profiles');
  const data = await fetch(origin + '/api/load').then(r => r.json());
  for (const key of ['accounts', 'transactions', 'bills', 'billPayments', 'savingsGoals', 'budgets', 'installments', 'debts']) {
    assert.deepEqual(data[key], [], 'clean install should have no ' + key);
  }
  data.transactions.push({ id: 'smoke-save', date: '2026-01-01', amount: -42, type: 'expense', currency: 'EUR' });
  assert.equal((await fetch(origin + '/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).status, 200);
  assert.equal((await fetch(origin + '/api/invoice-file/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: '', id: 'missing' }) })).status, 404);
  const originalProfile = readFileSync(join(root, 'test-data/profiles/data.json'));
  const pkg = JSON.parse(Buffer.from(files['package.json']).toString());
  pkg.version = '99.0.0'; files['package.json'] = new TextEncoder().encode(JSON.stringify(pkg));
  const buffer = Buffer.from(zipSync(files)), name = 'black-book-v99.0.0-win.zip';
  const checksum = createHash('sha256').update(buffer).digest('hex') + '  ' + name;
  const updater = new Updater({ rootDir: root, platformName: 'win32', fetchJson: async () => ({ tag_name: 'v99.0.0', assets: [{ name, size: buffer.length, browser_download_url: 'https://fixture/update' }, { name: 'checksums.sha256', browser_download_url: 'https://fixture/checksums' }] }), fetchBuffer: async url => url.endsWith('/checksums') ? Buffer.from(checksum) : buffer });
  assert.equal((await updater.applyUpdate()).ok, true);
  assert.deepEqual(readFileSync(join(root, 'test-data/profiles/data.json')), originalProfile);
  await stop();
  assert.equal(spawnSync(runtimeExecutable(root), ['--check', 'server.js'], { cwd: root }).status, 0);
  origin = await start();
  assert.equal((await fetch(origin + '/api/version').then(r => r.json())).version, '99.0.0');
  assert.equal((await fetch(origin + '/api/load').then(r => r.json())).transactions[0].id, 'smoke-save');
  await stop();
  console.log('PASS: bundled runtime without installed Node on PATH, empty clean install, save/reload, verified update, preserved data, restart.');
} finally {
  if (child && child.exitCode == null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  // root is created by mkdtemp above; never targets an installed app.
  rmSync(root, { recursive: true, force: true });
}
