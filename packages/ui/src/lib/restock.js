// Opening the restock planner from anywhere (Inventory, menu, assistant, morning brief).
const listeners = new Set();

export function openRestock() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // One listener throwing must not stop the rest.
    }
  }
}

export function onOpenRestock(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
