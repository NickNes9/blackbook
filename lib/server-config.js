import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = process.env.BLACK_BOOK_DATA_DIR ? resolve(process.env.BLACK_BOOK_DATA_DIR) : APP_DIR;
export const HOST = '127.0.0.1';
export const PROFILES_DIR = join(DATA_DIR, 'profiles');
export const LEGACY_DATA_FILE = join(DATA_DIR, 'data.json');
export const PID_FILE = join(DATA_DIR, 'Black Book.pid');
// Identify this installation, without exposing its local folder paths.
export const INSTANCE_ID = createHash('sha256').update(JSON.stringify([APP_DIR, DATA_DIR])).digest('hex');

export function preferredPorts(port) {
  return [...new Set([port, 9999, 9877, 9653, 9441, 9227, 8819])];
}
