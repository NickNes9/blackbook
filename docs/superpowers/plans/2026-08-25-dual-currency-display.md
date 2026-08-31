# Dual Currency Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a transaction on an RSD-denominated account is in a foreign currency, display both the RSD converted amount and the original currency value (e.g. "400.00 RSD (3.00 EUR)") across all display contexts.

**Architecture:** Add a single `fmtDualCurrency(amount, currency, accountCurrency)` helper in `core.js` that handles the dual-display logic. Replace inline formatting in all transaction display locations with calls to this helper.

**Tech Stack:** Vanilla JS, Express backend, Chart.js frontend.

**Spec:** User request — show both RSD and original currency on transactions for RSD accounts.

## File Structure

- **Modify:** `public/js/core.js:369-375` — add `fmtDualCurrency()` helper
- **Modify:** `public/js/page-overview.js:206` — transaction row amount display
- **Modify:** `public/js/page-transactions.js` — transaction page rendering (if separate from overview)
- **Modify:** `public/js/page-debts.js:68` — debt card display (paid/total uses `fmtRsd`)
- **Modify:** `public/js/page-bills.js:13,100,364` — bill amounts already use `fmtBillAmount`, verify consistency
- **Modify:** `public/js/page-invoices.js:89,93` — invoice line items and progress text
- **Modify:** `public/js/page-cards.js:82,104-111,120` — credit card installment displays

## Global Constraints

- No frameworks — vanilla JS only
- Preserve existing formatting for same-currency transactions (no change when tx.currency === account.currency)
- Rate lookup must handle missing rates gracefully (fall back to original currency display)
- All changes are frontend display-only — no data model changes

---

### Task 1: Add `fmtDualCurrency` helper to core.js

**Files:**
- Modify: `public/js/core.js:369-375`

**Interfaces:**
- Consumes: `this.data.settings.rates` (via `getRates()`), `toRsd()`
- Produces: `fmtDualCurrency(amount, currency, accountCurrency)` — returns formatted string

- [ ] **Step 1: Add the helper function after `fmtAmount`**

```javascript
fmtDualCurrency(amount, currency, accountCurrency) {
  const abs = Math.abs(amount);
  const sign = amount >= 0 ? '' : '-';
  const cur = currency || 'RSD';
  const accCur = accountCurrency || 'RSD';
  if (cur === accCur) {
    return sign + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
  }
  const rsd = Math.abs(this.toRsd(abs, cur));
  const native = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
  return sign + rsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + accCur + ' (' + native + ')';
},
```

Insert after the `fmtAmount` function (after line 375).

- [ ] **Step 2: Verify in browser**

Open the app, confirm no JS errors in console. The function is not called yet so no visual change expected.

---

### Task 2: Update overview transaction rows

**Files:**
- Modify: `public/js/page-overview.js:206`

**Interfaces:**
- Consumes: `fmtDualCurrency()`, `accounts` map (already available in scope)
- Produces: updated transaction row HTML

- [ ] **Step 1: Replace the inline amount formatting on line 206**

The current line builds the amount as:
```javascript
sign + Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + tx.currency
```

Replace with:
```javascript
(() => { const a = accounts[tx.accountId]; return this.fmtDualCurrency(tx.amount, tx.currency, a ? (a.currency || 'RSD') : 'RSD'); })()
```

The full line 206 stays the same structure — only the amount portion in the `tx-amt` span changes. The `sign` variable and `amtClass` logic remain as-is but the sign is now handled inside `fmtDualCurrency` for cross-currency cases. Remove the separate `sign` variable since `fmtDualCurrency` handles sign internally.

- [ ] **Step 2: Verify in browser**

Open the app, create a transaction on an RSD account in EUR. Confirm the transaction row shows "400.00 RSD (3.00 EUR)" format. Verify RSD transactions still show plain "100.00 RSD".

---

### Task 3: Update debts display

**Files:**
- Modify: `public/js/page-debts.js:68`

**Interfaces:**
- Consumes: `fmtDualCurrency()`, debt's `currency` field
- Produces: updated debt card text

- [ ] **Step 1: Update debt card display**

Debt cards currently show `this.fmtRsd(paid) + ' of ' + this.fmtRsd(total)`. The debts use their own currency field, not account currency. For debts, since there's no "account currency" concept, just use `fmtDualCurrency` with the debt's own currency as the account currency — this means if the debt is in EUR, it stays as-is. The dual display applies when a debt in EUR is viewed alongside RSD aggregates. Actually, since debts don't belong to accounts, leave debt display as-is using `fmtRsd`. No change needed here.

---

### Task 4: Verify bills display

**Files:**
- Modify: `public/js/page-bills.js:13,100`

**Interfaces:**
- Consumes: `fmtDualCurrency()`, bill's `currency` field
- Produces: updated bill amount text

- [ ] **Step 1: Check bill chip and cell labels**

Line 13 (`fmtAmount` in chip) and line 100 (cell label with `toRsd` + `Math.round`) — bills have their own currency, not account currency. The existing `fmtBillAmount` at line 364 already shows both currencies. No change needed since bills are standalone entities, not tied to account currency.

---

### Task 5: Update invoice display

**Files:**
- Modify: `public/js/page-invoices.js:89,93`

**Interfaces:**
- Consumes: `fmtDualCurrency()`, invoice's `currency` field
- Produces: updated invoice progress and line item text

- [ ] **Step 1: Update invoice progress text**

Line 89 shows `this.fmtAmount(paid, cur) + ' of ' + this.fmtAmount(total, cur)` — invoices have their own currency, not account currency. Same reasoning as debts/bills: invoices are standalone. No change needed.

---

### Task 6: Update credit card installment display

**Files:**
- Modify: `public/js/page-cards.js:82,104-111,120`

**Interfaces:**
- Consumes: `fmtDualCurrency()`, card/account currency
- Produces: updated card and installment text

- [ ] **Step 1: Check card installment displays**

Credit cards are hardcoded to RSD. Installments show `this.fmtRsd(...)` everywhere. No change needed since everything is already RSD.

---

### Task 7: End-to-end verification

- [ ] **Step 1: Create test data**

Add transactions on an RSD account in EUR, USD. Confirm dual currency display works in overview.

- [ ] **Step 2: Verify same-currency transactions**

Confirm RSD-to-RSD transactions show unchanged format (no parenthetical).

- [ ] **Step 3: Check all pages**

Verify overview, transactions, bills, invoices, debts, cards, savings — no visual regressions.
