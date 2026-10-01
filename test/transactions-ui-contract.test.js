import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../public/js/page-overview.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const transactions = readFileSync(new URL('../public/js/page-transactions.js', import.meta.url), 'utf8');
const bills = readFileSync(new URL('../public/js/page-bills.js', import.meta.url), 'utf8');

test('transfer amount fields accept arithmetic expressions', () => {
  assert.match(index, /<input type="text" inputmode="decimal" id="tr-amount" class="input" placeholder="150000-60"/);
  assert.match(index, /<input type="text" inputmode="decimal" id="tr-amount-in" class="input"/);
});

test('overview exposes an end-of-month balance and a visible merge action for selections', () => {
  assert.match(overview, /monthEndBalanceAt\(/);
  assert.match(overview, /String\(lastDay\)\.padStart\(2, '0'\)/);
  assert.match(overview, /END OF MONTH/);
  assert.match(overview, /MERGE SELECTED/);
});

test('the selected account retains its full presentation while other account chips compact first', () => {
  assert.match(styles, /\.account-chip\.selected \.account-name-full \{ display:inline; \}/);
  assert.match(styles, /\.account-chip:not\(\.selected\) \.money-short \{ display:inline; \}/);
});

test('narrow account chips do not let the selected chip grow over its neighbors', () => {
  assert.ok(styles.includes('.account-chip.selected:not(.ov-chip):not(.account-mgr-square) { flex-grow: 2; }'));
  assert.match(overview, /overviewChip \+ '<div class="account-chip-list">' \+ accts\.map\(chip\)\.join\(''\) \+ '<\/div>' \+ squareChip/);
  const lastRule = selector => styles.slice(styles.lastIndexOf(selector)).split('}')[0];
  assert.match(lastRule('.account-chips-row {'), /width:\s*100%;/);
  assert.match(lastRule('.account-chips-row {'), /min-width:\s*0;/);
  assert.match(styles, /\.account-chip-list \{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;[^}]*overflow-x:\s*auto/);
  assert.match(lastRule('.account-chips {'), /width:\s*100%;[^}]*min-width:\s*0;/);
  assert.doesNotMatch(styles, /\.chip-name\s*\{[^}]*letter-spacing/);
  assert.doesNotMatch(styles, /\.account-name-short \{[^}]*letter-spacing/);
  assert.doesNotMatch(styles, /\.account-chip\.chip-compact \.chip-name \{[^}]*letter-spacing/);
});

