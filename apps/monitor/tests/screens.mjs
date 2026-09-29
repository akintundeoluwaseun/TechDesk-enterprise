import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const now = new Date();
const mins = (n) => new Date(now.getTime() - n * 60000).toISOString();
const SUMMARY = {
  ok: true,
  business: { id: "b1", name: "AS Computers", ownerName: "Joshua Akintunde" },
  stats: { connectedDevices: 3, devicesNeedingAttention: 1, salesToday: 12, openRepairs: 4, lowStock: 2 },
  branches: [
    { id: "br1", name: "Main Office", salesToday: 7,
      devices: [{ id: "d1", role: "manager", edition: "enterprise", lastSeenAt: mins(1), online: true }] },
    { id: "br2", name: "Iyanganku Branch", salesToday: 5,
      devices: [{ id: "d2", role: "manager", edition: "business", lastSeenAt: mins(3), online: true },
                { id: "d3", role: "worker", edition: "business", lastSeenAt: mins(2), online: true }] },
    { id: "br3", name: "Workshop", salesToday: 0,
      devices: [{ id: "d4", role: "worker", edition: "business", lastSeenAt: mins(190), online: false }] },
  ],
  activity: [
    { id: "a1", at: mins(6),  branch: "Main Office",       message: "Sale recorded — ₦45,000", type: "sale" },
    { id: "a2", at: mins(33), branch: "Iyanganku Branch",  message: "Low stock: Laptop Charger", type: "inventory" },
    { id: "a3", at: mins(58), branch: "Main Office",       message: "Repair marked ready",      type: "repair" },
    { id: "a4", at: mins(95), branch: "Workshop",          message: "Device went offline",      type: "alert" },
    { id: "a5", at: mins(140),branch: "Iyanganku Branch",  message: "New customer added",       type: "customer" },
  ],
};
const BRANCH = {
  ok: true,
  records: [
    { id: "s1", at: mins(6),  payload: { invoice: "INV-00042", customerName: "Bola A.", total: 45000 } },
    { id: "s2", at: mins(64), payload: { invoice: "INV-00041", customerName: "Walk-in", total: 12500 } },
    { id: "s3", at: mins(180),payload: { invoice: "INV-00040", customerName: "Chidi O.", total: 8000 } },
  ],
};

async function page(token = "tok") {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // Capacitor's web Preferences prefixes its keys, so seed both: the app
  // reads through Preferences, the plain key is the fallback path.
  await p.addInitScript((t) => {
    try {
      localStorage.setItem("CapacitorStorage.techdesk_monitor_session", t);
      localStorage.setItem("techdesk_monitor_session", t);
    } catch {}
  }, token);
  await p.route("**/functions/v1/hq-data", (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    const data = body.action === "branch" ? BRANCH : body.action === "logout" ? { ok: true } : SUMMARY;
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await p.route("**/functions/v1/hq-login-start", (r) => r.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ ok: true, phone: "+234 801 *** 5678" }) }));
  await p.route("**/functions/v1/hq-login-verify", (r) => r.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ ok: true, token: "tok" }) }));
  await p.goto("http://127.0.0.1:4180/");
  await p.waitForTimeout(1200);
  return p;
}

const errs = [];
// login
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.route("**/functions/v1/hq-login-start", (r) => r.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ ok: true, phone: "+234 801 *** 5678" }) }));
  await p.goto("http://127.0.0.1:4180/");
  await p.waitForTimeout(900);
  await p.screenshot({ path: "mon-login.png" });
  await p.fill('#hq-identifier', "08012345678");
  await p.locator('button[type="submit"]').click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: "mon-login-code.png" });
  await p.close();
}
// login by email -- the HQ that signed up with no phone on file at all
// needs a real way back in, not just the field that assumes a phone exists
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errs.push(String(e)));
  let sentBody = null;
  await p.route("**/functions/v1/hq-login-start", (r) => {
    sentBody = JSON.parse(r.request().postData() || "{}");
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, email: "o***n@example.com" }) });
  });
  await p.goto("http://127.0.0.1:4180/");
  await p.waitForTimeout(900);
  await p.fill('#hq-identifier', "owner@example.com");
  await p.locator('button[type="submit"]').click();
  await p.waitForTimeout(600);
  if (!sentBody || sentBody.identityEmail !== "owner@example.com" || "phone" in sentBody) {
    errs.push(`login-by-email sent the wrong body: ${JSON.stringify(sentBody)}`);
  }
  const sentToText = await p.locator("b.text-ink").textContent().catch(() => null);
  if (sentToText !== "o***n@example.com") {
    errs.push(`login-by-email did not show the masked email back, got: ${sentToText}`);
  }
  await p.close();
}
{
  const p = await page(); p.on("pageerror", (e) => errs.push(String(e)));
  await p.screenshot({ path: "mon-home.png", fullPage: true });
  await p.locator('button:has-text("Devices")').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: "mon-devices.png", fullPage: true });
  await p.locator('button:has-text("Reports")').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: "mon-reports.png", fullPage: true });
  await p.locator('button:has-text("Settings")').click(); await p.waitForTimeout(500);
  await p.screenshot({ path: "mon-settings.png", fullPage: true });
  await p.locator('button:has-text("Home")').click(); await p.waitForTimeout(500);
  await p.locator('button:has-text("Main Office")').first().click(); await p.waitForTimeout(800);
  await p.screenshot({ path: "mon-branch.png", fullPage: true });
  await p.close();
}
// empty state — a brand new HQ with nothing connected
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.addInitScript(() => {
    try {
      localStorage.setItem("CapacitorStorage.techdesk_monitor_session", "t");
      localStorage.setItem("techdesk_monitor_session", "t");
    } catch {}
  });
  await p.route("**/functions/v1/hq-data", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, business: { name: "New Shop", ownerName: "Ada" },
      stats: {}, branches: [], activity: [] }) }));
  await p.goto("http://127.0.0.1:4180/");
  await p.waitForTimeout(1000);
  await p.screenshot({ path: "mon-empty.png", fullPage: true });
  await p.close();
}
await b.close();
console.log("page errors:", errs.length ? errs.slice(0, 5) : "none");
