// Local-first data layer. Everything lives on the device — fully offline.
//
// Which device store that is, this file does not know: the host binds one
// through storage.js. In the apps it is localStorage, exactly as before; under
// the test runner it is a Map, which is why these tests need no DOM.
import { DEFAULT_LABELS, BUSINESS_PRESETS } from "./businessPresets";
import { storage } from "./storage";
import { emitChanged } from "./events";
import { hostBridge } from "./bridge";

const KEYS = {
  inventory: "techdesk_inventory",
  sales: "techdesk_sales",
  customers: "techdesk_customers",
  repairs: "techdesk_repairs",
  activity: "techdesk_activity",
  settings: "techdesk_settings",
  users: "techdesk_users",
  counters: "techdesk_counters",
  // Deleting a record removes it from the list, which leaves HQ no way to
  // learn it is gone -- the row would sit there forever. A tombstone is the
  // note that says so.
  tombstones: "techdesk_tombstones",
};

// Every record carries updatedAt so sync can send only what changed. Without
// it an edited sale keeps its original createdAt and is never sent again --
// HQ would show the first version of it forever.
function stamp(record) {
  return { ...record, updatedAt: new Date().toISOString() };
}

// Remembers that a record existed and was deleted, so the next sync can say so.
function tombstone(kind, id) {
  try {
    const raw = storage.getItem(KEYS.tombstones);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ id, kind, deletedAt: new Date().toISOString() });
    // A shop that deletes constantly should not grow this without bound. The
    // oldest entries are the ones HQ has certainly already seen.
    storage.setItem(KEYS.tombstones, JSON.stringify(list.slice(-2000)));
  } catch {
    // A full disk must not stop the delete itself from happening.
  }
}

