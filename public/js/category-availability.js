(function (root) {
  'use strict';

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function archivedOn(category, date) {
    if (!validDate(date)) return false;
    return (category && category.archivedPeriods || []).some(period =>
      period && validDate(period.from) && period.from <= date && (!validDate(period.to) || date < period.to));
  }

  function availableOn(category, date) {
    return !!category && !archivedOn(category, date);
  }

  function visibleInMonth(category, month) {
    if (!category || !/^\d{4}-\d{2}$/.test(String(month || ''))) return false;
    const [year, index] = month.split('-').map(Number);
    const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
    if (!days) return false;
    for (let day = 1; day <= days; day++) {
      if (availableOn(category, month + '-' + String(day).padStart(2, '0'))) return true;
    }
    return false;
  }

  function archivePeriods(category, date) {
    const periods = (category && category.archivedPeriods || []).map(period => ({ ...period }));
    if (!validDate(date) || archivedOn(category, date)) return periods;
    periods.push({ from: date, to: null });
    return periods;
  }

  function restorePeriods(category, date) {
    const periods = (category && category.archivedPeriods || []).map(period => ({ ...period }));
    if (!validDate(date)) return periods;
    const open = periods.findLastIndex(period => period && !validDate(period.to) && validDate(period.from));
    if (open >= 0) periods[open].to = date < periods[open].from ? periods[open].from : date;
    return periods;
  }

  root.CategoryAvailability = { archivedOn, availableOn, visibleInMonth, archivePeriods, restorePeriods };
})(globalThis);
