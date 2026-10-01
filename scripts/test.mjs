import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Scope discovery to source tests. Update/code backups can contain older tests.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tests = readdirSync(join(root, 'test')).filter(name => name.endsWith('.test.js')).sort().map(name => join(root, 'test', name));
if (!tests.length) throw new Error('No source tests found.');
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
