// Builds the Black Book release zips using fflate. Handles per-platform
// launcher files, unix executable bits, and '/' entry names so the archives
// extract cleanly on Linux/macOS (PowerShell's Compress-Archive uses '\').
//   node scripts/zip.mjs <repo-root> <version>
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const [root, version] = process.argv.slice(2);
if (!root || !version) {
  console.error('usage: node scripts/zip.mjs <repo-root> <version>');
  process.exit(1);
}

const EXCLUDE_TOPS = new Set([
  'profiles', 'import', 'updates', '.git', '.superpowers',
  'data.json', 'data.json.bak', 'Black Book.xlsx', 'Black Book.pid',
  'Thumbs.db', '.DS_Store', 'dist', 'Server.log',
  'docs', 'scripts', 'test', 'package-lock.json', 'launcher.cs',
  '.gitattributes', '.gitignore'
]);
const WIN_LAUNCHERS = new Set(['Black Book.exe', 'Stop Black Book.bat', 'bb.ico', 'launcher.cs']);
const LINUX_LAUNCHERS = new Set(['Black Book.sh', 'Stop Black Book.sh']);
const MAC_LAUNCHERS = new Set(['Black Book.command', 'Stop Black Book.command']);
const EXECUTABLES = new Set([...LINUX_LAUNCHERS, ...MAC_LAUNCHERS]);
const PER_PLATFORM_EXCLUDE = {
  win: new Set([...LINUX_LAUNCHERS, ...MAC_LAUNCHERS]),
  linux: new Set([...WIN_LAUNCHERS, ...MAC_LAUNCHERS]),
  mac: new Set([...WIN_LAUNCHERS, ...LINUX_LAUNCHERS])
};

const entryMap = new Map();

function walkDir(dir, arc, top) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!arc && (EXCLUDE_TOPS.has(name) || /\.(log|bak)$/i.test(name))) continue;
      walkDir(full, arc ? arc + '/' + name : name, top || name);
    } else {
      if (!arc && (EXCLUDE_TOPS.has(name) || /\.(log|bak)$/i.test(name))) continue;
      entryMap.set(arc ? arc + '/' + name : name, { full, top: top || name });
    }
  }
}

walkDir(root, '', '');

const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const encoder = new TextEncoder();

for (const plat of ['win', 'linux', 'mac']) {
  const data = {};
  for (const [arc, info] of entryMap) {
    if (PER_PLATFORM_EXCLUDE[plat].has(info.top)) continue;
    const buf = readFileSync(info.full);
    if (EXECUTABLES.has(info.top)) {
      const text = buf.toString('utf8').replace(/\r\n/g, '\n');
      data[arc] = [encoder.encode(text), { os: 3, attrs: 0o755 << 16 }];
    } else {
      data[arc] = new Uint8Array(buf);
    }
  }
  const zipPath = join(dist, `black-book-v${version}-${plat}.zip`);
  writeFileSync(zipPath, Buffer.from(zipSync(data)));
  console.log(`built ${zipPath} (${entryMap.size} entries scanned)`);
}