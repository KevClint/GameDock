const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function createTray(mainWindow) {
  // Use a simple fallback if no icon exists
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

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