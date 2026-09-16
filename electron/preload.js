const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techdesk", {
  quit: () => ipcRenderer.send("techdesk:quit"),
  saveBackup: (jsonString) => ipcRenderer.invoke("techdesk:save-backup", jsonString),
  findOtherEditions: () => ipcRenderer.invoke("techdesk:find-other-editions"),
  readEditionBackup: (filePath) => ipcRenderer.invoke("techdesk:read-edition-backup", filePath),
  readTrial: () => ipcRenderer.invoke("techdesk:read-trial"),
  writeTrial: (state) => ipcRenderer.invoke("techdesk:write-trial", state),
  readLicense: () => ipcRenderer.invoke("techdesk:read-license"),
  writeLicense: (state) => ipcRenderer.invoke("techdesk:write-license", state),
  getNetworkInfo: () => ipcRenderer.invoke("techdesk:network-info"),
  syncActivity: (activities) => ipcRenderer.send("techdesk:sync-activity", activities),
  showNetworkQr: (url) => ipcRenderer.invoke("techdesk:show-network-qr", url),
});
