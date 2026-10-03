const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const defaults = {
  'tokens.json': {},
  'reminders.json': [],
  'history.json': [],
  'contacts.json': {},
};

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const [file, value] of Object.entries(defaults)) {
    const location = path.join(dataDir, file);
    if (!fs.existsSync(location)) fs.writeFileSync(location, `${JSON.stringify(value, null, 2)}\n`);
  }
}

function readJson(file) {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

function writeJson(file, value) {
  ensureStore();
  const destination = path.join(dataDir, file);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, destination);
}

module.exports = { ensureStore, readJson, writeJson };