# AGENTS.md

## Project: Black Book

A personal finance tracker running as a local Node.js server + single-page app.

**Language:** English. Always communicate in English.

## Maintenance Rules

- `functions.txt` is a living user-facing capabilities document. It must be updated whenever:
  - A new user-facing feature is added or removed
  - A page's UI behavior changes (new buttons, toggles, modals, keyboard shortcuts)
  - The command palette gains or loses a command
  - A new page is added or an existing page is shown/hidden
  - The settings page gains or loses a section
  - Any behavior described in the file changes meaning

  Always read `functions.txt` at the start of a session if you may be
  changing user-facing behavior, and update it in the same change as the code.

## Technical Notes

- Front-end: vanilla JS, Chart.js, no build step. Single `public/index.html` with
  modals; pages split across `public/js/page-*.js`.
- State: `this.data` object, JSON-serialized per profile to `profiles/<name>.json`.
  The browser auto-migrates missing arrays on load.
- Pages: overview, bills, budget, cards, savings, debts, invoices, forecast, settings.
- All data is cross-linked: transactions reference bills/invoices/debts/savings/installments;
  deletions must maintain consistency.
