(function () {
  const DB_NAME = 'black-book-local-file-access';
  const STORE_NAME = 'handles';
  const LAST_PROFILE_ID = 'last-profile';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not remember this file on this device.'));
    });
  }

  async function request(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const req = action(tx.objectStore(STORE_NAME));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not update the remembered file.'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not update the remembered file.')); };
    });
  }

  window.BrowserFileStore = {
    supported() {
      return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function' && typeof indexedDB !== 'undefined';
    },
    async remember(handle, name) {
      if (!handle || typeof indexedDB === 'undefined') return false;
      try {
        await request('readwrite', store => store.put({ id: LAST_PROFILE_ID, handle, name: String(name || handle.name || 'profile.json') }));
        return true;
      } catch (_) { return false; }
    },
    async last() {
      if (typeof indexedDB === 'undefined') return null;
      try { return await request('readonly', store => store.get(LAST_PROFILE_ID)) || null; }
      catch (_) { return null; }
    },
    async forget() {
      if (typeof indexedDB === 'undefined') return;
      try { await request('readwrite', store => store.delete(LAST_PROFILE_ID)); } catch (_) {}
    },
    async permission(handle) {
      if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
      try { return await handle.queryPermission({ mode: 'readwrite' }); } catch (_) { return 'denied'; }
    },
    async requestPermission(handle) {
      if (!handle || typeof handle.requestPermission !== 'function') return 'denied';
      try { return await handle.requestPermission({ mode: 'readwrite' }); } catch (_) { return 'denied'; }
    }
  };
})();
