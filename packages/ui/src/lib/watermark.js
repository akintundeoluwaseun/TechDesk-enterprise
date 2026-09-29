// "TechDesk" across every page a free shop prints.
//
// Big, diagonal and faint, so the receipt is still perfectly readable for the
// customer -- it just says where it came from. A line at the foot says the
// stamp comes off with Business.
const PT_TO_MM = 25.4 / 72;
const ANGLE = 35;

export function addWatermark(doc, text = "TechDesk") {
  const pages = doc.getNumberOfPages?.() || 1;
  const unitPerPt = doc.internal.scaleFactor ? 1 / doc.internal.scaleFactor : PT_TO_MM;

  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const rad = (ANGLE * Math.PI) / 180;

    // Sized so the word spans most of the page along the diagonal it sits on,
    // whether that's an A4 invoice or a long 58mm roll -- measured, not guessed.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(100);
    const widthAt100 = doc.getTextWidth(text);
    // The longest line at this angle that stays inside the page.
    const reach = Math.min(w / Math.cos(rad), h / Math.sin(rad)) * 0.8;
    const size = Math.max(12, (100 * reach) / widthAt100);
    doc.setFontSize(size);
    const tw = doc.getTextWidth(text);
    const capHalf = size * unitPerPt * 0.35;

    // jsPDF rotates about the text's start point, so work that out from the
    // centre: back half the width along the angle, and down half the letter
    // height across it, to put the middle of the word on the middle of the page.
    const cx = w / 2;
    const cy = h / 2;
    const x = cx - (tw / 2) * Math.cos(rad) + capHalf * Math.sin(rad);
    const y = cy + (tw / 2) * Math.sin(rad) + capHalf * Math.cos(rad);

    doc.saveGraphicsState?.();
    if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 0.09 }));
    doc.setTextColor(30, 30, 30);
    doc.text(text, x, y, { angle: ANGLE });
    doc.restoreGraphicsState?.();

    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(Math.max(5, Math.min(8, w / 12)));
    doc.text("Made with TechDesk Free", w / 2, h - Math.max(3, h * 0.012), { align: "center" });
  }
  doc.setTextColor(0, 0, 0);
  return doc;
}
