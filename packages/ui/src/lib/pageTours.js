// A short tour the first time each page (and each Settings tab) is opened.
//
// The welcome tour shows where things are; this shows how to use the page
// you've just arrived on, at the moment you arrive -- the ticket button on
// Repairs, the filters on Inventory, the receipt buttons on Sales -- once.
// Steps that point at something not on screen yet (no sales, no repairs)
// are left out rather than waited for.
const PREFIX = "techdesk_page_tour_";

export function pageTourKey(pathname, search = "") {
  const page = (pathname || "/").replace(/^\//, "");
  if (!page) return null; // the dashboard is the welcome tour's
  if (page === "settings") {
    const tab = new URLSearchParams(search).get("tab") || "shop";
    return `settings-${tab}`;
  }
  return page;
}

export function pageTourSeen(key) {
  try { return localStorage.getItem(PREFIX + key) === "1"; } catch { return true; }
}

export function markPageTourSeen(key) {
  try { localStorage.setItem(PREFIX + key, "1"); } catch { /* private mode */ }
}

/** Forget every page tour, so each page shows its tour again (Help → tours). */
export function resetPageTours() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* nothing to reset */ }
}

const step = (target, title, body) => ({ target, title, body, action: "next" });

export function pageTourSteps(key, { desktop = true, repairs = "repair", ticket = "repair ticket" } = {}) {
  const tap = desktop ? "Click" : "Tap";
  switch (key) {
    case "sales":
      return [
        step("new-sale", "Ring up a sale", "Add what they're buying, take payment, and it's saved. Stock comes off the shelf by itself."),
        step("page-search", "Find any sale", "Search by invoice number or customer name."),
        step("sale-status", "Paid, or still owing?", "Change a sale to Paid when the money comes in. Until then TechDesk reminds you every 5 hours."),
        step("sale-actions", "Get the receipt to your customer", `${tap} Print for paper, Save for a PDF, or WhatsApp to send it straight to their phone.`),
      ];
    case "repairs":
      return [
        step("new-repair", `Book in a ${repairs}`, "The customer's details, the fault and the price. A ticket is made for it."),
        step("blank-ticket", "A blank ticket form", "Print a few to fill in by hand when the shop is busy, and type them in later."),
        step("repair-actions", `Download the ${ticket}`, `${tap} the ticket icon to print it and give it to your customer. It's their proof of what they left with you.`),
        step("repair-status", "Move it along", "Update the status as you work, and the payment when they pay. Ready but not collected? You'll be reminded."),
        step("page-search", "Find any job", "Search by ticket, customer, phone or device."),
      ];
    case "inventory":
      return [
        step("new-product", "Add what you sell", "Name, price, cost and how many you have. Every sale takes from it."),
        step("inventory-filters", "See what matters", "Show what's in stock, running low or sold out, by category, sorted how you like."),
        step("page-search", "Find a product fast", "Type part of the name."),
        step("page-export", "Take it with you", "Export your stock list, or the restock list of what's low, as a spreadsheet."),
      ];
    case "customers":
      return [
        step("new-customer", "Your customers", "Everyone you sell to or repair for is saved here automatically. Add one by hand any time."),
        step("page-search", "Find anyone", "Search by name, phone, email or address, and see what they've bought and what they owe."),
      ];
    case "reports":
      return [
        step("report-period", "Pick the period", "Today, this week, 30 days or this month. Every number below follows it."),
        step("report-download", "Share the numbers", "Download a report as a PDF, or the figures as a spreadsheet."),
      ];
    case "activity":
      return [
        step("page-search", "Everything that happened", "Every sale, repair, stock change and sign-in, with who did it. Search or filter to find one."),
      ];
    case "settings-shop":
      return [
        step("shop-name", "Your shop, on every receipt", "Your name, logo, phone and address print on receipts and tickets."),
        step("owner-signature", "Sign once", "Your signature goes on every receipt and ticket automatically."),
        step("receipts", "Receipts your way", "Choose what each receipt shows and the note at the bottom."),
      ];
    case "settings-users":
      return [step("settings-panel", "Staff accounts", "Give each person their own login, and choose which pages they can open.")];
    case "settings-device":
      return [step("settings-panel", "This device", "Backups, restoring, and moving your records to another computer live here.")];
    case "settings-account":
      return [step("settings-panel", "Your account", "Sign in to keep your devices in step, invite workers with a code, and connect branches to head office.")];
    default:
      return [];
  }
}
