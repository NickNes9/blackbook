import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createProfileStore, safeProfileName, StorageError } from '../lib/storage.js';

const defaults = { accounts: [], settings: { baseCurrency: 'RSD' } };

function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'black-book-test-'));
  try { return fn(createProfileStore({ profilesDir: join(dir, 'profiles'), defaultData: defaults })); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('profile names reject paths and reserve the default name', () => {
  assert.equal(safeProfileName('Nick'), 'Nick');
  assert.equal(safeProfileName('../Nick'), null);
  assert.equal(safeProfileName('data'), null);
  assert.equal(safeProfileName(''), '');
});

test('new profiles start from an independent default document', () => withStore((store) => {
  const first = store.read('Test');
  first.settings.baseCurrency = 'EUR';
  assert.equal(store.read('Test').settings.baseCurrency, 'RSD');
  assert.deepEqual(store.list(), [{ name: 'Test' }]);
}));

test('writes preserve the previous valid document as a backup', () => withStore((store) => {
  store.write('Test', { marker: 'before', futureField: { preserved: true } });
  store.write('Test', { marker: 'after', futureField: { preserved: true } });
  assert.equal(store.read('Test').marker, 'after');
  assert.equal(JSON.parse(readFileSync(store.profileFile('Test') + '.bak', 'utf8')).marker, 'before');
}));

test('corrupted profiles are not overwritten or silently accepted', () => withStore((store) => {
  const file = store.profileFile('Broken');
  writeFileSync(file, '{not valid json', 'utf8');
  assert.throws(() => store.read('Broken'), (error) => error instanceof StorageError && /corrupted/.test(error.message));
  assert.equal(readFileSync(file, 'utf8'), '{not valid json');
}));

test('saves require an object document', () => withStore((store) => {
  assert.throws(() => store.write('Test', []), (error) => error instanceof StorageError && error.status === 400);
}));
