// Updating the website's APK from inside the app: download the new APK and
// hand it to Android's own installer. The person sees Android's "Do you want
// to update this app?" and taps Update; their records stay, because it's the
// same app signed with the same key. (The Google Play build never uses this:
// Play updates it.)
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";

export const capacitorUpdate = {
  async install(url, onProgress) {
    let listener = null;
    try {
      if (onProgress) {
        listener = await Filesystem.addListener("progress", (p) => {
          if (p?.contentLength > 0) onProgress(Math.min(1, p.bytes / p.contentLength));
        });
      }
      await Filesystem.downloadFile({
        url,
        path: "techdesk-update.apk",
        directory: Directory.Cache,
        progress: !!onProgress,
        recursive: true,
      });
      // The file:// address, which is what the opener hands to the installer.
      const { uri } = await Filesystem.getUri({ path: "techdesk-update.apk", directory: Directory.Cache });
      await FileOpener.open({ filePath: uri, contentType: "application/vnd.android.package-archive" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    } finally {
      listener?.remove?.();
    }
  },
};
