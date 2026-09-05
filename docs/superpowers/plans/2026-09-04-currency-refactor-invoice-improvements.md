# Currency Refactor + Invoice Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor hardcoded RSD base currency into a per-profile configurable base currency, expand currency set to 15+ with auto-updating rates, add currency management UI, change invoice numbering to `NNN / YEAR`, and sort invoices by year.

**Architecture:** Server stores all rates in EUR base (as the API returns). Client uses EUR as the universal conversion pivot. Profile's `baseCurrency` determines display currency. Currency dropdowns are dynamically populated from `enabledCurrencies` array.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, open.er-api.com for exchange rates, gold-api.com for XAU.

**Spec:** `docs/superpowers/specs/2026-09-04-currency-refactor-invoice-improvements-design.md`

## Global Constraints

- No test framework exists — verify via manual browser testing after each task
- Existing Nick profile data must not be modified
- Legacy RSD-based rates auto-migrate on client load
- All currency dropdowns must be dynamically populated from `enabledCurrencies`
- Invoice format: `NNN / YEAR` (e.g., `001 / 2026`)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server.js` | Rate fetching (all currencies, EUR base), profile CRUD, DEFAULT_DATA |
| `public/js/core.js` | `baseCurrency()`, `toBase()`, `fmtBase()`, `getRates()` with migration, `convertBetweenCurrencies()`, all RSD→base refactoring |
| `public/js/page-settings.js` | Currency management UI (add/remove/refresh), base currency picker, rates table |
| `public/js/page-invoices.js` | Invoice numbering `NNN / YEAR`, year-based sorting |
| `public/js/page-transactions.js` | `convertBetweenCurrencies()` EUR pivot, currency dropdown population |
| `public/js/page-overview.js` | RSD→base refactoring (11 `toRsd`→`toBase`, 8 `fmtRsd`→`fmtBase`, 2 fallbacks) |
| `public/js/page-budget.js` | RSD→base refactoring (3 `toRsd`→`toBase`, 6 `fmtRsd`→`fmtBase`) |
| `public/js/page-bills.js` | RSD→base refactoring (15 `toRsd`→`toBase`, 1 `fmtRsd`→`fmtBase`, 28 fallbacks/checks) |
| `public/js/page-savings.js` | RSD→base refactoring (4 `fmtRsd`→`fmtBase`, 3 fallbacks) |
| `public/js/page-debts.js` | RSD→base refactoring (2 `toRsd`→`toBase`, 3 `fmtRsd`→`fmtBase`, 7 fallbacks) |
| `public/js/page-cards.js` | RSD→base refactoring (8 `fmtRsd`→`fmtBase`, 3 fallbacks) |
| `public/index.html` | Dynamic currency dropdowns, dynamic RSD labels |

---

### Task 1: Server-Side Rate Infrastructure

**Files:**
- Modify: `server.js:22-35` (DEFAULT_DATA)
- Modify: `server.js:137-159` (RATE_CODES, ensureRates)
- Modify: `server.js:163-217` (fetchFiatRates, fetchRates)

**Interfaces:**
- Produces: `fetchFiatRates()` returns `{ rates: {USD: 0.86, GBP: 0.84, ...}, source: 'open.er-api.com' }`
- Produces: `fetchRates()` stores EUR-based rates for all currencies
- Produces: `ensureRates()` simplified, no legacy migration
- Produces: `DEFAULT_DATA.settings` includes `baseCurrency` and `enabledCurrencies`

- [ ] **Step 1: Update DEFAULT_DATA settings**

In `server.js:34`, replace the settings object:

```js
// Before:
settings: { eurToRsdRate: 117.2, eurToRsdRateSource: 'manual', eurToRsdRateUpdated: null, defaultAccountId: null, defaultCategoryId: null, dateSeparator: '/' }

// After:
settings: { baseCurrency: 'RSD', enabledCurrencies: ['RSD', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'AUD', 'CAD', 'SEK', 'NOK', 'PLN', 'CZK', 'TRY', 'INR'], eurToRsdRate: 117.2, eurToRsdRateSource: 'manual', eurToRsdRateUpdated: null, defaultAccountId: null, defaultCategoryId: null, dateSeparator: '/' }
```

- [ ] **Step 2: Remove RATE_CODES and simplify ensureRates**

Delete the `RATE_CODES` constant at line 138. Replace `ensureRates` (lines 148-159) with:

```js
function ensureRates(db) {
  if (!db.settings.rates) db.settings.rates = {};
  return db.settings.rates;
}
```

- [ ] **Step 3: Update fetchFiatRates to return all rates**

Replace `fetchFiatRates` (lines 163-179) with:

```js
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
```

- [ ] **Step 4: Update fetchRates to store all EUR-based rates**

Replace `fetchRates` (lines 190-217) with:

```js
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
    for (const [code, rate] of Object.entries(fiat.rates)) {
      if (code === 'EUR') continue;
      if (shouldUpdate(code)) {
        out[code] = { rate: rnd4(rate), source: fiat.source, updated };
      }
    }
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
```

- [ ] **Step 5: Verify server starts and fetches rates**

Run: `node server.js`
Expected: Server starts, logs "Rates auto-fetched: ..." with many currencies (not just EUR/USD/XAU). Check `profiles/data.json` — rates should be EUR-based (e.g., USD rate ~0.86, not ~101).

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: store all exchange rates in EUR base format"
```

