import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { Updater, updateAssetName } from '../lib/updater.js';

function sandbox(t) {
  const rootDir = mkdtempSync(join(tmpdir(), 'black-book-updater-safety-'));
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  return rootDir;
}

function archive(files) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)]))));
}

function releaseUpdater(rootDir, files) {
  const zip = archive(files);
  const digest = createHash('sha256').update(zip).digest('hex');
  const assetName = updateAssetName('9.0.0', 'win');
  return new Updater({
    rootDir, platformName: 'win32',
    fetchJson: async () => ({ tag_name: 'v9.0.0', assets: [
      { name: assetName, browser_download_url: 'archive', size: zip.length },
      { name: 'checksums.sha256', browser_download_url: 'checksum' }
    ] }),
    fetchBuffer: async (url) => url === 'checksum' ? Buffer.from(`${digest}  ${assetName}\n`) : zip
  });
}

const criticalPayload = {
  'server.js': '// server',
  'package.json': JSON.stringify({ version: '9.0.0' }),
  'lib/updater.js': '// updater',
  'public/index.html': '<title>Black Book</title>'
};

test('applyUpdate rejects missing or empty critical payload files before touching application files', async (t) => {
  const rootDir = sandbox(t);
  writeFileSync(join(rootDir, 'server.js'), 'original');
  for (const name of Object.keys(criticalPayload)) {
    const missing = { ...criticalPayload };
    delete missing[name];
    await assert.rejects(releaseUpdater(rootDir, missing).applyUpdate(), /critical|missing/i, name);
    await assert.rejects(releaseUpdater(rootDir, { ...criticalPayload, [name]: '' }).applyUpdate(), /critical|empty/i, name);
    assert.equal(readFileSync(join(rootDir, 'server.js'), 'utf8'), 'original');
  }
});

test('applyUpdate rejects malformed or mismatched archive versions before installation', async (t) => {
  const rootDir = sandbox(t);
  writeFileSync(join(rootDir, 'server.js'), 'original');
  for (const manifest of ['invalid json', JSON.stringify({ version: '8.0.0' }), JSON.stringify({ version: 'garbage' })]) {
    await assert.rejects(releaseUpdater(rootDir, { ...criticalPayload, 'package.json': manifest }).applyUpdate(), /version|package\.json/i);
    assert.equal(readFileSync(join(rootDir, 'server.js'), 'utf8'), 'original');
  }
});

test('applyUpdate rolls back a failure partway through installation', async (t) => {
  const rootDir = sandbox(t);
  writeFileSync(join(rootDir, 'server.js'), 'original');
  const updater = releaseUpdater(rootDir, criticalPayload);
  const installFile = updater.installFile.bind(updater);
  updater.installFile = (name, bytes) => {
    if (name === 'public/index.html') throw new Error('injected install failure');
    installFile(name, bytes);
  };
  await assert.rejects(updater.applyUpdate(), /original files restored/);
  assert.equal(readFileSync(join(rootDir, 'server.js'), 'utf8'), 'original');
  assert.equal(existsSync(join(rootDir, 'package.json')), false);
  assert.equal(existsSync(join(rootDir, 'lib/updater.js')), false);
});

for (const [platformName, suffix] of [['win32', 'win'], ['darwin', 'mac'], ['linux', 'linux']]) {
  test(`${platformName} verifies the checksum for its exact asset filename`, async () => {
    const payload = Buffer.from('payload');
    const digest = createHash('sha256').update(payload).digest('hex');
    const name = updateAssetName('9.0.0', suffix);
    const updater = new Updater({ platformName, fetchBuffer: async () => Buffer.from(`${'0'.repeat(64)}  other.zip\n${digest} *${name}\n`) });
    await updater.verifyChecksum(payload, name, 'checksum');
  });
}

test('a valid checksum for a different filename cannot authorize an update', async () => {
  const payload = Buffer.from('payload');
  const digest = createHash('sha256').update(payload).digest('hex');
  const updater = new Updater({ fetchBuffer: async () => Buffer.from(`${digest}  wrong.zip\n`) });
  await assert.rejects(updater.verifyChecksum(payload, 'expected.zip', 'checksum'), /matching checksum/i);
});

test('ambiguous checksum entries for the selected asset are rejected', async () => {
  const payload = Buffer.from('payload');
  const digest = createHash('sha256').update(payload).digest('hex');
  const updater = new Updater({ fetchBuffer: async () => Buffer.from(`${digest}  expected.zip\n${'0'.repeat(64)}  expected.zip\n`) });
  await assert.rejects(updater.verifyChecksum(payload, 'expected.zip', 'checksum'), /checksum/i);
});

test('archive entries cannot overwrite user data, update history, or development files', async (t) => {
  const rootDir = sandbox(t);
  const updater = new Updater({ rootDir });
  for (const name of ['profiles/user/data.json', 'PROFILES/user/data.json', 'import/saved.csv', 'updates/backup/file.js', '.git/config', '.codex/config.toml', '.agents/instructions.md', '.github/workflows/test.yml', 'test/local.test.js', '.env', 'data.json', 'data.json.bak', 'Black Book.pid', 'Black Book.xlsx', 'debug.log', 'lib/saved.bak']) {
    await assert.rejects(updater.extractEntries(archive({ 'server.js': 'new', [name]: 'malicious' })), /protected|preserved/i, name);
  }
  assert.deepEqual(readdirSync(rootDir), []);
});

