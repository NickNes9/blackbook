import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { unzipSync } from 'fflate';
import { APP_DIR } from './server-config.js';
import { currentVersion, isNewerVersion } from './version-util.js';

export class UpdateError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'UpdateError';
    this.status = status;
  }
}

const PLATFORM_ASSET = { win32: 'win', darwin: 'mac', linux: 'linux' };
const DEFAULT_REPO = 'NickNes9/blackbook';
const MANIFEST_TIMEOUT_MS = 8_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

// Never touched by an update: user data, dependencies, tooling, the updater itself.
const PRESERVED_TOPS = new Set([
  'profiles', 'import', 'node_modules', 'updates', '.git',
  'data.json', 'data.json.bak', 'Black Book.pid', 'Black Book.xlsx',
  '.superpowers', 'Thumbs.db', '.DS_Store'
]);
const PRESERVED_FILE = new RegExp(/\.(log|bak)$/i);

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Request timed out after ' + timeoutMs + 'ms');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function defaultFetchJson(url, timeoutMs) {
  const response = await fetchWithTimeout(url, timeoutMs);
  const text = await response.text();
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function defaultFetchBuffer(url, timeoutMs) {
  const response = await fetchWithTimeout(url, timeoutMs);
  return Buffer.from(await response.arrayBuffer());
}

export class Updater {
  constructor(ctx = {}) {
    this.rootDir = ctx.rootDir || APP_DIR;
    this.repo = ctx.repo || DEFAULT_REPO;
    this.platformName = ctx.platformName || platform();
    this.fetchJson = ctx.fetchJson || defaultFetchJson;
    this.fetchBuffer = ctx.fetchBuffer || defaultFetchBuffer;
    this.log = ctx.log || (() => {});
    this.updatesDir = join(this.rootDir, 'updates');
  }

  assetSuffix() {
    return PLATFORM_ASSET[this.platformName] || null;
  }

  async fetchLatest() {
    const url = `https://api.github.com/repos/${this.repo}/releases/latest`;
    const release = await this.fetchJson(url, MANIFEST_TIMEOUT_MS);
    if (!release || release.draft || release.prerelease) return null;
    const version = String(release.tag_name || '').trim().replace(/^v/i, '');
    const suffix = this.assetSuffix();
    const asset = (release.assets || []).find((a) => a && a.name && suffix && new RegExp('-\\' + suffix + '\\.', 'i').test(a.name));
    const checksumAsset = (release.assets || []).find((a) => a && a.name && /^checksums\.sha256$/i.test(a.name));
    return {
      version,
      tag: String(release.tag_name || ''),
      notes: typeof release.body === 'string' ? release.body : '',
      publishedAt: release.published_at || null,
      assetName: asset ? asset.name : null,
      assetUrl: asset ? asset.browser_download_url || asset.url : null,
      assetSize: asset ? asset.size : 0,
      checksumUrl: checksumAsset ? checksumAsset.browser_download_url || checksumAsset.url : null
    };
  }

  async checkForUpdate() {
    const current = currentVersion();
    const suffix = this.assetSuffix();
    if (!suffix) return { currentVersion: current, latest: null, updateAvailable: false, reason: 'unsupported-platform' };
    try {
      const latest = await this.fetchLatest();
      if (!latest) return { currentVersion: current, latest: null, updateAvailable: false, reason: 'none' };
      if (!latest.version) return { currentVersion: current, latest, updateAvailable: false, reason: 'invalid-release' };
      const updateAvailable = isNewerVersion(latest.version, current);
      const reason = updateAvailable ? (latest.assetUrl ? 'available' : 'no-asset') : 'up-to-date';
      return { currentVersion: current, latest, updateAvailable, reason };
    } catch (error) {
      return { currentVersion: current, latest: null, updateAvailable: false, reason: 'unreachable', error: String(error && error.message ? error.message : error) };
    }
  }

  async applyUpdate() {
    const status = await this.checkForUpdate();
    if (!status.updateAvailable || !status.latest || !status.latest.assetUrl) {
      if (status.reason === 'no-asset') throw new UpdateError('A new version exists, but no build for this operating system.');
      if (status.updateAvailable) throw new UpdateError('No download asset available for this update.');
      throw new UpdateError('No update is currently available.');
    }
    const latest = status.latest;
    mkdirSync(this.updatesDir, { recursive: true });

    this.log('Downloading ' + latest.assetName);
    const zipBuffer = await this.fetchBuffer(latest.assetUrl, DOWNLOAD_TIMEOUT_MS);
    if (!zipBuffer || !zipBuffer.length) throw new UpdateError('Downloaded update is empty.');
    if (latest.assetSize && zipBuffer.length && zipBuffer.length < latest.assetSize) {
      throw new UpdateError('Downloaded update is smaller than expected (' + zipBuffer.length + ' of ' + latest.assetSize + ' bytes).');
    }

    await this.verifyChecksum(zipBuffer, latest.assetName, latest.checksumUrl);

    const zipPath = join(this.updatesDir, latest.assetName);
    writeFileSync(zipPath, zipBuffer);

    const entries = await this.extractEntries(zipBuffer);
    await this.backupCurrentCode();
    this.syncTree(entries);

    this.log('Update applied: ' + status.currentVersion + ' -> ' + latest.version);
    return { ok: true, fromVersion: status.currentVersion, toVersion: latest.version, asset: latest.assetName };
  }

