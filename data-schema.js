const path = require('path');

const DEFAULT_DATA = {
  games: [],
  settings: {
    autoStart: false,
    minimizeToTray: true,
    alwaysOnTop: false,
    opacity: 95,
  },
};

const VALID_CATEGORIES = new Set(['FPS', 'MOBA', 'RPG', 'RTS', 'Other']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampNumber(value, fallback = 0, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeName(value) {
  const str = String(value || '').trim();
  return str.slice(0, 120);
}

function normalizePath(rawPath) {
  return path.normalize(String(rawPath || '').trim());
}

function isBlockedNetworkPath(filePath) {
  return /^\\\\/.test(filePath);
}

function isValidExecutablePath(rawPath, { allowNetworkPaths = false } = {}) {
  const filePath = normalizePath(rawPath);
  if (!path.isAbsolute(filePath)) return false;
  if (!/\.exe$/i.test(filePath)) return false;
  if (!allowNetworkPaths && isBlockedNetworkPath(filePath)) return false;
  return true;
}

function sanitizeGame(rawGame) {
  const game = asObject(rawGame);
  const category = VALID_CATEGORIES.has(game.category) ? game.category : 'Other';
  const launchArgs = String(game.launchArgs || '').trim().slice(0, 300);
  const workingDir = String(game.workingDir || '').trim();
  const favorite = Boolean(game.favorite);

  return {
    id: clampNumber(game.id, Date.now()),
    name: sanitizeName(game.name) || 'Unknown Game',
    path: normalizePath(game.path),
    category,
    icon: typeof game.icon === 'string' && game.icon.startsWith('data:image/') ? game.icon : null,
    addedAt: clampNumber(game.addedAt, Date.now()),
    lastPlayed: game.lastPlayed ? clampNumber(game.lastPlayed, null) : null,
    playtimeMinutes: clampNumber(game.playtimeMinutes, 0, 0),
    launchCount: clampNumber(game.launchCount, 0, 0),
    favorite,
    pinOrder: favorite ? clampNumber(game.pinOrder, 0, 0) : 0,
    launchArgs,
    workingDir: normalizePath(workingDir),
  };
}

function sanitizeSettings(rawSettings) {
  const settings = asObject(rawSettings);
  return {
    autoStart: Boolean(settings.autoStart),
    minimizeToTray: settings.minimizeToTray !== false,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    opacity: clampNumber(settings.opacity, 95, 30, 100),
  };
}

function sanitizeData(rawData) {
  const data = asObject(rawData);
  const games = Array.isArray(data.games) ? data.games.map(sanitizeGame) : [];
  const uniqueGames = [];
  const seenIds = new Set();

  for (const game of games) {
    if (!seenIds.has(game.id)) {
      seenIds.add(game.id);
      uniqueGames.push(game);
    }
  }

  return {
    games: uniqueGames,
    settings: sanitizeSettings(data.settings),
  };
}

function splitLaunchArgs(args) {
  const input = String(args || '').trim();
  if (!input) return [];

  const parsed = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = re.exec(input)) !== null) {
    parsed.push(match[1] || match[2] || match[0]);
  }
  return parsed.slice(0, 20);
}

module.exports = {
  DEFAULT_DATA,
  sanitizeData,
  sanitizeGame,
  sanitizeSettings,
  normalizePath,
  isValidExecutablePath,
  splitLaunchArgs,
};
