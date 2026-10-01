import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { NODE_VERSION, RUNTIME_SPECS, runtimeFilename } from './runtime-spec.mjs';

const root = resolve(process.argv[2] || '.');
const cache = join(root, 'runtime-build', 'cache');
mkdirSync(cache, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

for (const spec of RUNTIME_SPECS) {
  const prefix = `node-v${NODE_VERSION}-${spec.target}`;
  const archiveName = `${prefix}.${spec.extension}`;
  const archivePath = join(cache, archiveName);
  let bytes = existsSync(archivePath) ? readFileSync(archivePath) : null;
  if (!bytes || hash(bytes) !== spec.sha256) {
    console.log(`Downloading official ${archiveName}...`);
    const response = await fetch(`https://nodejs.org/download/release/v${NODE_VERSION}/${archiveName}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Node.js download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== spec.sha256) throw new Error(`Node.js checksum mismatch: ${archiveName}`);
    writeFileSync(archivePath, bytes);
  }
  const destination = join(root, 'runtime-build', spec.platform);
  mkdirSync(destination, { recursive: true });
  if (spec.extension === 'zip') {
    const files = unzipSync(bytes, { filter: entry => [prefix + '/node.exe', prefix + '/LICENSE'].includes(entry.name) });
    if (!files[prefix + '/node.exe'] || !files[prefix + '/LICENSE']) throw new Error('Official Node.js archive is missing required files.');
    writeFileSync(join(destination, runtimeFilename(spec.target)), files[prefix + '/node.exe']);
    writeFileSync(join(destination, 'LICENSE.txt'), files[prefix + '/LICENSE']);
  } else {
    const staging = mkdtempSync(join(cache, 'extract-'));
    try {
      const result = spawnSync('tar', ['-xf', archivePath, '-C', staging, prefix + '/bin/node', prefix + '/LICENSE'], { encoding: 'utf8', windowsHide: true });
      if (result.error || result.status !== 0) throw new Error(`Could not extract Node.js. A tar command with xz support is required: ${result.error?.message || result.stderr}`);
      copyFileSync(join(staging, prefix, 'bin/node'), join(destination, runtimeFilename(spec.target)));
      copyFileSync(join(staging, prefix, 'LICENSE'), join(destination, 'LICENSE.txt'));
    } finally { rmSync(staging, { recursive: true, force: true }); }
  }
  writeFileSync(join(destination, 'version.txt'), NODE_VERSION + '\n');
  console.log(`Verified and prepared ${spec.target}.`);
}
