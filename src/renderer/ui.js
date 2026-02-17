import {
  getAppData,
  setAppData,
  getActiveCategory,
  setActiveCategory,
  getSearchQuery,
  getSelectedGameIds,
  getSortMode,
  setSortMode,
  getCommunityFeedHasMore,
  getCommunityFeedLoadingMore,
  getSteamDetectCandidates,
  setSteamDetectCandidates,
  removeCategory,
} from './state.js';

let uiHandlers = {
  onToggleGameSelection: () => {},
  onLaunchGame: () => {},
  onOpenEditModal: () => {},
  onDeleteGame: async () => {},
  onShowGameContextMenu: () => {},
  onCategoriesChanged: () => {},
  resolveErrorText: (value) => String(value || 'Unknown error'),
};

export function configureUI(handlers = {}) {
  uiHandlers = { ...uiHandlers, ...handlers };
}

function resolveUiMessage(message, includeTroubleshooting = false) {
  try {
    return uiHandlers.resolveErrorText(message, includeTroubleshooting);
  } catch {
    return String(message || 'Unknown error');
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function isFavoriteGame(game) {
  const value = game?.favorite;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function gameSort(a, b) {
  const favoriteDelta = Number(isFavoriteGame(b)) - Number(isFavoriteGame(a));
  if (favoriteDelta !== 0) return favoriteDelta;

  const sortMode = getSortMode();
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

function getCardPlaytimeLabel(game, simplifiedCardsEnabled) {
  const total = getPlaytimeMinutes(game);
  if (simplifiedCardsEnabled) {
    return game.lastPlayed ? `Last: ${timeAgo(game.lastPlayed)}` : 'Last: never';
  }
  return total > 0
    ? formatPlaytime(total)
    : (game.lastPlayed ? `Last: ${timeAgo(game.lastPlayed)}` : 'Never played');
}

function ensureCoverPlaceholder(cover) {
  let placeholder = cover.querySelector('.game-cover-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('span');
    placeholder.className = 'game-cover-placeholder material-symbols-outlined';
    placeholder.textContent = 'sports_esports';
    const playOverlay = cover.querySelector('.play-overlay');
    if (playOverlay) {
      cover.insertBefore(placeholder, playOverlay);
    } else {
      cover.appendChild(placeholder);
    }
  }
  return placeholder;
}

function updateGameCardCover(card, game) {
  const cover = card.querySelector('.game-cover');
  if (!cover) return;

  const source = game.coverPath ? toFileUrl(game.coverPath) : game.icon;
  const playOverlay = cover.querySelector('.play-overlay');
  let img = cover.querySelector('img');

  if (source) {
    if (!img) {
      img = document.createElement('img');
      if (playOverlay) {
        cover.insertBefore(img, playOverlay);
      } else {
        cover.appendChild(img);
      }
    }
    img.src = source;
    img.alt = game.name;
    img.onerror = () => {
      img.remove();
      ensureCoverPlaceholder(cover);
    };
    cover.querySelector('.game-cover-placeholder')?.remove();
    return;
  }

  img?.remove();
  ensureCoverPlaceholder(cover);
}

function updateGameCard(card, game, simplifiedCardsEnabled) {
  const selectedGameIds = getSelectedGameIds();
  const isSelected = selectedGameIds.has(game.id);
  const isFavorite = isFavoriteGame(game);

  card.id = `game-${game.id}`;
  card.dataset.gameId = String(game.id);
  card.classList.toggle('is-simplified', simplifiedCardsEnabled);
  card.classList.toggle('favorite', isFavorite);
  card.classList.toggle('selected', isSelected);

  const name = card.querySelector('.game-name');
  if (name) name.textContent = game.name;

  const badge = card.querySelector('.game-badge');
  if (badge) {
    badge.innerHTML = `<span class="material-symbols-outlined">label</span>${game.category}`;
  }

  const playtime = card.querySelector('.game-playtime');
  if (playtime) {
    playtime.textContent = getCardPlaytimeLabel(game, simplifiedCardsEnabled);
  }

  const favBtn = card.querySelector('.game-action-btn[data-action="favorite"]');
  if (favBtn) {
    favBtn.classList.toggle('is-active', isFavorite);
    favBtn.title = isFavorite ? 'Unfavorite' : 'Favorite';
    favBtn.setAttribute('aria-label', favBtn.title);
    favBtn.innerHTML = isFavorite
      ? '<span class="material-symbols-outlined">star</span>'
      : '<span class="material-symbols-outlined">star_outline</span>';
  }

  const selectBtn = card.querySelector('.game-action-btn[data-action="select"]');
  if (selectBtn) {
    selectBtn.classList.toggle('is-active', isSelected);
    selectBtn.title = isSelected ? 'Unselect' : 'Select';
    selectBtn.setAttribute('aria-label', selectBtn.title);
    selectBtn.innerHTML = isSelected
      ? '<span class="material-symbols-outlined">check_circle</span>'
      : '<span class="material-symbols-outlined">radio_button_unchecked</span>';
  }

  updateGameCardCover(card, game);
}

function renderEmptyState(list, { activeCategory, searchQuery, sortMode }) {
  let empty = list.querySelector('.empty-state');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'empty-state';
    list.appendChild(empty);
  }

  empty.textContent = '';

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

  if (sortMode === 'favoritesOnly') {
    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'btn-secondary empty-state-action';
    showAllBtn.innerHTML = '<span class="material-symbols-outlined">filter_alt_off</span><span>Show All Games</span>';
    showAllBtn.addEventListener('click', () => {
      setSortMode('lastPlayed');
      renderGames();
    });
    empty.appendChild(showAllBtn);
    return;
  }

  if (!searchQuery) {
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
}

const TOAST_DURATION_MS = 3200;
let toastTimeout;
export function showToast(message, type = 'success') {
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

  if (messageEl) messageEl.textContent = resolveUiMessage(message, type === 'error');
  toast.className = `toast ${type}`;
  toast.style.setProperty('--toast-duration', `${TOAST_DURATION_MS}ms`);

  if (progressEl) progressEl.style.animation = 'none';
  void toast.offsetWidth;
  if (progressEl) progressEl.style.animation = '';
  toast.classList.add('show');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), TOAST_DURATION_MS);
}

const SAVE_POPUP_DURATION_MS = 2600;
let savePopupTimeout;
export function showSaveActionPopup(message, type = 'success') {
  let popup = document.querySelector('.save-action-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.className = 'save-action-popup';
    popup.innerHTML = '<span class="save-action-message"></span><span class="save-action-progress" aria-hidden="true"></span>';
    document.body.appendChild(popup);
  }

  const messageEl = popup.querySelector('.save-action-message');
  const progressEl = popup.querySelector('.save-action-progress');
  if (messageEl) messageEl.textContent = resolveUiMessage(message, type === 'error');
  popup.className = `save-action-popup ${type}`;
  popup.style.setProperty('--save-popup-duration', `${SAVE_POPUP_DURATION_MS}ms`);

  if (progressEl) progressEl.style.animation = 'none';
  void popup.offsetWidth;
  if (progressEl) progressEl.style.animation = '';
  popup.classList.add('show');

  clearTimeout(savePopupTimeout);
  savePopupTimeout = setTimeout(() => popup.classList.remove('show'), SAVE_POPUP_DURATION_MS);
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

export function renderNewsFeed(articles, options = {}) {
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
  normalized.forEach((article) => {
    frag.appendChild(createFeedCard(article));
  });
  list.appendChild(frag);
}

export function updateCommunityFeedMoreButton() {
  const btn = document.getElementById('community-feed-more');
  if (!btn) return;

  if (getCommunityFeedLoadingMore()) {
    btn.hidden = false;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    return;
  }

  btn.textContent = 'Show More';
  btn.disabled = false;
  btn.hidden = !getCommunityFeedHasMore();
}

export function setupTitleBar() {
  document.getElementById('btn-hide').onclick = () => window.api.hideWindow();
  document.getElementById('btn-close').onclick = () => window.api.closeWindow();
}

export function renderCategories() {
  const list = document.getElementById('category-list');
  const addBtn = document.getElementById('btn-add-category');
  if (!list) return;

  const appData = getAppData();
  const categories = Array.isArray(appData.categories) ? appData.categories : [];
  const activeCategory = getActiveCategory();

  const hasActive = activeCategory === 'all'
    || categories.some((category) => category === activeCategory);
  if (!hasActive) setActiveCategory('all');

  const currentActive = getActiveCategory();
  if (addBtn?.parentElement === list) addBtn.remove();

  list.textContent = '';
  const frag = document.createDocumentFragment();

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'cat-btn';
  allBtn.dataset.cat = 'all';
  allBtn.textContent = 'All Games';
  allBtn.title = 'All Games';
  allBtn.classList.toggle('active', currentActive === 'all');
  allBtn.addEventListener('click', () => {
    setActiveCategory('all');
    renderCategories();
    renderGames();
  });
  frag.appendChild(allBtn);

  categories.forEach((category) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn';
    btn.dataset.cat = category;
    btn.textContent = category;
    btn.title = category;
    btn.classList.toggle('active', currentActive === category);

    btn.addEventListener('click', () => {
      setActiveCategory(category);
      renderCategories();
      renderGames();
    });

    btn.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const confirmed = confirm(`Delete category "${category}"? Games in it will move to Other.`);
      if (!confirmed) return;

      const result = await removeCategory(category);
      if (!result?.success) {
        showToast(result?.error || 'Could not remove category', 'error');
        return;
      }
      try {
        if (window.api?.getData) {
          setAppData(await window.api.getData());
        }
      } catch {
        // Keep local state if sync refresh fails.
      }
      uiHandlers.onCategoriesChanged();
      renderCategories();
      renderGames();
    });

    frag.appendChild(btn);
  });
  list.appendChild(frag);

  if (addBtn) {
    addBtn.classList.add('cat-btn');
    addBtn.type = 'button';
    addBtn.title = 'Add Category';
    list.appendChild(addBtn);
  }
}

