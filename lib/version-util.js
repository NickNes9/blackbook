import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let cachedVersion = null;
let cachedVersionPath = null;

export function parseVersion(raw) {
  if (typeof raw !== 'string') return null;
  const s = String(raw).trim().replace(/^[vV]/, '');
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+]([0-9A-Za-z.-]+))?$/.exec(s);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? String(m[4]).split('.').filter(Boolean) : []
  };
}

function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const d = Number(x) - Number(y);
      if (d) return d;
    } else if (xNum) {
      return -1;
    } else if (yNum) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

export function currentVersion(packageJsonPath = null) {
  const versionFile = packageJsonPath || fileURLToPath(new URL('../package.json', import.meta.url));
  if (cachedVersion !== null && cachedVersionPath === versionFile) return cachedVersion;
  const json = JSON.parse(readFileSync(versionFile, 'utf8'));
  cachedVersion = String(json.version || '0.0.0');
  cachedVersionPath = versionFile;
  return cachedVersion;
}