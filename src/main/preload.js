const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  // Data
  getData:       ()       => ipcRenderer.invoke('get-data'),
  saveData:      (data)   => ipcRenderer.invoke('save-data', data),
  exportData:    ()       => ipcRenderer.invoke('export-data'),
  importData:    ()       => ipcRenderer.invoke('import-data'),
  getAppInfo:    ()       => ipcRenderer.invoke('get-app-info'),
  getErrorMap:   ()       => ipcRenderer.invoke('get-error-map'),
  getRawgKey:    ()       => ipcRenderer.invoke('get-rawg-key'),
  getRawgDiscoveryGames: () => ipcRenderer.invoke('rawg-discovery-games'),
  openExternalUrl: (url)  => ipcRenderer.invoke('open-external-url', url),
  getCommunityNews: (payload) => ipcRenderer.invoke('community-news', payload),
  detectSteamGames: ()    => ipcRenderer.invoke('detect-steam-games'),
  importSteamGames: (payload) => ipcRenderer.invoke('import-steam-games', payload),
  setSortOrder: (orderedIds) => ipcRenderer.invoke('set-sort-order', orderedIds),
  getCleanupStats: ()     => ipcRenderer.invoke('get-cleanup-stats'),
  runCleanup: (payload)   => ipcRenderer.invoke('run-cleanup', payload),

  // Games
  browseGame:    ()       => ipcRenderer.invoke('browse-game'),
  launchGame:    (game)   => ipcRenderer.invoke('launch-game', game),
  getGameIcon:   (path)   => ipcRenderer.invoke('get-game-icon', path),
  toggleFavorite: (id)    => ipcRenderer.invoke('toggle-favorite', id),
  updateGame: (payload)   => ipcRenderer.invoke('update-game', payload),
  pickCoverFile: ()       => ipcRenderer.invoke('pick-cover-file'),
  setCustomCoverFile: (gameId, filePath) => ipcRenderer.invoke('set-custom-cover-file', gameId, filePath),
  setCustomCoverUrl: (gameId, url) => ipcRenderer.invoke('set-custom-cover-url', gameId, url),
  resetCustomCover: (gameId) => ipcRenderer.invoke('reset-custom-cover', gameId),

  // Settings
  toggleAlwaysOnTop: (v) => ipcRenderer.invoke('toggle-always-on-top', v),
  toggleAutoStart:   (v) => ipcRenderer.invoke('toggle-auto-start', v),

  // Window
  hideWindow:  () => ipcRenderer.send('window-hide'),
  closeWindow: () => ipcRenderer.send('window-close'),
});

contextBridge.exposeInMainWorld('api', api);
