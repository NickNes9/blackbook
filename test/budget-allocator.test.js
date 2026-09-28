import test from 'node:test';
import assert from 'node:assert/strict';

await import('../public/js/budget-allocator.js');
const { round2, shareTotals, effectiveAllocation, monthlyView } = globalThis.BudgetAllocator;

test('effectiveAllocation returns null when no allocation exists', () => {
  assert.equal(effectiveAllocation([], '2026-04'), null);
  assert.equal(effectiveAllocation(null, '2026-04'), null);
});

test('effectiveAllocation is null before the first allocation month', () => {
  const allocations = [{ month: '2026-03', amount: 1000, percents: {} }];
  assert.equal(effectiveAllocation(allocations, '2026-02'), null);
});

test('effectiveAllocation picks the exact month match', () => {
  const allocations = [
    { month: '2026-02', amount: 900, percents: {} },
    { month: '2026-03', amount: 1200, percents: {} }
  ];
  assert.equal(effectiveAllocation(allocations, '2026-03').amount, 1200);
});

test('effectiveAllocation carries the latest allocation forward to later months', () => {
  const allocations = [
    { month: '2026-02', amount: 900, percents: {} },
    { month: '2026-03', amount: 1200, percents: {} }
  ];
  assert.equal(effectiveAllocation(allocations, '2026-04').amount, 1200);
  assert.equal(effectiveAllocation(allocations, '2026-12').amount, 1200);
  assert.equal(effectiveAllocation(allocations, '2027-01').amount, 1200);
});

test('effectiveAllocation does not pick a future allocation', () => {
  const allocations = [{ month: '2026-04', amount: 500, percents: {} }];
  assert.equal(effectiveAllocation(allocations, '2026-03'), null);
});

test('a zero allocation ends a carried-forward plan without deleting its history', () => {
  const allocations = [
    { month: '2026-02', amount: 900, percents: { a: 100 } },
    { month: '2026-04', amount: 0, percents: {} }
  ];
  assert.equal(monthlyView([], allocations, '2026-03').limits.a, 900);
  assert.deepEqual(monthlyView([], allocations, '2026-04').limits, {});
  assert.deepEqual(monthlyView([], allocations, '2026-06').limits, {});
});

test('monthlyView without allocation mirrors base budgets', () => {
  const budgets = [{ categoryId: 'rent', amount: 300 }];
  const view = monthlyView(budgets, [], '2026-02');
  assert.equal(view.allocation, null);
  assert.deepEqual(view.limits, { rent: 300 });
  assert.equal(view.total, 300);
  assert.equal(view.slices.length, 0);
  assert.equal(view.leftover, null);
});

test('monthlyView ignores removed categories in individual limits when a roster is supplied', () => {
  const view = monthlyView([{ categoryId: 'a', amount: 100 }, { categoryId: 'removed', amount: 500 }], [], '2026-01', ['a']);
  assert.deepEqual(view.limits, { a: 100 });
  assert.equal(view.total, 100);
});

test('monthlyView allocates percentages and leaves the rest unassigned', () => {
  const budgets = [{ categoryId: 'rent', amount: 300 }];
  const allocations = [{ month: '2026-03', amount: 1000, percents: { groceries: 25, rent: 20, car: 15 } }];
  const view = monthlyView(budgets, allocations, '2026-04');
  assert.equal(view.allocation.amount, 1000);
  assert.equal(view.slices.length, 3);
  const rentSlice = view.slices.find(s => s.categoryId === 'rent');
  assert.equal(rentSlice.percent, 20);
  assert.equal(rentSlice.value, 200);
  assert.deepEqual(view.limits, { groceries: 250, rent: 200, car: 150 });
  assert.equal(view.total, 1000);
  assert.deepEqual(view.leftover, { percent: 40, value: 400 });
});

test('monthlyView rounds fractional percentage values', () => {
  const allocations = [{ month: '2026-01', amount: 100, percents: { a: 16.667, b: 33.333 } }];
  const view = monthlyView([], allocations, '2026-01');
  assert.equal(view.limits.a, 16.67);
  assert.equal(view.limits.b, 33.33);
  assert.equal(view.total, 100);
  assert.deepEqual(view.leftover, { percent: 50, value: 50 });
});

