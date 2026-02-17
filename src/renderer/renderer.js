import {
  getAppData,
  addCategory,
  setAppData,
  getActiveCategory,
  setActiveCategory,
  getSearchQuery,
  setSearchQuery,
  getSelectedGameIds,
  setSelectedGameIds,
  getActiveView,
  setActiveView as setStateActiveView,
  getErrorMap,
  setErrorMap,
  getSortMode,
  setSortMode,
  getContextMenuGameId,
  setContextMenuGameId,
  getSteamDetectCandidates,
  setSteamDetectCandidates,
  getDiscoveryLoaded,
  setDiscoveryLoaded,
  getDiscoveryLoading,
  setDiscoveryLoading,
  getDiscoveryEntryTimers,
  getCommunityLoaded,
  setCommunityLoaded,
  getCommunityFeedPage,
  setCommunityFeedPage,
  getCommunityFeedHasMore,
  setCommunityFeedHasMore,
  getCommunityFeedLoadingMore,
  setCommunityFeedLoadingMore,
} from './state.js';
import {
  configureUI,
  renderCategories,
  renderGames,
  setupTitleBar,
  showToast,
  showSaveActionPopup,
  updateCommunityFeedMoreButton,
  renderNewsFeed,
  renderSteamImportList,
} from './ui.js';

const state = {
  get appData() { return getAppData(); },
  set appData(value) { setAppData(value); },
  get activeCategory() { return getActiveCategory(); },
  set activeCategory(value) { setActiveCategory(value); },
  get searchQuery() { return getSearchQuery(); },
  set searchQuery(value) { setSearchQuery(value); },
  get selectedGameIds() { return getSelectedGameIds(); },
  set selectedGameIds(value) { setSelectedGameIds(value); },
  get activeView() { return getActiveView(); },
  set activeView(value) { setStateActiveView(value); },
  get errorMap() { return getErrorMap(); },
  set errorMap(value) { setErrorMap(value); },
  get sortMode() { return getSortMode(); },
  set sortMode(value) { setSortMode(value); },
  get contextMenuGameId() { return getContextMenuGameId(); },
  set contextMenuGameId(value) { setContextMenuGameId(value); },
  get steamDetectCandidates() { return getSteamDetectCandidates(); },
  set steamDetectCandidates(value) { setSteamDetectCandidates(value); },
  get discoveryLoaded() { return getDiscoveryLoaded(); },
  set discoveryLoaded(value) { setDiscoveryLoaded(value); },
  get discoveryLoading() { return getDiscoveryLoading(); },
  set discoveryLoading(value) { setDiscoveryLoading(value); },
  get discoveryEntryTimers() { return getDiscoveryEntryTimers(); },
  get communityLoaded() { return getCommunityLoaded(); },
  set communityLoaded(value) { setCommunityLoaded(value); },
  get communityFeedPage() { return getCommunityFeedPage(); },
  set communityFeedPage(value) { setCommunityFeedPage(value); },
  get communityFeedHasMore() { return getCommunityFeedHasMore(); },
  set communityFeedHasMore(value) { setCommunityFeedHasMore(value); },
  get communityFeedLoadingMore() { return getCommunityFeedLoadingMore(); },
  set communityFeedLoadingMore(value) { setCommunityFeedLoadingMore(value); },
  async addCategory(name) { return addCategory(name); },
};

const CARD_LAUNCH_GUARD_MS = 300;
const DISCOVERY_CACHE_KEY = 'gamedock.discovery.cache.v1';
const DISCOVERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const COMMUNITY_PAGE_SIZE = 12; 
const cleanerState = {
  loaded: false,
  loading: false,
  report: null,
};

const MOCK_COMMUNITY_ARTICLES = [
  {
    source: 'IGN',
    title: 'Helldivers 2 Devs Tease New Galactic Threat Event',
    snippet: 'Arrowhead hinted at a larger-scale war update with new enemy classes and weekly objectives.',
    url: 'https://www.ign.com',
    publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    source: 'PC Gamer',
    title: 'Cyberpunk 2077 Mod Pack Dramatically Improves NPC Behavior',
    snippet: 'A community overhaul mod is gaining traction for making city encounters less scripted and more reactive.',
    url: 'https://www.pcgamer.com',
    publishedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  },
  {
    source: 'Kotaku',
    title: 'Indie RPG Showcase Highlights 12 Upcoming Tactical Hits',
    snippet: 'Studios revealed a batch of strategy-heavy RPGs focused on party builds and high replay value.',
    url: 'https://kotaku.com',
    publishedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
];

async function init() {
  try {
    state.appData = (await window.api.getData()) || state.appData;
  } catch (error) {
    console.error('Failed to load app data from main process:', error);
    state.appData = state.appData || { games: [], settings: { autoStart: false, minimizeToTray: true } };
  }

  try {
    state.errorMap = (await window.api.getErrorMap?.()) || {};
  } catch (error) {
    console.error('Failed to load error map:', error);
    state.errorMap = {};
  }

  setupTitleBar();
  setupSearch();
  setupCategories();
  renderCategories();
  setupSortMode();
  setupNavigation();
  setupDiscovery();
  setupCommunityFeed();
  setupCleaner();
  setupGameContextMenu();
  setupSteamImportWizard();
  setActiveView('library');
  setupAddGame();
  setupSettings();
  renderGames();

  document.addEventListener('click', (e) => {
    if (
      !e.target.closest('.game-card')
      && !e.target.closest('#delete-bar')
      && !e.target.closest('#game-context-menu')
    ) {
      deselectGame();
      hideGameContextMenu();
    }
  });
}

function setupDiscovery() {
  const retryBtn = document.getElementById('btn-discovery-retry');
  const refreshBtn = document.getElementById('btn-discovery-refresh');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      void loadDiscovery(true);
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      void loadDiscovery(true);
    });
  }
  setDiscoveryRefreshButtonState(false);
}

function setDiscoveryRefreshButtonState(isLoading) {
  const refreshBtn = document.getElementById('btn-discovery-refresh');
  if (!refreshBtn) return;
  refreshBtn.disabled = Boolean(isLoading);
  const label = refreshBtn.querySelector('.discovery-refresh-label');
  if (label) label.textContent = isLoading ? 'Refreshing...' : 'Refresh';
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-nav]').forEach((item) => {
    item.addEventListener('click', () => {
      const previousView = state.activeView;
      const nav = item.dataset.nav;
      const targetView = nav === 'settings-nav' ? 'settings' : nav;
      setActiveView(targetView);
      if (previousView === 'discover' && targetView !== 'discover') {
        teardownDiscoveryView();
      }
    });
  });
}