export function createGameCard(game) {
  const selectedGameIds = getSelectedGameIds();
  const appData = getAppData();
  const isSelectionModeActive = () => getSelectedGameIds().size > 0;
  const isSelected = selectedGameIds.has(game.id);
  const isFavorite = isFavoriteGame(game);
  const simplifiedCardsEnabled = Boolean(appData.settings?.simplifiedLibraryCards);

  const card = document.createElement('div');
  card.className = ['game-card', simplifiedCardsEnabled ? 'is-simplified' : '', isFavorite ? 'favorite' : '', isSelected ? 'selected' : '']
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
      img.remove();
      ensureCoverPlaceholder(cover);
    };
    cover.appendChild(img);
  } else {
    ensureCoverPlaceholder(cover);
  }

  const playOverlay = document.createElement('div');
  playOverlay.className = 'play-overlay';
  const playBtn = document.createElement('button');
  playBtn.className = 'play-button';
  playBtn.type = 'button';
  playBtn.dataset.action = 'play';
  playBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
  playBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isSelectionModeActive()) {
      uiHandlers.onToggleGameSelection(game.id);
      return;
    }
    uiHandlers.onLaunchGame(game);
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
  playtime.textContent = getCardPlaytimeLabel(game, simplifiedCardsEnabled);

  meta.append(badge, playtime);
  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'game-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'game-action-btn';
  editBtn.dataset.action = 'edit';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit');
  editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    uiHandlers.onOpenEditModal(game.id);
  });
  actions.appendChild(editBtn);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.dataset.action = 'favorite';
  favBtn.className = `game-action-btn ${isFavorite ? 'is-active' : ''}`;
  favBtn.title = isFavorite ? 'Unfavorite' : 'Favorite';
  favBtn.setAttribute('aria-label', favBtn.title);
  favBtn.innerHTML = isFavorite
    ? '<span class="material-symbols-outlined">star</span>'
    : '<span class="material-symbols-outlined">star_outline</span>';
  favBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    const wasFavoritesOnly = getSortMode() === 'favoritesOnly';
    const result = await window.api.toggleFavorite(game.id);
    if (!result?.success) {
      showToast(result?.error || 'ERR_UNKNOWN', 'error');
      return;
    }
    setAppData(await window.api.getData());
    if (wasFavoritesOnly) {
      const hasAnyFavorite = getAppData().games.some((entry) => isFavoriteGame(entry));
      if (!hasAnyFavorite) {
        setSortMode('lastPlayed');
        showToast('No favorites left. Showing all games.', 'success');
      }
    }
    renderGames();
  });
  actions.appendChild(favBtn);

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.dataset.action = 'select';
  selectBtn.className = `game-action-btn ${isSelected ? 'is-active' : ''}`;
  selectBtn.title = isSelected ? 'Unselect' : 'Select';
  selectBtn.setAttribute('aria-label', selectBtn.title);
  selectBtn.innerHTML = isSelected
    ? '<span class="material-symbols-outlined">check_circle</span>'
    : '<span class="material-symbols-outlined">radio_button_unchecked</span>';
  selectBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    uiHandlers.onToggleGameSelection(game.id);
  });
  actions.appendChild(selectBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.dataset.action = 'delete';
  delBtn.className = 'game-action-btn';
  delBtn.title = 'Delete';
  delBtn.setAttribute('aria-label', 'Delete');
  delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  delBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!confirm(`Remove "${game.name}" from GameDock?`)) return;
    await uiHandlers.onDeleteGame(game.id);
  });
  actions.appendChild(delBtn);

  card.append(cover, info, actions);

  card.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target.closest('.drag-handle')) return;
    if (isSelectionModeActive()) uiHandlers.onToggleGameSelection(game.id);
    else uiHandlers.onLaunchGame(game);
  });

  card.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    uiHandlers.onShowGameContextMenu(game.id, event.clientX, event.clientY);
  });

  return card;
}

