/* Illustrative in-memory values for the Reports UI layout; never profile data. */
(function () {
  'use strict';

  const accounts = [
    { id: 'bank', name: 'Everyday Bank', color: '#65b8db' },
    { id: 'cash', name: 'Cash Wallet', color: '#83c99b' },
    { id: 'travel', name: 'Travel Account', color: '#b794e8' }
  ];
  const people = [
    { id: 'alex', name: 'Alex' },
    { id: 'sam', name: 'Sam' },
    { id: 'morgan', name: 'Morgan' }
  ];
  const categories = [
    { id: 'paycheck', name: 'Paycheck', color: '#4ade80' },
    { id: 'home', name: 'Home', color: '#b794e8' },
    { id: 'groceries', name: 'Groceries', color: '#83c99b' },
    { id: 'transport', name: 'Transport', color: '#65b8db' },
    { id: 'dining', name: 'Dining', color: '#faad6b' },
    { id: 'hobbies', name: 'Hobbies', color: '#d8b56d' }
  ];

  // Compact monthly pattern: day, cents, account, category, person, description.
  const pattern = [
    [2, 286000, 'bank', 'paycheck', 'alex', 'Monthly salary'],
    [3, -92500, 'bank', 'home', 'alex', 'Apartment rent'],
    [4, -8450, 'bank', 'groceries', 'sam', 'Market shop'],
    [6, -3290, 'cash', 'transport', null, 'Transit pass'],
    [8, -2480, 'bank', 'dining', 'morgan', 'Dinner out'],
    [10, -3950, 'bank', 'groceries', 'alex', 'Fresh produce'],
    [12, -6800, 'bank', 'hobbies', 'sam', 'Art supplies'],
    [14, -2150, 'cash', 'dining', null, 'Lunch with friends'],
    [16, -4920, 'bank', 'groceries', 'morgan', 'Weekly groceries'],
    [18, -1760, 'cash', 'transport', 'alex', 'Rail fare'],
    [20, -3650, 'bank', 'dining', 'sam', 'Takeaway meal'],
    [21, -5900, 'travel', 'hobbies', 'morgan', 'Workshop booking'],
    [23, -7120, 'bank', 'groceries', null, 'Household shopping'],
    [25, -2840, 'cash', null, null, 'Local purchase'],
    [27, -4550, 'bank', 'hobbies', 'alex', 'Bookshop'],
    [28, -3250, 'travel', 'transport', 'morgan', 'Regional train'],
    [29, 920, 'bank', 'groceries', 'sam', 'Returned item refund'],
    [30, 22400, 'bank', null, 'alex', 'Freelance project']
  ];
  const monthVariation = [0.91, 1.03, 0.96, 1.12, 0.94, 1.08, 1.17, 0.99, 1.05, 1.14, 0.93, 1.21];
  const extraByMonth = [
    [13, -1760, 'travel', 'transport', 'morgan', 'Weekend rail trip'],
    [24, -2680, 'bank', 'dining', 'alex', 'Family meal'],
    [11, -8200, 'travel', 'hobbies', 'sam', 'Museum membership'],
    [19, -3470, 'bank', 'groceries', 'morgan', 'Pantry restock'],
    [26, 1450, 'cash', null, null, 'Purchase adjustment'],
    [9, -6350, 'travel', 'transport', 'alex', 'Intercity ticket'],
    [22, -3980, 'bank', 'hobbies', 'morgan', 'Craft materials'],
    [15, -2300, 'cash', 'dining', 'sam', 'Picnic lunch'],
    [7, -9400, 'travel', 'transport', 'morgan', 'Day trip fare'],
    [17, -2870, 'bank', 'dining', null, 'Dinner gathering'],
    [12, -5100, 'bank', 'groceries', 'alex', 'Seasonal produce'],
    [20, -11200, 'travel', 'hobbies', 'sam', 'Holiday activity']
  ];

  function rows(year) {
    const safeYear = Number.isInteger(year) && year >= 1900 && year <= 9998 ? year : 2026;
    const yearFactor = Math.max(0.82, Math.min(1.22, 1 + (safeYear - 2026) * 0.012));
    const result = [];

    for (let month = 1; month <= 12; month += 1) {
      const monthFactor = monthVariation[month - 1] * yearFactor;
      const daysInMonth = new Date(Date.UTC(safeYear, month, 0)).getUTCDate();
      const entries = pattern.slice();
      if (month === 2) entries[0] = [2, 42000, 'bank', 'paycheck', 'alex', 'Part-time contract pay'];
      if (month === 6 || month === 11) entries[17] = [30, 31800, 'bank', null, 'alex', 'Freelance project'];
      entries.push(extraByMonth[month - 1]);

      for (let index = 0; index < entries.length; index += 1) {
        const [day, cents, accountId, categoryId, personId, description] = entries[index];
        const amount = Math.round((cents / 100) * monthFactor * 100) / 100;
        result.push({
          id: `preview-${safeYear}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
          date: `${safeYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`,
          amount,
          accountId,
          categoryId,
          personId,
          description
        });
      }
    }
    return result;
  }

  window.ReportsPreview = { accounts, people, categories, rows };
}());
