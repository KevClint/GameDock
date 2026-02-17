let appData = { games: [], settings: { autoStart: false, minimizeToTray: true } };
let activeCategory = 'all';
let searchQuery = '';
let selectedGameIds = new Set();
let activeView = 'library';
let errorMap = {};
let sortMode = localStorage.getItem('gamedock.sort.mode') || 'lastPlayed';
let contextMenuGameId = null;
let steamDetectCandidates = [];

const CARD_LAUNCH_GUARD_MS = 300;

let discoveryLoaded = false;
let discoveryLoading = false;
const DISCOVERY_CACHE_KEY = 'gamedock.discovery.cache.v1';
const DISCOVERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const discoveryEntryTimers = new Set();
let communityLoaded = false;
let communityFeedPage = 1;
let communityFeedHasMore = false;
let communityFeedLoadingMore = false;
const COMMUNITY_PAGE_SIZE = 12; 

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
  appData = (await window.api.getData()) || appData;
  errorMap = (await window.api.getErrorMap?.()) || {};
  setupTitleBar();
  setupSearch();
  setupCategories();
  setupSortMode();
  setupNavigation();
  setupDiscovery();
  setupCommunityFeed();
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
      const previousView = activeView;
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
  activeView = viewName;
  const viewMap = {
    library: 'view-library',
    discover: 'view-discovery',
    community: 'view-community',
    settings: 'view-settings',
  };

  const titleMap = {
    library: 'Library',
    discover: 'Discovery',
    community: 'Community',
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

  if (viewName !== 'library') hideDeleteBar();
  if (viewName === 'discover') void loadDiscovery(false);
  if (viewName === 'community') void loadCommunityNews(false);
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
    ? game.genres.map((g) => g?.name).filter(Boolean)
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

  const result = await window.api.openExternalUrl?.(target);
  if (!result?.success) {
    showToast(result?.error || 'ERR_UNKNOWN', 'error');
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
          if (activeView === 'discover') renderGameCards(freshData);
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
        discoveryEntryTimers.delete(timer);
      }, index * 18);
      discoveryEntryTimers.add(timer);
    });
  });
}

function clearDiscoveryEntryTimers() {
  discoveryEntryTimers.forEach((timer) => clearTimeout(timer));
  discoveryEntryTimers.clear();
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
  discoveryLoaded = false;
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

function formatPublishedAgo(isoDate) {
  const ts = Date.parse(isoDate || '');
  if (!Number.isFinite(ts)) return 'just now';
  const mins = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizeArticle(article) {
  return {
    source: article?.source || 'Gaming News',
    title: article?.title || 'Untitled',
    snippet: article?.snippet || 'No summary available.',
    url: article?.url || '#',
    publishedAt: article?.publishedAt || new Date().toISOString(),
  };
}

function resolveCommunityHasMore(res) {
  const explicit = res?.hasMore;
  if (typeof explicit === 'boolean' && explicit) return true;
  const count = Array.isArray(res?.articles) ? res.articles.length : 0;
  return count >= COMMUNITY_PAGE_SIZE;
}

function createFeedCard(article) {
  const a = normalizeArticle(article);
  const card = document.createElement('article');
  card.className = 'feed-card';
  card.innerHTML = `
    <div class="feed-source">${escapeHtml(a.source)} | ${escapeHtml(formatPublishedAgo(a.publishedAt))}</div>
    <div class="feed-title">${escapeHtml(a.title)}</div>
    <p class="feed-snippet">${escapeHtml(a.snippet)}</p>
    <div class="feed-actions">
      <a class="feed-read" href="${escapeHtml(a.url)}" target="_blank" rel="noreferrer noopener">Read More</a>
      <button class="feed-share" type="button" title="Share">
        <span class="material-symbols-outlined">share</span>
      </button>
    </div>
  `;

  const readMoreLink = card.querySelector('.feed-read');
  if (readMoreLink) {
    readMoreLink.addEventListener('click', async (event) => {
      event.preventDefault();
      const result = await window.api.openExternalUrl?.(a.url);
      if (!result?.success) {
        showToast(result?.error || 'ERR_UNKNOWN', 'error');
      }
    });
  }

  const shareBtn = card.querySelector('.feed-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(a.url);
        showSaveActionPopup('Link copied', 'success');
      } catch {
        showSaveActionPopup('Could not copy link', 'error');
      }
    });
  }

  return card;
}

