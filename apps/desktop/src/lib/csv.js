// Delivering a CSV. Building the text is core's rowsToCsv; handing the file
// to the person is this.
import { saveBlob } from "./saveFile";
export { rowsToCsv } from "@techdesk/core";

export function downloadCsv(filename, csvString) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  return saveBlob(blob, filename);
}
