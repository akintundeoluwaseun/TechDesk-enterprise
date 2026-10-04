// Opening the morning brief from anywhere (the menu, the assistant), without
// every caller being handed a callback.
const listeners = new Set();

export function openBrief() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // One listener throwing must not stop the rest.
    }
  }
}

export function onOpenBrief(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
