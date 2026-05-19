const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const adminFile = path.join(dataDir, 'admin.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || 'local-book-as-a-gift-admin-session-secret';
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
}

function createRecord(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    username,
    salt,
    passwordHash: hashPassword(password, salt),
    updatedAt: new Date().toISOString()
  };
}

function readAdminRecord() {
  ensureDataDir();
  if (!fs.existsSync(adminFile)) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin';
    const record = createRecord(username, password);
    fs.writeFileSync(adminFile, JSON.stringify(record, null, 2));
    return record;
  }
  return JSON.parse(fs.readFileSync(adminFile, 'utf8'));
}

function writeAdminRecord(record) {
  ensureDataDir();
  fs.writeFileSync(adminFile, JSON.stringify(record, null, 2));
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(username, password) {
  const record = readAdminRecord();
  if (record.username !== String(username || '')) return false;
  const attemptedHash = hashPassword(password || '', record.salt);
  return safeCompare(attemptedHash, record.passwordHash);
}

function signToken(username) {
  const payload = {
    username,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 12
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || !String(token).includes('.')) return null;
  const [encoded, signature] = String(token).split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  if (!safeCompare(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    const record = readAdminRecord();
    if (record.username !== payload.username) return null;
    return payload;
  } catch {
    return null;
  }
}

function loginAdmin(username, password) {
  if (!verifyPassword(username, password)) return null;
  return { token: signToken(username), username };
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Admin login required.' });
  req.admin = payload;
  next();
}

function updateAdminCredentials(username, password) {
  const nextUsername = String(username || '').trim();
  const nextPassword = String(password || '').trim();
  if (nextUsername.length < 3) throw new Error('Admin username must be at least 3 characters.');
  if (nextPassword.length < 6) throw new Error('Admin password must be at least 6 characters.');
  const record = createRecord(nextUsername, nextPassword);
  writeAdminRecord(record);
  return { token: signToken(nextUsername), username: nextUsername };
}

function getAdminProfile() {
  const record = readAdminRecord();
  return { username: record.username, updatedAt: record.updatedAt };
}

module.exports = { loginAdmin, requireAdmin, updateAdminCredentials, getAdminProfile };
