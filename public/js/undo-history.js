(function (root) {
  const KEYS = ['accounts', 'creditCards', 'transactions', 'bills', 'billPayments', 'savingsGoals', 'installments', 'debts', 'invoices'];
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const keyOf = (collection, item, index) => {
    if (collection === 'billPayments') return String(item.billId || '') + '::' + String(item.month || '');
    return item && item.id != null ? String(item.id) : 'legacy::' + index;
  };
  const bytesOf = value => new TextEncoder().encode(JSON.stringify(value)).length;

  class UndoHistory {
    constructor(maxSteps = 100, maxBytes = 5 * 1024 * 1024) {
      this.maxSteps = maxSteps;
      this.maxBytes = maxBytes;
      this.undoStack = [];
      this.redoStack = [];
      this.sequence = 0;
    }

    snapshot(data) {
      const state = {};
      for (const key of KEYS) state[key] = clone(Array.isArray(data && data[key]) ? data[key] : []);
      return state;
    }

    diff(before, after) {
      const collections = {};
      let changed = false;
      for (const collection of KEYS) {
        const a = before[collection] || [];
        const b = after[collection] || [];
        const oldAccountOrder = collection === 'accounts' ? a.map((value, index) => keyOf(collection, value, index)) : [];
        const newAccountOrder = collection === 'accounts' ? b.map((value, index) => keyOf(collection, value, index)) : [];
        const sameAccountRoster = collection === 'accounts' && oldAccountOrder.length === newAccountOrder.length && oldAccountOrder.some((id, index) => id !== newAccountOrder[index]) && oldAccountOrder.every(id => newAccountOrder.includes(id));
        const oldById = new Map(a.map((value, index) => [keyOf(collection, value, index), { index, value }]));
        const newById = new Map(b.map((value, index) => [keyOf(collection, value, index), { index, value }]));
        const ids = new Set([...oldById.keys(), ...newById.keys()]);
        const changes = [];
        for (const id of ids) {
          const oldEntry = oldById.get(id);
          const newEntry = newById.get(id);
          if (oldEntry && newEntry && JSON.stringify(oldEntry.value) === JSON.stringify(newEntry.value) && !(sameAccountRoster && oldEntry.index !== newEntry.index)) continue;
          changes.push({ id, before: oldEntry ? { index: oldEntry.index, value: clone(oldEntry.value) } : null, after: newEntry ? { index: newEntry.index, value: clone(newEntry.value) } : null });
        }
        if (changes.length) { collections[collection] = changes; changed = true; }
      }
      return changed ? { collections } : null;
    }

    apply(data, delta, direction) {
      const desiredKey = direction === 'undo' ? 'before' : 'after';
      for (const [collection, changes] of Object.entries(delta.collections || {})) {
        const rows = Array.isArray(data[collection]) ? data[collection].slice() : [];
        const output = rows.filter((value, index) => !changes.some(change => change.id === keyOf(collection, value, index)));
        const restores = changes.map(change => ({ id: change.id, target: change[desiredKey] })).filter(entry => entry.target);
        restores.sort((a, b) => a.target.index - b.target.index);
        for (const entry of restores) output.splice(Math.max(0, Math.min(entry.target.index, output.length)), 0, clone(entry.target.value));
        data[collection] = output;
      }
      return data;
    }

    push(entry) {
      this.redoStack = [];
      entry.sequence = ++this.sequence;
      entry.size = bytesOf(entry);
      this.undoStack.push(entry);
      this.trim();
    }

    trim() {
      const all = () => [...this.undoStack, ...this.redoStack];
      const size = () => all().reduce((sum, entry) => sum + entry.size, 0);
      while (this.undoStack.length + this.redoStack.length > this.maxSteps || size() > this.maxBytes) {
        const oldest = all().sort((a, b) => a.sequence - b.sequence)[0];
        if (!oldest) break;
        this.undoStack = this.undoStack.filter(entry => entry !== oldest);
        this.redoStack = this.redoStack.filter(entry => entry !== oldest);
      }
    }

    clear() { this.undoStack = []; this.redoStack = []; }
  }

  root.UndoHistory = UndoHistory;
})(window);
