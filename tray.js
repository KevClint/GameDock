const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function createTray(mainWindow) {
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

  const menu = Menu.buildFromTemplate([
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
      label: 'Quit',
      click: () => {
        global.forceQuit = true;
        mainWindow.close();
      }
    }
  ]);

  tray.setContextMenu(menu);

  // Single click to toggle
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  return tray;
}

module.exports = { createTray };
