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

export function offerInstall() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome shows its own mini-infobar unless this is called, and that bar
    // cannot be styled or placed. Taking over means the offer sits where it
    // makes sense instead.
    event.preventDefault();
    try {
      if (localStorage.getItem(DISMISSED) === "1") return;
    } catch {
      // Storage blocked. Offering again is the lesser harm.
    }
    show(event);
  });

  // Already installed: nothing to offer, and the banner would be nonsense.
  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* best effort */ }
    document.getElementById("td-install")?.remove();
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
