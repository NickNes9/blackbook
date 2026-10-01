import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { NODE_VERSION, RUNTIME_SPECS, runtimeFilename } from '../scripts/runtime-spec.mjs';

test('release archives include runtime assets and exclude local profile data and unexpected files', () => {
  const root = mkdtempSync(join(tmpdir(), 'black-book-release-test-'));
  try {
    mkdirSync(join(root, 'public'), { recursive: true });
    mkdirSync(join(root, 'profiles'), { recursive: true });
    writeFileSync(join(root, 'public', 'index.html'), 'APP');
    writeFileSync(join(root, 'profiles', 'data.json'), 'PRIVATE');
    writeFileSync(join(root, '.env'), 'SECRET');
    writeFileSync(join(root, 'server.js'), 'SERVER');
    for (const name of ['Black Book.exe', 'Black Book.sh', 'Black Book.command']) writeFileSync(join(root, name), 'LAUNCH');
    for (const spec of RUNTIME_SPECS) {
      const dir = join(root, 'runtime-build', spec.platform);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'version.txt'), NODE_VERSION);
      writeFileSync(join(dir, 'LICENSE.txt'), 'LICENSE');
      writeFileSync(join(dir, runtimeFilename(spec.target)), 'RUNTIME-' + spec.target);
    }
    const result = spawnSync(process.execPath, ['scripts/zip.mjs', root, '0.9.3'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (const platform of ['win', 'linux', 'mac']) {
      const archive = unzipSync(readFileSync(join(root, 'dist', '0.9.3', `black-book-v0.9.3-${platform}.zip`)));
      assert.equal(Buffer.from(archive['public/index.html']).toString(), 'APP');
      assert.equal(archive['profiles/data.json'], undefined);
      assert.equal(archive['.env'], undefined);
      assert.equal(Buffer.from(archive['runtime/version.txt']).toString(), NODE_VERSION);
      assert.ok(archive['runtime/LICENSE.txt']);
      for (const spec of RUNTIME_SPECS) {
        assert.equal(Boolean(archive['runtime/' + runtimeFilename(spec.target)]), spec.platform === platform, 'only the correct platform runtimes may ship');
      }
      assert.equal(Boolean(archive['Black Book.exe']), platform === 'win');
      assert.equal(Boolean(archive['Black Book.sh']), platform === 'linux');
      assert.equal(Boolean(archive['Black Book.command']), platform === 'mac');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release packaging refuses to ship without a bundled runtime', () => {
  const root = mkdtempSync(join(tmpdir(), 'black-book-runtime-missing-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/zip.mjs', root, '0.9.5'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /runtime-build/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
