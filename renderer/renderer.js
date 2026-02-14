// ── State ──
let appData        = { games: [], settings: { autoStart: false, minimizeToTray: true } };
let activeCategory = 'all';
let searchQuery    = '';
let selectedGameId = null;

// ── Init ──
async function init() {
  appData = await window.api.getData() || appData;
  setupTitleBar();
  setupSearch();
  setupCategories();
  setupAddGame();
  setupSettings();
  renderGames();

  // Deselect when clicking outside a card
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.game-card') &&
        !e.target.closest('#delete-bar')) {
      deselectGame();
    }
  });
}

// ── Title Bar ──
function setupTitleBar() {
  document.getElementById('btn-hide').onclick     = () => window.api.hideWindow();
  document.getElementById('btn-close').onclick    = () => window.api.closeWindow();
  document.getElementById('btn-settings').onclick = () => {
    const s = appData.settings || {};
    document.getElementById('set-always-on-top').checked = s.alwaysOnTop    || false;
    document.getElementById('set-auto-start').checked    = s.autoStart      || false;
    document.getElementById('set-minimize-tray').checked = s.minimizeToTray !== false;
    document.getElementById('settings-overlay').style.display = 'flex';
  };
}

// ── Search ──
function setupSearch() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderGames();
  });
}

// ── Categories ──
function setupCategories() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderGames();
    });
  });
}

// ── Select / Deselect Game ──
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

// ── Delete Bar (shows at bottom when a game is selected) ──
function showDeleteBar() {
  let bar = document.getElementById('delete-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'delete-bar';
    bar.innerHTML = `
      <span id="delete-bar-name"></span>
      <button id="delete-bar-btn">🗑️ Remove</button>
    `;
    // Insert above bottom bar
    const bottomBar = document.querySelector('.bottom-bar');
    bottomBar.parentNode.insertBefore(bar, bottomBar);

    document.getElementById('delete-bar-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const game = appData.games.find(g => g.id === selectedGameId);
      if (!game) return;
      if (confirm(`Remove "${game.name}" from GameDock?`)) {
        deleteGame(selectedGameId);
        deselectGame();
      }
    });
  }

  const game = appData.games.find(g => g.id === selectedGameId);
  if (game) {
    document.getElementById('delete-bar-name').textContent = game.name;
  }
  bar.classList.add('visible');
}

function hideDeleteBar() {
  const bar = document.getElementById('delete-bar');
  if (bar) bar.classList.remove('visible');
}

// ── Render Games ──
function renderGames() {
  const list = document.getElementById('game-list');
  list.innerHTML = '';

  let games = [...appData.games];

  if (activeCategory !== 'all') {
    games = games.filter(g => g.category === activeCategory);
  }

  if (searchQuery) {
    games = games.filter(g => g.name.toLowerCase().includes(searchQuery));
  }

  games.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

  if (games.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span>🎮</span>
        <p>${searchQuery
          ? 'No games match your search'
          : 'No games yet!\nRight-click a game to delete it'}</p>
      </div>`;
    return;
  }

  games.forEach(game => {
    const card      = document.createElement('div');
    const isSelected = game.id === selectedGameId;
    card.className  = `game-card ${isSelected ? 'selected' : ''}`;
    card.id         = `game-${game.id}`;

    // ── Icon: use extracted icon OR fallback emoji ──
    const iconHtml = game.icon
      ? `<img src="${game.icon}" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='🎮'"/>`
      : `🎮`;

    const playtime = formatPlaytime(game.playtimeMinutes);
    const lastPlayed = game.lastPlayed
      ? `Last: ${timeAgo(game.lastPlayed)}`
      : 'Never played';

    card.innerHTML = `
      <div class="game-icon">${iconHtml}</div>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        <div class="game-meta">
          <span class="game-cat">${game.category}</span>
          <span class="game-playtime">${lastPlayed}</span>
        </div>
      </div>
      <div class="launch-overlay">🚀 Launching...</div>
    `;

    // ── Left click = launch ──
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isSelected) {
        deselectGame();
      } else {
        launchGame(game);
      }
    });

    // ── Right click = select (shows delete bar) ──
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedGameId === game.id) {
        deselectGame();
      } else {
        selectGame(game.id);
      }
    });

    list.appendChild(card);
  });
}

// ── Launch Game ──
async function launchGame(game) {
  showToast(`🚀 Launching ${game.name}...`, 'success');

  const result = await window.api.launchGame(game.path);

  if (result.success) {
    const idx = appData.games.findIndex(g => g.id === game.id);
    if (idx !== -1) {
      appData.games[idx].lastPlayed   = Date.now();
      appData.games[idx].launchCount  = (appData.games[idx].launchCount || 0) + 1;
    }
    await save();
    renderGames();
  } else {
    showToast(`❌ ${result.error}`, 'error');
  }
}

// ── Delete Game ──
async function deleteGame(id) {
  appData.games = appData.games.filter(g => g.id !== id);
  await save();
  renderGames();
  showToast('🗑️ Game removed', 'success');
}

// ── Add Game ──
function setupAddGame() {
  document.getElementById('btn-add-game').onclick = () => {
    document.getElementById('game-name').value     = '';
    document.getElementById('game-path').value     = '';
    document.getElementById('game-category').value = 'FPS';
    document.getElementById('modal-overlay').style.display = 'flex';
  };

  document.getElementById('btn-browse').onclick = async () => {
    const filePath = await window.api.browseGame();
    if (filePath) {
      document.getElementById('game-path').value = filePath;
      if (!document.getElementById('game-name').value) {
        const name = filePath
          .split('\\').pop()
          .replace(/\.exe$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        document.getElementById('game-name').value = name;
      }
    }
  };

  document.getElementById('btn-confirm-add').onclick = async () => {
    const name     = document.getElementById('game-name').value.trim();
    const gamePath = document.getElementById('game-path').value.trim();
    const category = document.getElementById('game-category').value;

    if (!name)     { showToast('⚠️ Enter a game name', 'error');         return; }
    if (!gamePath) { showToast('⚠️ Select a game executable', 'error');  return; }

    showToast('⏳ Fetching icon...', 'success');

    const icon = await window.api.getGameIcon(gamePath);

    const game = {
      id:              Date.now(),
      name,
      path:            gamePath,
      category,
      icon:            icon || null,
      addedAt:         Date.now(),
      lastPlayed:      null,
      playtimeMinutes: 0,
      launchCount:     0
    };

    appData.games.push(game);
    await save();
    renderGames();
    document.getElementById('modal-overlay').style.display = 'none';
    showToast(`✅ ${name} added!`, 'success');
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

// ── Settings ──
function setupSettings() {
  document.getElementById('btn-save-settings').onclick = async () => {
    const alwaysOnTop  = document.getElementById('set-always-on-top').checked;
    const autoStart    = document.getElementById('set-auto-start').checked;
    const minimizeTray = document.getElementById('set-minimize-tray').checked;

    appData.settings.alwaysOnTop    = alwaysOnTop;
    appData.settings.autoStart      = autoStart;
    appData.settings.minimizeToTray = minimizeTray;

    await window.api.toggleAlwaysOnTop(alwaysOnTop);
    await window.api.toggleAutoStart(autoStart);
    await save();

    document.getElementById('settings-overlay').style.display = 'none';
    showToast('✅ Settings saved', 'success');
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

// ── Save ──
async function save() {
  await window.api.saveData(appData);
}

// ── Toast ──
let toastTimeout;
function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className   = `toast ${type} show`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Format Playtime ──
function formatPlaytime(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Time Ago ──
function timeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)   return 'Just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ── Start ──
init();