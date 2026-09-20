// A browser tab: the Web App, and dev.
//
// Two details of this path were wrong everywhere before it was pulled out.
// The anchor was never attached to the document, and some engines ignore a
// click on a detached one. And the object URL was revoked synchronously right
// after click(), which can cancel the download before it has started.

/** @type {import("./types").PlatformAdapter} */
export const browserAdapter = {
  name: "browser",

  async saveFile(blob, filename) {
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
  },

  // A browser tab has no share sheet worth the name, and a half-working share
  // is worse than an honest download: the file is on the machine either way.
  async shareFile(blob, filename) {
    return browserAdapter.saveFile(blob, filename);
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