  async verifyChecksum(buffer, assetName, checksumUrl) {
    if (!checksumUrl) throw new UpdateError('The release has no checksums.sha256 — refusing to auto-update.');
    const text = (await this.fetchBuffer(checksumUrl, DOWNLOAD_TIMEOUT_MS)).toString('utf8');
    if (!text) throw new UpdateError('Could not read the release checksums.');
    const sha = createHash('sha256').update(buffer).digest('hex');
    const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => /^[0-9a-fA-F]{64}\s+/.test(l));
    if (!line) throw new UpdateError('No matching checksum entry found in checksums.sha256.');
    const wanted = line.split(/\s+/)[0].toLowerCase();
    if (sha !== wanted) throw new UpdateError('Checksum mismatch — the download is corrupt or tampered with. No files were changed.');
  }

  async extractEntries(zipBuffer) {
    let flat = {};
    try {
      flat = this.flatZipEntries(unzipSync(new Uint8Array(zipBuffer)));
    } catch (error) {
      throw new UpdateError('The update archive could not be opened: ' + (error && error.message ? error.message : error));
    }
    const entries = new Map();
    const safeBase = resolve(this.rootDir) + sep;
    for (const [name, bytes] of Object.entries(flat)) {
      const clean = String(name).replace(/\\/g, '/');
      if (clean.split('/').some((part) => part === '..')) throw new UpdateError('Update archive contains an unsafe path: ' + name);
      const target = resolve(join(this.rootDir, clean));
      if (target !== resolve(this.rootDir) && !target.startsWith(safeBase)) {
        throw new UpdateError('Update archive escapes the app folder: ' + name);
      }
      entries.set(clean, bytes);
    }
    return entries;
  }

  flatZipEntries(zipped) {
    const out = {};
    const walk = (node, prefix) => {
      for (const [key, value] of Object.entries(node || {})) {
        const path = prefix ? prefix + '/' + key : key;
        if (value instanceof Uint8Array) out[path] = value;
        else walk(value, path);
      }
    };
    walk(zipped, '');
    return out;
  }

  async backupCurrentCode() {
    const version = currentVersion();
    const backupDir = join(this.updatesDir, 'backup-' + version);
    if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
    if (existsSync(this.rootDir)) {
      mkdirSync(backupDir, { recursive: true });
      for (const name of this.syncEntries()) {
        const source = join(this.rootDir, name);
        if (!existsSync(source)) continue;
        if (PRESERVED_TOPS.has(name) || PRESERVED_FILE.test(name)) continue;
        const target = join(backupDir, name);
        const stat = statSync(source);
        if (stat.isDirectory()) this.copyDir(source, target);
        else if (stat.isFile()) this.copyFile(source, target);
      }
    }
    return backupDir;
  }

  syncEntries() {
    const entries = [];
    const walk = (dir, prefix) => {
      const names = readdirSync(dir);
      for (const name of names) {
        if (!prefix && (PRESERVED_TOPS.has(name) || PRESERVED_FILE.test(name))) continue;
        const rel = prefix ? prefix + '/' + name : name;
        const full = join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          entries.push(rel + '/');
          walk(full, rel);
        } else {
          entries.push(rel);
        }
      }
    };
    if (existsSync(this.rootDir)) walk(this.rootDir, '');
    return entries;
  }

  copyDir(source, target) {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(source)) {
      const src = join(source, name);
      const dst = join(target, name);
      const stat = statSync(src);
      if (stat.isDirectory()) this.copyDir(src, dst);
      else if (stat.isFile()) this.copyFile(src, dst);
    }
  }

  copyFile(source, target) {
    mkdirSync(target.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }

  syncTree(entries) {
    const newRelative = new Set(entries.keys());
    for (const existing of this.syncEntries()) {
      if (existing.endsWith('/')) continue;
      if (!newRelative.has(existing) && !PRESERVED_TOPS.has(existing) && !PRESERVED_FILE.test(existing)) {
        try { rmSync(join(this.rootDir, existing), { force: true }); } catch (_) { }
      }
    }
    for (const [name, bytes] of entries) {
      const target = join(this.rootDir, name);
      mkdirSync(target.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
      writeFileSync(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    }
    return entries.size;
  }
}

export function createUpdater(ctx) {
  return new Updater(ctx);
}

export function updateAssetName(version, suffix) {
  return 'black-book-v' + version + '-' + suffix + '.zip';
}