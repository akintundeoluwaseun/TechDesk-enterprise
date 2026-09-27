const { app, BrowserWindow, ipcMain, shell } = require("electron");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const fs = require("fs");
const nodeCrypto = require("crypto");
const QRCode = require("qrcode");
const selfsigned = require("selfsigned");
const webpush = require("web-push");

const isDev = !app.isPackaged;
app.disableHardwareAcceleration();

let activitySnapshot = [];
let lowStockSnapshot = [];
let repairsSnapshot = [];
let inventorySnapshot = [];
let shopInfoSnapshot = {};
let shopName = "TechDesk";
let networkServer;

// Notification titles shown in real push popups -- kept separate from the
// page's ICONS map (which also carries colors/emoji irrelevant to a push
// payload) so the main process doesn't need to parse its own served HTML.
const PUSH_TYPE_LABELS = {
  sale: "Sale",
  repair: "Repair",
  inventory: "Stock Update",
  customer: "New Customer",
  settings: "Account Update",
};

// Phones that opted into real push notifications (endpoint + encryption
// keys from the browser's PushSubscription), persisted so they survive an
// app restart -- otherwise every relaunch would silently stop notifying
// devices that already granted permission.
const pushSubsPath = path.join(app.getPath("userData"), "lan-cert", "push-subscriptions.json");
let pushSubscriptions = [];
try {
  pushSubscriptions = JSON.parse(fs.readFileSync(pushSubsPath, "utf-8"));
  if (!Array.isArray(pushSubscriptions)) pushSubscriptions = [];
} catch {
  pushSubscriptions = [];
}
function savePushSubscriptions() {
  try {
    fs.mkdirSync(path.dirname(pushSubsPath), { recursive: true });
    fs.writeFileSync(pushSubsPath, JSON.stringify(pushSubscriptions), "utf-8");
  } catch (err) {
    console.error("Failed to save push subscriptions:", err.message);
  }
}

// Only activity created after the server started (or after the last
// broadcast) should trigger a push -- otherwise every launch would replay
// the entire history as a burst of notifications to every subscribed phone.
let lastBroadcastAt = new Date();

// Sends a real OS push (works even with the browser fully closed) to every
// subscribed phone. Requires the shop's PC to have internet access, since
// Chrome routes web push through Google's FCM service -- if that's
// unavailable, sendNotification simply rejects per-subscription and this
// logs it rather than throwing, so the rest of the app is unaffected.
function broadcastPush(items) {
  if (!items.length || !pushSubscriptions.length) return;
  items.slice(-5).forEach((item) => {
    const payload = JSON.stringify({
      title: PUSH_TYPE_LABELS[item.type] || "Activity",
      body: item.message + (item.actor ? " — by " + item.actor : ""),
      tag: item.type + "-" + item.createdAt,
    });
    pushSubscriptions.forEach((sub) => {
      webpush.sendNotification(sub, payload).catch((err) => {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          // subscription is dead (browser data cleared, permission revoked, etc.)
          pushSubscriptions = pushSubscriptions.filter((s) => s.endpoint !== sub.endpoint);
          savePushSubscriptions();
        } else {
          console.error("Push send failed:", err && err.message);
        }
      });
    });
  });
}

// VAPID keys identify this app's server to the push service so it can't be
// impersonated; cached alongside the TLS cert so subscriptions created
// against one keypair keep working across restarts.
function getOrCreateVapidKeys() {
  const filePath = path.join(app.getPath("userData"), "lan-cert", "vapid.json");
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    // fall through and regenerate
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(keys), "utf-8");
  return keys;
}

// os.networkInterfaces() lists every adapter, and picking the first
// non-internal IPv4 blindly often grabs a VPN, VirtualBox, VMware, Docker,
// or Hyper-V virtual adapter instead of the real Wi-Fi/Ethernet connection —
// that address looks valid but nothing else on the LAN can reach it. Skip
// interface names that match common virtual-adapter patterns and prefer
// whatever's left.
function getLanIp() {
  const interfaces = os.networkInterfaces();
  const virtualNamePattern = /virtual|vmware|virtualbox|vethernet|hyper-v|docker|tailscale|zerotier|loopback|tunnel|^tun\d|^tap\d/i;
  const candidates = [];
  for (const [name, values] of Object.entries(interfaces)) {
    for (const item of values || []) {
      if (item.family === "IPv4" && !item.internal) {
        candidates.push({ name, address: item.address });
      }
    }
  }
  const real = candidates.find((c) => !virtualNamePattern.test(c.name));
  return (real || candidates[0] || {}).address || "127.0.0.1";
}

// The LAN activity page needs HTTPS, not just a nicer look -- Chrome refuses
// the Notification permission prompt entirely on a plain-http, non-localhost
// origin, so real popups on a phone are only possible over TLS. There's no
// certificate authority to ask on a private LAN, so this generates a
// self-signed one and caches it in userData so it's stable across restarts
// (a phone that already accepted it once won't need to keep re-trusting a
// new one every launch).
// Only used when TECHDESK_LAN_TLS=1 (see startActivityServer). The cert is
// tied to the current LAN IP: a certificate with no matching subjectAltName
// is rejected outright by modern browsers, which is what the old
// commonName-only cert did.
async function getOrCreateCert(ip) {
  const dir = path.join(app.getPath("userData"), "lan-cert");
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  const ipPath = path.join(dir, "issued-for.txt");
  try {
    // a DHCP lease change makes the stored cert wrong for the new address
    const issuedFor = fs.existsSync(ipPath) ? fs.readFileSync(ipPath, "utf-8").trim() : null;
    if (issuedFor === ip && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath, "utf-8"), cert: fs.readFileSync(certPath, "utf-8") };
    }
  } catch {
    // fall through and regenerate
  }
  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
  const altNames = [{ type: 2, value: "techdesk.local" }];
  if (ip) altNames.push({ type: 7, ip }); // type 7 = iPAddress
  const pems = await selfsigned.generate([{ name: "commonName", value: ip || "techdesk.local" }], {
    keySize: 2048,
    notAfterDate,
    extensions: [{ name: "basicConstraints", cA: true }, { name: "subjectAltName", altNames }],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyPath, pems.private, "utf-8");
  fs.writeFileSync(certPath, pems.cert, "utf-8");
  fs.writeFileSync(ipPath, String(ip || ""), "utf-8");
  return { key: pems.private, cert: pems.cert };
}

