(function () {
  const DEFAULT_KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 1 });
  const encoder = new TextEncoder();

  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function fromBase64(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function paramsFor(envelope, legacyAuth) {
    const params = envelope && envelope.kdf || legacyAuth;
    if (!params || !params.salt) throw new Error('This older encrypted profile needs its auth file. Select the profile and its auth file together.');
    return { name: 'scrypt', salt: params.salt, N: Number(params.N) || DEFAULT_KDF.N, r: Number(params.r) || DEFAULT_KDF.r, p: Number(params.p) || DEFAULT_KDF.p };
  }
  async function derive(password, params) {
    if (!window.scrypt || typeof window.scrypt.scrypt !== 'function') throw new Error('The password unlock component did not load. Reload Black Book and try again.');
    const salt = fromBase64(params.salt);
    const raw = await window.scrypt.scrypt(encoder.encode(String(password)), salt, params.N, params.r, params.p, 32);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function decrypt(envelope, key) {
    if (!envelope || envelope.enc !== 'aes-256-gcm') throw new Error('This is not an encrypted Black Book profile.');
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv), tagLength: 128 }, key, fromBase64(envelope.data));
    const data = JSON.parse(new TextDecoder().decode(clear));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The profile contents are not valid.');
    return data;
  }
  async function encrypt(data, key, kdf) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const clear = encoder.encode(JSON.stringify(data));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, clear));
    return { enc: 'aes-256-gcm', iv: toBase64(iv), data: toBase64(encrypted), kdf: { ...kdf } };
  }

  window.BrowserProfileCrypto = {
    async unlock(envelope, password, legacyAuth) {
      const kdf = paramsFor(envelope, legacyAuth);
      const key = await derive(password, kdf);
      try { return { data: await decrypt(envelope, key), key, metadata: kdf, session: { key, kdf } }; }
      catch (_) { throw new Error('Wrong password or corrupted profile.'); }
    },
    async create(data, password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const kdf = { ...DEFAULT_KDF, salt: toBase64(salt) };
      const key = await derive(password, kdf);
      return { envelope: await encrypt(data, key, kdf), session: { key, kdf } };
    },
    async save(data, session) {
      return encrypt(data, session.key, session.kdf);
    },
    async encrypt(data, key, metadata) {
      return encrypt(data, key, metadata);
    },
    isEncrypted(value) { return !!value && value.enc === 'aes-256-gcm'; }
  };
})();
