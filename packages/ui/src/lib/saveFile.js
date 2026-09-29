// Delivering a generated file, and saying what happened.
//
// WHERE a file goes is the platform package's problem -- a download, a write
// into the phone's Documents, a viewer tab. What is left here is the policy
// the shop actually experiences: saving saves and never opens a chooser,
// sharing only happens from a button that says share, and a failure is never
// silent. Tapping save and getting nothing is the bug this module exists to
// prevent, so a real failure gets said out loud.
import { platform } from "@techdesk/platform";
import { toast } from "./toast";
import { isFreePrinting, printsLeft, recordPrint, FREE_PRINTS_PER_MONTH } from "./outputAllowance";
import { addWatermark } from "./watermark";
import { openUpgrade } from "./upgradeModal";

/**
 * The free plan's printing rule, in one place: stamp the page and count it,
 * or -- once this month's ten are used -- say so and open the upgrade screen
 * instead. Returns false when the print must not go ahead. A paid shop walks
 * straight through.
 */
export function freePrintGate(doc) {
  if (!isFreePrinting()) return true;
  if (printsLeft() <= 0) {
    toast({
      title: `You've used this month's ${FREE_PRINTS_PER_MONTH} free prints`,
      message: "Upgrade to Business for unlimited printing without the TechDesk stamp.",
      tone: "info",
    });
    openUpgrade();
    return false;
  }
  addWatermark(doc);
  recordPrint();
  const left = printsLeft();
  if (left <= 3) toast({ title: `${left} free print${left === 1 ? "" : "s"} left this month`, tone: "info" });
  return true;
}

// Naming a receipt is core's job; delivering it is this file's.
export { receiptFilename } from "@techdesk/core";

export async function saveBlob(blob, filename, { share = false } = {}) {
  const shell = platform();
  try {
    const result = share
      ? await shell.shareFile(blob, filename)
      : await shell.saveFile(blob, filename);

    // Only worth saying on a platform that put the file somewhere the shop
    // would otherwise have to go looking for. A browser download announces
    // itself; a write into Documents does not.
    if (!share && result.folder) toast(`Saved to ${result.folder}`);
    return result;
  } catch (err) {
    const message = String(err?.message || err);
    // A cancelled share sheet isn't a failure -- the file is written either way.
    if (/cancel/i.test(message)) return { ok: true, via: "cancelled" };
    try {
      window.alert(`Couldn't save ${filename}.\n\n${message}`);
    } catch {
      /* no alert available; the return value still reports it */
    }
    return { ok: false, error: message };
  }
}

// jsPDF hands back a real Blob, so PDFs and CSVs share one path.
export function savePdf(doc, filename) {
  return saveBlob(doc.output("blob"), filename);
}

/** The share sheet, for a button that says share. */
export function sharePdf(doc, filename) {
  return saveBlob(doc.output("blob"), filename, { share: true });
}

/**
 * Opens the PDF in whatever views PDFs here, instead of saving it.
 *
 * On a phone that is the system viewer, reached through the share sheet --
 * Android's WebView has no viewer of its own. On a desktop it is a new
 * window, where the print button is one click away. Either way nothing lands
 * in Downloads that the shop has to tidy up.
 */
export async function printPdf(doc, filename) {
  if (!freePrintGate(doc)) return { ok: false, error: "free_print_limit" };
  try {
    return await platform().openFile(doc.output("blob"), filename);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