function setActiveView(viewName) {
  state.activeView = viewName;
  const viewMap = {
    library: 'view-library',
    discover: 'view-discovery',
    community: 'view-community',
    cleaner: 'view-cleaner',
    settings: 'view-settings',
  };

  const titleMap = {
    library: 'Library',
    discover: 'Discovery',
    community: 'Community',
    cleaner: 'Cleaner',
    settings: 'Settings',
  };

  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.remove('is-active');
    panel.hidden = true;
  });

  const targetPanel = document.getElementById(viewMap[viewName] || 'view-library');
  if (targetPanel) {
    targetPanel.hidden = false;
    targetPanel.classList.add('is-active');
  }

  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll(`.nav-item[data-nav="${viewName}"], .nav-item[data-nav="${viewName}-nav"]`)
    .forEach((item) => item.classList.add('active'));

  const title = document.querySelector('.header-title');
  if (title) title.textContent = titleMap[viewName] || 'GameDock';

  const mainView = document.querySelector('.main-view');
  if (mainView) mainView.classList.toggle('compact-view', viewName !== 'library');
  const sidebarSort = document.getElementById('sidebar-sort');
  if (sidebarSort) sidebarSort.hidden = viewName !== 'library';

  if (viewName !== 'library') hideDeleteBar();
  if (viewName === 'discover') void loadDiscovery(false);
  if (viewName === 'community') void loadCommunityNews(false);
  if (viewName === 'cleaner') void refreshCleanerReport({ force: false });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeDiscoveryGame(game) {
  const genres = Array.isArray(game?.genres)
    ? game.genres
      .map((g) => (typeof g === 'string' ? g : g?.name))
      .filter(Boolean)
    : [];

  return {
    id: game?.id ?? Date.now(),
    name: game?.name || 'Unknown Game',
    background_image: getOptimizedImage(game?.background_image || ''),
    metacritic: Number.isFinite(game?.metacritic) ? game.metacritic : null,
    genres,
    slug: typeof game?.slug === 'string' ? game.slug : '',
    website: typeof game?.website === 'string' ? game.website : '',
    infoUrl: getDiscoveryGameInfoUrl(game),
  };
}

function getDiscoveryGameInfoUrl(game) {
  const slug = String(game?.slug || '').trim();
  if (slug) {
    return `https://rawg.io/games/${encodeURIComponent(slug)}`;
  }

  const website = String(game?.website || '').trim();
  if (/^https?:\/\//i.test(website)) {
    return website;
  }
  const name = String(game?.name || '').trim();
  if (name) {
    return `https://rawg.io/search?query=${encodeURIComponent(name)}`;
  }
  return '';
}

async function openDiscoveryGameInfo(url) {
  const target = String(url || '').trim();
  if (!target) return;

  try {
    const result = await window.api.openExternalUrl?.(target);
    if (!result?.success) {
      showToast(result?.error || 'ERR_UNKNOWN', 'error');
    }
  } catch (error) {
    showToast(error?.message || 'ERR_UNKNOWN', 'error');
  }
}

function getOptimizedImage(url) {
  if (!url || typeof url !== 'string') return '';
  if (!url.includes('/media/')) return url;
  if (url.includes('/media/resize/')) return url;
  return url.replace('/media/', '/media/resize/640/-/');
}

function getDiscoveryDataHash(data) {
  const payload = {
    heroId: data?.hero?.id || null,
    trendingIds: (data?.trending || []).map((g) => g.id),
    indieIds: (data?.indie || []).map((g) => g.id),
    upcomingIds: (data?.upcoming || []).map((g) => g.id),
    topRatedIds: (data?.topRated || []).map((g) => g.id),
  };
  return JSON.stringify(payload);
}

