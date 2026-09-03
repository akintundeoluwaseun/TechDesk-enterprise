// Local-first data layer. Everything lives in localStorage — fully offline.
import { DEFAULT_LABELS, BUSINESS_PRESETS } from "../data/businessPresets";

const KEYS = {
  inventory: "techdesk_inventory",
  sales: "techdesk_sales",
  customers: "techdesk_customers",
  repairs: "techdesk_repairs",
  activity: "techdesk_activity",
  settings: "techdesk_settings",
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

function nextInvoiceNumber() {
  const sales = read(KEYS.sales);
  const n = sales.length + 1;
  return `INV-${String(n).padStart(5, "0")}`;
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
  nextTicketNumber: () => {
    const repairs = read(KEYS.repairs);
    return `TKT-${String(repairs.length + 1).padStart(5, "0")}`;
  },
  createRepair: (repair) => {
    const repairs = read(KEYS.repairs);
    const record = {
      id: uid("rep"),
      ticket: `TKT-${String(repairs.length + 1).padStart(5, "0")}`,
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
    window.techdesk?.syncActivity?.(activity);
    window.techdesk?.notifyActivity?.({ activity: activity[0], settings: db.getSettings() });
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
    Object.entries(data).forEach(([key, value]) => {
      if (value != null) localStorage.setItem(key, value);
    });
  },
  eraseAllData: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
