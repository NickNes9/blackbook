import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    const timeout = setTimeout(() => { clearInterval(poll); reject(new Error(`Server did not start: ${output}`)); }, 5_000);
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

test('password-protected profiles are encrypted at rest and locked after restart until unlocked', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'black-book-server-test-'));
  let child;
  try {
    let server = await startServer(dataDir);
    child = server.child;
    const origin = server.origin;

    const created = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: 'Vault', password: 's3cret' })
    });
    assert.equal(created.status, 200);
    assert.deepEqual((await fetch(origin + '/api/profiles').then((r) => r.json())).profiles, [{ name: 'Vault', hasPassword: true }]);
    assert.equal((await fetch(origin + '/api/load?profile=Vault')).status, 200, 'new profile auto-unlocks');

    const unlockedDoc = (await fetch(origin + '/api/load?profile=Vault').then((r) => r.json()));
    unlockedDoc.accounts = [{ id: 'a1', name: 'HIDDEN', amount: 999 }];
    const save = await fetch(origin + '/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'Vault', data: unlockedDoc })
    });
    assert.equal(save.status, 200);

    const onDisk = JSON.parse(readFileSync(join(dataDir, 'profiles', 'Vault.json'), 'utf8'));
    assert.equal(onDisk.enc, 'aes-256-gcm');
    assert.ok(!String(onDisk.data).includes('HIDDEN'));

    child.kill();
    await once(child, 'exit');
    server = await startServer(dataDir);
    child = server.child;

    const locked = await fetch(server.origin + '/api/load?profile=Vault');
    assert.equal(locked.status, 401);

    const badUnlock = await fetch(server.origin + '/api/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vault', password: 'wrong' })
    });
    assert.equal(badUnlock.status, 401);

    const unlock = await fetch(server.origin + '/api/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vault', password: 's3cret' })
    });
    assert.equal(unlock.status, 200);
    assert.deepEqual((await unlock.json()).doc.accounts.map((a) => a.name), ['HIDDEN']);

    const reloaded = await fetch(server.origin + '/api/load?profile=Vault').then((r) => r.json());
    assert.deepEqual(reloaded.accounts.map((a) => a.name), ['HIDDEN']);

    const passwordless = await fetch(server.origin + '/api/load').then((r) => r.json());
    assert.deepEqual(passwordless.accounts, []);
  } finally {
    if (child && !child.killed) child.kill();
    if (child) await once(child, 'exit').catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('setPassword/changePassword/removePassword flows work end to end', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'black-book-server-test-'));
  let child;
  try {
    const server = await startServer(dataDir);
    child = server.child;
    const origin = server.origin;

    await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: 'First' })
    });
    const doc = { accounts: [{ id: 'x', name: 'HIDDEN-MARKER-ACCT' }], futureField: { kept: true } };
    await fetch(origin + '/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'First', data: doc })
    });

    const setPw = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPassword', name: 'First', newPassword: 'one' })
    });
    assert.equal(setPw.status, 200);
    assert.equal((await fetch(origin + '/api/load?profile=First')).status, 200, 'setPassword keeps profile unlocked');
    assert.equal((await fetch(origin + '/api/profiles').then((r) => r.json())).profiles[0].hasPassword, true);
    const enveloped = JSON.parse(readFileSync(join(dataDir, 'profiles', 'First.json'), 'utf8'));
    assert.equal(enveloped.enc, 'aes-256-gcm');
    assert.ok(!String(enveloped.data).includes('HIDDEN-MARKER-ACCT'));

    const unlock = await fetch(origin + '/api/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First', password: 'one' })
    });
    assert.equal(unlock.status, 200);
    assert.deepEqual((await unlock.json()).doc.futureField, { kept: true });

    const changeNoCurrent = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPassword', name: 'First', newPassword: 'two' })
    });
    assert.equal(changeNoCurrent.status, 401);

    const changeWithCurrent = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPassword', name: 'First', currentPassword: 'one', newPassword: 'two' })
    });
    assert.equal(changeWithCurrent.status, 200);

    await fetch(origin + '/api/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First', password: 'two' })
    });

    const removeLater = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removePassword', name: 'First', currentPassword: 'nope' })
    });
    assert.equal(removeLater.status, 401);

    const remove = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removePassword', name: 'First', currentPassword: 'two' })
    });
    assert.equal(remove.status, 200);
    assert.equal((await fetch(origin + '/api/profiles').then((r) => r.json())).profiles[0].hasPassword, false);
    const plain = JSON.parse(readFileSync(join(dataDir, 'profiles', 'First.json'), 'utf8'));
    assert.equal(plain.futureField.kept, true);
    assert.equal((await fetch(origin + '/api/load?profile=First')).status, 200);
  } finally {
    if (child && !child.killed) child.kill();
    if (child) await once(child, 'exit').catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('rename and delete move or clean auth entries', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'black-book-server-test-'));
  let child;
  try {
    let server = await startServer(dataDir);
    child = server.child;
    const origin = server.origin;

    await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: 'Old', password: 'pw' })
    });

    const renamed = await fetch(origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', name: 'Old', newName: 'New' })
    });
    assert.equal(renamed.status, 200);
    assert.deepEqual((await fetch(origin + '/api/profiles').then((r) => r.json())).profiles, [{ name: 'New', hasPassword: true }]);

    child.kill();
    await once(child, 'exit');
    server = await startServer(dataDir);
    child = server.child;

    assert.equal((await fetch(server.origin + '/api/load?profile=New')).status, 401, 'auth entry moved with rename');

    const unlock = await fetch(server.origin + '/api/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New', password: 'pw' })
    });
    assert.equal(unlock.status, 200);

    const deleted = await fetch(server.origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', name: 'New' })
    });
    assert.equal(deleted.status, 200);

    assert.deepEqual((await fetch(server.origin + '/api/load?profile=Old').then((r) => r.json())).accounts, [], 'old name reloads as a fresh profile');

    const deleteOld = await fetch(server.origin + '/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', name: 'Old' })
    });
    assert.equal(deleteOld.status, 200);
    const list = (await fetch(server.origin + '/api/profiles').then((r) => r.json())).profiles;
    assert.deepEqual(list, []);
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'profiles', 'auth'), 'utf8')), {}, 'auth entry cleaned on delete');
  } finally {
    if (child && !child.killed) child.kill();
    if (child) await once(child, 'exit').catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
  }
});
