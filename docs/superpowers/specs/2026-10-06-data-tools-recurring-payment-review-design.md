# Data Tools: recurring payments and account repair

## Goal

Add a review workflow for likely recurring transactions and a repair action for transactions with a missing account reference. Keep all matching and repairs local to the active profile. Detection is advisory; no transaction is changed without an explicit user action.

## Entry point and layout

Keep the Settings > Data `CHECK DATA` action and open one Data Tools modal with two accessible tabs: `CHECK DATA` and `RECURRING PAYMENTS`. Check Data remains the initial tab. Both tabs rescan the active profile when opened. Recurring results are transient and are not saved as profile data.

## Recurring payment detection

Scan transactions and form candidate groups using normalized descriptions, transaction direction, payment source (account or card), currency, and dates. Normalize descriptions by lowercasing, trimming, collapsing spaces, and removing punctuation; allow close matches at a text-similarity score of at least 0.82. A candidate needs at least two occurrences and a plausible repeated cadence: weekly gaps of 5–9 days, monthly gaps of 24–38 days, or annual gaps of 330–400 days. Amount equality is not required: show the observed amount range and each occurrence so variable bills can still be recognized. Transfers and transactions already linked to structured records (bill, invoice, debt, savings, or card installment) are excluded from ordinary recurring-charge groups.

Each group explains the matching description, inferred cadence, account/card, date range, amounts, and category. The user can select occurrences and:

- open existing bulk edit for two or more selected transactions;
- open an individual transaction for inspection;
- create a bill from the group, prefilled from its description, inferred schedule, most recent amount/currency, likely due day, source, and common category. The standard bill editor remains open for review and explicit save. Source transactions are retained;
- merge only a manually selected set when the existing merge rules allow it. The UI warns that separate recurring charges are separate events and does not offer a merge action for an entire recurring group by default.

Ordinary card subscriptions are handled as bills paid from that card. The existing card-plan model represents one original purchase followed by payments; it does not represent several separate recurring card charges. Therefore, this increment does not automatically convert historical charge groups into installment plans. Explicit installment numbering can be surfaced as a review clue, but conversion awaits a dedicated mapping to the existing purchase-plus-payments model.

## Check Data account repair

The scanner includes the broken-reference field in each issue. For a transaction with a missing `accountId`, `fromAccountId`, or `toAccountId`, show which account field is missing and an account selector in that issue. For transfers, preserve the valid side, disallow choosing the same account for both sides, and replace only the missing side. Saving updates the existing transaction through the app's normal undoable save path, reruns the check, and refreshes the visible report so a resolved issue disappears. Other broken-reference types remain review-only in this increment.

## Safety and state

- No automatic edits, merges, bill creation, or profile-data migrations.
- A successful user-requested repair is one undoable transaction edit.
- Creating a bill never rewrites past transactions.
- Candidate groups are derived from the active profile at view time and discarded when the modal closes.
- Never access profile JSON outside the app's active in-memory data flow.

## Implementation areas

- `public/index.html`: accessible two-tab Data Tools modal structure.
- `public/js/data-health.js`: attach missing-field metadata and implement recurrence grouping as a pure scan over active data.
- `public/js/health-ui.js`: tabs, recurring result cards/actions, and account-reference repair UI.
- `public/js/page-bills.js`: prefill the existing bill editor from a reviewed recurring group.
- `public/js/core.js` / `public/js/page-transactions.js`: open selected occurrences in existing inspection and bulk-edit flows; persist account repairs through normal save/undo behavior.
- `functions.txt`: document the recurring review and explicit account repair controls.

## Acceptance criteria

1. Check Data opens the shared modal on the Check Data tab; both tabs can be switched, and returning to Check Data refreshes the report from current in-memory data.
2. At least two similar transactions on a regular cadence can be suggested even when their amounts differ; the group shows its members and amount range.
3. Opening an individual or bulk edit acts only on the selected group members.
4. Creating a bill prefills the existing bill form but does not save until the user confirms there.
5. A transfer with one missing account side can be repaired without changing the valid side; same-account transfers cannot be saved.
6. Successful repairs persist, are undoable, and remove the resolved warning from the refreshed report.
7. Repeated charges are never merged merely because they were detected as recurring; installment-like historical groups are not silently reshaped into a card plan.
