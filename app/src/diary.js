// Safety diary (userData/safety-diary.jsonl, one {time, kind, what} per line, never page text) and the
// age-based retention main.js runs at startup: diary 90 days, logs 14 days (04_safety 7.1).
const fs = require('fs');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;

function append(file, { kind, what }, now = Date.now()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ time: new Date(now).toISOString(), kind, what }) + '\n');
}

function read(file) {
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  return txt.split('\n').map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
    .filter((e) => e && e.time && !isNaN(Date.parse(e.time)));
}

// Drops entries older than maxAgeMs (and unreadable lines). -> number dropped.
function prune(file, maxAgeMs, now = Date.now()) {
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  const keep = read(file).filter((e) => now - Date.parse(e.time) < maxAgeMs);
  if (keep.length === lines.length) return 0;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, keep.map((e) => JSON.stringify(e) + '\n').join(''));
  fs.renameSync(tmp, file);
  return lines.length - keep.length;
}

// Log files untouched for maxAgeMs are deleted; newer ones lose the lines written before the cutoff
// (log lines start with an ISO time; lines without one belong to the line above).
function pruneLogs(dir, maxAgeMs, now = Date.now()) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return; }
  const cutoff = now - maxAgeMs;
  for (const n of names) {
    const f = path.join(dir, n);
    try {
      const st = fs.statSync(f);
      if (!st.isFile()) continue;
      if (st.mtimeMs < cutoff) { fs.unlinkSync(f); continue; }
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      const i = lines.findIndex((l) => { const t = Date.parse(l.slice(0, 24)); return /^\d{4}-/.test(l) && t >= cutoff; });
      if (i > 0) fs.writeFileSync(f, lines.slice(i).join('\n'));
    } catch (_) { /* a locked or vanished file is retried next start */ }
  }
}

// "Today 3:42 PM", "Tuesday 3:42 PM" (last 6 days) or "September 12, 3:42 PM".
function when(iso, now = Date.now()) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date(now).toDateString()) return 'Today ' + time;
  if (now - d.getTime() < 6 * DAY) return d.toLocaleDateString('en-US', { weekday: 'long' }) + ' ' + time;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + ', ' + time;
}

module.exports = { DAY, append, read, prune, pruneLogs, when };
