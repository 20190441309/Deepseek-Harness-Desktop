const KEY = 'dshd.remote.device';

function memoryStore() {
  const data = new Map();
  return {
    async getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

function webSessionStore() {
  return {
    async getItem(key) {
      return globalThis.sessionStorage?.getItem(key) ?? null;
    },
    async setItem(key, value) {
      globalThis.sessionStorage?.setItem(key, value);
    },
    async removeItem(key) {
      globalThis.sessionStorage?.removeItem(key);
    },
  };
}

function nativeStore() {
  try {
    if (typeof document !== 'undefined') {
      return null;
    }
    const SecureStore = require('expo-secure-store');
    if (!SecureStore?.getItemAsync) {
      return null;
    }
    return {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    };
  } catch {
    return null;
  }
}

function createDeviceStore(backend) {
  const store = backend || nativeStore() || (
    typeof sessionStorage !== 'undefined' ? webSessionStore() : memoryStore()
  );
  return {
    async load() {
      const raw = await store.getItem(KEY);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async save(device) {
      await store.setItem(KEY, JSON.stringify(device));
    },
    async clear() {
      await store.removeItem(KEY);
    },
  };
}

module.exports = {
  KEY,
  memoryStore,
  createDeviceStore,
};
