# BLACK BOOK

A local-first personal finance console. Terminal aesthetic with light/dark themes, fully keyboard-driven, single Node.js server with flat-file storage — no cloud, no accounts, your data stays on your machine.

## Features

- **Accounts** — cash/bank accounts, multiple currencies (RSD base + EUR/USD/XAU auto-fetched rates with manual override), auto-assigned colors; the account form shows card terms only for credit cards and foreign fee only for non-base currencies
- **Transactions** — quick-entry popup (`A`) with a remembered +/− income/expense button (an explicitly typed sign overrides it), transfers between accounts (`T`), click a row to bulk-select, bulk edit/delete/merge, date scroll-wheel stepping
- **Budgets** — per-category monthly limits or a whole-budget allocation from a chosen month onward; a compact donut sits beside the spending graph, while a modal edits category shares and the allocation total, with a Reset Plan action for 100% unassigned funds
- **Bills** — yearly payment grid (sticky header, zebra rows, per-bill TOTAL) with pay-from-any-account/card, custom amounts per month (right-click a cell), AUTO mode marks the current month paid automatically and creates linked transactions, year selector + TODAY navigation, `H` toggles the graph; narrow cells use compact amounts and currency symbols
- **Savings goals** — target tracking, deposit/withdraw history, progress bars, command-palette deposits (`dep goal 500`)
- **Credit cards** — installment plans with interest baked into the debt (100 @ 5% = 105; first installment carries the interest), partial payments that accumulate toward each slot, amount-weighted progress markers, edit plans, advance credit
- **Debts / Invoices** — OWED · I OWE and INCOMES · EXPENSES · ALL filters inline with the period controls; debts carry a category; invoices support line items and links to existing local files (openable from the card)
- **Overview** — metric panels, category breakdown bar, end-of-month balance, and category cards that support Shift-click multi-selection; month filters drive both the income-vs-expenses graph and transaction list. `H` hides the graph, and the income/expense donut has a clickable center percentage.
- **Forecast** — a separate 30/60/90-day cash timeline and balance graph using current balances, unpaid scheduled bills, remaining card-installment slots, and optional recurring income/expenses; colored account chips and missing-rate warnings keep projections explicit. Unpaid invoices and open personal debts remain on their own pages rather than entering the projection.
- **Attention bar** — the header shows up to three highest-priority items (urgent first, then nearest date), with a `+N MORE` summary and a per-profile hide option.
- **Categories** — picker everywhere (transactions, debts, invoices, purchases), auto-created during import, palette of theme-aware colors; archive a category from a chosen date without hiding its earlier transactions
- **Import / Export** — Settings → Data contains exports, imports, and Import Rules together. IMPORT JSON previews counts and makes a dated pre-import backup before replacing a profile. IMPORT CSV/XLSX stages valid rows, applies reusable description-to-category rules, and warns about likely duplicates before anything is saved.
- **Themes** — dark (default) and light, device-level toggle in Settings; customizable highlight, income and expense colors used across UI *and* charts; all native dropdowns themed to match
- **Chart details** — graph values use floating tooltips above the hovered point or slice, clamped to the screen so they stay readable instead of being clipped by panels. Charts redraw without a delayed blank or entrance animation when data changes.
- **Exchange rates** — one row per currency, with compact action icons on narrow screens instead of wrapped controls or sideways scrolling.
- **Responsive layout** — navigation becomes a slide-out menu, accounts abbreviate early, and months stay on one line (full names → JAN/FEB → numbers). Monetary labels use compact values such as 70k in tight spaces, with exact amounts available on hover; entry fields and stored amounts stay exact. Budget text keeps its normal size and percentages stay centered. Forecast uses the Overview chart style, and hidden charts leave no empty panel.
- **Math in amount fields** — type chained expressions such as `100-5*2-10`, `(2+3)*4`, or `10,5-2,5` anywhere an amount is accepted
- **Profiles** — isolated data sets (default + named profiles) stored as separate files; edit the active profile's name and base currency together, or open another profile to edit it; per-profile page visibility
- **Command palette** — `/` or `Ctrl-K`: search transactions, pages, quick commands (`t 500 cash bank`, `pay electricity`, `bg groceries 20000`, `csv`, …)

## What's new in 0.9.5

- **Session undo and redo** — Ctrl+Z and Ctrl+Shift+Z reverse or restore recent transaction, transfer, bill, card, debt, savings, and invoice changes. History is temporary, limited to 100 recent changes, and clears when the session ends; the bottom shortcut bar reflects the current page and selection.
- **Credit card installments** — partial payments accumulate against the selected installment and display the paid amount out of its due amount. A slot is marked paid when its full amount is covered, and the progress markers follow each installment's actual share of the total.
- **Linked payment history** — bill, installment, savings, debt, and invoice payment records link to their exact transactions. Deleting a linked transaction updates its payment record and remaining balance.
- **Dates and graphs** — choose a day-first date format in Settings, including abbreviated month names; transaction dates remain on one line. Expenses plot below zero on the Overview graph, and selected-only charts reflect the selected transactions.
- **Responsive account filters** — the selected account tile uses less padding and width on narrow layouts while retaining its full label.

## What's new in 0.9.3

