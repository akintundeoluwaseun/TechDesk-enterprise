// Turning rows into CSV text. Nothing here knows how a file reaches anyone --
// that is the host's job.

// Escapes a value for a CSV cell: wraps in quotes and doubles any inner
// quotes whenever the value contains a comma, quote, or newline.
function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