test('account chip balances omit only the unnecessary zero decimals', () => {
  const context = { window: {}, localStorage: { getItem: () => '' } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(overview, context);
  const app = context.window.BlackBook;
  app.fmtAmount = (amount, currency) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
  assert.equal(app.accountChipAmount(70000, 'RSD'), '70,000 RSD');
  assert.equal(app.accountChipAmount(70000.5, 'RSD'), '70,000.50 RSD');
});

test('bills show full whole-number amounts when a cell has room without showing .00', () => {
  const context = { window: {}, localStorage: { getItem: () => '' } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(bills, context);
  const app = context.window.BlackBook;
  app.fmtNumber = amount => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.equal(app.formatBillGridAmount(70000), '70,000');
  assert.equal(app.formatBillGridAmount(70000.5), '70,000.50');
  assert.match(styles, /@container bill-amount \(max-width: 72px\)/);
});

test('selection survives clicks on overview filters and merge dialog, but clears outside', () => {
  let pointerdown;
  const context = {
    window: {},
    localStorage: { getItem: () => null },
    document: { addEventListener: (type, listener) => { if (type === 'pointerdown') pointerdown = listener; } }
  };
  vm.runInNewContext(core, context);
  const app = context.window.BlackBook;
  app._bulkSel = new Set(['a', 'b']);
  let clears = 0;
  app.bulkClear = () => { clears++; };
  app.bindOutsideDeselect();
  const clickWithin = (ancestor) => pointerdown({
    target: { closest: (selector) => selector.split(',').some(part => part.trim() === ancestor) ? {} : null }
  });
  for (const ancestor of [
    '.tx-row', '.bulk-filter-chip', '.ov-merge-selected', '.ov-type-cycle',
    '.ov-sort-cycle', '.ov-sort-dir', '.cat-filter-chip', '.mp-month',
    '.mp-year-btn', '.mp-today', '.account-chip', '.modal'
  ]) {
    clickWithin(ancestor);
    assert.equal(clears, 0, `${ancestor} must preserve selection`);
  }
  for (const ancestor of ['.tx-list-wrap', '.month-summary', '.cat-filter', '.month-picker', '.account-chips', '.app-header']) {
    clickWithin(ancestor);
  }
  assert.equal(clears, 6, 'clicking unused space or another part of the page clears selection');
});

test('changing the viewed month clears transaction selection and its selected-only mode', () => {
  const context = { window: {}, localStorage: { getItem: () => null } };
  vm.runInNewContext(core, context);
  const app = context.window.BlackBook;
  app.currentPage = 'overview';
  app._pageView = { overview: { y: 2026, m: 0 } };
  app._bulkSel = new Set(['old-month']);
  app._bulkOnly = true;
  app.renderPage = () => {};
  app.pickMonth(1);
  assert.equal(app._bulkSel.size, 0);
  assert.equal(app._bulkOnly, false);
});

test('selected-only overview charts use days of the current month and selected totals', () => {
  let chart;
  const context = {
    window: {}, localStorage: { getItem: () => null },
    document: { getElementById: id => id === 'overview-line-chart' ? { getContext: () => ({}) } : null },
    Chart: class { constructor(_canvas, config) { chart = config; } }
  };
  vm.runInNewContext(core, context);
  vm.runInNewContext(overview, context);
  const app = context.window.BlackBook;
  app.currentPage = 'overview';
  app._pageView = { overview: { y: 2026, m: 0 } };
  app._bulkSel = new Set(['income', 'expense']);
  app._bulkOnly = true;
  app.data = { settings: {}, transactions: [
    { id: 'income', date: '2026-01-05', type: 'income', amount: 100, currency: 'RSD', note: 'Paycheck' },
    { id: 'expense', date: '2026-01-20', type: 'expense', amount: -25, currency: 'RSD', note: 'Groceries' },
    { id: 'excluded', date: '2026-01-20', type: 'expense', amount: -75, currency: 'RSD' }
  ] };
  app.toBase = amount => amount;
  app.isTransfer = tx => tx.type === 'transfer';
  app.lineChartOptions = ticks => ({ ticks });
  app.renderOverviewLineChart();
  assert.equal(chart.data.labels.length, 31);
  assert.equal(chart.data.labels[4], '5');
  assert.equal(chart.data.datasets[0].data[4], 100);
  assert.equal(chart.data.datasets[1].data[19], -25);
  assert.equal(chart.options.ticks.maxTicksLimit, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(app.overviewMonthlyTotals())), { income: 100, expenses: 25 });
  assert.match(app.selectedTransactionDetailsHtml(), /Paycheck/);
  assert.match(app.selectedTransactionDetailsHtml(), /Groceries/);
  assert.doesNotMatch(app.selectedTransactionDetailsHtml(), /excluded/);
});

test('Shift-click builds and reduces an overview category filter while normal click isolates one', () => {
  const context = { window: {}, localStorage: { getItem: () => null } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(overview, context);
  const app = context.window.BlackBook;
  app.data = { categories: [] };
  app.renderPage = () => {};
  const selected = () => app.selectedCategories ? Array.from(app.selectedCategories).sort() : null;

  app.selectCategory('food');
  assert.deepEqual(selected(), ['food']);
  app.selectCategory('rent', { shiftKey: true });
  assert.deepEqual(selected(), ['food', 'rent']);
  assert.equal(app.overviewCategoryMatches({ type: 'expense', categoryId: 'food' }), true);
  assert.equal(app.overviewCategoryMatches({ type: 'expense', categoryId: 'rent' }), true);
  assert.equal(app.overviewCategoryMatches({ type: 'expense', categoryId: 'travel' }), false);

  app.selectCategory('food', { shiftKey: true });
  assert.deepEqual(selected(), ['rent']);
  app.selectCategory('rent', { shiftKey: true });
  assert.equal(selected(), null, 'removing the final category returns to ALL');

  app.selectCategory('food', { shiftKey: true });
  assert.deepEqual(selected(), ['food'], 'Shift-click from ALL starts a selection');
  app.selectCategory('rent');
  assert.deepEqual(selected(), ['rent'], 'normal click replaces the selection');
  app.selectCategory(null);
  assert.equal(selected(), null);
});

test('the Transfer category can be combined with another category using Shift-click', () => {
  const context = { window: {}, localStorage: { getItem: () => null } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(overview, context);
  const app = context.window.BlackBook;
  app.data = { categories: [{ id: 'transfer', name: 'Transfer' }] };
  app.renderPage = () => {};
  app.selectCategory('__TRANSFER__');
  app.selectCategory('food', { shiftKey: true });
  assert.equal(app.overviewCategoryMatches({ type: 'transfer', categoryId: 'transfer' }), true);
  assert.equal(app.overviewCategoryMatches({ type: 'expense', categoryId: 'food' }), true);
  assert.equal(app.overviewCategoryMatches({ type: 'expense', categoryId: 'travel' }), false);
});

test('all Shift-selected overview category cards remain visibly selected', () => {
  const context = { window: {}, localStorage: { getItem: () => null } };
  vm.runInNewContext(core, context);
  vm.runInNewContext(overview, context);
  const app = context.window.BlackBook;
  app.data = {
    transactions: [
      { date: '2026-09-01', type: 'expense', categoryId: 'food' },
      { date: '2026-09-02', type: 'expense', categoryId: 'rent' }
    ],
    categories: [{ id: 'food', name: 'Food' }, { id: 'rent', name: 'Rent' }]
  };
  app.vy = () => 2026;
  app.vm = () => 8;
  app.ymOf = (date) => {
    const [year, month] = String(date).split('-').map(Number);
    return { y: year, m: month - 1 };
  };
  app.categoryColor = () => '#abcdef';
  app.escapeHtml = (value) => value;
  app.renderPage = () => {};
  app.selectCategory('food');
  app.selectCategory('rent', { shiftKey: true });

  const html = app.categoryFilterHtml();
  assert.match(html, /class="cat-filter-chip selected"[^>]*>Food<\/div>/);
  assert.match(html, /class="cat-filter-chip selected"[^>]*>Rent<\/div>/);
  assert.doesNotMatch(html, /class="cat-filter-chip selected"[^>]*>ALL<\/div>/);
});

test('E and Delete target selections first, then only the row actually hovered', () => {
  let keydown;
  let hoveredId = 'hovered';
  const context = {
    window: {},
    localStorage: { getItem: () => null },
    document: {
      activeElement: { tagName: 'BODY' },
      addEventListener: (type, listener) => { if (type === 'keydown') keydown = listener; },
      getElementById: () => ({ classList: { contains: () => true } }),
      querySelector: (selector) => selector === '.tx-row:hover' && hoveredId
        ? { getAttribute: () => `BlackBook.bulkToggle('${hoveredId}', event.shiftKey)` } : null
    }
  };
  vm.runInNewContext(core, context);
  vm.runInNewContext(transactions, context);
  const app = context.window.BlackBook;
  app._bulkSel = new Set(['selected']);
  app.hoveredTxId = 'stale';
  const actions = [];
  app.openEditTransaction = (id) => actions.push(['edit', id]);
  app.deleteTransaction = (id) => actions.push(['delete', id]);
  app.openBulkEdit = () => actions.push(['bulk-edit']);
  app.bulkDelete = () => actions.push(['bulk-delete']);
  app.bindKeyboard();
  const press = (key) => keydown({ key, preventDefault() {} });

  press('e');
  press('Delete');
  assert.deepEqual(actions, [['bulk-edit'], ['bulk-delete']]);

  app._bulkSel.clear();
  press('e');
  press('Delete');
  assert.deepEqual(actions.slice(2), [['edit', 'hovered'], ['delete', 'hovered']]);

  hoveredId = null;
  press('e');
  press('Delete');
  assert.equal(actions.length, 4, 'a stale hover ID must not affect a transaction');
});

test('successful merge closes its dialog and uses an in-app notification', async () => {
  const context = {
    window: {},
    localStorage: { getItem: () => null },
    alert: () => { throw new Error('Browser alert must not be used after merge'); }
  };
  vm.runInNewContext(core, context);
  vm.runInNewContext(transactions, context);
  const app = context.window.BlackBook;
  app.data = { transactions: [
    { id: 'a', amount: -10, note: 'First', date: '2026-09-01', type: 'expense', currency: 'RSD', accountId: 'bank' },
    { id: 'b', amount: -20, note: 'Second', date: '2026-09-02', type: 'expense', currency: 'RSD', accountId: 'bank' }
  ] };
  app._mergeIds = ['a', 'b'];
  app._mergeOk = true;
  app._mergeSelected = 0;
  app._mergeCurrency = 'RSD';
  let closed;
  let notice;
  app.save = async () => {};
  app.closeModal = (id) => { closed = id; };
  app.bulkClear = () => {};
  app.showToast = (text) => { notice = text; };
  await app.submitMerge();
  assert.equal(app.data.transactions.length, 1);
  assert.equal(app.data.transactions[0].amount, -30);
  assert.equal(closed, 'merge-modal');
  assert.equal(notice, 'Merged 2 transactions successfully.');
});

test('merge success notification uses the existing top-bar notice style', () => {
  const header = index.match(/<header class="app-header">([\s\S]*?)<\/header>/)?.[1] || '';
  assert.match(header, /id="app-toast" class="app-toast attention-item hidden"/);
  assert.match(styles, /\.header-center:has\(\.app-toast:not\(\.hidden\)\) \.attention-bar \{ display:none; \}/);
});