// Shell for the read-only mobile activity page. Everything dynamic (shop
// name, activity, low stock) is fetched from /activity.json and rendered
// client-side; the only thing baked in at build time is the VAPID public
// key, since that's fixed for this app's lifetime and the page needs it to
// subscribe to push.
function buildActivityPageHtml(vapidPublicKey) {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TechDesk Activity</title>
<style>
:root{
  color-scheme:light;
  --bg:#e8ecf3;
  --shadow-dark:#c3c9d4;
  --shadow-light:#ffffff;
  --text:#1e2a3a;
  --text-muted:#64748b;
}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text)}
.wrap{max-width:480px;margin:0 auto;padding:20px 16px 96px}
.raised{background:var(--bg);border-radius:20px;box-shadow:8px 8px 16px var(--shadow-dark),-8px -8px 16px var(--shadow-light)}
header.raised{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;margin-bottom:16px}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.15rem;color:var(--text);flex:0 0 auto;box-shadow:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light)}
h1{margin:0;font-size:1.1rem;font-weight:700;line-height:1.25}
.sub{font-size:.76rem;color:var(--text-muted);margin-top:1px}
.status{font-size:.72rem;font-weight:600;padding:5px 11px;border-radius:999px;white-space:nowrap;display:flex;align-items:center;gap:5px}
.status::before{content:'';width:7px;height:7px;border-radius:50%}
.status.online{background:#d1fae5;color:#059669}
.status.online::before{background:#059669}
.status.offline{background:#fee2e2;color:#dc2626}
.status.offline::before{background:#dc2626}
.summary-card{display:flex;align-items:center;gap:14px;padding:16px;margin-bottom:18px}
.summary-count{font-size:1.6rem;font-weight:800;line-height:1}
.summary-label{font-size:.8rem;color:var(--text-muted);margin-top:2px}
.summary-text{flex:1}
.chevron{color:var(--text-muted);flex:0 0 auto}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.section-title{font-weight:700;font-size:1rem}
#markRead{border:none;font:inherit;background:var(--bg);color:var(--text);font-size:.75rem;font-weight:600;padding:8px 14px;border-radius:999px;box-shadow:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light)}
#markRead:active{box-shadow:inset 3px 3px 6px var(--shadow-dark),inset -3px -3px 6px var(--shadow-light)}
.item{position:relative;display:flex;gap:12px;padding:14px;margin-bottom:14px}
.icon-badge{flex:0 0 auto;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light)}
.icon-badge.neutral{background:var(--bg);color:var(--text)}
.icon-badge svg{width:20px;height:20px}
.body{flex:1;min-width:0;padding-right:10px}
.row1{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.row1 b{font-size:.92rem}
.time{font-size:.68rem;color:var(--text-muted);white-space:nowrap;flex:0 0 auto}
.msg{font-size:.82rem;color:var(--text-muted);margin-top:3px;line-height:1.35}
.actor{font-size:.72rem;color:var(--text-muted);margin-top:3px}
.dot{position:absolute;bottom:14px;right:14px;width:8px;height:8px;border-radius:50%;background:#2563eb}
.empty{color:var(--text-muted);font-size:.85rem;text-align:center;padding:24px 0}
.badge{display:inline-block;font-size:.68rem;font-weight:700;text-transform:capitalize;padding:2px 8px;border-radius:999px;background:#e0e7ff;color:#4338ca;margin-top:4px}
.info-row{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:.85rem}
.info-row:last-child{border-bottom:none}
.info-row .label{color:var(--text-muted);flex:0 0 92px}
.bottomnav{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-around;background:var(--bg);padding:10px 6px calc(8px + env(safe-area-inset-bottom));box-shadow:0 -8px 16px var(--shadow-dark);z-index:10}
.navbtn{appearance:none;background:none;border:none;font:inherit;display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--text-muted);padding:4px 16px}
.navbtn svg{width:22px;height:22px}
.navbtn span{font-size:.66rem;font-weight:600}
.navbtn.active{color:#2563eb}
</style>
<div class="wrap">
  <header class="raised">
    <div class="brand">
      <div class="logo">T</div>
      <div>
        <h1 id="shopName">Loading…</h1>
        <div class="sub">Mobile Notifications</div>
      </div>
    </div>
    <div id="status" class="status offline">Offline</div>
  </header>

  <div class="raised" id="notifBanner" hidden style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:16px">
    <div class="icon-badge neutral" style="width:38px;height:38px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    </div>
    <div style="flex:1">
      <div style="font-weight:700;font-size:.88rem">Get notified instantly</div>
      <div class="sub" style="margin-top:1px">Turn on alerts for new activity</div>
    </div>
    <button id="enableNotif" style="border:none;font:inherit;background:#2563eb;color:#fff;font-size:.75rem;font-weight:700;padding:8px 14px;border-radius:999px">Enable</button>
  </div>

  <div id="tab-home">
    <div class="raised summary-card">
      <div class="icon-badge neutral">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      </div>
      <div class="summary-text">
        <div class="summary-count" id="summaryCount">0</div>
        <div class="summary-label" id="summaryLabel">New Notifications</div>
      </div>
      <div class="chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <div class="section-head">
      <div class="section-title">Notifications</div>
      <button id="markRead">Mark all read</button>
    </div>
    <div id="feed">Loading…</div>
  </div>

  <div id="tab-repairs" hidden>
    <div class="section-head"><div class="section-title">Active Repairs</div></div>
    <div id="repairsList">Loading…</div>
  </div>

  <div id="tab-inventory" hidden>
    <div class="section-head"><div class="section-title">Inventory</div></div>
    <div id="inventoryList">Loading…</div>
  </div>

  <div id="tab-more" hidden>
    <div class="section-head"><div class="section-title">More</div></div>
    <div class="raised" style="padding:14px 16px" id="shopInfoCard">Loading…</div>
  </div>
</div>

<nav class="bottomnav">
  <button class="navbtn active" data-tab="home">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    <span>Home</span>
  </button>
  <button class="navbtn" data-tab="repairs">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    <span>Repairs</span>
  </button>
  <button class="navbtn" data-tab="inventory">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
    <span>Inventory</span>
  </button>
  <button class="navbtn" data-tab="more">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
    <span>More</span>
  </button>
</nav>
<script>
var KEY_LASTREAD = 'techdesk_lan_last_read';
function getLastRead() {
  var v = localStorage.getItem(KEY_LASTREAD);
  return v ? new Date(v) : new Date(0);
}
function setLastRead(d) {
  localStorage.setItem(KEY_LASTREAD, d.toISOString());
}

var SVG = {
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>'
};

var ICONS = {
  sale: { svg: SVG.cart, label: 'Sale', bg: '#10b981' },
  repair: { svg: SVG.wrench, label: 'Repair', bg: '#3b82f6' },
  inventory: { svg: SVG.box, label: 'Stock Update', bg: '#f59e0b' },
  lowstock: { svg: SVG.box, label: 'Low Stock Alert', bg: '#f59e0b' },
  customer: { svg: SVG.person, label: 'New Customer', bg: '#8b5cf6' },
  settings: { svg: SVG.gear, label: 'Account Update', bg: '#64748b' }
};
var DEFAULT_ICON = { svg: SVG.bell, label: 'Activity', bg: '#94a3b8' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&]/g, function (c) {
    return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;';
  });
}

function timeAgo(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var diff = Math.max(0, Date.now() - d.getTime());
  var min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  var hr = Math.round(min / 60);
  if (hr < 24) return hr + 'h ago';
  var day = Math.round(hr / 24);
  return day + 'd ago';
}

var lastSnapshot = '';

// Low-stock is a live state, not a logged event, so it has no natural
// "when it happened" timestamp of its own -- reuse the product's own
// createdAt so it slots into the timeline at a stable position instead of
// jumping to "just now" (and re-appearing as unread) on every poll.
function buildFeed(data) {
  var activity = (data && data.activity) || [];
  var lowStock = (data && data.lowStock) || [];
  var feed = activity.map(function (a) { return a; });
  lowStock.forEach(function (p) {
    feed.push({
      type: 'lowstock',
      message: (p.name || 'Item') + ' — only ' + (p.stock == null ? 0 : p.stock) + ' remaining.',
      createdAt: p.createdAt || p.updatedAt || new Date(0).toISOString()
    });
  });
  feed.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return feed;
}

function renderHome(data) {
  var feed = buildFeed(data);
  var lastRead = getLastRead();
  var unread = feed.filter(function (a) { return new Date(a.createdAt) > lastRead; }).length;

  document.getElementById('summaryCount').textContent = String(unread);
  document.getElementById('summaryLabel').textContent = unread === 1 ? 'New Notification' : 'New Notifications';

  document.getElementById('feed').innerHTML = feed.length ? feed.map(function (item) {
    var icon = ICONS[item.type] || DEFAULT_ICON;
    var isUnread = new Date(item.createdAt) > lastRead;
    var actor = item.actor ? '<div class="actor">by ' + esc(item.actor) + '</div>' : '';
    return (
      '<div class="raised item">' +
        '<div class="icon-badge" style="background:' + icon.bg + '">' + icon.svg + '</div>' +
        '<div class="body">' +
          '<div class="row1"><b>' + esc(icon.label) + '</b><span class="time">' + timeAgo(item.createdAt) + '</span></div>' +
          '<div class="msg">' + esc(item.message || '') + '</div>' +
          actor +
        '</div>' +
        (isUnread ? '<span class="dot"></span>' : '') +
      '</div>'
    );
  }).join('') : '<p class="empty">No activity yet.</p>';
}

function renderRepairs(data) {
  var repairs = (data && data.repairs) || [];
  document.getElementById('repairsList').innerHTML = repairs.length ? repairs.map(function (r) {
    return (
      '<div class="raised item">' +
        '<div class="icon-badge" style="background:#3b82f6">' + SVG.wrench + '</div>' +
        '<div class="body">' +
          '<div class="row1"><b>' + esc(r.device || 'Device') + '</b><span class="time">' + timeAgo(r.createdAt) + '</span></div>' +
          '<div class="msg">' + esc(r.problem || '') + '</div>' +
          '<div class="actor">' + esc(r.ticket || '') + ' • ' + esc(r.customerName || 'Walk-in') + '</div>' +
          '<span class="badge">' + esc(r.status || '') + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('') : '<p class="empty">No active repairs.</p>';
}

function renderInventory(data) {
  var inventory = (data && data.inventory) || [];
  document.getElementById('inventoryList').innerHTML = inventory.length ? inventory.map(function (p) {
    var stock = p.stock == null ? 0 : p.stock;
    var isLow = stock <= (p.lowStockThreshold == null ? 5 : p.lowStockThreshold);
    return (
      '<div class="raised item">' +
        '<div class="icon-badge" style="background:' + (isLow ? '#f59e0b' : '#94a3b8') + '">' + SVG.box + '</div>' +
        '<div class="body">' +
          '<div class="row1"><b>' + esc(p.name || 'Item') + '</b><span class="time">' + (isLow ? 'Low stock' : '') + '</span></div>' +
          '<div class="msg">' + esc(p.category || '') + '</div>' +
          '<div class="actor">' + esc(String(stock)) + ' in stock</div>' +
        '</div>' +
      '</div>'
    );
  }).join('') : '<p class="empty">No inventory yet.</p>';
}

function renderMore(data) {
  var shopInfo = (data && data.shopInfo) || {};
  var rows = [
    { label: 'Address', value: shopInfo.address },
    { label: 'Phone', value: shopInfo.phone },
    { label: 'Email', value: shopInfo.email }
  ].filter(function (r) { return r.value; });
  document.getElementById('shopInfoCard').innerHTML = rows.length ? rows.map(function (r) {
    return '<div class="info-row"><div class="label">' + esc(r.label) + '</div><div>' + esc(r.value) + '</div></div>';
  }).join('') + '<p class="empty" style="padding-top:14px">Read-only view — no changes can be made from this device.</p>' : '<p class="empty">No shop details added yet.</p>';
}

// Real OS-level notifications. Two mechanisms, in priority order:
//
// 1. Web Push (service worker + PushManager) -- delivered by Chrome's push
//    service even with the browser fully closed. Requires the shop's PC to
//    have internet access (the push service is Google's cloud, not
//    anything on this LAN); if that's unavailable, subscribing simply
//    fails and this falls through to mechanism 2.
// 2. In-tab polling -- fires a popup directly from here while the page
//    happens to be open (including backgrounded on most Android Chrome).
//    Used only when push isn't active, so the two mechanisms never double
//    -fire the same event.
//
// Both need the Notification permission first, which Chrome only grants on
// a secure origin (https, or localhost) -- this page is served over the
// LAN's own self-signed HTTPS specifically so that prompt works at all.
var VAPID_PUBLIC_KEY = '${vapidPublicKey || ""}';
var pushActive = false;

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function tryEnablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
    return Promise.reject(new Error('push not supported'));
  }
  return navigator.serviceWorker.register('/sw.js')
    .then(function (reg) {
      return reg.pushManager.getSubscription().then(function (existing) {
        return existing || reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      });
    })
    .then(function (sub) {
      return fetch('/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
    })
    .then(function () { pushActive = true; });
}

var KEY_LASTNOTIFIED = 'techdesk_lan_last_notified';
function getLastNotified() {
  var v = localStorage.getItem(KEY_LASTNOTIFIED);
  if (!v) {
    v = new Date().toISOString();
    localStorage.setItem(KEY_LASTNOTIFIED, v);
  }
  return new Date(v);
}
function setLastNotified(d) {
  localStorage.setItem(KEY_LASTNOTIFIED, d.toISOString());
}

function updateNotifBanner() {
  var banner = document.getElementById('notifBanner');
  if (!('Notification' in window)) {
    banner.hidden = true;
    return;
  }
  banner.hidden = Notification.permission !== 'default';
}
document.getElementById('enableNotif').addEventListener('click', function () {
  Notification.requestPermission().then(function (perm) {
    updateNotifBanner();
    if (perm === 'granted') tryEnablePush().catch(function () { pushActive = false; });
  });
});
updateNotifBanner();
// A previous visit may have already granted permission -- re-establish the
// push subscription silently (browsers can drop them, e.g. after clearing
// site data) rather than waiting for another Enable click that won't show.
if ('Notification' in window && Notification.permission === 'granted') {
  tryEnablePush().catch(function () { pushActive = false; });
}

function maybeNotify(data) {
  if (pushActive) return; // real push already covers this device
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  var lastNotified = getLastNotified();
  var fresh = buildFeed(data).filter(function (a) { return new Date(a.createdAt) > lastNotified; });
  if (!fresh.length) return;
  // Cap how many popups fire at once so a big batch of new activity (e.g.
  // after the app was closed a while) doesn't flood the phone with alerts.
  fresh
    .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); })
    .slice(-5)
    .forEach(function (item) {
      var icon = ICONS[item.type] || DEFAULT_ICON;
      try {
        var n = new Notification(icon.label, {
          body: item.message + (item.actor ? ' — by ' + item.actor : ''),
          tag: item.type + '-' + item.createdAt
        });
        n.onclick = function () { window.focus(); n.close(); };
      } catch (e) {
        // Notification constructor can throw in some embedded contexts; a
        // missed popup shouldn't break the rest of the page.
      }
    });
  var maxTs = fresh.reduce(function (m, a) {
    var t = new Date(a.createdAt).getTime();
    return t > m ? t : m;
  }, lastNotified.getTime());
  setLastNotified(new Date(maxTs));
}

function render(data) {
  var shopName = (data && data.shopName) || 'TechDesk';
  document.title = shopName + ' Activity';
  document.getElementById('shopName').textContent = shopName;
  renderHome(data);
  renderRepairs(data);
  renderInventory(data);
  renderMore(data);
  maybeNotify(data);
}

var TABS = ['home', 'repairs', 'inventory', 'more'];
function showTab(name) {
  TABS.forEach(function (t) {
    document.getElementById('tab-' + t).hidden = t !== name;
  });
  document.querySelectorAll('.navbtn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === name);
  });
}
document.querySelectorAll('.navbtn').forEach(function (btn) {
  btn.addEventListener('click', function () { showTab(btn.getAttribute('data-tab')); });
});

// A single failed poll doesn't mean the shop PC is gone -- a phone that just
// woke, switched Wi-Fi band, or reused a connection the server had already
// closed will drop one request and recover on the next. Only call it Offline
// after two in a row, so the banner stops flickering on refresh.
var failedPolls = 0;

function poll() {
  // cache-bust: some mobile browsers will serve a cached activity.json on a
  // reload, which made the page look frozen even while connected
  fetch('/activity.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('bad status');
    return r.json();
  }).then(function (data) {
    failedPolls = 0;
    document.getElementById('status').textContent = 'Connected';
    document.getElementById('status').className = 'status online';
    var snap = JSON.stringify(data);
    if (snap !== lastSnapshot) {
      lastSnapshot = snap;
      render(data);
    }
  }).catch(function () {
    failedPolls += 1;
    if (failedPolls < 2) return;
    document.getElementById('status').textContent = 'Offline';
    document.getElementById('status').className = 'status offline';
  });
}

document.getElementById('markRead').addEventListener('click', function () {
  setLastRead(new Date());
  lastSnapshot = '';
  poll();
});

poll();
setInterval(poll, 5000);

// Phones suspend timers while the screen is off or the tab is in the
// background, so without this the view sits on stale data (and often a stale
// Offline banner) for a few seconds after you come back to it.
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) poll();
});
window.addEventListener('online', poll);
window.addEventListener('pageshow', poll);
</script>`;
}

// Service worker registered at the page's root scope so it can receive push
// events and show a real OS notification even when no tab is open.
const SERVICE_WORKER_JS = `
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || 'TechDesk';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || undefined
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (allClients) {
      for (var i = 0; i < allClients.length; i++) {
        if ('focus' in allClients[i]) return allClients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
`;

// Small read-only server so another device on the same Wi-Fi can view recent
// activity — nothing here accepts writes.
let serverScheme = "http";

async function startActivityServer() {
  const ip = getLanIp();

  let vapidPublicKey = "";
  try {
    const vapidKeys = getOrCreateVapidKeys();
    webpush.setVapidDetails("mailto:techdeskapp@gmail.com", vapidKeys.publicKey, vapidKeys.privateKey);
    vapidPublicKey = vapidKeys.publicKey;
  } catch (err) {
    // Push notifications won't be offered, but the rest of the page still works.
    console.error("Could not set up push notifications:", err.message);
  }
  const activityPageHtml = buildActivityPageHtml(vapidPublicKey);
  // Nothing before this point should count as "new" for push purposes --
  // otherwise every relaunch would replay the whole activity history as a
  // burst of notifications to every subscribed phone.
  lastBroadcastAt = new Date();

  const requestHandler = (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // match on the path only -- the page appends a cache-busting query string
    const route = (req.url || "/").split("?")[0];
    if (route === "/activity.json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          shopName,
          activity: activitySnapshot,
          lowStock: lowStockSnapshot,
          repairs: repairsSnapshot,
          inventory: inventorySnapshot,
          shopInfo: shopInfoSnapshot,
        })
      );
      return;
    }
    if (route === "/sw.js") {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.end(SERVICE_WORKER_JS);
      return;
    }
    if (req.method === "POST" && route === "/subscribe") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10000) req.destroy(); // a PushSubscription is a few hundred bytes; anything huge is bogus
      });
      req.on("end", () => {
        try {
          const sub = JSON.parse(body);
          if (sub && typeof sub.endpoint === "string" && !pushSubscriptions.some((s) => s.endpoint === sub.endpoint)) {
            pushSubscriptions.push(sub);
            savePushSubscriptions();
          }
          res.statusCode = 200;
          res.end("ok");
        } catch {
          res.statusCode = 400;
          res.end("bad request");
        }
      });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(activityPageHtml);
  };
  // a stale process still holding the port (e.g. this app already running,
  // or a previous instance that didn't release it in time) must not crash
  // the whole app -- the rest of TechDesk works fine without this feature
  const onError = (err) => {
    console.error("LAN activity server failed to start:", err.message);
  };

  // Node closes idle keep-alive sockets after 5s by default -- exactly the
  // page's poll interval, so a poll could land on a socket the server was
  // closing at that moment and fail for no real reason. Holding connections
  // open longer than the poll gap removes that race.
  const applyTimeouts = (server) => {
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 70000;
    return server;
  };

  // Plain HTTP by default. This used to be HTTPS so the phone page could
  // register a service worker for push notifications, but a self-signed cert
  // can't be trusted by a phone without installing a CA on it -- so every
  // visit hit a full-page "Your connection is not private" warning, and
  // browsers refuse to register service workers on a cert-error origin
  // anyway, meaning the notifications it existed for couldn't arrive.
  // A read-only view on the shop's own Wi-Fi doesn't justify that. Set
  // TECHDESK_LAN_TLS=1 to serve HTTPS instead and try push again.
  const useTls = process.env.TECHDESK_LAN_TLS === "1";
  let started = false;

  if (useTls) {
    try {
      const certOptions = await getOrCreateCert(ip);
      networkServer = applyTimeouts(https.createServer(certOptions, requestHandler))
        .on("error", onError)
        .listen(47821, "0.0.0.0");
      serverScheme = "https";
      started = true;
    } catch (err) {
      console.error("Falling back to HTTP for LAN activity server:", err.message);
    }
  }

  if (!started) {
    networkServer = applyTimeouts(http.createServer(requestHandler)).on("error", onError).listen(47821, "0.0.0.0");
    serverScheme = "http";
  }
  return `${serverScheme}://${ip}:47821`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#eaf1fb",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // The sidebar's nav items are real <a href> links (React Router's
  // NavLink, under HashRouter), and the app itself loads from a file://
  // URL -- so without this, hovering a nav icon shows Chromium's native
  // link-target preview with the raw resolved file://.../index.html#/route
  // string. That's a browser-chrome feature separate from the app's own
  // title="..." tooltips (which already show the right short label), so
  // suppressing it here doesn't affect those.
  win.webContents.on("update-target-url", (event) => {
    event.preventDefault();
  });

  // window.open()/target="_blank" (e.g. the WhatsApp buttons on Sales and
  // Repairs) would otherwise open inside a brand-new Electron BrowserWindow
  // by default -- another copy of the app's own chrome, not a real browser
  // or the WhatsApp app. Deny that and hand the URL to the OS instead, so
  // it opens in the system's actual default browser (which itself may then
  // hand off to a locally installed WhatsApp app/WhatsApp Web, same as
  // clicking a wa.me link anywhere else).
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  startActivityServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (networkServer) networkServer.close();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("techdesk:network-info", () => {
  const ip = getLanIp();
  return { ip, url: `${serverScheme}://${ip}:47821` };
});

ipcMain.on("techdesk:sync-activity", (event, payload) => {
  const { shopName: name, activity, lowStock, repairs, inventory, shopInfo } = payload || {};
  activitySnapshot = Array.isArray(activity) ? activity.slice(0, 200) : [];
  lowStockSnapshot = Array.isArray(lowStock) ? lowStock.slice(0, 200) : [];
  repairsSnapshot = Array.isArray(repairs) ? repairs.slice(0, 50) : [];
  inventorySnapshot = Array.isArray(inventory) ? inventory.slice(0, 300) : [];
  shopInfoSnapshot = shopInfo && typeof shopInfo === "object" ? shopInfo : {};
  shopName = typeof name === "string" && name.trim() ? name : "TechDesk";

  const fresh = activitySnapshot.filter((a) => new Date(a.createdAt) > lastBroadcastAt);
  if (fresh.length) {
    broadcastPush(fresh);
    lastBroadcastAt = new Date(fresh.reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), lastBroadcastAt.getTime()));
  }
});

