import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export class StorageError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
  }
}

export function safeProfileName(value) {
  const name = String(value || '').trim();
  if (!name) return '';
  if (!/^[a-zA-Z0-9 _.-]+$/.test(name) || name.toLowerCase() === 'data') return null;
  return name;
}

export function isProfileDocument(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isImportableProfile(value) {
  return isProfileDocument(value) && Array.isArray(value.accounts) &&
    Array.isArray(value.categories) && Array.isArray(value.transactions) &&
    isProfileDocument(value.settings);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createProfileStore({ profilesDir, legacyDataFile, defaultData, lastProfileFile = join(profilesDir, 'last-profile'), recoveryDir = join(profilesDir, '.recovery') }) {
  mkdirSync(profilesDir, { recursive: true });
  const defaultFile = join(profilesDir, 'data.json');
  const authFile = join(profilesDir, 'auth');
  const locationsFile = join(profilesDir, 'locations');
  function locations() {
    try { return JSON.parse(readFileSync(locationsFile, 'utf8')); } catch (_) { return {}; }
  }
  function rememberLocations(value) { writeFileSync(locationsFile, JSON.stringify(value, null, 2), 'utf8'); }
  function authLocation(profile) {
    const external = locations()[profile];
    return external ? { file:join(dirname(external), 'auth'), name:basename(external, '.json') } : { file:authFile, name:profile };
  }

  if (!existsSync(defaultFile) && legacyDataFile && existsSync(legacyDataFile)) {
    renameSync(legacyDataFile, defaultFile);
    if (existsSync(legacyDataFile + '.bak')) renameSync(legacyDataFile + '.bak', defaultFile + '.bak');
  }

  function profileFile(profile) {
    const name = safeProfileName(profile);
    if (name === null) throw new StorageError('Invalid profile name', 400);
    return locations()[name] || (name ? join(profilesDir, name + '.json') : defaultFile);
  }

  function recoveryFile(profile) {
    return join(recoveryDir, createHash('sha256').update(resolve(profileFile(profile))).digest('hex') + '.json');
  }

  function readAuth() {
    try { return JSON.parse(readFileSync(authFile, 'utf8')); }
    catch (_) { return {}; }
  }

  function writeAuth(map) {
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(authFile, JSON.stringify(map, null, 2), 'utf8');
  }

  function parseFile(file) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (!isProfileDocument(data)) throw new Error('Profile root must be an object');
      return data;
    } catch (error) {
      throw new StorageError(`Profile data is corrupted. Restore ${file.split(/[\\/]/).pop()} from its .bak backup.`, 500);
    }
  }

  function writeFileAtomically(file, data) {
    if (!isProfileDocument(data)) throw new StorageError('Profile data must be a JSON object', 400);
    const serialized = JSON.stringify(data, null, 2);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      mkdirSync(profilesDir, { recursive: true });
      if (existsSync(file)) copyFileSync(file, file + '.bak');
      writeFileSync(temp, serialized, 'utf8');
      renameSync(temp, file);
    } catch (error) {
      if (existsSync(temp)) {
        try { unlinkSync(temp); } catch (_) { }
      }
      if (error instanceof StorageError) throw error;
      throw new StorageError('Could not save profile data. Your previous file was kept.', 500);
    }
  }

  return {
    profileFile,
    rememberLastProfile(profile) {
      writeFileSync(lastProfileFile, JSON.stringify({ path: resolve(profileFile(profile)) }, null, 2), 'utf8');
    },
    lastUsedProfile() {
      try {
        const saved = JSON.parse(readFileSync(lastProfileFile, 'utf8'));
        if (typeof saved.path !== 'string' || !existsSync(saved.path)) return null;
        return this.registerFile(saved.path);
      } catch (_) { return null; }
    },
    registerFile(file) {
      const path = resolve(file);
      const data = parseFile(path);
      if (!isImportableProfile(data) && data.enc !== 'aes-256-gcm') throw new StorageError('Choose a Black Book profile JSON file.', 400);
      const map = locations();
      const existing = Object.keys(map).find(name => resolve(map[name]) === path);
      if (existing) return existing;
      const original = basename(path, '.json');
      const candidate = safeProfileName(original) || 'Opened Profile';
      if (resolve(join(profilesDir, candidate + '.json')) === path) return candidate;
      let name = candidate;
      let suffix = 2;
      while (map[name] || existsSync(join(profilesDir, name + '.json'))) name = candidate + ' ' + suffix++;
      if (data.enc === 'aes-256-gcm') {
        let auth;
        try { auth = JSON.parse(readFileSync(join(dirname(path), 'auth'), 'utf8'))[original]; } catch (_) {}
        if (!auth && !(data.kdf && data.kdf.salt)) throw new StorageError('This encrypted profile needs its original auth file beside it. Keep those files together, then open the profile again.', 400);
      }
      map[name] = path;
      rememberLocations(map);
      return name;
    },
    read(profile = '') {
      const pending = recoveryFile(profile);
      if (existsSync(pending)) return parseFile(pending);
      const file = profileFile(profile);
      if (!existsSync(file)) {
        if (locations()[profile]) throw new StorageError('The selected profile file has moved or is unavailable. Open it again from its new location.', 404);
        const fresh = clone(defaultData);
        writeFileAtomically(file, fresh);
        return fresh;
      }
      return parseFile(file);
    },
    readDefaultOrFresh() {
      return existsSync(defaultFile) ? parseFile(defaultFile) : clone(defaultData);
    },
    write(profile, data) {
      writeFileAtomically(profileFile(profile), data);
      const pending = recoveryFile(profile);
      if (existsSync(pending)) unlinkSync(pending);
    },
    stage(profile, data) {
      mkdirSync(recoveryDir, { recursive: true });
      const pending = recoveryFile(profile);
      const temp = pending + '.tmp';
      writeFileSync(temp, JSON.stringify(data), 'utf8');
      renameSync(temp, pending);
    },
    flush(profile) {
      const pending = recoveryFile(profile);
      if (!existsSync(pending)) return false;
      this.write(profile, parseFile(pending));
      return true;
    },
    backup(profile) {
      const file = profileFile(profile);
      if (!existsSync(file)) this.read(profile);
      parseFile(file);
      const name = safeProfileName(profile);
      const dir = join(profilesDir, 'BACKUPS', 'profile-' + (name || 'default'));
      const backupFile = join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.json');
      try {
        mkdirSync(dir, { recursive: true });
        copyFileSync(file, backupFile);
        return backupFile;
      } catch (_) {
        throw new StorageError('Could not create a pre-import backup. Import was cancelled.', 500);
      }
    },
    list() {
      mkdirSync(profilesDir, { recursive: true });
      const local = readdirSync(profilesDir)
        .filter((file) => file !== 'data.json' && !file.endsWith('.bak') && /^.+\.json$/.test(file))
        .map((file) => ({ name: file.slice(0, -5) }))
        ;
      return [...local, ...Object.keys(locations()).map(name => ({ name }))].sort((a,b) => a.name.localeCompare(b.name));
    },
    create(name) {
      const clean = safeProfileName(name);
      if (!clean) throw new StorageError('Invalid profile name', 400);
      const file = profileFile(clean);
      if (existsSync(file)) throw new StorageError('Profile already exists', 400);
      writeFileAtomically(file, clone(defaultData));
    },
    rename(name, newName) {
      const clean = safeProfileName(name);
      const cleanNew = safeProfileName(newName);
      if (clean === null || !cleanNew) throw new StorageError('Invalid profile name', 400);
      if (clean === cleanNew) throw new StorageError('Same name', 400);
      this.flush(clean);
      const map = locations();
      if (map[clean]) {
        if (map[cleanNew] || existsSync(join(profilesDir, cleanNew + '.json'))) throw new StorageError('Target profile already exists', 400);
        map[cleanNew] = map[clean]; delete map[clean]; rememberLocations(map); return;
      }
      const source = profileFile(clean);
      const destination = profileFile(cleanNew);
      if (!existsSync(source)) throw new StorageError('Profile not found', 404);
      if (existsSync(destination)) throw new StorageError('Target profile already exists', 400);
      renameSync(source, destination);
      if (existsSync(source + '.bak')) renameSync(source + '.bak', destination + '.bak');
      const auth = readAuth();
      if (Object.hasOwn(auth, clean)) {
        auth[cleanNew] = auth[clean];
        delete auth[clean];
        writeAuth(auth);
      }
    },
    delete(name) {
      const clean = safeProfileName(name);
      if (!clean) throw new StorageError('Cannot delete the default profile', 400);
      const pending = recoveryFile(clean);
      if (existsSync(pending)) unlinkSync(pending);
      const map = locations();
      if (map[clean]) { delete map[clean]; rememberLocations(map); return; }
      const file = profileFile(clean);
      if (!existsSync(file)) throw new StorageError('Profile not found', 404);
      unlinkSync(file);
      if (existsSync(file + '.bak')) unlinkSync(file + '.bak');
      const auth = readAuth();
      if (Object.hasOwn(auth, clean)) {
        delete auth[clean];
        writeAuth(auth);
      }
    },
    hasPassword(profile) {
      return !!this.getAuth(profile);
    },
    getAuth(profile) {
      const name = safeProfileName(profile);
      if (name === null) return null;
      const target = authLocation(name);
      try {
        const entry = JSON.parse(readFileSync(target.file, 'utf8'))[target.name];
        if (entry && entry.salt) return entry;
      } catch (_) {}
      try {
        const doc = parseFile(profileFile(name));
        if (doc && doc.enc === 'aes-256-gcm' && doc.kdf && doc.kdf.salt) return doc.kdf;
      } catch (_) {}
      return null;
    },
    setAuth(profile, entry) {
      const name = safeProfileName(profile);
      if (name === null) throw new StorageError('Invalid profile name', 400);
      const target = authLocation(name);
      let auth = {}; try { auth = JSON.parse(readFileSync(target.file, 'utf8')); } catch (_) {}
      auth[target.name] = entry;
      writeFileSync(target.file, JSON.stringify(auth, null, 2), 'utf8');
    },
    removeAuth(profile) {
      const name = safeProfileName(profile);
      if (name === null) throw new StorageError('Invalid profile name', 400);
      const target = authLocation(name);
      let auth = {}; try { auth = JSON.parse(readFileSync(target.file, 'utf8')); } catch (_) {}
      if (Object.hasOwn(auth, target.name)) {
        delete auth[target.name];
        writeFileSync(target.file, JSON.stringify(auth, null, 2), 'utf8');
      }
    }
  };
}
