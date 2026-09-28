# Session-only financial undo

## Goal and scope

Ctrl+Z (Cmd+Z on macOS) reverses the most recent successful, user-initiated financial edit. It covers transactions and transfers (including bulk edit, merge, and delete), account and credit-card financial records, installments, bills and their payments, savings goals and movements, debts and payments, and invoices and their linked transactions. A linked action is one undo step: undoing a bill payment, for example, restores both its bill-payment record and its transaction.

Undo does not cover typing inside a field, settings, appearance, categories, budgets and allocation plans, imports, profile creation/renaming/deletion, password changes, automatic startup migration/autopay, exchange-rate refreshes, or software updates. These continue to use their existing behavior and recovery mechanisms. No redo is included in this first version.

## Interaction

The shortcut works when the app page has focus and no editable field or modal is active. Native text undo remains available in input, textarea, select, and contenteditable controls. A footer hint makes the shortcut discoverable. A short in-app top-bar notice confirms an undo or explains why no undo is available. The undo history belongs to the current profile only; switching profile or closing/reloading the window clears it.

## Data and memory model

After startup normalization has finished, retain a transient baseline of the last successfully saved financial state. Eligible action handlers explicitly opt in to undo; a settings save or background save cannot accidentally create a step. Each successful opted-in action produces an inverse delta for the financial collections: `accounts`, `transactions`, `bills`, `billPayments`, `savingsGoals`, `installments`, `debts`, and `invoices`. Records use their stable ID for matching; bill payments use bill ID plus month. Deltas store only inserted, removed, or changed records, with original indices where list order matters. When a save also changes non-financial state, that state is not part of the undo delta.

Keep at most 100 undo steps and a small encoded-size budget (5 MiB); evict oldest steps to satisfy either limit. Neither deltas nor their baseline are sent to the server or written to local storage. The full profile continues to be saved normally after each edit and after an undo.

## Save ordering and failure behavior

Capture the payload at each save call and serialize the writes so a slower earlier save cannot overwrite a later one. Register an undo step only after its save succeeds, and only for a relevant financial change initiated after startup. Undo waits for pending saves, applies the inverse delta to the current financial collections, then saves the restored profile without recording a new undo step. If that save fails, restore the pre-undo in-memory state, leave the step available, and show an error; never report success for an unsaved reversal. A failed ordinary save creates no undo step.

Profile changes clear the in-memory baseline and stack before loading another profile. The implementation must not copy the stack into JSON exports or profile backups.

## Verification

Add focused tests for create/edit/delete and bulk transaction actions; a linked bill payment and transfer; credit-card, debt, savings, and invoice changes; the 100-step and byte caps; field/modal shortcut exclusions; profile switching; failed saves; and overlapping save calls. Run the full repository test suite and verify the shortcut in a disposable browser profile without modifying Nick's historical data.
