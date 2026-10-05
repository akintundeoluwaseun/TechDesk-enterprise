// Voice orders: what the shop said, turned into records it has checked.
//
//   1. send()      the recording (or typed words) and the product NAMES go to
//                  the voice-order function, which asks Gemini what was said
//                  and returns plain actions ("sale", "repair", "stock", ...).
//   2. resolve()   each action is matched here, on the device, against this
//                  shop's own products, customers and repairs -- none of which
//                  ever left it. Anything that doesn't match cleanly becomes
//                  an issue the person has to settle before it can be saved.
//   3. apply()     only the drafts the person ticked and confirmed are saved,
//                  through the same db calls the forms use, and each one
//                  leaves an undo step behind.
//
// A photo of a page from the shop's old notebook goes the same way: the
// picture instead of a recording. Its actions carry the date written on the
// page, so the sale lands on the day it happened, and old sales don't take
// from today's stock count unless the person says so.
//
// Totals are always worked out here from the shop's own prices -- never
// taken from what the AI heard.
import { db } from "./db";
import { storage } from "./storage";
import { installId } from "./hqStore";
import { featureOn, pausedResult } from "./appControl";
import { answerQuestion, periodRange } from "./assistantAnswers";
import { addHistory } from "./assistantHistory";
import { repairOwed } from "./summary";

const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";
const CONSENT_KEY = "techdesk_voice_consent";

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "POS", "Transfer + Cash"];
export const REPAIR_STATUSES = ["received", "in progress", "awaiting parts", "completed", "delivered"];

// ------------------------------------------------------------ consent ----
export function hasVoiceConsent() {
  return storage.getItem(CONSENT_KEY) === "1";
}
export function giveVoiceConsent() {
  storage.setItem(CONSENT_KEY, "1");
}

// ------------------------------------------------------------ network ----
/** A real answer from TechDesk's server, not just "Wi-Fi is on". */
export async function isOnline({ fetchImpl = typeof fetch !== "undefined" ? fetch : null, timeoutMs = 5000 } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (!fetchImpl) return false;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    await fetchImpl(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE_KEY }, signal: ctl?.signal });
    return true;
  } catch {
    return false;
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Sends the voice note (base64 WAV), a notebook photo (base64 JPEG) or typed text. Returns {ok, transcript, actions} or {ok:false, message}. */
export async function send({ audio, mime = "audio/wav", image, imageMime = "image/jpeg", text } = {}, { fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
  if (!featureOn("ai")) return pausedResult("ai");
  if (!fetchImpl) return { ok: false, error: "offline", message: "Connect to the internet to use voice orders." };
  const products = db.getInventory().map((p) => p.name).filter(Boolean).slice(0, 400);
  let res;
  try {
    res = await fetchImpl(`${SUPABASE_URL}/functions/v1/voice-order`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        installId: installId(),
        audio,
        mime: audio ? mime : undefined,
        image,
        imageMime: image ? imageMime : undefined,
        text,
        products,
        today: new Date().toDateString(),
      }),
    });
  } catch {
    return { ok: false, error: "offline", message: "Connect to the internet to use voice orders." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || "server_error", message: data?.message || "Couldn't understand that just now. Try again." };
  }
  return { ok: true, transcript: data.transcript || "", actions: Array.isArray(data.actions) ? data.actions : [], left: data.left };
}

// ----------------------------------------------------------- matching ----
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const digits = (s) => String(s || "").replace(/\D/g, "");
// Plurals and the odd typo: "chargers" is "charger", "batteries" is "battery".
const stem = (w) => w.replace(/ies$/, "y").replace(/(ss)$/, "$1").replace(/s$/, "");

