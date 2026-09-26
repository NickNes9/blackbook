# Budget, Overview, Forecast, and category archive design

## Scope

Polish the existing local-first finance UI without changing or discarding profile history. Preserve the uncommitted Budget allocation implementation as the starting point. No release, version bump, packaging, or push is part of this change.

## Date-aware category archive

Settings Categories gets ARCHIVE / RESTORE actions. A category stores optional `archivedPeriods` entries `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" | null }`, with `to` exclusive. Old profiles without this field remain fully active. Archiving starts today; restoring closes the open period today. Protected system categories cannot be archived. Archive is never deletion.

One shared category-availability helper answers whether a category is selectable on a transaction date and whether it overlaps a viewed month. New-entry category pickers, Budget cards/chips/allocation options, bill category choices, defaults, and import-rule matching use this helper. A category archived on September 1 is absent from September and later Budget months. If archived September 15, it remains on the September monthly view because it was active earlier that month, but is absent from a fully archived October. Restoring retains the historical gap. A new transaction dated inside an archived period cannot select it; editing an existing transaction retains its category even if that category is now archived.

Historical transactions and category names are never removed from searches, transaction lists, reports, or exported data. Existing archived-category transactions remain visible even if their dates fall within an archived period. A future allocation share or individual limit for a fully archived month does not show a Budget card or count toward the visible individual-limit total; a carried plan's archived share becomes unassigned. An import rule targeting a category unavailable on the imported row's date must not silently assign that category; fall back to the existing uncategorized/manual-review path. Defaults pointing to an unavailable category fall back to an available one without deleting the saved default ID.

## Budget presentation and allocation

The TOTAL series in the spending graph starts off by default; its chip remains available. Keep this as a view default, not a profile-data change. The donut uses only its needed width (approximately 180–220 px at desktop sizes); the spending line graph takes the remaining row width. On narrow screens, stack them. Remove the donut's center amount and mode text, including “INDIVIDUAL LIMITS”; tooltips provide exact category amount and share. Empty state is a neutral ring with an accessible label.

Move ALLOCATE to the right end of the Budget summary row. Match the Overview filter controls' button height. ALLOCATE opens one wider, viewport-bounded modal; it does not stretch the Budget page. Its content scrolls internally when necessary. Use legible category cards with color, name, amount, percentage, and ADD/REMOVE. Keep the live donut preview and unassigned slice within the modal, not the page. Preserve the approved semantics: an active plan replaces individual limits in the monthly total, while individual limits remain stored and can be restored with “Use Individual Limits.” Confirmation must appear above the modal. Save/cancel maintain draft isolation, and amounts must retain cent accuracy.

## Overview donut

Add a compact two-slice income/expenses donut beside the existing monthly line chart using the same chart styling as Budget. Its values are the selected month's income and absolute expenses in base currency, excluding transfers, consistent with the Overview summary. No redundant center total; hover shows exact value and percentage. Both charts obey the existing Overview graph hide control and responsive layout.

## Forecast fixes

An empty account selection is meaningful, not an alias for all accounts. Forecast account checkboxes can all be deselected and then selected again; with none selected, show a clear empty-selection message instead of silently restoring them. Keep the forecast engine's explicit all-accounts behavior for callers that omit the filter; pass an explicit empty list to mean none. Replace the two sequential recurring prompts with one modal containing item name and signed amount. Preserve the current default-account, monthly interval, and start-today behavior in this pass. Validate before saving.

## Browser theme signal

Set the root CSS `color-scheme` to `dark` or `light` in sync with the app's selected theme, including at startup. This informs native browser controls. Browser extensions may still override page styling; the app cannot guarantee extension behavior.

## Verification

Add focused tests for category visibility by date/month (including archive/restore gaps and legacy profiles), Forecast empty selection, allocator treatment of archived categories, and amount precision. Run syntax and full unit tests. Use a disposable profile to verify modal layering and scrolling, chart proportions and tooltips, Overview totals, zero/all Forecast selections, historical transaction search, and theme switching at desktop and narrow widths. Do not open or mutate real profile data.
