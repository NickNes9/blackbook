import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { Updater, UpdateError } from '../lib/updater.js';
import { currentVersion } from '../lib/version-util.js';

function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  return parts[0] + '.' + parts[1] + '.' + (parts[2] + 1);
}
const NEW_VERSION = bumpPatch(currentVersion());

function makeRelease(version, { count = 1 } = {}) {
  const name = 'black-book-v' + version + '-win.zip';
  const assets = [
    { name: 'checksums.sha256', size: 64, browser_download_url: 'https://example/test/checksums.sha256' },
    { name, size: 5000, browser_download_url: 'https://example/test/' + name }
  ];
  if (count === 2) assets.push({ name: 'black-book-v' + version + '-linux.zip', size: 5000, browser_download_url: 'https://example/test/black-book-v' + version + '-linux.zip' });
  return { tag_name: 'v' + version, name: 'v' + version, body: 'Release notes', draft: false, prerelease: false, assets };
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'bb-update-'));
  mkdirSync(join(dir, 'public', 'js'), { recursive: true });
  mkdirSync(join(dir, 'profiles', 'Me'), { recursive: true });
  writeFileSync(join(dir, 'public', 'js', 'core.js'), 'OLD CORE');
  writeFileSync(join(dir, 'old-file.txt'), 'STALE');
  writeFileSync(join(dir, 'profiles', 'Me', 'data.json'), '{"keep":true}');
  return dir;
}

function makeZip(entries) {
  const files = {};
  for (const [name, content] of Object.entries(entries)) files[name] = strToU8(content);
  return Buffer.from(zipSync(files));
}

