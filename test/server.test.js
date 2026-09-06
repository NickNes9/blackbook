import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { HOST } from '../lib/server-config.js';

async function openPort() {
  const probe = createServer();
  probe.listen(0, HOST);
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer(dataDir) {
  const port = await openPort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, BLACK_BOOK_DATA_DIR: dataDir, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const started = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 5_000);
    const poll = setInterval(() => {
      if (output.includes('Black Book running')) { clearTimeout(timeout); clearInterval(poll); resolve(); }
    }, 20);
    child.once('exit', (code) => { clearTimeout(timeout); clearInterval(poll); reject(new Error(`Server exited early (${code}): ${output}`)); });
  });
  return { child, origin: `http://${HOST}:${port}`, started };
}

test('server is loopback-only and preserves the API profile document contract', async () => {
  assert.equal(HOST, '127.0.0.1');
  const dataDir = mkdtempSync(join(tmpdir(), 'black-book-server-test-'));
  let child;
  try {
    const server = await startServer(dataDir);
    child = server.child;
    const page = await fetch(server.origin + '/');
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);

    const initial = await fetch(server.origin + '/api/load').then((response) => response.json());
    assert.deepEqual(initial.accounts, []);
    const profile = { ...initial, futureField: { kept: true }, transactions: [{ id: 'history-1', amount: -42 }] };
    const saved = await fetch(server.origin + '/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile)
    });
    assert.equal(saved.status, 200);
    assert.deepEqual((await fetch(server.origin + '/api/load').then((response) => response.json())).futureField, { kept: true });

    const invalid = await fetch(server.origin + '/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]'
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'profiles', 'data.json'), 'utf8')).futureField, { kept: true });
  } finally {
    if (child && !child.killed) child.kill();
    if (child) await once(child, 'exit').catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
  }
});