function readDiscoveryCache() {
  try {
    const raw = localStorage.getItem(DISCOVERY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.timestamp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiscoveryCache(data) {
  const record = {
    timestamp: Date.now(),
    hash: getDiscoveryDataHash(data),
    data,
  };
  localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(record));
}

async function fetchWithCache(url, fetcher) {
  const now = Date.now();
  const cached = readDiscoveryCache();
  const isFresh = cached && now - cached.timestamp < DISCOVERY_CACHE_MAX_AGE_MS;

  if (isFresh) {
    return { data: cached.data, fromCache: true, stale: false, hash: cached.hash || '' };
  }

  const fresh = await fetcher(url);
  return { data: fresh, fromCache: false, stale: false, hash: getDiscoveryDataHash(fresh) };
}

async function fetchDiscoveryGames({ forceNetwork = false } = {}) {
  const sourceUrl = 'rawg://discovery';
  const cachedRecord = readDiscoveryCache();

  const networkFetcher = async () => {
    const response = await Promise.race([
      window.api.getRawgDiscoveryGames?.(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IPC timeout while loading discovery data')), 15000)),
    ]);
    if (!response?.success) {
      throw new Error(resolveErrorText(response?.error || 'ERR_RAWG_API_FAIL', true));
    }

    const trending = (response.data?.trending || []).map(normalizeDiscoveryGame).slice(0, 10);
    const indie = (response.data?.indie || []).map(normalizeDiscoveryGame).slice(0, 5);
    const upcoming = (response.data?.upcoming || []).map(normalizeDiscoveryGame).slice(0, 6);
    const topRated = (response.data?.topRated || []).map(normalizeDiscoveryGame).slice(0, 6);
    return {
      hero: trending[0] || null,
      trending: trending.slice(1),
      indie,
      upcoming,
      topRated,
    };
  };

  if (forceNetwork) {
    const freshData = await networkFetcher();
    writeDiscoveryCache(freshData);
    return freshData;
  }

  const cachedResult = await fetchWithCache(sourceUrl, networkFetcher);

  // Cached data is shown immediately, then background refresh runs.
  if (cachedResult.fromCache) {
    const refreshPromise = networkFetcher()
      .then((freshData) => {
        const freshHash = getDiscoveryDataHash(freshData);
        const oldHash = cachedRecord?.hash || '';
        if (freshHash !== oldHash) {
          writeDiscoveryCache(freshData);
          if (state.activeView === 'discover') renderGameCards(freshData);
        }
      })
      .catch((err) => {
        console.error('Background discovery refresh failed:', err);
      });
    // Fire-and-forget refresh to avoid blocking initial paint.
    void refreshPromise;
    return cachedResult.data;
  }

  writeDiscoveryCache(cachedResult.data);
  return cachedResult.data;
}

function getMetacriticClass(score) {
  if (!Number.isFinite(score)) return 'mid';
  if (score >= 80) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

function createDiscoveryCardNode(game) {
  const card = document.createElement('article');
  card.className = 'discovery-card card-enter';
  card.dataset.discoveryId = String(game.id || '');

  const cover = document.createElement('img');
  cover.className = 'discovery-card-cover';
  cover.loading = 'lazy';
  cover.decoding = 'async';
  cover.alt = game.name || 'Game cover';
  if (game.background_image) {
    cover.src = game.background_image;
  }

  const body = document.createElement('div');
  body.className = 'discovery-card-body';

  const badge = document.createElement('div');
  badge.className = `metacritic-badge ${getMetacriticClass(game.metacritic)}`;
  badge.textContent = `Metacritic ${Number.isFinite(game.metacritic) ? game.metacritic : 'N/A'}`;

  const title = document.createElement('div');
  title.className = 'discovery-card-title';
  title.textContent = game.name || 'Unknown Game';

  const genres = document.createElement('div');
  genres.className = 'discovery-card-genres';
  genres.textContent = (game.genres || []).slice(0, 3).join(', ') || 'Uncategorized';

  body.append(badge, title, genres);
  card.append(cover, body);

  const infoUrl = game.infoUrl || getDiscoveryGameInfoUrl(game);
  if (infoUrl) {
    card.classList.add('is-link');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.title = 'Open game info';
    card.addEventListener('click', () => {
      void openDiscoveryGameInfo(infoUrl);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void openDiscoveryGameInfo(infoUrl);
      }
    });
  }

  return card;
}

function staggerRevealCards(container) {
  const cards = container.querySelectorAll('.card-enter');
  requestAnimationFrame(() => {
    cards.forEach((card, index) => {
      const timer = setTimeout(() => {
        card.classList.add('is-visible');
        state.discoveryEntryTimers.delete(timer);
      }, index * 18);
      state.discoveryEntryTimers.add(timer);
    });
  });
}

function clearDiscoveryEntryTimers() {
  state.discoveryEntryTimers.forEach((timer) => clearTimeout(timer));
  state.discoveryEntryTimers.clear();
}

function teardownDiscoveryView() {
  clearDiscoveryEntryTimers();
  const heroEl = document.getElementById('discovery-hero');
  const trendingGrid = document.getElementById('discovery-grid-trending');
  const indieGrid = document.getElementById('discovery-grid-indie');
  const upcomingGrid = document.getElementById('discovery-grid-upcoming');
  const topRatedGrid = document.getElementById('discovery-grid-top-rated');
  if (heroEl) heroEl.textContent = '';
  if (trendingGrid) trendingGrid.textContent = '';
  if (indieGrid) indieGrid.textContent = '';
  if (upcomingGrid) upcomingGrid.textContent = '';
  if (topRatedGrid) topRatedGrid.textContent = '';
  state.discoveryLoaded = false;
}

function renderGameCards(data) {
  const heroEl = document.getElementById('discovery-hero');
  const trendingGrid = document.getElementById('discovery-grid-trending');
  const indieGrid = document.getElementById('discovery-grid-indie');
  const upcomingGrid = document.getElementById('discovery-grid-upcoming');
  const topRatedGrid = document.getElementById('discovery-grid-top-rated');
  const trendingMeta = document.getElementById('discovery-meta-trending');

  if (!heroEl || !trendingGrid || !indieGrid || !upcomingGrid || !topRatedGrid) return;

  heroEl.innerHTML = '';
  trendingGrid.innerHTML = '';
  indieGrid.innerHTML = '';
  upcomingGrid.innerHTML = '';
  topRatedGrid.innerHTML = '';
  clearDiscoveryEntryTimers();

  const normalizedData = {
    hero: data?.hero ? normalizeDiscoveryGame(data.hero) : null,
    trending: Array.isArray(data?.trending) ? data.trending.map(normalizeDiscoveryGame) : [],
    indie: Array.isArray(data?.indie) ? data.indie.map(normalizeDiscoveryGame) : [],
    upcoming: Array.isArray(data?.upcoming) ? data.upcoming.map(normalizeDiscoveryGame) : [],
    topRated: Array.isArray(data?.topRated) ? data.topRated.map(normalizeDiscoveryGame) : [],
  };

  if (normalizedData.hero) {
    const heroGenres = escapeHtml((normalizedData.hero.genres || []).slice(0, 3).join(' | ') || 'Trending now');
    const heroScore = Number.isFinite(normalizedData.hero.metacritic) ? normalizedData.hero.metacritic : 'N/A';
    const heroBgStyle = normalizedData.hero.background_image
      ? `style="--hero-bg:url('${escapeHtml(normalizedData.hero.background_image)}');"`
      : '';

    heroEl.innerHTML = `
      <section class="discovery-hero" ${heroBgStyle}>
        <div class="hero-overlay">
          <div class="hero-kicker">#1 Trending This Year</div>
          <h2 class="hero-title">${escapeHtml(normalizedData.hero.name)}</h2>
          <p class="hero-subtitle">${heroGenres}</p>
          <div class="hero-actions">
            ${normalizedData.hero.infoUrl ? `
              <button class="btn-primary js-discovery-open-hero" type="button">
                <span class="material-symbols-outlined">open_in_new</span>
                View Game Info
              </button>
            ` : ''}
            <span class="metacritic-badge ${getMetacriticClass(normalizedData.hero.metacritic)}">Metacritic ${heroScore}</span>
          </div>
        </div>
      </section>
    `;

    if (normalizedData.hero.infoUrl) {
      const heroOpenBtn = heroEl.querySelector('.js-discovery-open-hero');
      if (heroOpenBtn) {
        heroOpenBtn.addEventListener('click', () => {
          void openDiscoveryGameInfo(normalizedData.hero.infoUrl);
        });
      }
    }
  }

  const trendingFrag = document.createDocumentFragment();
  normalizedData.trending.forEach((game) => {
    trendingFrag.appendChild(createDiscoveryCardNode(game));
  });
  trendingGrid.appendChild(trendingFrag);

  const indieFrag = document.createDocumentFragment();
  normalizedData.indie.forEach((game) => {
    indieFrag.appendChild(createDiscoveryCardNode(game));
  });
  indieGrid.appendChild(indieFrag);

  const upcomingFrag = document.createDocumentFragment();
  normalizedData.upcoming.forEach((game) => {
    upcomingFrag.appendChild(createDiscoveryCardNode(game));
  });
  upcomingGrid.appendChild(upcomingFrag);

  const topRatedFrag = document.createDocumentFragment();
  normalizedData.topRated.forEach((game) => {
    topRatedFrag.appendChild(createDiscoveryCardNode(game));
  });
  topRatedGrid.appendChild(topRatedFrag);

  if (trendingMeta) {
    trendingMeta.textContent = `Top ${normalizedData.trending.length + (normalizedData.hero ? 1 : 0)} this year`;
  }

  staggerRevealCards(trendingGrid);
  staggerRevealCards(indieGrid);
  staggerRevealCards(upcomingGrid);
  staggerRevealCards(topRatedGrid);
}

function setDiscoveryUiState(state) {
  const loading = document.getElementById('discovery-loading');
  const offline = document.getElementById('discovery-offline');
  const content = document.getElementById('discovery-content');
  if (!loading || !offline || !content) return;

  const loadingActive = state === 'loading';
  const offlineActive = state === 'offline';
  const contentActive = state === 'content';

  loading.hidden = !loadingActive;
  offline.hidden = !offlineActive;
  content.hidden = !contentActive;

  loading.classList.toggle('is-hidden', !loadingActive);
  offline.classList.toggle('is-hidden', !offlineActive);
  content.classList.toggle('is-hidden', !contentActive);
}

function setDiscoveryOfflineMessage(message) {
  const offlineMessage = document.getElementById('discovery-offline-message');
  if (offlineMessage) {
    offlineMessage.textContent = message || 'Check your RAWG API key or network and try again.';
  }
}


function setCommunityUiState(state) {
  const loading = document.getElementById('community-loading');
  const list = document.getElementById('community-feed-list');
  const loadingMore = document.getElementById('community-loading-more');
  if (!loading || !list) return;
  const loadingActive = state === 'loading';
  loading.hidden = !loadingActive;
  list.hidden = loadingActive;
  loading.classList.toggle('is-hidden', !loadingActive);
  list.classList.toggle('is-hidden', loadingActive);
  if (loadingMore && loadingActive) {
    loadingMore.hidden = true;
    loadingMore.classList.add('is-hidden');
  }
}

function setCommunityMoreLoadingState(isLoading) {
  const loadingMore = document.getElementById('community-loading-more');
  if (!loadingMore) return;
  loadingMore.hidden = !isLoading;
  loadingMore.classList.toggle('is-hidden', !isLoading);
}

function resolveCommunityHasMore(res) {
  const explicit = res?.hasMore;
  if (typeof explicit === 'boolean' && explicit) return true;
  const count = Array.isArray(res?.articles) ? res.articles.length : 0;
  return count >= COMMUNITY_PAGE_SIZE;
}

function setupCommunityFeed() {
  const btn = document.getElementById('community-feed-more');
  if (!btn) return;
  btn.addEventListener('click', () => {
    void loadMoreCommunityNews();
  });
  setCommunityUiState('content');
  setCommunityMoreLoadingState(false);
  updateCommunityFeedMoreButton();
}

async function loadMoreCommunityNews() {
  if (state.communityFeedLoadingMore || !state.communityFeedHasMore) return;

  state.communityFeedLoadingMore = true;
  setCommunityMoreLoadingState(true);
  updateCommunityFeedMoreButton();
  const nextPage = state.communityFeedPage + 1;

  try {
    const res = await window.api.getCommunityNews?.({
      page: nextPage,
      pageSize: COMMUNITY_PAGE_SIZE,
    });

    if (res?.success && Array.isArray(res.articles) && res.articles.length > 0) {
      renderNewsFeed(res.articles, { append: true });
      state.communityFeedPage = nextPage;
      state.communityFeedHasMore = resolveCommunityHasMore(res);
      return;
    }

    state.communityFeedHasMore = false;
    if (res?.error) showToast(res.error, 'error');
  } catch (err) {
    state.communityFeedHasMore = false;
    showToast(err?.message || 'ERR_NEWS_API_FAIL', 'error');
  } finally {
    state.communityFeedLoadingMore = false;
    setCommunityMoreLoadingState(false);
    updateCommunityFeedMoreButton();
  }
}

async function loadCommunityNews(force = false) {
  if (state.communityLoaded && !force) return;
  state.communityFeedPage = 1;
  state.communityFeedHasMore = false;
  state.communityFeedLoadingMore = false;
  setCommunityUiState('loading');
  setCommunityMoreLoadingState(false);
  updateCommunityFeedMoreButton();

  try {
    const res = await window.api.getCommunityNews?.({
      page: state.communityFeedPage,
      pageSize: COMMUNITY_PAGE_SIZE,
    });
    if (res?.success && Array.isArray(res.articles) && res.articles.length > 0) {
      renderNewsFeed(res.articles);
      state.communityFeedHasMore = resolveCommunityHasMore(res);
    } else {
      renderNewsFeed(MOCK_COMMUNITY_ARTICLES);
      state.communityFeedHasMore = false;
      if (res?.error) showToast(res.error, 'error');
    }
  } catch (err) {
    showToast(err?.message || 'ERR_NEWS_API_FAIL', 'error');
    renderNewsFeed(MOCK_COMMUNITY_ARTICLES);
    state.communityFeedHasMore = false;
  } finally {
    state.communityLoaded = true;
    setCommunityUiState('content');
    updateCommunityFeedMoreButton();
  }
}

function formatBytesForCleaner(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatCleanerTimestamp(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleString();
}

function renderCleanerReport(report) {
  const totalSpaceEl = document.getElementById('cleaner-total-space');
  const totalFilesEl = document.getElementById('cleaner-total-files');
  const updatedAtEl = document.getElementById('cleaner-updated-at');
  const listEl = document.getElementById('cleaner-target-list');
  if (!totalSpaceEl || !totalFilesEl || !updatedAtEl || !listEl) return;

  const items = Array.isArray(report?.items) ? report.items : [];
  totalSpaceEl.textContent = formatBytesForCleaner(report?.totalBytes || 0);
  totalFilesEl.textContent = `${Number(report?.totalFiles || 0).toLocaleString()} files`;
  updatedAtEl.textContent = report?.scannedAt
    ? `Updated ${formatCleanerTimestamp(report.scannedAt)}`
    : 'Not scanned yet';

  if (items.length === 0) {
    listEl.innerHTML = '<div class="cleaner-empty">No cleanup targets available.</div>';
    return;
  }

  listEl.innerHTML = items.map((item) => `
    <article class="cleaner-target-item">
      <label class="cleaner-target-control">
        <input type="checkbox" class="cleaner-target-check" value="${escapeHtml(item.key)}" checked />
        <div class="cleaner-target-body">
          <div class="cleaner-target-title">${escapeHtml(item.label || item.key)}</div>
          <div class="cleaner-target-meta">
            ${Number(item.files || 0).toLocaleString()} files • ${formatBytesForCleaner(item.bytes || 0)} • ${Number(item.pathCount || 0)} location(s)
          </div>
          <div class="cleaner-target-desc">${escapeHtml(item.description || '')}</div>
        </div>
      </label>
    </article>
  `).join('');
}

function setCleanerBusy(isBusy) {
  const analyzeBtn = document.getElementById('btn-cleaner-analyze');
  const runBtn = document.getElementById('btn-cleaner-run');
  if (analyzeBtn) {
    analyzeBtn.disabled = isBusy;
    const label = analyzeBtn.querySelector('.cleaner-action-label');
    if (label) label.textContent = isBusy ? 'Working...' : 'Analyze';
  }
  if (runBtn) {
    runBtn.disabled = isBusy;
    const label = runBtn.querySelector('.cleaner-action-label');
    if (label) label.textContent = isBusy ? 'Cleaning...' : 'Clean Selected';
  }
}

async function refreshCleanerReport({ force = false } = {}) {
  if (cleanerState.loading) return;
  if (cleanerState.loaded && !force) return;

  cleanerState.loading = true;
  setCleanerBusy(true);
  try {
    const result = await window.api.getCleanupStats?.();
    if (!result?.success) {
      throw new Error(resolveErrorText(result?.error || 'ERR_CLEANUP_FAIL'));
    }
    cleanerState.report = result.report || { scannedAt: Date.now(), totalBytes: 0, totalFiles: 0, items: [] };
    cleanerState.loaded = true;
    renderCleanerReport(cleanerState.report);
  } catch (error) {
    showToast(error?.message || 'ERR_CLEANUP_FAIL', 'error');
  } finally {
    cleanerState.loading = false;
    setCleanerBusy(false);
  }
}

async function runCleanerNow() {
  const checks = Array.from(document.querySelectorAll('.cleaner-target-check:checked'));
  const targetKeys = checks.map((item) => item.value).filter(Boolean);
  if (targetKeys.length === 0) {
    showToast('Select at least one cleanup target', 'error');
    return;
  }

  cleanerState.loading = true;
  setCleanerBusy(true);
  try {
    const result = await window.api.runCleanup?.({ targets: targetKeys });
    if (!result?.success) {
      throw new Error(resolveErrorText(result?.error || 'ERR_CLEANUP_FAIL'));
    }

    cleanerState.report = result.report || cleanerState.report;
    cleanerState.loaded = true;
    if (cleanerState.report) renderCleanerReport(cleanerState.report);

    const cleanedCount = Array.isArray(result.cleanedTargets) ? result.cleanedTargets.length : 0;
    const selectedCount = Array.isArray(result.selectedTargets) ? result.selectedTargets.length : targetKeys.length;
    const summary = cleanedCount > 0
      ? `Cleaned ${cleanedCount} target(s): ${formatBytesForCleaner(result.freedBytes || 0)} freed`
      : 'No removable files found (some files may be in use)';
    const resultCard = document.getElementById('cleaner-result-card');
    const resultText = document.getElementById('cleaner-result-text');
    if (resultCard) resultCard.hidden = false;
    if (resultText) {
      resultText.textContent = `${summary}. Selected ${Number(selectedCount || 0)} target(s), removed ${Number(result.removedFiles || 0).toLocaleString()} files.`;
    }
    showToast(summary, cleanedCount > 0 ? 'success' : 'error');
  } catch (error) {
    showToast(error?.message || 'ERR_CLEANUP_FAIL', 'error');
  } finally {
    cleanerState.loading = false;
    setCleanerBusy(false);
  }
}

function setupCleaner() {
  const analyzeBtn = document.getElementById('btn-cleaner-analyze');
  const runBtn = document.getElementById('btn-cleaner-run');
  const listEl = document.getElementById('cleaner-target-list');

  if (listEl) {
    listEl.innerHTML = '<div class="cleaner-empty">Run Analyze to scan reclaimable files.</div>';
  }

  analyzeBtn?.addEventListener('click', () => {
    cleanerState.loaded = false;
    void refreshCleanerReport({ force: true });
  });
  runBtn?.addEventListener('click', () => {
    void runCleanerNow();
  });
}

async function loadDiscovery(forceRefresh = false) {
  if (state.discoveryLoading) return;
  if (state.discoveryLoaded && !forceRefresh) {
    setDiscoveryRefreshButtonState(false);
    return;
  }

  const cached = readDiscoveryCache();
  if (forceRefresh) {
    setDiscoveryUiState('loading');
  } else if (cached?.data) {
    renderGameCards(cached.data);
    setDiscoveryUiState('content');
  } else {
    setDiscoveryUiState('loading');
  }

  state.discoveryLoading = true;
  setDiscoveryRefreshButtonState(true);

  try {
    const data = await fetchDiscoveryGames({ forceNetwork: forceRefresh });
    renderGameCards(data);
    setDiscoveryUiState('content');
    setDiscoveryOfflineMessage('');
    state.discoveryLoaded = true;
  } catch (err) {
    const msg = resolveErrorText(err?.message || err || 'ERR_RAWG_API_FAIL', true);
    setDiscoveryOfflineMessage(msg);
    setDiscoveryUiState('offline');
  } finally {
    state.discoveryLoading = false;
    setDiscoveryRefreshButtonState(false);
  }
}


function setupSearch() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderGames();
  });
}

function syncGameCategorySelect(preferredCategory = '') {
  const select = document.getElementById('game-category');
  if (!select) return;

  const categories = Array.isArray(state.appData.categories) ? [...state.appData.categories] : [];
  if (!categories.includes('Other')) categories.push('Other');

  const normalizedPreferred = String(preferredCategory || '').trim();
  if (normalizedPreferred && !categories.includes(normalizedPreferred)) {
    categories.push(normalizedPreferred);
  }

  const previous = normalizedPreferred || select.value;
  select.textContent = '';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  const fallback = categories.includes('FPS')
    ? 'FPS'
    : (categories.includes('Other') ? 'Other' : categories[0]);
  select.value = categories.includes(previous) ? previous : fallback;
}

function requestCategoryNameDialog(initialValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal" style="width:min(420px,100%);">
        <div class="modal-header">
          <h2>Add Category</h2>
          <button class="modal-close" type="button" aria-label="Close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-field">
            <label for="new-category-name">Category Name</label>
            <input id="new-category-name" type="text" maxlength="32" placeholder="e.g. Adventure" />
          </div>
        </div>
        <div class="modal-footer">
          <div class="modal-actions">
            <button type="button" class="btn-secondary js-category-cancel">Cancel</button>
            <button type="button" class="btn-primary js-category-save">Add</button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('.js-category-cancel');
    const saveBtn = overlay.querySelector('.js-category-save');
    const input = overlay.querySelector('#new-category-name');

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };

    const close = (value = null) => {
      cleanup();
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
      if (event.key === 'Enter' && document.activeElement === input) {
        event.preventDefault();
        close(input.value);
      }
    };

    closeBtn?.addEventListener('click', () => close(null));
    cancelBtn?.addEventListener('click', () => close(null));
    saveBtn?.addEventListener('click', () => close(input.value));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    input.value = String(initialValue || '');
    input.focus();
    input.select();
  });
}

