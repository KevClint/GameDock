const SORT_MODE_STORAGE_KEY = 'gamedock.sort.mode';
const DEFAULT_SORT_MODE = 'lastPlayed';
const VALID_SORT_MODES = new Set(['lastPlayed', 'playtime', 'name', 'favoritesOnly', 'manual']);

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

let appData = { games: [], settings: { autoStart: false, minimizeToTray: true } };
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
  appData = data || { games: [], settings: { autoStart: false, minimizeToTray: true } };
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