---

### Task 2: Core Currency Functions (core.js)

**Files:**
- Modify: `public/js/core.js:460-481` (toRsd, getRates)
- Modify: `public/js/core.js:585-587` (fmtRsd)
- Modify: `public/js/core.js:593-596` (calcForeignFee)
- Modify: `public/js/core.js:602-614` (fmtDualCurrency)
- Modify: `public/js/core.js:617-628` (accountBalance)
- Modify: `public/js/core.js:634` (accountBalanceNative)
- Modify: `public/js/core.js:782,787,808,885` (command palette, parsing)
- Modify: `public/js/core.js:1153,1169` (matchingUnpaidBill)

**Interfaces:**
- Produces: `baseCurrency()` → returns profile's base currency code string
- Produces: `toBase(amount, currency)` → converts any currency to profile's base via EUR pivot
- Produces: `fmtBase(amount)` → formats amount with profile's base currency code
- Consumes: `getRates()` returns EUR-based rates (from Task 1)
- Consumes: `data.settings.baseCurrency` (from Task 1 DEFAULT_DATA)

- [ ] **Step 1: Add baseCurrency() helper**

After line 458 (end of `sortedCategories`), add:

```js
baseCurrency() {
  return this.data.settings.baseCurrency || 'RSD';
},
```

- [ ] **Step 2: Replace toRsd with toBase**

Replace `toRsd` (lines 460-467) with:

```js
toBase(amount, currency) {
  const base = this.baseCurrency();
  if (!currency || currency === base) return amount;
  const rates = this.getRates();
  const rateFrom = (currency === 'EUR') ? 1 : (rates[currency] || {}).rate;
  const rateTo = (base === 'EUR') ? 1 : (rates[base] || {}).rate;
  if (!rateFrom || !rateTo) return amount;
  return Math.round(amount * rateFrom / rateTo * 100) / 100;
},
```

- [ ] **Step 3: Replace fmtRsd with fmtBase**

Replace `fmtRsd` (lines 585-587) with:

```js
fmtBase(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + this.baseCurrency();
},
```

- [ ] **Step 4: Update getRates for EUR-based storage + legacy migration**

Replace `getRates` (lines 469-481) with:

```js
getRates() {
  const s = this.data.settings;
  if (!s.rates) s.rates = {};
  // Ensure EUR entry exists
  if (!s.rates.EUR) s.rates.EUR = { rate: 1, source: null, updated: null };
  // Legacy migration: if EUR rate > 10, rates are RSD-based — convert to EUR-based
  if (s.rates.EUR.rate > 10) {
    const eurRate = s.rates.EUR.rate;
    for (const [code, r] of Object.entries(s.rates)) {
      if (code === 'EUR') { s.rates[code] = { rate: 1, source: r.source, updated: r.updated }; continue; }
      if (r && r.rate != null) {
        s.rates[code] = { rate: rnd4(r.rate / eurRate), source: r.source, updated: r.updated };
      }
    }
  }
  return s.rates;
},
```

Note: `rnd4` is defined at `server.js:161` — we need it client-side too. Add near the top of the BlackBook object:

```js
rnd4(v) { return Math.round(v * 10000) / 10000; },
```

- [ ] **Step 5: Update all toRsd→toBase calls in core.js**

Replace every `this.toRsd(` with `this.toBase(` in core.js. Affected lines: 595, 613, 621, 622, 626, 808, 1153, 1169.

- [ ] **Step 6: Update all fmtRsd→fmtBase calls in core.js**

Replace every `this.fmtRsd(` with `this.fmtBase(` in core.js. (No direct calls in core.js — the definition was renamed in Step 3.)

- [ ] **Step 7: Update RSD fallbacks in core.js**

Replace `|| 'RSD'` with `|| this.baseCurrency() || 'RSD'` at lines: 595, 603, 604, 634, 787, 1153, 1169.

- [ ] **Step 8: Update RSD label strings in core.js**

