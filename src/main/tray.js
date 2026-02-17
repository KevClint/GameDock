const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function hasUsableWindow(mainWindow) {
  return Boolean(mainWindow && !mainWindow.isDestroyed());
}

function safeShow(mainWindow) {
  if (!hasUsableWindow(mainWindow)) return;
  mainWindow.show();
  mainWindow.focus();
}

function safeHide(mainWindow) {
  if (!hasUsableWindow(mainWindow)) return;
  mainWindow.hide();
}

function buildQuickLaunchItems(getData, launchGameById) {
  const appData = typeof getData === 'function' ? getData() : { games: [] };
  const games = Array.isArray(appData.games) ? appData.games : [];

  const quick = [...games]
    .sort((a, b) => {
      const favDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favDiff !== 0) return favDiff;
      return (b.lastPlayed || 0) - (a.lastPlayed || 0);
    })
    .slice(0, 5);

  if (quick.length === 0) {
    return [{ label: 'No games yet', enabled: false }];
  }

  return quick.map((game) => ({
    label: `${game.favorite ? '[*] ' : ''}${game.name}`,
    click: () => launchGameById(game.id),
  }));
}

function createTray(mainWindow, getData, launchGameById) {
  if (tray) {
    try {
      tray.destroy();
    } catch {
      // no-op
    }
  }

  const appRoot = app.getAppPath();
  const iconCandidates = [
    path.join(appRoot, 'assets', 'tray-icon.png'),
    path.join(appRoot, 'assets', 'icon.ico')
  ];

  const iconPath = iconCandidates.find((p) => fs.existsSync(p));
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(icon.isEmpty()
    ? nativeImage.createEmpty()
    : icon
  );

  tray.setToolTip('GameDock');

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Quick Launch',
      submenu: buildQuickLaunchItems(getData, launchGameById),
    },
    { type: 'separator' },
    {
      label: 'Show GameDock',
      click: () => safeShow(mainWindow),
    },
    {
      label: 'Hide GameDock',
      click: () => safeHide(mainWindow),
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        global.forceQuit = true;
        if (hasUsableWindow(mainWindow)) {
          mainWindow.close();
        } else {
          app.quit();
        }
      }
    }
  ]);

  tray.setContextMenu(buildMenu());

  // Single click to toggle
  tray.on('click', () => {
    if (!hasUsableWindow(mainWindow)) return;
    mainWindow.isVisible() ? safeHide(mainWindow) : safeShow(mainWindow);
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(buildMenu());
  });

  return tray;
}

module.exports = { createTray };
