// Where the shop's cloud account session lives in a browser.
//
// Same shape as hqStore.js, and for the same reason: on the desktop this is
// Electron's main process, which the renderer asks to sign in and never sees
// the password or the session token for. A browser has no such separation --
// one JavaScript context, one origin -- so the session lives in this tab's
// localStorage, and anything running on this origin can read it.
//
// Worth being plain about what that does and does not mean:
//   - the token lets this device read and write THIS shop's own records. It
//     is not the shop's password and cannot change it.
//   - clearing site data signs this device out. Nothing is lost -- the
//     account still has everything already pushed, and signing in again picks
//     up where the last sync cursor left off.
//   - a shared or public computer should not stay signed in to a shop's
//     account, for the same reason you would not leave the desktop app
//     signed in on one.

const KEY_STATE = "techdesk_web_account";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode, blocked storage, or a browser with cookies off. The app
    // still runs; it just cannot stay signed in across reloads.
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The session, or a signed-out state. Includes the tokens. */
export function readState() {
  const raw = read(KEY_STATE);
  if (!raw) return { signedIn: false, email: null };
  try {
    const state = JSON.parse(raw);
    return { ...state, signedIn: Boolean(state.accessToken) };
  } catch {
    return { signedIn: false, email: null };
  }
}

/** The session without its tokens, for anything that renders. */
export function readPublicState() {
  const { accessToken, refreshToken, ...rest } = readState();
  void accessToken; void refreshToken;
  return rest;
}

export function saveState(state) {
  const ok = write(KEY_STATE, JSON.stringify(state));
  // Reported rather than swallowed: a browser that cannot store this would
  // otherwise say "signed in" and forget on the next reload.
  return { ok };
}

export function clearState() {
  try {
    localStorage.removeItem(KEY_STATE);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
