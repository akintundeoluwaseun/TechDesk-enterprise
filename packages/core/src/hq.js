// Head office, whichever shell is asking.
//
// The three steps a shop walks through are the same everywhere: ask for a
// code, the owner reads it out over the phone, the branch is connected. What
// differs is where the device token ends up, and that is not a detail:
//
//   Electron   -> the main process holds it; the renderer never sees it.
//   Browser    -> this origin's localStorage; there is no second process.
//   Android    -> the same, inside the app's own WebView.
//
// So there are two implementations, not one with holes in it, and this picks
// between them on the same question the platform layer asks: is there a
// native side to call?
//
// It used to ask a different question -- IS_DESKTOP_APP -- and answer "no" by
// refusing outright. That is why head office did not exist on a phone at all.
import { hasHostBridge } from "./bridge";
import { hqBridge } from "./hqBridge";
import { hqLocal } from "./hqLocal";
import { whenOn } from "./appControl";

function impl() {
  return hasHostBridge() ? hqBridge : hqLocal;
}

export const hq = {
  // Every shell can reach head office now. Whether this shop MAY is a
  // different question, asked of the tier in the app and of businesses.plan
  // on the server -- and only the second one decides anything.
  available: () => true,

  status: (...args) => impl().status(...args),
  // New connections follow the console's "Head office links" switch;
  // branches already connected keep syncing either way.
  connectStart: whenOn("hq", (...args) => impl().connectStart(...args)),
  connectVerify: whenOn("hq", (...args) => impl().connectVerify(...args)),
  sync: (...args) => impl().sync(...args),
  disconnect: (...args) => impl().disconnect(...args),

  // A disconnect made with no signal still has to reach the server, or the
  // device goes on being listed at head office. Called on launch and when the
  // network comes back.
  flushRevoke: (...args) => impl().flushRevoke?.(...args) ?? { ok: true, pending: false },
};

export { hqBridge, hqLocal };
