const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Data
  getData:       ()       => ipcRenderer.invoke('get-data'),
  saveData:      (data)   => ipcRenderer.invoke('save-data', data),

  // Games
  browseGame:    ()       => ipcRenderer.invoke('browse-game'),
  launchGame:    (path)   => ipcRenderer.invoke('launch-game', path),
  getGameIcon:   (path)   => ipcRenderer.invoke('get-game-icon', path),

  // Settings
  toggleAlwaysOnTop: (v) => ipcRenderer.invoke('toggle-always-on-top', v),
  toggleAutoStart:   (v) => ipcRenderer.invoke('toggle-auto-start', v),

  // Window
  hideWindow:  () => ipcRenderer.send('window-hide'),
  closeWindow: () => ipcRenderer.send('window-close'),
});