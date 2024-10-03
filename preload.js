// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.sendSync('get-config'),
  updateConfig: (newConfig) => ipcRenderer.sendSync('update-config', newConfig),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, status) => callback(event, status)),
  onNewSpot: (callback) => ipcRenderer.on('new-spot', (event, spot) => callback(event, spot)),
  // Add other APIs as needed
});
