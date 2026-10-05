// A browser tab: the Web App, and dev.
//
// Two details of the anchor-download path were wrong everywhere before it
// was pulled out. The anchor was never attached to the document, and some
// engines ignore a click on a detached one. And the object URL was revoked
// synchronously right after click(), which can cancel the download before it
// has started.
//
// THE THIRD THING, found on iPhone. `<a download>` on a blob: URL is not
// reliable in Safari, in a tab or installed to the home screen -- sometimes
// it opens the PDF instead of saving it, and in standalone mode (no address
// bar, no browser chrome to fall back on) it can do nothing a shop can see
// happen at all. Tapping Save or Share on a receipt and watching nothing
// happen is exactly the failure this whole file exists to prevent, and it
// was still possible, on the one platform a shop is most likely to be
// holding when a customer is standing in front of them.
//
// canShareFile answers the actual question -- can THIS browser hand THIS
// file to the OS -- rather than guessing from the user agent. Where it says
// yes, the file goes to the native share sheet, whose first option is
// "Save to Files"; that is a real save, not a downgrade. Where it says no
// (desktop Chrome without a wired share target, Electron, a browser with no
// Web Share API at all) nothing changes: the anchor download below is byte
// -for-byte what it always was.
//
// But "can share" and "should reach for the share sheet on a Save tap" are
// different questions. Chrome on Android and recent desktop Chrome answer
// canShare's question "yes" too -- that is most of this app's actual traffic,
// not the exception. Routing all of it through a share sheet turned pressing
// Save into an unwanted "who do you want to send this to?" prompt on
// everything except Safari, which is the one browser the share-first path
// was actually written for. So the OS share sheet is reached for on a *save*
// only where the anchor download is the one known not to work at all --
// iOS/iPadOS Safari, in or out of the home-screen app -- and everywhere else
// the anchor is trusted to do exactly what it always did.

/** iOS and iPadOS Safari, the one shell `<a download>` on a blob: URL is
 * unreliable on -- iPadOS reports as "Macintosh" but keeps touch points a
 * real Mac never has. */
function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIPhoneFamily = /iPad|iPhone|iPod/.test(ua);
  const isIpadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return isIPhoneFamily || isIpadAsMac;
}

/** Would navigator.share actually accept this file, right now? */
async function canShareFile(file) {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    // A canShare that throws on a shape it does not expect is answering "no",
    // not crashing the save button.
    return false;
  }
}

/** Hand the file to the OS. Whatever it does with a cancel, saveFile.js's
 * caller already treats a message containing "cancel" as a success rather
 * than a failure -- there is nothing more to catch here. */
async function shareViaOs(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || "application/pdf" });
  if (!(await canShareFile(file))) return null;
  await navigator.share({ files: [file] });
  return { ok: true, via: "share" };
}

async function anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, via: "download" };
}

// A system notification from a browser tab or an Electron window. Through
// the service worker where there is one -- Chrome on Android refuses the
// plain constructor outright -- and the constructor everywhere else.
async function browserCanNotify(ask) {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "default" && ask) {
    try {
      return await Notification.requestPermission();
    } catch {
      return "default";
    }
  }
  return Notification.permission;
}

async function browserNotify({ title, body, tag }) {
  if ((await browserCanNotify(false)) !== "granted") return false;
  const options = { body, tag, icon: "./icon-192.png", badge: "./icon-192.png" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // Fall through to the constructor.
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

import { webSpeech } from "./speech";

/** @type {import("./types").PlatformAdapter} */
export const browserAdapter = {
  // Live speech-to-text where the browser has it (Chrome, Edge, Safari).
  get speech() { return webSpeech(); },

  name: "browser",

  async saveFile(blob, filename) {
    if (isIosSafari()) {
      return (await shareViaOs(blob, filename)) || anchorDownload(blob, filename);
    }
    return anchorDownload(blob, filename);
  },

  async shareFile(blob, filename) {
    return (await shareViaOs(blob, filename)) || anchorDownload(blob, filename);
  },

  async openFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      // Pop-up blocked. Falling back to a download beats doing nothing and
      // leaving the shop wondering whether the button works.
      URL.revokeObjectURL(url);
      return browserAdapter.saveFile(blob, filename);
    }
    // Long enough for the tab to have loaded it; revoking sooner shows a
    // blank viewer, which looks exactly like a broken button.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, via: "viewer" };
  },

  openExternal(url) {
    window.open(url, "_blank", "noopener");
  },

  notifyPermission: browserCanNotify,
  notify: browserNotify,
};
