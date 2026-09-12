# Design: Forecast, Reconciliation, Import Rules, and Attention Bar

## Summary

Add practical decision support to Black Book while preserving the local-first,
flat-profile architecture. The first release adds a Forecast page, account
reconciliation, import review and categorization rules, and a hideable
attention strip in the existing header. Backup history is designed here but
deferred from the first implementation at the user's request.

## Compatibility Contract

- Existing `profiles/*.json` documents continue to load without conversion.
- All new profile fields are optional. Missing fields receive in-memory
  defaults and are saved only after the user changes data normally.
- Existing transactions are always `posted`; the application will not recast
  historical entries as planned or cleared.
- Existing AUTO bills and installment logic continues to create posted
  transactions automatically on their due dates.
- No cloud service, bank connection, or financial data transmission is added.

## 1. Planned and Posted Financial Events

### Terminology

- **Posted transaction:** money actually moved. It changes an account balance.
- **Planned event:** an expected future cash movement. It appears only in the
  Forecast page and never changes an account balance.

### Data additions

```json
{
  "recurringTemplates": [
    {
      "id": "rec-rent",
      "name": "Rent",
      "amount": -600,
      "currency": "EUR",
      "accountId": "acct-bank",
      "categoryId": "cat-housing",
      "frequency": "monthly",
      "dayOfMonth": 1,
      "startDate": "2026-10-01",
      "endDate": null,
      "active": true
    }
  ]
}
```

Templates are forecast-only in this release. Bills and card installments retain
their established automatic posting behavior.

## 2. Forecast Page

Add `FORECAST` to the sidebar after Overview. The page has horizon controls
for 30, 60, and 90 days; account filter chips; a summary of the lowest
projected balance; and a date-ordered timeline.

### Event sources

1. Current account balances derived from posted transactions.
2. Active bills not yet posted for their due date.
3. Remaining card-installment slots.
4. Active recurring templates.
5. Invoice due balances as expected inflows/outflows, shown separately and
   toggleable because invoices are less certain than bills.
6. Active debts with due dates, also toggleable.

### Rules

- Forecast is a pure calculation. It never saves profile data or creates a
  transaction.
- Each event carries a source type and source id so its row can open the bill,
  installment, invoice, debt, or template that generated it.
- Account projections convert values through the existing base-currency pivot
  for totals while retaining the original amount/currency on each row.
- Unknown bill amounts are omitted from totals but listed as an amount-needed
  warning.

## 3. Reconciliation

Each account-detail view receives a `RECONCILE` action.

1. The user enters statement date and statement closing balance.
2. The app presents transactions on or before that date, with `cleared`
   checkboxes.
3. It shows `statement balance - cleared balance` continuously.
4. The user can save a reconciliation snapshot only when the difference is
   zero, or explicitly keep an in-progress reconciliation.

### Data additions

```json
{
  "transactions": [{ "id": "...", "cleared": true, "clearedAt": "2026-09-07" }],
  "reconciliations": [{
    "id": "rec-2026-09-account",
    "accountId": "acct-bank",
    "statementDate": "2026-09-07",
    "statementBalance": 1200,
    "clearedBalance": 1200,
    "status": "complete"
  }]
}
```

Reconciliation affects neither transaction amounts nor account balance logic;
it records confidence that the data matches a statement.

## 4. Import Review and Rules

Import stays local and becomes a two-step process:

1. Parse columns exactly as today, then stage proposed rows in memory.
2. Apply matching rules and flag possible duplicates before the user confirms
   the import.

### Rules

```json
{
  "importRules": [{
    "id": "rule-netflix",
    "match": "NETFLIX",
    "matchMode": "contains",
    "categoryId": "cat-subscriptions",
    "accountId": null,
    "active": true
  }]
}
```

Rules match case-insensitively against a normalized transaction description.
Duplicate warnings compare account, absolute amount, currency, and dates in a
configurable plus/minus three-day window. A warning is advisory: each row can
be imported, excluded, or edited; nothing is silently discarded.

## 5. Header Attention Strip

Reuse the existing empty header-center area. It remains hidden when there are
no items or when `settings.attentionBarHidden` is true.

It shows a compact count and the highest-priority items:

```text
ATTENTION · 3   Internet due tomorrow · Dining budget 84% · Cash low in 9 days
```

Show at most three items. Items are ranked by severity first, then nearest
relevant date: overdue bill or invoice payment; forecast account shortfall;
bill due today or within three days; reconciliation difference or import review
waiting; then budget warning. If more items remain, the strip ends with a
`+N MORE` control that opens a complete Attention panel grouped by severity.
Clicking an item navigates to and focuses its source record. Settings offers
`SHOW/HIDE ATTENTION BAR` per profile.

## 6. Deferred: Backup History

The current `.bak` prior-version copy remains in place. A later release will
add `profiles/backups/<profile-name>/` with retention options:

- latest only (default)
- latest daily snapshot
- latest weekly snapshot
- latest monthly snapshot

Restore will always show backup timestamp, profile name, and a non-destructive
preview before confirmation. This is intentionally deferred so the first
release concentrates on daily money decisions without changing storage
retention behavior.

## Implementation Boundaries

| Unit | Responsibility |
| --- | --- |
| `lib/forecast.js` | Pure event generation, projection, and warning calculations. |
| `public/js/page-forecast.js` | Forecast controls, timeline, and source navigation. |
| `public/js/page-overview.js` | Header attention item calculations and links. |
| `public/js/page-settings.js` | Recurring-template and import-rule management. |
| `public/js/page-transactions.js` | Import review staging and duplicate decisions. |
| `public/js/page-overview.js` / account detail | Reconciliation interface and summaries. |
| `test/*.test.js` | Forecast, reconciliation, rule, duplicate, and compatibility coverage. |

## Failure Handling

- A missing exchange rate does not alter a balance; the forecast marks that
  event as unavailable and excludes it from converted totals.
- A malformed future template or rule is skipped and surfaced in Settings,
  never allowed to stop the dashboard from rendering.
- Existing profiles without the new arrays work normally.
- No automatically posted AUTO event may be duplicated in the forecast after
  its real transaction exists.

## Acceptance Criteria

1. Existing profile history loads and produces the same current balances.
2. Forecast totals are deterministic and do not mutate profile data.
3. AUTO bills/installments still post once on their due date and forecast only
   their unpaid future occurrence.
4. Reconciliation can identify and resolve a statement difference without
   changing amounts.
5. Import review catches exact and near-date duplicates without blocking user
   choice.
6. Rules apply only to staged import rows and never change older transactions.
7. The attention strip shows no more than three severity-ranked items, exposes
   all remaining items through `+N MORE`, and is hideable without changing the
   application layout.
8. `npm run check` and `npm test` cover the new pure financial calculations.
