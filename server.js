import express from 'express';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { APP_DIR, HOST, LEGACY_DATA_FILE, PID_FILE, PROFILES_DIR, preferredPorts } from './lib/server-config.js';
import { createProfileStore, isProfileDocument, StorageError } from './lib/storage.js';

// A launcher can outlive its console pipe. Ignore expected broken-pipe errors
// so a harmless log write never terminates the finance server.
function logger(...args) { try { console.log(...args); } catch (_) { } }
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    if (!error || !['EPIPE', 'ECONNRESET', 'EIO'].includes(error.code)) logger('[black-book] stdio error:', error?.message);
  });
}

const PORT = Number(process.env.PORT) || 3000;
const RATE_TIMEOUT_MS = 8_000;
const IDLE_SHUTDOWN_MS = 600_000;
const OZ_TO_GRAM = 31.1034768;
const DEFAULT_DATA = {
  accounts: [],
  categories: [
    { id: 'cat-invoice', name: 'Invoice', color: '#fa8c3c' },
    { id: 'cat-transfer', name: 'Transfer', color: '#71717a' },
    { id: 'cat-debt', name: 'Debt', color: '#facc15' },
    { id: 'cat-uncategorized', name: 'Uncategorized', color: null }
  ],
  transactions: [], bills: [], billPayments: [], savingsGoals: [], budgets: [], installments: [], debts: [],
  settings: {
    baseCurrency: 'RSD',
    enabledCurrencies: ['RSD', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'AUD', 'CAD', 'SEK', 'NOK', 'PLN', 'CZK', 'TRY', 'INR'],
    eurToRsdRate: 117.2, eurToRsdRateSource: 'manual', eurToRsdRateUpdated: null,
    defaultAccountId: null, defaultCategoryId: null, dateSeparator: '/'
  }
};

const store = createProfileStore({ profilesDir: PROFILES_DIR, legacyDataFile: LEGACY_DATA_FILE, defaultData: DEFAULT_DATA });
const app = express();
let lastRequest = Date.now();

app.use(express.json({ limit: '50mb' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must be valid JSON' });
  return next(error);
});
app.use((req, res, next) => { lastRequest = Date.now(); next(); });
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data: https://cdn.jsdelivr.net; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net");
  next();
});
app.use(express.static(join(APP_DIR, 'public'), { setHeaders(res) { res.setHeader('Cache-Control', 'no-store'); } }));

function sendError(res, error) {
  const status = error instanceof StorageError ? error.status : 500;
  if (status >= 500) logger('[black-book] request failed:', error?.message);
  return res.status(status).json({ error: error instanceof StorageError ? error.message : 'The server could not complete that request.' });
}

function loadDefaultData() {
  const db = store.readDefaultOrFresh();
  if (!Array.isArray(db.debts)) db.debts = [];
  if (!isProfileDocument(db.settings)) db.settings = {};
  if (!isProfileDocument(db.settings.rates)) db.settings.rates = {};
  return db;
}

app.get('/api/load', (req, res) => {
  try { return res.json(store.read(req.query.profile || '')); }
  catch (error) { return sendError(res, error); }
});

app.post('/api/save', (req, res) => {
  try {
    const envelope = isProfileDocument(req.body) && Object.hasOwn(req.body, 'profile') && Object.hasOwn(req.body, 'data');
    const profile = envelope ? req.body.profile : '';
    const data = envelope ? req.body.data : req.body;
    if (!isProfileDocument(data)) throw new StorageError('Profile data must be a JSON object', 400);
    store.write(profile, data);
    return res.json({ ok: true });
  } catch (error) { return sendError(res, error); }
});

app.get('/api/profiles', (req, res) => {
  try { return res.json({ profiles: store.list() }); }
  catch (error) { return sendError(res, error); }
});

app.post('/api/profiles', (req, res) => {
  try {
    const { action, name, newName } = req.body || {};
    if (action === 'create') store.create(name);
    else if (action === 'rename') store.rename(name, newName);
    else if (action === 'delete') store.delete(name);
    else throw new StorageError('Unknown action', 400);
    return res.json({ ok: true });
  } catch (error) { return sendError(res, error); }
});

