import test from 'node:test';
import assert from 'node:assert/strict';

await import('../public/js/category-availability.js');
const { archivedOn, availableOn, visibleInMonth, archivePeriods, restorePeriods } = globalThis.CategoryAvailability;

test('legacy categories remain available', () => {
  assert.equal(availableOn({ id: 'a' }, '2026-09-01'), true);
  assert.equal(visibleInMonth({ id: 'a' }, '2026-09'), true);
});

test('archive starts on its date and hides fully archived months', () => {
  const category = { id: 'a', archivedPeriods: [{ from: '2026-09-15', to: null }] };
  assert.equal(availableOn(category, '2026-09-14'), true);
  assert.equal(availableOn(category, '2026-09-15'), false);
  assert.equal(visibleInMonth(category, '2026-08'), true);
  assert.equal(visibleInMonth(category, '2026-09'), true);
  assert.equal(visibleInMonth(category, '2026-10'), false);
});

test('restoration retains the archived gap and permits the restore date', () => {
  const category = { id: 'a', archivedPeriods: archivePeriods({ id: 'a' }, '2026-09-01') };
  category.archivedPeriods = restorePeriods(category, '2026-11-10');
  assert.equal(archivedOn(category, '2026-10-20'), true);
  assert.equal(availableOn(category, '2026-11-10'), true);
  assert.equal(visibleInMonth(category, '2026-09'), false);
  assert.equal(visibleInMonth(category, '2026-11'), true);
});

test('same-day restore creates no visible archive gap', () => {
  const category = { id: 'a', archivedPeriods: [{ from: '2026-09-01', to: null }] };
  category.archivedPeriods = restorePeriods(category, '2026-09-01');
  assert.equal(availableOn(category, '2026-09-01'), true);
});