/** Products that could be what was said, best first. {product, candidates}. */
export function matchProduct(said, inventory) {
  const name = String(said || "").trim().toLowerCase();
  if (!name) return { product: null, candidates: [] };
  const exact = inventory.filter((p) => String(p.name || "").trim().toLowerCase() === name);
  if (exact.length === 1) return { product: exact[0], candidates: exact };
  const want = new Set(words(said).map(stem));
  const scored = inventory
    .map((p) => {
      const have = words(p.name).map(stem);
      const hits = have.filter((w) => want.has(w)).length;
      return { p, score: hits / Math.max(want.size, 1) + hits / Math.max(have.length, 1) / 4 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 4).map((x) => x.p);
  // A clear winner: everything it heard is in the name, and nothing else comes close.
  if (scored.length && scored[0].score >= 1 && (scored.length === 1 || scored[0].score - scored[1].score >= 0.2)) {
    return { product: scored[0].p, candidates };
  }
  return { product: null, candidates };
}

/** The customer that was meant: by phone if one was said, else by name. {customer, candidates}. */
export function matchCustomer(name, phone, customers) {
  const ph = digits(phone).slice(-10);
  if (ph.length >= 7) {
    const byPhone = customers.filter((c) => digits(c.phone).slice(-10) === ph);
    if (byPhone.length === 1) return { customer: byPhone[0], candidates: byPhone };
  }
  const n = String(name || "").trim().toLowerCase();
  if (!n) return { customer: null, candidates: [] };
  const exact = customers.filter((c) => String(c.name || "").trim().toLowerCase() === n);
  if (exact.length === 1) return { customer: exact[0], candidates: exact };
  const first = words(name)[0];
  const partial = customers.filter((c) => words(c.name).includes(first));
  if (exact.length === 0 && partial.length === 1) return { customer: partial[0], candidates: partial };
  if (exact.length || partial.length) return { customer: null, candidates: (exact.length ? exact : partial).slice(0, 4) };
  // Nothing spelt the same. Phones write Nigerian names the way they sound
  // in English ("Bola Oluwa to in" for Bola Oluwatoyin, "Chee dee" for
  // Chidi), so compare how the names sound instead.
  const scored = customers
    .map((c) => ({ c, score: nameLikeness(name, c.name) }))
    .filter((x) => x.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 4).map((x) => x.c);
  if (scored.length && scored[0].score >= 0.72 && (scored.length === 1 || scored[0].score - scored[1].score >= 0.12)) {
    return { customer: scored[0].c, candidates };
  }
  return { customer: null, candidates };
}

/** A name squashed to how it sounds: no spaces, doubled letters and silent h's dropped, sound-alikes made one. */
export function soundKey(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Yorùbá tone marks: Olúwatóyìn -> oluwatoyin
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f").replace(/ck|q/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k")
    .replace(/ee|ea|ie/g, "i").replace(/oo|ou/g, "u").replace(/y/g, "i")
    .replace(/(?<=[^aeiou])h/g, "").replace(/w(?=[aeiou])/g, "w")
    .replace(/z/g, "s").replace(/(.)\1+/g, "$1");
}

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); }
  return out;
}
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let both = 0;
  for (const [g, n] of A) both += Math.min(n, B.get(g) || 0);
  return (2 * both) / (a.length - 1 + b.length - 1);
}

/**
 * How alike two names sound, 0 to 1: the whole name, or just the first name
 * when only that was said ("Toyin" heard as "toy in").
 */
export function nameLikeness(said, name) {
  const a = soundKey(said), b = soundKey(name);
  if (!a || !b) return 0;
  const whole = dice(a, b);
  const parts = String(name || "").split(/\s+/).map(soundKey).filter((x) => x.length >= 3);
  const one = parts.length > 1 ? Math.max(...parts.map((p) => dice(a, p))) * 0.95 : 0;
  const inside = a.length >= 4 && b.includes(a) ? 0.75 : 0; // a part of the name, run together
  return Math.max(whole, one, inside);
}

function ticketNumber(t) {
  const d = digits(t);
  return d ? Number(d) : null;
}

/** The repair a status change or payment is about: by ticket, else this customer's open job. */
export function matchRepair(action, repairs, customer) {
  const t = ticketNumber(action.ticket);
  if (t != null) {
    const hit = repairs.filter((r) => ticketNumber(r.ticket) === t);
    if (hit.length === 1) return { repair: hit[0], candidates: hit };
  }
  const open = repairs.filter((r) => r.status !== "delivered");
  let pool = customer ? open.filter((r) => r.customerId === customer.id || (r.customerName || "").toLowerCase() === (customer.name || "").toLowerCase()) : [];
  if (!pool.length && action.customerName) {
    const first = words(action.customerName)[0];
    pool = open.filter((r) => words(r.customerName).includes(first));
  }
  if (action.device && pool.length > 1) {
    const dev = new Set(words(action.device));
    const narrowed = pool.filter((r) => words(r.device).some((w) => dev.has(w)));
    if (narrowed.length) pool = narrowed;
  }
  return pool.length === 1 ? { repair: pool[0], candidates: pool } : { repair: null, candidates: pool.slice(0, 4) };
}

// ------------------------------------------------------------- drafts ----
let draftSeq = 0;
const nextId = () => `vd${Date.now().toString(36)}${(draftSeq++).toString(36)}`;

function customerField(action, customers) {
  const m = matchCustomer(action.customerName, action.customerPhone, customers);
  return {
    id: m.customer?.id || null,
    name: m.customer?.name || action.customerName || "",
    phone: m.customer?.phone || action.customerPhone || "",
    candidates: m.customer ? [] : m.candidates,
  };
}

const pad = (n) => String(n).padStart(2, "0");
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" as a moment on that day (midday, so no timezone can tip it over). Today stays "now". */
export function dayToISO(day, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!m || day >= localDay(now)) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0).toISOString();
}

