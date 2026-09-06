import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createProfileStore({ profilesDir, legacyDataFile, defaultData }) {
  mkdirSync(profilesDir, { recursive: true });
  const defaultFile = join(profilesDir, 'data.json');

  if (!existsSync(defaultFile) && legacyDataFile && existsSync(legacyDataFile)) {
    renameSync(legacyDataFile, defaultFile);
    if (existsSync(legacyDataFile + '.bak')) renameSync(legacyDataFile + '.bak', defaultFile + '.bak');
  }

  function profileFile(profile) {
    const name = safeProfileName(profile);
    if (name === null) throw new StorageError('Invalid profile name', 400);
    return name ? join(profilesDir, name + '.json') : defaultFile;
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
    read(profile = '') {
      const file = profileFile(profile);
      if (!existsSync(file)) {
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
    },
    list() {
      return readdirSync(profilesDir)
        .filter((file) => file !== 'data.json' && !file.endsWith('.bak') && /^.+\.json$/.test(file))
        .map((file) => ({ name: file.slice(0, -5) }))
        .sort((a, b) => a.name.localeCompare(b.name));
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
      const source = profileFile(clean);
      const destination = profileFile(cleanNew);
      if (!existsSync(source)) throw new StorageError('Profile not found', 404);
      if (existsSync(destination)) throw new StorageError('Target profile already exists', 400);
      renameSync(source, destination);
      if (existsSync(source + '.bak')) renameSync(source + '.bak', destination + '.bak');
    },
    delete(name) {
      const clean = safeProfileName(name);
      if (!clean) throw new StorageError('Cannot delete the default profile', 400);
      const file = profileFile(clean);
      if (!existsSync(file)) throw new StorageError('Profile not found', 404);
      unlinkSync(file);
    }
  };
}
