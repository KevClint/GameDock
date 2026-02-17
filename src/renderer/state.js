const SORT_MODE_STORAGE_KEY = 'gamedock.sort.mode';
const DEFAULT_SORT_MODE = 'lastPlayed';
const VALID_SORT_MODES = new Set(['lastPlayed', 'playtime', 'name', 'favoritesOnly', 'manual']);
const DEFAULT_CATEGORIES = ['FPS', 'MOBA', 'RPG', 'Other'];
const DEFAULT_ACCENT_COLOR = '#8b5cf6';
const DEFAULT_THEME_MODE = 'dark';
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const VALID_THEME_MODES = new Set(['dark', 'light']);

function normalizeAccentColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return HEX_COLOR_PATTERN.test(color) ? color : DEFAULT_ACCENT_COLOR;
}

function normalizeThemeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return VALID_THEME_MODES.has(mode) ? mode : DEFAULT_THEME_MODE;
}

function normalizeSortMode(mode) {
  const value = String(mode || '').trim();
  return VALID_SORT_MODES.has(value) ? value : DEFAULT_SORT_MODE;
}

function readSortModeFromStorage() {
  try {
    return normalizeSortMode(localStorage.getItem(SORT_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_SORT_MODE;
  }
}

function persistSortMode(mode) {
  try {
    localStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures and keep in-memory state.
  }
}

function normalizeCategoryName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

function sanitizeCategories(categories) {
  if (!Array.isArray(categories)) return [...DEFAULT_CATEGORIES];

  const normalized = [];
  const seen = new Set();
  categories.forEach((category) => {
    const name = normalizeCategoryName(category);
    if (!name) return;
    if (name.toLowerCase() === 'all') return;
    if (name.toLowerCase() === 'rts') return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(name);
  });

  return normalized.length > 0 ? normalized : [...DEFAULT_CATEGORIES];
}

function ensureAppDataShape(data) {
  const input = data && typeof data === 'object' ? data : {};
  const sourceSettings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  return {
    ...input,
    games: Array.isArray(input.games) ? input.games : [],
    settings: {
      ...sourceSettings,
      autoStart: Boolean(sourceSettings.autoStart),
      minimizeToTray: sourceSettings.minimizeToTray !== false,
      alwaysOnTop: Boolean(sourceSettings.alwaysOnTop),
      launchNotifications: sourceSettings.launchNotifications !== false,
      simplifiedLibraryCards: Boolean(sourceSettings.simplifiedLibraryCards),
      accentColor: normalizeAccentColor(sourceSettings.accentColor),
      themeMode: normalizeThemeMode(sourceSettings.themeMode),
      boosterEnabled: Boolean(sourceSettings.boosterEnabled),
      boosterTargets: Array.isArray(sourceSettings.boosterTargets) ? sourceSettings.boosterTargets : [],
      boosterForceKill: Boolean(sourceSettings.boosterForceKill),
      boosterRestoreOnExit: sourceSettings.boosterRestoreOnExit !== false,
    },
    categories: sanitizeCategories(input.categories),
  };
}

async function persistAppData() {
  try {
    if (window?.api?.saveData) {
      return Boolean(await window.api.saveData(appData));
    }
    return true;
  } catch (error) {
    console.error('Failed to persist app data:', error);
    return false;
  }
}

let appData = ensureAppDataShape({
  games: [],
  settings: {
    autoStart: false,
    minimizeToTray: true,
    launchNotifications: true,
    simplifiedLibraryCards: false,
    accentColor: DEFAULT_ACCENT_COLOR,
    themeMode: DEFAULT_THEME_MODE,
    boosterEnabled: false,
    boosterTargets: [],
    boosterForceKill: false,
    boosterRestoreOnExit: true,
  },
});
let activeCategory = 'all';
let searchQuery = '';
let selectedGameIds = new Set();
let activeView = 'library';
let errorMap = {};
let sortMode = readSortModeFromStorage();
let contextMenuGameId = null;
let steamDetectCandidates = [];
let discoveryLoaded = false;
let discoveryLoading = false;
const discoveryEntryTimers = new Set();
let communityLoaded = false;
let communityFeedPage = 1;
let communityFeedHasMore = false;
let communityFeedLoadingMore = false;

export function getAppData() { return appData; }
export function setAppData(data) {
  appData = ensureAppDataShape(data);
}

export function getActiveCategory() { return activeCategory; }
export function setActiveCategory(category) { activeCategory = category || 'all'; }

export function getSearchQuery() { return searchQuery; }
export function setSearchQuery(query) { searchQuery = String(query || '').toLowerCase(); }

export function getSelectedGameIds() { return selectedGameIds; }
export function setSelectedGameIds(ids) {
  if (ids instanceof Set) {
    selectedGameIds = ids;
    return;
  }
  selectedGameIds = new Set((ids || []).map(Number).filter(Number.isFinite));
}

export function getActiveView() { return activeView; }
export function setActiveView(view) { activeView = view || 'library'; }

export function getErrorMap() { return errorMap; }
export function setErrorMap(map) { errorMap = map || {}; }

export function getSortMode() { return sortMode; }
export function setSortMode(mode, options = {}) {
  const { persist = true } = options;
  sortMode = normalizeSortMode(mode);
  if (persist) persistSortMode(sortMode);
}

export function getContextMenuGameId() { return contextMenuGameId; }
export function setContextMenuGameId(id) {
  contextMenuGameId = id === null || id === undefined ? null : Number(id);
}

export function getSteamDetectCandidates() { return steamDetectCandidates; }
export function setSteamDetectCandidates(candidates) {
  steamDetectCandidates = Array.isArray(candidates) ? candidates : [];
}

export function getDiscoveryLoaded() { return discoveryLoaded; }
export function setDiscoveryLoaded(loaded) { discoveryLoaded = Boolean(loaded); }

export function getDiscoveryLoading() { return discoveryLoading; }
export function setDiscoveryLoading(loading) { discoveryLoading = Boolean(loading); }

export function getDiscoveryEntryTimers() { return discoveryEntryTimers; }

export function getCommunityLoaded() { return communityLoaded; }
export function setCommunityLoaded(loaded) { communityLoaded = Boolean(loaded); }

export function getCommunityFeedPage() { return communityFeedPage; }
export function setCommunityFeedPage(page) {
  const value = Number(page);
  communityFeedPage = Number.isFinite(value) && value > 0 ? value : 1;
}

export function getCommunityFeedHasMore() { return communityFeedHasMore; }
export function setCommunityFeedHasMore(hasMore) { communityFeedHasMore = Boolean(hasMore); }

export function getCommunityFeedLoadingMore() { return communityFeedLoadingMore; }
export function setCommunityFeedLoadingMore(loading) { communityFeedLoadingMore = Boolean(loading); }

export async function addCategory(name) {
  const next = normalizeCategoryName(name);
  if (!next || next.toLowerCase() === 'all') {
    return { success: false, error: 'Invalid category name' };
  }

  const exists = appData.categories.some((category) => category.toLowerCase() === next.toLowerCase());
  if (exists) {
    return { success: true, added: false };
  }

  const prevCategories = [...appData.categories];
  appData.categories = [...appData.categories, next];
  const saved = await persistAppData();
  if (!saved) {
    appData.categories = prevCategories;
    return { success: false, added: false, error: 'Failed to save category' };
  }
  return { success: true, added: true };
}

export async function removeCategory(name) {
  const target = normalizeCategoryName(name);
  if (!target) {
    return { success: false, error: 'Invalid category name' };
  }

  const prevCategories = [...appData.categories];
  const prevGames = Array.isArray(appData.games) ? appData.games.map((game) => ({ ...game })) : [];
  const prevActiveCategory = activeCategory;

  const before = appData.categories.length;
  appData.categories = appData.categories.filter((category) => category.toLowerCase() !== target.toLowerCase());
  const removed = appData.categories.length !== before;
  if (!removed) {
    return { success: true, removed: false };
  }

  if (activeCategory.toLowerCase() === target.toLowerCase()) {
    activeCategory = 'all';
  }

  appData.games = appData.games.map((game) => {
    if (String(game?.category || '').toLowerCase() !== target.toLowerCase()) return game;
    return { ...game, category: 'Other' };
  });

  if (!appData.categories.some((category) => category.toLowerCase() === 'other')) {
    appData.categories.push('Other');
  }

  const saved = await persistAppData();
  if (!saved) {
    appData.categories = prevCategories;
    appData.games = prevGames;
    activeCategory = prevActiveCategory;
    return { success: false, removed: false, error: 'Failed to save category changes' };
  }
  return { success: true, removed: true };
}
