// "Records someone else made just arrived here." Same shape as events.js:
// core announces, the app decides what an announcement means (a system
// notification, a toast), and a test can just collect them.

const listeners = new Set();

export function onArrived(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitArrived(items) {
  for (const fn of listeners) {
    try {
      fn(items);
    } catch {
      // A listener that throws must not undo a sync that already landed.
    }
  }
}
