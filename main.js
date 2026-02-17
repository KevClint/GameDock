const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const store = require('./store');
const { createTray } = require('./tray');
const { ERROR_MAP, fail, makeError, toMessage } = require('./error-service');
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

const WINDOW_WIDTH = 650;
const WINDOW_HEIGHT = 760;
const SESSION_POLL_INTERVAL_MS = 5000;
const COVER_WIDTH = 600;
const COVER_HEIGHT = 900;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let mainWindow;
let appData = sanitizeData(store.load());
const runningSessions = new Map();
let sessionPollTimer = null;

function getWindowPosition() {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const winWidth = Math.min(WINDOW_WIDTH, width - 16);
  const winHeight = Math.min(WINDOW_HEIGHT, height - 16);
  const x = width - winWidth - 8;
  const y = height - winHeight - 8;
  return { x, y, winWidth, winHeight };
}

function now() {
  return Date.now();
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

function readEnvValue(name) {
  if (process.env[name]) {
    return String(process.env[name]).trim();
  }

  try {
    const envPath = path.join(app.getAppPath(), '.env');
    if (!fs.existsSync(envPath)) return '';
    const envRaw = fs.readFileSync(envPath, 'utf8');
    const match = envRaw.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, 'm'));
    if (!match) return '';
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
}

function readRawgApiKey() {
  return readEnvValue('RAWG_API_KEY');
}

function readNewsApiKey() {
  return readEnvValue('NEWS_API_KEY');
}

function readSteamGridDbApiKey() {
  return readEnvValue('STEAMGRIDDB_API_KEY');
}

function getNextGameId() {
  const maxId = appData.games.reduce((max, game) => Math.max(max, Number(game.id) || 0), 0);
  return maxId + 1;
}

function getNextSortOrder() {
  const maxOrder = appData.games.reduce((max, game) => {
    const order = Number.isFinite(Number(game.sortOrder)) ? Number(game.sortOrder) : -1;
    return Math.max(max, order);
  }, -1);
  return maxOrder + 1;
}

function syncActiveSessionsToSettings() {
  const active = {};
  for (const [gameId, session] of runningSessions.entries()) {
    active[String(gameId)] = {
      pid: session.pid ?? null,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt || session.startedAt,
    };
  }
  appData.settings = appData.settings || {};
  appData.settings.activeSessions = active;
}