export function renderGames() {
  const list = document.getElementById('game-list');
  if (!list) return;

  const appData = getAppData();
  const activeCategory = getActiveCategory();
  const searchQuery = getSearchQuery();
  const sortMode = getSortMode();

  const simplifiedCardsEnabled = Boolean(appData.settings?.simplifiedLibraryCards);
  list.classList.toggle('simplified-cards', simplifiedCardsEnabled);

  const allGames = Array.isArray(appData.games) ? [...appData.games] : [];
  allGames.sort(gameSort);

  const filteredGames = allGames.filter((game) => {
    if (activeCategory !== 'all' && game.category !== activeCategory) return false;
    if (searchQuery && !String(game.name || '').toLowerCase().includes(searchQuery)) return false;
    if (sortMode === 'favoritesOnly' && !isFavoriteGame(game)) return false;
    return true;
  });

  const visibleIds = new Set(filteredGames.map((game) => Number(game.id)));
  const allIds = new Set(allGames.map((game) => Number(game.id)));

  const cardsById = new Map();
  list.querySelectorAll('.game-card[data-game-id]').forEach((card) => {
    const id = Number(card.dataset.gameId);
    if (Number.isFinite(id)) cardsById.set(id, card);
  });

  allGames.forEach((game) => {
    const gameId = Number(game.id);
    let card = cardsById.get(gameId);
    if (!card) {
      card = createGameCard(game);
      cardsById.set(gameId, card);
      list.appendChild(card);
    } else {
      updateGameCard(card, game, simplifiedCardsEnabled);
    }
    const isVisible = visibleIds.has(gameId);
    card.hidden = !isVisible;
    card.classList.toggle('is-hidden', !isVisible);
  });

  cardsById.forEach((card, gameId) => {
    if (!allIds.has(gameId)) {
      card.remove();
      cardsById.delete(gameId);
    }
  });

  filteredGames.forEach((game) => {
    const card = cardsById.get(Number(game.id));
    if (card) list.appendChild(card);
  });

  if (filteredGames.length === 0) {
    renderEmptyState(list, { activeCategory, searchQuery, sortMode });
  } else {
    list.querySelector('.empty-state')?.remove();
  }
}

export function renderSteamImportList() {
  const list = document.getElementById('steam-import-list');
  const summary = document.getElementById('steam-import-summary');
  if (!list) return;

  const steamDetectCandidates = getSteamDetectCandidates();

  list.textContent = '';
  const frag = document.createDocumentFragment();

  steamDetectCandidates.forEach((game, index) => {
    const row = document.createElement('label');
    row.className = 'steam-import-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(game.selected);
    checkbox.addEventListener('change', () => {
      const nextCandidates = [...getSteamDetectCandidates()];
      nextCandidates[index] = { ...nextCandidates[index], selected: checkbox.checked };
      setSteamDetectCandidates(nextCandidates);
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
    const selectedCount = steamDetectCandidates.filter((game) => game.selected).length;
    summary.textContent = `${selectedCount} of ${steamDetectCandidates.length} selected`;
  }
}
