import { readFileSync, unlinkSync } from 'node:fs';
import { INSTANCE_ID, PID_FILE, preferredPorts } from './server-config.js';
import { findInstance } from './launch.js';

try {
  const record = JSON.parse(readFileSync(PID_FILE, 'utf8'));
  const port = await findInstance(preferredPorts(Number(process.env.PORT) || 9597), INSTANCE_ID);
  if (port !== null) {
    const response = await fetch(`http://127.0.0.1:${port}/api/instance`, { signal: AbortSignal.timeout(1500) });
    const info = await response.json();
    if (info.instanceId === INSTANCE_ID && info.pid === record.pid && info.startedAt === record.startedAt && Number.isInteger(info.pid) && info.pid > 0) {
      process.kill(info.pid, 'SIGTERM');
      try { unlinkSync(PID_FILE); } catch { }
      console.log('Black Book stopped.');
    }
  }
} catch (error) {
  if (!['ENOENT', 'ESRCH'].includes(error.code)) {
    console.error('Could not stop this copy of Black Book: ' + error.message);
    process.exitCode = 1;
  }
}