function setupCategories() {
  const addBtn = document.getElementById('btn-add-category');
  if (addBtn) {
    addBtn.onclick = async () => {
      const input = await requestCategoryNameDialog();
      if (!input) return;

      const normalized = String(input).trim().replace(/\s+/g, ' ').slice(0, 32);
      if (!normalized || normalized.toLowerCase() === 'all') {
        showToast('Invalid category name', 'error');
        return;
      }

      const existing = Array.isArray(state.appData.categories)
        && state.appData.categories.some((category) => category.toLowerCase() === normalized.toLowerCase());
      if (existing) {
        showToast('Category already exists', 'error');
        return;
      }

      let added = false;
      const result = await state.addCategory(normalized);
      if (result?.success && result?.added === false) {
        showToast('Category already exists', 'error');
        return;
      }

      if (result?.success && result?.added === true) {
        added = true;
      } else if (!result?.success) {
        // Fallback: use renderer save path to recover from transient helper-save failures.
        const previous = [...(state.appData.categories || [])];
        state.appData.categories = [...previous, normalized];
        const saved = await save();
        if (!saved) {
          state.appData.categories = previous;
          showToast(result?.error || 'Could not add category', 'error');
          return;
        }
        added = true;
      }

      if (window.api?.getData) {
        try {
          state.appData = await window.api.getData();
        } catch {
          // keep local state when refresh fails
        }
      }

      const existsAfterSync = Array.isArray(state.appData.categories)
        && state.appData.categories.some((category) => category.toLowerCase() === normalized.toLowerCase());
      if (!existsAfterSync) {
        showToast('Category could not be added', 'error');
        return;
      }

      if (!added) {
        showToast('Category could not be added', 'error');
        return;
      }

      renderCategories();
      syncGameCategorySelect(normalized);
      renderGames();
      showToast('Category added', 'success');
    };
  }
  syncGameCategorySelect();
}

