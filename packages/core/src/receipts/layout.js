// Two things every generated document needs, done slightly differently in
// every place that drew a header -- which is how a fix to one (the sales
// receipt learned to draw the shop's own logo) left the others with a logo
// too small to see, or with none at all, and left every one of them with a
// shop name that could print directly on top of whatever else shared its row.

/**
 * The largest font size, no bigger than `max`, at which `text` fits within
 * `maxWidth`.
 *
 * The bug this exists to fix: a shop's own name, drawn at a fixed size
 * beside a centred document title, printed directly ON TOP of that title
 * the moment the name was longer than whoever wrote the layout had in mind.
 * "TechDesk" never reached it. A real ticket, printed by a real shop with a
 * long registered name, did -- the name and the title overlapping into a
 * single unreadable smear.
 *
 * Never shrinks past `min` -- past that point a name is left to run wide
 * rather than made illegible, which is the less bad of the two failures.
 */
export function fitFontSize(doc, text, maxWidth, { max = 22, min = 9, font = "helvetica", style = "bold" } = {}) {
  doc.setFont(font, style);
  let size = max;
  while (size > min) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) break;
    size -= 1;
  }
  doc.setFontSize(size);
  return size;
}

/**
 * The shop's own logo, scaled to fit inside maxW x maxH without stretching --
 * a squashed logo looks worse than a small one, and a small one was exactly
 * the complaint this exists to fix: the repair ticket's logo box was 26x20pt,
 * which on a printed page is barely a smudge next to the shop's own name.
 *
 * Draws from its left edge (align: "left", the default) or centred on `x`
 * (align: "center"). Returns the height it actually drew at, or 0 when
 * there was no logo to draw at all -- so a shop with none gets its layout
 * space back rather than an empty box shaped like a broken image.
 */
export function drawLogo(doc, settings, x, y, maxW, maxH, { align = "left" } = {}) {
  const data = settings.logo;
  if (!data || typeof data !== "string" || !data.startsWith("data:image/")) return 0;
  try {
    const props = doc.getImageProperties(data);
    const scale = Math.min(maxW / props.width, maxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    doc.addImage(data, align === "center" ? x - w / 2 : x, y, w, h);
    return h;
  } catch {
    // An unreadable image must not stop the document printing.
    return 0;
  }
}
