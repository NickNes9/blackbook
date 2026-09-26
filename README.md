# BLACK BOOK

A local-first personal finance console. Terminal aesthetic with light/dark themes, fully keyboard-driven, single Node.js server with flat-file storage — no cloud, no accounts, your data stays on your machine.

## Features

- **Accounts** — cash/bank accounts, multiple currencies (RSD base + EUR/USD/XAU auto-fetched rates with manual override), auto-assigned colors
- **Transactions** — quick-entry popup (`A`), transfers between accounts (`T`), income vs expense sign convention (`-` = expense, `+` = income), click a row to bulk-select, bulk edit/delete/merge, date scroll-wheel stepping
- **Budgets** — per-category monthly limits or a total allocated by category percentages from a chosen month onward; progress bars, % used, and remaining amount
- **Bills** — yearly payment grid (sticky header, zebra rows, per-bill TOTAL) with pay-from-any-account/card, custom amounts per month (right-click a cell), AUTO mode marks the current month paid automatically and creates linked transactions, year selector + TODAY navigation, `H` toggles the graph
- **Savings goals** — target tracking, deposit/withdraw history, progress bars, command-palette deposits (`dep goal 500`)
- **Credit cards** — installment plans with interest baked into the debt (100 @ 5% = 105; first installment carries the interest), PAY/PAID slots, greedy custom payments, edit plans, advance credit
- **Debts / Invoices** — OWED · I OWE and INCOMES · EXPENSES · ALL filters inline with the period controls; debts carry a category; invoices support line items and links to existing local files (openable from the card)
- **Overview** — metric panels, category breakdown bar, month filters that drive both the income-vs-expenses graph and the transaction list, sort by category or date, `H` hides the graph
- **Forecast** — a separate 30/60/90-day cash timeline and balance graph using current balances, unpaid scheduled bills, remaining card-installment slots, and optional recurring income/expenses; account filters and missing-rate warnings keep projections explicit.
- **Attention bar** — the header shows up to three highest-priority items (urgent first, then nearest date), with a `+N MORE` summary and a per-profile hide option.
- **Categories** — picker everywhere (transactions, debts, invoices, purchases), auto-created during import, palette of theme-aware colors
- **Import / Export** — Settings → EXPORT CSV (transactions) and EXPORT JSON (profile data); IMPORT JSON previews counts and makes a dated pre-import backup before replacing a profile. IMPORT CSV/XLSX stages valid rows, applies reusable description-to-category rules, and warns about likely duplicates before anything is saved.
- **Themes** — dark (default) and light, device-level toggle in Settings; customizable highlight, income and expense colors used across UI *and* charts; all native dropdowns themed to match
- **Responsive layout** — navigation becomes a slide-out menu, accounts abbreviate early, and months stay on one line (full names → JAN/FEB → numbers). Monetary labels use compact values such as 70k in tight spaces, with exact amounts available on hover; entry fields and stored amounts stay exact. Budget text keeps its normal size and percentages stay centered. Forecast uses the Overview chart style, and hidden charts leave no empty panel.
- **Math in amount fields** — type `50+20*3`, `(2+3)*4` or `12,5` anywhere an amount is accepted
- **Profiles** — isolated data sets (default + named profiles) stored as separate files, per-profile page visibility
- **Command palette** — `/` or `Ctrl-K`: search transactions, pages, quick commands (`t 500 cash bank`, `pay electricity`, `bg groceries 20000`, `csv`, …)

## What's new in 0.9.2 (local release candidate)

- Reconciliation controls are parked on the local `local/reconciliation-parked-20260926` branch; existing reconciliation fields remain in profile JSON for compatibility.
- JSON restore previews its contents and saves the previous profile under `profiles/BACKUPS/profile-<name>/` before replacement.
- Chart.js, the Hack font, and SheetJS spreadsheet import are bundled locally for offline use. SheetJS is vendored from its official 0.20.3 standalone build.
- Budget allocation plans distribute a monthly total by category percentages and carry forward until changed.
- New invoice file links remember a local file handle without copying its bytes. Existing stored attachments still open; a moved file or changed browser origin may need re-linking. New links require a Chromium browser with File System Access support. PDFs and raster images preview; other file types download for safe opening.

## What's new in 0.9.1

