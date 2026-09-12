import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, currentVersion, isNewerVersion, parseVersion } from '../lib/version-util.js';

test('parseVersion strips a v prefix and reads numeric parts', () => {
  const v = parseVersion('v0.8.3');
  assert.deepEqual(v, { major: 0, minor: 8, patch: 3, prerelease: [] });
});

test('parseVersion rejects garbage and non-strings', () => {
  assert.equal(parseVersion('banana'), null);
  assert.equal(parseVersion('0.8'), null);
  assert.equal(parseVersion(null), null);
  assert.equal(parseVersion(42), null);
});

test('compareVersions orders plain releases numerically', () => {
  assert.ok(compareVersions('0.8.2', '0.8.3') < 0);
  assert.ok(compareVersions('0.8.3', '0.8.2') > 0);
  assert.equal(compareVersions('0.8.3', 'v0.8.3'), 0);
  assert.ok(compareVersions('0.9.0', '0.8.99') > 0);
  assert.ok(compareVersions('1.0.0', '0.9.9') > 0);
});

test('compareVersions treats prerelease versions as older than their release', () => {
  assert.ok(compareVersions('0.9.0-beta.1', '0.9.0') < 0);
  assert.ok(compareVersions('0.9.0-alpha.2', '0.9.0-alpha.10') < 0);
  assert.ok(compareVersions('0.9.0-beta', '0.9.0-alpha') > 0);
  assert.ok(compareVersions('0.9.0-rc.1', '0.9.0-beta.2') > 0);
});

test('isNewerVersion reports the update condition', () => {
  assert.equal(isNewerVersion('0.8.4', '0.8.3'), true);
  assert.equal(isNewerVersion('0.8.3', '0.8.3'), false);
  assert.equal(isNewerVersion('0.8.2', '0.8.3'), false);
});

test('currentVersion reads the real package.json and is a valid semver', () => {
  const version = currentVersion();
  assert.ok(parseVersion(version), version);
});