const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const isDev = !app.isPackaged;
app.disableHardwareAcceleration();

let activitySnapshot = [];
let lowStockSnapshot = [];
let repairsSnapshot = [];
let inventorySnapshot = [];
let shopInfoSnapshot = {};
let shopName = "TechDesk Enterprise";
let networkServer;

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

// Static shell for the read-only mobile activity page. Everything dynamic
// (shop name, activity, low stock) is fetched from /activity.json and
// rendered client-side, so this string never needs to change per-request.
const ACTIVITY_PAGE_HTML = `<!doctype html>
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
    { label: 'Email', value: shopInfo.email },
    { label: 'Website', value: shopInfo.website }
  ].filter(function (r) { return r.value; });
  document.getElementById('shopInfoCard').innerHTML = rows.length ? rows.map(function (r) {
    return '<div class="info-row"><div class="label">' + esc(r.label) + '</div><div>' + esc(r.value) + '</div></div>';
  }).join('') + '<p class="empty" style="padding-top:14px">Read-only view — no changes can be made from this device.</p>' : '<p class="empty">No shop details added yet.</p>';
}

function render(data) {
  var shopName = (data && data.shopName) || 'TechDesk';
  document.title = shopName + ' Activity';
  document.getElementById('shopName').textContent = shopName;
  renderHome(data);
  renderRepairs(data);
  renderInventory(data);
  renderMore(data);
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

function poll() {
  fetch('/activity.json').then(function (r) {
    if (!r.ok) throw new Error('bad status');
    return r.json();
  }).then(function (data) {
    document.getElementById('status').textContent = 'Connected';
    document.getElementById('status').className = 'status online';
    var snap = JSON.stringify(data);
    if (snap !== lastSnapshot) {
      lastSnapshot = snap;
      render(data);
    }
  }).catch(function () {
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
</script>`;

// Small read-only HTTP server so another device on the same Wi-Fi can view
// recent activity — nothing here accepts writes.
function startActivityServer() {
  const ip = getLanIp();
  networkServer = http
    .createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url === "/activity.json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
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
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(ACTIVITY_PAGE_HTML);
    })
    // a stale process still holding the port (e.g. this app already running,
    // or a previous instance that didn't release it in time) must not crash
    // the whole app -- the rest of TechDesk works fine without this feature
    .on("error", (err) => {
      console.error("LAN activity server failed to start:", err.message);
    })
    .listen(47821, "0.0.0.0");
  return `http://${ip}:47821`;
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
  return { ip, url: `http://${ip}:47821` };
});

ipcMain.on("techdesk:sync-activity", (event, payload) => {
  const { shopName: name, activity, lowStock, repairs, inventory, shopInfo } = payload || {};
  activitySnapshot = Array.isArray(activity) ? activity.slice(0, 200) : [];
  lowStockSnapshot = Array.isArray(lowStock) ? lowStock.slice(0, 200) : [];
  repairsSnapshot = Array.isArray(repairs) ? repairs.slice(0, 50) : [];
  inventorySnapshot = Array.isArray(inventory) ? inventory.slice(0, 300) : [];
  shopInfoSnapshot = shopInfo && typeof shopInfo === "object" ? shopInfo : {};
  shopName = typeof name === "string" && name.trim() ? name : "TechDesk Enterprise";
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
      `<!doctype html><meta name="viewport" content="width=device-width"><title>${safeShopName} QR</title><style>body{font:16px system-ui;text-align:center;padding:28px;background:#f8f7f2;color:#171717}img{width:320px;height:320px;background:#fff;padding:12px;border-radius:16px}code{display:block;word-break:break-all;margin-top:18px;font-size:13px}</style><h2>Connect to ${safeShopName}</h2><p>Scan on the same Wi‑Fi network to view the read-only activity log.</p><img src="${qr}" alt="Connection QR code"><code>${safeTarget}</code>`
    )}`
  );
  return { ok: true };
});

ipcMain.on("techdesk:quit", () => {
  app.quit();
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