- **Profile passwords** — optionally encrypt any profile at rest with AES-256-GCM (uses `node:crypto`). Lock the default profile or any named profile from Settings; the browser prompts for the password on every launch. Removing or changing a password requires the current password. A forgotten password cannot be recovered from an encrypted profile. Show/hide eye-toggle on all password fields.
- **Overview filter toggle** — the INCOME / EXPENSES chips on Overview have been replaced by a single TYPE toggle (TYPE → EXPENSES → INCOME cycle).
- **Budget graph chrome** — the budget page now matches Overview / Bills with an orange accent line, "SPEND BY CATEGORY" title bar, and the `overview-line-panel` class so all four chart pages look consistent. Filter chips sit between the orange line and the graph title. Over-100% category percentages turn red.
- **Default port 9999** — the server, launchers (`Black Book.exe`, `.sh`, `.command`), and preferred-port fallback list now default to `9999` instead of `3000`, to reduce collisions with other local tools.
- **Functions doc** — a comprehensive user-facing capabilities document (`functions.txt`) now lives in the repo root, covering every page, modal, keyboard shortcut, and command-palette command.

## What's new in 0.9.0

- **Automatic updates** — Black Book checks GitHub Releases for a newer version and shows a banner when one is available; one click downloads the build (SHA-256 verified), installs it without touching your `profiles/`, and restarts on the same port while your open tab reloads automatically. Settings → ABOUT & UPDATES shows the current version and lets you check for or apply updates manually.
- **Forecast** — a separate 30/60/90-day cash timeline and balance graph using current balances, unpaid scheduled bills, remaining card-installment slots, and optional recurring income/expenses; account filters, missing-rate warnings, and a red/green balance chart keep projections explicit.
- **Responsive layout** — navigation becomes a slide-out menu, accounts abbreviate early, and months stay on one line; monetary labels use compact values such as 70k in tight spaces while stored amounts stay exact.
- **Two-line bills amounts** — each bill shows both years' amounts, clicking the header toggles the chart view, and forecast warnings surface above the grid.
- **Safer local storage** — profile saves are atomic and preserve the previous version as a `.bak` recovery copy; invalid or corrupted data is reported without being overwritten.
- **Local-only server** — Black Book listens only on this computer, and its stop script no longer terminates unrelated Node programs.
- **Reliable amount entry** — normal values, decimal commas, and math expressions such as `50+20*3` work again under the app's security safeguards.
- **Searchable categories** — type in any category field to filter choices, then press Enter or click a result to select it.

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

Open http://localhost:9999 — or just run the launcher that matches your OS:
- **Windows** — `Black Book.exe` starts the server hidden and opens your browser; `Stop Black Book.bat` shuts down that Black Book server only.
- **Linux** — double-click `Black Book.sh` (or run it from a terminal); `Stop Black Book.sh` stops it. The script needs `node` on the PATH.
- **macOS** — double-click `Black Book.command` opens it in Terminal; `Stop Black Book.command` stops it. The script needs `node` on the PATH.

## Data & privacy

All data lives in `profiles/*.json` next to `server.js` (`profiles/data.json` = default profile). This folder is **gitignored** — code backups never contain your finances. Each successful save first retains the immediately previous file as `.bak`; JSON import also creates a dated copy under `profiles/BACKUPS/profile-<name>/`. For portable profile data use Settings → EXPORT JSON / EXPORT CSV. New invoice links store only a browser-scoped handle, not file bytes; the linked file is not included in a JSON export. Older browser-stored attachments remain readable and are likewise not included, unless a legacy profile already contains inline `fileData`.

## Local-only operation

Black Book binds to `127.0.0.1`, so it is available only on this computer. It deliberately has no network hosting or login mode.

## Verification

```bash
npm run check
npm test
```

The tests use temporary fixture profiles and do not access your `profiles/` directory.

## Updates & releases

The app self-updates from GitHub Releases. It looks for `black-book-vX.Y.Z-{win,linux,mac}.zip` assets plus a `checksums.sha256` asset, verifies the download before replacing code, and never touches `profiles/`, `import/`, `node_modules/`, or your data files. Release archives use an explicit runtime-file allowlist, so unexpected local files are not packaged.

To publish a release from a checkout of this repo:

```bash
npm run release -- -Version 0.9.2   # builds dist\0.9.2\*.zip + checksums
gh release create v0.9.2 --title "v0.9.2" --notes "<changelog>" dist\0.9.2\black-book-v0.9.2-win.zip dist\0.9.2\black-book-v0.9.2-linux.zip dist\0.9.2\black-book-v0.9.2-mac.zip dist\0.9.2\checksums.sha256
```

Windows users keep using `Black Book.exe`; Linux/macOS users keep using `Black Book.sh` / `Black Book.command`. Updates ship each platform's launcher and re-apply the executable bit automatically. Applied updates keep the previous code under `updates/backup-<version>/` for rollback.

## Capabilities

Every user-facing feature — pages, modals, buttons, keyboard shortcuts, command-palette commands, and Settings — is documented in [`functions.txt`](functions.txt) in the repo root. It is maintained alongside the code whenever behavior changes.

---

**BLACK BOOK v0.9.2**

Created by Nikola Nešić