function toggleGameSelection(id) {
  const gameId = Number(id);
  if (!Number.isFinite(gameId)) return;
  if (state.selectedGameIds.has(gameId)) state.selectedGameIds.delete(gameId);
  else state.selectedGameIds.add(gameId);
  renderGames();
  if (state.selectedGameIds.size > 0) showDeleteBar();
  else hideDeleteBar();
}

function deselectGame(id = null) {
  if (id === null || id === undefined) {
    state.selectedGameIds = new Set();
  } else {
    const gameId = Number(id);
    if (!Number.isFinite(gameId)) return;
    state.selectedGameIds.delete(gameId);
  }
  renderGames();
  if (state.selectedGameIds.size === 0) hideDeleteBar();
  else showDeleteBar();
}

function showDeleteBar() {
  const bindDeleteBarHandlers = (container) => {
    if (!container || container.dataset.handlersBound === 'true') return;

    const removeBtn = container.querySelector('#delete-bar-btn');
    const cancelBtn = container.querySelector('#delete-bar-cancel');
    if (!removeBtn || !cancelBtn) return;

    removeBtn.type = 'button';
    cancelBtn.type = 'button';

    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ids = [...state.selectedGameIds];
      if (ids.length === 0) return;

      const selectedGames = state.appData.games.filter((g) => state.selectedGameIds.has(g.id));
      const prompt = selectedGames.length === 1
        ? `Remove "${selectedGames[0].name}" from GameDock?`
        : `Remove ${selectedGames.length} games from GameDock?`;

      if (confirm(prompt)) {
        await deleteGames(ids);
        deselectGame();
      }
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deselectGame();
    });

    container.dataset.handlersBound = 'true';
  };

  let bar = document.getElementById('delete-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'delete-bar';

    const name = document.createElement('span');
    name.id = 'delete-bar-name';
    bar.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.id = 'delete-bar-btn';
    removeBtn.textContent = 'Remove Selected';
    bar.appendChild(removeBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'delete-bar-cancel';
    cancelBtn.textContent = 'Cancel';
    bar.appendChild(cancelBtn);

    const bottomBar = document.querySelector('.bottom-bar');
    bottomBar.parentNode.insertBefore(bar, bottomBar);
  }

  bindDeleteBarHandlers(bar);

  const selectedGames = state.appData.games.filter((g) => state.selectedGameIds.has(g.id));
  const title = selectedGames.length === 1
    ? selectedGames[0].name
    : `${selectedGames.length} games selected`;
  document.getElementById('delete-bar-name').textContent = title;
  bar.classList.add('visible');
}

