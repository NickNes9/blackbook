import { openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { APP_DIR, INSTANCE_ID, preferredPorts } from './server-config.js';

export async function findInstance(ports, instanceId, fetcher = fetch) {
  const matches = await Promise.all(ports.map(async port => {
    try {
      const response = await fetcher(`http://127.0.0.1:${port}/api/instance`, { signal: AbortSignal.timeout(700) });
      if (!response.ok) return null;
      const info = await response.json();
      return info.appName === 'Black Book' && info.instanceId === instanceId ? port : null;
    } catch { return null; }
  }));
  return matches.find(port => port !== null) ?? null;
}

export async function launch() {
  const ports = preferredPorts(Number(process.env.PORT) || 9597);
  let port = await findInstance(ports, INSTANCE_ID);
  if (port === null) {
    const log = openSync(join(APP_DIR, 'Server.log'), 'a');
    try {
      const child = spawn(process.execPath, [join(APP_DIR, 'server.js')], {
        cwd: APP_DIR, detached: true, windowsHide: true, stdio: ['ignore', log, log]
      });
      child.on('error', error => console.error('Could not start Black Book:', error.message));
      child.unref();
    } finally { closeSync(log); }
    const deadline = Date.now() + 30000;
    while (port === null && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 300));
      port = await findInstance(ports, INSTANCE_ID);
    }
  }
  if (port === null) throw new Error('This copy of Black Book could not start. Check Server.log; no other installation was opened.');
  const url = `http://localhost:${port}`;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  browser.on('error', error => console.error(`Open ${url} in your browser: ${error.message}`));
  browser.unref();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  launch().catch(error => { console.error(error.message); process.exitCode = 1; });
}