function sha(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function makeUpdater(dir, { zip, release, checksumText, bufferImpl, platformName = 'win32' } = {}) {
  const resolvedZip = zip || makeZip({ 'public/js/core.js': 'NEW CORE' });
  const resolvedRelease = release || makeRelease(NEW_VERSION);
  const zipAsset = (resolvedRelease && resolvedRelease.assets || []).find((a) => /[-\w]+\.zip$/i.test(a.name));
  if (zipAsset) zipAsset.size = resolvedZip.length;
  const resolvedChecksum = checksumText || (sha(resolvedZip) + '  ' + (zipAsset ? zipAsset.name : 'black-book-v' + NEW_VERSION + '-win.zip') + '\n');
  return new Updater({
    rootDir: dir,
    repo: 'NickNes9/blackbook',
    platformName,
    log: () => {},
    fetchJson: async () => resolvedRelease,
    fetchBuffer: bufferImpl || (async (url) => {
      if (/checksums\.sha256$/i.test(url)) return Buffer.from(resolvedChecksum, 'utf8');
      return resolvedZip;
    })
  });
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch (_) { }
}

test('checkForUpdate reports no update when release matches current version', async () => {
  const dir = makeFixture();
  try {
    const updater = makeUpdater(dir, { release: makeRelease(currentVersion()) });
    const status = await updater.checkForUpdate();
    assert.equal(status.updateAvailable, false);
    assert.equal(status.reason, 'up-to-date');
    assert.equal(status.currentVersion, currentVersion());
  } finally { cleanup(dir); }
});

test('checkForUpdate reports an available update with a platform asset', async () => {
  const dir = makeFixture();
  try {
    const updater = makeUpdater(dir);
    const status = await updater.checkForUpdate();
    assert.equal(status.updateAvailable, true);
    assert.equal(status.reason, 'available');
    assert.equal(status.latest.version, NEW_VERSION);
    assert.match(status.latest.assetName, /-win\.zip$/);
    assert.match(status.latest.assets || '', /.*/);
  } finally { cleanup(dir); }
});

test('checkForUpdate reports new version but no build for this OS', async () => {
  const dir = makeFixture();
  try {
    const release = makeRelease(NEW_VERSION, { count: 2 });
    release.assets = release.assets.filter((a) => !/-win\.zip$/.test(a.name));
    const updater = makeUpdater(dir, { release });
    const status = await updater.checkForUpdate();
    assert.equal(status.updateAvailable, true);
    assert.equal(status.reason, 'no-asset');
    assert.equal(status.latest.assetUrl, null);
  } finally { cleanup(dir); }
});

test('checkForUpdate does not crash when the remote is unreachable', async () => {
  const dir = makeFixture();
  try {
    const updater = new Updater({ rootDir: dir, repo: 'x/y', platformName: 'win32', fetchJson: async () => { throw new Error('ECONNREFUSED'); } });
    const status = await updater.checkForUpdate();
    assert.equal(status.updateAvailable, false);
    assert.equal(status.reason, 'unreachable');
  } finally { cleanup(dir); }
});

test('applyUpdate swaps code, removes stale files, preserves user data and writes a backup', async () => {
  const dir = makeFixture();
  try {
    const zip = makeZip({ 'public/js/core.js': 'NEW CORE', 'lib/new-file.js': 'NEW FILE' });
    const updater = makeUpdater(dir, { zip });
    const result = await updater.applyUpdate();
    assert.equal(result.ok, true);
    assert.equal(result.toVersion, NEW_VERSION);
    assert.equal(readFileSync(join(dir, 'public/js/core.js'), 'utf8'), 'NEW CORE');
    assert.equal(readFileSync(join(dir, 'lib/new-file.js'), 'utf8'), 'NEW FILE');
    assert.equal(existsSync(join(dir, 'old-file.txt')), false, 'stale top-level file should be removed');
    assert.equal(readFileSync(join(dir, 'profiles/Me/data.json'), 'utf8'), '{"keep":true}');
    const backup = readdirSync(join(dir, 'updates')).find((n) => n.startsWith('backup-'));
    assert.ok(backup, 'backup dir should exist');
    assert.equal(readFileSync(join(dir, 'updates', backup, 'public/js/core.js'), 'utf8'), 'OLD CORE');
  } finally { cleanup(dir); }
});

test('applyUpdate aborts cleanly when the archive contains a path traversal', async () => {
  const dir = makeFixture();
  try {
    const zip = makeZip({ '../evil.txt': 'MALICIOUS' });
    const updater = makeUpdater(dir, { zip });
    await assert.rejects(() => updater.applyUpdate(), (error) => {
      assert.ok(error instanceof UpdateError);
      assert.match(error.message, /unsafe path/);
      return true;
    });
    assert.equal(readFileSync(join(dir, 'public/js/core.js'), 'utf8'), 'OLD CORE');
    assert.equal(existsSync(join(dir, 'profiles/Me/data.json')), true);
    assert.equal(existsSync(join(dir, '..', 'evil.txt')), false);
  } finally { cleanup(dir); }
});

test('applyUpdate refuses to install when the checksum does not match and changes nothing', async () => {
  const dir = makeFixture();
  try {
    const zip = makeZip({ 'public/js/core.js': 'NEW CORE' });
    const updater = makeUpdater(dir, { zip, checksumText: 'deadbeef'.repeat(8) + '  ' + 'black-book-v' + NEW_VERSION + '-win.zip\n' });
    await assert.rejects(() => updater.applyUpdate(), (error) => {
      assert.ok(error instanceof UpdateError);
      assert.match(error.message, /Checksum mismatch/);
      return true;
    });
    assert.equal(readFileSync(join(dir, 'public/js/core.js'), 'utf8'), 'OLD CORE');
    assert.equal(existsSync(join(dir, 'profiles/Me/data.json')), true);
    assert.equal(readdirSync(join(dir, 'updates'), { recursive: true }).filter((n) => String(n).includes('backup-')).length, 0, 'no backup should exist after abort');
  } finally { cleanup(dir); }
});

test('applyUpdate refuses when the release has no checksums.sha256', async () => {
  const dir = makeFixture();
  try {
    const release = makeRelease(NEW_VERSION);
    release.assets = release.assets.filter((a) => a.name !== 'checksums.sha256');
    const updater = makeUpdater(dir, { release });
    await assert.rejects(() => updater.applyUpdate(), /refusing to auto-update/);
    assert.equal(readFileSync(join(dir, 'public/js/core.js'), 'utf8'), 'OLD CORE');
  } finally { cleanup(dir); }
});

test('applyUpdate throws when no update is available', async () => {
  const dir = makeFixture();
  try {
    const updater = makeUpdater(dir, { release: makeRelease(currentVersion()) });
    await assert.rejects(() => updater.applyUpdate(), /No update is currently available/);
  } finally { cleanup(dir); }
});

test('platform asset suffixes map to win, mac and linux', () => {
  const dir = makeFixture();
  try {
    const mac = new Updater({ rootDir: dir, platformName: 'darwin', fetchJson: async () => null });
    const linux = new Updater({ rootDir: dir, platformName: 'linux', fetchJson: async () => null });
    const win = new Updater({ rootDir: dir, platformName: 'win32', fetchJson: async () => null });
    assert.equal(win.assetSuffix(), 'win');
    assert.equal(mac.assetSuffix(), 'mac');
    assert.equal(linux.assetSuffix(), 'linux');
  } finally { cleanup(dir); }
});

test('applyUpdate keeps launcher scripts executable (posix)', async () => {
  if (platform() === 'win32') return;
  const dir = makeFixture();
  try {
    const zip = makeZip({ 'public/js/core.js': 'NEW CORE', 'Black Book.sh': '#!/bin/sh\necho hi\n' });
    const updater = makeUpdater(dir, { zip, platformName: 'linux' });
    await updater.applyUpdate();
    const mode = statSync(join(dir, 'Black Book.sh')).mode;
    assert.ok((mode & 0o111) !== 0, 'launcher should be executable after install (mode ' + mode.toString(8) + ')');
  } finally { cleanup(dir); }
});