test('monthlyView caps legacy over-allocation at the plan total', () => {
  const allocations = [{ month: '2026-01', amount: 1000, percents: { a: 60, b: 50 } }];
  const view = monthlyView([], allocations, '2026-01');
  assert.equal(view.leftover, null);
  assert.equal(view.limits.a, 600);
  assert.equal(view.limits.b, 400);
  assert.equal(view.total, 1000);
});

test('monthlyView pauses individual limits while an allocation is active', () => {
  const budgets = [{ categoryId: 'b', amount: 120 }];
  const allocations = [{ month: '2026-01', amount: 1000, percents: { a: 50, b: 0 } }];
  const view = monthlyView(budgets, allocations, '2026-01');
  assert.equal(view.slices.length, 1);
  assert.equal(view.slices[0].categoryId, 'a');
  assert.equal(view.limits.b, undefined);
  assert.equal(view.total, 1000);
  assert.deepEqual(view.leftover, { percent: 50, value: 500 });
});

function activeOf(map) {
  return Object.keys(map).map(id => ({ categoryId: id, pct: map[id] }));
}

function toMap(active) {
  const m = {};
  for (const o of active) m[o.categoryId] = o.pct;
  return m;
}

test('activeFromPercents keeps only present categories with a positive share', () => {
  const { activeFromPercents } = globalThis.BudgetAllocator;
  const percents = { a: 60, b: 0, c: 20, ghost: 30 };
  assert.deepEqual(activeFromPercents(percents, ['a', 'b', 'c']), [
    { categoryId: 'a', pct: 60 },
    { categoryId: 'c', pct: 20 }
  ]);
  assert.deepEqual(activeFromPercents(null, ['a']), []);
});

test('activeFromPercents keeps all categories when no roster is given', () => {
  const { activeFromPercents } = globalThis.BudgetAllocator;
  assert.deepEqual(activeFromPercents({ x: 40, y: 30 }, null), [
    { categoryId: 'x', pct: 40 },
    { categoryId: 'y', pct: 30 }
  ]);
});

test('shareTotals reports used and unassigned percentages', () => {
  const { shareTotals } = globalThis.BudgetAllocator;
  assert.deepEqual(shareTotals([{ categoryId: 'a', pct: 30 }, { categoryId: 'b', pct: 20 }]), { used: 50, unassigned: 50 });
  assert.deepEqual(shareTotals([{ categoryId: 'a', pct: 70 }, { categoryId: 'b', pct: 60 }]), { used: 130, unassigned: 0 });
  assert.deepEqual(shareTotals([]), { used: 0, unassigned: 100 });
});

test('setShare grows a slice into the unassigned space', () => {
  const { setShare } = globalThis.BudgetAllocator;
  const out = setShare(activeOf({ a: 20, b: 20 }), 0, 50);
  assert.deepEqual(toMap(out), { a: 50, b: 20 });
  assert.equal(shareTotals(out).unassigned, 30);
});

test('setShare shrinking returns the difference to unassigned', () => {
  const { setShare } = globalThis.BudgetAllocator;
  const out = setShare(activeOf({ a: 40, b: 30 }), 0, 10);
  assert.deepEqual(toMap(out), { a: 10, b: 30 });
  assert.equal(shareTotals(out).unassigned, 60);
});

test('setShare growth beyond the unassigned space steals proportionally from other slices', () => {
  const { setShare } = globalThis.BudgetAllocator;
  const out = setShare(activeOf({ a: 30, b: 30, c: 30 }), 0, 60);
  const map = toMap(out);
  assert.equal(map.a, 60);
  assert.equal(round2(map.b + map.c), 40);
  assert.equal(shareTotals(out).unassigned, 0);
});

test('setShare caps a single slice at 100', () => {
  const { setShare } = globalThis.BudgetAllocator;
  const out = setShare(activeOf({ a: 10 }), 0, 250);
  assert.deepEqual(toMap(out), { a: 100 });
});

