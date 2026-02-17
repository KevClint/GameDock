const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_DATA, sanitizeData } = require('./data-schema');

const dataFile = path.join(app.getPath('userData'), 'gamedock.json');
const tempDataFile = `${dataFile}.tmp`;

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function ensureDataDir() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
}

function backupCorruptFile() {
  if (!fs.existsSync(dataFile)) return;
  const stamp = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
  const backupPath = path.join(path.dirname(dataFile), `gamedock.corrupt.${stamp}.json`);
  try {
    fs.renameSync(dataFile, backupPath);
    console.error(`Store load warning: backed up corrupt file to ${backupPath}`);
  } catch (error) {
    console.error('Store load warning: failed to back up corrupt data file:', error);
  }
}

function load() {
  try {
    if (!fs.existsSync(dataFile)) {
      return cloneDefaults();
    }

    const raw = fs.readFileSync(dataFile, 'utf-8');
    if (!String(raw || '').trim()) return cloneDefaults();

    try {
      const parsed = JSON.parse(raw);
      return sanitizeData(parsed);
    } catch {
      backupCorruptFile();
      return cloneDefaults();
    }
  } catch (e) { console.error('Store load error:', e); }
  return cloneDefaults();
}

function save(data) {
  try {
    const safeData = sanitizeData(data);
    const payload = JSON.stringify(safeData, null, 2);
    ensureDataDir();
    fs.writeFileSync(tempDataFile, payload, 'utf-8');

    try {
      fs.renameSync(tempDataFile, dataFile);
    } catch {
      // Fallback for filesystems where replace-via-rename can fail.
      fs.copyFileSync(tempDataFile, dataFile);
      fs.unlinkSync(tempDataFile);
    }

    return true;
  } catch (e) {
    console.error('Store save error:', e);
    try {
      if (fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
    } catch {
      // no-op
    }
    return false;
  }
}

module.exports = { load, save };