- Line 586: already handled by fmtBase rename
- Line 782: `' RSD'` → `' ' + this.baseCurrency()`
- Line 885: `' RSD/mo'` → `' ' + this.baseCurrency() + '/mo'`

- [ ] **Step 9: Update calcForeignFee in core.js**

Line 595: `feeRsd: this.round2(this.toRsd(feeNative, nativeCur || 'RSD'))` → `feeBase: this.round2(this.toBase(feeNative, nativeCur || this.baseCurrency()))` — also update any code referencing `feeRsd` to use `feeBase`.

- [ ] **Step 10: Verify in browser**

Open browser, load Nick profile. Check:
- Overview page shows amounts in RSD (base currency)
- Account balances display correctly
- Command palette search shows amounts with RSD label

- [ ] **Step 11: Commit**

```bash
git add public/js/core.js
git commit -m "feat: add baseCurrency/toBase/fmtBase, migrate legacy rates to EUR base"
```

---

### Task 3: Refactor page-transactions.js

**Files:**
- Modify: `public/js/page-transactions.js:4,22,23,47,48,51,74,80,81,92,94,95,107,110,121,142,185,186,194,195,206,207,240,241,266,267,562,565,653,664,693,695,696,711`

**Interfaces:**
- Consumes: `baseCurrency()`, `toBase()`, `convertBetweenCurrencies()` with EUR pivot

- [ ] **Step 1: Update convertBetweenCurrencies to use EUR pivot**

Replace lines 191-199:

```js
convertBetweenCurrencies(amount, curFrom, curTo) {
  if (!amount || isNaN(amount)) return null;
  if (curFrom === curTo) return Math.round(amount * 100) / 100;
  const rates = this.getRates();
  const rateFrom = (curFrom === 'EUR') ? 1 : (rates[curFrom] || {}).rate;
  const rateTo = (curTo === 'EUR') ? 1 : (rates[curTo] || {}).rate;
  if (!rateFrom || !rateTo) return null;
  const eur = amount * rateFrom;
  return Math.round(eur / rateTo * 100) / 100;
},
```

- [ ] **Step 2: Update all === 'RSD' checks**

Replace `=== 'RSD'` with `=== this.baseCurrency()` at lines: 74, 92, 194, 195, 696.

- [ ] **Step 3: Update all || 'RSD' fallbacks**

Replace `|| 'RSD'` with `|| this.baseCurrency() || 'RSD'` at lines: 22, 23, 51, 80, 94, 121, 142, 185, 186, 206, 207, 240, 241, 266, 267, 562, 565, 653, 664, 695.

- [ ] **Step 4: Update hardcoded 'RSD' string values**

- Line 47: `value = 'RSD'` → `value = this.baseCurrency()`
- Line 48: `value = 'RSD'` → `value = this.baseCurrency()`
- Line 81: `!== 'RSD'` → `!== this.baseCurrency()`
- Line 95: `!== 'RSD'` → `!== this.baseCurrency()`
- Line 693: `!== 'RSD'` → `!== this.baseCurrency()`
- Line 711: `'RSD'` → `this.baseCurrency()`

- [ ] **Step 5: Update UI label strings**

- Line 107: `' RSD'` → `' ' + this.baseCurrency()`
- Line 110: `' RSD'` → `' ' + this.baseCurrency()`

- [ ] **Step 6: Update account label to hide base currency suffix**

Line 4: `a.currency && a.currency !== 'RSD'` → `a.currency && a.currency !== this.baseCurrency()`

- [ ] **Step 7: Verify in browser**

Create a transaction, verify currency dropdown works, fee row shows/hides correctly based on account currency.

- [ ] **Step 8: Commit**

```bash
git add public/js/page-transactions.js
git commit -m "refactor: replace all RSD references with baseCurrency in transactions"
```

---

### Task 4: Refactor page-overview.js

**Files:**
- Modify: `public/js/page-overview.js:131,136,165,189,236,246,249-254,291,336,340,341,523,547`

**Interfaces:**
- Consumes: `toBase()`, `fmtBase()`, `baseCurrency()`

- [ ] **Step 1: Replace toRsd→toBase calls**

Replace `this.toRsd(` with `this.toBase(` at lines: 131, 165, 236, 246, 291 (2 occurrences), 336, 523.

- [ ] **Step 2: Replace fmtRsd→fmtBase calls**

Replace `this.fmtRsd(` with `this.fmtBase(` at lines: 136 (3 occurrences), 189, 249, 250, 251, 252, 254, 547.

- [ ] **Step 3: Update RSD fallbacks**

Replace `|| 'RSD'` with `|| this.baseCurrency() || 'RSD'` at lines: 340, 341.

- [ ] **Step 4: Verify in browser**