- **Overview filtering and transactions** — Shift-click category cards to show several categories together, including transfers; normal click isolates one, and removing the final selection restores ALL. The selected month now shows its end-of-month balance. E/Delete act on selected transactions first, otherwise on the hovered row; merge completion appears in the top bar.
- **Budgets and categories** — edit allocation shares in a roomier modal with a live donut and Reset Plan; unassigned funds remain visible. Category archiving takes effect from its archive date while older transactions and earlier months remain accessible. Budget and Bills total graph lines start hidden.
- **Invoices** — save reusable invoice templates, record a paid date separately from issue date, and date the linked transaction to the actual payment. Local file links open in the computer's default app without storing file contents in the profile.
- **UI and reliability** — chart tooltips float above data points without being clipped, graphs no longer flash on redraw, forecast account controls and compact bill amounts fit narrow screens, and the startup update notice appears in the top-center header. Amount expressions now handle multiple comma decimals.
- **Bills** — manual and automatic payments now match existing expenses in the correct month, using the paid amount; ambiguous matches remain separate, and linking never rewrites a transaction's amount.

## What's new in 0.9.2 (local release candidate)

- Reconciliation controls are parked on the local `local/reconciliation-parked-20260926` branch; existing reconciliation fields remain in profile JSON for compatibility.
- JSON restore previews its contents and saves the previous profile under `profiles/BACKUPS/profile-<name>/` before replacement.
- Chart.js, the Hack font, and SheetJS spreadsheet import are bundled locally for offline use. SheetJS is vendored from its official 0.20.3 standalone build.
- Budget allocation plans distribute a monthly total by category percentages and carry forward until changed.
- Link an invoice with the computer's native file picker. Black Book stores only the original file path and name; its INVOICE button opens that file in the system's default app. The file is never copied into Black Book, and Firefox works because file selection and opening are handled by the local app.

## What's new in 0.9.1

- **Profile passwords** — optionally encrypt any profile at rest with AES-256-GCM (uses `node:crypto`). Lock the default profile or any named profile from Settings; the browser prompts for the password on every launch. Removing or changing a password requires the current password. A forgotten password cannot be recovered from an encrypted profile. Show/hide eye-toggle on all password fields.
- **Overview filter toggle** — the INCOME / EXPENSES chips on Overview have been replaced by a single TYPE toggle (TYPE → EXPENSES → INCOME cycle).
- **Budget graph chrome** — the budget page now matches Overview / Bills with an orange accent line, "SPEND BY CATEGORY" title bar, and the `overview-line-panel` class so all four chart pages look consistent. Filter chips sit between the orange line and the graph title. Over-100% category percentages turn red.
- **Default port 9597** — the server and launchers use `9597` first, then `9999` as the secondary port before trying the remaining fallback ports.
- **Functions doc** — a comprehensive user-facing capabilities document (`functions.txt`) now lives in the repo root, covering every page, modal, keyboard shortcut, and command-palette command.

## What's new in 0.9.0

- **Automatic updates** — Black Book checks GitHub Releases on each launch and shows an “UPDATE AVAILABLE · vX.Y.Z” card in the top-center header when one is available; clicking it opens Settings → ABOUT & UPDATES, where one click downloads the build (SHA-256 verified), installs it without touching your `profiles/`, and restarts on the same port while your open tab reloads automatically. The header card can be dismissed for the current run; manual checking remains in Settings.
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
| `E` | Edit selected transactions, or the hovered transaction when none are selected |
| `Delete` | Delete selected transactions, or the hovered transaction when none are selected |
| `Ctrl+Z` | Undo the latest supported financial change (session only) |
| `Ctrl+Shift+Z` | Redo the latest undone change (session only) |
| `H` | Show/hide graph (Overview, Bills, Budget, Forecast) |
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

Open http://localhost:9597 (or `http://localhost:9999` if the primary port is busy) — or just run the launcher that matches your OS:
- **Windows** — `Black Book.exe` starts the server hidden and opens your browser; `Stop Black Book.bat` shuts down that Black Book server only.
- **Linux** — double-click `Black Book.sh` (or run it from a terminal); `Stop Black Book.sh` stops it. The script needs `node` on the PATH.
- **macOS** — double-click `Black Book.command` opens it in Terminal; `Stop Black Book.command` stops it. The script needs `node` on the PATH.

## Data & privacy

All data lives in `profiles/*.json` next to `server.js` (`profiles/data.json` = default profile). This folder is **gitignored** — code backups never contain your finances. Each successful save first retains the immediately previous file as `.bak`; JSON import also creates a dated copy under `profiles/BACKUPS/profile-<name>/`. For portable profile data use Settings → EXPORT JSON / EXPORT CSV. Invoice links store only a local file path and name; invoice files are not copied into Black Book or included in a JSON export. Older browser-stored attachments remain readable and are likewise not included, unless a legacy profile already contains inline `fileData`.

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
npm run release -- -Version 0.9.5   # builds dist\0.9.5\*.zip + checksums
gh release create v0.9.5 --title "v0.9.5" --notes "<changelog>" dist\0.9.5\black-book-v0.9.5-win.zip dist\0.9.5\black-book-v0.9.5-linux.zip dist\0.9.5\black-book-v0.9.5-mac.zip dist\0.9.5\checksums.sha256
```

Windows users keep using `Black Book.exe`; Linux/macOS users keep using `Black Book.sh` / `Black Book.command`. Updates ship each platform's launcher and re-apply the executable bit automatically. Applied updates keep the previous code under `updates/backup-<version>/` for rollback.

## Capabilities

Every user-facing feature — pages, modals, buttons, keyboard shortcuts, command-palette commands, and Settings — is documented in [`functions.txt`](functions.txt) in the repo root. It is maintained alongside the code whenever behavior changes.

---

**BLACK BOOK v0.9.5**

Created by Nikola Nešić
