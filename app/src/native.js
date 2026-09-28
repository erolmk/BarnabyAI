// JSON-lines RPC to native/bin/helper.exe (see SPEC "Native helper protocol").
// Emits 'down' when the helper is gone (exit, spawn error) and 'up' when it answers again. It never gives up:
// a helper that dies, is quarantined or is damaged is retried with backoff (up to once a minute) while we run.
const { spawn } = require('child_process');
const readline = require('readline');
const EventEmitter = require('events');
const { log } = require('./log');

const MAX_BACKOFF = 60 * 1000;

class Native extends EventEmitter {
  constructor(exePath) {
    super();
    this.exe = exePath;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stopped = false;
    this.restarts = 0; // since the helper last answered (backoff)
    this.up = false;
    this.retry = null;
  }

  start() {
    this.stopped = false;
    clearTimeout(this.retry);
    let p;
    try {
      p = spawn(this.exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { // a zero-byte or damaged helper.exe throws here (EFTYPE, UNKNOWN), not as an 'error' event
      log('[native] spawn failed', e.message);
      return this._down(null);
    }
    this.proc = p;
    readline.createInterface({ input: p.stdout }).on('line', (line) => this._onLine(line));
    p.stderr.on('data', (d) => log('[native stderr]', d.toString().trim()));
    p.stdin.on('error', (e) => log('[native] stdin', e.message)); // EPIPE after a crash must not be uncaught
    p.on('error', (e) => { log('[native] error', e.message); this._down(p); }); // ENOENT (quarantined) comes here, no 'exit'
    p.on('exit', (code) => { log('[native] exited', code); this._down(p); });
  }

  // The helper is gone: its calls fail now, and it is started again after a backoff.
  _down(p) {
    if (p && this.proc !== p) return; // 'error' and 'exit' can both fire for one process
    this.proc = null;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('native helper exited')); }
    this.pending.clear();
    this.up = false;
    this.emit('down');
    if (this.stopped) return;
    this.restarts++;
    this.retry = setTimeout(() => { if (!this.stopped && !this.proc) this.start(); }, Math.min(500 * this.restarts, MAX_BACKOFF));
  }

  _onLine(line) {
    if (!this.up) { this.up = true; this.restarts = 0; this.emit('up'); }
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return log('[native] bad line', line.slice(0, 200)); }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result || {});
    else p.reject(new Error(msg.error || 'native error'));
  }

  call(cmd, args = {}, timeoutMs = 15000) {
    if (!this.proc) return Promise.reject(new Error('native helper not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('native ' + cmd + ' timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.proc) this.proc.kill();
  }
}

module.exports = { Native };
