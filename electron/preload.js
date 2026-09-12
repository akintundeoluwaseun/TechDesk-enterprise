const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techdesk", {
  quit: () => ipcRenderer.send("techdesk:quit"),
  saveBackup: (jsonString) => ipcRenderer.invoke("techdesk:save-backup", jsonString),
  findOtherEditions: () => ipcRenderer.invoke("techdesk:find-other-editions"),
  readEditionBackup: (filePath) => ipcRenderer.invoke("techdesk:read-edition-backup", filePath),
  getNetworkInfo: () => ipcRenderer.invoke("techdesk:network-info"),
  syncActivity: (activities) => ipcRenderer.send("techdesk:sync-activity", activities),
  showNetworkQr: (url) => ipcRenderer.invoke("techdesk:show-network-qr", url),
  syncEmailSettings: (settings) => ipcRenderer.send("techdesk:sync-email-settings", settings),
  sendTestEmail: (payload) => ipcRenderer.invoke("techdesk:send-email", payload),
});
