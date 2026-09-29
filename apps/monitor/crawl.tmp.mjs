import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:4190/";
const OUT = "/tmp/claude-0/crawl";
const now = Date.now();
const iso = (d) => new Date(now - d * 864e5).toISOString();
const seed = {
  techdesk_inventory: [
    { id: "p1", name: "iPhone 12 Pro Max 256GB Pacific Blue (UK used)", price: 520000, cost: 450000, stock: 3, category: "Phones", updatedAt: iso(2) },
    { id: "p2", name: "USB-C charger 20W", price: 8500, cost: 5000, stock: 0, category: "Accessories", updatedAt: iso(1) },
    { id: "p3", name: "Samsung A14 screen", price: 35000, cost: 22000, stock: 1, category: "Parts", updatedAt: iso(1) },
  ],
  techdesk_customers: [{ id: "c1", name: "Chukwuemeka Oluwaseun-Adebayo", phone: "08031234567", updatedAt: iso(3) }],
  techdesk_sales: [
    { id: "s1", invoice: "INV-0001", createdAt: iso(0.1), updatedAt: iso(0.1), items: [{ productId: "p1", name: "iPhone 12 Pro Max 256GB Pacific Blue (UK used)", price: 520000, qty: 1 }], customerId: "c1", customerName: "Chukwuemeka Oluwaseun-Adebayo", customerPhone: "08031234567", subtotal: 520000, discount: 0, total: 520000, amountPaid: 300000, paymentMethod: "Transfer", paymentStatus: "Pending" },
    { id: "s2", invoice: "INV-0002", createdAt: iso(9), updatedAt: iso(9), items: [{ productId: "p2", name: "USB-C charger 20W", price: 8500, qty: 2 }], customerName: "Walk-in", subtotal: 17000, discount: 0, total: 17000, amountPaid: 17000, paymentMethod: "Cash", paymentStatus: "Paid" },
  ],
  techdesk_repairs: [
    { id: "r1", ticket: "REP-0001", createdAt: iso(4), updatedAt: iso(4), customerName: "Chukwuemeka Oluwaseun-Adebayo", customerPhone: "08031234567", device: "HP EliteBook 840 G5", problem: "Won't power on after liquid spill, keyboard sticky", status: "Ready", repairCost: 45000, parts: [] },
  ],
  techdesk_settings: { shopName: "Ade Gadgets & Repairs", businessType: "phones" },
  techdesk_tour: "done", techdesk_hide_startup_tutorial: "1", techdesk_whatsnew_seen: "2026-09-29b",
  techdesk_account_gate_decision: "local", techdesk_tour_sale_setup_done: "1", techdesk_ticket_downloaded: "1",
};
const routes = ["", "sales", "repairs", "inventory", "customers", "reports", "activity", "settings"];
const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1366, height: 820 } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const problems = [];
for (const [sizeName, viewport] of Object.entries(sizes)) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport, colorScheme: theme });
    await ctx.addInitScript(([seed, theme]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      localStorage.setItem("techdesk_theme", theme);
    }, [seed, theme]);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text().slice(0, 200)));
    await page.goto(BASE);
    await page.waitForTimeout(3500);
    for (const r of routes) {
      await page.goto(BASE + "#/" + r);
      await page.waitForTimeout(1200);
      const info = await page.evaluate(() => {
        const doc = document.documentElement;
        const over = doc.scrollWidth - doc.clientWidth;
        const wide = [];
        for (const el of document.querySelectorAll("body *")) {
          const b = el.getBoundingClientRect();
          if (b.width && b.right > doc.clientWidth + 2 && getComputedStyle(el).position !== "fixed") {
            let p = el.parentElement, scrolls = false;
            while (p) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { scrolls = true; break; } p = p.parentElement; }
            if (!scrolls) wide.push((el.tagName + "." + (el.className?.baseVal ?? el.className)).slice(0, 90));
          }
        }
        return { over, wide: wide.slice(0, 4), h1: document.querySelector("h1,h2")?.textContent?.slice(0, 40) };
      });
      const name = `${sizeName}-${theme}-${r || "dashboard"}`;
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      if (info.over > 0 || info.wide.length) problems.push(`${name}: overflow ${info.over}px ${JSON.stringify(info.wide)}`);
      console.log(name, "|", info.h1);
    }
    if (errs.length) problems.push(`${sizeName}-${theme} errors:\n  ` + [...new Set(errs)].slice(0, 8).join("\n  "));
    await ctx.close();
  }
}
await browser.close();
console.log("\nPROBLEMS:\n" + (problems.join("\n") || "none"));
