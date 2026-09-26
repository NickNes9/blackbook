import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { unzipSync } from 'fflate';

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
    const result = spawnSync(process.execPath, ['scripts/zip.mjs', root, '0.9.2'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (const platform of ['win', 'linux', 'mac']) {
      const archive = unzipSync(readFileSync(join(root, 'dist', '0.9.2', `black-book-v0.9.2-${platform}.zip`)));
      assert.equal(Buffer.from(archive['public/index.html']).toString(), 'APP');
      assert.equal(archive['profiles/data.json'], undefined);
      assert.equal(archive['.env'], undefined);
      assert.equal(Boolean(archive['Black Book.exe']), platform === 'win');
      assert.equal(Boolean(archive['Black Book.sh']), platform === 'linux');
      assert.equal(Boolean(archive['Black Book.command']), platform === 'mac');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
