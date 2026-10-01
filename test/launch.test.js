import assert from 'node:assert/strict';
import test from 'node:test';
import { findInstance } from '../lib/launch.js';

test('launcher ignores another installation and unrelated listening services', async () => {
  const fakeFetch = async url => ({ ok: true, json: async () => url.includes(':9597/')
    ? { appName: 'Black Book', instanceId: 'other-copy' }
    : url.includes(':9999/') ? { appName: 'Black Book', instanceId: 'this-copy' } : {} });
  assert.equal(await findInstance([9597, 9999, 9877], 'this-copy', fakeFetch), 9999);
  assert.equal(await findInstance([9597, 9877], 'this-copy', fakeFetch), null);
});

test('launcher treats failures and invalid responses as unavailable', async () => {
  assert.equal(await findInstance([9597], 'this-copy', async () => { throw new Error('offline'); }), null);
  assert.equal(await findInstance([9597], 'this-copy', async () => ({ ok: false })), null);
});
