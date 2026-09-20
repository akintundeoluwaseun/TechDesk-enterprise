// What a saved receipt is called.
//
// Naming the document is part of producing it, not part of delivering it, so
// it lives with the builders. Strips what filesystems refuse and collapses the
// rest, because a customer called "Ade / Bola" must not create a folder.
export function receiptFilename(customerName, reference, suffix = "") {
  const who = String(customerName || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const ref = String(reference || "receipt").trim();
  const tail = suffix ? `-${suffix}` : "";
  return who ? `${who} - ${ref}${tail}.pdf` : `${ref}${tail}.pdf`;
}
