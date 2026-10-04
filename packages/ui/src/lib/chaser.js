// Opening the money chaser from anywhere (menu, morning brief, assistant).
const listeners = new Set();

export function openChaser(focusKey = null) {
  for (const fn of listeners) {
    try {
      fn(focusKey);
    } catch {
      // One listener throwing must not stop the rest.
    }
  }
}

export function onOpenChaser(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