function isProcessRunning(pid) {
  const target = Number(pid);
  if (!Number.isFinite(target) || target <= 0) return false;
  try {
    process.kill(target, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function finalizeSession(gameId, session, exitReason = 'normal') {
  runningSessions.delete(gameId);
  const game = resolveGameById(gameId);
  if (!game) {
    syncActiveSessionsToSettings();
    saveAppData();
    return;
  }

  const startedAt = Number(session?.startedAt) || now();
  const endedAt = now();
  const durationMinutes = Math.max(1, Math.ceil((endedAt - startedAt) / 60000));

  game.lastPlayed = endedAt;
  game.totalPlayTime = (game.totalPlayTime || 0) + durationMinutes;
  game.playtimeMinutes = game.totalPlayTime;
  game.sessionHistory = Array.isArray(game.sessionHistory) ? game.sessionHistory : [];
  game.sessionHistory.push({
    startedAt,
    endedAt,
    durationMinutes,
    pid: Number.isFinite(Number(session?.pid)) ? Number(session.pid) : null,
    exitReason,
  });
  if (game.sessionHistory.length > 120) {
    game.sessionHistory = game.sessionHistory.slice(-120);
  }

  syncActiveSessionsToSettings();
  saveAppData();
}

function pollRunningSessions() {
  for (const [gameId, session] of [...runningSessions.entries()]) {
    if (isProcessRunning(session.pid)) {
      session.lastSeenAt = now();
      runningSessions.set(gameId, session);
      continue;
    }
    finalizeSession(gameId, session, 'normal');
  }
}

function startSessionMonitor() {
  if (sessionPollTimer) return;
  sessionPollTimer = setInterval(pollRunningSessions, SESSION_POLL_INTERVAL_MS);
  if (typeof sessionPollTimer.unref === 'function') {
    sessionPollTimer.unref();
  }
}

function stopSessionMonitor() {
  if (!sessionPollTimer) return;
  clearInterval(sessionPollTimer);
  sessionPollTimer = null;
}

function recoverStaleSessions() {
  const stale = appData.settings?.activeSessions || {};
  let changed = false;
  for (const [id, session] of Object.entries(stale)) {
    const game = resolveGameById(Number(id));
    if (!game) continue;
    const startedAt = Number(session?.startedAt) || now();
    const endedAt = now();
    const durationMinutes = Math.max(1, Math.ceil((endedAt - startedAt) / 60000));
    game.lastPlayed = endedAt;
    game.totalPlayTime = (game.totalPlayTime || 0) + durationMinutes;
    game.playtimeMinutes = game.totalPlayTime;
    game.sessionHistory = Array.isArray(game.sessionHistory) ? game.sessionHistory : [];
    game.sessionHistory.push({
      startedAt,
      endedAt,
      durationMinutes,
      pid: Number.isFinite(Number(session?.pid)) ? Number(session.pid) : null,
      exitReason: 'recovered',
    });
    if (game.sessionHistory.length > 120) {
      game.sessionHistory = game.sessionHistory.slice(-120);
    }
    changed = true;
  }

  appData.settings = appData.settings || {};
  appData.settings.activeSessions = {};
  if (changed) saveAppData();
}

function applyLaunchStats(game, startedAt) {
  const idx = appData.games.findIndex((g) => g.id === game.id);
  if (idx === -1) return;
  appData.games[idx].launchCount = (appData.games[idx].launchCount || 0) + 1;
  appData.games[idx].lastPlayed = startedAt;
  syncActiveSessionsToSettings();
  saveAppData();
}

function mapLaunchErrorToCode(err) {
  const code = String(err?.code || '').toUpperCase();
  if (code === 'ENOENT') return 'ERR_EXE_NOT_FOUND';
  if (code === 'EACCES' || code === 'EPERM') return 'ERR_PERMISSION_DENIED';
  return 'ERR_UNKNOWN';
}

function isAllowedLaunchTarget(game) {
  if (!game) return false;
  const gamePath = normalizePath(game.path);
  return isValidExecutablePath(gamePath, { allowNetworkPaths: false }) && fs.existsSync(gamePath);
}

function launchGameInternal(game) {
  if (!isAllowedLaunchTarget(game)) {
    return fail('ERR_BLOCKED_PATH');
  }

  const executablePath = normalizePath(game.path);
  const launchArgs = splitLaunchArgs(game.launchArgs);
  const defaultCwd = path.dirname(executablePath);
  const requestedCwd = normalizePath(game.workingDir || '');
  const cwd = requestedCwd && path.isAbsolute(requestedCwd) && fs.existsSync(requestedCwd)
    ? requestedCwd
    : defaultCwd;

  if (requestedCwd && !fs.existsSync(cwd)) {
    return fail('ERR_WORKING_DIR_NOT_FOUND');
  }

  try {
    const child = spawn(executablePath, launchArgs, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    const startedAt = now();
    runningSessions.set(game.id, {
      pid: child.pid,
      startedAt,
      lastSeenAt: startedAt,
    });
    applyLaunchStats(game, startedAt);
    startSessionMonitor();
    if (appData.settings?.launchNotifications !== false && Notification.isSupported()) {
      const notice = new Notification({
        title: 'GameDock',
        body: `Launching ${game.name}`,
        silent: true,
      });
      notice.show();
    }

    child.on('exit', () => {
      const session = runningSessions.get(game.id);
      if (!session) return;
      finalizeSession(game.id, session, 'normal');
    });

    child.unref();
    return { success: true, pid: child.pid };
  } catch (err) {
    return fail(mapLaunchErrorToCode(err), { details: toMessage(err) });
  }
}

function launchGameById(id) {
  const game = resolveGameById(id);
  if (!game) return fail('ERR_GAME_NOT_FOUND');
  return launchGameInternal(game);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getCoversRoot() {
  return path.join(app.getPath('userData'), 'covers');
}

function getGameCoverDir(gameId) {
  return path.join(getCoversRoot(), String(gameId));
}

function getSteamArtworkDir(appId) {
  return path.join(getCoversRoot(), 'steam', String(appId));
}

function removeFileIfExists(filePath) {
  if (!filePath || typeof filePath !== 'string') return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // no-op
  }
}

function saveImageBufferAsPng(buffer, targetPath, width, height) {
  const image = nativeImage.createFromBuffer(buffer);
  if (!image || image.isEmpty()) {
    throw new Error('ERR_IMAGE_INVALID');
  }
  const resized = image.resize({ width, height, quality: 'best' });
  fs.writeFileSync(targetPath, resized.toPNG());
}

async function fetchBinary(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(url), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Empty image');
    }
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image too large');
    }
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function setCustomCoverForGame(gameId, source, value) {
  const game = resolveGameById(gameId);
  if (!game) return fail('ERR_GAME_NOT_FOUND');

  const coverDir = getGameCoverDir(game.id);
  ensureDir(coverDir);
  const coverPath = path.join(coverDir, 'cover.png');

  try {
    let buffer;
    if (source === 'file') {
      const filePath = normalizePath(value);
      if (!filePath || !fs.existsSync(filePath)) return fail('ERR_IMAGE_INVALID');
      buffer = fs.readFileSync(filePath);
    } else if (source === 'url') {
      buffer = await fetchBinary(value);
    } else {
      return fail('ERR_IMAGE_INVALID');
    }

    saveImageBufferAsPng(buffer, coverPath, COVER_WIDTH, COVER_HEIGHT);
    game.coverPath = coverPath;
    saveAppData();
    return { success: true, coverPath };
  } catch (err) {
    if (String(err?.message || '').includes('ERR_IMAGE_INVALID')) return fail('ERR_IMAGE_INVALID');
    if (source === 'url') return fail('ERR_IMAGE_DOWNLOAD_FAIL', { details: toMessage(err) });
    return fail('ERR_IMAGE_INVALID', { details: toMessage(err) });
  }
}

function resetCustomCoverForGame(gameId) {
  const game = resolveGameById(gameId);
  if (!game) return fail('ERR_GAME_NOT_FOUND');
  if (game.coverPath) removeFileIfExists(game.coverPath);
  game.coverPath = null;
  saveAppData();
  return { success: true };
}

async function getGameIconDataUrl(gamePath) {
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
  } catch {
    return null;
  }
}

async function fetchSteamGridAssets(appId) {
  const apiKey = readSteamGridDbApiKey();
  if (!apiKey) return { coverUrl: '', logoUrl: '', error: makeError('ERR_STEAMGRIDDB_FAIL') };

  const headers = { Authorization: `Bearer ${apiKey}` };
  const base = 'https://www.steamgriddb.com/api/v2';

  async function fetchFirstUrl(endpoint) {
    try {
      const response = await fetch(`${base}${endpoint}`, { headers });
      if (!response.ok) return '';
      const payload = await response.json();
      if (!payload?.success || !Array.isArray(payload.data) || payload.data.length === 0) return '';
      return String(payload.data[0]?.url || '');
    } catch {
      return '';
    }
  }

  const [coverUrl, logoUrl] = await Promise.all([
    fetchFirstUrl(`/grids/steam/${appId}?dimensions=600x900&types=static`),
    fetchFirstUrl(`/logos/steam/${appId}?types=official,white,color`),
  ]);

  return { coverUrl, logoUrl, error: coverUrl || logoUrl ? null : makeError('ERR_STEAMGRIDDB_FAIL') };
}

async function downloadSteamArtworkIfNeeded(game, appId, coverUrl, logoUrl) {
  if (!appId) return;

  const artDir = getSteamArtworkDir(appId);
  ensureDir(artDir);

  if (coverUrl) {
    try {
      const coverBuffer = await fetchBinary(coverUrl);
      const coverPath = path.join(artDir, 'cover.png');
      saveImageBufferAsPng(coverBuffer, coverPath, COVER_WIDTH, COVER_HEIGHT);
      game.coverPath = coverPath;
    } catch {
      // continue without cover
    }
  }

  if (logoUrl) {
    try {
      const logoBuffer = await fetchBinary(logoUrl);
      const logoPath = path.join(artDir, 'logo.png');
      saveImageBufferAsPng(logoBuffer, logoPath, 512, 256);
      game.logoPath = logoPath;
    } catch {
      // continue without logo
    }
  }
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

async function detectSteamGames() {
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

        const appIdMatch = manifestFile.match(/^appmanifest_(\d+)\.acf$/i);
        const appId = appIdMatch ? Number(appIdMatch[1]) : null;
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
          detectedId: `${appId || 'na'}:${normalized}`,
          steamAppId: appId,
          name,
          path: exePath,
          category: 'Other',
          workingDir: path.dirname(exePath),
          coverUrl: '',
          logoUrl: '',
        });
      }
    }
  }

  for (const candidate of found) {
    if (!candidate.steamAppId) continue;
    const assets = await fetchSteamGridAssets(candidate.steamAppId);
    candidate.coverUrl = assets.coverUrl || '';
    candidate.logoUrl = assets.logoUrl || '';
  }

  return found;
}