function hideDeleteBar() {
  const bar = document.getElementById('delete-bar');
  if (bar) bar.classList.remove('visible');
}

function setupSortMode() {
  const trigger = document.getElementById('sort-trigger');
  const menu = document.getElementById('sort-menu');
  const label = document.getElementById('sort-label');
  if (!trigger || !menu || !label) return;

  const options = Array.from(menu.querySelectorAll('.sort-option[data-sort]'));
  if (options.length === 0) return;

  const validModes = new Set(options.map((option) => option.dataset.sort));
  if (!validModes.has(state.sortMode)) {
    state.sortMode = 'lastPlayed';
  }

  const syncSortUi = () => {
    let activeOption = null;
    options.forEach((option) => {
      const isActive = option.dataset.sort === state.sortMode;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-selected', String(isActive));
      if (isActive) activeOption = option;
    });
    const nextLabel = activeOption?.textContent?.trim() || 'Last Played';
    label.textContent = nextLabel;
    trigger.title = `Sort: ${nextLabel}`;
    trigger.setAttribute('aria-label', `Sort games: ${nextLabel}`);
  };

  const closeMenu = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const activeOption = options.find((option) => option.dataset.sort === state.sortMode);
    activeOption?.focus();
  };

  syncSortUi();
  closeMenu();

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (menu.hidden) openMenu();
  });

  options.forEach((option) => {
    option.addEventListener('click', (event) => {
      event.stopPropagation();
      const nextMode = option.dataset.sort;
      if (!validModes.has(nextMode)) return;
      state.sortMode = nextMode;
      syncSortUi();
      closeMenu();
      trigger.focus();
      renderGames();
    });
  });

  document.addEventListener('click', (event) => {
    if (menu.hidden) return;
    if (event.target.closest('#sidebar-sort')) return;
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      trigger.focus();
      return;
    }

    if (menu.hidden) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const activeIndex = options.findIndex((option) => option.dataset.sort === state.sortMode);
    if (activeIndex < 0) return;

    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (activeIndex + delta + options.length) % options.length;
    const nextOption = options[nextIndex];
    if (!nextOption) return;

    state.sortMode = nextOption.dataset.sort;
    syncSortUi();
    renderGames();
    nextOption.focus();
  });
}

function getPlaytimeMinutes(game) {
  return Number(game.totalPlayTime || game.playtimeMinutes || 0);
}

function formatPlaytime(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  if (safe < 60) return `${safe}m played`;
  return `${(safe / 60).toFixed(1)}h played`;
}

function toFileUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return encodeURI(`file:///${normalized}`);
}

function resolveErrorText(errorLike, includeTroubleshooting = false) {
  if (!errorLike) return 'Unknown error';

  if (typeof errorLike === 'string') {
    const known = state.errorMap[errorLike];
    if (!known) return errorLike;
    if (includeTroubleshooting && known.troubleshooting) {
      return `${known.message} ${known.troubleshooting}`;
    }
    return known.message;
  }

  if (typeof errorLike === 'object') {
    const known = errorLike.code ? state.errorMap[errorLike.code] : null;
    const baseMessage = known?.message || errorLike.message || errorLike.code || 'Unknown error';
    const troubleshooting = known?.troubleshooting || errorLike.troubleshooting;
    if (includeTroubleshooting && troubleshooting) {
      return `${baseMessage} ${troubleshooting}`;
    }
    return baseMessage;
  }

  return String(errorLike);
}

function setupGameContextMenu() {
  const menu = document.getElementById('game-context-menu');
  if (!menu) return;

  menu.addEventListener('click', async (event) => {
    try {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const gameId = Number(state.contextMenuGameId);
      const game = state.appData.games.find((g) => g.id === gameId);
      hideGameContextMenu();
      if (!game) return;

      if (action === 'edit') {
        openEditModal(game.id);
        return;
      }

      if (action === 'set-cover-file') {
        const filePath = await window.api.pickCoverFile?.();
        if (!filePath) return;
        const result = await window.api.setCustomCoverFile(game.id, filePath);
        if (!result?.success) {
          showToast(result?.error || 'ERR_IMAGE_INVALID', 'error');
          return;
        }
        state.appData = await window.api.getData();
        renderGames();
        showToast('Custom cover updated', 'success');
        return;
      }

      if (action === 'set-cover-url') {
        const url = prompt('Paste image URL:');
        if (!url) return;
        const result = await window.api.setCustomCoverUrl(game.id, url.trim());
        if (!result?.success) {
          showToast(result?.error || 'ERR_IMAGE_DOWNLOAD_FAIL', 'error');
          return;
        }
        state.appData = await window.api.getData();
        renderGames();
        showToast('Custom cover updated', 'success');
        return;
      }

      if (action === 'reset-cover') {
        const result = await window.api.resetCustomCover(game.id);
        if (!result?.success) {
          showToast(result?.error || 'ERR_UNKNOWN', 'error');
          return;
        }
        state.appData = await window.api.getData();
        renderGames();
        showToast('Cover reset', 'success');
        return;
      }

      if (action === 'toggle-select') {
        toggleGameSelection(game.id);
      }
    } catch (error) {
      console.error('Context menu action failed:', error);
      showToast(error?.message || 'ERR_UNKNOWN', 'error');
    }
  });
}

function showGameContextMenu(gameId, x, y) {
  const menu = document.getElementById('game-context-menu');
  if (!menu) return;
  state.contextMenuGameId = gameId;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'grid';
}

function hideGameContextMenu() {
  const menu = document.getElementById('game-context-menu');
  if (!menu) return;
  menu.style.display = 'none';
  state.contextMenuGameId = null;
}

function gameSort(a, b) {
  const favoriteDelta = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
  if (favoriteDelta !== 0) return favoriteDelta;

  if (state.sortMode === 'manual') {
    const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.addedAt || 0) - (b.addedAt || 0);
  }

  if (state.sortMode === 'name') {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }

  if (state.sortMode === 'playtime') {
    return getPlaytimeMinutes(b) - getPlaytimeMinutes(a);
  }

  return (b.lastPlayed || 0) - (a.lastPlayed || 0);
}


