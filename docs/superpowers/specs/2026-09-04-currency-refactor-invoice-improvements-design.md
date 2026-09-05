# Design: Currency System Refactoring + Invoice Improvements

## Summary

Refactor the hardcoded RSD base currency into a per-profile configurable base currency, expand the currency set to 15+ common currencies with auto-updating rates, add currency management UI, change invoice numbering to `NNN / YEAR`, and sort invoices by year.

---

## 1. Currency Architecture — Pivot Change

### Current State
- All rates stored as "1 unit of X = N RSD" (server fetches EUR-based from API, converts to RSD)
- `toRsd(amount, currency)` converts any currency → RSD using stored rates
- `fmtRsd(amount)` always appends " RSD"
- `convertBetweenCurrencies()` uses RSD as pivot: `curFrom === 'RSD' ? 1`
- 60+ `|| 'RSD'` fallbacks, 15+ `=== 'RSD'` checks across 9 JS files

### Proposed Change

**Server-side:** Store rates in EUR base (as the API returns them). No conversion to RSD.

- `fetchFiatRates()` returns raw rates from `open.er-api.com/v6/latest/EUR` (already does this)
- Store ALL rates from the response (not just RSD and USD) — `data.rates` contains 160+ currencies
- `fetchRates()` stores `{ rate, source, updated }` per currency, where rate = "1 unit of X = N EUR"
- Gold (XAU) rate = gold price in USD / 31.1035, then converted to EUR via USD/EUR rate from the same API response

**Client-side:** Use EUR as the universal conversion pivot. Profile's `baseCurrency` determines display.

- `toRsd()` → `toBase(amount, currency)` — converts any currency → profile's base currency via EUR
- `fmtRsd()` → `fmtBase(amount)` — formats using profile's base currency code
- `convertBetweenCurrencies()` — uses EUR as pivot instead of RSD
- All `|| 'RSD'` → `|| this.data.settings.baseCurrency || 'RSD'`
- All `=== 'RSD'` → `=== this.baseCurrency()` (new helper)
- All UI labels ("RSD") → dynamic using profile's base currency

### Rate Storage Format Change

**Before:**
```json
{ "EUR": { "rate": 117.34, "source": "open.er-api.com", "updated": "..." } }
// Means: 1 EUR = 117.34 RSD
```

**After:**
```json
{ "EUR": { "rate": 1, "source": "open.er-api.com", "updated": "..." } }
{ "USD": { "rate": 0.86, "source": "open.er-api.com", "updated": "..." } }
{ "GBP": { "rate": 0.84, "source": "open.er-api.com", "updated": "..." } }
// Means: 1 EUR = 1 EUR, 1 USD = 0.86 EUR, 1 GBP = 0.84 EUR
```

### Migration (Client-Side, on Load)

For existing profiles with legacy RSD-based rates:

```
newRate[EUR] = 1 (always)
newRate[X] = legacyRate[X] / legacyRate[EUR]
```

Detect legacy format: if `rates.EUR.rate > 10` (no fiat currency has a rate > 10 relative to EUR, but RSD/EUR ≈ 117), it's legacy. Apply migration once, save.

---

## 2. Profile Base Currency

### New Settings Fields

```json
{
  "baseCurrency": "RSD",
  "enabledCurrencies": ["RSD", "EUR", "USD", "GBP", "CHF", "JPY", "CNY", "AUD", "CAD", "SEK", "NOK", "PLN", "CZK", "TRY", "INR"]
}
```

### Default Values

- `baseCurrency`: "RSD" (for new profiles and legacy profiles without this field)
- `enabledCurrencies`: 15 common currencies (see list above)
- Existing profiles (Nick): no data migration — they keep their current 3 currencies (EUR, USD, XAU). User can add more manually.

### Helper Functions (core.js)

```js
baseCurrency() {
  return this.data.settings.baseCurrency || 'RSD';
},

toBase(amount, currency) {
  const base = this.baseCurrency();
  if (!currency || currency === base) return amount;
  // Convert through EUR pivot
  const rates = this.getRates();
  const rateFrom = (currency === 'EUR') ? 1 : (rates[currency] || {}).rate;
  const rateTo = (base === 'EUR') ? 1 : (rates[base] || {}).rate;
  if (!rateFrom || !rateTo) return amount;
  return Math.round(amount * rateFrom / rateTo * 100) / 100;
},

fmtBase(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + this.baseCurrency();
},
```

### Changes to convertBetweenCurrencies

```js
// Before (RSD pivot):
const rateFrom = curFrom === 'RSD' ? 1 : (this.getRates()[curFrom] || {}).rate;
const rateTo = curTo === 'RSD' ? 1 : (this.getRates()[curTo] || {}).rate;
const rsd = amount * rateFrom;
return Math.round(rsd / rateTo * 100) / 100;

// After (EUR pivot):
const rates = this.getRates();
const rateFrom = (curFrom === 'EUR') ? 1 : (rates[curFrom] || {}).rate;
const rateTo = (curTo === 'EUR') ? 1 : (rates[curTo] || {}).rate;
if (!rateFrom || !rateTo) return null;
const eur = amount * rateFrom;
return Math.round(eur / rateTo * 100) / 100;
```

