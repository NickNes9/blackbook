(function (root) {
  'use strict';

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  const asNumber = (value) => Number(value) || 0;

  function effectiveAllocation(allocations, month) {
    if (!Array.isArray(allocations)) return null;
    const key = String(month || '');
    let found = null;
    for (const entry of allocations) {
      if (!entry || !entry.month) continue;
      const entryKey = String(entry.month);
      if (entryKey > key) continue;
      if (!found || entryKey > String(found.month)) found = entry;
    }
    return found;
  }

  function activeFromPercents(percents, categoryIds) {
    const roster = categoryIds ? new Set(categoryIds) : null;
    const out = [];
    for (const key of Object.keys(percents || {})) {
      if (roster && !roster.has(key)) continue;
      const value = round2(asNumber(percents[key]));
      if (!(value > 0)) continue;
      out.push({ categoryId: key, pct: value });
    }
    return out;
  }

  function shareTotals(active) {
    const used = round2((active || []).reduce((sum, o) => sum + asNumber(o.pct), 0));
    return { used: used, unassigned: round2(Math.max(0, 100 - used)) };
  }

  function equalSplit(n) {
    if (n <= 0) return [];
    const base = round2(100 / n);
    const vals = [];
    for (let i = 0; i < n; i++) vals.push(base);
    const diff = 100 - vals.reduce((a, b) => a + b, 0);
    if (diff !== 0) vals[vals.length - 1] = round2(vals[vals.length - 1] + diff);
    return vals;
  }

  function setShare(active, index, targetPct) {
    if (!active || !active[index]) return (active || []).slice();
    const cur = active[index].pct;
    const othersTotal = active.reduce((sum, o, i) => (i === index ? sum : sum + asNumber(o.pct)), 0);
    const target = Math.max(0, Math.min(100, round2(targetPct)));
    const maxNoSteal = round2(100 - othersTotal);
    if (target <= maxNoSteal || target <= cur) {
      return active.map((o, i) => (i === index ? { categoryId: o.categoryId, pct: target } : o));
    }
    const steal = target - maxNoSteal;
    if (othersTotal > 0) {
      const scale = (othersTotal - steal) / othersTotal;
      const scaled = [];
      for (let i = 0; i < active.length; i++) {
        if (i === index) continue;
        scaled.push([i, round2(asNumber(active[i].pct) * scale)]);
      }
      let scaledSum = scaled.reduce((s, x) => s + x[1], 0);
      const slack = 100 - target - scaledSum;
      if (slack > 0 && scaled.length) {
        scaled[scaled.length - 1][1] = round2(scaled[scaled.length - 1][1] + slack);
      }
      scaledSum = scaled.reduce((s, x) => s + x[1], 0);
      const map = new Map(scaled);
      return active.map((o, i) => (i === index
        ? { categoryId: o.categoryId, pct: target }
        : { categoryId: o.categoryId, pct: map.get(i) }));
    }
    return active.map((o, i) => (i === index ? { categoryId: o.categoryId, pct: target } : o));
  }

  function toggleActive(active, categoryId, suggestedPct) {
    const list = (active || []).slice();
    const existing = list.findIndex(o => o.categoryId === categoryId);
    if (existing >= 0) return list.filter(o => o.categoryId !== categoryId);
    if (suggestedPct != null && suggestedPct > 0) {
      const added = list.concat([{ categoryId: categoryId, pct: round2(suggestedPct) }]);
      return setShare(added, added.length - 1, round2(suggestedPct));
    }
    const n = list.length + 1;
    const vals = equalSplit(n);
    return list.map((o, i) => ({ categoryId: o.categoryId, pct: vals[i] }))
      .concat([{ categoryId: categoryId, pct: vals[vals.length - 1] }]);
  }

  function toPercents(active) {
    const percents = {};
    for (const o of (active || [])) {
      percents[o.categoryId] = round2(asNumber(o.pct));
    }
    return percents;
  }

  function planFromSuggested(costs) {
    const map = costs || {};
    const total = round2(Object.values(map).reduce((sum, v) => sum + (Number(v) || 0), 0));
    const percents = {};
    if (total > 0) {
      for (const categoryId of Object.keys(map)) {
        const v = Number(map[categoryId]) || 0;
        if (v > 0) percents[categoryId] = round2(v / total * 100);
      }
    }
    return { total: total, percents: percents };
  }

  function monthlyView(budgets, allocations, month, categoryIds) {
    const entry = effectiveAllocation(allocations, month);
    const limits = {};
    for (const b of (budgets || [])) {
      if (b && b.categoryId) limits[b.categoryId] = round2(b.amount);
    }
    const slices = [];
    let leftover = null;
    if (entry && entry.amount > 0) {
      const active = activeFromPercents(entry.percents, categoryIds);
      let usedPercent = 0;
      for (const slice of active) {
        usedPercent += slice.pct;
        limits[slice.categoryId] = round2(entry.amount * slice.pct / 100);
        slices.push({ categoryId: slice.categoryId, percent: slice.pct, value: round2(entry.amount * slice.pct / 100) });
      }
      const leftoverPercent = round2(100 - usedPercent);
      if (leftoverPercent > 0) {
        leftover = { percent: leftoverPercent, value: round2(entry.amount * leftoverPercent / 100) };
      }
    }
    let total = 0;
    for (const categoryId in limits) {
      if (Object.prototype.hasOwnProperty.call(limits, categoryId)) total += limits[categoryId];
    }
    return {
      allocation: entry,
      slices: slices,
      leftover: leftover,
      limits: limits,
      total: round2(total)
    };
  }

  root.BudgetAllocator = {
    round2: round2,
    effectiveAllocation: effectiveAllocation,
    monthlyView: monthlyView,
    activeFromPercents: activeFromPercents,
    shareTotals: shareTotals,
    setShare: setShare,
    toggleActive: toggleActive,
    toPercents: toPercents,
    planFromSuggested: planFromSuggested
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);