function read(key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Anything that wants to know the shop changed listens for this. One place,
// because every mutation in this file goes through write() -- a per-method
// notification would miss whichever one got added last.
export { CHANGED_EVENT } from "./events";

function write(key, value) {
  storage.setItem(key, JSON.stringify(value));
  emitChanged(key);
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseNumericSuffix(str) {
  const m = /(\d+)$/.exec(str || "");
  return m ? Number(m[1]) : 0;
}

// Persisted, monotonically-increasing sequence per counter name — never
// reused, so deleting a sale/repair can't make a later one collide with an
// existing invoice/ticket number. Seeded from any existing records' highest
// numeric suffix so upgrading from the old length-based scheme can't
// collide with numbers already in use.
function nextSequence(counterKey, records, field) {
  const counters = read(KEYS.counters);
  const stored = Array.isArray(counters) ? {} : counters;
  const highestExisting = records.reduce((max, r) => Math.max(max, parseNumericSuffix(r[field])), 0);
  const next = Math.max(stored[counterKey] || 0, highestExisting) + 1;
  write(KEYS.counters, { ...stored, [counterKey]: next });
  return next;
}

function nextInvoiceNumber() {
  const sales = read(KEYS.sales);
  const n = nextSequence("invoice", sales, "invoice");
  return `INV-${String(n).padStart(5, "0")}`;
}

function nextTicketNumber() {
  const repairs = read(KEYS.repairs);
  const n = nextSequence("ticket", repairs, "ticket");
  return `TKT-${String(n).padStart(5, "0")}`;
}

// Takes units off the shelf for anything that consumed them -- a sale's items
// or a repair's parts, which share a shape for exactly this reason.
//
// Deleting the record does not put them back, matching how sales have always
// behaved. Stock is corrected in Inventory, where the count can be seen.
function drawDownStock(items) {
  if (!items?.length) return;
  const inventory = read(KEYS.inventory);
  let touched = false;
  const crossed = [];

  items.forEach((item) => {
    if (!item.fromInventory || !item.productId) return;
    const idx = inventory.findIndex((p) => p.id === item.productId);
    if (idx < 0) return;

    const before = Number(inventory[idx].stock || 0);
    const after = Math.max(0, before - Number(item.qty || 0));
    inventory[idx].stock = after;
    touched = true;

    // Only the sale that changes the picture. Logging every sale of an
    // already-low item would bury the one that mattered under a dozen
    // repeats of itself -- so: the sale that first takes it below the
    // threshold, and the sale that takes the last one, which is a worse
    // state than low and worth saying even if it was already low.
    const threshold = Number(inventory[idx].lowStockThreshold || 5);
    const crossedLow = before > threshold && after <= threshold;
    const ranOut = before > 0 && after === 0;
    if (crossedLow || ranOut) crossed.push(inventory[idx]);
  });

  if (touched) write(KEYS.inventory, inventory);

  // Written after the stock, so a notification never describes a count that
  // was not saved.
  crossed.forEach((p) => {
    dbLogActivity({
      type: "lowstock",
      message: p.stock === 0
        ? `${p.name || "Item"} is out of stock.`
        : `${p.name || "Item"} is down to ${p.stock}. Time to restock.`,
      refId: p.id,
    });
  });
}

/**
 * Writes an activity row.
 *
 * Defined here rather than reached for through `db`, because drawDownStock
 * runs while db is still being built and would not find it.
 */
function dbLogActivity(entry) {
  const activity = read(KEYS.activity);
  activity.unshift(stamp({ id: uid("act"), createdAt: new Date().toISOString(), ...entry }));
  write(KEYS.activity, activity);
  // Keeps the LAN activity view honest: this push used to live in
  // db.logActivity, and a low-stock alert raised inside drawDownStock would
  // otherwise never reach a phone watching it.
  db.syncToLan(activity);
}

export const db = {
  KEYS,
  uid,

  // ---- Inventory ----
  getInventory: () => read(KEYS.inventory),
  saveInventory: (items) => write(KEYS.inventory, items),
  findInventoryItem: (id) => read(KEYS.inventory).find((i) => i.id === id),
  addInventoryItem: (product) => {
    const items = read(KEYS.inventory);
    const record = stamp({ id: uid("prod"), createdAt: new Date().toISOString(), ...product });
    items.unshift(record);
    write(KEYS.inventory, items);
    return record;
  },
  updateInventoryItem: (id, patch) => {
    const items = read(KEYS.inventory);
    const idx = items.findIndex((i) => i.id === id);
    if (idx > -1) {
      items[idx] = stamp({ ...items[idx], ...patch });
      write(KEYS.inventory, items);
      return items[idx];
    }
    return null;
  },
  deleteInventoryItem: (id) => {
    write(KEYS.inventory, read(KEYS.inventory).filter((i) => i.id !== id));
    tombstone("product", id);
  },

  // ---- Customers ----
  getCustomers: () => read(KEYS.customers),
  saveCustomers: (items) => write(KEYS.customers, items),
  findOrCreateCustomer: ({ name, phone, email, address }) => {
    const customers = read(KEYS.customers);
    if (phone) {
      const existing = customers.find((c) => c.phone === phone);
      if (existing) return existing;
    }
    if (!name && !phone) return null;
    const customer = stamp({
      id: uid("cust"),
      name: name || "Walk-in",
      phone: phone || "",
      email: email || "",
      address: address || "",
      createdAt: new Date().toISOString(),
    });
    customers.push(customer);
    write(KEYS.customers, customers);
    return customer;
  },

  // ---- Sales ----
  getSales: () => read(KEYS.sales),
  nextInvoiceNumber,
  createSale: (sale) => {
    const sales = read(KEYS.sales);
    const record = stamp({
      id: uid("sale"),
      invoice: nextInvoiceNumber(),
      createdAt: new Date().toISOString(),
      ...sale,
    });
    sales.unshift(record);
    write(KEYS.sales, sales);

    drawDownStock(sale.items);

    return record;
  },
  updateSale: (id, patch) => {
    const sales = read(KEYS.sales);
    const idx = sales.findIndex((s) => s.id === id);
    if (idx > -1) {
      sales[idx] = stamp({ ...sales[idx], ...patch });
      write(KEYS.sales, sales);
      return sales[idx];
    }
    return null;
  },
  // Reconciles stock when a sale is edited: restores quantities from the
  // items being replaced, then decrements for the new item list — so
  // swapping/quantity changes during an edit don't drift stock counts.
  reconcileInventoryForEdit: (oldItems, newItems) => {
    const inventory = read(KEYS.inventory);
    (oldItems || []).forEach((item) => {
      if (!item.fromInventory || !item.productId) return;
      const idx = inventory.findIndex((p) => p.id === item.productId);
      if (idx > -1) inventory[idx].stock = Number(inventory[idx].stock || 0) + Number(item.qty || 0);
    });
    (newItems || []).forEach((item) => {
      if (!item.fromInventory || !item.productId) return;
      const idx = inventory.findIndex((p) => p.id === item.productId);
      if (idx > -1) inventory[idx].stock = Math.max(0, Number(inventory[idx].stock || 0) - Number(item.qty || 0));
    });
    write(KEYS.inventory, inventory);
  },
  deleteSale: (id) => {
    const sales = read(KEYS.sales).filter((s) => s.id !== id);
    write(KEYS.sales, sales);
    tombstone("sale", id);
  },

  // ---- Repairs ----
  getRepairs: () => read(KEYS.repairs),
  saveRepairs: (items) => write(KEYS.repairs, items),
  nextTicketNumber,
  createRepair: (repair) => {
    const repairs = read(KEYS.repairs);
    const record = stamp({
      id: uid("rep"),
      ticket: nextTicketNumber(),
      createdAt: new Date().toISOString(),
      status: "received",
      paymentStatus: "Unpaid",
      parts: [],
      ...repair,
    });
    repairs.unshift(record);
    write(KEYS.repairs, repairs);

    // A screen fitted to a phone has left the shelf just as surely as one
    // sold over the counter. Parts carry the same shape as sale items so
    // both go through one decrement and the receipt can print either.
    drawDownStock(record.parts);

    return record;
  },
  updateRepair: (id, patch) => {
    const repairs = read(KEYS.repairs);
    const idx = repairs.findIndex((r) => r.id === id);
    if (idx > -1) {
      repairs[idx] = stamp({ ...repairs[idx], ...patch });
      write(KEYS.repairs, repairs);
      return repairs[idx];
    }
    return null;
  },
  deleteRepair: (id) => {
    write(KEYS.repairs, read(KEYS.repairs).filter((r) => r.id !== id));
    tombstone("repair", id);
  },

  // ---- Activity log ----
  logActivity: dbLogActivity,
  getActivity: () => read(KEYS.activity),
  // Pushes current state to the LAN activity server (if running in Electron)
  // so a phone viewing it sees the real shop name, activity history,
  // low-stock items, active repairs, inventory, and shop contact info --
  // not just whatever's happened since this call. Prices/costs are left out
  // since this server is unauthenticated and read-only for anyone on the LAN.
  syncToLan: (activity) => {
    const list = activity || read(KEYS.activity);
    const inventory = read(KEYS.inventory);
    const lowStock = inventory.filter((p) => Number(p.stock || 0) <= Number(p.lowStockThreshold || 5));
    const repairs = read(KEYS.repairs)
      .filter((r) => r.status !== "completed" && r.status !== "delivered")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50)
      .map((r) => ({
        ticket: r.ticket,
        device: r.device,
        problem: r.problem,
        status: r.status,
        customerName: r.customerName,
        createdAt: r.createdAt,
      }));
    const inventoryList = inventory
      .slice(0, 300)
      .map((p) => ({ name: p.name, category: p.category, stock: p.stock, lowStockThreshold: p.lowStockThreshold }));
    const settings = db.getSettings();
    const shopInfo = { address: settings.address, phone: settings.phone, email: settings.email, website: settings.website };
    hostBridge()?.syncActivity?.({
      shopName: settings.shopName,
      activity: list,
      lowStock,
      repairs,
      inventory: inventoryList,
      shopInfo,
    });
  },

  // ---- Notifications (admin-only, clearable) ----
  getNotifClearedAt: () => storage.getItem("techdesk_notif_cleared_at") || null,
  clearNotifications: () => storage.setItem("techdesk_notif_cleared_at", new Date().toISOString()),
  getSettings: () => {
    const raw = storage.getItem(KEYS.settings);
    const stored = raw ? JSON.parse(raw) : {};
    const defaults = {
      appearance: "dark",
      logo: null,
      // A placeholder until the shop types its own name, so it must not be
      // an edition's name: core is shared by Solo, Business, Enterprise, the
      // Web App and Android, and one of those hardcoded here put "TechDesk
      // Enterprise" on a Solo shop's receipts. Only ever seen by an install
      // that has not been through Settings -> Shop yet.
      shopName: "TechDesk",
      tagline: "REPAIR \u2022 SALES \u2022 ACCESSORIES",
      address: "",
      phone: "",
      email: "",
      website: "",
      taxId: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
      returnPolicy: "",
      receiptFooter: "",
      whatsappTemplate: "",
      // Naira unless the shop changes it. A shop that upgraded from a build
      // with no currency setting keeps exactly what it had.
      currency: "NGN",
      businessType: "general",
      labels: DEFAULT_LABELS,
      categories: BUSINESS_PRESETS.general.defaultCategories,
    };
    // merge so shops that saved settings before these fields existed still get sane defaults
    return { ...defaults, ...stored, labels: { ...defaults.labels, ...(stored.labels || {}) } };
  },
  saveSettings: (settings) => {
    write(KEYS.settings, settings);
  },

  // ---- Users (PIN-based, per device) ----
  getUsers: () => read(KEYS.users),
  addUser: (user) => {
    const users = read(KEYS.users);
    const record = { id: uid("user"), createdAt: new Date().toISOString(), ...user };
    users.push(record);
    write(KEYS.users, users);
    return record;
  },
  updateUser: (id, patch) => {
    const users = read(KEYS.users);
    const idx = users.findIndex((u) => u.id === id);
    if (idx > -1) {
      users[idx] = { ...users[idx], ...patch };
      write(KEYS.users, users);
      return users[idx];
    }
    return null;
  },
  deleteUser: (id) => {
    write(KEYS.users, read(KEYS.users).filter((u) => u.id !== id));
  },

  // ---- Backup / restore / erase (device tab) ----
  exportBackup: () => {
    const data = {};
    Object.values(KEYS).forEach((k) => {
      data[k] = storage.getItem(k);
    });
    return JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2);
  },
  restoreBackup: (json) => {
    const parsed = JSON.parse(json);
    const data = parsed.data || parsed;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Invalid backup file: missing data.");
    }
    const validKeys = new Set(Object.values(KEYS));
    const entries = Object.entries(data).filter(([key]) => validKeys.has(key));
    if (entries.length === 0) {
      throw new Error("Invalid backup file: no recognized data.");
    }
    // validate every value parses as JSON before writing anything, so a
    // malformed backup can't partially overwrite existing data
    entries.forEach(([, value]) => {
      if (value != null) JSON.parse(value);
    });
    entries.forEach(([key, value]) => {
      if (value != null) storage.setItem(key, value);
    });
  },
  // Merges a backup from another TechDesk edition into this one instead of
  // replacing (what restoreBackup does). Records are matched by id, so
  // merging the same file twice adds nothing the second time. Invoice and
  // ticket numbers restart at 1 in every edition, so incoming ones that
  // clash with a number already in use here get reissued -- the record is
  // kept, only its printed number changes.
  mergeBackup: (json) => {
    const parsed = JSON.parse(json);
    const data = parsed.data || parsed;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Invalid backup file: missing data.");
    }

    const parseList = (key) => {
      const raw = data[key];
      if (raw == null) return [];
      const list = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(list) ? list : [];
    };

    // parse everything before writing anything, so a malformed file can't
    // leave a half-merged database behind
    const incoming = {
      [KEYS.inventory]: parseList(KEYS.inventory),
      [KEYS.customers]: parseList(KEYS.customers),
      [KEYS.sales]: parseList(KEYS.sales),
      [KEYS.repairs]: parseList(KEYS.repairs),
      [KEYS.activity]: parseList(KEYS.activity),
      [KEYS.users]: parseList(KEYS.users),
    };
    if (Object.values(incoming).every((list) => list.length === 0)) {
      throw new Error("Invalid backup file: no records to merge.");
    }

    const added = { inventory: 0, customers: 0, sales: 0, repairs: 0 };

    function mergeById(key, countKey) {
      const existing = read(key);
      const seen = new Set(existing.map((r) => r?.id).filter(Boolean));
      const fresh = incoming[key].filter((r) => r?.id && !seen.has(r.id));
      if (countKey) added[countKey] = fresh.length;
      if (!fresh.length) return existing;
      const merged = [...existing, ...fresh];
      write(key, merged);
      return merged;
    }

    mergeById(KEYS.inventory, "inventory");
    mergeById(KEYS.customers, "customers");
    mergeById(KEYS.users, null);

    // sales + repairs need their numbers checked for collisions
    function mergeNumbered(key, field, prefix, countKey) {
      const existing = read(key);
      const seenIds = new Set(existing.map((r) => r?.id).filter(Boolean));
      const usedNumbers = new Set(existing.map((r) => r?.[field]).filter(Boolean));
      let highest = existing.reduce((max, r) => Math.max(max, parseNumericSuffix(r?.[field])), 0);

      const fresh = incoming[key]
        .filter((r) => r?.id && !seenIds.has(r.id))
        .map((record) => {
          if (!record[field] || usedNumbers.has(record[field])) {
            highest += 1;
            const reissued = `${prefix}-${String(highest).padStart(5, "0")}`;
            usedNumbers.add(reissued);
            return { ...record, [field]: reissued };
          }
          usedNumbers.add(record[field]);
          highest = Math.max(highest, parseNumericSuffix(record[field]));
          return record;
        });

      added[countKey] = fresh.length;
      if (fresh.length) {
        const merged = [...existing, ...fresh].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        write(key, merged);
      }
      return highest;
    }

    const highestInvoice = mergeNumbered(KEYS.sales, "invoice", "INV", "sales");
    const highestTicket = mergeNumbered(KEYS.repairs, "ticket", "TKT", "repairs");

    // activity is a log, not a keyed collection -- merge by id, newest first
    const existingActivity = read(KEYS.activity);
    const seenActivity = new Set(existingActivity.map((a) => a?.id).filter(Boolean));
    const freshActivity = incoming[KEYS.activity].filter((a) => a?.id && !seenActivity.has(a.id));
    if (freshActivity.length) {
      write(
        KEYS.activity,
        [...existingActivity, ...freshActivity].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        )
      );
    }

    // Counters must clear the highest number now present, or the next sale
    // would reuse a number that just came in.
    const storedCounters = read(KEYS.counters);
    const counters = Array.isArray(storedCounters) ? {} : storedCounters;
    write(KEYS.counters, {
      ...counters,
      invoice: Math.max(counters.invoice || 0, highestInvoice),
      ticket: Math.max(counters.ticket || 0, highestTicket),
    });

    // Shop details (name, address, receipt text, labels) only come across if
    // this device's settings were never touched -- otherwise merging would
    // quietly rewrite settings the owner had already set here.
    let settingsCopied = false;
    if (storage.getItem(KEYS.settings) == null && data[KEYS.settings] != null) {
      const raw = data[KEYS.settings];
      JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
      storage.setItem(KEYS.settings, typeof raw === "string" ? raw : JSON.stringify(raw));
      settingsCopied = true;
    }

    return { added, settingsCopied };
  },
  // ---- Sync ----
  // What HQ is shown. Activity is included because the mockup's feed is built
  // from it; users, settings and counters are not -- HQ has no business
  // holding a branch's PINs, and nothing at HQ reads them.
  SYNC_KINDS: [
    { kind: "sale", key: KEYS.sales },
    { kind: "repair", key: KEYS.repairs },
    { kind: "product", key: KEYS.inventory },
    { kind: "customer", key: KEYS.customers },
    { kind: "activity", key: KEYS.activity },
  ],

  /**
   * Everything changed at or after `since`, as records and tombstones.
   *
   * At or after, not after: two records can share a millisecond, and a strict
   * comparison would drop the second one forever. Re-sending the boundary
   * record costs nothing -- the push is idempotent and refuses to go
   * backwards -- while skipping one loses a sale.
   *
   * `since` must be a LOCAL clock value, never the server's. A desktop whose
   * clock differs from the server's by a few minutes would otherwise skip
   * everything written inside that gap.
   *
   * A record with no updatedAt predates this feature, so its createdAt stands
   * in -- otherwise a shop's entire existing history would look unchanged and
   * never be sent at all.
   */
  /**
   * How many records are genuinely still waiting to go up.
   *
   * Not the same as the batch length. getSyncBatch deliberately re-sends the
   * record sitting exactly on the cursor, because two records can share a
   * millisecond and a strict comparison would drop the second one forever.
   * Counting that re-send as "waiting" would leave the screen permanently
   * reading "1 record waiting" on a shop that is fully up to date.
   */
  countUnsynced: (since) => {
    const batch = db.getSyncBatch(since);
    if (!since) return batch.records.length;
    const cursor = new Date(since).getTime();
    return batch.records.filter((r) => new Date(r.updatedAt).getTime() > cursor).length;
  },

  getSyncBatch: (since, limit = 400) => {
    const after = since ? new Date(since).getTime() : 0;
    const changed = [];

    for (const { kind, key } of db.SYNC_KINDS) {
      for (const row of read(key)) {
        const at = row.updatedAt || row.createdAt;
        if (!at) continue;
        const t = new Date(at).getTime();
        if (!Number.isFinite(t) || t < after) continue;
        changed.push({ id: row.id, kind, updatedAt: new Date(t).toISOString(), payload: row });
      }
    }

    const deleted = [];
    try {
      const raw = storage.getItem(KEYS.tombstones);
      for (const t of raw ? JSON.parse(raw) : []) {
        const at = new Date(t.deletedAt).getTime();
        if (!Number.isFinite(at) || at < after) continue;
        deleted.push({ id: t.id, kind: t.kind, updatedAt: new Date(at).toISOString(), deleted: true });
      }
    } catch { /* an unreadable tombstone list must not block the rest */ }

    // Oldest first, so a batch that is cut short leaves a cursor that can be
    // resumed from without skipping anything in the middle.
    const all = [...changed, ...deleted].sort(
      (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt),
    );
    const records = all.slice(0, limit);
    return {
      records,
      more: all.length > limit,
      // The cursor to store once these have landed: the newest thing actually
      // sent, on this device's own clock. Never the server's reply.
      cursor: records.length ? records[records.length - 1].updatedAt : since || null,
    };
  },

  eraseAllData: () => {
    Object.values(KEYS).forEach((k) => storage.removeItem(k));
  },
};
