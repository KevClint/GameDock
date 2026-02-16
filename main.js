const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const store = require('./store');
const { createTray } = require('./tray');
const {
  sanitizeData,
  sanitizeGame,
  normalizePath,
  isValidExecutablePath,
  splitLaunchArgs,
} = require('./data-schema');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow;
let appData = sanitizeData(store.load());
const runningSessions = new Map();

function getWindowPosition() {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const winWidth = Math.min(1080, Math.max(860, width - 40));
  const winHeight = Math.min(760, Math.max(640, height - 40));
  const x = width - winWidth - 8;
  const y = height - winHeight - 8;
  return { x, y, winWidth, winHeight };
}

function saveAppData() {
  const safe = sanitizeData(appData);
  appData = safe;
  store.save(safe);
  return safe;
}

function resolveGameById(id) {
  const gameId = Number(id);
  if (!Number.isFinite(gameId)) return null;
  return appData.games.find((game) => game.id === gameId) || null;
}

function isAllowedLaunchTarget(game) {
  if (!game) return false;
  const gamePath = normalizePath(game.path);
  return isValidExecutablePath(gamePath, { allowNetworkPaths: false }) && fs.existsSync(gamePath);
}

function applyLaunchStats(game, startedAt) {
  const idx = appData.games.findIndex((g) => g.id === game.id);
  if (idx === -1) return;
  appData.games[idx].lastPlayed = startedAt;
  appData.games[idx].launchCount = (appData.games[idx].launchCount || 0) + 1;
  saveAppData();
}

function applyPlaytimeOnExit(gameId, startedAt) {
  const idx = appData.games.findIndex((g) => g.id === gameId);
  if (idx === -1) return;
  const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60000);
  if (elapsedMinutes > 0) {
    appData.games[idx].playtimeMinutes = (appData.games[idx].playtimeMinutes || 0) + elapsedMinutes;
    saveAppData();
  }
}

function launchGameInternal(game) {
  if (!isAllowedLaunchTarget(game)) {
    return { success: false, error: 'Blocked launch: invalid or missing executable path.' };
  }

  const executablePath = normalizePath(game.path);
  const launchArgs = splitLaunchArgs(game.launchArgs);
  const defaultCwd = path.dirname(executablePath);
  const requestedCwd = normalizePath(game.workingDir || '');
  const cwd = requestedCwd && path.isAbsolute(requestedCwd) && fs.existsSync(requestedCwd)
    ? requestedCwd
    : defaultCwd;

  if (requestedCwd && !fs.existsSync(cwd)) {
    return { success: false, error: 'Working directory does not exist.' };
  }

  try {
    const child = spawn(executablePath, launchArgs, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    const startedAt = Date.now();
    runningSessions.set(game.id, { pid: child.pid, startedAt });
    applyLaunchStats(game, startedAt);

    child.on('exit', () => {
      const session = runningSessions.get(game.id);
      if (!session) return;
      runningSessions.delete(game.id);
      applyPlaytimeOnExit(game.id, session.startedAt);
    });

    child.unref();
    return { success: true, pid: child.pid };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function launchGameById(id) {
  const game = resolveGameById(id);
  if (!game) return { success: false, error: 'Game not found.' };
  return launchGameInternal(game);
}

function createWindow() {
  const { x, y, winWidth, winHeight } = getWindowPosition();

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 860,
    minHeight: 640,
    x,
    y,
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    transparent: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.on('moved', () => {
    const { x: snapX, y: snapY } = getWindowPosition();
    const { screen } = require('electron');
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    const [curX] = mainWindow.getPosition();
    if (curX < width - 300) {
      mainWindow.setPosition(snapX, snapY, true);
    }
  });

  mainWindow.on('close', (e) => {
    if (!global.forceQuit) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  createTray(
    mainWindow,
    () => appData,
    (id) => launchGameById(id),
  );
}

function detectSteamRootPaths() {
  const roots = [
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Steam') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Steam') : '',
  ].filter(Boolean);
  return roots.filter((p) => fs.existsSync(p));
}

function parseSteamLibraryFolders(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const paths = [];
    const regex = /"path"\s+"([^"]+)"/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      paths.push(match[1].replace(/\\\\/g, '\\'));
    }
    return paths;
  } catch {
    return [];
  }
}

