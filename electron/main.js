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
let statsSnapshot = { activeRepairs: 0, salesToday: 0, customersCount: 0 };
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
// (shop name, activity, low stock, stats) is fetched from /activity.json and
// rendered client-side, so this string never needs to change per-request.
const ACTIVITY_PAGE_HTML = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TechDesk Activity</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f5f7;color:#111827}
.wrap{max-width:480px;margin:0 auto;padding:16px 14px 32px}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}
h1{margin:0;font-size:1.15rem;font-weight:700;line-height:1.25}
.sub{font-size:.8rem;color:#6b7280;margin-top:2px}
.status{font-size:.72rem;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}
.status.online{background:#d1fae5;color:#059669}
.status.offline{background:#fee2e2;color:#dc2626}
.stats{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px;-webkit-overflow-scrolling:touch}
.stat{flex:0 0 auto;min-width:76px;background:#fff;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.stat-emoji{font-size:1.1rem}
.stat-value{font-weight:700;font-size:.95rem;margin-top:2px}
.stat-label{font-size:.62rem;color:#6b7280;margin-top:1px;line-height:1.2}
.card{background:#fff;border-radius:16px;padding:12px 14px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.card-title{font-weight:700;font-size:.85rem}
.ls-item{display:flex;justify-content:space-between;font-size:.82rem;padding:6px 0;border-bottom:1px solid #f1f1f1}
.ls-item:last-child{border-bottom:none}
.ls-qty{color:#b45309;font-weight:600}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
#markRead{border:none;background:#eef2ff;color:#4338ca;font-size:.75rem;font-weight:600;padding:6px 12px;border-radius:999px}
.summary{font-size:.78rem;color:#6b7280;margin-bottom:10px}
.item{display:flex;gap:10px;background:#fff;border-radius:16px;padding:12px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.icon{flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.05rem}
.body{flex:1;min-width:0}
.row1{display:flex;align-items:center;gap:6px}
.row1 b{font-size:.85rem}
.dot{width:8px;height:8px;border-radius:50%;background:#2563eb;display:inline-block}
.msg{font-size:.82rem;color:#374151;margin-top:2px}
.actor{font-size:.72rem;color:#6b7280;margin-top:2px}
.time{font-size:.7rem;color:#9ca3af;margin-top:4px}
.empty{color:#9ca3af;font-size:.85rem}
</style>
<div class="wrap">
  <header>
    <div>
      <h1 id="shopName">Loading…</h1>
      <div class="sub">Mobile Notifications</div>
    </div>
    <div id="status" class="status offline">● Offline</div>
  </header>
  <div class="stats" id="stats"></div>
  <div class="card" id="lowStockCard" style="display:none">
    <div class="card-title">📦 Low Stock</div>
    <div id="lowStockList"></div>
  </div>
  <div class="section-head">
    <div class="card-title">🔔 Notifications</div>
    <button id="markRead">Mark all read</button>
  </div>
  <div class="summary" id="summary"></div>
  <div id="feed">Loading…</div>
</div>
<script>
var KEY_LASTREAD = 'techdesk_lan_last_read';
function getLastRead() {
  var v = localStorage.getItem(KEY_LASTREAD);
  return v ? new Date(v) : new Date(0);
}
function setLastRead(d) {
  localStorage.setItem(KEY_LASTREAD, d.toISOString());
}

var ICONS = {
  sale: { emoji: '💰', label: 'Sale', bg: '#d1fae5', fg: '#059669' },
  repair: { emoji: '🔧', label: 'Repair', bg: '#dbeafe', fg: '#2563eb' },
  inventory: { emoji: '📦', label: 'Inventory', bg: '#fef3c7', fg: '#b45309' },
  customer: { emoji: '👤', label: 'Customer', bg: '#ede9fe', fg: '#7c3aed' },
  settings: { emoji: '⚙️', label: 'Settings', bg: '#e2e8f0', fg: '#475569' }
};
var DEFAULT_ICON = { emoji: '🔔', label: 'Activity', bg: '#f3f4f6', fg: '#6b7280' };

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

function render(data) {
  var shopName = (data && data.shopName) || 'TechDesk';
  document.title = shopName + ' Activity';
  document.getElementById('shopName').textContent = shopName;

  var activity = (data && data.activity) || [];
  var lowStock = (data && data.lowStock) || [];
  var stats = (data && data.stats) || {};
  var lastRead = getLastRead();
  var unread = activity.filter(function (a) { return new Date(a.createdAt) > lastRead; }).length;

  var statTiles = [
    { emoji: '🔔', label: 'Notifications', value: String(activity.length) },
    { emoji: '🔧', label: 'Active repairs', value: String(stats.activeRepairs || 0) },
    { emoji: '📦', label: 'Low stock', value: String(lowStock.length) },
    { emoji: '💰', label: 'Recent sales', value: String(stats.salesToday || 0) },
    { emoji: '👤', label: 'Customers', value: String(stats.customersCount || 0) },
    { emoji: '⚙️', label: 'Connection', value: 'Connected' }
  ];
  document.getElementById('stats').innerHTML = statTiles.map(function (s) {
    return '<div class="stat"><div class="stat-emoji">' + s.emoji + '</div><div class="stat-value">' + esc(s.value) + '</div><div class="stat-label">' + esc(s.label) + '</div></div>';
  }).join('');

  var lowStockCard = document.getElementById('lowStockCard');
  if (lowStock.length) {
    lowStockCard.style.display = '';
    document.getElementById('lowStockList').innerHTML = lowStock.slice(0, 20).map(function (p) {
      return '<div class="ls-item"><span>' + esc(p.name || 'Item') + '</span><span class="ls-qty">' + esc(String(p.stock == null ? 0 : p.stock)) + ' left</span></div>';
    }).join('');
  } else {
    lowStockCard.style.display = 'none';
  }

  document.getElementById('summary').textContent = unread + (unread === 1 ? ' new notification' : ' new notifications');

  document.getElementById('feed').innerHTML = activity.length ? activity.map(function (item) {
    var icon = ICONS[item.type] || DEFAULT_ICON;
    var isUnread = new Date(item.createdAt) > lastRead;
    var actor = item.actor ? '<div class="actor">by ' + esc(item.actor) + '</div>' : '';
    return (
      '<div class="item">' +
        '<div class="icon" style="background:' + icon.bg + ';color:' + icon.fg + '">' + icon.emoji + '</div>' +
        '<div class="body">' +
          '<div class="row1"><b>' + esc(icon.label) + '</b>' + (isUnread ? '<span class="dot"></span>' : '') + '</div>' +
          '<div class="msg">' + esc(item.message || '') + '</div>' +
          actor +
          '<div class="time">' + timeAgo(item.createdAt) + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('') : '<p class="empty">No activity yet.</p>';
}

function poll() {
  fetch('/activity.json').then(function (r) {
    if (!r.ok) throw new Error('bad status');
    return r.json();
  }).then(function (data) {
    document.getElementById('status').textContent = '● Connected';
    document.getElementById('status').className = 'status online';
    var snap = JSON.stringify(data);
    if (snap !== lastSnapshot) {
      lastSnapshot = snap;
      render(data);
    }
  }).catch(function () {
    document.getElementById('status').textContent = '● Offline';
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
            stats: statsSnapshot,
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
  const { shopName: name, activity, lowStock, stats } = payload || {};
  activitySnapshot = Array.isArray(activity) ? activity.slice(0, 200) : [];
  lowStockSnapshot = Array.isArray(lowStock) ? lowStock.slice(0, 200) : [];
  shopName = typeof name === "string" && name.trim() ? name : "TechDesk Enterprise";
  statsSnapshot = {
    activeRepairs: Number(stats?.activeRepairs) || 0,
    salesToday: Number(stats?.salesToday) || 0,
    customersCount: Number(stats?.customersCount) || 0,
  };
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
