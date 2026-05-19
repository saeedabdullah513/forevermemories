const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function readJson(fileName, fallback) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(fileName, data) {
  const filePath = path.join(dataDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function updateJson(fileName, updater, fallback) {
  const current = readJson(fileName, fallback);
  const next = updater(current);
  writeJson(fileName, next);
  return next;
}

module.exports = { readJson, writeJson, updateJson };
