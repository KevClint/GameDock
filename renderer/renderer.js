let appData = { games: [], settings: { autoStart: false, minimizeToTray: true } };
let activeCategory = 'all';
let searchQuery = '';
let selectedGameId = null;

async function init() {
  appData = (await window.api.getData()) || appData;
  setupTitleBar();
  setupSearch();
  setupCategories();
  setupAddGame();
  setupSettings();
  renderGames();

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.game-card') && !e.target.closest('#delete-bar')) {
      deselectGame();
    }
  });
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

function selectGame(id) {
  selectedGameId = id;
  renderGames();
  showDeleteBar();
}

function deselectGame() {
  selectedGameId = null;
  renderGames();
  hideDeleteBar();
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
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const game = appData.games.find((g) => g.id === selectedGameId);
      if (!game) return;
      if (confirm(`Remove "${game.name}" from GameDock?`)) {
        await deleteGame(selectedGameId);
        deselectGame();
      }
    });
    bar.appendChild(removeBtn);

    const bottomBar = document.querySelector('.bottom-bar');
    bottomBar.parentNode.insertBefore(bar, bottomBar);
  }

  const game = appData.games.find((g) => g.id === selectedGameId);
  if (game) {
    document.getElementById('delete-bar-name').textContent = game.name;
  }
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

function iconElementForGame(game) {
  const wrap = document.createElement('div');
  wrap.className = 'game-icon';

  if (game.icon) {
    const img = document.createElement('img');
    img.src = game.icon;
    img.alt = '';
    img.onerror = () => {
      wrap.textContent = 'GAME';
    };
    wrap.appendChild(img);
    return wrap;
  }

  wrap.textContent = 'GAME';
  return wrap;
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
    const line1 = document.createElement('span');
    line1.textContent = 'No Games';
    const line2 = document.createElement('p');
    line2.textContent = searchQuery ? 'No games match your search' : 'No games yet. Add one below.';
    empty.append(line1, line2);
    list.appendChild(empty);
    return;
  }

  games.forEach((game) => {
    const card = document.createElement('div');
    const isSelected = game.id === selectedGameId;
    card.className = `game-card ${isSelected ? 'selected' : ''}`;
    card.id = `game-${game.id}`;

    const icon = iconElementForGame(game);

    const info = document.createElement('div');
    info.className = 'game-info';
    const name = document.createElement('div');
    name.className = 'game-name';
    name.textContent = game.name;
    const meta = document.createElement('div');
    meta.className = 'game-meta';
    const cat = document.createElement('span');
    cat.className = 'game-cat';
    cat.textContent = game.category;
    const lastPlayed = document.createElement('span');
    lastPlayed.className = 'game-playtime';
    lastPlayed.textContent = game.lastPlayed ? `Last: ${timeAgo(game.lastPlayed)}` : 'Never played';
    meta.append(cat, lastPlayed);
    info.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'game-actions';
    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = `btn-fav ${game.favorite ? 'is-active' : ''}`;
    fav.title = game.favorite ? 'Unfavorite' : 'Favorite';
    fav.textContent = game.favorite ? 'Starred' : 'Star';
    fav.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await window.api.toggleFavorite(game.id);
      if (!result.success) {
        showToast(result.error || 'Failed to update favorite', 'error');
        return;
      }
      appData = await window.api.getData();
      renderGames();
    });
    actions.appendChild(fav);

    const overlay = document.createElement('div');
    overlay.className = 'launch-overlay';
    overlay.textContent = 'Launching...';

    card.append(icon, info, actions, overlay);

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isSelected) {
        deselectGame();
      } else {
        launchGame(game);
      }
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedGameId === game.id) deselectGame();
      else selectGame(game.id);
    });

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
  appData.games = appData.games.filter((g) => g.id !== id);
  await save();
  renderGames();
  showToast('Game removed', 'success');
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
  document.getElementById('btn-add-game').onclick = () => {
    document.getElementById('game-name').value = '';
    document.getElementById('game-path').value = '';
    document.getElementById('game-category').value = 'FPS';
    document.getElementById('game-args').value = '';
    document.getElementById('game-working-dir').value = '';
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