function renderNewsFeed(articles, options = {}) {
  const { append = false } = options;
  const list = document.getElementById('community-feed-list');
  if (!list) return;
  if (!append) list.textContent = '';

  const normalized = (articles || []).map(normalizeArticle);
  if (!append && normalized.length === 0) {
    const empty = document.createElement('article');
    empty.className = 'feed-card';
    empty.innerHTML = `
      <div class="feed-source">Community</div>
      <div class="feed-title">No news available</div>
      <p class="feed-snippet">Try again in a moment. Feed sources may be temporarily unavailable.</p>
    `;
    list.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  normalized.forEach((a) => {
    frag.appendChild(createFeedCard(a));
  });
  list.appendChild(frag);
}

function updateCommunityFeedMoreButton() {
  const btn = document.getElementById('community-feed-more');
  if (!btn) return;

  if (communityFeedLoadingMore) {
    btn.hidden = false;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    return;
  }

  btn.textContent = 'Show More';
  btn.disabled = false;
  btn.hidden = !communityFeedHasMore;
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
  if (communityFeedLoadingMore || !communityFeedHasMore) return;

  communityFeedLoadingMore = true;
  setCommunityMoreLoadingState(true);
  updateCommunityFeedMoreButton();
  const nextPage = communityFeedPage + 1;

  try {
    const res = await window.api.getCommunityNews?.({
      page: nextPage,
      pageSize: COMMUNITY_PAGE_SIZE,
    });

    if (res?.success && Array.isArray(res.articles) && res.articles.length > 0) {
      renderNewsFeed(res.articles, { append: true });
      communityFeedPage = nextPage;
      communityFeedHasMore = resolveCommunityHasMore(res);
      return;
    }

    communityFeedHasMore = false;
    if (res?.error) showToast(res.error, 'error');
  } catch (err) {
    communityFeedHasMore = false;
    showToast(err?.message || 'ERR_NEWS_API_FAIL', 'error');
  } finally {
    communityFeedLoadingMore = false;
    setCommunityMoreLoadingState(false);
    updateCommunityFeedMoreButton();
  }
}

async function loadCommunityNews(force = false) {
  if (communityLoaded && !force) return;
  communityFeedPage = 1;
  communityFeedHasMore = false;
  communityFeedLoadingMore = false;
  setCommunityUiState('loading');
  setCommunityMoreLoadingState(false);
  updateCommunityFeedMoreButton();

  try {
    const res = await window.api.getCommunityNews?.({
      page: communityFeedPage,
      pageSize: COMMUNITY_PAGE_SIZE,
    });
    if (res?.success && Array.isArray(res.articles) && res.articles.length > 0) {
      renderNewsFeed(res.articles);
      communityFeedHasMore = resolveCommunityHasMore(res);
    } else {
      renderNewsFeed(MOCK_COMMUNITY_ARTICLES);
      communityFeedHasMore = false;
      if (res?.error) showToast(res.error, 'error');
    }
  } catch (err) {
    showToast(err?.message || 'ERR_NEWS_API_FAIL', 'error');
    renderNewsFeed(MOCK_COMMUNITY_ARTICLES);
    communityFeedHasMore = false;
  } finally {
    communityLoaded = true;
    setCommunityUiState('content');
    updateCommunityFeedMoreButton();
  }
}

async function loadDiscovery(forceRefresh = false) {
  if (discoveryLoading) return;
  if (discoveryLoaded && !forceRefresh) {
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

  discoveryLoading = true;
  setDiscoveryRefreshButtonState(true);

  try {
    const data = await fetchDiscoveryGames({ forceNetwork: forceRefresh });
    renderGameCards(data);
    setDiscoveryUiState('content');
    setDiscoveryOfflineMessage('');
    discoveryLoaded = true;
  } catch (err) {
    const msg = resolveErrorText(err?.message || err || 'ERR_RAWG_API_FAIL', true);
    setDiscoveryOfflineMessage(msg);
    setDiscoveryUiState('offline');
  } finally {
    discoveryLoading = false;
    setDiscoveryRefreshButtonState(false);
  }
}

function setupTitleBar() {
  document.getElementById('btn-hide').onclick = () => window.api.hideWindow();
  document.getElementById('btn-close').onclick = () => window.api.closeWindow();
}

function setupSearch() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderGames();
  });
}

