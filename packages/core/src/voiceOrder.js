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
// Totals are always worked out here from the shop's own prices -- never
// taken from what the AI heard.
import { db } from "./db";
import { storage } from "./storage";
import { installId } from "./hqStore";
import { featureOn, pausedResult } from "./appControl";
import { answerQuestion } from "./assistantAnswers";
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

/** Sends the voice note (base64 WAV) or typed text. Returns {ok, transcript, actions} or {ok:false, message}. */
export async function send({ audio, mime = "audio/wav", text } = {}, { fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
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
  return { customer: null, candidates: (exact.length ? exact : partial).slice(0, 4) };
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

/** Turns the AI's actions into drafts the shop can check and edit. */
export function resolve(actions, data = {}) {
  const inventory = data.inventory || db.getInventory();
  const customers = data.customers || db.getCustomers();
  const repairs = data.repairs || db.getRepairs();
  const sales = data.sales || db.getSales();

  return (actions || []).map((a) => {
    const base = { id: nextId(), type: a.type, include: true, note: a.note || null };
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
      };
    }
    if (a.type === "repair") {
      return {
        ...base,
        customer: customerField(a, customers),
        device: a.device || "",
        problem: a.problem || "",
        cost: a.cost != null ? Number(a.cost) : 0,
      };
    }
    if (a.type === "stock") {
      const m = matchProduct(a.product, inventory);
      return {
        ...base,
        said: a.product,
        productId: m.product?.id || null,
        name: m.product?.name || a.product || "",
        qty: Math.max(1, Math.round(Number(a.qty) || 1)),
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
    if (a.type === "question") {
      return { ...base, include: false, question: true, answer: answerQuestion(a, { sales, repairs, inventory, customers }) };
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
      else if (i.productId && i.stock != null && i.qty > i.stock) out.push(`Only ${i.stock} ${i.name} in stock.`);
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
  } else if (d.type === "repair_status") {
    if (!d.repairId) out.push(d.candidates.length ? "Which repair?" : "Couldn't find that repair.");
    if (!d.status) out.push("Which status?");
  } else if (d.type === "payment") {
    if (!d.target) out.push(d.candidates.length ? "Which one is being paid?" : `Nothing owed by ${d.customerName || "that customer"} was found.`);
    if (!(d.amount > 0)) out.push("How much was paid?");
    else if (d.target?.kind === "repair" && d.amount < d.target.owed) out.push("Part-payment on a repair: record it from the Repairs page.");
  } else if (!d.question) {
    out.push("Couldn't tell what to do.");
  }
  return out;
}

export function saleTotal(d) {
  return d.items.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
}

// -------------------------------------------------------------- apply ----
function log(type, message, refId, actor) {
  db.logActivity({ type, message: `${message} (by voice)`, refId, actor });
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
        fromInventory: !!i.productId,
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
        status: "received",
        repairCost: Number(d.cost) || 0,
        notes: "",
        parts: [],
        actor,
      });
      log("repair", `New repair ticket ${rec.ticket} created`, rec.id, actor);
      undo.unshift(() => {
        db.deleteRepair(rec.id);
        log("repair", `Repair ticket ${rec.ticket} undone`, rec.id, actor);
      });
    } else if (d.type === "stock") {
      if (d.productId) {
        const before = db.findInventoryItem(d.productId);
        const patch = { stock: Number(before.stock || 0) + d.qty };
        if (d.costPrice != null) patch.costPrice = Number(d.costPrice);
        if (d.price != null && d.price > 0) patch.price = Number(d.price);
        db.updateInventoryItem(d.productId, patch);
        log("inventory", `Added ${d.qty} × ${before.name} to stock`, d.productId, actor);
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
  }
  return { saved, undo };
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

export const voiceOrder = { send, resolve, issues, apply, runUndo, isOnline, saleTotal, hasVoiceConsent, giveVoiceConsent };
