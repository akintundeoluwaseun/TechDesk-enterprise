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

  // HQ connection. The device token is written and read in the main process
  // only -- hqRead deliberately reports whether a token exists, not what it is.
  hqInstallId: () => ipcRenderer.invoke("techdesk:hq-install-id"),
  hqRead: () => ipcRenderer.invoke("techdesk:hq-read"),
  hqSave: (payload) => ipcRenderer.invoke("techdesk:hq-save", payload),
  hqDisconnect: (payload) => ipcRenderer.invoke("techdesk:hq-disconnect", payload),
  hqFlushRevoke: (payload) => ipcRenderer.invoke("techdesk:hq-flush-revoke", payload),
  // One channel for every sync call. The main process decides which function
  // names are allowed and adds the token; this end only carries the request.
  syncCall: (payload) => ipcRenderer.invoke("techdesk:sync-call", payload),
  hqSync: (payload) => ipcRenderer.invoke("techdesk:hq-sync", payload),
  getNetworkInfo: () => ipcRenderer.invoke("techdesk:network-info"),
  syncActivity: (activities) => ipcRenderer.send("techdesk:sync-activity", activities),
  showNetworkQr: (url) => ipcRenderer.invoke("techdesk:show-network-qr", url),

  // The shop's own cloud account. Same rule as HQ: the password and the
  // session token are written and read in the main process only -- accountRead
  // deliberately reports whether a session exists, not what it is.
  accountRead: () => ipcRenderer.invoke("techdesk:account-read"),
  accountSignUp: (payload) => ipcRenderer.invoke("techdesk:account-sign-up", payload),
  accountSignIn: (payload) => ipcRenderer.invoke("techdesk:account-sign-in", payload),
  accountSignOut: () => ipcRenderer.invoke("techdesk:account-sign-out"),
  accountPush: (payload) => ipcRenderer.invoke("techdesk:account-push", payload),
  accountPull: (payload) => ipcRenderer.invoke("techdesk:account-pull", payload),
  accountInviteStart: (payload) => ipcRenderer.invoke("techdesk:account-invite-start", payload),
  accountInviteRedeem: (payload) => ipcRenderer.invoke("techdesk:account-invite-redeem", payload),
  accountWorkersList: (payload) => ipcRenderer.invoke("techdesk:account-workers-list", payload),
  accountWorkersRevoke: (payload) => ipcRenderer.invoke("techdesk:account-workers-revoke", payload),
});
