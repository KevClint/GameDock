const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

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
  const iconCandidates = [
    path.join(__dirname, 'assets', 'tray-icon.png'),
    path.join(__dirname, 'assets', 'icon.ico')
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
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Hide GameDock',
      click: () => mainWindow.hide()
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        global.forceQuit = true;
        mainWindow.close();
      }
    }
  ]);

  tray.setContextMenu(buildMenu());

  // Single click to toggle
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(buildMenu());
  });

  return tray;
}

module.exports = { createTray };