test('editing an amount preserves cent-level accuracy for a large total', () => {
  const { setShareFromAmount } = globalThis.BudgetAllocator;
  const active = setShareFromAmount(activeOf({ rent: 20, food: 30 }), 0, 25000, 120000);
  assert.equal(round2(120000 * active[0].pct / 100), 25000);
  assert.equal(round2(active[1].pct), 30);
});

test('toggleActive adds the first category at 100', () => {
  const { toggleActive } = globalThis.BudgetAllocator;
  const out = toggleActive([], 'a');
  assert.deepEqual(toMap(out), { a: 100 });
});

test('toggleActive preserves existing shares and assigns available space', () => {
  const { toggleActive } = globalThis.BudgetAllocator;
  const out = toggleActive(activeOf({ a: 50, b: 40 }), 'c');
  assert.deepEqual(toMap(out), { a: 50, b: 40, c: 10 });
  assert.equal(shareTotals(out).used, 100);
});

test('toggleActive leaves existing shares intact when no space is available', () => {
  const { toggleActive } = globalThis.BudgetAllocator;
  assert.deepEqual(toMap(toggleActive(activeOf({ a: 50, b: 50 }), 'c')), { a: 50, b: 50, c: 0 });
});

test('toggleActive removes an already-active category', () => {
  const { toggleActive } = globalThis.BudgetAllocator;
  const out = toggleActive(activeOf({ a: 50, b: 50 }), 'a');
  assert.deepEqual(toMap(out), { b: 50 });
});

test('toggleActive prefers the suggested share over an equal split', () => {
  const { toggleActive } = globalThis.BudgetAllocator;
  const out = toggleActive([{ categoryId: 'a', pct: 40 }], 'b', 60);
  assert.deepEqual(toMap(out), { a: 40, b: 60 });
  assert.equal(shareTotals(out).used, 100);
});

test('toPercents flattens active slices into a percentages map', () => {
  const { toPercents } = globalThis.BudgetAllocator;
  assert.deepEqual(toPercents([{ categoryId: 'a', pct: 33.33 }, { categoryId: 'b', pct: 66.67 }]), { a: 33.33, b: 66.67 });
});

test('planFromSuggested builds a total and percents from per-category costs', () => {
  const { planFromSuggested } = globalThis.BudgetAllocator;
  const plan = planFromSuggested({ rent: 600, groceries: 300, fun: 100 });
  assert.equal(plan.total, 1000);
  assert.deepEqual(plan.percents, { rent: 60, groceries: 30, fun: 10 });
});

test('planFromSuggested returns nothing without costs', () => {
  const { planFromSuggested } = globalThis.BudgetAllocator;
  assert.deepEqual(planFromSuggested({}), { total: 0, percents: {} });
});

test('monthlyView drops shares for categories not in the roster when categoryIds are given', () => {
  const allocations = [{ month: '2026-01', amount: 1000, percents: { a: 50, ghost: 50 } }];
  const view = monthlyView([], allocations, '2026-01', ['a']);
  assert.equal(view.slices.length, 1);
  assert.equal(view.slices[0].categoryId, 'a');
  assert.equal(view.limits.ghost, undefined);
  assert.deepEqual(view.leftover, { percent: 50, value: 500 });
});

test('a carried allocation share for a fully archived category becomes unassigned', () => {
  const view = monthlyView([], [{ month: '2026-08', amount: 1000, percents: { active: 60, archived: 40 } }], '2026-10', ['active']);
  assert.equal(view.total, 1000);
  assert.deepEqual(view.limits, { active: 600 });
  assert.equal(view.leftover.value, 400);
});

test('a fully unassigned saved plan keeps its total and pauses individual limits', () => {
  const view = monthlyView([{ categoryId: 'food', amount: 500 }],
    [{ month: '2026-09', amount: 1200, percents: {} }], '2026-10', ['food']);
  assert.equal(view.total, 1200);
  assert.deepEqual(view.limits, {});
  assert.deepEqual(view.leftover, { percent: 100, value: 1200 });
});
