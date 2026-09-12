import net from 'node:net';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST } from './server-config.js';

const POLL_MS = 300;
const WAIT_TIMEOUT_MS = 45_000;

function portIsFree(port) {
  return new Promise((resolvePromise) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (free) => { if (settled) return; settled = true; socket.destroy(); resolvePromise(free); };
    socket.setTimeout(500);
    socket.once('connect', () => done(false));
    socket.once('timeout', () => done(true));
    socket.once('error', (error) => done(error && (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET')));
    socket.connect(port, HOST);
  });
}

async function waitForPortToFree(port) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portIsFree(port)) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
  }
  return false;
}

function startServer(port, appDir) {
  const child = spawn(process.execPath, [join(appDir, 'server.js')], {
    cwd: appDir,
    env: { ...process.env, PORT: String(port) },
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true
  });
  if (child.unref) child.unref();
}

async function main() {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
  const appDir = fileURLToPath(new URL('..', import.meta.url));
  const freed = await waitForPortToFree(port);
  if (!freed) return;
  startServer(port, appDir);
}

main();