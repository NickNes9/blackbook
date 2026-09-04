import express from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const PROFILES_DIR = join(__dirname, 'profiles');
let DATA_FILE = join(__dirname, 'data.json');

// ---- storage layout: everything lives in profiles/ ; default profile = profiles/data.json
mkdirSync(PROFILES_DIR, { recursive: true });
if (!existsSync(join(PROFILES_DIR, 'data.json')) && existsSync(DATA_FILE)) {
  renameSync(DATA_FILE, join(PROFILES_DIR, 'data.json'));
  if (existsSync(DATA_FILE + '.bak')) renameSync(DATA_FILE + '.bak', join(PROFILES_DIR, 'data.json.bak'));
  console.log('Migrated main database into profiles/data.json');
}
DATA_FILE = join(PROFILES_DIR, 'data.json');

const DEFAULT_DATA = {
  accounts: [],
  categories: [
    { id: 'cat-invoice', name: 'Invoice', color: '#fa8c3c' }
  ],
  transactions: [],
  bills: [],
  billPayments: [],
  savingsGoals: [],
  budgets: [],
  installments: [],
  debts: [],
  settings: { baseCurrency: 'RSD', enabledCurrencies: ['RSD', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'AUD', 'CAD', 'SEK', 'NOK', 'PLN', 'CZK', 'TRY', 'INR'], eurToRsdRate: 117.2, eurToRsdRateSource: 'manual', eurToRsdRateUpdated: null, defaultAccountId: null, defaultCategoryId: null, dateSeparator: '/' }
};

app.use(express.json({ limit: '50mb' }));
let lastRequest = Date.now();
app.use((req, res, next) => { lastRequest = Date.now(); next(); });
app.use(express.static(join(__dirname, 'public'), {
  setHeaders(res) { res.setHeader('Cache-Control', 'no-store'); }
}));

app.get('/api/load', (req, res) => {
  const file = profileFile(req.query.profile);
  if (!existsSync(file)) {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    writeFileSync(file, JSON.stringify(fresh, null, 2));
    return res.json(fresh);
  }
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  res.json(data);
});

