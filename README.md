# BLACK BOOK

A local-first personal finance console. Terminal aesthetic with light/dark themes, fully keyboard-driven, single Node.js server with flat-file storage — no cloud, no accounts, your data stays on your machine.

## Features

- **Accounts** — cash/bank accounts, multiple currencies (RSD base + EUR/USD/XAU auto-fetched rates)
- **Transactions** — quick-entry popup (`A`), transfers between accounts (`T`), income vs expense sign convention (`+` prefix = income), click a row to select it for bulk edit/delete
- **Budgets** — per-category monthly limits (optionally renamed), progress bars, % used · left shown inline, SET/EDIT per row
- **Bills** — yearly payment grid (zebra rows, vertical separators) with per-bill TOTAL column, pay from any account or card, custom amounts per month (right-click a cell), AUTO mode marks the current month paid automatically and creates linked transactions — deleting one deactivates the bill, year selector + TODAY navigation, `H` toggles the graph
- **Savings goals** — target tracking, deposit/withdraw history, progress bars, command-palette deposits (`dep goal 500`)
- **Credit cards** — installment plans with interest baked into the debt (100 @ 5% = 105; first installment carries the interest), PAY/PAID slots, greedy custom payments, advance credit
- **Debts / Invoices** — OWED · I OWE and INCOMES · EXPENSES · ALL filters inline with the period controls
- **Overview** — metric panels, category breakdown bar, month filters that drive both the income-vs-expenses graph and the transaction list, `H` hides the graph
- **Themes** — dark (default) and light, device-level toggle in Settings; customizable highlight, income and expense colors used across UI *and* charts
- **Math in amount fields** — type `50+20*3`, `(2+3)*4` or `12,5` anywhere an amount is accepted
- **Profiles** — isolated data sets (default + named profiles) stored as separate files, per-profile page visibility
- **Command palette** — `/` or `Ctrl-K`: search transactions, pages, quick commands (`t 500 cash bank`, `pay electricity`, `bg groceries 20000`, `csv`, …)

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
| `/` | Command palette |

## Run

```bash
npm install
node server.js
```

Open http://localhost:3000 — or just run **Black Book.exe**, which starts the server hidden and opens your browser. `Stop Black Book.bat` shuts it down.

## Data & privacy

All data lives in `profiles/*.json` next to `server.js` (`profiles/data.json` = default profile). This folder is **gitignored** — code backups never contain your finances. For data backups use Settings → EXPORT JSON / EXPORT CSV.

## Hosting notes

Any Node-capable machine can host it: clone, `npm install`, `node server.js`, expose port 3000. There is no built-in authentication — if you expose it beyond localhost, put it behind a reverse proxy/Tailscale/Cloudflare Tunnel.

---

**BLACK BOOK v0.5.1**

Created by Nikola Nešić