function setupCategories() {
  document.querySelectorAll('.cat-btn[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn[data-cat]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderGames();
    });
  });
}

function toggleGameSelection(id) {
  const gameId = Number(id);
  if (!Number.isFinite(gameId)) return;
  if (selectedGameIds.has(gameId)) selectedGameIds.delete(gameId);
  else selectedGameIds.add(gameId);
  renderGames();
  if (selectedGameIds.size > 0) showDeleteBar();
  else hideDeleteBar();
}

function deselectGame(id = null) {
  if (id === null || id === undefined) {
    selectedGameIds = new Set();
  } else {
    const gameId = Number(id);
    if (!Number.isFinite(gameId)) return;
    selectedGameIds.delete(gameId);
  }
  renderGames();
  if (selectedGameIds.size === 0) hideDeleteBar();
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
      const ids = [...selectedGameIds];
      if (ids.length === 0) return;

      const selectedGames = appData.games.filter((g) => selectedGameIds.has(g.id));
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

  const selectedGames = appData.games.filter((g) => selectedGameIds.has(g.id));
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
  const select = document.getElementById('sort-mode');
  if (!select) return;
  const validModes = ['lastPlayed', 'playtime', 'name', 'favoritesOnly'];
  if (!validModes.includes(sortMode)) {
    sortMode = 'lastPlayed';
    localStorage.setItem('gamedock.sort.mode', sortMode);
  }
  select.value = sortMode;
  select.addEventListener('change', () => {
    sortMode = select.value;
    localStorage.setItem('gamedock.sort.mode', sortMode);
    renderGames();
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
    const known = errorMap[errorLike];
    if (!known) return errorLike;
    if (includeTroubleshooting && known.troubleshooting) {
      return `${known.message} ${known.troubleshooting}`;
    }
    return known.message;
  }

  if (typeof errorLike === 'object') {
    const known = errorLike.code ? errorMap[errorLike.code] : null;
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
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const gameId = Number(contextMenuGameId);
    const game = appData.games.find((g) => g.id === gameId);
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
      appData = await window.api.getData();
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
      appData = await window.api.getData();
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
      appData = await window.api.getData();
      renderGames();
      showToast('Cover reset', 'success');
      return;
    }

    if (action === 'toggle-select') {
      toggleGameSelection(game.id);
    }
  });
}

function showGameContextMenu(gameId, x, y) {
  const menu = document.getElementById('game-context-menu');
  if (!menu) return;
  contextMenuGameId = gameId;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'grid';
}

function hideGameContextMenu() {
  const menu = document.getElementById('game-context-menu');
  if (!menu) return;
  menu.style.display = 'none';
  contextMenuGameId = null;
}

function gameSort(a, b) {
  const favoriteDelta = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
  if (favoriteDelta !== 0) return favoriteDelta;

  if (sortMode === 'manual') {
    const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.addedAt || 0) - (b.addedAt || 0);
  }

  if (sortMode === 'name') {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }

  if (sortMode === 'playtime') {
    return getPlaytimeMinutes(b) - getPlaytimeMinutes(a);
  }

  return (b.lastPlayed || 0) - (a.lastPlayed || 0);
}