app.post('/api/save', (req, res) => {
  try {
    const { profile, data } = req.body && req.body.data ? req.body : { profile: '', data: req.body };
    const file = profileFile(profile);
    if (existsSync(file)) {
      writeFileSync(file + '.bak', readFileSync(file, 'utf-8'));
    }
    writeFileSync(file, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function safeProfileName(p) {
  const name = String(p || '').trim();
  if (!name) return '';
  if (!/^[a-zA-Z0-9 _.-]+$/.test(name)) return null;
  if (name.toLowerCase() === 'data') return null; // reserved: profiles/data.json is the default profile
  return name;
}

function profileFile(p) {
  const name = safeProfileName(p);
  if (name === null) throw new Error('Invalid profile name');
  return name === '' ? DATA_FILE : join(PROFILES_DIR, name + '.json');
}

function listProfiles() {
  if (!existsSync(PROFILES_DIR)) return [];
  const profiles = [];
  for (const f of readdirSync(PROFILES_DIR)) {
    const m = f.match(/^(.+)\.json$/);
    if (m && f !== 'data.json' && !f.endsWith('.bak')) profiles.push({ name: m[1] });
  }
  profiles.sort((a, b) => a.name.localeCompare(b.name));
  return profiles;
}

app.get('/api/profiles', (req, res) => {
  res.json({ profiles: listProfiles() });
});

app.post('/api/profiles', async (req, res) => {
  try {
    const { action, name, newName } = req.body || {};
    if (action === 'create') {
      const clean = safeProfileName(name);
      if (!clean) return res.status(400).json({ error: 'Invalid profile name' });
      mkdirSync(PROFILES_DIR, { recursive: true });
      const file = profileFile(clean);
      if (existsSync(file)) return res.status(400).json({ error: 'Profile already exists' });
      writeFileSync(file, JSON.stringify(JSON.parse(JSON.stringify(DEFAULT_DATA)), null, 2));
      return res.json({ ok: true });
    }
    if (action === 'rename') {
      const clean = safeProfileName(name); // '' allowed = default profile (data.json)
      const cleanNew = safeProfileName(newName);
      if (clean === null || !cleanNew) return res.status(400).json({ error: 'Invalid profile name' });
      if (clean === cleanNew) return res.status(400).json({ error: 'Same name' });
      const src = profileFile(clean);
      const dst = profileFile(cleanNew);
      if (!existsSync(src)) return res.status(404).json({ error: 'Profile not found' });
      if (existsSync(dst)) return res.status(400).json({ error: 'Target profile already exists' });
      renameSync(src, dst);
      if (existsSync(src + '.bak')) renameSync(src + '.bak', dst + '.bak');
      return res.json({ ok: true });
    }
    if (action === 'delete') {
      const clean = safeProfileName(name);
      if (!clean) return res.status(400).json({ error: 'Cannot delete the default profile' });
      const file = profileFile(clean);
      if (!existsSync(file)) return res.status(404).json({ error: 'Profile not found' });
      unlinkSync(file);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const OZ_TO_GRAM = 31.1034768;


function loadDB() {
  const db = existsSync(DATA_FILE)
    ? JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
    : JSON.parse(JSON.stringify(DEFAULT_DATA));
  if (!db.debts) db.debts = [];
  return db;
}

function ensureRates(db) {
  if (!db.settings.rates) db.settings.rates = {};
  return db.settings.rates;
}

const rnd4 = (v) => Math.round(v * 10000) / 10000;

async function fetchFiatRates() {
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/EUR');
    const data = await resp.json();
    if (data?.rates) {
      return { rates: data.rates, source: 'open.er-api.com' };
    }
  } catch (e) {}
  try {
    const resp = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');
    const data = await resp.json();
    if (data?.eur) {
      return { rates: data.eur, source: 'jsdelivr currency-api' };
    }
  } catch (e) {}
  return null;
}

async function fetchGoldUsdPerOz() {
  try {
    const resp = await fetch('https://api.gold-api.com/price/XAU');
    const gold = await resp.json();
    if (gold?.price) return gold.price;
  } catch (e) {}
  return null;
}

async function fetchRates(cur, db, force) {
  const out = {};
  const rates = ensureRates(db);
  const updated = new Date().toISOString();
  const shouldUpdate = (code) => {
    if (cur && cur !== code) return false;
    return force || cur === code || !rates[code] || rates[code].source !== 'manual';
  };
  const fiat = await fetchFiatRates();
  if (fiat) {
    // API returns units per EUR (e.g. USD=1.1619 means 1 EUR = 1.1619 USD).
    // Store inverts so rate = EUR per 1 unit (1 USD = 0.86 EUR) — matches client pivot.
    for (const [code, rate] of Object.entries(fiat.rates)) {
      if (code === 'EUR') continue;
      if (shouldUpdate(code)) {
        out[code] = { rate: rnd4(1 / rate), source: fiat.source, updated };
      }
    }
    if (shouldUpdate('EUR')) out.EUR = { rate: 1, source: fiat.source, updated };
  }
  if (!cur || cur === 'XAU') {
    if (shouldUpdate('XAU')) {
      const usdPerOz = await fetchGoldUsdPerOz();
      if (usdPerOz && fiat?.rates?.USD) {
        const eurPerGram = usdPerOz / fiat.rates.USD / OZ_TO_GRAM;
        out.XAU = { rate: rnd4(eurPerGram), source: 'gold-api.com', updated };
      }
    }
  }
  return out;
}

app.get('/api/exchange-rate', async (req, res) => {
  const cur = String(req.query.cur || '').toUpperCase();
  const db = loadDB();
  const fetched = await fetchRates(cur, db, Boolean(cur));
  const rates = ensureRates(db);
  for (const [k, v] of Object.entries(fetched)) rates[k] = v;
  if (Object.keys(fetched).length) {
    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  }
  const subset = cur && rates[cur] ? { [cur]: rates[cur] } : rates;
  res.json({ ok: true, rates: subset });
});

const server = app.listen(PORT, () => console.log(`Black Book running at http://localhost:${PORT}`));

// Auto-fetch exchange rates on startup
(async () => {
  try {
    const db = loadDB();
    const fetched = await fetchRates(null, db, false);
    const rates = ensureRates(db);
    for (const [k, v] of Object.entries(fetched)) rates[k] = v;
    if (Object.keys(fetched).length) {
      writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
      console.log('Rates auto-fetched: ' + Object.entries(rates).map(([c, r]) => c + '=' + (r.rate ?? '--')).join(' '));
    } else {
      console.log('Could not auto-fetch exchange rates, using stored values');
    }
  } catch (e) {
    console.log('Could not auto-fetch exchange rate, using stored value');
  }
})();

const wss = new WebSocketServer({ server });
let browserConnected = false;
let shutdownTimer = null;
const IDLE_SHUTDOWN_MS = 60000;

wss.on('connection', (ws) => {
  browserConnected = true;
  if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; console.log('Browser connected. Idle shutdown cancelled.'); }
  ws.on('close', () => {
    browserConnected = false;
    scheduleShutdown();
  });
});

function scheduleShutdown() {
  if (shutdownTimer) return;
  console.log('Browser disconnected. Will auto-exit after an idle period unless it reconnects or activity resumes...');
  shutdownTimer = setTimeout(() => {
    shutdownTimer = null;
    if (browserConnected) return;
    if (Date.now() - lastRequest < IDLE_SHUTDOWN_MS) {
      scheduleShutdown();
      return;
    }
    console.log('Idle for ' + (IDLE_SHUTDOWN_MS / 1000) + 's with no browser. Exiting.');
    process.exit(0);
  }, IDLE_SHUTDOWN_MS);
}
