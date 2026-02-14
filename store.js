const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

const dataFile = path.join(app.getPath('userData'), 'gamedock.json');

const defaultData = {
  games: [],
  settings: {
    autoStart:    false,
    minimizeToTray: true,
    opacity: 95
  }
};

function load() {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    }
  } catch (e) { console.error('Store load error:', e); }
  return JSON.parse(JSON.stringify(defaultData));
}

function save(data) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Store save error:', e);
    return false;
  }
}

module.exports = { load, save };