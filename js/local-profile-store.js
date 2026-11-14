(() => {
  const DB_NAME = 'black-book-file-profiles';
  const STORE_NAME = 'profiles';
  const META_DIR = '.blackbook';
  const LOG_DIR = 'changes';
  const PROFILE_FILE = 'profile.json';
  const clone = value => value == null ? value : (window.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const validProfile = value => value && Array.isArray(value.accounts) && Array.isArray(value.transactions) && Array.isArray(value.categories);
  const idb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser profile list.'));
  });
  async function idbRequest(mode, action) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not update browser profile list.'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not update browser profile list.')); };
    });
  }
  const stampCompare = (a, b) => (a.clock - b.clock) || (String(a.writer) < String(b.writer) ? -1 : String(a.writer) > String(b.writer) ? 1 : 0);
  function recordKey(item, collection) {
    if (!item || typeof item !== 'object') return null;
    if (item.id != null) return 'id:' + String(item.id);
    if (collection === 'billPayments' && item.billId != null && item.month != null) return 'bill-month:' + item.billId + ':' + item.month;
    if (collection === 'budgetAllocations' && item.month != null) return 'month:' + String(item.month);
    if (item.txId != null) return 'tx:' + String(item.txId);
    if (item.transactionId != null) return 'transaction:' + String(item.transactionId);
    if (item.installmentId != null && item.seq != null) return 'installment-seq:' + item.installmentId + ':' + item.seq;
    if (item.seq != null && (collection === 'payments' || collection === 'paidEntries')) return 'seq:' + String(item.seq);
    return null;
  }
  const keyedArray = (arr, collection) => Array.isArray(arr) && arr.every(item => recordKey(item, collection) != null);
  const pageWriters = new Map();
  const profileCaches = new Map();

  function diffValues(before, after, path, ops, writer) {
    if (before === after) return;
    const beforeArray = Array.isArray(before);
    const afterArray = Array.isArray(after);
    const beforeObject = before && typeof before === 'object' && !beforeArray;
    const afterObject = after && typeof after === 'object' && !afterArray;
    const collection = path.length && typeof path[path.length - 1] === 'string' ? path[path.length - 1] : '';
    if (beforeArray && afterArray && keyedArray(before, collection) && keyedArray(after, collection)) {
      const oldMap = new Map(before.map(item => [recordKey(item, collection), item]));
      const newMap = new Map(after.map(item => [recordKey(item, collection), item]));
      if (oldMap.size === before.length && newMap.size === after.length) {
        for (const [key] of oldMap) if (!newMap.has(key)) ops.push({ path: [...path, { recordKey: key }], delete: true, writer });
        for (const [key, item] of newMap) {
          if (!oldMap.has(key)) ops.push({ path: [...path, { recordKey: key }], value: clone(item), writer });
          else diffValues(oldMap.get(key), item, [...path, { recordKey: key }], ops, writer);
        }
        const oldCommon = before.map(item => recordKey(item, collection)).filter(key => newMap.has(key));
        const newCommon = after.map(item => recordKey(item, collection)).filter(key => oldMap.has(key));
        if (oldCommon.length === newCommon.length && oldCommon.some((id, index) => id !== newCommon[index])) {
          ops.push({ path: [...path, { order: true }], value: after.map(item => recordKey(item, collection)), writer });
        }
        return;
      }
    }
    if ((beforeObject || before === undefined) && (afterObject || after === undefined)) {
      const oldObj = beforeObject ? before : {};
      const newObj = afterObject ? after : {};
      const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(newObj, key)) ops.push({ path: [...path, key], delete: true, writer });
        else if (!Object.prototype.hasOwnProperty.call(oldObj, key)) ops.push({ path: [...path, key], value: clone(newObj[key]), writer });
        else diffValues(oldObj[key], newObj[key], [...path, key], ops, writer);
      }
      return;
    }
    if (beforeArray && afterArray && before.length === after.length && before.every((value, index) => value === after[index])) return;
    if (Object.is(before, after)) return;
    ops.push({ path, value: clone(after), delete: after === undefined, writer });
  }

  function applyOp(root, op) {
    const path = op.path || [];
    if (!path.length) return op.delete ? root : clone(op.value);
    let target = root;
    for (let i = 0; i < path.length - 1; i++) {
      const part = path[i];
      if (part && typeof part === 'object' && part.recordKey != null) {
        if (!Array.isArray(target)) return root;
        const collection = path[i - 1];
        const index = target.findIndex(item => recordKey(item, collection) === part.recordKey);
        if (index < 0) return root;
        target = target[index];
      } else {
        if (!target || typeof target !== 'object') return root;
        target = target[part];
        if (target == null) return root;
      }
    }
    const last = path[path.length - 1];
    if (last && typeof last === 'object' && last.order) {
      if (!Array.isArray(target) || !Array.isArray(op.value)) return root;
      const collection = path[path.length - 2];
      const byKey = new Map(target.map(item => [recordKey(item, collection), item]));
      const ordered = op.value.map(key => byKey.get(key)).filter(Boolean);
      const used = new Set(ordered.map(item => recordKey(item, collection)));
      const remainder = target.filter(item => !used.has(recordKey(item, collection)));
      target.length = 0;
      for (const item of ordered) target.push(item);
      for (const item of remainder) target.push(item);
    } else if (last && typeof last === 'object' && last.recordKey != null) {
      if (!Array.isArray(target)) return root;
      const collection = path[path.length - 2];
      const index = target.findIndex(item => recordKey(item, collection) === last.recordKey);
      if (op.delete) { if (index >= 0) target.splice(index, 1); }
      else if (index >= 0) target[index] = clone(op.value);
      else target.push(clone(op.value));
    } else {
      if (!target || typeof target !== 'object') return root;
      if (op.delete) delete target[last];
      else target[last] = clone(op.value);
    }
    return root;
  }

  async function readJson(dir, name, optional = false) {
    try {
      const handle = await dir.getFileHandle(name);
      return JSON.parse(await (await handle.getFile()).text());
    } catch (error) {
      if (optional && (error.name === 'NotFoundError' || error.name === 'TypeError')) return null;
      throw error;
    }
  }
  async function writeJson(dir, name, value) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(value));
    await writable.close();
  }
  async function directoryFor(record) {
    if (!record || !record.handle) throw new Error('This browser no longer has the selected folder. Reopen the folder to reconnect it.');
    const permission = await record.handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return null;
    return record.handle;
  }
  async function foldersFor(handle) {
    const meta = await handle.getDirectoryHandle(META_DIR, { create: true });
    const changes = await meta.getDirectoryHandle(LOG_DIR, { create: true });
    return { meta, changes };
  }
  async function collect(handle) {
    const { meta, changes } = await foldersFor(handle);
    let base = await readJson(meta, 'base.json', true);
    if (!base) {
      base = await readJson(handle, PROFILE_FILE);
      if (!validProfile(base)) throw new Error('This folder does not contain a valid Black Book profile.json file.');
      await writeJson(meta, 'base.json', base);
    }
    let data = clone(base);
    const logs = [];
    for await (const [name, entry] of changes.entries()) {
      if (entry.kind !== 'file' || !name.endsWith('.json')) continue;
      try {
        const log = await readJson(changes, name, true);
        if (log && Array.isArray(log.ops)) logs.push(log);
      } catch (error) {
        console.warn('Could not read a Black Book change journal:', name, error);
      }
    }
    const ops = logs.flatMap(log => log.ops.map((op, index) => ({ ...op, writer: op.writer || log.writer, clock: Number(op.clock) || index + 1 })));
    ops.sort(stampCompare);
    for (const op of ops) data = applyOp(data, op);
    return { data, maxClock: ops.reduce((max, op) => Math.max(max, op.clock), 0), logs, meta, changes };
  }

  window.BrowserProfileStore = {
    supported() { return !!(window.showDirectoryPicker && window.indexedDB && window.isSecureContext); },
    async pickDirectory() {
      if (!this.supported()) throw new Error('Folder profiles need a supported browser and a secure website connection (HTTPS).');
      return window.showDirectoryPicker({ id: 'black-book-profile', mode: 'readwrite' });
    },
    async list() { return (await idbRequest('readonly', store => store.getAll())) || []; },
    async get(id) { return (await idbRequest('readonly', store => store.get(id))) || null; },
    async remember(record) { return idbRequest('readwrite', store => store.put(record)); },
    async forget(id) { await idbRequest('readwrite', store => store.delete(id)); },
    async openDirectory(handle, label) {
      const file = await readJson(handle, PROFILE_FILE, true);
      if (!validProfile(file)) throw new Error('Choose a folder that contains a Black Book profile.json file.');
      const displayName = String(label || (file.settings && file.settings.profileName) || handle.name || 'Profile').trim();
      for (const existing of await this.list()) {
        if (existing.handle && await existing.handle.isSameEntry(handle)) {
          const updated = { ...existing, name: displayName, lastOpened: Date.now() };
          await this.remember(updated);
          await foldersFor(handle);
          return updated;
        }
      }
      const record = { id: crypto.randomUUID(), name: displayName, handle, lastOpened: Date.now() };
      await foldersFor(handle);
      await this.remember(record);
      return record;
    },
    defaultProfile(name, accountName, currency) {
      const account = String(accountName || '').trim();
      const code = String(currency || 'RSD').toUpperCase();
      return {
        accounts: account ? [{ id: crypto.randomUUID(), name: account, shortName: account.slice(0, 3).toUpperCase(), currency: code, type: 'cash', color: null }] : [],
        categories: [
          { id: 'cat-invoice', name: 'Invoice', color: '#fa8c3c' },
          { id: 'cat-transfer', name: 'Transfer', color: '#71717a' },
          { id: 'cat-debt', name: 'Debt', color: '#facc15' },
          { id: 'cat-uncategorized', name: 'None', color: null }
        ],
        transactions: [], bills: [], billPayments: [], savingsGoals: [], wishlist: [], budgets: [], budgetAllocations: [], installments: [], debts: [], creditCards: [], invoices: [], recurringTemplates: [], reconciliations: [], importRules: [], recurringRules: [],
        settings: { profileName: String(name || '').trim(), baseCurrency: code, enabledCurrencies: [code], currencyPreset: true, defaultAccountId: null, defaultCategoryId: null, dateSeparator: '/', eurToRsdRate: 117.2, eurToRsdRateSource: 'manual', eurToRsdRateUpdated: null, rates: {}, attentionBarHidden: false }
      };
    },
    async createDirectory(handle, name, data) {
      const safeName = String(name || '').trim();
      if (!safeName) throw new Error('Enter a name for the profile.');
      const existingFile = await readJson(handle, PROFILE_FILE, true);
      if (existingFile) throw new Error('This folder already has a profile.json file. Choose another folder or use OPEN FOLDER.');
      const duplicate = (await this.list()).some(p => p.name.toLowerCase() === safeName.toLowerCase());
      if (duplicate) throw new Error('A folder profile with that name is already connected in this browser.');
      data.settings = data.settings || {};
      data.settings.profileName = safeName;
      const { meta, changes } = await foldersFor(handle);
      await writeJson(meta, 'base.json', data);
      await writeJson(handle, PROFILE_FILE, data);
      const record = { id: crypto.randomUUID(), name: safeName, handle, lastOpened: Date.now() };
      await this.remember(record);
      return record;
    },
    async changeDirectory(record, handle, data) {
      if (!record || !record.id || !handle) throw new Error('Choose a profile folder first.');
      if (record.handle && await record.handle.isSameEntry(handle)) return record;
      const existingFile = await readJson(handle, PROFILE_FILE, true);
      if (existingFile) throw new Error('The selected folder already contains a profile.json file. Choose an empty folder or use OPEN FOLDER.');
      const name = String(record.name || (data.settings && data.settings.profileName) || 'Profile').trim();
      data.settings = data.settings || {};
      data.settings.profileName = name;
      const { meta } = await foldersFor(handle);
      await writeJson(meta, 'base.json', data);
      await writeJson(handle, PROFILE_FILE, data);
      const updated = { ...record, name, handle, lastOpened: Date.now() };
      await this.remember(updated);
      return updated;
    },
    async rename(record, name) {
      const updated = { ...record, name: String(name || '').trim(), lastOpened: Date.now() };
      if (!updated.name) throw new Error('Enter a profile name.');
      await this.remember(updated);
      return updated;
    },
    async reconnect(record) {
      const status = await record.handle.requestPermission({ mode: 'readwrite' });
      return status === 'granted';
    },
    async load(record) {
      const handle = await directoryFor(record);
      if (!handle) return { permissionRequired: true };
      const result = await collect(handle);
      await writeJson(handle, PROFILE_FILE, result.data);
      const stamp = await this.fileStamp(record);
      profileCaches.set(record.id, { data: result.data, maxClock: result.maxClock, logs: result.logs, stamp, changes: result.changes });
      return { data: result.data, maxClock: result.maxClock, stamp };
    },
    async fileStamp(record) {
      const handle = await directoryFor(record);
      if (!handle) return null;
      const file = await (await handle.getFileHandle(PROFILE_FILE)).getFile();
      const { changes } = await foldersFor(handle);
      const journalStamps = [];
      for await (const [name, entry] of changes.entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.json')) continue;
        const journal = await entry.getFile();
        journalStamps.push(name + ':' + journal.lastModified + ':' + journal.size);
      }
      journalStamps.sort();
      return file.lastModified + ':' + file.size + '|' + journalStamps.join('|');
    },
    writerId(recordId) {
      if (!pageWriters.has(recordId)) pageWriters.set(recordId, crypto.randomUUID());
      return pageWriters.get(recordId);
    },
    async save(record, baseData, nextData, writer) {
      const handle = await directoryFor(record);
      if (!handle) throw new Error('Folder access needs to be reconnected. Open Settings and reconnect this profile.');
      const currentStamp = await this.fileStamp(record);
      let merged = profileCaches.get(record.id);
      const cacheHit = !!merged && merged.stamp === currentStamp;
      if (!cacheHit) merged = await collect(handle);
      const pending = [];
      diffValues(baseData, nextData, [], pending, writer);
      if (!pending.length && cacheHit) return { data: merged.data, maxClock: merged.maxClock, stamp: merged.stamp };
      if (pending.length) {
        const own = merged.logs.find(log => log.writer === writer) || { writer, ops: [] };
        let clock = merged.maxClock;
        const stamped = pending.map(op => ({ ...op, writer, clock: ++clock }));
        own.ops.push(...stamped);
        await writeJson(merged.changes, writer + '.json', own);
        for (const op of stamped) merged.data = applyOp(merged.data, op);
        merged.maxClock = clock;
        if (!merged.logs.includes(own)) merged.logs.push(own);
      }
      await writeJson(handle, PROFILE_FILE, merged.data);
      const stamp = await this.fileStamp(record);
      profileCaches.set(record.id, { data: merged.data, maxClock: merged.maxClock, logs: merged.logs, stamp, changes: merged.changes });
      return { data: merged.data, maxClock: merged.maxClock, stamp };
    }
  };
})();
