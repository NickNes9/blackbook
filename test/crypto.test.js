import assert from 'node:assert/strict';
import test from 'node:test';
import { createSecretKey, timingSafeEqual } from 'node:crypto';
import { deriveKey, encryptProfileDoc, decryptProfileEnvelope } from '../lib/crypto.js';

const doc = { accounts: [{ id: 'a', name: 'Main', amount: 1234.5 }], settings: { baseCurrency: 'RSD' } };

test('deriveKey is deterministic for the same password+salt', () => {
  const salt = Buffer.alloc(16, 7).toString('base64');
  const a = deriveKey('secret', salt, { N: 16384, r: 8, p: 1 });
  const b = deriveKey('secret', salt, { N: 16384, r: 8, p: 1 });
  assert.ok(timingSafeEqual(a, b));
  assert.equal(a.length, 32);
});

test('deriveKey differs for a different password', () => {
  const salt = Buffer.alloc(16, 7).toString('base64');
  const a = createSecretKey(deriveKey('one', salt, {}));
  const b = createSecretKey(deriveKey('two', salt, {}));
  assert.notEqual(a.export().toString('base64'), b.export().toString('base64'));
});

test('encryptProfileDoc/decryptProfileEnvelope round-trip', () => {
  const { envelope, salt, opts } = encryptProfileDoc(doc, 'hunter2');
  assert.equal(envelope.enc, 'aes-256-gcm');
  assert.ok(envelope.iv && envelope.data);
  const out = decryptProfileEnvelope(envelope, 'hunter2', salt, opts);
  assert.deepEqual(out, doc);
});

test('wrong password throws', () => {
  const { envelope, salt, opts } = encryptProfileDoc(doc, 'right');
  assert.throws(() => decryptProfileEnvelope(envelope, 'wrong', salt, opts), /password/i);
});

test('tampered envelope data throws', () => {
  const { envelope, salt, opts } = encryptProfileDoc(doc, 'secret');
  const bad = {
    ...envelope,
    data: Buffer.from(['tampered' + envelope.data].join('').slice(0, 4) + envelope.data.slice(4)).toString('base64')
  };
  assert.throws(() => decryptProfileEnvelope(bad, 'secret', salt, opts));
});

test('each encryption uses a fresh IV', () => {
  const a = encryptProfileDoc(doc, 'pw');
  const b = encryptProfileDoc(doc, 'pw');
  assert.notEqual(a.envelope.iv, b.envelope.iv);
});