function createGameCard(game) {
  const card = document.createElement('div');
  const selectionModeActive = selectedGameIds.size > 0;
  const isSelected = selectedGameIds.has(game.id);
  card.className = ['game-card', game.favorite ? 'favorite' : '', isSelected ? 'selected' : '']
    .filter(Boolean)
    .join(' ');
  card.id = `game-${game.id}`;
  card.dataset.gameId = String(game.id);

  const cover = document.createElement('div');
  cover.className = 'game-cover';

  const coverSource = game.coverPath ? toFileUrl(game.coverPath) : game.icon;
  if (coverSource) {
    const img = document.createElement('img');
    img.src = coverSource;
    img.alt = game.name;
    img.onerror = () => {
      cover.innerHTML = '<span class="game-cover-placeholder material-symbols-outlined">sports_esports</span>';
    };
    cover.appendChild(img);
  } else {
    cover.innerHTML = '<span class="game-cover-placeholder material-symbols-outlined">sports_esports</span>';
  }

  const playOverlay = document.createElement('div');
  playOverlay.className = 'play-overlay';
  const playBtn = document.createElement('button');
  playBtn.className = 'play-button';
  playBtn.type = 'button';
  playBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectionModeActive) {
      toggleGameSelection(game.id);
      return;
    }
    launchGame(game);
  });
  playOverlay.appendChild(playBtn);
  cover.appendChild(playOverlay);

  const info = document.createElement('div');
  info.className = 'game-info';

  const name = document.createElement('div');
  name.className = 'game-name';
  name.textContent = game.name;

  const meta = document.createElement('div');
  meta.className = 'game-meta';

  const badge = document.createElement('span');
  badge.className = 'game-badge';
  badge.innerHTML = `<span class="material-symbols-outlined">label</span>${game.category}`;

  const playtime = document.createElement('span');
  playtime.className = 'game-playtime';
  const total = getPlaytimeMinutes(game);
  playtime.textContent = total > 0
    ? formatPlaytime(total)
    : (game.lastPlayed ? `Last: ${timeAgo(game.lastPlayed)}` : 'Never played');

  meta.append(badge, playtime);
  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'game-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'game-action-btn';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit');
  editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(game.id);
  });
  actions.appendChild(editBtn);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `game-action-btn ${game.favorite ? 'is-active' : ''}`;
  favBtn.title = game.favorite ? 'Unfavorite' : 'Favorite';
  favBtn.setAttribute('aria-label', favBtn.title);
  favBtn.innerHTML = game.favorite 
    ? '<span class="material-symbols-outlined">star</span>'
    : '<span class="material-symbols-outlined">star_outline</span>';
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const result = await window.api.toggleFavorite(game.id);
    if (!result.success) {
      showToast(result.error || 'ERR_UNKNOWN', 'error');
      return;
    }
    appData = await window.api.getData();
    renderGames();
  });
  actions.appendChild(favBtn);

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = `game-action-btn ${isSelected ? 'is-active' : ''}`;
  selectBtn.title = isSelected ? 'Unselect' : 'Select';
  selectBtn.setAttribute('aria-label', selectBtn.title);
  selectBtn.innerHTML = isSelected
    ? '<span class="material-symbols-outlined">check_circle</span>'
    : '<span class="material-symbols-outlined">radio_button_unchecked</span>';
  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleGameSelection(game.id);
  });
  actions.appendChild(selectBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'game-action-btn';
  delBtn.title = 'Delete';
  delBtn.setAttribute('aria-label', 'Delete');
  delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Remove "${game.name}" from GameDock?`)) return;
    await deleteGame(game.id);
    deselectGame(game.id);
  });
  actions.appendChild(delBtn);

  card.append(cover, info, actions);

  card.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.drag-handle')) return;
    if (selectionModeActive) toggleGameSelection(game.id);
    else launchGame(game);
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showGameContextMenu(game.id, e.clientX, e.clientY);
  });

  return card;
}

function renderGames() {
  const list = document.getElementById('game-list');
  list.textContent = '';

  let games = [...appData.games];
  if (activeCategory !== 'all') games = games.filter((g) => g.category === activeCategory);
  if (searchQuery) games = games.filter((g) => g.name.toLowerCase().includes(searchQuery));
  if (sortMode === 'favoritesOnly') games = games.filter((g) => Boolean(g.favorite));
  games.sort(gameSort);

  if (games.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('span');
    icon.className = 'empty-state-icon material-symbols-outlined';
    icon.textContent = 'sports_esports';
    const title = document.createElement('div');
    title.className = 'empty-state-title';
    title.textContent = 'No Games';
    const text = document.createElement('p');
    text.className = 'empty-state-text';
    if (searchQuery) {
      text.textContent = 'No games match your search';
    } else if (sortMode === 'favoritesOnly') {
      text.textContent = 'No favorite games yet. Star a game to pin it here.';
    } else if (activeCategory !== 'all') {
      text.textContent = `No ${activeCategory} games yet.`;
    } else {
      text.textContent = 'No games yet. Add one below.';
    }
    empty.append(icon, title, text);

    if (!searchQuery && sortMode !== 'favoritesOnly') {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-primary empty-state-action';
      const addLabel = activeCategory !== 'all' ? `Add ${activeCategory} Game` : 'Add Game';
      addBtn.innerHTML = `<span class="material-symbols-outlined">add</span><span>${escapeHtml(addLabel)}</span>`;
      addBtn.addEventListener('click', () => {
        document.getElementById('btn-add-game')?.click();
        if (activeCategory !== 'all') {
          const categorySelect = document.getElementById('game-category');
          if (categorySelect) categorySelect.value = activeCategory;
        }
      });
      empty.appendChild(addBtn);
    }

    list.appendChild(empty);
    return;
  }

  games.forEach((game) => {
    const card = createGameCard(game);
    list.appendChild(card);
  });
}

async function launchGame(game) {
  if (selectedGameIds.size > 0) return;
  showToast(`Launching ${game.name}...`, 'success');
  const result = await window.api.launchGame(game);

  if (result.success) {
    appData = await window.api.getData();
    renderGames();
  } else {
    showToast(result.error || 'ERR_UNKNOWN', 'error');
  }
}

async function deleteGame(id) {
  await deleteGames([id]);
}

async function deleteGames(ids) {
  const uniqueIds = new Set((ids || []).map(Number).filter(Number.isFinite));
  if (uniqueIds.size === 0) return;

  const before = appData.games.length;
  appData.games = appData.games.filter((g) => !uniqueIds.has(g.id));
  const removedCount = before - appData.games.length;
  if (removedCount <= 0) return;

  if (sortMode === 'manual') {
    appData.games
      .sort((a, b) => gameSort(a, b))
      .forEach((game, idx) => {
        game.sortOrder = idx;
      });
  }

  uniqueIds.forEach((id) => selectedGameIds.delete(id));
  await save();
  renderGames();
  showToast(removedCount === 1 ? 'Game removed' : `${removedCount} games removed`, 'success');
}

async function addDetectedSteamGames() {
  showToast('Scanning Steam libraries...', 'success');
  const result = await window.api.detectSteamGames();
  if (!result.success) {
    showToast(result.error || 'ERR_STEAM_DETECT_FAIL', 'error');
    return;
  }

  steamDetectCandidates = (result.games || []).map((game) => ({
    ...game,
    selected: true,
  }));

  if (steamDetectCandidates.length === 0) {
    showToast('No new Steam games found', 'error');
    return;
  }

  openSteamImportWizard();
  renderSteamImportList();
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
    steamDetectCandidates.forEach((g) => { g.selected = true; });
    renderSteamImportList();
  });

  document.getElementById('steam-select-none')?.addEventListener('click', () => {
    steamDetectCandidates.forEach((g) => { g.selected = false; });
    renderSteamImportList();
  });

  document.getElementById('steam-import-confirm')?.addEventListener('click', async () => {
    const selected = steamDetectCandidates.filter((g) => g.selected);
    if (selected.length === 0) {
      showToast('Select at least one game to import', 'error');
      return;
    }

    const res = await window.api.importSteamGames({ games: selected });
    if (!res?.success) {
      showToast(res?.error || 'ERR_STEAM_DETECT_FAIL', 'error');
      return;
    }

    appData = await window.api.getData();
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

function renderSteamImportList() {
  const list = document.getElementById('steam-import-list');
  const summary = document.getElementById('steam-import-summary');
  if (!list) return;

  list.textContent = '';
  const frag = document.createDocumentFragment();

  steamDetectCandidates.forEach((game, index) => {
    const row = document.createElement('label');
    row.className = 'steam-import-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(game.selected);
    checkbox.addEventListener('change', () => {
      steamDetectCandidates[index].selected = checkbox.checked;
      renderSteamImportList();
    });

    const thumb = document.createElement('img');
    thumb.src = game.coverUrl || '';
    thumb.alt = game.name || 'Cover';
    thumb.onerror = () => {
      thumb.src = '';
    };

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'steam-import-title';
    title.textContent = game.name || 'Unknown game';

    const meta = document.createElement('div');
    meta.className = 'steam-import-meta';
    meta.textContent = `${game.path || ''}${game.steamAppId ? ` | AppID ${game.steamAppId}` : ''}`;

    info.append(title, meta);
    row.append(checkbox, thumb, info);
    frag.appendChild(row);
  });

  list.appendChild(frag);
  if (summary) {
    const selectedCount = steamDetectCandidates.filter((g) => g.selected).length;
    summary.textContent = `${selectedCount} of ${steamDetectCandidates.length} selected`;
  }
}

function openEditModal(gameId) {
  const game = appData.games.find((g) => g.id === Number(gameId));
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
  document.getElementById('game-category').value = game.category || 'Other';
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
    document.getElementById('game-category').value = 'FPS';
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
      appData = await window.api.getData();
      renderGames();
      closeModal();
      showSaveActionPopup(`${name} updated`, 'success');
      return;
    }

    showToast('Fetching icon...', 'success');
    const icon = await window.api.getGameIcon(gamePath);
    const maxId = appData.games.reduce((max, g) => Math.max(max, Number(g.id) || 0), 0);
    const maxSort = appData.games.reduce((max, g) => Math.max(max, Number(g.sortOrder) || 0), -1);

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

    appData.games.push(game);
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
  appData.settings = appData.settings || {};
  const s = appData.settings;
  const alwaysOnTopEl = document.getElementById('set-always-on-top');
  const autoStartEl = document.getElementById('set-auto-start');
  const minimizeTrayEl = document.getElementById('set-minimize-tray');
  const launchNotificationsEl = document.getElementById('set-launch-notifications');
  const appVersionEl = document.getElementById('set-app-version');

  if (alwaysOnTopEl) alwaysOnTopEl.checked = Boolean(s.alwaysOnTop);
  if (autoStartEl) autoStartEl.checked = Boolean(s.autoStart);
  if (minimizeTrayEl) minimizeTrayEl.checked = s.minimizeToTray !== false;
  if (launchNotificationsEl) launchNotificationsEl.checked = s.launchNotifications !== false;

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

    appData.settings = appData.settings || {};
    appData.settings.alwaysOnTop = alwaysOnTop;
    appData.settings.autoStart = autoStart;
    appData.settings.minimizeToTray = minimizeTray;
    appData.settings.launchNotifications = launchNotifications;

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
      appData = res.data || (await window.api.getData());
      if (alwaysOnTopEl) alwaysOnTopEl.checked = Boolean(appData.settings?.alwaysOnTop);
      if (autoStartEl) autoStartEl.checked = Boolean(appData.settings?.autoStart);
      if (minimizeTrayEl) minimizeTrayEl.checked = appData.settings?.minimizeToTray !== false;
      if (launchNotificationsEl) launchNotificationsEl.checked = appData.settings?.launchNotifications !== false;
      renderGames();
      showToast('Backup imported', 'success');
    } else if (!res.canceled) {
      showToast(res.error || 'ERR_IMPORT_FAIL', 'error');
    }
  };
}

async function save() {
  return window.api.saveData(appData);
}

const TOAST_DURATION_MS = 3200;
let toastTimeout;
function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-message"></span><span class="toast-progress" aria-hidden="true"></span>';
    document.body.appendChild(toast);
  }

  let messageEl = toast.querySelector('.toast-message');
  let progressEl = toast.querySelector('.toast-progress');
  if (!messageEl || !progressEl) {
    toast.innerHTML = '<span class="toast-message"></span><span class="toast-progress" aria-hidden="true"></span>';
    messageEl = toast.querySelector('.toast-message');
    progressEl = toast.querySelector('.toast-progress');
  }

  messageEl.textContent = resolveErrorText(message, type === 'error');
  toast.className = `toast ${type}`;
  toast.style.setProperty('--toast-duration', `${TOAST_DURATION_MS}ms`);

  // Restart enter + countdown animation on repeated toasts.
  if (progressEl) progressEl.style.animation = 'none';
  void toast.offsetWidth;
  if (progressEl) progressEl.style.animation = '';
  toast.classList.add('show');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), TOAST_DURATION_MS);
}

const SAVE_POPUP_DURATION_MS = 2600;
let savePopupTimeout;
function showSaveActionPopup(message, type = 'success') {
  let popup = document.querySelector('.save-action-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.className = 'save-action-popup';
    popup.innerHTML = '<span class="save-action-message"></span><span class="save-action-progress" aria-hidden="true"></span>';
    document.body.appendChild(popup);
  }

  const messageEl = popup.querySelector('.save-action-message');
  const progressEl = popup.querySelector('.save-action-progress');
  if (messageEl) messageEl.textContent = resolveErrorText(message, type === 'error');
  popup.className = `save-action-popup ${type}`;
  popup.style.setProperty('--save-popup-duration', `${SAVE_POPUP_DURATION_MS}ms`);

  if (progressEl) progressEl.style.animation = 'none';
  void popup.offsetWidth;
  if (progressEl) progressEl.style.animation = '';
  popup.classList.add('show');

  clearTimeout(savePopupTimeout);
  savePopupTimeout = setTimeout(() => popup.classList.remove('show'), SAVE_POPUP_DURATION_MS);
}

function timeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

init();