Check overview page: income/expenses/net display, account cards, category breakdown, monthly chart all show amounts with correct currency.

- [ ] **Step 5: Commit**

```bash
git add public/js/page-overview.js
git commit -m "refactor: replace all RSD references with baseCurrency in overview"
```

---

### Task 5: Refactor page-bills.js

**Files:**
- Modify: `public/js/page-bills.js` (28 `|| 'RSD'` fallbacks, 13 `=== 'RSD'` checks, 15 `toRsd`→`toBase`, 1 `fmtRsd`→`fmtBase`, 4 UI label strings)

**Interfaces:**
- Consumes: `toBase()`, `fmtBase()`, `baseCurrency()`

- [ ] **Step 1: Replace toRsd→toBase calls**

Replace `this.toRsd(` with `this.toBase(` at lines: 67, 102, 107, 130, 330, 346, 373, 432, 435, 446, 471, 475, 485, 647, 659.

- [ ] **Step 2: Replace fmtRsd→fmtBase calls**

Replace `this.fmtRsd(` with `this.fmtBase(` at line: 71.

- [ ] **Step 3: Update all === 'RSD' checks**

Replace `=== 'RSD'` with `=== this.baseCurrency()` at lines: 61, 101, 127, 226, 348, 369, 431, 440, 471, 480, 528, 615, 640.

- [ ] **Step 4: Update all || 'RSD' fallbacks**

Replace `|| 'RSD'` with `|| this.baseCurrency() || 'RSD'` at lines: 13, 60, 100, 107, 126, 132, 137, 163, 224, 330, 346, 360, 368, 372, 373, 430, 435, 439, 470, 479, 524, 527, 611, 614, 616, 636, 639, 640.

- [ ] **Step 5: Update UI label strings**

- Line 226: `cur === 'RSD'` → `cur === this.baseCurrency()`
- Line 564: `' RSD'` → `' ' + this.baseCurrency()`
- Line 567: `' RSD'` → `' ' + this.baseCurrency()`
- Line 659: `' RSD'` → `' ' + this.baseCurrency()` and `!== 'RSD'` → `!== this.baseCurrency()`

- [ ] **Step 6: Update default currency values**

- Line 163: `value = 'RSD'` → `value = this.baseCurrency()`

- [ ] **Step 7: Verify in browser**

Check bills page: monthly totals, yearly grid, payment processing, bill amounts all display correctly.

- [ ] **Step 8: Commit**

```bash
git add public/js/page-bills.js
git commit -m "refactor: replace all RSD references with baseCurrency in bills"
```

---

### Task 6: Refactor page-budget.js, page-savings.js, page-debts.js, page-cards.js

**Files:**
- Modify: `public/js/page-budget.js` (3 toRsd, 6 fmtRsd)
- Modify: `public/js/page-savings.js` (4 fmtRsd, 3 fallbacks)
- Modify: `public/js/page-debts.js` (2 toRsd, 3 fmtRsd, 7 fallbacks)
- Modify: `public/js/page-cards.js` (8 fmtRsd, 3 fallbacks)

**Interfaces:**
- Consumes: `toBase()`, `fmtBase()`, `baseCurrency()`

- [ ] **Step 1: Refactor page-budget.js**

Replace `this.toRsd(` → `this.toBase(` at lines: 69, 147, 165.
Replace `this.fmtRsd(` → `this.fmtBase(` at lines: 39, 151, 152, 153, 184, 185.

- [ ] **Step 2: Refactor page-savings.js**

Replace `this.fmtRsd(` → `this.fmtBase(` at lines: 34, 66, 176, 193.
Replace `|| 'RSD'` → `|| this.baseCurrency() || 'RSD'` at lines: 95.
Replace hardcoded `'RSD'` → `this.baseCurrency()` at lines: 84, 154, 155.

- [ ] **Step 3: Refactor page-debts.js**

Replace `this.toRsd(` → `this.toBase(` at lines: 47, 78.
Replace `this.fmtRsd(` → `this.fmtBase(` at lines: 123, 124, 125.
Replace `|| 'RSD'` → `|| this.baseCurrency() || 'RSD'` at lines: 47, 75, 86, 147, 209, 305, 358.
Replace hardcoded `'RSD'` → `this.baseCurrency()` at line: 181.

- [ ] **Step 4: Refactor page-cards.js**

Replace `this.fmtRsd(` → `this.fmtBase(` at lines: 70, 87, 114, 117, 118, 120, 129, 206.
Replace `|| 'RSD'` → `|| this.baseCurrency() || 'RSD'` at lines: 195, 257.
Replace hardcoded `'RSD'` → `this.baseCurrency()` at line: 401.

- [ ] **Step 5: Verify in browser**

