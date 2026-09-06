const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const isDev = !app.isPackaged;
app.disableHardwareAcceleration();

let activitySnapshot = [];
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

// Small read-only HTTP server so another device on the same Wi-Fi can view
// recent activity — nothing here accepts writes.
function startActivityServer() {
  const ip = getLanIp();
  networkServer = http
    .createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url === "/activity.json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(activitySnapshot));
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>TechDesk Enterprise Activity</title><style>body{font:16px system-ui;padding:20px;background:#f8f7f2;color:#171717}h1{margin:0 0 16px;font-size:1.25rem}.item{padding:14px;border-bottom:1px solid #ddd;background:#fff}.item b{text-transform:capitalize}.muted{color:#777;font-size:13px}</style><h1>TechDesk Enterprise Activity Log</h1><div id="log">Loading…</div><script>fetch('/activity.json').then(r=>r.json()).then(items=>{document.querySelector('#log').innerHTML=items.map(x=>'<div class="item"><b>'+((x.type||'Activity').replace(/[<>]/g,''))+'</b><div>'+((x.message||'').replace(/[<>]/g,''))+'</div><div class="muted">'+new Date(x.createdAt).toLocaleString()+'</div></div>').join('')||'<p>No activity yet.</p>'})</script>`
      );
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

ipcMain.on("techdesk:sync-activity", (event, activities) => {
  activitySnapshot = Array.isArray(activities) ? activities.slice(0, 200) : [];
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
  const safeTarget = target.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  await qrWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><meta name="viewport" content="width=device-width"><title>TechDesk Enterprise QR</title><style>body{font:16px system-ui;text-align:center;padding:28px;background:#f8f7f2;color:#171717}img{width:320px;height:320px;background:#fff;padding:12px;border-radius:16px}code{display:block;word-break:break-all;margin-top:18px;font-size:13px}</style><h2>Connect to TechDesk Enterprise</h2><p>Scan on the same Wi‑Fi network to view the read-only activity log.</p><img src="${qr}" alt="Connection QR code"><code>${safeTarget}</code>`
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
