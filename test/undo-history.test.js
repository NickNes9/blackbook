import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/undo-history.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const equalData = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

function historyClass() {
  const context = { window: {}, TextEncoder };
  vm.runInNewContext(source, context);
  return context.window.UndoHistory;
}

test('financial deltas undo and redo linked transaction and payment edits while preserving unrelated data', () => {
  const UndoHistory = historyClass();
  const history = new UndoHistory();
  const before = {
    transactions: [{ id: 'tx-1', amount: -20, note: 'Bill' }],
    bills: [{ id: 'bill-1', name: 'Bill' }],
    billPayments: [], budgets: [{ id: 'budget-1', amount: 50 }]
  };
  const after = structuredClone(before);
  after.transactions.unshift({ id: 'tx-2', amount: -30, note: 'Bill' });
  after.billPayments.push({ billId: 'bill-1', month: '2026-09', txId: 'tx-2', paid: true });
  after.bills[0].lastPaid = '2026-09';
  after.budgets[0].amount = 75;
  const delta = history.diff(history.snapshot(before), history.snapshot(after));
  const current = structuredClone(after);

  history.apply(current, delta, 'undo');
  equalData(current.transactions, before.transactions);
  equalData(current.billPayments, []);
  equalData(current.bills, before.bills);
  equalData(current.budgets, after.budgets, 'non-financial data is outside the delta');

  history.apply(current, delta, 'redo');
  equalData(current.transactions, after.transactions);
  equalData(current.billPayments, after.billPayments);
  equalData(current.bills, after.bills);
});

test('account reordering is undoable without recording unrelated shifted rows', () => {
  const UndoHistory = historyClass();
  const history = new UndoHistory();
  const before = { accounts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], transactions: [{ id: 'tx-1' }] };
  const after = structuredClone(before);
  after.accounts = [after.accounts[1], after.accounts[0], after.accounts[2]];
  const delta = history.diff(history.snapshot(before), history.snapshot(after));
  assert.equal(delta.collections.accounts.length, 2);
  const current = structuredClone(after);
  history.apply(current, delta, 'undo');
  equalData(current.accounts, before.accounts);
  history.apply(current, delta, 'redo');
  equalData(current.accounts, after.accounts);

  const withNewAccount = structuredClone(before);
  withNewAccount.accounts.unshift({ id: 'new' });
  const insertDelta = history.diff(history.snapshot(before), history.snapshot(withNewAccount));
  assert.equal(insertDelta.collections.accounts.length, 1, 'adding an account must not record every shifted account');
});

test('history limits include undo and redo entries and evict the oldest step', () => {
  const UndoHistory = historyClass();
  const history = new UndoHistory(2, 1024 * 1024);
  history.push({ label: 'one', delta: { collections: {} } });
  history.push({ label: 'two', delta: { collections: {} } });
  history.redoStack.push(history.undoStack.pop());
  history.push({ label: 'three', delta: { collections: {} } });
  assert.equal(history.undoStack.length + history.redoStack.length, 2, 'new action clears redo and preserves prior undo history');
  equalData(history.undoStack.map(entry => entry.label), ['one', 'three']);

  history.push({ label: 'four', delta: { collections: {} } });
  history.push({ label: 'five', delta: { collections: {} } });
  assert.equal(history.undoStack.length + history.redoStack.length, 2);
  equalData(history.undoStack.map(entry => entry.label), ['four', 'five']);
});

test('byte cap evicts oldest history entries', () => {
  const UndoHistory = historyClass();
  const history = new UndoHistory(100, 180);
  history.push({ label: 'old', delta: { collections: { transactions: ['x'.repeat(70)] } } });
  history.push({ label: 'new', delta: { collections: { transactions: ['y'.repeat(70)] } } });
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].label, 'new');
});

function appContext(fetchImpl) {
  const context = {
    window: {}, TextEncoder, localStorage: { getItem: () => '' }, fetch: fetchImpl,
    console: { error() {} }
  };
  vm.runInNewContext(source, context);
  vm.runInNewContext(coreSource, context);
  const app = context.window.BlackBook;
  app.data = { accounts: [], creditCards: [], transactions: [], bills: [], billPayments: [], savingsGoals: [], installments: [], debts: [], invoices: [], budgets: [] };
  app.setSaveState = () => {};
  app.renderPage = () => {};
  app.showToast = () => {};
  app.profile = '';
  app.resetUndoHistory();
  return { app, context };
}

