const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");

const isDev = !app.isPackaged;
app.disableHardwareAcceleration();
let activitySnapshot = [];
let networkServer;
const notificationQueueFile = () => path.join(app.getPath("userData"), "notification-queue.json");
function readNotificationQueue() { try { return JSON.parse(fs.readFileSync(notificationQueueFile(), "utf8")); } catch { return []; } }
function writeNotificationQueue(items) { fs.mkdirSync(path.dirname(notificationQueueFile()), { recursive: true }); fs.writeFileSync(notificationQueueFile(), JSON.stringify(items.slice(-100), null, 2)); }
async function sendNotification(payload, { enqueueOnFailure = true } = {}) {
  const s = payload?.settings || {};
  if (!s.smtpUser || !s.smtpAppPassword || !s.notificationEmail) return { ok: false, skipped: true };
  try {
    const transporter = nodemailer.createTransport({ host: s.smtpHost || "smtp.gmail.com", port: Number(s.smtpPort || 465), secure: Number(s.smtpPort || 465) === 465, auth: { user: s.smtpUser, pass: s.smtpAppPassword } });
    await transporter.sendMail({ from: s.smtpUser, to: s.notificationEmail, subject: `TechDesk Solo: ${payload.activity?.type || "Activity"}`, text: `${payload.activity?.message || "New activity"}\n\n${new Date(payload.activity?.createdAt || Date.now()).toLocaleString()}` });
    return { ok: true };
  } catch (error) {
    if (enqueueOnFailure) { const queue = readNotificationQueue(); queue.push(payload); writeNotificationQueue(queue); }
    return { ok: false, queued: enqueueOnFailure, error: String(error) };
  }
}
async function flushNotificationQueue() {
  const pending = readNotificationQueue();
  if (!pending.length) return;
  const remaining = [];
  for (const item of pending) {
    const result = await sendNotification(item, { enqueueOnFailure: false });
    if (!result.ok && !result.skipped) remaining.push(item);
  }
  writeNotificationQueue(remaining);
}
function getLanIp() { const interfaces = os.networkInterfaces(); for (const values of Object.values(interfaces)) for (const item of values || []) if (item.family === "IPv4" && !item.internal) return item.address; return "127.0.0.1"; }
function startActivityServer() { const ip = getLanIp(); networkServer = http.createServer((req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Content-Type", "text/html; charset=utf-8"); if (req.url === "/activity.json") { res.end(JSON.stringify(activitySnapshot)); return; } res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>TechDesk Solo Activity</title><style>body{font:16px system-ui;padding:24px;background:#f8f7f2;color:#171717}h1{margin-top:0}.item{padding:14px;border-bottom:1px solid #ddd;background:#fff}.muted{color:#777;font-size:13px}</style><h1>TechDesk Solo Activity Log</h1><div id="log">Loading…</div><script>fetch('/activity.json').then(r=>r.json()).then(items=>{document.querySelector('#log').innerHTML=items.map(x=>'<div class="item"><b>'+((x.type||'Activity').replace(/[<>]/g,''))+'</b><div>'+((x.message||'').replace(/[<>]/g,''))+'</div><div class="muted">'+new Date(x.createdAt).toLocaleString()+'</div></div>').join('')||'<p>No activity yet.</p>'})</script>`); }).listen(47821, "0.0.0.0"); return `http://${ip}:47821`; }

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 560,
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
  flushNotificationQueue();
  setInterval(flushNotificationQueue, 60_000);
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

ipcMain.handle("techdesk:network-info", () => { const ip = getLanIp(); return { ip, url: `http://${ip}:47821` }; });
ipcMain.on("techdesk:sync-activity", (event, activities) => { activitySnapshot = Array.isArray(activities) ? activities.slice(0, 200) : []; });
ipcMain.handle("techdesk:notify-activity", (_event, payload) => sendNotification(payload));
ipcMain.handle("techdesk:show-network-qr", async (event, url) => {
  const target = url || "Network address unavailable";
  const qr = await QRCode.toDataURL(target, { margin: 2, width: 320 });
  const qrWindow = new BrowserWindow({ width: 460, height: 560, parent: BrowserWindow.fromWebContents(event.sender), modal: true, autoHideMenuBar: true, resizable: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const safeTarget = target.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  await qrWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta name="viewport" content="width=device-width"><title>TechDesk Solo QR</title><style>body{font:16px system-ui;text-align:center;padding:28px;background:#f8f7f2;color:#171717}img{width:320px;height:320px;background:#fff;padding:12px;border-radius:16px}code{display:block;word-break:break-all;margin-top:18px;font-size:13px}</style><h2>Connect to TechDesk Solo</h2><p>Scan on the same Wi‑Fi network to view the read-only activity log.</p><img src="${qr}" alt="Connection QR code"><code>${safeTarget}</code>`)}`);
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