function createWindow() {
  const { x, y, winWidth, winHeight } = getWindowPosition();

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: WINDOW_WIDTH,
    maxHeight: WINDOW_HEIGHT,
    x,
    y,
    frame: false,
    resizable: true,
    alwaysOnTop: Boolean(appData.settings?.alwaysOnTop),
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

app.whenReady().then(() => {
  if (appData.settings?.autoStart) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }
  recoverStaleSessions();
  createWindow();
});

app.on('before-quit', () => {
  global.forceQuit = true;
  for (const [gameId, session] of [...runningSessions.entries()]) {
    finalizeSession(gameId, session, 'forced');
  }
  stopSessionMonitor();
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

ipcMain.handle('get-error-map', () => ERROR_MAP);
ipcMain.handle('get-data', () => appData);

ipcMain.handle('save-data', (_, data) => {
  if (!data || typeof data !== 'object') return false;
  const previousActiveSessions = appData.settings?.activeSessions || {};
  appData = sanitizeData(data);
  appData.settings.activeSessions = previousActiveSessions;
  return store.save(appData);
});

ipcMain.handle('set-sort-order', (_, orderedIds) => {
  if (!Array.isArray(orderedIds)) return fail('ERR_UNKNOWN');

  const idToOrder = new Map();
  orderedIds.forEach((id, index) => {
    const gameId = Number(id);
    if (Number.isFinite(gameId)) idToOrder.set(gameId, index);
  });

  appData.games.forEach((game, index) => {
    game.sortOrder = idToOrder.has(game.id) ? idToOrder.get(game.id) : (orderedIds.length + index);
  });
  saveAppData();
  return { success: true };
});

ipcMain.handle('update-game', async (_, payload) => {
  const input = sanitizeGame(payload);
  const game = resolveGameById(input.id);
  if (!game) return fail('ERR_GAME_NOT_FOUND');

  const updatedPath = normalizePath(input.path);
  if (!isValidExecutablePath(updatedPath, { allowNetworkPaths: false })) {
    return fail('ERR_BLOCKED_PATH');
  }
  if (!fs.existsSync(updatedPath)) return fail('ERR_EXE_NOT_FOUND');

  const prevPath = normalizePath(game.path).toLowerCase();
  const pathChanged = prevPath !== updatedPath.toLowerCase();

  game.name = input.name;
  game.path = updatedPath;
  game.category = input.category;
  game.launchArgs = input.launchArgs;
  game.workingDir = input.workingDir;
  if (pathChanged) {
    game.icon = await getGameIconDataUrl(updatedPath);
  }

  saveAppData();
  return { success: true, game };
});

ipcMain.handle('pick-cover-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Cover Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('set-custom-cover-file', async (_, gameId, filePath) => (
  setCustomCoverForGame(Number(gameId), 'file', filePath)
));

ipcMain.handle('set-custom-cover-url', async (_, gameId, url) => (
  setCustomCoverForGame(Number(gameId), 'url', url)
));

ipcMain.handle('reset-custom-cover', (_, gameId) => resetCustomCoverForGame(Number(gameId)));

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
  } catch (err) {
    return fail('ERR_EXPORT_FAIL', { details: toMessage(err) });
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
  } catch (err) {
    return fail('ERR_IMPORT_FAIL', { details: toMessage(err) });
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
    return fail('ERR_RAWG_API_FAIL');
  }

  const currentYear = new Date().getFullYear();
  const today = new Date();
  const sixMonthsOut = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
  const todayIso = today.toISOString().slice(0, 10);
  const sixMonthsIso = sixMonthsOut.toISOString().slice(0, 10);
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
  const upcomingParams = new URLSearchParams({
    key: apiKey,
    page_size: '6',
    dates: `${todayIso},${sixMonthsIso}`,
    ordering: '-added',
  });
  const topRatedParams = new URLSearchParams({
    key: apiKey,
    page_size: '6',
    ordering: '-metacritic',
    metacritic: '80,100',
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const [trendingRes, indieRes, upcomingRes, topRatedRes] = await Promise.all([
      fetch(`https://api.rawg.io/api/games?${trendingParams.toString()}`, { signal: controller.signal }),
      fetch(`https://api.rawg.io/api/games?${indieParams.toString()}`, { signal: controller.signal }),
      fetch(`https://api.rawg.io/api/games?${upcomingParams.toString()}`, { signal: controller.signal }),
      fetch(`https://api.rawg.io/api/games?${topRatedParams.toString()}`, { signal: controller.signal }),
    ]);
    clearTimeout(timeoutId);

    if (!trendingRes.ok || !indieRes.ok || !upcomingRes.ok || !topRatedRes.ok) {
      return fail('ERR_RAWG_API_FAIL');
    }

    const [trendingJson, indieJson, upcomingJson, topRatedJson] = await Promise.all([
      trendingRes.json(),
      indieRes.json(),
      upcomingRes.json(),
      topRatedRes.json(),
    ]);

    return {
      success: true,
      data: {
        trending: trendingJson?.results || [],
        indie: indieJson?.results || [],
        upcoming: upcomingJson?.results || [],
        topRated: topRatedJson?.results || [],
      },
    };
  } catch {
    return fail('ERR_RAWG_API_FAIL');
  }
});

