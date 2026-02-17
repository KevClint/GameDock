const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_DATA, sanitizeData } = require('./data-schema');

const dataFile = path.join(app.getPath('userData'), 'gamedock.json');

function load() {
  try {
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      return sanitizeData(parsed);
    }
  } catch (e) { console.error('Store load error:', e); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function save(data) {
  try {
    const safeData = sanitizeData(data);
    fs.writeFileSync(dataFile, JSON.stringify(safeData, null, 2));
    return true;
  } catch (e) {
    console.error('Store save error:', e);
    return false;
  }
}

module.exports = { load, save };
