const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;

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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
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