---

## 3. Currency Management in Settings

### UI: Exchange Rates Section

Replace the current 3-currency rate table with a dynamic list based on `enabledCurrencies`:

```
EXCHANGE RATES · 1 UNIT IN EUR          [REFRESH ALL]
┌──────────────────────────────────────────────────────────┐
│ CUR   RATE         SOURCE        UPDATED      MANUAL    │
│ RSD   117.34 EUR   open.er-api   04.09.2026   [___][SET][REFRESH] │
│ EUR   1.0000 EUR   —             —            [___][SET][REFRESH] │
│ USD   0.8612 EUR   open.er-api   04.09.2026   [___][SET][REFRESH] │
│ GBP   0.8401 EUR   open.er-api   04.09.2026   [___][SET][REFRESH] │
│ ...                                                           │
│                                                               │
│ [+ ADD CURRENCY]  [REMOVE]                                   │
└──────────────────────────────────────────────────────────┘
```

### Add Currency Flow

1. Click "+ ADD CURRENCY" → dropdown shows all currencies NOT in `enabledCurrencies`
2. Select currency → add to `enabledCurrencies`, fetch rate from API, save
3. Rate auto-fetched from `/api/exchange-rate?cur=GBP`

### Remove Currency Flow

1. Click "REMOVE" next to a currency → confirm dialog
2. Remove from `enabledCurrencies`
3. Rate data stays in `settings.rates` (historical data preserved)
4. Currency disappears from all dropdowns

### Refresh Behavior

- "REFRESH ALL" fetches fresh rates for all enabled currencies in one API call
- Single "REFRESH" fetches one currency
- Server endpoint returns all rates from a single API call; client extracts what it needs

---

## 4. Server-Side Changes (server.js)

### Remove RATE_CODES Constant

No longer needed — we fetch all rates and store them dynamically.

### Update fetchFiatRates()

```js
async function fetchFiatRates() {
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/EUR');
    const data = await resp.json();
    if (data?.rates) {
      return { rates: data.rates, source: 'open.er-api.com' };
    }
  } catch (e) {}
  // Fallback API
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

### Update fetchRates()

Store all rates from the API response. Each rate is "1 unit of X = N EUR".

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
      if (code === 'EUR') continue; // EUR is always 1
      if (shouldUpdate(code)) {
        out[code] = { rate: rnd4(rate), source: fiat.source, updated };
      }
    }
  }
  // Gold (XAU) - special handling
  if (!cur || cur === 'XAU') {
    if (shouldUpdate('XAU')) {
      const usdPerOz = await fetchGoldUsdPerOz();
      if (usdPerOz && fiat?.rates?.USD) {
        // usdPerOz is USD price per oz; fiat.rates.USD is EUR per 1 USD
        // So: EUR per oz = usdPerOz / fiat.rates.USD; then EUR per gram = EUR per oz / 31.1035
        const eurPerGram = usdPerOz / fiat.rates.USD / OZ_TO_GRAM;
        out.XAU = { rate: rnd4(eurPerGram), source: 'gold-api.com', updated };
      }
    }
  }
  return out;
}
```

### Update ensureRates()

Simplified — just ensure `db.settings.rates` is an object. Legacy `eurToRsdRate` migration removed (handled client-side).

```js
function ensureRates(db) {
  if (!db.settings.rates) db.settings.rates = {};
  return db.settings.rates;
}
```

### Update DEFAULT_DATA

```js
settings: {
  baseCurrency: 'RSD',
  enabledCurrencies: ['RSD', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'AUD', 'CAD', 'SEK', 'NOK', 'PLN', 'CZK', 'TRY', 'INR'],
  // Legacy fields kept for backward compat:
  eurToRsdRate: 117.2,
  eurToRsdRateSource: 'manual',
  eurToRsdRateUpdated: null,
  defaultAccountId: null,
  defaultCategoryId: null,
  dateSeparator: '/'
}
```

---

## 5. UI Label Changes

All hardcoded "RSD" labels become dynamic:

| Location | Before | After |
|----------|--------|-------|
| `fmtRsd()` | `' RSD'` | `' ' + this.baseCurrency()` |
| `index.html:69` | `FEE (RSD)` | `FEE (<span class="base-cur">RSD</span>)` — populated by JS |
| `index.html:203` | `Amount (RSD)` | Dynamic |
| `index.html:239` | `Fee (RSD)` | Dynamic |
| `index.html:514` | `Monthly Budget (RSD)` | Dynamic |
| `page-settings.js:255` | `<span class="rate-unit">RSD</span>` | `<span class="rate-unit">EUR</span>` (rates are in EUR now) |
| `page-settings.js:692` | `EXCHANGE RATES · 1 UNIT IN RSD` | `EXCHANGE RATES · 1 UNIT IN EUR` |
| `page-bills.js:659` | Appends `' RSD'` | Uses `fmtBase()` |
| `core.js:782` | `' RSD'` | `baseCurrency()` |
| `core.js:885` | `' RSD/mo'` | `baseCurrency() + '/mo'` |

