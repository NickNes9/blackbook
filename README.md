# BLACK BOOK

A local-first personal finance console. Terminal aesthetic with light/dark themes, fully keyboard-driven, single Node.js server with flat-file storage — no cloud, no accounts, your data stays on your machine.

## Features

- **Accounts** — cash/bank accounts, multiple currencies (RSD base + EUR/USD/XAU auto-fetched rates with manual override), auto-assigned colors
- **Transactions** — quick-entry popup (`A`), transfers between accounts (`T`), income vs expense sign convention (`-` = expense, `+` = income), click a row to bulk-select, bulk edit/delete/merge, date scroll-wheel stepping
- **Budgets** — per-category monthly limits (optionally renamed), progress bars, % used · left shown inline, SET/EDIT per row
- **Bills** — yearly payment grid (sticky header, zebra rows, per-bill TOTAL) with pay-from-any-account/card, custom amounts per month (right-click a cell), AUTO mode marks the current month paid automatically and creates linked transactions, year selector + TODAY navigation, `H` toggles the graph
- **Savings goals** — target tracking, deposit/withdraw history, progress bars, command-palette deposits (`dep goal 500`)
- **Credit cards** — installment plans with interest baked into the debt (100 @ 5% = 105; first installment carries the interest), PAY/PAID slots, greedy custom payments, edit plans, advance credit
- **Debts / Invoices** — OWED · I OWE and INCOMES · EXPENSES · ALL filters inline with the period controls; debts carry a category; invoices support line items and attached files (openable from the card)
- **Overview** — metric panels, category breakdown bar, month filters that drive both the income-vs-expenses graph and the transaction list, sort by category or date, `H` hides the graph
- **Forecast** — a separate 30/60/90-day cash timeline and balance graph using current balances, unpaid scheduled bills, remaining card-installment slots, and optional recurring income/expenses; account filters and missing-rate warnings keep projections explicit.
- **Attention bar** — the header shows up to three highest-priority items (urgent first, then nearest date), with a `+N MORE` summary and a per-profile hide option.
- **Reconciliation** — optionally enable it in Settings, then use visual marks and marked/unmarked filters on Overview before recording a statement date and balance; unmatched statements stay visibly in progress until their difference is zero.
- **Categories** — picker everywhere (transactions, debts, invoices, purchases), auto-created during import, palette of theme-aware colors
- **Import / Export** — Settings → EXPORT CSV (transactions) and EXPORT JSON (full backup, restore via IMPORT JSON); IMPORT CSV/XLSX stages valid rows, applies reusable description-to-category rules, and warns about likely duplicates before anything is saved.
- **Themes** — dark (default) and light, device-level toggle in Settings; customizable highlight, income and expense colors used across UI *and* charts; all native dropdowns themed to match
- **Responsive layout** — navigation becomes a slide-out menu, accounts abbreviate early, and months stay on one line (full names → JAN/FEB → numbers). Monetary labels use compact values such as 70k in tight spaces, with exact amounts available on hover; entry fields and stored amounts stay exact. Budget text keeps its normal size and percentages stay centered. Reconciliation marks appear only in Marked/Unmarked views, independently of sorting. Forecast uses the Overview chart style, and hidden charts leave no empty panel.
- **Math in amount fields** — type `50+20*3`, `(2+3)*4` or `12,5` anywhere an amount is accepted
- **Profiles** — isolated data sets (default + named profiles) stored as separate files, per-profile page visibility
- **Command palette** — `/` or `Ctrl-K`: search transactions, pages, quick commands (`t 500 cash bank`, `pay electricity`, `bg groceries 20000`, `csv`, …)

## What's new in 0.8.3

- **Automatic updates** — Black Book checks GitHub Releases for a newer version and shows a banner when one is available; one click downloads the build (SHA-256 verified), installs it without touching your `profiles/`, and restarts on the same port while your open tab reloads automatically. Settings → ABOUT & UPDATES shows the current version and lets you check for or apply updates manually.
- **Forecast** — a separate 30/60/90-day cash timeline and balance graph using current balances, unpaid scheduled bills, remaining card-installment slots, and optional recurring income/expenses; account filters, missing-rate warnings, and a red/green balance chart keep projections explicit.
- **Reconciliation** — optional in Settings, visual marks and marked/unmarked filters on Overview, then record a statement date and balance; unmatched statements stay visibly in progress until their difference is zero.
- **Responsive layout** — navigation becomes a slide-out menu, accounts abbreviate early, and months stay on one line; monetary labels use compact values such as 70k in tight spaces while stored amounts stay exact.
- **Two-line bills amounts** — each bill shows both years' amounts, clicking the header toggles the chart view, and forecast warnings surface above the grid.

## In development on the next version

- Import review/rules, and the priority attention bar are being refined on a separate local feature branch. Existing `profiles/*.json` history remains the source of truth; the new fields are optional and additive.

## Keyboard

| Key | Action |
|---|---|
| `A` | New transaction |
| `T` | Transfer |
| `D` | Jump to today |
| `E` | Edit hovered transaction |
| `H` | Show/hide graph (Overview, Bills) |
| `←` / `→` | Previous / next month (year on Bills & Savings) |
| `1–8` | Switch pages |
| `Tab` | Cycle account filter (overview) |
| `Esc` | Close modal / palette |
| `/` | Command palette |

## Run

```bash
npm install
node server.js
```

Open http://localhost:3000 — or just run **Black Book.exe**, which starts the server hidden and opens your browser. `Stop Black Book.bat` shuts down that Black Book server only; it does not stop other Node programs.

## Data & privacy

All data lives in `profiles/*.json` next to `server.js` (`profiles/data.json` = default profile). This folder is **gitignored** — code backups never contain your finances. Each successful save first retains the immediately previous file as `.bak`; if a profile is corrupted, restore it from that backup instead of saving over it. For portable data backups use Settings → EXPORT JSON / EXPORT CSV. Attached invoice files are stored in your browser's IndexedDB (per browser profile) and exposed via the INVOICE button on each invoice card.

## Local-only operation

Black Book binds to `127.0.0.1`, so it is available only on this computer. It deliberately has no network hosting or login mode.

## Verification

```bash
npm run check
npm test
```

The tests use temporary fixture profiles and do not access your `profiles/` directory.

## Updates & releases

The app self-updates from GitHub Releases. It looks for `black-book-vX.Y.Z-{win,linux,mac}.zip` assets plus a `checksums.sha256` asset, verifies the download before replacing code, and never touches `profiles/`, `import/`, `node_modules/`, or your data files.

To publish a release from a checkout of this repo:

```bash
npm run release -- -Version 0.8.3   # bumps package.json + package-lock.json, builds dist\*.zip + checksums
gh release create v0.8.3 --title "v0.8.3" --notes "<changelog>" dist\black-book-v0.8.3-win.zip dist\black-book-v0.8.3-linux.zip dist\black-book-v0.8.3-mac.zip dist\checksums.sha256
```

Windows users keep using `Black Book.exe`; Linux/macOS users run `node server.js`. Applied updates keep the previous code under `updates/backup-<version>/` for rollback.

---

**BLACK BOOK v0.8.3**

Created by Nikola Nešić