Check budget, savings, debts, and credit cards pages all display correctly with base currency.

- [ ] **Step 6: Commit**

```bash
git add public/js/page-budget.js public/js/page-savings.js public/js/page-debts.js public/js/page-cards.js
git commit -m "refactor: replace all RSD references with baseCurrency in budget/savings/debts/cards"
```

---

### Task 7: Dynamic Currency Dropdowns (index.html + core.js)

**Files:**
- Modify: `public/index.html:57,62,99,131,175,203,239,266,322,514`
- Modify: `public/js/core.js` (add `populateCurrencyDropdowns()` method)

**Interfaces:**
- Produces: `populateCurrencyDropdowns()` populates all `<select>` elements from `enabledCurrencies`
- Consumes: `data.settings.enabledCurrencies`

- [ ] **Step 1: Clear hardcoded options from HTML selects**

In `index.html`, replace the hardcoded `<option>` elements in each currency select with a single placeholder option:

- Line 62 (`tx-currency-select`): Replace options with `<option value="">LOADING...</option>`
- Line 99 (`bill-currency`): Same
- Line 131 (`savings-goal-currency`): Same
- Line 175 (`settings-account-currency`): Same
- Line 266 (`debt-currency`): Same
- Line 322 (`invoice-currency`): Same

- [ ] **Step 2: Add populateCurrencyDropdowns() to core.js**

Add after `baseCurrency()`:

```js
populateCurrencyDropdowns() {
  const curs = this.data.settings.enabledCurrencies || ['RSD', 'EUR', 'USD'];
  const selects = ['tx-currency-select', 'bill-currency', 'savings-goal-currency', 'settings-account-currency', 'debt-currency', 'invoice-currency'];
  for (const id of selects) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const prev = sel.value;
    sel.innerHTML = curs.map(c => '<option value="' + c + '">' + c + '</option>').join('');
    if (curs.includes(prev)) sel.value = prev;
  }
},
```

- [ ] **Step 3: Call populateCurrencyDropdowns() on init**

In `core.js`, find the `init()` or `loadData()` method and add `this.populateCurrencyDropdowns();` after data is loaded and settings are available. Also call it after `renderPage()` in the navigation logic.

- [ ] **Step 4: Update hidden currency input defaults**

- Line 57: `value="RSD"` → remove hardcoded value, let JS set it
- In transaction form logic, set `tx-currency` hidden input from the select's value

- [ ] **Step 5: Update HTML labels to be dynamic**

Replace hardcoded "RSD" in labels:
- Line 69: `FEE (RSD)` → `FEE (<span id="tx-fee-cur">RSD</span>)`
- Line 203: `Amount (RSD)` → `Amount (<span class="base-cur-label">RSD</span>)`
- Line 239: `Fee (RSD)` → `Fee (<span class="base-cur-label">RSD</span>)`
- Line 514: `Monthly Budget (RSD)` → `Monthly Budget (<span class="base-cur-label">RSD</span>)`

Then in `core.js`, add a method to update these labels:

```js
updateBaseCurrencyLabels() {
  const cur = this.baseCurrency();
  document.querySelectorAll('.base-cur-label').forEach(el => el.textContent = cur);
  const feeLabel = document.getElementById('tx-fee-cur');
  if (feeLabel) feeLabel.textContent = cur;
},
```

Call this after `populateCurrencyDropdowns()`.

- [ ] **Step 6: Verify in browser**

