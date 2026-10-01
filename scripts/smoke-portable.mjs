import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { unzipSync } from 'fflate';
import { NODE_VERSION } from './runtime-spec.mjs';

if (process.platform !== 'win32') throw new Error('The portable Windows launcher check must run on Windows.');
const archive = resolve(process.argv[2] || 'dist/0.9.5/black-book-v0.9.5-win.zip');
const temporary = mkdtempSync(join(tmpdir(), 'black-book-portable-'));
let root = join(temporary, 'Folder With Spaces');
mkdirSync(root);
const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, PATH: join(process.env.WINDIR, 'System32'), PORT: String(port), BLACK_BOOK_DATA_DIR: join(temporary, 'Must Not Be Used') };
async function executable(...args) {
  const child = spawn(join(root, 'Black Book.exe'), args, { cwd: temporary, env, windowsHide: true, stdio: 'ignore' });
  const timeout = setTimeout(() => child.kill(), 45000);
  try { const [code] = await once(child, 'exit'); assert.equal(code, 0, 'portable launcher failed'); }
  finally { clearTimeout(timeout); }
}
let running = false;
try {
  const files = unzipSync(readFileSync(archive));
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(!/^(profiles|import|updates|\.git)\//i.test(name));
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'));
    const path = join(root, name);
    if (name.endsWith('/')) { mkdirSync(path, { recursive: true }); continue; }
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
  }
  await executable('--no-browser'); running = true;
  const info = await fetch(origin + '/api/instance').then(response => response.json());
  assert.equal(info.runtimeVersion, NODE_VERSION, 'must run the bundled runtime rather than installed Node');
  assert.deepEqual((await fetch(origin + '/api/profiles').then(response => response.json())).profiles, []);
  const fresh = await fetch(origin + '/api/load').then(response => response.json());
  assert.deepEqual(fresh.transactions, []);
  fresh.transactions.push({ id: 'portable-save', date: '2026-01-01', amount: -10, currency: 'EUR', type: 'expense' });
  assert.equal((await fetch(origin + '/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fresh) })).status, 200);
  assert.ok(existsSync(join(root, 'profiles', 'data.json')));
  assert.equal(existsSync(join(temporary, 'Must Not Be Used')), false, 'portable launch must keep its data in the app folder');
  const original = readFileSync(join(root, 'profiles', 'data.json'));
  await executable('--stop'); running = false;
  assert.equal(existsSync(join(root, 'Black Book.pid')), false, 'Stop launcher must stop this installation');
  const moved = join(temporary, 'Moved Portable Folder'); renameSync(root, moved); root = moved;
  await executable('--no-browser'); running = true;
  assert.equal((await fetch(origin + '/api/load').then(response => response.json())).transactions[0].id, 'portable-save');
  assert.deepEqual(readFileSync(join(root, 'profiles', 'data.json')), original, 'moving folders must preserve saved data');
  await executable('--stop'); running = false;
  console.log('PASS: actual Windows launcher without Node on PATH, local saves, Stop launcher, move folder, reopen with history intact.');
} finally {
  if (running) { try { await executable('--stop'); } catch { } }
  // Only this script-owned temporary fixture is removed.
  rmSync(temporary, { recursive: true, force: true });
}
