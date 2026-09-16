// Where the session token lives on the phone.
//
// Capacitor Preferences when it is there, which on Android is real app
// storage that survives the WebView clearing its cache. localStorage is the
// fallback so the app still runs in a browser during development.
//
// Losing the token costs a sign-in, not data -- everything is on the server.

const KEY = "techdesk_monitor_session";

// Boxed, and never returned bare from an async function.
//
// Capacitor plugins are Proxy objects. Returning one from an async function
// makes JavaScript treat it as a thenable and call .then() on it, which the
// proxy answers as a plugin method that does not exist -- so the await never
// settles and the app hangs on its loading screen forever. The box is what
// stops the engine ever seeing the proxy in return position.
let box = null;
async function preferences() {
  if (box) return box;
  try {
    const mod = await import("@capacitor/preferences");
    box = { plugin: mod.Preferences ?? null };
  } catch {
    box = { plugin: null };
  }
  return box;   // the BOX, never the proxy inside it
}

export const session = {
  async get() {
    const { plugin: p } = await preferences();
    if (p) {
      try {
        const { value } = await p.get({ key: KEY });
        return value || null;
      } catch { /* fall through to localStorage */ }
    }
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },

  async set(token) {
    const { plugin: p } = await preferences();
    if (p) {
      try {
        await p.set({ key: KEY, value: token });
        return;
      } catch { /* fall through */ }
    }
    try {
      localStorage.setItem(KEY, token);
    } catch { /* a phone with no storage still works until it is closed */ }
  },

  async clear() {
    const { plugin: p } = await preferences();
    if (p) {
      try {
        await p.remove({ key: KEY });
      } catch { /* fall through */ }
    }
    try {
      localStorage.removeItem(KEY);
    } catch { /* nothing to do */ }
  },
};
