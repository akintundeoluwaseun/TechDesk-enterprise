// The only place core touches persistence.
//
// Core does not know whether it is running in a browser tab, an Electron
// renderer, a Capacitor webview, or plain Node under the test runner. The host
// binds a real store with setStorage(); until it does, core keeps records in
// memory. That default is not a fallback for broken hosts -- it is what a unit
// test wants, and it is why core's tests need no DOM.
//
// The shape is localStorage's on purpose, so binding it is setStorage(localStorage)
// and nothing has to be wrapped.

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

let store = memoryStorage();

export function setStorage(impl) {
  store = impl || memoryStorage();
}

// Throws away everything, including the binding. Tests use this between cases.
export function resetStorage() {
  store = memoryStorage();
}

export const storage = {
  getItem: (key) => store.getItem(key),
  setItem: (key, value) => store.setItem(key, value),
  removeItem: (key) => store.removeItem(key),
  clear: () => store.clear(),
};
