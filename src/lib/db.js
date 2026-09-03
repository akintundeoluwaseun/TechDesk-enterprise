// Local-first data layer. Everything lives in localStorage — fully offline.
import { DEFAULT_LABELS, BUSINESS_PRESETS } from "../data/businessPresets";

const KEYS = {
  inventory: "techdesk_inventory",
  sales: "techdesk_sales",
  customers: "techdesk_customers",
  repairs: "techdesk_repairs",
  activity: "techdesk_activity",
  settings: "techdesk_settings",
  users: "techdesk_users",
  counters: "techdesk_counters",
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

export const db = {
  KEYS,
  uid,

  // ---- Inventory ----
  getInventory: () => read(KEYS.inventory),
  saveInventory: (items) => write(KEYS.inventory, items),
  findInventoryItem: (id) => read(KEYS.inventory).find((i) => i.id === id),
  addInventoryItem: (product) => {
    const items = read(KEYS.inventory);
    const record = { id: uid("prod"), createdAt: new Date().toISOString(), ...product };
    items.unshift(record);
    write(KEYS.inventory, items);
    return record;
  },
  updateInventoryItem: (id, patch) => {
    const items = read(KEYS.inventory);
    const idx = items.findIndex((i) => i.id === id);
    if (idx > -1) {
      items[idx] = { ...items[idx], ...patch };
      write(KEYS.inventory, items);
      return items[idx];
    }
    return null;
  },
  deleteInventoryItem: (id) => {
    write(KEYS.inventory, read(KEYS.inventory).filter((i) => i.id !== id));
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
    const customer = {
      id: uid("cust"),
      name: name || "Walk-in",
      phone: phone || "",
      email: email || "",
      address: address || "",
      createdAt: new Date().toISOString(),
    };
    customers.push(customer);
    write(KEYS.customers, customers);
    return customer;
  },

  // ---- Sales ----
  getSales: () => read(KEYS.sales),
  nextInvoiceNumber,
  createSale: (sale) => {
    const sales = read(KEYS.sales);
    const record = {
      id: uid("sale"),
      invoice: nextInvoiceNumber(),
      createdAt: new Date().toISOString(),
      ...sale,
    };
    sales.unshift(record);
    write(KEYS.sales, sales);

    // decrement stock for items sold from inventory
    if (sale.items?.length) {
      const inventory = read(KEYS.inventory);
      sale.items.forEach((item) => {
        if (!item.fromInventory) return;
        const idx = inventory.findIndex((p) => p.id === item.productId);
        if (idx > -1) {
          inventory[idx].stock = Math.max(0, (inventory[idx].stock || 0) - item.qty);
        }
      });
      write(KEYS.inventory, inventory);
    }

    return record;
  },
  updateSale: (id, patch) => {
    const sales = read(KEYS.sales);
    const idx = sales.findIndex((s) => s.id === id);
    if (idx > -1) {
      sales[idx] = { ...sales[idx], ...patch };
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
  },

  // ---- Repairs ----
  getRepairs: () => read(KEYS.repairs),
  saveRepairs: (items) => write(KEYS.repairs, items),
  nextTicketNumber,
  createRepair: (repair) => {
    const repairs = read(KEYS.repairs);
    const record = {
      id: uid("rep"),
      ticket: nextTicketNumber(),
      createdAt: new Date().toISOString(),
      status: "received",
      paymentStatus: "Unpaid",
      ...repair,
    };
    repairs.unshift(record);
    write(KEYS.repairs, repairs);
    return record;
  },
  updateRepair: (id, patch) => {
    const repairs = read(KEYS.repairs);
    const idx = repairs.findIndex((r) => r.id === id);
    if (idx > -1) {
      repairs[idx] = { ...repairs[idx], ...patch };
      write(KEYS.repairs, repairs);
      return repairs[idx];
    }
    return null;
  },
  deleteRepair: (id) => {
    write(KEYS.repairs, read(KEYS.repairs).filter((r) => r.id !== id));
  },

  // ---- Activity log ----
  logActivity: (entry) => {
    const activity = read(KEYS.activity);
    activity.unshift({ id: uid("act"), createdAt: new Date().toISOString(), ...entry });
    write(KEYS.activity, activity);
  },
  getActivity: () => read(KEYS.activity),

  // ---- Notifications (admin-only, clearable) ----
  getNotifClearedAt: () => localStorage.getItem("techdesk_notif_cleared_at") || null,
  clearNotifications: () => localStorage.setItem("techdesk_notif_cleared_at", new Date().toISOString()),
  getSettings: () => {
    const raw = localStorage.getItem(KEYS.settings);
    const stored = raw ? JSON.parse(raw) : {};
    const defaults = {
      appearance: "dark",
      logo: null,
      shopName: "TechDesk 2.0",
      tagline: "REPAIR \u2022 SALES \u2022 ACCESSORIES",
      address: "",
      phone: "",
      email: "",
      website: "techdesk.ng",
      taxId: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
      returnPolicy: "",
      receiptFooter: "",
      whatsappTemplate: "",
      businessType: "general",
      labels: DEFAULT_LABELS,
      categories: BUSINESS_PRESETS.general.defaultCategories,
    };
    // merge so shops that saved settings before these fields existed still get sane defaults
    return { ...defaults, ...stored, labels: { ...defaults.labels, ...(stored.labels || {}) } };
  },
  saveSettings: (settings) => write(KEYS.settings, settings),

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
      data[k] = localStorage.getItem(k);
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
      if (value != null) localStorage.setItem(key, value);
    });
  },
  eraseAllData: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
