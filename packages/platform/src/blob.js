/**
 * A Blob as base64, without the "data:<type>;base64," prefix.
 *
 * Capacitor's Filesystem takes base64, not a Blob, so this is the bridge
 * between what jsPDF hands back and what a phone can write.
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
