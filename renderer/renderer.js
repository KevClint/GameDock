let appData = { games: [], settings: { autoStart: false, minimizeToTray: true } };
let activeCategory = 'all';
let searchQuery = '';
let selectedGameIds = new Set();
let activeView = 'library';

let discoveryLoaded = false;
let discoveryLoading = false;
const DISCOVERY_CACHE_KEY = 'gamedock.discovery.cache.v1';
const DISCOVERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const discoveryEntryTimers = new Set();
let communityLoaded = false;

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
  setupTitleBar();
  setupSearch();
  setupCategories();
  setupNavigation();
  setupDiscovery();
  setActiveView('library');
  setupAddGame();
  setupSettings();
  renderGames();

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.game-card') && !e.target.closest('#delete-bar')) {
      deselectGame();
    }
  });
}

function setupDiscovery() {
  const retryBtn = document.getElementById('btn-discovery-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      void loadDiscovery(true);
    });
  }
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
    library: 'GameDock',
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
  };
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

async function fetchDiscoveryGames() {
  const sourceUrl = 'rawg://discovery';
  const cachedRecord = readDiscoveryCache();

  const networkFetcher = async () => {
    const response = await Promise.race([
      window.api.getRawgDiscoveryGames?.(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IPC timeout while loading discovery data')), 15000)),
    ]);
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load discovery data');
    }

    const trending = (response.data?.trending || []).map(normalizeDiscoveryGame).slice(0, 10);
    const indie = (response.data?.indie || []).map(normalizeDiscoveryGame).slice(0, 5);
    return {
      hero: trending[0] || null,
      trending: trending.slice(1),
      indie,
    };
  };

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
  if (heroEl) heroEl.textContent = '';
  if (trendingGrid) trendingGrid.textContent = '';
  if (indieGrid) indieGrid.textContent = '';
  discoveryLoaded = false;
}

function renderGameCards(data) {
  const heroEl = document.getElementById('discovery-hero');
  const trendingGrid = document.getElementById('discovery-grid-trending');
  const indieGrid = document.getElementById('discovery-grid-indie');
  const trendingMeta = document.getElementById('discovery-meta-trending');

  if (!heroEl || !trendingGrid || !indieGrid) return;

  heroEl.innerHTML = '';
  trendingGrid.innerHTML = '';
  indieGrid.innerHTML = '';
  clearDiscoveryEntryTimers();

  if (data.hero) {
    const heroGenres = escapeHtml((data.hero.genres || []).slice(0, 3).join(' • ') || 'Trending now');
    const heroScore = Number.isFinite(data.hero.metacritic) ? data.hero.metacritic : 'N/A';
    const heroBgStyle = data.hero.background_image
      ? `style="--hero-bg:url('${escapeHtml(data.hero.background_image)}');"`
      : '';

    heroEl.innerHTML = `
      <section class="discovery-hero" ${heroBgStyle}>
        <div class="hero-overlay">
          <div class="hero-kicker">#1 Trending This Year</div>
          <h2 class="hero-title">${escapeHtml(data.hero.name)}</h2>
          <p class="hero-subtitle">${heroGenres}</p>
          <div class="hero-actions">
            <button class="btn-primary">
              <span class="material-symbols-outlined">play_arrow</span>
              Play Now
            </button>
            <button class="btn-secondary">
              <span class="material-symbols-outlined">bookmark_add</span>
              Wishlist
            </button>
            <span class="metacritic-badge ${getMetacriticClass(data.hero.metacritic)}">Metacritic ${heroScore}</span>
          </div>
        </div>
      </section>
    `;
  }

  const trendingFrag = document.createDocumentFragment();
  data.trending.forEach((game) => {
    trendingFrag.appendChild(createDiscoveryCardNode(game));
  });
  trendingGrid.appendChild(trendingFrag);

  const indieFrag = document.createDocumentFragment();
  data.indie.forEach((game) => {
    indieFrag.appendChild(createDiscoveryCardNode(game));
  });
  indieGrid.appendChild(indieFrag);

  if (trendingMeta) {
    trendingMeta.textContent = `Top ${data.trending.length + (data.hero ? 1 : 0)} this year`;
  }

  staggerRevealCards(trendingGrid);
  staggerRevealCards(indieGrid);
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

function renderNewsFeed(articles) {
  const list = document.getElementById('community-feed-list');
  if (!list) return;
  list.textContent = '';

  const normalized = (articles || []).map(normalizeArticle);
  if (normalized.length === 0) {
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
    const card = document.createElement('article');
    card.className = 'feed-card';
    card.innerHTML = `
      <div class="feed-source">${escapeHtml(a.source)} • ${escapeHtml(formatPublishedAgo(a.publishedAt))}</div>
      <div class="feed-title">${escapeHtml(a.title)}</div>
      <p class="feed-snippet">${escapeHtml(a.snippet)}</p>
      <div class="feed-actions">
        <a class="feed-read" href="${escapeHtml(a.url)}" target="_blank" rel="noreferrer noopener">Read More</a>
        <button class="feed-share" type="button" title="Share">
          <span class="material-symbols-outlined">share</span>
        </button>
      </div>
    `;

    const shareBtn = card.querySelector('.feed-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(a.url);
          showToast('Link copied', 'success');
        } catch {
          showToast('Could not copy link', 'error');
        }
      });
    }

    frag.appendChild(card);
  });

  list.appendChild(frag);
}

