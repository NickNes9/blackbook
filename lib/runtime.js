import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR } from './server-config.js';

// Versioned filenames let an update install a new runtime while Windows
// still holds the previous executable open for the running server.
export function runtimeExecutable(root = APP_DIR, platformName = process.platform, architecture = process.arch) {
  const versionFile = join(root, 'runtime', 'version.txt');
  if (!existsSync(versionFile)) return process.execPath; // Source installations.
  const version = readFileSync(versionFile, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('The bundled runtime version is invalid. Extract a fresh Black Book download.');
  const target = platformName === 'win32' ? 'win-x64' : `${platformName}-${architecture}`;
  const executable = join(root, 'runtime', `node-v${version}-${target}${platformName === 'win32' ? '.exe' : ''}`);
  if (!existsSync(executable)) throw new Error('The bundled runtime is missing or does not support this computer. Extract the complete ZIP for your operating system.');
  return executable;
}