const round4 = (value) => Math.round(value * 10_000) / 10_000;
async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchFiatRates() {
  const primary = await fetchJson('https://open.er-api.com/v6/latest/EUR');
  if (primary?.rates) return { rates: primary.rates, source: 'open.er-api.com' };
  const fallback = await fetchJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');
  return fallback?.eur ? { rates: fallback.eur, source: 'jsdelivr currency-api' } : null;
}
async function fetchRates(currency, db, force) {
  const output = {};
  const rates = db.settings.rates;
  const updated = new Date().toISOString();
  const shouldUpdate = (code) => (!currency || currency === code) && (force || !rates[code] || rates[code].source !== 'manual');
  const fiat = await fetchFiatRates();
  if (fiat) {
    for (const [code, rate] of Object.entries(fiat.rates)) {
      if (code !== 'EUR' && shouldUpdate(code) && Number.isFinite(rate) && rate > 0) output[code] = { rate: round4(1 / rate), source: fiat.source, updated };
    }
    if (shouldUpdate('EUR')) output.EUR = { rate: 1, source: fiat.source, updated };
  }
  if ((!currency || currency === 'XAU') && shouldUpdate('XAU')) {
    const gold = await fetchJson('https://api.gold-api.com/price/XAU');
    if (gold?.price && fiat?.rates?.USD) output.XAU = { rate: round4(gold.price / fiat.rates.USD / OZ_TO_GRAM), source: 'gold-api.com', updated };
  }
  return output;
}

app.get('/api/exchange-rate', async (req, res) => {
  try {
    const value = String(req.query.cur || '').toUpperCase();
    const currency = /^[A-Z]{3}$/.test(value) ? value : '';
    const db = loadDefaultData();
    const fetched = await fetchRates(currency, db, Boolean(currency));
    if (Object.keys(fetched).length) {
      Object.assign(db.settings.rates, fetched);
      store.write('', db);
    }
    const rates = currency && db.settings.rates[currency] ? { [currency]: db.settings.rates[currency] } : db.settings.rates;
    return res.json({ ok: true, rates });
  } catch (error) { return sendError(res, error); }
});

const server = http.createServer(app);
const ports = preferredPorts(PORT);
let listenCursor = -1;
const failedPorts = new Set();
function tryListen() {
  listenCursor = (listenCursor + 1) % ports.length;
  server.listen(ports[listenCursor], HOST);
}
function writePid() {
  try { writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), 'utf8'); } catch (error) { logger('[black-book] Could not write PID file:', error.message); }
}
function clearPid() {
  try {
    const record = JSON.parse(readFileSync(PID_FILE, 'utf8'));
    if (record.pid === process.pid) unlinkSync(PID_FILE);
  } catch (_) { }
}
server.on('listening', () => {
  failedPorts.clear();
  writePid();
  logger(`Black Book running at http://localhost:${server.address().port}`);
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
    const port = ports[listenCursor];
    if (!failedPorts.has(port)) logger(`[black-book] Port ${port} is not available (${error.code}) — trying the next available port.`);
    failedPorts.add(port);
    setTimeout(tryListen, (listenCursor + 1) % ports.length === 0 ? 5_000 : 300);
  } else logger('[black-book] Server error:', error.message);
});
process.once('exit', clearPid);
tryListen();

const wss = new WebSocketServer({ server });
let shutdownTimer = null;
const clientsConnected = () => wss.clients.size > 0;
wss.on('error', (error) => { if (!['EADDRINUSE', 'EACCES'].includes(error.code)) logger('[black-book] WebSocket error:', error.message); });
wss.on('connection', (ws) => {
  if (shutdownTimer && clientsConnected()) { clearTimeout(shutdownTimer); shutdownTimer = null; logger('Browser connected. Idle shutdown cancelled.'); }
  ws.on('close', () => { if (!clientsConnected()) scheduleShutdown(); });
});
function scheduleShutdown() {
  if (shutdownTimer) return;
  logger('Browser disconnected. Will auto-exit after an idle period unless it reconnects or activity resumes...');
  shutdownTimer = setTimeout(() => {
    shutdownTimer = null;
    if (clientsConnected()) return;
    if (Date.now() - lastRequest < IDLE_SHUTDOWN_MS) return scheduleShutdown();
    logger(`Idle for ${IDLE_SHUTDOWN_MS / 1000}s with no browser. Exiting.`);
    process.exit(0);
  }, IDLE_SHUTDOWN_MS);
}