async function loadCommunityNews(force = false) {
  if (communityLoaded && !force) return;

  try {
    const res = await window.api.getCommunityNews?.();
    if (res?.success && Array.isArray(res.articles) && res.articles.length > 0) {
      renderNewsFeed(res.articles);
    } else {
      renderNewsFeed(MOCK_COMMUNITY_ARTICLES);
      if (res?.error) console.warn('Community news fallback:', res.error);
    }
  } catch (err) {
    console.warn('Community feed failed, using mock data:', err);
    renderNewsFeed(MOCK_COMMUNITY_ARTICLES);
  } finally {
    communityLoaded = true;
  }
}

async function loadDiscovery(forceRefresh = false) {
  if (discoveryLoading) return;
  if (discoveryLoaded && !forceRefresh) return;

  const cached = readDiscoveryCache();
  if (cached?.data) {
    renderGameCards(cached.data);
    setDiscoveryUiState('content');
  } else {
    setDiscoveryUiState('loading');
  }

  discoveryLoading = true;

  try {
    const data = await fetchDiscoveryGames();
    renderGameCards(data);
    setDiscoveryUiState('content');
    setDiscoveryOfflineMessage('');
    discoveryLoaded = true;
  } catch (err) {
    console.error('Discovery fetch failed:', err);
    setDiscoveryOfflineMessage(err?.message || 'Check your RAWG API key or network and try again.');
    setDiscoveryUiState('offline');
  } finally {
    discoveryLoading = false;
  }
}

function setupTitleBar() {
  document.getElementById('btn-hide').onclick = () => window.api.hideWindow();
  document.getElementById('btn-close').onclick = () => window.api.closeWindow();
  document.getElementById('btn-settings').onclick = async () => {
    const s = appData.settings || {};
    document.getElementById('set-always-on-top').checked = Boolean(s.alwaysOnTop);
    document.getElementById('set-auto-start').checked = Boolean(s.autoStart);
    document.getElementById('set-minimize-tray').checked = s.minimizeToTray !== false;

    const info = await window.api.getAppInfo();
    document.getElementById('set-app-version').textContent = `${info.name} ${info.version}`;
    document.getElementById('settings-overlay').style.display = 'flex';
  };
}

function setupSearch() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderGames();
  });
}

function setupCategories() {
  document.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('active'));
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
    bar.appendChild(removeBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'delete-bar-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deselectGame();
    });
    bar.appendChild(cancelBtn);

    const bottomBar = document.querySelector('.bottom-bar');
    bottomBar.parentNode.insertBefore(bar, bottomBar);
  }

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

function gameSort(a, b) {
  const favDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
  if (favDiff !== 0) return favDiff;

  if (a.favorite && b.favorite) {
    const pinDiff = (a.pinOrder || 0) - (b.pinOrder || 0);
    if (pinDiff !== 0) return pinDiff;
  }

  return (b.lastPlayed || 0) - (a.lastPlayed || 0);
}

function createGameCard(game) {
  const card = document.createElement('div');
  const isSelected = selectedGameIds.has(game.id);
  card.className = `game-card ${isSelected ? 'selected' : ''}`;
  card.id = `game-${game.id}`;

  // Cover Image
  const cover = document.createElement('div');
  cover.className = 'game-cover';

  if (game.icon) {
    const img = document.createElement('img');
    img.src = game.icon;
    img.alt = game.name;
    img.onerror = () => {
      cover.innerHTML = '<span class="game-cover-placeholder material-symbols-outlined">sports_esports</span>';
    };
    cover.appendChild(img);
  } else {
    cover.innerHTML = '<span class="game-cover-placeholder material-symbols-outlined">sports_esports</span>';
  }

  // Play Overlay
  const playOverlay = document.createElement('div');
  playOverlay.className = 'play-overlay';
  const playBtn = document.createElement('button');
  playBtn.className = 'play-button';
  playBtn.type = 'button';
  playBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    launchGame(game);
  });
  playOverlay.appendChild(playBtn);
  cover.appendChild(playOverlay);

  // Game Info
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
  playtime.textContent = game.lastPlayed ? `Last: ${timeAgo(game.lastPlayed)}` : 'Never played';

  meta.append(badge, playtime);
  info.append(name, meta);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'game-actions';

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
      showToast(result.error || 'Failed to update favorite', 'error');
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
    if (selectedGameIds.size > 0) toggleGameSelection(game.id);
    else launchGame(game);
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleGameSelection(game.id);
  });

  return card;
}

