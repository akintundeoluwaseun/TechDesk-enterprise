const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techdesk", {
  quit: () => ipcRenderer.send("techdesk:quit"),
  saveBackup: (jsonString) => ipcRenderer.invoke("techdesk:save-backup", jsonString),
  getNetworkInfo: () => ipcRenderer.invoke("techdesk:network-info"),
  syncActivity: (activities) => ipcRenderer.send("techdesk:sync-activity", activities),
  showNetworkQr: (url) => ipcRenderer.invoke("techdesk:show-network-qr", url),
  syncEmailSettings: (settings) => ipcRenderer.send("techdesk:sync-email-settings", settings),
  sendTestEmail: (payload) => ipcRenderer.invoke("techdesk:send-email", payload),
});
