const path = require('path');

const DEFAULT_DATA = {
  games: [],
  settings: {
    autoStart: false,
    minimizeToTray: true,
    alwaysOnTop: false,
    opacity: 95,
    activeSessions: {},
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

function sanitizeOptionalString(value, max = 400) {
  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (!str) return null;
  return str.slice(0, max);
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
  const sortOrder = clampNumber(game.sortOrder, Number.MAX_SAFE_INTEGER, 0);
  const totalPlayTime = clampNumber(game.totalPlayTime ?? game.playtimeMinutes, 0, 0);
  const steamAppId = Number.isFinite(Number(game.steamAppId)) ? Number(game.steamAppId) : null;
  const sessionHistoryRaw = Array.isArray(game.sessionHistory) ? game.sessionHistory : [];
  const sessionHistory = sessionHistoryRaw
    .map((session) => {
      const s = asObject(session);
      const startedAt = clampNumber(s.startedAt, 0, 0);
      const endedAt = clampNumber(s.endedAt, startedAt, startedAt);
      const durationMinutes = clampNumber(s.durationMinutes, 0, 0);
      if (!startedAt || !endedAt || endedAt < startedAt) return null;
      return {
        startedAt,
        endedAt,
        durationMinutes,
        pid: Number.isFinite(Number(s.pid)) ? Number(s.pid) : null,
      };
    })
    .filter(Boolean)
    .slice(-120);

  return {
    id: clampNumber(game.id, Date.now()),
    name: sanitizeName(game.name) || 'Unknown Game',
    path: normalizePath(game.path),
    category,
    icon: typeof game.icon === 'string' && game.icon.startsWith('data:image/') ? game.icon : null,
    addedAt: clampNumber(game.addedAt, Date.now()),
    lastPlayed: game.lastPlayed ? clampNumber(game.lastPlayed, null) : null,
    playtimeMinutes: totalPlayTime,
    totalPlayTime,
    sessionHistory,
    launchCount: clampNumber(game.launchCount, 0, 0),
    favorite,
    pinOrder: favorite ? clampNumber(game.pinOrder, 0, 0) : 0,
    sortOrder,
    launchArgs,
    workingDir: normalizePath(workingDir),
    coverPath: sanitizeOptionalString(game.coverPath, 500),
    logoPath: sanitizeOptionalString(game.logoPath, 500),
    steamAppId,
  };
}

function sanitizeSettings(rawSettings) {
  const settings = asObject(rawSettings);
  const activeSessionsRaw = asObject(settings.activeSessions);
  const activeSessions = {};

  for (const [key, value] of Object.entries(activeSessionsRaw)) {
    const session = asObject(value);
    const gameId = Number(key);
    const startedAt = clampNumber(session.startedAt, 0, 0);
    const pid = Number.isFinite(Number(session.pid)) ? Number(session.pid) : null;
    if (!Number.isFinite(gameId) || !startedAt) continue;
    activeSessions[String(gameId)] = {
      startedAt,
      pid,
      lastSeenAt: clampNumber(session.lastSeenAt, startedAt, startedAt),
    };
  }

  return {
    autoStart: Boolean(settings.autoStart),
    minimizeToTray: settings.minimizeToTray !== false,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    opacity: clampNumber(settings.opacity, 95, 30, 100),
    activeSessions,
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
