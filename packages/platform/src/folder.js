/**
 * Turning a written-file uri into something worth showing a person.
 *
 * "…/Documents/TechDesk/Ade - INV-00001.pdf" -> "Documents/TechDesk".
 *
 * Its own module so it can be tested without the Capacitor packages, which
 * only a mobile build installs. It earns that: this string is the entire
 * answer to "where did my receipt go", and getting it wrong is worse than
 * saying nothing, because the shop goes looking in the wrong folder.
 */
export function folderOf(uri) {
  try {
    const path = decodeURIComponent(String(uri)).replace(/^file:\/\//, "");
    const parts = path.split("/").filter(Boolean);
    return parts.slice(-3, -1).join("/") || "your files";
  } catch {
    return "your files";
  }
}
