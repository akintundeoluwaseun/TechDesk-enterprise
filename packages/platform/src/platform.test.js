import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { browserAdapter } from "./browser";
import { electronAdapter } from "./electron";
import { folderOf } from "./folder";
import { currentShell, IS_ANDROID_APP, IS_DESKTOP_APP } from "./shell";
import { platform, setPlatform } from "./index";

describe("which shell", () => {
  it("a plain browser is neither Android nor desktop", () => {
    expect(IS_ANDROID_APP).toBe(false);
    expect(IS_DESKTOP_APP).toBe(false);
    expect(currentShell()).toBe("browser");
  });
});

describe("choosing an adapter", () => {
  afterEach(() => setPlatform(null));

  it("uses the browser in a plain tab", () => {
    expect(platform().name).toBe("browser");
  });

  it("uses whatever the host registers, over its own guess", () => {
    setPlatform({ name: "capacitor" });
    expect(platform().name).toBe("capacitor");
  });
});

describe("the browser adapter", () => {
  let clicked;
  beforeEach(() => {
    clicked = null;
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    // Record the anchor instead of letting jsdom navigate.
    HTMLAnchorElement.prototype.click = function () { clicked = this; };
  });

  it("attaches the anchor before clicking it", async () => {
    // It used to click a detached anchor, which some engines ignore
    // entirely -- the save button did nothing and said nothing.
    let attachedAtClickTime = false;
    HTMLAnchorElement.prototype.click = function () {
      clicked = this;
      attachedAtClickTime = document.body.contains(this);
    };
    await browserAdapter.saveFile(new Blob(["x"]), "receipt.pdf");
    expect(attachedAtClickTime).toBe(true);
  });

  it("names the download what it was asked to", async () => {
    await browserAdapter.saveFile(new Blob(["x"]), "Ade - INV-00001.pdf");
    expect(clicked.download).toBe("Ade - INV-00001.pdf");
  });

  it("does not revoke the url before the download can start", async () => {
    await browserAdapter.saveFile(new Blob(["x"]), "receipt.pdf");
    // Revoking synchronously after click() can cancel the download.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to a download when the viewer is pop-up blocked", async () => {
    window.open = vi.fn(() => null);
    const res = await browserAdapter.openFile(new Blob(["x"]), "receipt.pdf");
    expect(res).toEqual({ ok: true, via: "download" });
  });

  it("reports the viewer when a window does open", async () => {
    window.open = vi.fn(() => ({}));
    const res = await browserAdapter.openFile(new Blob(["x"]), "receipt.pdf");
    expect(res).toEqual({ ok: true, via: "viewer" });
  });
});

// Found on iPhone: <a download> on a blob: URL is not reliable in Safari, in
// a tab or installed to the home screen. It can open the PDF instead of
// saving it, or -- in standalone mode, with no browser chrome to fall back
// on -- do nothing a shop can see happen at all. navigator.share, where the
// OS actually accepts files, is the one path known to work there.
describe("the browser adapter reaches for the OS share sheet first", () => {
  let shared;
  beforeEach(() => {
    shared = null;
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });
  afterEach(() => {
    delete navigator.share;
    delete navigator.canShare;
  });

  it("hands the file to navigator.share when the OS can take it", async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn(async (payload) => { shared = payload; });

    const res = await browserAdapter.saveFile(new Blob(["x"], { type: "application/pdf" }), "Ade - INV-00001.pdf");

    expect(res).toEqual({ ok: true, via: "share" });
    expect(shared.files[0].name).toBe("Ade - INV-00001.pdf");
    // The anchor path must not have run as well -- one delivery, not two.
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("shareFile takes the same path as saveFile -- there is a real share sheet now", async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn(async () => {});
    const res = await browserAdapter.shareFile(new Blob(["x"]), "receipt.pdf");
    expect(res).toEqual({ ok: true, via: "share" });
  });

  it("falls back to the anchor untouched where canShare says no", async () => {
    // Most of the world: desktop Chrome with no share target wired up,
    // Electron, any browser with no Web Share API at all. This is the exact
    // path every test above this describe block already covers -- it must
    // not have changed.
    navigator.canShare = vi.fn(() => false);
    navigator.share = vi.fn();
    const res = await browserAdapter.saveFile(new Blob(["x"]), "receipt.pdf");
    expect(res).toEqual({ ok: true, via: "download" });
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it("falls back to the anchor where navigator.share does not exist at all", async () => {
    // jsdom's own baseline, and Electron's renderer: no polyfill assumed.
    expect(typeof navigator.share).toBe("undefined");
    const res = await browserAdapter.saveFile(new Blob(["x"]), "receipt.pdf");
    expect(res).toEqual({ ok: true, via: "download" });
  });

  it("does not crash the save button when canShare throws on an unexpected shape", async () => {
    navigator.share = vi.fn();
    navigator.canShare = vi.fn(() => {
      throw new Error("not supported");
    });
    const res = await browserAdapter.saveFile(new Blob(["x"]), "receipt.pdf");
    expect(res).toEqual({ ok: true, via: "download" });
  });
});

describe("the electron adapter", () => {
  it("delivers like a browser but answers to its own name", () => {
    expect(electronAdapter.name).toBe("electron");
    expect(electronAdapter.saveFile).toBe(browserAdapter.saveFile);
  });
});

describe("where the file went", () => {
  it("names the folder a phone actually wrote to", () => {
    expect(folderOf("file:///storage/emulated/0/Documents/TechDesk/Ade%20-%20INV-00001.pdf"))
      .toBe("Documents/TechDesk");
  });

  it("says something honest when the uri makes no sense", () => {
    // Better a vague truth than a confident wrong folder: a shop sent to the
    // wrong place concludes the file was never saved.
    expect(folderOf(null)).toBe("your files");
    expect(folderOf("receipt.pdf")).toBe("your files");
  });
});
