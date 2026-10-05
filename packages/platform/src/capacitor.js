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
// Saving is a fallback chain, not one call, because Android changed the
// rules underneath it. See saveFile.
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { LocalNotifications } from "@capacitor/local-notifications";
import { blobToBase64 } from "./blob";
import { folderOf } from "./folder";
import { capacitorSpeech } from "./capacitorSpeech";
import { capacitorUpdate } from "./capacitorUpdate";
import { capacitorBilling } from "./capacitorBilling";

/** @type {import("./types").PlatformAdapter} */
export const capacitorAdapter = {
  name: "capacitor",

  // The phone's own speech recogniser, for the assistant's mic.
  speech: capacitorSpeech,

  // Downloads a new APK and opens Android's installer for it.
  appUpdate: capacitorUpdate,

  // Google Play Billing. Only the Play Store build offers it (store.js).
  billing: capacitorBilling,

  async saveFile(blob, filename) {
    const data = await blobToBase64(blob);

    // Android 10 and older let an app write the phone's own Documents
    // folder, and that is still the best answer where it works: the file is
    // simply there afterwards, findable in Files, with no extra tap.
    try {
      const written = await Filesystem.writeFile({
        path: `TechDesk/${filename}`,
        data,
        directory: Directory.Documents,
        recursive: true,
      });
      return { ok: true, via: "saved", uri: written.uri, folder: folderOf(written.uri) };
    } catch {
      // Android 11 and newer refuse it outright -- scoped storage, EACCES,
      // and no permission an ordinary app can ask for. This was a hard
      // failure on every modern phone: a shop tapped save on a receipt and
      // got a permission-denied dialog with a file path in it.
    }

    // So: write somewhere that always works and hand it straight to the
    // system sheet, which is where "Save to Files", Drive and WhatsApp all
    // live. One more tap than it used to be, and it is the tap that decides
    // where the receipt goes -- which on a phone is usually to the customer.
    const written = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: filename, url: written.uri });
    return { ok: true, via: "share" };
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

  // Android 13+ shows nothing without this permission.
  async notifyPermission(ask) {
    try {
      const state = (p) => (p.display === "granted" ? "granted" : p.display === "denied" ? "denied" : "default");
      const now = state(await LocalNotifications.checkPermissions());
      if (now !== "default" || !ask) return now;
      return state(await LocalNotifications.requestPermissions());
    } catch {
      return "unsupported";
    }
  },

  async notify({ title, body, tag }) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          // Android wants a positive 32-bit int; the tag is a string.
          id: notificationId(tag || title + body),
          title,
          body,
          schedule: { at: new Date(Date.now() + 100) },
        }],
      });
      return true;
    } catch {
      return false;
    }
  },
};

function notificationId(key) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