async function launchGame(game) {
  if (state.selectedGameIds.size > 0) return;
  try {
    showToast(`Launching ${game.name}...`, 'success');
    const result = await window.api.launchGame(game);

    if (result.success) {
      state.appData = await window.api.getData();
      renderGames();
    } else {
      showToast(result.error || 'ERR_UNKNOWN', 'error');
    }
  } catch (error) {
    showToast(error?.message || 'ERR_UNKNOWN', 'error');
  }
}

async function deleteGame(id) {
  await deleteGames([id]);
}

async function deleteGames(ids) {
  const uniqueIds = new Set((ids || []).map(Number).filter(Number.isFinite));
  if (uniqueIds.size === 0) return;

  const before = state.appData.games.length;
  state.appData.games = state.appData.games.filter((g) => !uniqueIds.has(g.id));
  const removedCount = before - state.appData.games.length;
  if (removedCount <= 0) return;

  if (state.sortMode === 'manual') {
    state.appData.games
      .sort((a, b) => gameSort(a, b))
      .forEach((game, idx) => {
        game.sortOrder = idx;
      });
  }

  uniqueIds.forEach((id) => state.selectedGameIds.delete(id));
  await save();
  renderGames();
  showToast(removedCount === 1 ? 'Game removed' : `${removedCount} games removed`, 'success');
}

async function addDetectedSteamGames() {
  try {
    showToast('Scanning Steam libraries...', 'success');
    const result = await window.api.detectSteamGames();
    if (!result.success) {
      showToast(result.error || 'ERR_STEAM_DETECT_FAIL', 'error');
      return;
    }

    state.steamDetectCandidates = (result.games || []).map((game) => ({
      ...game,
      selected: true,
    }));

    if (state.steamDetectCandidates.length === 0) {
      showToast('No new Steam games found', 'error');
      return;
    }

    openSteamImportWizard();
    renderSteamImportList();
  } catch (error) {
    showToast(error?.message || 'ERR_STEAM_DETECT_FAIL', 'error');
  }
}

function setupSteamImportWizard() {
  const close = () => closeSteamImportWizard();
  const overlay = document.getElementById('steam-import-overlay');
  if (!overlay) return;

  document.getElementById('steam-import-close')?.addEventListener('click', close);
  document.getElementById('steam-import-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.getElementById('steam-select-all')?.addEventListener('click', () => {
    state.steamDetectCandidates.forEach((g) => { g.selected = true; });
    renderSteamImportList();
  });

  document.getElementById('steam-select-none')?.addEventListener('click', () => {
    state.steamDetectCandidates.forEach((g) => { g.selected = false; });
    renderSteamImportList();
  });

  document.getElementById('steam-import-confirm')?.addEventListener('click', async () => {
    const selected = state.steamDetectCandidates.filter((g) => g.selected);
    if (selected.length === 0) {
      showToast('Select at least one game to import', 'error');
      return;
    }

    const res = await window.api.importSteamGames({ games: selected });
    if (!res?.success) {
      showToast(res?.error || 'ERR_STEAM_DETECT_FAIL', 'error');
      return;
    }

    state.appData = await window.api.getData();
    if (state.sortMode === 'favoritesOnly') {
      state.sortMode = 'lastPlayed';
    }
    renderGames();
    closeSteamImportWizard();
    showToast(`Imported ${res.added || 0} game(s), skipped ${res.skipped || 0}`, 'success');
  });
}

