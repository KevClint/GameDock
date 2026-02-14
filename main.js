const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const store = require('./store');
const { createTray } = require('./tray');

// ── Performance tweaks ──
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');

// ── Single instance ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow;
let appData = store.load();

function getWindowPosition() {
  const { screen } = require('electron');
  const display    = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const winWidth  = 280;
  const winHeight = Math.min(600, height - 80);
  const x = width  - winWidth  - 8;
  const y = height - winHeight - 8;
  return { x, y, winWidth, winHeight };
}

function createWindow() {
  const { x, y, winWidth, winHeight } = getWindowPosition();

  mainWindow = new BrowserWindow({
    width:  winWidth,
    height: winHeight,
    x, y,
    frame:       false,
    resizable:   false,
    alwaysOnTop: false,
    skipTaskbar: false,
    transparent: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload:              path.join(__dirname, 'preload.js'),
      contextIsolation:     true,
      nodeIntegration:      false,
      sandbox:              true,
      webSecurity:          true,
      backgroundThrottling: false,
      spellcheck:           false,
      enableWebSQL:         false,
    }
  });

  mainWindow.loadFile('renderer/index.html');

  // ── Snap back to right side after drag ──
  mainWindow.on('moved', () => {
    const { x: snapX, y: snapY } = getWindowPosition();
    const { screen } = require('electron');
    const { width }  = screen.getPrimaryDisplay().workAreaSize;
    const [curX]     = mainWindow.getPosition();
    if (curX < width - 300) {
      mainWindow.setPosition(snapX, snapY, true);
    }
  });

  // ── Hide to tray on close ──
  mainWindow.on('close', (e) => {
    if (!global.forceQuit && appData.settings?.minimizeToTray !== false) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  createTray(mainWindow);
}

app.whenReady().then(() => {
  if (appData.settings?.autoStart) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

// ─────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────

ipcMain.handle('get-data', () => appData);

ipcMain.handle('save-data', (_, data) => {
  appData = data;
  return store.save(data);
});

ipcMain.handle('browse-game', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Game Executable',
    filters: [{ name: 'Executable', extensions: ['exe'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('launch-game', async (_, gamePath) => {
  if (!fs.existsSync(gamePath)) {
    return { success: false, error: 'Game file not found. Check the path.' };
  }
  try {
    const err = await shell.openPath(gamePath);
    if (err && err.length > 0) {
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Fixed icon extraction ──
ipcMain.handle('get-game-icon', async (_, gamePath) => {
  try {
    if (!gamePath || !fs.existsSync(gamePath)) return null;
    const icon = await app.getFileIcon(gamePath, { size: 'large' });
    if (!icon || icon.isEmpty()) return null;
    const dataUrl = icon.toDataURL();
    // Validate it's a real image
    if (!dataUrl || dataUrl === 'data:image/png;base64,') return null;
    return dataUrl;
  } catch (e) {
    console.error('Icon extraction failed:', e.message);
    return null;
  }
});

ipcMain.on('window-hide',  () => mainWindow.hide());
ipcMain.on('window-close', () => { global.forceQuit = true; mainWindow.close(); });

ipcMain.handle('toggle-always-on-top', (_, val) => {
  mainWindow.setAlwaysOnTop(val);
  return val;
});

ipcMain.handle('toggle-auto-start', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath });
  return enable;
});