All `|| 'RSD'` fallbacks → `|| this.baseCurrency() || 'RSD'` (60+ locations across 9 files).

All `=== 'RSD'` checks → `=== this.baseCurrency()` (15+ locations).

---

## 6. Invoice Numbering

### Current Format
`YYYY-NNN` (e.g., `2026-001`)

### New Format
`NNN / YEAR` (e.g., `001 / 2026`)

### Auto-Generation Logic (page-invoices.js:208-223)

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
document.getElementById('invoice-number').value =
  String(maxSeq + 1).padStart(3, '0') + ' / ' + year;
```

### Migration

Existing invoices with old format (`YYYY-NNN` or `NNN/YYYY`) are NOT auto-migrated. They display as-is. Only new invoices use the new format.

---

## 7. Invoice Sorting by Year

### Current Behavior
Invoices displayed in a flat list, order depends on array position.

### New Behavior
Invoices grouped by year, newest year first, with year header separators.

```
── 2026 ──────────────────────────
  001 / 2026  ·  Galerija 12  ·  213,043.41 RSD
  002 / 2026  ·  Another Client  ·  50,000.00 RSD

── 2025 ──────────────────────────
  001 / 2025  ·  Old Client  ·  100,000.00 RSD

── 2024 ──────────────────────────
  001 / 2024  ·  Galerija 12  ·  80,000.00 RSD
```

### Implementation

In `renderInvoices()`, sort invoices by year (descending), then by number. Insert year header `<div>` elements between groups.

Year extracted from invoice number by parsing after `/`, falling back to `invoice.date` year.

---

## 8. Default Currencies for New Profiles

New profiles (created via `+ NEW PROFILE`) start with 15 common currencies:

```
RSD, EUR, USD, GBP, CHF, JPY, CNY, AUD, CAD, SEK, NOK, PLN, CZK, TRY, INR
```

All rates auto-fetched on first load. The `enabledCurrencies` array is set in `DEFAULT_DATA`.

### Existing Profiles (Nick)

No data migration. Nick keeps current 3 currencies (EUR, USD, XAU). User can add more via the "+ ADD CURRENCY" button in settings.

---

## 9. Currency Dropdowns

All currency `<select>` elements in `index.html` become dynamically populated from `enabledCurrencies`:

- Transaction currency (`tx-currency-select`)
- Bill currency (`bill-currency`)
- Savings goal currency (`savings-goal-currency`)
- Account currency (`settings-account-currency`)
- Debt currency (`debt-currency`)
- Invoice currency (`invoice-currency`)

The HTML `<option>` elements are replaced with JS-generated options on page load.

---

## 10. Files Modified

| File | Changes |
|------|---------|
| `server.js` | `fetchFiatRates()` returns all rates, `fetchRates()` stores EUR-based, `ensureRates()` simplified, `DEFAULT_DATA` updated, `RATE_CODES` removed |
| `public/js/core.js` | `toRsd()`→`toBase()`, `fmtRsd()`→`fmtBase()`, `getRates()` handles all currencies + legacy migration, `baseCurrency()` helper, all `=== 'RSD'` and `|| 'RSD'` updated, `convertBetweenCurrencies()` uses EUR pivot |
| `public/js/page-settings.js` | `ratesTableHtml()` iterates `enabledCurrencies`, add/remove currency UI, base currency picker, label changes |
| `public/js/page-invoices.js` | Invoice number format `NNN / YEAR`, year-based sorting/grouping |
| `public/js/page-transactions.js` | `convertBetweenCurrencies()` EUR pivot, currency dropdown populated from `enabledCurrencies` |
| `public/js/page-overview.js` | `toRsd()`→`toBase()`, `fmtRsd()`→`fmtBase()`, all RSD fallbacks updated |
| `public/js/page-budget.js` | Same refactoring |
| `public/js/page-bills.js` | Same refactoring |
| `public/js/page-savings.js` | Same refactoring |
| `public/js/page-debts.js` | Same refactoring |
| `public/js/page-cards.js` | Same refactoring |
| `public/index.html` | Dynamic currency dropdowns, dynamic RSD labels |

---

## 11. Testing Strategy

- Create a new profile → verify default base currency is RSD, 15 currencies enabled
- Switch base currency to EUR → verify all displays update
- Add GBP to enabled currencies → verify it appears in all dropdowns
- Remove XAU → verify it disappears from dropdowns
- Refresh rates → verify all enabled currencies get fresh rates
- Create invoice → verify numbering format `001 / 2026`
- Create invoices across multiple years → verify year-grouped display
- Create transaction in EUR → verify conversion through EUR pivot
- Import/export data → verify currency data preserved
- Existing Nick profile → verify no changes, legacy rates still work
