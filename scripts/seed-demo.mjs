import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createProfileStore } from '../lib/storage.js';
import { createDemoProfile } from '../lib/demo-profile.js';

// Explicitly targets Demo only. Personal profiles are never opened.
const profilesDir = resolve(process.argv[2] || 'profiles');
mkdirSync(profilesDir, { recursive: true });
const store = createProfileStore({ profilesDir, defaultData: {} });
if (store.hasPassword('Demo')) throw new Error('Demo is password-protected; it was left unchanged.');
const target = join(profilesDir, 'Demo.json');
if (existsSync(target)) {
  const backup = target + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(target, backup);
  console.log('Existing Demo backed up: ' + backup);
}
store.write('Demo', createDemoProfile());
console.log('Fictional expanded Demo saved: ' + target);
