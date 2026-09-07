# Implementation Plan: Forecast and Finance Controls

## Scope

Implement Forecast, reconciliation, import review/rules, and the hideable
severity-first attention bar. Do not implement backup rotation in this change.

## 1. Data Compatibility Foundation

Modify `public/js/core.js` initialization to ensure optional defaults for
`recurringTemplates`, `reconciliations`, `importRules`, and
`settings.attentionBarHidden`. Do not migrate or rewrite existing transaction
records; missing `cleared` means false and every existing transaction is posted.

Add pure calculation modules under `lib/` and Node tests before wiring UI.
Fixtures must be in memory or temporary directories only.

## 2. Forecast Engine and Page

Create `lib/forecast.js` to generate deterministic dated events from balances,
bills, installment slots, recurring templates, invoices, and debts. The engine
returns per-account and base-currency projections, source metadata, missing-rate
warnings, and the lowest projected balance. It must never mutate input data.

Add `public/js/page-forecast.js`, a `FORECAST` navigation entry and page shell
in `public/index.html`, and register it in `core.js`. Build 30/60/90-day
horizons, account filters, source links, expected-inflow toggles, timeline rows,
and recurring-template management in Settings.

Tests: event ordering, no mutation, posted AUTO events excluded after posting,
and base-currency totals.

## 3. Attention Bar

Add an identified header-center container to `index.html`. In `core.js`, derive
attention items from overdue/due-soon bills, forecast shortfall, budget usage,
unreviewed imports, and reconciliation differences. Sort by severity then date;
render only three and a `+N MORE` action for the rest. Add a lightweight modal
for complete grouped results and a Settings visibility preference.

Tests: priority ordering, cap, and hide preference.

## 4. Reconciliation

Extend the account detail UI in `page-overview.js` with a Reconcile action.
Create a modal containing statement date/balance, eligible transaction list,
cleared checkboxes, difference calculation, and saved reconciliation status.
Save only optional `cleared`, `clearedAt`, and `reconciliations` records;
never modify transaction amounts. Add a confirmation for completion with a
non-zero difference.

Tests: cleared balance, difference, complete snapshot, and legacy transaction
compatibility.

## 5. Import Review and Rules

Refactor existing CSV/XLSX import parsing in `page-settings.js` into a staging
step. Add normalized description matching, stored rules, and duplicate scoring
against existing and staged rows. Render a review table where every row can be
included, excluded, or edited before one final save. Rule CRUD belongs in the
Settings import area.

Tests: case-insensitive matching, date-window duplicate warnings, and explicit
user inclusion overriding a warning.

## 6. Verification and Documentation

Update README feature/keyboard notes as needed. Extend `npm run check` for new
browser scripts and `npm test` for pure calculations. Manually verify a legacy
profile loads unchanged, a forecast does not save data, AUTO posting occurs
once, import review does not persist until confirmation, and the header stays
compact with many attention items.