Check that all currency dropdowns show the full list of enabled currencies. Create a new transaction, bill, savings goal — verify currency options are correct.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/js/core.js
git commit -m "feat: dynamically populate currency dropdowns from enabledCurrencies"
```

---

### Task 8: Settings UI — Currency Management

**Files:**
- Modify: `public/js/page-settings.js:250-268` (ratesTableHtml)
- Modify: `public/js/page-settings.js:658-698` (settingsHtml — exchange rates section)
- Modify: `public/js/page-settings.js:724-758` (refresh/save rate functions)
- Modify: `public/js/page-settings.js:218` (CSV import currency validation)

**Interfaces:**
- Produces: `addCurrency(code)`, `removeCurrency(code)`, `openAddCurrencyModal()`
- Consumes: `data.settings.enabledCurrencies`, `data.settings.baseCurrency`

- [ ] **Step 1: Update ratesTableHtml to iterate enabledCurrencies**

Replace `ratesTableHtml` (lines 250-268). Instead of hardcoded `['EUR', 'USD', 'XAU']`, iterate `this.data.settings.enabledCurrencies`:

```js
ratesTableHtml() {
  const rates = this.getRates();
  const enabled = this.data.settings.enabledCurrencies || ['RSD', 'EUR', 'USD'];
  let rows = '<div class="rate-grid-row rate-grid-head"><span>CUR</span><span>RATE (in EUR)</span><span>SOURCE</span><span>UPDATED</span><span>MANUAL OVERRIDE</span><span></span><span></span><span></span></div>';
  for (const code of enabled) {
    const r = rates[code] || { rate: null, source: null, updated: null };
    const rateVal = code === 'EUR' ? '1.0000 <span class="rate-unit">EUR</span>'
      : (r.rate != null ? r.rate.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' <span class="rate-unit">EUR</span>' : '--');
    const updated = r.updated ? new Date(r.updated).toLocaleString() : '--';
    const removable = code !== (this.data.settings.baseCurrency || 'RSD');
    rows += '<div class="rate-grid-row">' +
      '<span class="rate-code">' + code + '</span>' +
      '<span class="rate-val">' + rateVal + '</span>' +
      '<span class="rate-src">' + this.escapeHtml(r.source || '--') + '</span>' +
      '<span class="rate-upd">' + updated + '</span>' +
      (code !== 'EUR' ? '<input type="number" step="0.0001" class="input rate-manual-input" id="rate-manual-' + code + '" placeholder="set manually" value="' + (r.rate != null ? r.rate : '') + '">' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.saveManualRate(\x27' + code + '\x27)">SET</button>' +
        '<button class="btn btn-sm btn-secondary" onclick="BlackBook.refreshRate(\x27' + code + '\x27)">REFRESH</button>' : '<span></span><span></span><span></span>') +
      (removable ? '<button class="btn btn-sm btn-danger" onclick="BlackBook.removeCurrency(\x27' + code + '\x27)">RM</button>' : '') +
      '</div>';
  }
  return rows;
},
```

- [ ] **Step 2: Update settingsHtml exchange rates section header**

Line 692: Replace `'EXCHANGE RATES &middot; 1 UNIT IN RSD'` with `'EXCHANGE RATES &middot; 1 UNIT IN EUR'` and add the "+ ADD CURRENCY" button:

```js
'<div class="settings-section-header"><span class="settings-section-title">EXCHANGE RATES &middot; 1 UNIT IN EUR</span>' +
'<button class="btn btn-sm btn-secondary" id="settings-refresh-all-rates">REFRESH ALL</button>' +
'<button class="btn btn-sm btn-primary" onclick="BlackBook.openAddCurrencyModal()">+ ADD CURRENCY</button></div>'
```

- [ ] **Step 3: Add base currency picker to DEFAULTS section**

In the settingsHtml, add a base currency dropdown in the DEFAULTS section (after the date separator or default account/category):

```js
'<div class="form-group"><label>Base Currency</label><select id="settings-base-currency" class="input">' +
(this.data.settings.enabledCurrencies || ['RSD', 'EUR', 'USD']).map(c =>
  '<option value="' + c + '"' + (c === (this.data.settings.baseCurrency || 'RSD') ? ' selected' : '') + '>' + c + '</option>'
).join('') + '</select></div>'
```

- [ ] **Step 4: Add baseCurrency change handler in bindSettingsEvents**

```js
const baseCurSelect = el.querySelector('#settings-base-currency');
if (baseCurSelect) {
  baseCurSelect.addEventListener('change', async () => {
    this.data.settings.baseCurrency = baseCurSelect.value || 'RSD';
    this.populateCurrencyDropdowns();
    this.updateBaseCurrencyLabels();
    await this.save();
    this.renderSettings();
  });
}
```

- [ ] **Step 5: Add openAddCurrencyModal, addCurrency, removeCurrency methods**

```js
openAddCurrencyModal() {
  const enabled = new Set(this.data.settings.enabledCurrencies || []);
  const allCodes = ['AED','AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP','HKD','HRK','HUF','IDR','ILS','INR','ISK','JPY','KRW','MXN','MYR','NOK','NZD','PHP','PLN','RON','RSD','SEK','SGD','THB','TRY','TWD','USD','ZAR'];
  const available = allCodes.filter(c => !enabled.has(c));
  const list = available.map(c => '<button class="btn btn-sm btn-secondary" style="margin:2px;" onclick="BlackBook.addCurrency(\x27' + c + '\x27)">' + c + '</button>').join(' ');
  if (!available.length) { alert('All common currencies are already enabled.'); return; }
  this.confirmModal({ title: 'Add Currency', message: 'Select a currency to add:\n\n' + list, confirmText: 'Close', danger: false });
},

