// Opening the upgrade screen from anywhere.
//
// A lock is useless if the way past it is somewhere else. Before this, a
// locked panel offered "How to upgrade" and sent the shop to the Developer
// tab of Settings to read a phone number -- three screens away from the thing
// they had just tried to use, which is three chances to give up.
//
// The modal itself lives in the shell, where a modal belongs. This is the
// doorbell: any locked control can ring it without the shell having to thread
// a callback down through every page. Same shape as tier.js, for the same
// reason -- a handful of places need to reach one piece of app-wide state and
// none of them are related to each other.
const listeners = new Set();

/** Ring it. Does nothing if no shell is listening, which is the test case. */
export function openUpgrade() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // One listener throwing must not stop the rest.
    }
  }
}

export function onOpenUpgrade(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
