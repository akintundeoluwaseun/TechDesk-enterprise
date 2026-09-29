// A line that says what just happened, then goes away.
//
// Called from plain modules as well as components -- saveFile.js has no React
// around it -- so this talks to the DOM directly rather than going through a
// context. One at a time: a second message replaces the first instead of
// stacking up the screen.

let current = null;
let timer = null;

const STYLE = `
  position: fixed;
  left: 50%;
  bottom: calc(76px + env(safe-area-inset-bottom));
  transform: translateX(-50%) translateY(8px);
  z-index: 2147483000;
  max-width: min(92vw, 420px);
  padding: 12px 18px;
  border-radius: 999px;
  background: rgba(17, 20, 26, 0.94);
  color: #fff;
  font: 500 14px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: center;
  box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity .18s ease, transform .18s ease;
  pointer-events: none;
`;

// The shell's Toaster registers here. While it's mounted, toasts go to it --
// animated cards, with confetti for the moments worth it. Without it (a
// plain module running before or outside the app) the one-line pill below
// still works exactly as before.
const listeners = new Set();
let nextId = 1;

export function onToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * toast("Saved")                                  -- the original one-liner
 * toast({ title, message?, tone?, celebrate? })   -- tone: success | info | danger
 */
export function toast(message, ms = 3500) {
  const item = typeof message === "string" ? { title: message, tone: "info" } : { tone: "success", ...message };
  if (listeners.size) {
    const withId = { id: nextId++, ...item };
    for (const fn of listeners) {
      try {
        fn(withId);
      } catch {
        // One listener throwing must not stop the rest.
      }
    }
    return;
  }
  message = item.message ? `${item.title} — ${item.message}` : item.title;
  if (typeof document === "undefined") return;

  clearTimeout(timer);
  if (!current) {
    current = document.createElement("div");
    current.setAttribute("role", "status");
    current.setAttribute("aria-live", "polite");
    current.style.cssText = STYLE;
    document.body.appendChild(current);
  }
  current.textContent = message;

  // Next frame, so the transition has a starting point to move from.
  requestAnimationFrame(() => {
    if (!current) return;
    current.style.opacity = "1";
    current.style.transform = "translateX(-50%) translateY(0)";
  });

  timer = setTimeout(() => {
    if (!current) return;
    current.style.opacity = "0";
    current.style.transform = "translateX(-50%) translateY(8px)";
    const going = current;
    current = null;
    setTimeout(() => going.remove(), 220);
  }, ms);
}