async addCurrency(code) {
  if (!code) return;
  const enabled = this.data.settings.enabledCurrencies || [];
  if (enabled.includes(code)) return;
  enabled.push(code);
  this.data.settings.enabledCurrencies = enabled;
  this.populateCurrencyDropdowns();
  await this.save();
  // Fetch rate for new currency
  try {
    const resp = await fetch('/api/exchange-rate?cur=' + code);
    const result = await resp.json();
    if (result.rates && result.rates[code]) {
      this.getRates()[code] = result.rates[code];
      await this.save();
    }
  } catch (e) {}
  this.renderSettings();
},

async removeCurrency(code) {
  if (!code || code === (this.data.settings.baseCurrency || 'RSD')) return;
  if (!(await this.confirmModal({ title: 'Remove Currency', message: 'Remove ' + code + ' from enabled currencies?\n\nHistorical data is preserved.', confirmText: 'Remove' }))) return;
  this.data.settings.enabledCurrencies = (this.data.settings.enabledCurrencies || []).filter(c => c !== code);
  this.populateCurrencyDropdowns();
  await this.save();
  this.renderSettings();
},
```

- [ ] **Step 6: Update CSV import currency validation**

Line 218: Replace `['RSD', 'EUR', 'USD', 'XAU'].includes(currencyRaw)` with checking against `this.data.settings.enabledCurrencies`:

```js
const enabled = this.data.settings.enabledCurrencies || ['RSD', 'EUR', 'USD'];
const currency = enabled.includes(currencyRaw) ? currencyRaw : this.baseCurrency();
```

- [ ] **Step 7: Update page-settings.js default account currency**

Lines 501, 552: Replace `value = 'RSD'` with `value = this.baseCurrency()`.

- [ ] **Step 8: Verify in browser**

Check settings page:
- Exchange rates section shows all enabled currencies
- "+ ADD CURRENCY" button opens currency picker
- "RM" button removes currencies
- Base currency dropdown works
- Changing base currency updates all displays

- [ ] **Step 9: Commit**

```bash
git add public/js/page-settings.js
git commit -m "feat: currency management UI with add/remove and base currency picker"
```

---

### Task 9: Invoice Numbering (NNN / YEAR)

**Files:**
- Modify: `public/js/page-invoices.js:208-223` (openNewInvoice)

**Interfaces:**
- Consumes: `data.invoices` array

- [ ] **Step 1: Update invoice number auto-generation**

Replace lines 214-223 in `openNewInvoice()`:

```js
const year = new Date().getFullYear();
let maxSeq = 0;
for (const v of (this.data.invoices || [])) {
  if (v.number) {
    const parts = v.number.split('/').map(s => s.trim());
    if (parts.length === 2 && parseInt(parts[1], 10) === year) {
      const seq = parseInt(parts[0], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
}
document.getElementById('invoice-number').value = String(maxSeq + 1).padStart(3, '0') + ' / ' + year;
```

- [ ] **Step 2: Update invoice number placeholder**

In `index.html:321`, update the placeholder and title:

```html
<input type="text" id="invoice-number" class="input" placeholder="001 / 2026" title="Format: NNN / YEAR (sequential number / year)">
```

- [ ] **Step 3: Verify in browser**

Create a new invoice — verify number is `001 / 2026`. Create another — verify `002 / 2026`.

- [ ] **Step 4: Commit**

```bash
git add public/js/page-invoices.js public/index.html
git commit -m "feat: invoice numbering format NNN / YEAR"
```

---

### Task 10: Invoice Sorting by Year

**Files:**
- Modify: `public/js/page-invoices.js` (renderInvoices method)

**Interfaces:**
- Consumes: `data.invoices` array, `baseCurrency()`

- [ ] **Step 1: Find and read renderInvoices method**

Read `public/js/page-invoices.js` to find the `renderInvoices()` method and understand the current rendering logic.

- [ ] **Step 2: Add year extraction helper**

Add to page-invoices.js:

```js
invYear(inv) {
  if (inv.number) {
    const parts = inv.number.split('/').map(s => s.trim());
    if (parts.length === 2) {
      const y = parseInt(parts[1], 10);
      if (!isNaN(y) && y > 1900 && y < 2100) return y;
    }
  }
  // Fallback: extract year from date
  if (inv.date) {
    const y = parseInt(inv.date.substring(0, 4), 10);
    if (!isNaN(y)) return y;
  }
  return new Date().getFullYear();
},
```

- [ ] **Step 3: Update renderInvoices to group by year**

In the `renderInvoices()` method, after filtering invoices by the active tab (INCOMED/EXPENSES/ALL), sort and group:

```js
// Sort: newest year first, then by number within year
const sorted = filtered.slice().sort((a, b) => {
  const ya = this.invYear(a), yb = this.invYear(b);
  if (ya !== yb) return yb - ya;
  // Extract sequence numbers
  const parseNum = (inv) => {
    if (!inv.number) return 0;
    const parts = inv.number.split('/').map(s => s.trim());
    return parts.length === 2 ? (parseInt(parts[0], 10) || 0) : 0;
  };
  return parseNum(a) - parseNum(b);
});

// Group by year with headers
let html = '';
let lastYear = null;
for (const inv of sorted) {
  const year = this.invYear(inv);
  if (year !== lastYear) {
    html += '<div class="inv-year-header">── ' + year + ' ──</div>';
    lastYear = year;
  }
  html += this.invRowHtml(inv); // existing row rendering
}
```

Replace the existing loop that renders invoice rows with this grouped approach.

- [ ] **Step 4: Add CSS for year header**

In `public/style.css`, add:

```css
.inv-year-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: bold;
  color: var(--text-muted);
  letter-spacing: 1px;
  border-bottom: 1px solid var(--border);
  margin-top: 8px;
}
```

- [ ] **Step 5: Verify in browser**

Create invoices across 2024, 2025, 2026. Verify they group by year with headers, newest year first.

- [ ] **Step 6: Commit**

```bash
git add public/js/page-invoices.js public/style.css
git commit -m "feat: sort and group invoices by year with year headers"
```

---

### Task 11: Remaining RSD Label Updates (page-settings.js)

**Files:**
- Modify: `public/js/page-settings.js:255,692`

**Interfaces:**
- Consumes: `baseCurrency()`

- [ ] **Step 1: Update rates table unit label**

Line 255: Already handled in Task 8 (ratesTableHtml rewrite uses "EUR" since rates are EUR-based).

- [ ] **Step 2: Update settings section header**

Line 692: Already handled in Task 8 (section header changed to "1 UNIT IN EUR").

- [ ] **Step 3: Update export CSV currency default**

Line 240: `t.currency || 'RSD'` → `t.currency || this.baseCurrency()`.

- [ ] **Step 4: Commit**

```bash
git add public/js/page-settings.js
git commit -m "refactor: remaining RSD label updates in settings"
```

---

### Task 12: Refactor page-invoices.js RSD References

**Files:**
- Modify: `public/js/page-invoices.js:75,82,89,90,91,114,227,259,370,392,436`

**Interfaces:**
- Consumes: `toBase()`, `fmtBase()`, `baseCurrency()`

- [ ] **Step 1: Replace toRsd→toBase**

Lines 75, 82: `this.toRsd(` → `this.toBase(`

- [ ] **Step 2: Replace fmtRsd→fmtBase**

Lines 89, 90, 91: `this.fmtRsd(` → `this.fmtBase(`

- [ ] **Step 3: Update fallbacks**

Lines 75, 82, 114, 259, 370, 392, 436: `|| 'RSD'` → `|| this.baseCurrency() || 'RSD'`

- [ ] **Step 4: Update default currency**

Line 227: `value = 'RSD'` → `value = this.baseCurrency()`

- [ ] **Step 5: Update invRsd helper name**

Line 75: Rename `invRsd(inv)` → `invBase(inv)` (and update all callers of this method).

- [ ] **Step 6: Verify in browser**

Check invoice page: totals, remaining amounts, overdue amounts all display with base currency.

- [ ] **Step 7: Commit**

```bash
git add public/js/page-invoices.js
git commit -m "refactor: replace all RSD references with baseCurrency in invoices"
```

---

### Task 13: Final Integration Verification

**Files:** All modified files

- [ ] **Step 1: Full browser test — Nick profile**

Load Nick profile (existing data, no migration). Verify:
- All pages display amounts in RSD (Nick's base currency)
- Invoice list shows existing invoices with old numbering format (not migrated)
- Exchange rates show EUR-based values (auto-migrated from legacy RSD-based)
- Currency dropdowns show Nick's enabled currencies (EUR, USD, XAU)

- [ ] **Step 2: Full browser test — new profile**

Create a new profile. Verify:
- Base currency is RSD by default
- 15 currencies enabled
- All dropdowns show all 15 currencies
- Create transaction, bill, invoice — verify currency options
- Change base currency to EUR — verify all displays update
- Add GBP — verify it appears in dropdowns
- Remove JPY — verify it disappears

- [ ] **Step 3: Full browser test — invoices**

- Create invoices in 2024, 2025, 2026
- Verify year grouping with headers
- Verify numbering format `001 / 2026`
- Edit existing invoice — verify number preserved

- [ ] **Step 4: Full browser test — edge cases**

- Create transfer between accounts with different currencies
- Pay a bill in foreign currency
- Make a partial invoice payment
- Import CSV with mixed currencies

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "v0.8.0: configurable base currency, currency management, invoice improvements"
```