ipcMain.handle("techdesk:show-network-qr", async (event, url) => {
  const target = url || "Network address unavailable";
  const qr = await QRCode.toDataURL(target, { margin: 2, width: 320 });
  const qrWindow = new BrowserWindow({
    width: 460,
    height: 560,
    parent: BrowserWindow.fromWebContents(event.sender),
    modal: true,
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeTarget = escapeHtml(target);
  const safeShopName = escapeHtml(shopName);
  await qrWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><meta name="viewport" content="width=device-width"><title>${safeShopName} QR</title><style>body{font:16px system-ui;text-align:center;padding:28px;background:#f8f7f2;color:#171717}img{width:320px;height:320px;background:#fff;padding:12px;border-radius:16px}code{display:block;word-break:break-all;margin-top:18px;font-size:13px}.note{color:#92400e;background:#fef3c7;border-radius:12px;padding:10px 14px;margin-top:16px;font-size:13px}</style><h2>Connect to ${safeShopName}</h2><p>Scan on the same Wi‑Fi network to view the read-only activity log.</p><img src="${qr}" alt="Connection QR code"><code>${safeTarget}</code>${
        serverScheme === "https"
          ? '<p class="note">First time only: the browser will show a security warning because this connection uses a self-signed certificate. Tap "Advanced" then "Proceed" to continue — this only enables local notifications and is expected.</p>'
          : ""
      }`
    )}`
  );
  return { ok: true };
});

ipcMain.on("techdesk:quit", () => {
  app.quit();
});

// ---- Finding data from other TechDesk editions on this device ----
// Each edition installs under its own userData folder (named after its
// productName), so a device with more than one edition has sibling folders
// next to ours. We never touch another edition's live localStorage -- we
// only read the daily backup JSON it writes below, which is a stable,
// documented format. "TechDesk 2.0" is the pre-rename Solo folder.
// Where an older TechDesk kept its data, so a shop moving to the one app can
// bring their records across.
//
// This list GROWS, it does not shrink. The three editions are retired, but
// their folders are still on the machines of everyone who used them, and
// those are the people this exists for. com.techdesk.app is a different
// application id from com.techdesk.enterprise, so the new build installs
// alongside rather than over the top -- which is what makes bringing the data
// across necessary, and also what makes it safe: nothing is moved until the
// owner says so, and the old install is left untouched.
const KNOWN_EDITION_DIRS = [
  "TechDesk Solo", "TechDesk Business", "TechDesk Enterprise", "TechDesk 2.0",
];

function otherEditionBackupDirs() {
  const selfDir = app.getPath("userData");
  const parent = path.dirname(selfDir);
  const selfName = path.basename(selfDir);
  return KNOWN_EDITION_DIRS.filter((name) => name !== selfName)
    .map((name) => ({ edition: name, dir: path.join(parent, name, "backups") }))
    .filter(({ dir }) => fs.existsSync(dir));
}

function newestBackupFile(dir) {
  // file names are techdesk-backup-YYYY-MM-DD.json, so lexical sort is date order
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("techdesk-backup-") && f.endsWith(".json"))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

ipcMain.handle("techdesk:find-other-editions", () => {
  try {
    const editions = [];
    otherEditionBackupDirs().forEach(({ edition, dir }) => {
      const file = newestBackupFile(dir);
      if (!file) return;
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        const data = parsed.data || {};
        const countOf = (key) => {
          try {
            const arr = JSON.parse(data[key] || "[]");
            return Array.isArray(arr) ? arr.length : 0;
          } catch {
            return 0;
          }
        };
        const counts = {
          sales: countOf("techdesk_sales"),
          repairs: countOf("techdesk_repairs"),
          inventory: countOf("techdesk_inventory"),
          customers: countOf("techdesk_customers"),
        };
        // an empty backup isn't worth offering to merge
        if (Object.values(counts).every((n) => n === 0)) return;
        editions.push({
          edition,
          file,
          savedAt: parsed.exportedAt || fs.statSync(file).mtime.toISOString(),
          counts,
        });
      } catch {
        // unreadable/corrupt backup -- skip this edition rather than fail the scan
      }
    });
    return { ok: true, editions };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("techdesk:read-edition-backup", (event, filePath) => {
  try {
    // Only ever hand back files that sit inside a known edition's backups
    // folder -- the renderer supplies this path, so without this check it
    // could ask for any file on the machine.
    const allowedDirs = otherEditionBackupDirs().map(({ dir }) => path.resolve(dir));
    const resolved = path.resolve(String(filePath || ""));
    const isAllowed =
      path.extname(resolved) === ".json" &&
      allowedDirs.some((dir) => resolved.startsWith(dir + path.sep));
    if (!isAllowed) return { ok: false, error: "Not an edition backup file." };
    return { ok: true, json: fs.readFileSync(resolved, "utf-8") };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ---- Trial clock ----
// The renderer keeps its copy in localStorage, but that can be cleared from
// dev tools or lost with the profile, which would either hand out a fresh
// trial or throw away one already part-spent. This file in userData is the
// durable record; the renderer reconciles the two and keeps the furthest-along.
const TRIAL_FILE = () => path.join(app.getPath("userData"), "trial.json");

ipcMain.handle("techdesk:read-trial", () => {
  try {
    const file = TRIAL_FILE();
    if (!fs.existsSync(file)) return { ok: true, state: null };
    return { ok: true, state: JSON.parse(fs.readFileSync(file, "utf-8")) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("techdesk:write-trial", (event, state) => {
  try {
    // Store only the three fields the trial clock actually uses, so a
    // compromised renderer can't stash arbitrary content in userData.
    const safe = {
      startedAt: String(state?.startedAt || ""),
      daysUsed: Math.max(0, Math.min(365, Math.floor(Number(state?.daysUsed) || 0))),
      lastDay: String(state?.lastDay || ""),
    };
    fs.writeFileSync(TRIAL_FILE(), JSON.stringify(safe), "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ---- Activation ----
// Activation used to live only in the renderer's localStorage. That is the
// least durable store on the machine: Chromium commits it to disk lazily, so
// a power cut or a force-quit soon after activating can lose the write, and
// the shop opens the next morning back on "Activate".
//
// Two things must survive, not one. `activated` is the obvious half. The
// other is `licenseIndex` -- the device's PIN is picked at random from the
// table on first run and stored, and the activation code the customer paid
// for is only valid for THAT pin. Lose the index and the device silently
// draws a different PIN, which invalidates a code that was already bought.
//
// Both now go through fs.writeFileSync here, which is durable the moment it
// returns.
const LICENSE_FILE = () => path.join(app.getPath("userData"), "license.json");

ipcMain.handle("techdesk:read-license", () => {
  try {
    const file = LICENSE_FILE();
    if (!fs.existsSync(file)) return { ok: true, state: null };
    return { ok: true, state: JSON.parse(fs.readFileSync(file, "utf-8")) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("techdesk:write-license", (event, state) => {
  try {
    const existing = (() => {
      try {
        return JSON.parse(fs.readFileSync(LICENSE_FILE(), "utf-8"));
      } catch {
        return {};
      }
    })();

    const index = Number(state?.licenseIndex);
    const safe = {
      // Activation is one-way. Nothing in the app revokes a licence, so a
      // renderer that comes up with an empty localStorage must not be able
      // to write `false` over a device that is already paid for.
      activated: existing.activated === true || state?.activated === true,
      licenseIndex: Number.isInteger(index) && index >= 0
        ? index
        : Number.isInteger(existing.licenseIndex)
          ? existing.licenseIndex
          : null,
    };

    // Write-then-rename, so a power cut mid-write can't leave a truncated
    // file where the licence used to be.
    const tmp = LICENSE_FILE() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(safe), "utf-8");
    fs.renameSync(tmp, LICENSE_FILE());
    return { ok: true, state: safe };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ---- HQ connection ----
// The install id and the device token live here rather than in localStorage,
// for the same reason the licence does: Chromium commits localStorage lazily,
// so a power cut can lose the last few minutes of writes. Losing the install
// id would make the shop look like a brand new device to HQ; losing the token
// would silently disconnect them.
//
// The token is a credential. It is written to userData, never sent to the
// renderer except when the renderer itself just obtained it, and never logged.
const HQ_FILE = () => path.join(app.getPath("userData"), "hq.json");

function readHqState() {
  try {
    return JSON.parse(fs.readFileSync(HQ_FILE(), "utf-8"));
  } catch {
    return {};
  }
}

function writeHqState(next) {
  // Write-then-rename, so a power cut mid-write cannot leave a truncated file
  // where the connection used to be.
  const tmp = HQ_FILE() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next), "utf-8");
  fs.renameSync(tmp, HQ_FILE());
}

ipcMain.handle("techdesk:hq-install-id", () => {
  try {
    const state = readHqState();
    if (typeof state.installId === "string" && state.installId.length >= 16) {
      return { ok: true, installId: state.installId };
    }
    // Generated once and never again. Everything HQ knows about this shop
    // hangs off it.
    const installId = nodeCrypto.randomUUID();
    writeHqState({ ...state, installId });
    return { ok: true, installId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("techdesk:hq-read", () => {
  try {
    const s = readHqState();
    // The token stays here. The renderer needs to know whether it is
    // connected and to whom, not the credential itself.
    return {
      ok: true,
      state: {
        installId: s.installId || null,
        // Two flags, because a device can hold a token without ever having
        // met a head office: registering a sync number gives it one. Saying
        // "connected" for that would put a device that syncs with the bench
        // next door on the Connect tab as connected to an HQ it has never
        // heard of.
        connected: typeof s.token === "string" && s.token.length > 0,
        hqConnected: typeof s.token === "string" && s.token.length > 0 &&
          Boolean(s.businessId),
        businessId: s.businessId || null,
        branchId: s.branchId || null,
        hqPhone: s.hqPhone || null,
        branchName: s.branchName || null,
        connectedAt: s.connectedAt || null,
        lastSyncAt: s.lastSyncAt || null,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("techdesk:hq-save", (event, payload) => {
  try {
    const { token, businessId, branchId, hqPhone, branchName } = payload || {};
    if (typeof token !== "string" || token.length < 16) {
      return { ok: false, error: "Refusing to store an implausible token." };
    }
    const state = readHqState();
    writeHqState({
      ...state,
      token,
      businessId: businessId || null,
      branchId: branchId || null,
      hqPhone: hqPhone || null,
      branchName: branchName || null,
      connectedAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Sync runs in the main process because that is where the token is. Handing
// the token to the renderer so it could post for itself would undo the whole
// reason for keeping it here.
ipcMain.handle("techdesk:hq-sync", async (event, payload) => {
  try {
    const state = readHqState();
    if (!state.token) return { ok: false, error: "not_connected" };

    const res = await fetch(`${payload.url}/functions/v1/sync-push`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${payload.key}`,
        "apikey": payload.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: state.token, records: payload.records || [] }),
    });
    const data = await res.json().catch(() => ({}));

    if (data?.ok) {
      // The cursor comes from the renderer, on this device's clock, and only
      // when records were actually sent. Storing the server's timestamp would
      // silently skip anything written in the gap between the two clocks.
      if (payload.cursor) writeHqState({ ...state, lastSyncAt: payload.cursor });
      return { ok: true, accepted: data.accepted, syncedAt: data.syncedAt };
    }
    // HQ no longer recognises this device: disconnected there, or removed.
    // The token is dead, so it is cleared rather than retried forever -- the
    // owner is shown "not connected" and can connect again.
    if (data?.error === "unknown_device") {
      writeHqState({ installId: state.installId });
      return { ok: false, error: "unknown_device" };
    }
    return { ok: false, error: data?.error || "sync_failed" };
  } catch (err) {
    // Offline is the normal case for a shop, not an exception. It is reported
    // plainly and the cursor is left alone so nothing is skipped.
    return { ok: false, error: "offline", detail: String(err) };
  }
});

// Disconnecting has to reach the server as well as this machine. It used to
// do only the local half, so head office went on listing a device the shop
// had deliberately disconnected, and nothing the shop could do changed that.
//
// The local half always happens, even when the server cannot be told. A shop
// that taps Disconnect is finished with the connection whatever the network
// is doing. What is owed is kept under revokeToken and retried; a token held
// only to hand back is not a connection.
ipcMain.handle("techdesk:hq-disconnect", async (event, payload) => {
  const state = readHqState();
  const token = state.token;
  let told = false;

  if (token && payload?.url && payload?.key) {
    told = await postRevoke(payload.url, payload.key, token);
  }

  try {
    // The install id survives. Disconnecting is not becoming a different
    // shop, and reconnecting later should land on the same device record
    // rather than leaving an orphan behind at HQ.
    writeHqState({
      installId: state.installId,
      ...(told || !token ? {} : { revokeToken: token, revokeAt: new Date().toISOString() }),
    });
    return { ok: true, told };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Hands back a disconnect that could not be delivered at the time. Called on
// launch and when a sync succeeds, which is the cheapest proof that the
// network is back.
// Syncing with another device goes through here for the same reason the HQ
// sync does: the token lives in this process, and handing it to the renderer
// so it could post for itself would undo the point of keeping it here. The
// renderer says which call and what to say; this adds who is saying it.
//
// The function name is checked against a list rather than passed through. It
// arrives from the renderer, and a renderer that could name any function
// could post this device's token to any of them.
const SYNC_FUNCTIONS = new Set(["sync-start", "sync-verify", "sync-links", "sync-pull"]);

ipcMain.handle("techdesk:sync-call", async (event, payload) => {
  const fn = payload?.fn;
  if (!SYNC_FUNCTIONS.has(fn)) return { ok: false, error: "bad_request" };
  if (!payload?.url || !payload?.key) return { ok: false, error: "bad_request" };

  const state = readHqState();
  const body = { ...(payload.body || {}) };

  // Registering is the one call that may arrive with no token, because it is
  // what gives this device one. Everything else needs the token it already
  // has, and says so rather than posting an anonymous request the server
  // would only refuse.
  const registering = fn === "sync-verify" && body.mode === "register";
  const starting = fn === "sync-start" && body.mode === "register";
  if (!state.token && !registering && !starting) {
    return { ok: false, error: "not_registered" };
  }

  // Never from the renderer. The install id identifies this machine to the
  // server, and letting the page choose it would let it register as another.
  body.installId = state.installId || null;
  if (state.token) body.token = state.token;

  let data;
  try {
    const res = await fetch(`${payload.url}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${payload.key}`,
        "apikey": payload.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    data = await res.json();
  } catch (err) {
    // Offline is the normal case for a shop, not an exception.
    return { ok: false, error: "offline", detail: String(err) };
  }

  // A device with no head office gets its identity here, so the token it is
  // handed is stored here too -- and stripped before the renderer sees the
  // answer, exactly as the HQ handshake does it.
  if (registering && data?.ok && typeof data.token === "string" && data.token.length >= 16) {
    const { token, ...rest } = data;
    writeHqState({ ...readHqState(), token, syncPhone: data.phone || null });
    return { ...rest, ok: true, stored: true };
  }

  return data;
});

ipcMain.handle("techdesk:hq-flush-revoke", async (event, payload) => {
  const state = readHqState();
  if (!state.revokeToken) return { ok: true, pending: false };

  // A month. A token nobody has managed to hand back by then is not going to
  // be, and keeping a dead credential on disk serves no one.
  const age = Date.now() - new Date(state.revokeAt || 0).getTime();
  if (!Number.isFinite(age) || age > 30 * 24 * 60 * 60 * 1000) {
    const { revokeToken, revokeAt, ...rest } = state;
    void revokeToken; void revokeAt;
    writeHqState(rest);
    return { ok: true, pending: false, expired: true };
  }

  const told = await postRevoke(payload?.url, payload?.key, state.revokeToken);
  if (!told) return { ok: false, pending: true };

  const { revokeToken, revokeAt, ...rest } = state;
  void revokeToken; void revokeAt;
  writeHqState(rest);
  return { ok: true, pending: false, told: true };
});

async function postRevoke(url, key, token) {
  if (!url || !key || !token) return false;
  try {
    const res = await fetch(`${url}/functions/v1/connect-disconnect`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "apikey": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data?.ok);
  } catch {
    // Offline. The caller keeps the token and tries again later.
    return false;
  }
}

// ---- The shop's own cloud account (sign in or continue locally) ----
//
// Kept in its own state file, deliberately apart from hq.json: this is a
// password session, not a branch credential, and a shop turns it on and off
// independently of both HQ and device-to-device sync.
const ACCOUNT_FILE = () => path.join(app.getPath("userData"), "account.json");

function readAccountState() {
  try {
    return JSON.parse(fs.readFileSync(ACCOUNT_FILE(), "utf-8"));
  } catch {
    return {};
  }
}

function writeAccountState(next) {
  const tmp = ACCOUNT_FILE() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next), "utf-8");
  fs.renameSync(tmp, ACCOUNT_FILE());
}

/** A message a shop owner can actually act on, not a raw Supabase error code. */
function friendlyAccountAuthError(data) {
  const code = data?.error_code || data?.code || "";
  if (code === "user_already_exists" || code === "email_exists") {
    return "An account already exists for that email. Try signing in instead.";
  }
  if (code === "invalid_credentials") {
    return "That email and password don't match.";
  }
  if (code === "weak_password") {
    return "Choose a longer password -- at least 6 characters.";
  }
  return data?.msg || data?.error_description || data?.message ||
    "Couldn't reach TechDesk. Check your details and try again.";
}

async function accountAuthFetch(url, key, authPath, body) {
  let res;
  try {
    res = await fetch(`${url}/auth/v1${authPath}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "offline", message: "Couldn't reach TechDesk. Check your internet and try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error_code || "auth_failed", message: friendlyAccountAuthError(data) };
  return { ok: true, data };
}

ipcMain.handle("techdesk:account-read", () => {
  try {
    const s = readAccountState();
    return {
      ok: true,
      state: {
        signedIn: Boolean(s.accessToken),
        email: s.email || null,
        role: s.role || null,
        workerName: s.workerName || null,
        businessId: s.businessId || null,
        pages: s.pages || null,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("techdesk:account-sign-up", async (event, payload) => {
  const { url, key, email, password } = payload || {};
  const res = await accountAuthFetch(url, key, "/signup", { email, password });
  if (!res.ok) return res;
  if (!res.data.access_token) return { ok: true, needsConfirmation: true };
  writeAccountState({ email, accessToken: res.data.access_token, refreshToken: res.data.refresh_token });
  return { ok: true };
});

ipcMain.handle("techdesk:account-sign-in", async (event, payload) => {
  const { url, key, email, password } = payload || {};
  const res = await accountAuthFetch(url, key, "/token?grant_type=password", { email, password });
  if (!res.ok) return res;
  writeAccountState({ email, accessToken: res.data.access_token, refreshToken: res.data.refresh_token });
  return { ok: true };
});

ipcMain.handle("techdesk:account-sign-out", () => {
  try {
    writeAccountState({});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

async function accountRestFetch(url, key, restPath, { method = "GET", body, headers = {} } = {}) {
  const s = readAccountState();
  if (!s.accessToken) return { ok: false, error: "not_signed_in" };
  let res;
  try {
    res = await fetch(`${url}/rest/v1${restPath}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${s.accessToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: `http_${res.status}`, message: data?.message };
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: true, data };
}

// Sends this shop's changes up to its own cloud account. The token stays in
// this process, exactly like hq-sync -- it never has to reach the renderer,
// because the renderer only ever needed to know what to send.
ipcMain.handle("techdesk:account-push", async (event, payload) => {
  const { url, key, rows } = payload || {};
  // Reuses HQ's install id rather than minting a second one for the same
  // physical device -- one machine, one id, whichever cloud feature is
  // asking about it.
  const hqState = readHqState();
  // Best-effort: a shop's data still needs to go up even if this particular
  // device never manages to register itself in the devices list.
  await accountRestFetch(url, key, "/account_devices?on_conflict=account_id,install_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [{ install_id: hqState.installId || null, last_seen_at: new Date().toISOString() }],
  });

  // account_id defaults to auth.uid() in Postgres -- right for the owner,
  // wrong for a worker's device, whose own uid is its own hidden identity,
  // not the business it joined. See accountLocal.js's push() for the same
  // reasoning; kept here too because the desktop's rows never pass through
  // that file at all.
  const { businessId } = readAccountState();
  const stamped = businessId ? (rows || []).map((r) => ({ account_id: businessId, ...r })) : rows || [];

  return accountRestFetch(url, key, "/account_records?on_conflict=account_id,kind,record_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: stamped,
  });
});

const ACCOUNT_PULL_LIMIT = 400;

ipcMain.handle("techdesk:account-pull", async (event, payload) => {
  const { url, key, sinceCursor } = payload || {};
  const parts = ["order=updated_at.asc", `limit=${ACCOUNT_PULL_LIMIT}`];
  if (sinceCursor) parts.push(`updated_at=gt.${encodeURIComponent(sinceCursor)}`);
  const res = await accountRestFetch(url, key, `/account_records?${parts.join("&")}`);
  if (!res.ok) return res;
  const rows = res.data || [];
  return { ok: true, rows, more: rows.length >= ACCOUNT_PULL_LIMIT };
});

/** A message a shop owner can actually act on, not a raw Edge Function error code. */
function friendlyInviteError(data) {
  const code = data?.error;
  if (code === "not_signed_in") return "Sign in first.";
  if (code === "rate_limited") return data?.message || "Too many attempts. Try again shortly.";
  if (code === "invalid_code") return "That code isn't right, or has expired. Ask for a new one.";
  if (code === "bad_request") return data?.message || "Check what you typed and try again.";
  return data?.message || "Couldn't reach TechDesk. Check your internet and try again.";
}

async function accountFnFetch(url, key, fn, body, { token } = {}) {
  let res;
  try {
    res = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token || key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "Couldn't reach TechDesk. Check your internet and try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return { ok: false, message: friendlyInviteError(data) };
  return data;
}

// Owner only: issues the code a worker's device redeems below, for exactly
// the pages the admin picked for this worker in the renderer.
ipcMain.handle("techdesk:account-invite-start", async (event, payload) => {
  const { url, key, pages } = payload || {};
  const s = readAccountState();
  if (!s.accessToken) return { ok: false, message: "Sign in first." };
  if (!Array.isArray(pages) || !pages.length) {
    return { ok: false, message: "Pick at least one page for this worker." };
  }
  return accountFnFetch(url, key, "account-invite-start", { pages }, { token: s.accessToken });
});

// A worker's device, joining with the shop's email, that code, and their own
// name -- never the shop's password. Stores its own resulting session here,
// same file as the owner's, since only one can be signed in on one machine.
ipcMain.handle("techdesk:account-invite-redeem", async (event, payload) => {
  const { url, key, email, code, name } = payload || {};
  const trimmed = (email || "").trim();
  const trimmedName = (name || "").trim();
  if (!trimmed) return { ok: false, message: "Enter the shop's email." };
  if (!trimmedName) return { ok: false, message: "Enter your name." };

  const res = await accountFnFetch(url, key, "account-invite-redeem", { email: trimmed, code, name: trimmedName });
  if (!res.ok) return res;

  writeAccountState({
    email: null,
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    role: "worker",
    workerName: res.workerName,
    businessId: res.businessId,
    pages: res.pages,
  });
  return { ok: true, workerName: res.workerName };
});

// ---- Automatic local backups ----
// Renderer calls this roughly once a day; we keep the most recent 14 files.
ipcMain.handle("techdesk:save-backup", (event, jsonString) => {
  try {
    const dir = path.join(app.getPath("userData"), "backups");
    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 10);
    const filePath = path.join(dir, `techdesk-backup-${stamp}.json`);
    fs.writeFileSync(filePath, jsonString, "utf-8");

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("techdesk-backup-") && f.endsWith(".json"))
      .sort();
    const excess = files.length - 14;
    if (excess > 0) {
      files.slice(0, excess).forEach((f) => fs.unlinkSync(path.join(dir, f)));
    }

    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
