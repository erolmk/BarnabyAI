// File logger. Never writes to a console window (there is none in production).
const fs = require('fs');
const path = require('path');

let file = null;
const MAX = 5 * 1024 * 1024;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'app.log');
  try { if (fs.statSync(file).size > MAX) fs.renameSync(file, file + '.old'); } catch (_) {}
}

function fmt(x) {
  if (typeof x === 'string') return x;
  if (x instanceof Error) return x.stack || x.message;
  try { return JSON.stringify(x); } catch (_) { return String(x); }
}

function log(...args) {
  const line = new Date().toISOString() + ' ' + args.map(fmt).join(' ') + '\n';
  if (file) fs.appendFile(file, line, () => {});
  if (process.env.HELPER_DEBUG) process.stdout.write(line);
}

module.exports = { init, log, get file() { return file; } };
