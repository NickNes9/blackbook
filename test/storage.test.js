import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createProfileStore, safeProfileName, StorageError } from '../lib/storage.js';

const defaults = { accounts: [], settings: { baseCurrency: 'RSD' } };

test('opened profile saves to its selected location and remembers that location', () => {
  const dir = mkdtempSync(join(tmpdir(), 'black-book-open-file-'));
  try {
    const profilesDir = join(dir, 'profiles');
    const file = join(dir, 'Selected.json');
    const original = { accounts:[], categories:[], transactions:[], settings:{ baseCurrency:'EUR' } };
    writeFileSync(file, JSON.stringify(original));
    const store = createProfileStore({ profilesDir, defaultData:defaults });
    const name = store.registerFile(file);
    store.write(name, { ...original, transactions:[{ id:'new', amount:123 }] });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).transactions.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(file + '.bak', 'utf8')), original);
    const reopened = createProfileStore({ profilesDir, defaultData:defaults });
    assert.equal(reopened.profileFile(name), file);
    assert.equal(reopened.read(name).transactions.length, 1);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('opened encrypted profile uses its original password metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'black-book-open-locked-'));
  try {
    const file = join(dir, 'Locked.json');
    writeFileSync(file, JSON.stringify({ enc:'aes-256-gcm', iv:'test', data:'test' }));
    writeFileSync(join(dir, 'auth'), JSON.stringify({ Locked:{ salt:'original' } }));
    const store = createProfileStore({ profilesDir:join(dir, 'profiles'), defaultData:defaults });
    const name = store.registerFile(file);
    assert.equal(store.hasPassword(name), true);
    assert.equal(store.getAuth(name).salt, 'original');
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('a moved profile folder is recovered without touching the moved data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'black-book-moved-'));
  try {
    const profilesDir = join(dir, 'profiles');
    const moved = join(dir, 'moved');
    const store = createProfileStore({ profilesDir, defaultData: defaults });
    store.write('Private', { marker: 'keep' });
    renameSync(profilesDir, moved);
    assert.deepEqual(store.list(), []);
    assert.deepEqual(store.read(''), defaults);
    assert.equal(JSON.parse(readFileSync(join(moved, 'Private.json'), 'utf8')).marker, 'keep');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

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

test('auth helpers default to empty and exclude no profile from listing', () => withStore((store) => {
  assert.equal(store.hasPassword('Nick'), false);
  assert.deepEqual(store.list(), []);
}));

test('setAuth/getAuth/removeAuth round-trip', () => withStore((store) => {
  store.write('Nick', { marker: true });
  store.setAuth('Nick', { salt: 'abc', N: 32768, r: 8, p: 1 });
  assert.equal(store.hasPassword('Nick'), true);
  assert.deepEqual(store.getAuth('Nick'), { salt: 'abc', N: 32768, r: 8, p: 1 });
  assert.deepEqual(store.list(), [{ name: 'Nick' }]);
  store.removeAuth('Nick');
  assert.equal(store.hasPassword('Nick'), false);
}));

test('auth entries support the default profile and survive renames', () => withStore((store) => {
  store.write('', { marker: true });
  store.setAuth('', { salt: 's', N: 32768, r: 8, p: 1 });
  assert.equal(store.hasPassword(''), true);
  store.rename('', 'Home');
  assert.equal(store.hasPassword(''), false);
  assert.equal(store.hasPassword('Home'), true);
}));

test('deleting a profile removes its auth entry but keeps others', () => withStore((store) => {
  store.write('A', {});
  store.write('B', {});
  store.setAuth('A', { salt: 'a', N: 32768, r: 8, p: 1 });
  store.setAuth('B', { salt: 'b', N: 32768, r: 8, p: 1 });
  store.delete('A');
  assert.equal(store.hasPassword('A'), false);
  assert.equal(store.hasPassword('B'), true);
}));