function parseManifestValue(content, key) {
  const re = new RegExp(`"${key}"\\s+"([^"]+)"`);
  const match = content.match(re);
  return match ? match[1] : '';
}

function findLikelyExecutable(gameDir) {
  if (!fs.existsSync(gameDir)) return '';
  const direct = fs.readdirSync(gameDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name))
    .map((entry) => path.join(gameDir, entry.name))
    .filter((exePath) => !/unins|crash|setup|launcherinstaller/i.test(exePath));
  if (direct.length > 0) return direct[0];

  const dirs = fs.readdirSync(gameDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .slice(0, 10);
  for (const dir of dirs) {
    const nestedPath = path.join(gameDir, dir.name);
    const nestedExe = fs.readdirSync(nestedPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name))
      .map((entry) => path.join(nestedPath, entry.name))
      .filter((exePath) => !/unins|crash|setup|launcherinstaller/i.test(exePath));
    if (nestedExe.length > 0) return nestedExe[0];
  }

  return '';
}

function detectSteamGames() {
  const found = [];
  const seenPaths = new Set(appData.games.map((g) => normalizePath(g.path).toLowerCase()));
  const roots = detectSteamRootPaths();

  for (const root of roots) {
    const libraryFile = path.join(root, 'steamapps', 'libraryfolders.vdf');
    const libraries = new Set([root, ...parseSteamLibraryFolders(libraryFile)]);

    for (const libRoot of libraries) {
      const steamApps = path.join(libRoot, 'steamapps');
      if (!fs.existsSync(steamApps)) continue;
      const manifests = fs.readdirSync(steamApps)
        .filter((name) => /^appmanifest_\d+\.acf$/i.test(name));

      for (const manifestFile of manifests) {
        const manifestPath = path.join(steamApps, manifestFile);
        let content = '';
        try {
          content = fs.readFileSync(manifestPath, 'utf8');
        } catch {
          continue;
        }

        const name = parseManifestValue(content, 'name');
        const installDir = parseManifestValue(content, 'installdir');
        if (!name || !installDir) continue;

        const gameDir = path.join(steamApps, 'common', installDir);
        const exePath = findLikelyExecutable(gameDir);
        if (!exePath) continue;

        const normalized = normalizePath(exePath).toLowerCase();
        if (seenPaths.has(normalized)) continue;
        seenPaths.add(normalized);
        found.push({
          id: Date.now() + found.length,
          name,
          path: exePath,
          category: 'Other',
          icon: null,
          addedAt: Date.now(),
          lastPlayed: null,
          playtimeMinutes: 0,
          launchCount: 0,
          favorite: false,
          pinOrder: 0,
          launchArgs: '',
          workingDir: path.dirname(exePath),
        });
      }
    }
  }

  return found;
}