ipcMain.handle('community-news', async (_, payload) => {
  const apiKey = readNewsApiKey();
  if (!apiKey) {
    return { ...fail('ERR_NEWS_API_FAIL'), articles: [], hasMore: false };
  }

  const requestedPage = Number(payload?.page);
  const requestedPageSize = Number(payload?.pageSize);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 && requestedPageSize <= 50
    ? requestedPageSize
    : 12;

  const params = new URLSearchParams({
    q: 'gaming OR videogames',
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: String(pageSize),
    page: String(page),
    apiKey,
  });

  try {
    const res = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`);
    if (!res.ok) {
      return { ...fail('ERR_NEWS_API_FAIL'), articles: [], hasMore: false };
    }

    const responsePayload = await res.json();
    const articles = (responsePayload?.articles || []).map((item) => ({
      source: item?.source?.name || 'Gaming News',
      title: item?.title || 'Untitled',
      snippet: item?.description || 'No summary available.',
      url: item?.url || '',
      publishedAt: item?.publishedAt || '',
    }));
    const totalResults = Number(responsePayload?.totalResults);
    const hasMoreByTotal = Number.isFinite(totalResults) && totalResults > 0
      ? (page * pageSize) < totalResults
      : false;
    const hasMore = hasMoreByTotal || articles.length >= pageSize;

    return { success: true, articles, page, pageSize, totalResults, hasMore };
  } catch {
    return { ...fail('ERR_NEWS_API_FAIL'), articles: [], hasMore: false };
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

ipcMain.handle('open-external-url', async (_, targetUrl) => {
  const url = String(targetUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return fail('ERR_UNKNOWN');
  }
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return fail('ERR_UNKNOWN', { details: toMessage(err) });
  }
});

ipcMain.handle('detect-steam-games', async () => {
  try {
    return { success: true, games: await detectSteamGames() };
  } catch (err) {
    return { ...fail('ERR_STEAM_DETECT_FAIL', { details: toMessage(err) }), games: [] };
  }
});

ipcMain.handle('import-steam-games', async (_, payload) => {
  const incoming = Array.isArray(payload?.games) ? payload.games : [];
  if (incoming.length === 0) return { success: true, added: 0, skipped: 0 };

  let added = 0;
  let skipped = 0;
  const seen = new Set(appData.games.map((g) => normalizePath(g.path).toLowerCase()));

  for (const item of incoming) {
    const candidate = sanitizeGame({
      ...item,
      id: getNextGameId(),
      addedAt: now(),
      launchCount: 0,
      totalPlayTime: 0,
      playtimeMinutes: 0,
      sessionHistory: [],
      favorite: false,
      pinOrder: 0,
      sortOrder: getNextSortOrder(),
      coverPath: null,
      logoPath: null,
      steamAppId: Number.isFinite(Number(item?.steamAppId)) ? Number(item.steamAppId) : null,
    });

    const normalized = normalizePath(candidate.path).toLowerCase();
    if (!isValidExecutablePath(candidate.path, { allowNetworkPaths: false }) || !fs.existsSync(candidate.path)) {
      skipped += 1;
      continue;
    }
    if (seen.has(normalized)) {
      skipped += 1;
      continue;
    }
    seen.add(normalized);

    candidate.icon = await getGameIconDataUrl(candidate.path);
    await downloadSteamArtworkIfNeeded(
      candidate,
      candidate.steamAppId,
      String(item?.coverUrl || ''),
      String(item?.logoUrl || ''),
    );

    appData.games.push(candidate);
    added += 1;
  }

  saveAppData();
  return { success: true, added, skipped };
});

ipcMain.handle('launch-game', async (_, launchRequest) => {
  if (!launchRequest || typeof launchRequest !== 'object') {
    return fail('ERR_INVALID_LAUNCH');
  }

  const game = sanitizeGame(launchRequest);
  const storedGame = resolveGameById(game.id);
  if (!storedGame) return fail('ERR_GAME_NOT_FOUND');

  const requestedPath = normalizePath(game.path).toLowerCase();
  const storedPath = normalizePath(storedGame.path).toLowerCase();
  if (requestedPath !== storedPath) {
    return fail('ERR_PATH_MISMATCH');
  }

  return launchGameInternal(storedGame);
});

ipcMain.handle('toggle-favorite', (_, id) => {
  const game = resolveGameById(id);
  if (!game) return fail('ERR_GAME_NOT_FOUND');
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

ipcMain.handle('get-game-icon', async (_, gamePath) => getGameIconDataUrl(gamePath));

ipcMain.on('window-hide', () => mainWindow.hide());
ipcMain.on('window-close', () => {
  mainWindow.hide();
});

ipcMain.handle('toggle-always-on-top', (_, val) => {
  const enabled = Boolean(val);
  if (!mainWindow || mainWindow.isDestroyed()) return fail('ERR_UNKNOWN');
  mainWindow.setAlwaysOnTop(enabled);
  appData.settings = appData.settings || {};
  appData.settings.alwaysOnTop = enabled;
  saveAppData();
  return { success: true, value: enabled };
});

ipcMain.handle('toggle-auto-start', (_, enable) => {
  const flag = Boolean(enable);
  app.setLoginItemSettings({ openAtLogin: flag, path: process.execPath });
  appData.settings = appData.settings || {};
  appData.settings.autoStart = flag;
  saveAppData();
  return { success: true, value: flag };
});
