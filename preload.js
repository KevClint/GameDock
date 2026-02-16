const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  // Data
  getData:       ()       => ipcRenderer.invoke('get-data'),
  saveData:      (data)   => ipcRenderer.invoke('save-data', data),
  exportData:    ()       => ipcRenderer.invoke('export-data'),
  importData:    ()       => ipcRenderer.invoke('import-data'),
  getAppInfo:    ()       => ipcRenderer.invoke('get-app-info'),
  getRawgKey:    ()       => ipcRenderer.invoke('get-rawg-key'),
  getRawgDiscoveryGames: () => ipcRenderer.invoke('rawg-discovery-games'),
  getCommunityNews: ()    => ipcRenderer.invoke('community-news'),
  detectSteamGames: ()    => ipcRenderer.invoke('detect-steam-games'),

  // Games
  browseGame:    ()       => ipcRenderer.invoke('browse-game'),
  launchGame:    (game)   => ipcRenderer.invoke('launch-game', game),
  getGameIcon:   (path)   => ipcRenderer.invoke('get-game-icon', path),
  toggleFavorite: (id)    => ipcRenderer.invoke('toggle-favorite', id),

  // Settings
  toggleAlwaysOnTop: (v) => ipcRenderer.invoke('toggle-always-on-top', v),
  toggleAutoStart:   (v) => ipcRenderer.invoke('toggle-auto-start', v),

  // Window
  hideWindow:  () => ipcRenderer.send('window-hide'),
  closeWindow: () => ipcRenderer.send('window-close'),
});

contextBridge.exposeInMainWorld('api', api);
