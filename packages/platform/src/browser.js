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

/** @type {import("./types").PlatformAdapter} */
export const browserAdapter = {
  name: "browser",

  async saveFile(blob, filename) {
    return (await shareViaOs(blob, filename)) || anchorDownload(blob, filename);
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
};