test('packaged dependencies install and preserve unrelated dependency files', async (t) => {
  const rootDir = sandbox(t);
  mkdirSync(join(rootDir, 'node_modules', 'example'), { recursive: true });
  writeFileSync(join(rootDir, 'node_modules', 'example', 'index.js'), 'old dependency');
  writeFileSync(join(rootDir, 'node_modules', 'example', 'local.js'), 'personal dependency');
  const updater = releaseUpdater(rootDir, { ...criticalPayload, 'node_modules/example/index.js': 'new dependency' });
  await updater.applyUpdate();
  assert.equal(readFileSync(join(rootDir, 'node_modules', 'example', 'index.js'), 'utf8'), 'new dependency');
  assert.equal(readFileSync(join(rootDir, 'node_modules', 'example', 'local.js'), 'utf8'), 'personal dependency');
  const backup = readdirSync(join(rootDir, 'updates')).find((name) => name.startsWith('backup-'));
  assert.equal(readFileSync(join(rootDir, 'updates', backup, 'node_modules', 'example', 'index.js'), 'utf8'), 'old dependency');
});

test('identical archive files are neither backed up nor written again', async (t) => {
  const rootDir = sandbox(t);
  writeFileSync(join(rootDir, 'server.js'), criticalPayload['server.js']);
  const updater = releaseUpdater(rootDir, criticalPayload);
  const installFile = updater.installFile.bind(updater);
  updater.installFile = (name, bytes) => {
    if (name === 'server.js') throw new Error('unchanged file should not be written');
    installFile(name, bytes);
  };
  await updater.applyUpdate();
  const backup = readdirSync(join(rootDir, 'updates')).find((name) => name.startsWith('backup-'));
  assert.equal(existsSync(join(rootDir, 'updates', backup, 'server.js')), false);
  assert.equal(readFileSync(join(rootDir, 'server.js'), 'utf8'), criticalPayload['server.js']);
});

test('packaged dependency writes roll back after a later install failure', async (t) => {
  const rootDir = sandbox(t);
  mkdirSync(join(rootDir, 'node_modules', 'example'), { recursive: true });
  writeFileSync(join(rootDir, 'node_modules', 'example', 'index.js'), 'old dependency');
  const updater = releaseUpdater(rootDir, { 'node_modules/example/index.js': 'new dependency', ...criticalPayload });
  const installFile = updater.installFile.bind(updater);
  updater.installFile = (name, bytes) => {
    if (name === 'public/index.html') throw new Error('injected failure');
    installFile(name, bytes);
  };
  await assert.rejects(updater.applyUpdate(), /original files restored/);
  assert.equal(readFileSync(join(rootDir, 'node_modules', 'example', 'index.js'), 'utf8'), 'old dependency');
});

test('absolute, traversal and Windows alternate-stream paths are rejected', async (t) => {
  const updater = new Updater({ rootDir: sandbox(t) });
  for (const name of ['../escape.js', '/absolute.js', 'C:/escape.js', 'server.js:secret', './profiles/data.json', 'CON', 'lib/NUL.js', 'lib/name?.js']) {
    await assert.rejects(updater.extractEntries(archive({ [name]: 'malicious' })), /unsafe|escapes|protected/i, name);
  }
});

test('archive destinations cannot follow a dangling directory link', async (t) => {
  const rootDir = sandbox(t);
  const linked = join(rootDir, 'lib');
  symlinkSync(join(rootDir, 'missing-directory'), linked, 'junction');
  const updater = new Updater({ rootDir });
  await assert.rejects(updater.extractEntries(archive({ 'lib/new.js': 'new' })), /symbolic link/i);
});

test('installing preserves unrelated files absent from the archive', (t) => {
  const rootDir = sandbox(t);
  mkdirSync(join(rootDir, 'scripts'));
  writeFileSync(join(rootDir, 'scripts', 'local-tool.js'), 'personal tool');
  writeFileSync(join(rootDir, 'server.js'), 'old');
  const updater = new Updater({ rootDir });
  updater.syncTree(new Map([['server.js', strToU8('new')]]));
  assert.equal(readFileSync(join(rootDir, 'server.js'), 'utf8'), 'new');
  assert.equal(readFileSync(join(rootDir, 'scripts', 'local-tool.js'), 'utf8'), 'personal tool');
});

test('backup directories are unique and preserve previous backups', async (t) => {
  const rootDir = sandbox(t);
  writeFileSync(join(rootDir, 'server.js'), 'old');
  const updater = new Updater({ rootDir });
  const entries = new Map([['server.js', strToU8('new')]]);
  const first = await updater.backupCurrentCode(entries);
  writeFileSync(join(first, 'sentinel'), 'keep');
  const second = await updater.backupCurrentCode(entries);
  assert.notEqual(first, second);
  assert.equal(readFileSync(join(first, 'sentinel'), 'utf8'), 'keep');
});

test('a failure after writing files restores originals and removes newly installed files', async (t) => {
  const rootDir = sandbox(t);
  writeFileSync(join(rootDir, 'server.js'), 'old server');
  writeFileSync(join(rootDir, 'README-personal.md'), 'personal');
  const updater = new Updater({ rootDir });
  const entries = new Map([['server.js', strToU8('new server')], ['lib/new.js', strToU8('new file')], ['last.js', strToU8('fail')]]);
  const backupDir = await updater.backupCurrentCode(entries);
  const installFile = updater.installFile.bind(updater);
  updater.installFile = (name, bytes) => {
    installFile(name, bytes);
    if (name === 'last.js') throw new Error('injected write failure');
  };
  assert.throws(() => updater.syncTree(entries, backupDir), /injected write failure/);
  assert.equal(readFileSync(join(rootDir, 'server.js'), 'utf8'), 'old server');
  assert.equal(readFileSync(join(rootDir, 'README-personal.md'), 'utf8'), 'personal');
  assert.equal(existsSync(join(rootDir, 'lib/new.js')), false);
  assert.equal(existsSync(join(rootDir, 'last.js')), false);
  assert.equal(readFileSync(join(backupDir, 'server.js'), 'utf8'), 'old server');
});
