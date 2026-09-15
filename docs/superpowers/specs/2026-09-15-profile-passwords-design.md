# Design: Profile Passwords

Encrypt password-protected Black Book profiles at rest and gate profile access
behind an unlock flow while keeping the app local-first and backward
compatible with existing plaintext profiles.

## 1. Threat Model

- Password-protected profile files must be unreadable on disk without the
  password (real encryption at rest, per user decision).
- Existing profiles without a password stay plaintext JSON exactly as today —
  no migration required, fully backward compatible.
- The server is loopback-only, runs in memory, shuts down after 10 min idle,
  and is restarted on every launch. Unlock state lives in server memory only,
  so a fresh launch always starts locked again (matches "asks on every
  launch").
- Forgetting a password means the profile data is unrecoverable (no reset
  path). Deleting the password restores normal plaintext access.

## 2. Crypto

All crypto uses Node's built-in `node:crypto` — no new dependencies.

- Key derivation: **scrypt** (`crypto.scryptSync`), N=32768, r=8, p=1,
  dklen=32. New random 16-byte salt per profile.
- Encryption: **AES-256-GCM**, random 12-byte IV, plaintext is the UTF-8 JSON
  of the whole profile document. GCM auth tag is appended to the ciphertext.
- File format of a passworded profile (`profiles/<name>.json`):
  ```json
  { "enc": "aes-256-gcm", "iv": "<base64>", "data": "<base64 ciphertext+tag>" }
  ```
- The GCM tag doubles as the password verifier: decrypting with the wrong key
  throws ⇒ **401**. No separate verifier hash is stored.

## 3. Auth metadata

New file `profiles/auth` (no `.json` extension so `storage.list()` never
treats it as a profile; lives under the already-gitignored `profiles/`).

```json
{
  "Nick": { "salt": "<base64>", "N": 32768, "r": 8, "p": 1 },
  "":      { "salt": "<base64>", "N": 32768, "r": 8, "p": 1 }
}
```

Keyed by profile name; `""` is the default profile (file `data.json`). Absence
of an entry ⇒ profile has no password. Existing `profiles/data.json` and
`profiles/<name>.json` files have no entries and keep working.

## 4. Server

### New module `lib/crypto.js`
- `deriveKey(password, salt, opts)` → 32-byte Buffer (scrypt).
- `encryptProfileDoc(doc, password)` → `{ envelope, salt, opts }`.
- `decryptProfileEnvelope(envelope, password, salt)` → plaintext doc (throws
  on wrong password / tamper).

### Storage extension (`lib/storage.js`)
- `createProfileStore` gains:
  - `hasPassword(name)` / `getAuth(name)` / `setAuth(name, entry)` /
    `removeAuth(name)` / `renameAuth(a, b)` — thin helpers over the `auth`
    file (read/write whole file atomically; missing file = `{}`).
  - `list()` keeps returning names only; `auth` must not be listed (it doesn't
    match the `*.json` filter already).
  - `read`/`write`/`rename`/`delete`/`create` untouched (they operate on the
    envelope document when passworded; the envelope is just a JSON object).

### In-memory session (`server.js`)
- `const unlocked = new Map()` — profile name → `{ doc, key }` (plaintext
  document + scrypt key, held only in memory while unlocked).
- `POST /api/unlock` `{ name, password }`:
  - no auth entry ⇒ 400 (nothing to unlock).
  - decrypt envelope with password; on failure ⇒ 401.
  - store `{ doc, key }` in `unlocked`, return `{ ok: true, doc }`.
- `GET /api/load`:
  - profile has auth entry ⇒ must be in `unlocked` else 401 `{ error: 'locked' }`.
  - passwordless ⇒ current behavior (fresh doc created if missing).
- `POST /api/save`:
  - passworded ⇒ must be unlocked; re-encrypt with retained key, write
    envelope atomically (`.bak` preserved).
  - passwordless ⇒ current behavior.
- `POST /api/profiles`:
  - `create` gains optional `password`; when given, profile doc is
    encrypted and the auth entry written; the new profile is auto-unlocked.
  - `setPassword` `{ name, currentPassword?, newPassword }`: current password
    required when an entry exists (verified by decrypt). Re-encrypts live doc
    (or encrypts the plaintext doc), updates salt, keeps `unlocked` fresh.
  - `removePassword` `{ name, password }`: verifies, writes the plaintext doc
    to disk, deletes auth entry, drops the unlock entry.
  - `rename`/`delete`: carry/remove the auth entry alongside the file.
- `GET /api/exchange-rate` reads the default profile; if the default profile
  is locked, skip rate persistence (don't fail).

## 5. Client

### Lock overlay
- New full-screen overlay `#unlock-overlay` in `public/index.html`: logo,
  profile name, password input, UNLOCK button, CHANGE PROFILE button that
  switch to a profile picker (list of profiles with lock/no-lock state).
- Shown when `core.js init()` finds the target profile `hasPassword` and the
  server returns 401 on `/api/load`.
- Unlock POST → on success set `this.data` from the returned doc and continue
  normal init (theme, migrations, nav, render).

### Profile switching (`page-settings.js`)
- `switchProfile(name)`: if target `hasPassword` and not yet unlocked, open
  the unlock overlay instead of reloading; on success remember
  `localStorage.mb_profile`, reload.
- PROFILES rows: add PASSWORD button per row → modal `#password-modal` with
  SET / CHANGE / REMOVE actions (current-password field appears when the
  profile already has a password; new + confirm fields for the new one).
- NEW PROFILE modal: optional password + confirm password fields; when set,
  the `create` call includes the password.

### "Last used profile"
- Unchanged mechanics: `localStorage.mb_profile` is written on successful
  switch/unlock; `init()` auto-gates behind it. No password needed for a
  passwordless last-used profile ⇒ lands directly on Overview (normal start).

## 6. Edge cases

- Creating a passworded profile auto-unlocks it (user just typed it).
- Setting a password on the active profile re-encrypts live data; the unlock
  entry is updated so the session keeps working without re-entering it.
- Saving a passworded profile never writes plaintext to disk (.bak holds the
  previous envelope).
- Export JSON / CSV operate on the in-memory plaintext of the unlocked
  profile (no change to export UI).
- Wrong password during unlock, setPassword, or removePassword ⇒ 401 with a
  clear error shown in the modal.

## 7. Tests

- `test/crypto.test.js`: scrypt-derived key is deterministic; round-trip
  encrypt→decrypt yields the same doc; wrong password throws; tampered
  envelope throws.
- `test/storage.test.js` additions: auth helpers add/remove/rename; `auth`
  missing = `{}`; `list()` never includes `auth`.
- `test/server.test.js` additions:
  - load 401 for locked passworded profile, 200 after unlock.
  - save re-encrypts (disk file is an envelope, not the doc).
  - unlock with wrong password ⇒ 401.
  - setPassword / changePassword / removePassword flows (incl. current
    password required once set).
  - create with password auto-unlocks; rename/delete carry/clean auth entry.
  - passwordless profiles unchanged.
- `npm run check` syntax pass; `npm test` all green.

## 8. Out of scope

- No per-profile lock timeout or idle-auto-lock (server restart already
  re-locks).
- No password recovery (encryption makes it structurally impossible).
- No changes to the updater/release pipeline (it never touches `profiles/`).