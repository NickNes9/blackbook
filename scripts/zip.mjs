// Builds the Black Book release zips using fflate. Handles per-platform
// launcher files, unix executable bits, and '/' entry names so the archives
// extract cleanly on Linux/macOS (PowerShell's Compress-Archive uses '\').
//   node scripts/zip.mjs <repo-root> <version>
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { RUNTIME_SPECS, runtimeFilename } from './runtime-spec.mjs';

const [root, version] = process.argv.slice(2);
if (!root || !version) {
  console.error('usage: node scripts/zip.mjs <repo-root> <version>');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('version must be X.Y.Z');
  process.exit(1);
}

// Explicit allowlist: never package profile data, logs, local notes, or
// unexpected files placed at the repository root.
const INCLUDE_TOPS = new Set([
  'lib', 'public', 'node_modules', 'server.js', 'package.json',
  'README.md', 'functions.txt', 'bb.ico', 'Black Book.exe',
  'Black Book.sh', 'Black Book.command', 'Stop Black Book.bat',
  'Stop Black Book.sh', 'Stop Black Book.command'
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
      if (!arc && !INCLUDE_TOPS.has(name)) continue;
      walkDir(full, arc ? arc + '/' + name : name, top || name);
    } else {
      if (!arc && !INCLUDE_TOPS.has(name)) continue;
      entryMap.set(arc ? arc + '/' + name : name, { full, top: top || name });
    }
  }
}

walkDir(root, '', '');

const dist = join(root, 'dist', version);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const encoder = new TextEncoder();

for (const plat of ['win', 'linux', 'mac']) {
  const data = {};
  const runtimeNames = ['version.txt', 'LICENSE.txt', ...RUNTIME_SPECS.filter(spec => spec.platform === plat).map(spec => runtimeFilename(spec.target))];
  for (const name of runtimeNames) {
    const bytes = readFileSync(join(root, 'runtime-build', plat, name));
    if (!bytes.length) throw new Error('Cannot package an empty runtime file: ' + name);
    data['runtime/' + name] = name.startsWith('node-') && plat !== 'win'
      ? [new Uint8Array(bytes), { os: 3, attrs: 0o755 << 16 }]
      : new Uint8Array(bytes);
  }
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
