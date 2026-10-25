import jsPDF from "jspdf";
import { db } from "../db";
import { pdfSafe } from "../pdfSafe";
import { currencyPdfSymbol } from "../currency";
import { fitFontSize, pdfLock, printedOnLine, builtByLine } from "./layout";

const WIDTH_MM = 58;
const MARGIN_MM = 3;
const LINE_H = 4.2;

export function buildThermalReceiptPdf(sale) {
  const settings = db.getSettings();
  const cur = currencyPdfSymbol(settings);
  const contentW = WIDTH_MM - MARGIN_MM * 2;

  const itemLines = (sale.items || []).length * 2;
  const contactLines = [settings.phone, settings.address, settings.email].filter(Boolean).length;

  // How many lines the customer's own name/email/address will actually wrap
  // to, measured before the roll's physical length is fixed -- a rough count
  // (itemLines above is exactly this kind of guess) would either waste paper
  // or, worse, cut real content off the bottom, and a wrapped name is exactly
  // the case a fixed one-line-per-field guess gets wrong.
  const scratch = new jsPDF({ unit: "mm", format: [WIDTH_MM, 100] });
  scratch.setFont("helvetica", "normal");
  scratch.setFontSize(7.5);
  const wrappedLineCount = (text) => scratch.splitTextToSize(String(text || ""), contentW).length;
  const customerExtraLines =
    Math.max(0, wrappedLineCount(pdfSafe(sale.customerName) || "Walk-in") - 1) +
    (sale.customerEmail ? Math.max(0, wrappedLineCount(pdfSafe(sale.customerEmail)) - 1) : 0) +
    (sale.customerAddress ? Math.max(0, wrappedLineCount(pdfSafe(sale.customerAddress)) - 1) : 0);

  // +14 for the two signature blocks (authorized, then customer): a label
  // line, room for the image (or a blank line to sign on) and a divider
  // each -- fixed regardless of whether either signature was actually
  // captured, so the page is never sized too short to fit one added later.
  // +1 for the printed-on line at the very bottom.
  const estimatedLines = 26 + itemLines + contactLines + 14 + 1 + customerExtraLines;
  const heightMM = Math.max(85, estimatedLines * LINE_H + 20);

  const doc = new jsPDF({ unit: "mm", format: [WIDTH_MM, heightMM], encryption: pdfLock() });
  let y = 5;

  const center = (text, size = 10, bold = false) => {
    if (!text) return;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(text, WIDTH_MM / 2, y, { align: "center" });
    y += LINE_H;
  };
  const left = (text, size = 8, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(text, MARGIN_MM, y);
    y += LINE_H;
  };
  const kv = (label, value, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(8);
    doc.text(label, MARGIN_MM, y);
    // Shrunk to fit whatever room is left after the label, not left to run
    // past the roll's own edge -- a long customer name or address at a fixed
    // 8pt used to print straight off a 58mm roll instead of stopping.
    const availW = WIDTH_MM - MARGIN_MM * 2 - doc.getTextWidth(label) - 2;
    fitFontSize(doc, String(value), availW, { max: 8, min: 5, style: bold ? "bold" : "normal" });
    doc.text(String(value), WIDTH_MM - MARGIN_MM, y, { align: "right" });
    y += LINE_H;
  };
  // Label on its own line, value wrapped beneath it -- for a field that can
  // genuinely run long (a customer's own name, email, address), a fixed
  // one-line layout either shrinks toward unreadable or, past that floor,
  // overlaps whatever it was measured against. Reserved for those fields;
  // kv() above stays the fast path for everything short.
  const kvWrap = (label, value) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label, MARGIN_MM, y);
    y += LINE_H;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.splitTextToSize(String(value), contentW).forEach((line) => {
      doc.text(line, MARGIN_MM, y);
      y += LINE_H;
    });
  };
  const divider = (dashed = true) => {
    if (dashed) doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_MM, y, WIDTH_MM - MARGIN_MM, y);
    if (dashed) doc.setLineDashPattern([], 0);
    y += LINE_H;
  };

  // ---- Logo ----
  // The shop's own, or nothing. A 58mm roll has no room to waste on an empty
  // box, and an empty box is what this drew before.
  const afterLogo = drawLogo(doc, settings, WIDTH_MM / 2, y, 30, 14);
  // The header line below is drawn on its baseline, so this has to clear a
  // 12pt ascent (~4.2mm) as well as leave a gap.
  y = afterLogo > y ? afterLogo + 6 : y;

  // ---- Header ----
  // Shrunk to fit the roll's own width, and wrapped if even the smallest
  // legible size still doesn't -- a 58mm roll has far less room than the A4
  // receipts even had, and a long registered shop name at a fixed 12pt used
  // to run straight off both edges with nothing catching it. Wrapping is
  // only reached for a genuinely long name: splitTextToSize hands back the
  // whole string as a single line whenever it already fits.
  const shopName = pdfSafe(settings.shopName || "TechDesk").toUpperCase();
  const shopNameSize = fitFontSize(doc, shopName, contentW, { max: 12, min: 8 });
  doc.splitTextToSize(shopName, contentW).forEach((line) => center(line, shopNameSize, true));
  if (settings.tagline) center(pdfSafe(settings.tagline), 6.5);
  if (settings.phone) center(pdfSafe(settings.phone), 6.5);
  if (settings.address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.splitTextToSize(pdfSafe(settings.address), contentW).forEach((l) => center(l, 6.5));
  }
  if (settings.email) center(pdfSafe(settings.email), 6.5);
  y += 0.5;
  divider(false);

  // ---- Title ----
  center("SALES RECEIPT", 9.5, true);
  y += 0.3;

  kv("Invoice No", sale.invoice);
  kv("Date", new Date(sale.createdAt).toLocaleDateString("en-GB"));
  kv("Time", new Date(sale.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  kv("Sold By", pdfSafe(sale.soldBy) || "Admin");
  divider();

  // ---- Customer ----
  left("CUSTOMER", 7.5, true);
  kvWrap("Name", pdfSafe(sale.customerName) || "Walk-in");
  if (sale.customerPhone) kv("Phone", pdfSafe(sale.customerPhone));
  if (sale.customerEmail) kvWrap("Email", pdfSafe(sale.customerEmail));
  if (sale.customerAddress) kvWrap("Address", pdfSafe(sale.customerAddress));
  divider();

  // ---- Items ----
  (sale.items || []).forEach((item) => {
    left(pdfSafe(item.name), 8);
    kv(`  ${item.qty} x ${cur}${Number(item.price).toLocaleString()}`, `${cur}${Number(item.price * item.qty).toLocaleString()}`);
  });
  divider();

  // ---- Totals ----
  kv("Subtotal", `${cur}${Number(sale.subtotal).toLocaleString()}`);
  if (sale.discount) kv("Discount", `-${cur}${Number(sale.discount).toLocaleString()}`);
  divider(false);
  kv("TOTAL", `${cur}${Number(sale.total).toLocaleString()}`, true);
  y += 1;
  divider();

  // ---- Payment ----
  left("PAYMENT", 7.5, true);
  kv("Method", pdfSafe(sale.paymentMethod) || "-");
  kv("Amount Paid", `${cur}${Number(sale.amountPaid || 0).toLocaleString()}`);
  const balance = Math.max(0, Number(sale.total) - Number(sale.amountPaid || 0));
  kv("Balance", `${cur}${balance.toLocaleString()}`);
  divider();

  // ---- Authorized signature ----
  left("AUTHORIZED SIGNATURE", 7.5, true);
  if (settings.ownerSignature) {
    // Signed once in Settings, printed on every receipt from then on.
    const afterOwnerSig = drawLogo(doc, { logo: settings.ownerSignature }, WIDTH_MM / 2, y, contentW - 6, 12);
    y = afterOwnerSig > y ? afterOwnerSig + 2 : y;
  } else {
    y += 6;
    doc.setLineWidth(0.2);
    doc.line(MARGIN_MM, y, WIDTH_MM - MARGIN_MM, y);
    y += 2;
  }
  divider();

  // ---- Customer signature ----
  left("CUSTOMER SIGNATURE", 7.5, true);
  if (sale.signature) {
    const afterSig = drawLogo(doc, { logo: sale.signature }, WIDTH_MM / 2, y, contentW - 6, 12);
    y = afterSig > y ? afterSig + 2 : y;
  } else {
    y += 6;
    doc.setLineWidth(0.2);
    doc.line(MARGIN_MM, y, WIDTH_MM - MARGIN_MM, y);
    y += 2;
  }
  divider();

  // ---- Footer ----
  y += 1;
  center("Thank you for your patronage!", 8, true);
  center("We appreciate your trust in us.", 6.5);
  if (settings.phone) center(pdfSafe(settings.phone), 6.5);
  y += 1;
  // Wrapped rather than shrunk further -- 6pt is already close to the
  // smallest legible size on a thermal roll, so a long name goes to a
  // second line instead of shrinking toward unreadable.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.splitTextToSize(`Powered by ${pdfSafe(settings.shopName || "TechDesk")}`, contentW).forEach((l) => center(l, 6));

  // When THIS COPY was produced -- distinct from the Date/Time up top, which
  // is when the sale happened and can be long past by the time this is
  // reprinted.
  y += 1;
  center(printedOnLine(), 6);

  // Last of everything, and wrapped: 58mm of paper is narrow enough that the
  // name and the address together do not fit on one line.
  y += 1;
  doc.setFontSize(5.5);
  doc.splitTextToSize(builtByLine(), contentW).forEach((l) => center(l, 5.5));

  return doc;
}

/**
 * The shop's logo at the top of a receipt, or nothing at all.
 *
 * This used to draw a bare rectangle as a "logo mark" on every receipt,
 * whether or not the shop had a logo. On a customer's copy that reads as a
 * picture that failed to load, not as a design -- and the shop had already
 * uploaded a real logo in Settings, which no receipt ever used.
 *
 * Returns the y to carry on from, so a shop with no logo simply starts
 * higher rather than leaving a hole where the box was.
 */
function drawLogo(doc, settings, centreX, y, maxW, maxH) {
  const data = settings.logo;
  if (!data || typeof data !== "string" || !data.startsWith("data:image/")) return y;

  try {
    const props = doc.getImageProperties(data);
    // Fit inside the box without stretching: a squashed logo looks worse
    // than a small one.
    const scale = Math.min(maxW / props.width, maxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    doc.addImage(data, centreX - w / 2, y, w, h);
    return y + h;
  } catch {
    // An unreadable or unsupported image must not take the whole receipt
    // down -- the sale still needs its paperwork.
    return y;
  }
}