test('successful financial save supports undo and redo; a failed undo keeps its history step', async () => {
  let failNext = false;
  const { app } = appContext(async () => ({ ok: !failNext, json: async () => ({ error: 'offline' }) }));
  app.data.transactions.push({ id: 'tx-1', amount: -42, type: 'expense' });
  assert.equal(await app.save({ undoable: true, label: 'Add transaction' }), true);
  assert.equal(app._undoHistory.undoStack.length, 1);

  await app.undoFinancialChange('undo');
  assert.equal(app.data.transactions.length, 0);
  assert.equal(app._undoHistory.redoStack.length, 1);
  await app.undoFinancialChange('redo');
  assert.equal(app.data.transactions[0].id, 'tx-1');
  assert.equal(app._undoHistory.undoStack.length, 1);

  failNext = true;
  await app.undoFinancialChange('undo');
  assert.equal(app.data.transactions[0].id, 'tx-1', 'failed reversal restores the in-memory state');
  assert.equal(app._undoHistory.undoStack.length, 1);
  assert.equal(app._undoHistory.redoStack.length, 0);
});

test('Ctrl+Z and Ctrl+Shift+Z trigger undo and redo, while editable fields keep native shortcuts', () => {
  let keydown;
  let activeTag = 'BODY';
  const classList = { contains: () => true };
  const context = {
    window: {}, TextEncoder, localStorage: { getItem: () => '' },
    document: {
      activeElement: { get tagName() { return activeTag; }, isContentEditable: false },
      addEventListener: (type, listener) => { if (type === 'keydown') keydown = listener; },
      getElementById: id => ({ classList: id === 'confirm-modal' ? classList : { contains: () => true } }),
      querySelector: () => null
    }
  };
  vm.runInNewContext(coreSource, context);
  const app = context.window.BlackBook;
  const calls = [];
  app.undoFinancialChange = direction => calls.push(direction);
  app.bindKeyboard();
  const fire = (shiftKey = false) => {
    let prevented = false;
    keydown({ key: 'z', ctrlKey: true, metaKey: false, shiftKey, altKey: false, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(fire(), true);
  assert.equal(fire(true), true);
  activeTag = 'INPUT';
  assert.equal(fire(), false);
  assert.deepEqual(calls, ['undo', 'redo']);
});

test('footer delegates keyboard hint rendering to the app', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="footer-hotkeys"/);
  assert.doesNotMatch(html, /<kbd>Ctrl Z<\/kbd> UNDO/);
});

test('footer shortcut set follows the active page, selection, and undo/redo availability', () => {
  let modalOpen = false;
  const context = {
    window: {}, TextEncoder, localStorage: { getItem: () => '' },
    document: { querySelector: () => modalOpen ? {} : null }
  };
  vm.runInNewContext(coreSource, context);
  const app = context.window.BlackBook;
  app.data = { settings: { disabledPages: [] } };
  app._bulkSel = new Set();
  app._undoHistory = { undoStack: [], redoStack: [] };
  app._undoReady = true;
  app.currentPage = 'overview';
  let actions = app.footerHotkeys().map(item => item.key);
  assert.equal(actions.join('|'), 'A|T|D|H|TAB|← →|1–9|Space');

  app._bulkSel.add('tx-1');
  actions = app.footerHotkeys().map(item => item.key);
  assert.ok(actions.includes('E') && actions.includes('B') && actions.includes('DEL'));
  assert.ok(!actions.includes('M'));
  app._bulkSel.add('tx-2');
  assert.ok(app.footerHotkeys().some(item => item.key === 'M'));

  app.currentPage = 'settings';
  actions = app.footerHotkeys().map(item => item.key);
  assert.ok(!actions.includes('H') && !actions.includes('TAB') && !actions.includes('M'));
  app._undoHistory.undoStack.push({});
  assert.ok(app.footerHotkeys().some(item => item.key === 'Ctrl Z'));
  app._undoHistory.undoStack = [];
  app._undoHistory.redoStack.push({});
  assert.ok(app.footerHotkeys().some(item => item.key === 'Ctrl Shift Z'));
  modalOpen = true;
  assert.equal(app.footerHotkeys().length, 0, 'shortcuts are hidden when a modal blocks them');
});