function renderGames() {
  const list = document.getElementById('game-list');
  list.textContent = '';

  let games = [...appData.games];
  if (activeCategory !== 'all') games = games.filter((g) => g.category === activeCategory);
  if (searchQuery) games = games.filter((g) => g.name.toLowerCase().includes(searchQuery));
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
    text.textContent = searchQuery ? 'No games match your search' : 'No games yet. Add one below.';
    empty.append(icon, title, text);
    list.appendChild(empty);
    return;
  }

  games.forEach((game) => {
    const card = createGameCard(game);
    list.appendChild(card);
  });
}

async function launchGame(game) {
  showToast(`Launching ${game.name}...`, 'success');
  const result = await window.api.launchGame(game);

  if (result.success) {
    appData = await window.api.getData();
    renderGames();
  } else {
    showToast(result.error || 'Launch failed', 'error');
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

  uniqueIds.forEach((id) => selectedGameIds.delete(id));
  await save();
  renderGames();
  showToast(removedCount === 1 ? 'Game removed' : `${removedCount} games removed`, 'success');
}

async function addDetectedSteamGames() {
  showToast('Scanning Steam libraries...', 'success');
  const result = await window.api.detectSteamGames();
  if (!result.success) {
    showToast(result.error || 'Steam detection failed', 'error');
    return;
  }

  if (!result.games || result.games.length === 0) {
    showToast('No new Steam games found', 'error');
    return;
  }

  const detected = result.games.map((g) => ({
    ...g,
    icon: null,
  }));

  appData.games.push(...detected);
  await save();
  renderGames();
  showToast(`Added ${detected.length} Steam games`, 'success');
}

function setupAddGame() {
  const advancedOptions = document.getElementById('advanced-options');
  const toggleAdvancedBtn = document.getElementById('btn-toggle-advanced');
  const setAdvancedVisible = (visible) => {
    advancedOptions.classList.toggle('hidden', !visible);
    toggleAdvancedBtn.textContent = visible ? 'Hide Advanced' : 'Show Advanced';
  };

  toggleAdvancedBtn.onclick = () => {
    const isHidden = advancedOptions.classList.contains('hidden');
    setAdvancedVisible(isHidden);
  };

  document.getElementById('btn-add-game').onclick = () => {
    document.getElementById('game-name').value = '';
    document.getElementById('game-path').value = '';
    document.getElementById('game-category').value = 'FPS';
    document.getElementById('game-args').value = '';
    document.getElementById('game-working-dir').value = '';
    setAdvancedVisible(false);
    document.getElementById('modal-overlay').style.display = 'flex';
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

  document.getElementById('btn-confirm-add').onclick = async () => {
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
      showToast('Network paths are blocked', 'error');
      return;
    }

    showToast('Fetching icon...', 'success');
    const icon = await window.api.getGameIcon(gamePath);

    const game = {
      id: Date.now(),
      name,
      path: gamePath,
      category,
      icon: icon || null,
      addedAt: Date.now(),
      lastPlayed: null,
      playtimeMinutes: 0,
      launchCount: 0,
      favorite: false,
      pinOrder: 0,
      launchArgs,
      workingDir,
    };

    appData.games.push(game);
    await save();
    renderGames();
    document.getElementById('modal-overlay').style.display = 'none';
    showToast(`${name} added`, 'success');
  };

  document.getElementById('btn-cancel-add').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
  };

  document.getElementById('modal-close-btn').onclick = () => {
    document.getElementById('modal-overlay').style.display = 'none';
  };

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      document.getElementById('modal-overlay').style.display = 'none';
    }
  });
}

function setupSettings() {
  document.getElementById('btn-save-settings').onclick = async () => {
    const alwaysOnTop = document.getElementById('set-always-on-top').checked;
    const autoStart = document.getElementById('set-auto-start').checked;
    const minimizeTray = document.getElementById('set-minimize-tray').checked;

    appData.settings.alwaysOnTop = alwaysOnTop;
    appData.settings.autoStart = autoStart;
    appData.settings.minimizeToTray = minimizeTray;

    await window.api.toggleAlwaysOnTop(alwaysOnTop);
    await window.api.toggleAutoStart(autoStart);
    await save();

    document.getElementById('settings-overlay').style.display = 'none';
    showToast('Settings saved', 'success');
  };

  document.getElementById('btn-export-backup').onclick = async () => {
    const res = await window.api.exportData();
    if (res.success) showToast('Backup exported', 'success');
    else if (!res.canceled) showToast(res.error || 'Export failed', 'error');
  };

  document.getElementById('btn-import-backup').onclick = async () => {
    const res = await window.api.importData();
    if (res.success) {
      appData = res.data || (await window.api.getData());
      renderGames();
      showToast('Backup imported', 'success');
    } else if (!res.canceled) {
      showToast(res.error || 'Import failed', 'error');
    }
  };

  document.getElementById('btn-close-settings').onclick = () => {
    document.getElementById('settings-overlay').style.display = 'none';
  };

  document.getElementById('settings-close-btn').onclick = () => {
    document.getElementById('settings-overlay').style.display = 'none';
  };

  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') {
      document.getElementById('settings-overlay').style.display = 'none';
    }
  });
}

async function save() {
  await window.api.saveData(appData);
}

let toastTimeout;
function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
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
