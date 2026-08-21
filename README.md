# BLACK BOOK

A local-first personal finance console. Flat-black terminal aesthetic, fully keyboard-driven, single Node.js server with flat-file storage — no cloud, no accounts, your data stays on your machine.

## Features

- **Accounts** — cash/bank accounts, multiple currencies (RSD base + EUR/USD/CHF/XAU auto-fetched rates)
- **Transactions** — quick-entry popup (`A`), transfers between accounts (`T`), income vs expense sign convention (`+` prefix = income)
- **Budgets** — per-category monthly limits with progress bars and over-budget %
- **Bills** — yearly payment grid, autopay toggle, custom amounts per month (right-click a cell), monthly total strip
- **Savings goals** — target tracking, deposit/withdraw history, full-width progress bar
- **Credit cards** — dedicated page, installment plans with first-installment interest (configurable % per card), PAY/PAID slots, custom payments that fill installments greedily, advance credit
- **Profiles** — isolated data sets (default + named profiles) stored as separate files
- **Command palette** — `/` or `Ctrl-K`: search transactions, pages, quick commands (`t 500 cash bank`, `pay electricity`, `bg groceries 20000`, `csv`, `demo`, …)
- **Demo data generator** — realistic sample year for trying things out

## Keyboard

| Key | Action |
|---|---|
| `A` | New transaction |
| `T` | Transfer |
| `D` | Jump to today |
| `E` | Edit hovered transaction |
| `←` / `→` | Previous / next month (year on Savings) |
| `1–6` | Switch pages |
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