function openSteamImportWizard() {
  const overlay = document.getElementById('steam-import-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeSteamImportWizard() {
  const overlay = document.getElementById('steam-import-overlay');
  if (overlay) overlay.style.display = 'none';
}

function openEditModal(gameId) {
  const game = state.appData.games.find((g) => g.id === Number(gameId));
  if (!game) {
    showToast('ERR_GAME_NOT_FOUND', 'error');
    return;
  }

  const modal = document.querySelector('.modal');
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const confirmBtn = document.getElementById('btn-confirm-add');
  const detectSteamBtn = document.getElementById('btn-detect-steam');

  modal.dataset.editingId = String(game.id);
  title.textContent = 'Edit Game';
  confirmBtn.textContent = 'Save Changes';
  if (detectSteamBtn) {
    detectSteamBtn.hidden = true;
    detectSteamBtn.disabled = true;
    detectSteamBtn.style.display = 'none';
  }

  document.getElementById('game-name').value = game.name || '';
  document.getElementById('game-path').value = game.path || '';
  syncGameCategorySelect(game.category || 'Other');
  document.getElementById('game-args').value = game.launchArgs || '';
  document.getElementById('game-working-dir').value = game.workingDir || '';

  const advancedOptions = document.getElementById('advanced-options');
  advancedOptions.classList.add('hidden');
  document.getElementById('btn-toggle-advanced').textContent = 'Show Advanced';

  overlay.style.display = 'flex';
}

function setupAddGame() {
  const modal = document.querySelector('.modal');
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const confirmBtn = document.getElementById('btn-confirm-add');
  const detectSteamBtn = document.getElementById('btn-detect-steam');
  const advancedOptions = document.getElementById('advanced-options');
  const toggleAdvancedBtn = document.getElementById('btn-toggle-advanced');

  const setAdvancedVisible = (visible) => {
    advancedOptions.classList.toggle('hidden', !visible);
    toggleAdvancedBtn.textContent = visible ? 'Hide Advanced' : 'Show Advanced';
  };

  const closeModal = () => {
    overlay.style.display = 'none';
    modal.dataset.editingId = '';
    modalTitle.textContent = 'Add Game';
    confirmBtn.textContent = 'Add Game';
    if (detectSteamBtn) {
      detectSteamBtn.hidden = false;
      detectSteamBtn.disabled = false;
      detectSteamBtn.style.removeProperty('display');
    }
  };

  toggleAdvancedBtn.onclick = () => {
    const isHidden = advancedOptions.classList.contains('hidden');
    setAdvancedVisible(isHidden);
  };

  document.getElementById('btn-add-game').onclick = () => {
    modal.dataset.editingId = '';
    modalTitle.textContent = 'Add Game';
    confirmBtn.textContent = 'Add Game';
    if (detectSteamBtn) {
      detectSteamBtn.hidden = false;
      detectSteamBtn.disabled = false;
      detectSteamBtn.style.removeProperty('display');
    }
    document.getElementById('game-name').value = '';
    document.getElementById('game-path').value = '';
    syncGameCategorySelect('FPS');
    document.getElementById('game-args').value = '';
    document.getElementById('game-working-dir').value = '';
    setAdvancedVisible(false);
    overlay.style.display = 'flex';
  };

  document.getElementById('btn-browse').onclick = async () => {
    const filePath = await window.api.browseGame();
    if (!filePath) return;
    document.getElementById('game-path').value = filePath;

    if (!document.getElementById('game-name').value) {
      const name = filePath
        .split('\\')
        .pop()
        .replace(/\.exe$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      document.getElementById('game-name').value = name;
    }

    if (!document.getElementById('game-working-dir').value) {
      const split = filePath.split('\\');
      split.pop();
      document.getElementById('game-working-dir').value = split.join('\\');
    }
  };

  document.getElementById('btn-detect-steam').onclick = async () => {
    await addDetectedSteamGames();
  };

  confirmBtn.onclick = async () => {
    const editId = Number(modal.dataset.editingId || 0);
    const isEditing = Number.isFinite(editId) && editId > 0;
    const name = document.getElementById('game-name').value.trim();
    const gamePath = document.getElementById('game-path').value.trim();
    const category = document.getElementById('game-category').value;
    const launchArgs = document.getElementById('game-args').value.trim();
    const workingDir = document.getElementById('game-working-dir').value.trim();

    if (!name) {
      showToast('Enter a game name', 'error');
      return;
    }
    if (!gamePath || !/\.exe$/i.test(gamePath)) {
      showToast('Select a valid .exe', 'error');
      return;
    }
    if (gamePath.startsWith('\\\\')) {
      showToast('ERR_BLOCKED_PATH', 'error');
      return;
    }

    if (isEditing) {
      const result = await window.api.updateGame({
        id: editId,
        name,
        path: gamePath,
        category,
        launchArgs,
        workingDir,
      });
      if (!result?.success) {
        showToast(result?.error || 'ERR_UNKNOWN', 'error');
        return;
      }
      state.appData = await window.api.getData();
      renderGames();
      closeModal();
      showSaveActionPopup(`${name} updated`, 'success');
      return;
    }

    showToast('Fetching icon...', 'success');
    const icon = await window.api.getGameIcon(gamePath);
    const maxId = state.appData.games.reduce((max, g) => Math.max(max, Number(g.id) || 0), 0);
    const maxSort = state.appData.games.reduce((max, g) => Math.max(max, Number(g.sortOrder) || 0), -1);

    const game = {
      id: maxId + 1,
      name,
      path: gamePath,
      category,
      icon: icon || null,
      addedAt: Date.now(),
      lastPlayed: null,
      playtimeMinutes: 0,
      totalPlayTime: 0,
      sessionHistory: [],
      launchCount: 0,
      favorite: false,
      pinOrder: 0,
      sortOrder: maxSort + 1,
      launchArgs,
      workingDir,
      coverPath: null,
      logoPath: null,
      steamAppId: null,
    };

    state.appData.games.push(game);
    await save();
    renderGames();
    closeModal();
    showToast(`${name} added`, 'success');
  };

  document.getElementById('btn-cancel-add').onclick = closeModal;
  document.getElementById('modal-close-btn').onclick = closeModal;
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function setupSettings() {
  state.appData.settings = state.appData.settings || {};
  const s = state.appData.settings;
  const alwaysOnTopEl = document.getElementById('set-always-on-top');
  const autoStartEl = document.getElementById('set-auto-start');
  const minimizeTrayEl = document.getElementById('set-minimize-tray');
  const launchNotificationsEl = document.getElementById('set-launch-notifications');
  const simplifiedCardsEl = document.getElementById('set-simplified-cards');
  const appVersionEl = document.getElementById('set-app-version');

  if (alwaysOnTopEl) alwaysOnTopEl.checked = Boolean(s.alwaysOnTop);
  if (autoStartEl) autoStartEl.checked = Boolean(s.autoStart);
  if (minimizeTrayEl) minimizeTrayEl.checked = s.minimizeToTray !== false;
  if (launchNotificationsEl) launchNotificationsEl.checked = s.launchNotifications !== false;
  if (simplifiedCardsEl) simplifiedCardsEl.checked = Boolean(s.simplifiedLibraryCards);

  window.api.getAppInfo()
    .then((info) => {
      if (appVersionEl) appVersionEl.textContent = `${info.name} ${info.version}`;
    })
    .catch(() => {
      if (appVersionEl) appVersionEl.textContent = 'Unavailable';
    });

  document.getElementById('btn-save-settings').onclick = async () => {
    const saveBtn = document.getElementById('btn-save-settings');
    const alwaysOnTop = document.getElementById('set-always-on-top').checked;
    const autoStart = document.getElementById('set-auto-start').checked;
    const minimizeTray = document.getElementById('set-minimize-tray').checked;
    const launchNotifications = document.getElementById('set-launch-notifications').checked;
    const simplifiedCards = document.getElementById('set-simplified-cards').checked;

    state.appData.settings = state.appData.settings || {};
    state.appData.settings.alwaysOnTop = alwaysOnTop;
    state.appData.settings.autoStart = autoStart;
    state.appData.settings.minimizeToTray = minimizeTray;
    state.appData.settings.launchNotifications = launchNotifications;
    state.appData.settings.simplifiedLibraryCards = simplifiedCards;
    state.appData.settings.boosterEnabled = false;
    state.appData.settings.boosterTargets = [];
    state.appData.settings.boosterForceKill = false;
    state.appData.settings.boosterRestoreOnExit = true;

    try {
      if (saveBtn) saveBtn.disabled = true;

      const topRes = await window.api.toggleAlwaysOnTop(alwaysOnTop);
      if (topRes && typeof topRes === 'object' && topRes.success === false) {
        throw new Error(topRes.error || 'ERR_UNKNOWN');
      }

      const autoStartRes = await window.api.toggleAutoStart(autoStart);
      if (autoStartRes && typeof autoStartRes === 'object' && autoStartRes.success === false) {
        throw new Error(autoStartRes.error || 'ERR_UNKNOWN');
      }

      const saved = await save();
      if (!saved) throw new Error('ERR_UNKNOWN');

      renderGames();
      showSaveActionPopup('Settings saved', 'success');
    } catch (err) {
      showToast(err?.message || 'ERR_UNKNOWN', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  document.getElementById('btn-export-backup').onclick = async () => {
    const res = await window.api.exportData();
    if (res.success) showToast('Backup exported', 'success');
    else if (!res.canceled) showToast(res.error || 'ERR_EXPORT_FAIL', 'error');
  };

  document.getElementById('btn-import-backup').onclick = async () => {
    const res = await window.api.importData();
    if (res.success) {
      state.appData = res.data || (await window.api.getData());
      if (alwaysOnTopEl) alwaysOnTopEl.checked = Boolean(state.appData.settings?.alwaysOnTop);
      if (autoStartEl) autoStartEl.checked = Boolean(state.appData.settings?.autoStart);
      if (minimizeTrayEl) minimizeTrayEl.checked = state.appData.settings?.minimizeToTray !== false;
      if (launchNotificationsEl) launchNotificationsEl.checked = state.appData.settings?.launchNotifications !== false;
      if (simplifiedCardsEl) simplifiedCardsEl.checked = Boolean(state.appData.settings?.simplifiedLibraryCards);
      renderCategories();
      syncGameCategorySelect();
      renderGames();
      showToast('Backup imported', 'success');
    } else if (!res.canceled) {
      showToast(res.error || 'ERR_IMPORT_FAIL', 'error');
    }
  };
}

async function save() {
  try {
    return Boolean(await window.api.saveData(state.appData));
  } catch (error) {
    console.error('Save failed:', error);
    return false;
  }
}


function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    console.error('Renderer runtime error:', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Renderer unhandled rejection:', event.reason);
    showToast(event?.reason?.message || event?.reason || 'ERR_UNKNOWN', 'error');
  });
}

configureUI({
  onToggleGameSelection: toggleGameSelection,
  onLaunchGame: launchGame,
  onOpenEditModal: openEditModal,
  onDeleteGame: deleteGame,
  onShowGameContextMenu: showGameContextMenu,
  onCategoriesChanged: () => {
    syncGameCategorySelect();
  },
  resolveErrorText,
});

installGlobalErrorHandlers();
void init().catch((error) => {
  console.error('Renderer initialization failed:', error);
  showToast(error?.message || 'ERR_UNKNOWN', 'error');
});



