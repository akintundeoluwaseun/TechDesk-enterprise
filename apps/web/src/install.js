// "Install TechDesk" in a browser that will have it.
//
// Chrome fires beforeinstallprompt when a page is installable, and then does
// nothing visible unless the page asks. If nobody calls prompt(), the only
// route is a menu item most shop owners will never find -- so the offer is
// made here, once, in the page itself.
//
// Deliberately quiet: it appears only when the browser says installation is
// possible, it is dismissible, and a dismissal is remembered. A bar that
// comes back every morning is an advert, not an offer.
const DISMISSED = "techdesk_install_dismissed";

/**
 * Is this an iPhone or iPad?
 *
 * Safari has never fired beforeinstallprompt and is not going to, so a page
 * that only listens for it offers an iPhone nothing at all -- which is what
 * TechDesk did. iOS installs by hand: Share, then Add to Home Screen.
 *
 * iPadOS reports itself as a Mac, so the touch test is what tells an iPad
 * apart from a desktop Safari where none of this applies.
 */
function isApple() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** Already added to the home screen, so there is nothing to offer. */
function alreadyInstalled() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    // Safari's own flag, which predates display-mode and is still how iOS
    // reports it.
    window.navigator.standalone === true
  );
}

function dismissed() {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    // Storage blocked. Offering again is the lesser harm.
    return false;
  }
}

export function offerInstall() {
  if (typeof window === "undefined") return;

  // iOS gets the instructions, because there is no prompt to call. Shown
  // after a moment so it does not land on top of first paint, and only to a
  // Safari tab -- Chrome and Firefox on iOS cannot add to the home screen at
  // all, so telling them how would be telling them to do something they
  // cannot do.
  if (isApple() && !alreadyInstalled() && /Safari/.test(navigator.userAgent) &&
      !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)) {
    setTimeout(() => {
      if (!dismissed()) showApple();
    }, 3000);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome shows its own mini-infobar unless this is called, and that bar
    // cannot be styled or placed. Taking over means the offer sits where it
    // makes sense instead.
    event.preventDefault();
    if (dismissed()) return;
    show(event);
  });

  // Already installed: nothing to offer, and the banner would be nonsense.
  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* best effort */ }
    document.getElementById("td-install")?.remove();
  });
}

/**
 * The iPhone version: instructions, not a button.
 *
 * Nothing here can install anything -- only the person can, through Safari's
 * own Share menu -- so the bar's job is to say exactly where that is. The
 * share glyph is drawn rather than described, because "the share button" is
 * three different icons across three iOS versions and the arrow-out-of-a-box
 * is the one thing that has not changed.
 */
function showApple() {
  if (document.getElementById("td-install")) return;

  const bar = document.createElement("div");
  bar.id = "td-install";
  // Positioned at the top: the bar is pointing at Safari's toolbar, which is
  // where it would otherwise sit.
  bar.className = "td-install-apple";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Install TechDesk");
  bar.innerHTML = `
    <div class="td-install-text">
      <strong>Add TechDesk to your home screen</strong>
      <span>Tap <svg class="td-share" viewBox="0 0 24 24" width="15" height="15" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        aria-label="Share"><path d="M12 16V3"/><path d="m8 7 4-4 4 4"/>
        <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
        below, then <b>Add to Home Screen</b>.</span>
    </div>
    <div class="td-install-actions">
      <button type="button" id="td-install-no">Got it</button>
    </div>`;
  document.body.appendChild(bar);

  bar.querySelector("#td-install-no").addEventListener("click", () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* best effort */ }
    bar.remove();
  });
}

function show(event) {
  if (document.getElementById("td-install")) return;

  const bar = document.createElement("div");
  bar.id = "td-install";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Install TechDesk");
  bar.innerHTML = `
    <div class="td-install-text">
      <strong>Install TechDesk</strong>
      <span>Keep it on your home screen and open it like an app.</span>
    </div>
    <div class="td-install-actions">
      <button type="button" id="td-install-no">Not now</button>
      <button type="button" id="td-install-yes">Install</button>
    </div>`;
  document.body.appendChild(bar);

  const close = (remember) => {
    if (remember) {
      try { localStorage.setItem(DISMISSED, "1"); } catch { /* best effort */ }
    }
    bar.remove();
  };

  bar.querySelector("#td-install-no").addEventListener("click", () => close(true));
  bar.querySelector("#td-install-yes").addEventListener("click", async () => {
    bar.remove();
    event.prompt();
    // Whatever they choose, do not ask again this session. A second prompt
    // after a decision is nagging.
    try {
      await event.userChoice;
    } finally {
      try { localStorage.setItem(DISMISSED, "1"); } catch { /* best effort */ }
    }
  });
}

/** The service worker is what makes the browser consider this installable. */
export function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // No worker means no install offer. The app itself is unaffected, so
      // this is not worth interrupting a shop over.
    });
  });
}
