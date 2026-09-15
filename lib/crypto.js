import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export const DEFAULT_KDF = { N: 32768, r: 8, p: 1 };

export function deriveKey(password, saltBase64, opts = {}) {
  const { N = DEFAULT_KDF.N, r = DEFAULT_KDF.r, p = DEFAULT_KDF.p } = opts || {};
  return scryptSync(String(password), Buffer.from(saltBase64, 'base64'), 32, { N, r, p, maxmem: 128 * 1024 * 1024 });
}

export function encryptProfileDoc(doc, password) {
  const salt = randomBytes(16);
  const key = deriveKey(password, salt.toString('base64'));
  return {
    envelope: encryptWithKey(doc, key),
    salt: salt.toString('base64'),
    opts: { N: DEFAULT_KDF.N, r: DEFAULT_KDF.r, p: DEFAULT_KDF.p }
  };
}

export function encryptWithKey(doc, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(doc), 'utf8');
  const data = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { enc: 'aes-256-gcm', iv: iv.toString('base64'), data: data.toString('base64') };
}

export function decryptProfileEnvelope(envelope, password, saltBase64, opts = {}) {
  if (!envelope || envelope.enc !== 'aes-256-gcm') throw new Error('Not an encrypted profile');
  const key = deriveKey(password, saltBase64, opts);
  return decryptEnvelope(envelope, key);
}

export function decryptEnvelope(envelope, key) {
  if (!envelope || envelope.enc !== 'aes-256-gcm') throw new Error('Not an encrypted profile');
  const iv = Buffer.from(envelope.iv, 'base64');
  const payload = Buffer.from(envelope.data, 'base64');
  if (payload.length < 16) throw new Error('Invalid encrypted payload');
  const tag = payload.subarray(payload.length - 16);
  const body = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch (error) {
    throw new Error('Wrong password or corrupted profile');
  }
}