function readRawgApiKey() {
  if (process.env.RAWG_API_KEY) {
    return String(process.env.RAWG_API_KEY).trim();
  }

  try {
    const envPath = path.join(app.getAppPath(), '.env');
    if (!fs.existsSync(envPath)) return '';
    const envRaw = fs.readFileSync(envPath, 'utf8');
    const match = envRaw.match(/^\s*RAWG_API_KEY\s*=\s*(.+)\s*$/m);
    if (!match) return '';
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
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
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('get-data', () => appData);

ipcMain.handle('save-data', (_, data) => {
  if (!data || typeof data !== 'object') return false;
  appData = sanitizeData(data);
  return store.save(appData);
});

ipcMain.handle('export-data', async () => {
  const target = await dialog.showSaveDialog(mainWindow, {
    title: 'Export GameDock Backup',
    defaultPath: `gamedock-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (target.canceled || !target.filePath) return { success: false, canceled: true };
  try {
    fs.writeFileSync(target.filePath, JSON.stringify(sanitizeData(appData), null, 2), 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('import-data', async () => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Import GameDock Backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || !picked.filePaths[0]) return { success: false, canceled: true };
  try {
    const raw = fs.readFileSync(picked.filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    appData = sanitizeData(parsed);
    store.save(appData);
    return { success: true, data: appData };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
}));

ipcMain.handle('get-rawg-key', () => readRawgApiKey());

ipcMain.handle('rawg-discovery-games', async () => {
  const apiKey = readRawgApiKey();
  if (!apiKey) {
    return { success: false, error: 'Missing RAWG_API_KEY in .env' };
  }

  const currentYear = new Date().getFullYear();
  const trendingParams = new URLSearchParams({
    key: apiKey,
    page_size: '10',
    dates: `${currentYear}-01-01,${currentYear}-12-31`,
    ordering: '-added',
  });
  const indieParams = new URLSearchParams({
    key: apiKey,
    page_size: '5',
    genres: 'indie',
    ordering: '-metacritic',
    metacritic: '70,100',
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const [trendingRes, indieRes] = await Promise.all([
      fetch(`https://api.rawg.io/api/games?${trendingParams.toString()}`, { signal: controller.signal }),
      fetch(`https://api.rawg.io/api/games?${indieParams.toString()}`, { signal: controller.signal }),
    ]);
    clearTimeout(timeoutId);

    if (!trendingRes.ok || !indieRes.ok) {
      const trendErr = await trendingRes.text().catch(() => '');
      const indieErr = await indieRes.text().catch(() => '');
      return {
        success: false,
        error: `RAWG request failed (${trendingRes.status}/${indieRes.status}) ${trendErr || indieErr}`.trim(),
      };
    }

    const [trendingJson, indieJson] = await Promise.all([
      trendingRes.json(),
      indieRes.json(),
    ]);

    return {
      success: true,
      data: {
        trending: trendingJson?.results || [],
        indie: indieJson?.results || [],
      },
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { success: false, error: 'RAWG request timed out after 12s' };
    }
    return { success: false, error: err?.message || 'Network request failed' };
  }
});

ipcMain.handle('browse-game', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Game Executable',
    filters: [{ name: 'Executable', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('detect-steam-games', async () => {
  try {
    return { success: true, games: detectSteamGames() };
  } catch (e) {
    return { success: false, error: e.message, games: [] };
  }
});

ipcMain.handle('launch-game', async (_, launchRequest) => {
  if (!launchRequest || typeof launchRequest !== 'object') {
    return { success: false, error: 'Invalid launch request.' };
  }

  const game = sanitizeGame(launchRequest);
  const storedGame = resolveGameById(game.id);
  if (!storedGame) return { success: false, error: 'Game not found in library.' };

  const requestedPath = normalizePath(game.path).toLowerCase();
  const storedPath = normalizePath(storedGame.path).toLowerCase();
  if (requestedPath !== storedPath) {
    return { success: false, error: 'Blocked launch: path mismatch.' };
  }

  return launchGameInternal(storedGame);
});

ipcMain.handle('toggle-favorite', (_, id) => {
  const game = resolveGameById(id);
  if (!game) return { success: false, error: 'Game not found.' };
  game.favorite = !game.favorite;
  if (game.favorite) {
    const maxPin = appData.games.reduce((max, g) => Math.max(max, g.pinOrder || 0), 0);
    game.pinOrder = maxPin + 1;
  } else {
    game.pinOrder = 0;
  }
  saveAppData();
  return { success: true, favorite: game.favorite };
});

ipcMain.handle('get-game-icon', async (_, gamePath) => {
  try {
    if (typeof gamePath !== 'string') return null;
    const safePath = normalizePath(gamePath);
    if (!isValidExecutablePath(safePath, { allowNetworkPaths: false })) return null;
    if (!fs.existsSync(safePath)) return null;
    const icon = await app.getFileIcon(safePath, { size: 'large' });
    if (!icon || icon.isEmpty()) return null;
    const dataUrl = icon.toDataURL();
    if (!dataUrl || dataUrl === 'data:image/png;base64,') return null;
    return dataUrl;
  } catch (e) {
    console.error('Icon extraction failed:', e.message);
    return null;
  }
});

ipcMain.on('window-hide', () => mainWindow.hide());
ipcMain.on('window-close', () => {
  mainWindow.hide();
});

ipcMain.handle('toggle-always-on-top', (_, val) => {
  mainWindow.setAlwaysOnTop(Boolean(val));
  appData.settings.alwaysOnTop = Boolean(val);
  saveAppData();
  return Boolean(val);
});

ipcMain.handle('toggle-auto-start', (_, enable) => {
  const flag = Boolean(enable);
  app.setLoginItemSettings({ openAtLogin: flag, path: process.execPath });
  appData.settings.autoStart = flag;
  saveAppData();
  return flag;
});
