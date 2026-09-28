// node native/wake_selftest.js — wake phrase accuracy (synthesized WAVs, nothing played aloud),
// wake_cancel, and window_monitor / per-monitor screenshot. Exits 1 on any failure.
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const exe = path.join(__dirname, 'bin', 'helper.exe');
const fx = path.join(__dirname, '..', 'test', 'fixtures', 'wake');
const p = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let id = 0;
const pending = new Map();
readline.createInterface({ input: p.stdout }).on('line', (l) => {
  const m = JSON.parse(l);
  const f = pending.get(m.id);
  if (f) { pending.delete(m.id); f(m); }
});
const call = (cmd, args = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); p.stdin.write(JSON.stringify({ id: i, cmd, args }) + '\n'); });

(async () => {
  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fail++; };

  for (const f of ['pos_hello', 'pos_hey', 'pos_slow', 'neg_everybody', 'neg_photos', 'neg_barney', 'neg_library', 'neg_barbara']) {
    const r = await call('wake_wait', { timeoutMs: 15000, wavFile: path.join(fx, f + '.wav') });
    const want = f.startsWith('pos');
    const got = r.ok && r.result.heard;
    check(r.ok && got === want, f + ' -> heard=' + got + (r.ok ? ' "' + r.result.phrase + '" conf=' + r.result.confidence.toFixed(2) : ' ERR ' + r.error));
  }

  // cancel: a microphone wait must end promptly on wake_cancel (skip if there is no microphone)
  const t0 = Date.now();
  const w = call('wake_wait', { timeoutMs: 20000 });
  setTimeout(() => call('wake_cancel'), 800);
  const r = await w;
  if (!r.ok && /microphone/i.test(r.error)) console.log('SKIP cancel (no microphone)');
  else check(r.ok && r.result.cancelled && Date.now() - t0 < 5000, 'wake_cancel ends the wait in ' + (Date.now() - t0) + ' ms');

  const info = await call('screen_info');
  const wins = await call('windows');
  const list = (wins.result && wins.result.windows) || [];
  for (const win of list.slice(0, 12)) {
    const m = await call('window_monitor', { hwnd: win.hwnd });
    if (!m.ok) { check(false, 'window_monitor ' + win.title + ': ' + m.error); continue; }
    const r2 = m.result;
    const cx = win.rect[0] + win.rect[2] / 2, cy = win.rect[1] + win.rect[3] / 2;
    const inside = cx >= r2.x && cx < r2.x + r2.width && cy >= r2.y && cy < r2.y + r2.height;
    check(inside || win.minimized, 'window_monitor "' + String(win.title).slice(0, 30) + '" -> ' + (r2.primary ? 'primary' : 'second') + ' ' + r2.width + 'x' + r2.height + ' scale ' + r2.scale);
  }
  const second = (info.result.monitors || []).find((m) => !m.primary);
  const onSecond = [];
  for (const win of list) {
    const m = await call('window_monitor', { hwnd: win.hwnd });
    if (m.ok && !m.result.primary && !win.minimized) onSecond.push(win);
  }
  if (second && onSecond.length) {
    const s = await call('screenshot', { hwnd: onSecond[0].hwnd, maxWidth: 1280, format: 'jpeg' });
    check(s.ok && s.result.originX === second.x && s.result.originY === second.y, 'screenshot of a second-screen window starts at its monitor (' + (s.ok ? s.result.originX + ',' + s.result.originY : s.error) + ')');
  } else console.log('SKIP second-monitor screenshot (no window on a second screen right now)');

  p.stdin.end();
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
