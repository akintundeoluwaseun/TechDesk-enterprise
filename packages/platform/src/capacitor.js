// Android.
//
// A WebView has no download manager behind it, so the browser's anchor trick
// does nothing at all -- the tap silently fails. That was the bug: tapping
// save on a receipt and getting nothing.
//
// The file is written where the phone's own Files app can find it, rather
// than handed to the share sheet. Sharing was the wrong default: tapping
// "save" and being asked which app to send it to is not saving, and the
// receipt the shop wanted on the phone ended up nowhere.
//
// Documents is the most reliable public folder Capacitor's Filesystem can
// reach across Android versions; where a device redirects it, the uri that
// comes back still says where the file really went, and that is what
// `folder` quotes rather than a name we assumed.
//
// NOT REACHABLE YET. Nothing imports this in the desktop build, which is why
// the Capacitor packages are not a dependency of it. Step 8 of the merge
// points apps/mobile here and adds them. The logic below is carried across
// unchanged from the shipping Android app (techdesk-solo, 721cd53) rather
// than rewritten, so step 8 is a wiring job and not a porting job.
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { blobToBase64 } from "./blob";
import { folderOf } from "./folder";

/** @type {import("./types").PlatformAdapter} */
export const capacitorAdapter = {
  name: "capacitor",

  async saveFile(blob, filename) {
    const written = await Filesystem.writeFile({
      path: `TechDesk/${filename}`,
      data: await blobToBase64(blob),
      directory: Directory.Documents,
      recursive: true,
    });
    return { ok: true, via: "saved", uri: written.uri, folder: folderOf(written.uri) };
  },

  async shareFile(blob, filename) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: filename, url: written.uri });
    return { ok: true, via: "share" };
  },

  // Android has no "open in a viewer" a web app can call: the chooser the
  // share sheet puts up is how a PDF reaches a viewer or a print service.
  // So printing shares, and saving saves.
  async openFile(blob, filename) {
    return capacitorAdapter.shareFile(blob, filename);
  },

  openExternal(url) {
    window.open(url, "_blank", "noopener");
  },
};