const DAY = 86400000;
const shortDay = (iso, now) => {
  const d = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/**
 * The sale something was returned from: by customer, item and when. Two
 * Johns, or two laptops, and the shop is asked which -- never guessed.
 */
function findReturn(a, { sales, customers }, now) {
  const m = a.customerName || a.customerPhone ? matchCustomer(a.customerName, a.customerPhone, customers) : null;
  const people = !m ? null : m.customer ? [m.customer] : m.candidates;
  const first = words(a.customerName)[0];
  const exact = m?.customer || null; // "John Okoro": only his sales; "John": any John's
  const forCustomer = (s) => !people ? true
    : exact ? s.customerId === exact.id || String(s.customerName || "").toLowerCase() === String(exact.name || "").toLowerCase()
    : people.some((c) => s.customerId === c.id) || (!!first && words(s.customerName).includes(first));
  const want = new Set(words(a.product).map(stem));
  const itemFits = (i) => !want.size || words(i.name).map(stem).some((w) => want.has(w));
  const [from, to] = a.date ? [new Date(`${a.date}T00:00:00`), new Date(new Date(`${a.date}T00:00:00`).getTime() + DAY)]
    : a.period ? periodRange(a.period, now) : [new Date(now.getTime() - 90 * DAY), new Date(now.getTime() + DAY)];
  const inWindow = (s) => { const t = new Date(s.createdAt).getTime(); return t >= from.getTime() && t < to.getTime(); };
  const collect = (filter, fits = itemFits) => sales.filter(filter).filter(forCustomer).flatMap((s) =>
    (s.items || []).map((i, idx) => ({ i, idx, s })).filter(({ i }) => fits(i)).map(({ i, idx, s }) => ({
      saleId: s.id, idx, invoice: s.invoice, customerName: s.customerName || "Walk-in", customerId: s.customerId || null,
      name: i.name, qty: Number(i.qty || 0), price: Number(i.price || 0), at: s.createdAt,
      label: `${s.customerName || "Walk-in"} · ${i.name}${Number(i.qty) > 1 ? ` ×${i.qty}` : ""} · ${s.invoice || ""} · ${shortDay(s.createdAt, now)}`,
    })));
  // When they said "yesterday" but it was the day before, look a little wider rather than find nothing.
  let matches = collect(inWindow);
  if (!matches.length && (a.period || a.date)) matches = collect((s) => new Date(s.createdAt).getTime() >= now.getTime() - 30 * DAY);
  // "The laptop" when the stock calls it "HP EliteBook 840": if no item's name
  // fits, offer everything that customer bought then, and let the shop pick.
  if (!matches.length && want.size && people?.length) matches = collect(inWindow, () => true);
  matches.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const who = new Set(matches.map((m) => (m.customerId || m.customerName).toString().toLowerCase()));
  return {
    said: { customer: a.customerName || "", product: a.product || "" },
    matches: matches.slice(0, 8),
    pick: matches.length === 1 ? matches[0] : null,
    ask: who.size > 1 && first ? `Which ${a.customerName.trim().split(/\s+/)[0]}?` : "Which one was returned?",
    qty: a.qty != null ? Math.max(1, Math.round(Number(a.qty))) : null,
    refund: a.refund != null ? Number(a.refund) : null,
  };
}

/**
 * The sale being corrected or cancelled: by invoice number, customer, an
 * item on it and when. "The last sale" with nothing else said is the most
 * recent one. More than one fits and the shop is asked which.
 */
function findSale(a, { sales, customers }, now) {
  const inv = digits(a.invoice);
  if (inv) {
    const hit = sales.filter((s) => digits(s.invoice) === inv || digits(s.invoice).replace(/^0+/, "") === inv.replace(/^0+/, ""));
    if (hit.length) return saleChoice(hit, a, now);
  }
  const m = a.customerName || a.customerPhone ? matchCustomer(a.customerName, a.customerPhone, customers) : null;
  const first = words(a.customerName)[0];
  const exact = m?.customer || null;
  const forCustomer = (s) => !m ? true
    : exact ? s.customerId === exact.id || String(s.customerName || "").toLowerCase() === String(exact.name || "").toLowerCase()
    : (m.candidates || []).some((c) => s.customerId === c.id) || (!!first && words(s.customerName).includes(first));
  const want = new Set(words(a.product).map(stem));
  const hasItem = (s) => !want.size || (s.items || []).some((i) => words(i.name).map(stem).some((w) => want.has(w)));
  const [from, to] = a.date ? [new Date(`${a.date}T00:00:00`), new Date(new Date(`${a.date}T00:00:00`).getTime() + DAY)]
    : a.period ? periodRange(a.period, now) : [new Date(now.getTime() - 90 * DAY), new Date(now.getTime() + DAY)];
  const inWindow = (s) => { const t = new Date(s.createdAt).getTime(); return t >= from.getTime() && t < to.getTime(); };
  const sorted = [...sales].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  if (!m && !want.size && !a.period && !a.date) return saleChoice(sorted.slice(0, 1), a, now); // "the last sale"
  let hit = sorted.filter(inWindow).filter(forCustomer).filter(hasItem);
  if (!hit.length && want.size) hit = sorted.filter(inWindow).filter(forCustomer); // "laptop" vs "HP EliteBook"
  return saleChoice(hit, a, now);
}

function saleChoice(hit, a, now) {
  const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("en");
  const matches = hit.slice(0, 8).map((s) => ({
    saleId: s.id, invoice: s.invoice, customerName: s.customerName || "Walk-in", customerId: s.customerId || null, at: s.createdAt,
    label: `${s.customerName || "Walk-in"} · ${(s.items || []).map((i) => `${i.name}${Number(i.qty) > 1 ? ` ×${i.qty}` : ""}`).join(", ") || "no items"} · ${s.invoice || ""} · ${shortDay(s.createdAt, now)} · ${fmt(s.total)}`,
  }));
  const who = new Set(matches.map((x) => (x.customerId || x.customerName).toString().toLowerCase()));
  const name = String(a.customerName || "").trim().split(/\s+/)[0];
  return {
    said: { customer: a.customerName || "", product: a.product || "", invoice: a.invoice || "" },
    matches,
    pick: matches.length === 1 ? matches[0] : null,
    ask: who.size > 1 && name ? `Which ${name}?` : "Which sale?",
  };
}

/** Which line on the sale the change is about: the one named, or the only one. */
export function saleItemIndex(sale, said) {
  const items = sale?.items || [];
  if (items.length === 1) return 0;
  const want = new Set(words(said).map(stem));
  if (!want.size) return null;
  const hits = items.map((i, idx) => ({ idx, n: words(i.name).map(stem).filter((w) => want.has(w)).length })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
  return hits.length && (hits.length === 1 || hits[0].n > hits[1].n) ? hits[0].idx : null;
}

/**
 * Turns the AI's actions into drafts the shop can check and edit.
 * `source` is "voice" (also typed) or "photo" (a notebook page).
 */
export function resolve(actions, data = {}, { source = "voice", now = new Date() } = {}) {
  const inventory = data.inventory || db.getInventory();
  const customers = data.customers || db.getCustomers();
  const repairs = data.repairs || db.getRepairs();
  const sales = data.sales || db.getSales();

  return (actions || []).map((a) => {
    const today = localDay(now);
    const date = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.date <= today ? a.date : source === "photo" ? today : null;
    const base = { id: nextId(), type: a.type, include: true, note: a.note || null, source, date };
    if (a.type === "sale") {
      const items = (a.items || []).map((i) => {
        const m = matchProduct(i.product, inventory);
        const p = m.product;
        return {
          said: i.product,
          productId: p?.id || null,
          name: p?.name || i.product,
          qty: Math.max(1, Math.round(Number(i.qty) || 1)),
          price: i.price != null ? Number(i.price) : p ? Number(p.price) || 0 : null,
          costPrice: p ? Number(p.costPrice || 0) : 0,
          stock: p ? Number(p.stock || 0) : null,
          candidates: p ? [] : m.candidates.map((c) => ({ id: c.id, name: c.name, price: c.price, costPrice: c.costPrice, stock: c.stock })),
          // Not in stock at all: sold as a one-off item (no stock to draw
          // down), unless the person picks one of their products instead.
          oneOff: !p && m.candidates.length === 0,
        };
      });
      return {
        ...base,
        customer: customerField(a, customers),
        items,
        paymentMethod: PAYMENT_METHODS.includes(a.paymentMethod) ? a.paymentMethod : "Cash",
        amountPaid: a.paidInFull === false && a.amountPaid != null ? Number(a.amountPaid) : null,
        // From the notebook: these goods left the shelf long ago, and the
        // stock count in TechDesk already reflects that.
        takeFromStock: source !== "photo",
      };
    }
    if (a.type === "repair") {
      return {
        ...base,
        customer: customerField(a, customers),
        device: a.device || "",
        problem: a.problem || "",
        cost: a.cost != null ? Number(a.cost) : 0,
        status: source === "photo" && REPAIR_STATUSES.includes(a.status) ? a.status : "received",
      };
    }
    if (a.type === "stock") {
      const m = matchProduct(a.product, inventory);
      return {
        ...base,
        said: a.product,
        productId: m.product?.id || null,
        name: m.product?.name || a.product || "",
        qty: Math.max(0, Math.round(Number(a.qty) || 0)) || (a.stockCount ? 0 : 1),
        // "Set to" when the page is a count of what's on the shelf; "add" when goods came in.
        mode: m.product && a.stockCount === true ? "set" : "add",
        costPrice: a.costPrice != null ? Number(a.costPrice) : m.product ? Number(m.product.costPrice || 0) : null,
        price: a.price != null ? Number(a.price) : m.product ? Number(m.product.price || 0) : null,
        candidates: m.product ? [] : m.candidates.map((c) => ({ id: c.id, name: c.name })),
      };
    }
    if (a.type === "repair_status") {
      const cust = matchCustomer(a.customerName, a.customerPhone, customers).customer;
      const m = matchRepair(a, repairs, cust);
      return {
        ...base,
        repairId: m.repair?.id || null,
        status: REPAIR_STATUSES.includes(a.status) ? a.status : null,
        candidates: m.repair ? [] : m.candidates.map((r) => ({ id: r.id, label: `${r.ticket} · ${r.customerName} · ${r.device}` })),
        label: m.repair ? `${m.repair.ticket} · ${m.repair.customerName} · ${m.repair.device}` : "",
      };
    }
    if (a.type === "payment") {
      const cust = matchCustomer(a.customerName, a.customerPhone, customers).customer;
      const owing = [
        ...sales
          .filter((s) => Number(s.amountPaid || 0) < Number(s.total || 0))
          .filter((s) => (cust ? s.customerId === cust.id : false) || (a.customerName && words(s.customerName).includes(words(a.customerName)[0])))
          .map((s) => ({ kind: "sale", id: s.id, label: `${s.invoice} · ${s.customerName}`, owed: Number(s.total || 0) - Number(s.amountPaid || 0), at: s.createdAt })),
        ...repairs
          .filter((r) => repairOwed(r) > 0)
          .filter((r) => (cust ? r.customerId === cust.id : false) || (a.customerName && words(r.customerName).includes(words(a.customerName)[0])))
          .map((r) => ({ kind: "repair", id: r.id, label: `${r.ticket} · ${r.customerName} · ${r.device}`, owed: repairOwed(r), at: r.createdAt })),
      ].sort((x, y) => String(y.at).localeCompare(String(x.at)));
      return {
        ...base,
        target: owing.length === 1 ? owing[0] : null,
        candidates: owing.length === 1 ? [] : owing.slice(0, 5),
        amount: a.amountPaid != null ? Number(a.amountPaid) : owing.length === 1 ? owing[0].owed : null,
        customerName: cust?.name || a.customerName || "",
      };
    }
    if (a.type === "edit_sale") {
      const found = findSale(a, { sales, customers }, now);
      const sale = found.pick ? sales.find((x) => x.id === found.pick.saleId) : null;
      return {
        ...base,
        ...found,
        itemIdx: sale ? saleItemIndex(sale, a.product) : null,
        change: {
          qty: a.newQty != null ? Math.max(0, Math.round(Number(a.newQty))) : null,
          price: a.newPrice != null ? Number(a.newPrice) : null,
          paymentMethod: PAYMENT_METHODS.includes(a.paymentMethod) ? a.paymentMethod : null,
          amountPaid: a.amountPaid != null ? Number(a.amountPaid) : null,
          customer: a.newCustomer || null,
        },
      };
    }
    if (a.type === "cancel_sale") {
      return { ...base, ...findSale(a, { sales, customers }, now) };
    }
    if (a.type === "return") {
      return { ...base, ...findReturn(a, { sales, customers }, now) };
    }
    if (a.type === "question") {
      if (source === "photo") return { ...base, type: "unknown", include: false };
      return { ...base, include: false, question: true, intent: a.intent, answer: answerQuestion(a, { sales, repairs, inventory, customers }) };
    }
    return { ...base, include: false };
  });
}

/** What still stops this draft from being saved, in plain words. Empty when it's ready. */
export function issues(d) {
  const out = [];
  if (d.type === "sale") {
    if (!d.items.length) out.push("No items were heard.");
    d.items.forEach((i) => {
      if (!i.productId && !i.oneOff) out.push(`Which product is "${i.said}"?`);
      else if (d.takeFromStock !== false && i.productId && i.stock != null && i.qty > i.stock) out.push(`Only ${i.stock} ${i.name} in stock.`);
      if (i.price == null || !(i.price >= 0)) out.push(`Price for ${i.name}?`);
    });
    if (!d.customer.id && d.customer.candidates.length) out.push(`Which ${d.customer.name}?`);
  } else if (d.type === "repair") {
    if (!d.customer.name) out.push("Customer's name?");
    if (!d.customer.id && d.customer.candidates.length) out.push(`Which ${d.customer.name}?`);
    if (!d.device) out.push("Which device?");
    if (!d.problem) out.push("What's the fault?");
  } else if (d.type === "stock") {
    if (!d.productId && d.candidates.length) out.push(`Is "${d.said}" one of your products, or new?`);
    if (!d.productId && !d.name) out.push("Product name?");
    if (!d.productId && !(d.price > 0)) out.push(`Selling price for ${d.name || "the new product"}?`);
    if (d.mode !== "set" && !(d.qty > 0)) out.push("How many?");
  } else if (d.type === "repair_status") {
    if (!d.repairId) out.push(d.candidates.length ? "Which repair?" : "Couldn't find that repair.");
    if (!d.status) out.push("Which status?");
  } else if (d.type === "payment") {
    if (!d.target) out.push(d.candidates.length ? "Which one is being paid?" : `Nothing owed by ${d.customerName || "that customer"} was found.`);
    if (!(d.amount > 0)) out.push("How much was paid?");
    else if (d.target?.kind === "repair" && d.amount < d.target.owed) out.push("Part-payment on a repair: record it from the Repairs page.");
  } else if (d.type === "edit_sale" || d.type === "cancel_sale") {
    if (!d.matches.length) out.push("No such sale was found.");
    else if (!d.pick) out.push(d.ask);
    else if (d.type === "edit_sale") {
      const c = d.change;
      if (c.qty == null && c.price == null && !c.paymentMethod && c.amountPaid == null && !c.customer) out.push("What should change?");
      if ((c.qty != null || c.price != null) && d.itemIdx == null) out.push("Which item on the sale?");
      if (c.qty === 0) out.push("To take an item off, say it was returned, or cancel the sale.");
    }
  } else if (d.type === "return") {
    if (!d.matches.length) out.push(`No sale of ${d.said.product || "that"}${d.said.customer ? ` to ${d.said.customer}` : ""} was found.`);
    else if (!d.pick) out.push(d.ask);
    else if (d.qty != null && d.qty > d.pick.qty) out.push(`Only ${d.pick.qty} were sold on ${d.pick.invoice}.`);
  } else if (!d.question) {
    out.push("Couldn't tell what to do.");
  }
  return out;
}

export function saleTotal(d) {
  return d.items.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
}

// -------------------------------------------------------------- apply ----
let logSource = "voice";
function log(type, message, refId, actor) {
  db.logActivity({ type, message: `${message} (${logSource === "photo" ? "from a notebook photo" : "by voice"})`, refId, actor });
}

function customerFor(c) {
  if (c.id) return db.getCustomers().find((x) => x.id === c.id) || null;
  return db.findOrCreateCustomer({ name: c.name || "Walk-in", phone: c.phone || "" });
}

/**
 * Saves every included, ready draft. Returns {saved, undo}: undo is a list of
 * steps that put things back exactly, newest first.
 */
export function apply(drafts, { actor } = {}) {
  const undo = [];
  let saved = 0;
  for (const d of drafts) {
    if (!d.include || issues(d).length) continue;
    logSource = d.source || "voice";
    const createdAt = dayToISO(d.date);
    const when = createdAt ? { createdAt } : {};
    if (d.type === "sale") {
      const customer = customerFor(d.customer);
      const total = saleTotal(d);
      const paid = d.amountPaid != null ? Math.min(Number(d.amountPaid), total) : total;
      const items = d.items.map((i) => ({
        id: db.uid("item"),
        productId: i.productId,
        name: i.name,
        price: Number(i.price) || 0,
        costPrice: Number(i.costPrice) || 0,
        qty: i.qty,
        imei: "",
        fromInventory: !!i.productId && d.takeFromStock !== false,
      }));
      const rec = db.createSale({
        items,
        customerId: customer?.id || null,
        customerName: customer?.name || "Walk-in",
        customerPhone: customer?.phone || "",
        customerEmail: customer?.email || "",
        customerAddress: customer?.address || "",
        subtotal: total,
        discount: 0,
        total,
        amountPaid: paid,
        paymentMethod: d.paymentMethod,
        paymentStatus: paid >= total && total > 0 ? "Paid" : "Pending",
        actor,
        ...when,
      });
      log("sale", `New sale ${rec.invoice} created`, rec.id, actor);
      undo.unshift(() => {
        db.reconcileInventoryForEdit(rec.items, []);
        db.deleteSale(rec.id);
        log("sale", `Sale ${rec.invoice} undone`, rec.id, actor);
      });
    } else if (d.type === "repair") {
      const customer = customerFor(d.customer);
      const rec = db.createRepair({
        customerId: customer?.id || null,
        customerName: customer?.name || d.customer.name,
        customerPhone: customer?.phone || d.customer.phone || "",
        device: d.device,
        imei: "",
        serial: "",
        problem: d.problem,
        status: d.status || "received",
        repairCost: Number(d.cost) || 0,
        notes: "",
        parts: [],
        actor,
        ...when,
      });
      log("repair", `New repair ticket ${rec.ticket} created`, rec.id, actor);
      undo.unshift(() => {
        db.deleteRepair(rec.id);
        log("repair", `Repair ticket ${rec.ticket} undone`, rec.id, actor);
      });
    } else if (d.type === "stock") {
      if (d.productId) {
        const before = db.findInventoryItem(d.productId);
        const patch = { stock: d.mode === "set" ? Math.max(0, Number(d.qty) || 0) : Number(before.stock || 0) + d.qty };
        if (d.costPrice != null) patch.costPrice = Number(d.costPrice);
        if (d.price != null && d.price > 0) patch.price = Number(d.price);
        db.updateInventoryItem(d.productId, patch);
        log("inventory", d.mode === "set" ? `Stock of ${before.name} set to ${patch.stock}` : `Added ${d.qty} × ${before.name} to stock`, d.productId, actor);
        undo.unshift(() => {
          db.updateInventoryItem(d.productId, { stock: before.stock, costPrice: before.costPrice, price: before.price });
          log("inventory", `Stock change for ${before.name} undone`, d.productId, actor);
        });
      } else {
        const rec = db.addInventoryItem({
          name: d.name,
          sku: "",
          category: "Other",
          price: Number(d.price) || 0,
          costPrice: Number(d.costPrice) || 0,
          stock: d.qty,
          lowStockThreshold: 5,
          description: "",
        });
        log("inventory", `Product "${rec.name}" added to inventory`, rec.id, actor);
        undo.unshift(() => {
          db.deleteInventoryItem(rec.id);
          log("inventory", `Product "${rec.name}" undone`, rec.id, actor);
        });
      }
    } else if (d.type === "repair_status") {
      const before = db.getRepairs().find((r) => r.id === d.repairId);
      db.updateRepair(d.repairId, { status: d.status });
      log("repair", `Repair ${before.ticket} marked ${d.status}`, d.repairId, actor);
      undo.unshift(() => {
        db.updateRepair(d.repairId, { status: before.status });
        log("repair", `Status change on ${before.ticket} undone`, d.repairId, actor);
      });
    } else if (d.type === "edit_sale") {
      const before = db.getSales().find((x) => x.id === d.pick.saleId);
      if (!before) continue;
      const plan = editPlan(before, d);
      if (plan.items !== before.items) db.reconcileInventoryForEdit(before.items, plan.items);
      db.updateSale(before.id, plan.patch);
      log("sale", `Sale ${before.invoice} corrected: ${plan.what}`, before.id, actor);
      undo.unshift(() => {
        if (plan.items !== before.items) db.reconcileInventoryForEdit(plan.items, before.items);
        const keys = Object.keys(plan.patch);
        db.updateSale(before.id, Object.fromEntries(keys.map((k) => [k, before[k] ?? null])));
        log("sale", `Correction to ${before.invoice} undone`, before.id, actor);
      });
    } else if (d.type === "cancel_sale") {
      const before = db.getSales().find((x) => x.id === d.pick.saleId);
      if (!before) continue;
      // Entered by mistake: the goods never left, so they go back on the shelf.
      db.reconcileInventoryForEdit(before.items, []);
      db.deleteSale(before.id);
      log("sale", `Sale ${before.invoice} cancelled (${before.customerName || "Walk-in"})`, before.id, actor);
      undo.unshift(() => {
        db.reconcileInventoryForEdit([], before.items);
        db.restoreSale(before);
        log("sale", `Cancelling ${before.invoice} undone`, before.id, actor);
      });
    } else if (d.type === "return") {
      const before = db.getSales().find((x) => x.id === d.pick.saleId);
      const item = before?.items?.[d.pick.idx];
      if (!item) continue;
      const out = returnPlan(before, d.pick.idx, d.qty, d.refund);
      db.updateSale(before.id, out.patch);
      if (item.fromInventory && item.productId) {
        const p = db.findInventoryItem(item.productId);
        if (p) db.updateInventoryItem(item.productId, { stock: Number(p.stock || 0) + out.back });
      }
      log("sale", `Return: ${out.back} × ${item.name} from ${before.customerName || "a customer"} (${before.invoice}), ${out.refund} refunded`, before.id, actor);
      undo.unshift(() => {
        db.updateSale(before.id, { items: before.items, subtotal: before.subtotal, total: before.total, amountPaid: before.amountPaid, paymentStatus: before.paymentStatus, returns: before.returns || [] });
        if (item.fromInventory && item.productId) {
          const p = db.findInventoryItem(item.productId);
          if (p) db.updateInventoryItem(item.productId, { stock: Math.max(0, Number(p.stock || 0) - out.back) });
        }
        log("sale", `Return on ${before.invoice} undone`, before.id, actor);
      });
    } else if (d.type === "payment") {
      if (d.target.kind === "sale") {
        const before = db.getSales().find((s) => s.id === d.target.id);
        const total = Number(before.total || 0);
        const paid = Math.min(total, Number(before.amountPaid || 0) + Number(d.amount));
        db.updateSale(before.id, { amountPaid: paid, paymentStatus: paid >= total ? "Paid" : "Pending" });
        log("sale", `Payment of ${d.amount} recorded on ${before.invoice}`, before.id, actor);
        undo.unshift(() => {
          db.updateSale(before.id, { amountPaid: before.amountPaid, paymentStatus: before.paymentStatus });
          log("sale", `Payment on ${before.invoice} undone`, before.id, actor);
        });
      } else {
        const before = db.getRepairs().find((r) => r.id === d.target.id);
        db.updateRepair(before.id, { paymentStatus: "Paid" });
        log("repair", `Repair ${before.ticket} marked paid`, before.id, actor);
        undo.unshift(() => {
          db.updateRepair(before.id, { paymentStatus: before.paymentStatus });
          log("repair", `Payment on ${before.ticket} undone`, before.id, actor);
        });
      }
    }
    saved += 1;
    addHistory(historyLine(d), d.type);
  }
  logSource = "voice";
  return { saved, undo };
}

/**
 * What a return does to the sale: the item (or some of it) comes off, the
 * total drops by its price, and whatever they had now overpaid is the
 * refund -- unless the shop said how much was given back.
 */
export function returnPlan(sale, idx, qty, refund) {
  const item = sale.items[idx];
  const back = Math.min(Number(item.qty || 0), qty != null ? Number(qty) : Number(item.qty || 0));
  const value = Number(item.price || 0) * back;
  const items = sale.items.flatMap((x, j) => (j !== idx ? [x] : Number(x.qty) - back > 0 ? [{ ...x, qty: Number(x.qty) - back }] : []));
  const total = Math.max(0, Number(sale.total || 0) - value);
  const paid = Number(sale.amountPaid || 0);
  const given = refund != null ? Math.min(Number(refund), paid) : Math.max(0, paid - total);
  const amountPaid = Math.max(0, paid - given);
  return {
    back,
    refund: given,
    patch: {
      items,
      subtotal: Math.max(0, Number(sale.subtotal ?? sale.total ?? 0) - value),
      total,
      amountPaid,
      paymentStatus: amountPaid >= total ? "Paid" : "Pending",
      returns: [...(sale.returns || []), { at: new Date().toISOString(), name: item.name, qty: back, refund: given }],
    },
  };
}

/** What a correction does to the sale: new items, totals and payment, and a few words saying what changed. */
export function editPlan(sale, d) {
  const c = d.change;
  const patch = {};
  const what = [];
  let items = sale.items;
  if ((c.qty != null || c.price != null) && d.itemIdx != null) {
    items = sale.items.map((it, j) => (j !== d.itemIdx ? it : { ...it, ...(c.qty != null ? { qty: c.qty } : {}), ...(c.price != null ? { price: c.price } : {}) }));
    const it = sale.items[d.itemIdx];
    if (c.qty != null) what.push(`${it.name} qty ${it.qty} → ${c.qty}`);
    if (c.price != null) what.push(`${it.name} price ${it.price} → ${c.price}`);
    const subtotal = items.reduce((n, i) => n + Number(i.price || 0) * Number(i.qty || 0), 0);
    patch.items = items;
    patch.subtotal = subtotal;
    patch.total = Math.max(0, subtotal - Number(sale.discount || 0));
  }
  const total = patch.total ?? Number(sale.total || 0);
  const wasPaid = Number(sale.amountPaid || 0) >= Number(sale.total || 0);
  let paid = c.amountPaid != null ? Math.min(Number(c.amountPaid), total) : wasPaid ? total : Math.min(Number(sale.amountPaid || 0), total);
  if (c.amountPaid != null) what.push(`paid ${paid}`);
  if (patch.total != null || c.amountPaid != null) {
    patch.amountPaid = paid;
    patch.paymentStatus = paid >= total && total > 0 ? "Paid" : "Pending";
  }
  if (c.paymentMethod) { patch.paymentMethod = c.paymentMethod; what.push(`paid by ${c.paymentMethod}`); }
  if (c.customer) {
    const cust = db.findOrCreateCustomer({ name: c.customer, phone: "" });
    patch.customerId = cust?.id || null;
    patch.customerName = cust?.name || c.customer;
    patch.customerPhone = cust?.phone || "";
    what.push(`customer → ${patch.customerName}`);
  }
  return { patch, items, what: what.join(", ") || "no change" };
}

function historyLine(d) {
  const who = (c) => (c && c.name && c.name !== "Walk-in" ? ` · ${c.name}` : "");
  switch (d.type) {
    case "sale": return `Sale made${who(d.customer)}`;
    case "repair": return `Repair booked${who(d.customer)}`;
    case "stock": return d.productId ? `Stock ${d.mode === "set" ? "counted" : "added"} · ${d.name}` : `Product added · ${d.name}`;
    case "repair_status": return `Repair marked ${d.status}`;
    case "payment": return `Payment recorded${d.customerName ? ` · ${d.customerName}` : ""}`;
    case "edit_sale": return `Sale corrected · ${d.pick?.invoice || ""}`;
    case "cancel_sale": return `Sale cancelled · ${d.pick?.invoice || ""}`;
    case "return": return `Return recorded · ${d.pick?.customerName || ""}`.replace(/ · $/, "");
    default: return "Saved";
  }
}

export function runUndo(undo) {
  for (const step of undo || []) {
    try {
      step();
    } catch {
      // A record changed or deleted since: leave it rather than half-undo.
    }
  }
}

export const voiceOrder = { localDay, dayToISO, send, resolve, issues, apply, runUndo, isOnline, saleTotal, hasVoiceConsent, giveVoiceConsent };
