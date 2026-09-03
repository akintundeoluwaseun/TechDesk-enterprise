const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techdesk", {
  quit: () => ipcRenderer.send("techdesk:quit"),
  saveBackup: (jsonString) => ipcRenderer.invoke("techdesk:save-backup", jsonString),
});
