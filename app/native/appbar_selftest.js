// node native/appbar_selftest.js — LIVE docking test (AppBar + window_set) on the real desktop.
// Waits up to 25 min until the PC is unlocked and idle >= 60 s, and aborts (cleaning up) as soon as anyone touches
// the mouse or keyboard. Only moves a throwaway window it creates itself (helper.exe --test-window); the owner's
// normal windows that the shell pushes aside while the work area is small are put back (by the helper on undock, and
// by this script as a safety net, never un-maximizing anything). No AppBar is ever left registered (checked at the end).
// Exit: 0 all passed, 1 a failure, 3 not run (never idle), 4 aborted (owner came back).
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const EXE = path.join(__dirname, 'bin', 'helper.exe');
const IDLE_MS = Number(process.env.IDLE_MS || 60000);
const MAX_WAIT_MS = Number(process.env.MAX_WAIT_MS || 25 * 60000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tol) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

function startHelper(extraEnv) {
  const p = spawn(EXE, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
  const pending = new Map();
  let next = 1, buf = '', exited = null;
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const w = pending.get(msg.id);
      if (w) { pending.delete(msg.id); w(msg); }
    }
  });
  p.on('exit', (code) => { exited = code; });
  const call = (cmd, args = {}) => new Promise((resolve, reject) => {
    if (exited !== null) return reject(new Error('helper exited'));
    const id = next++;
    pending.set(id, resolve);
    p.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
  });
  const ok = async (cmd, args) => { const r = await call(cmd, args); if (!r.ok) throw new Error(cmd + ': ' + r.error); return r.result; };
  const exit = () => new Promise((r) => { if (exited !== null) r(); else p.on('exit', r); });
  return { p, call, ok, exit };
}

let fail = 0;
const check = (pass, msg) => { console.log((pass ? 'PASS ' : 'FAIL ') + msg); if (!pass) fail++; };
const note = (msg) => console.log('NOTE ' + msg);

async function main() {
  const h = startHelper({});
  // ---- wait for an idle, unlocked PC ----
  const w0 = Date.now();
  for (;;) {
    const s = await h.ok('idle');
    if (!s.locked && s.idleMs >= IDLE_MS) { note(`idle ${Math.round(s.idleMs / 1000)} s, unlocked: starting`); break; }
    if (Date.now() - w0 > MAX_WAIT_MS) { console.log('NOT RUN: the PC was never idle and unlocked for 25 minutes'); h.p.stdin.end(); return 3; }
    await sleep(Math.min(15000, Math.max(3000, IDLE_MS - s.idleMs)));
  }
  const start = Date.now();
  const ownerIdle = async () => { const s = await h.ok('idle'); return !s.locked && s.idleMs >= Date.now() - start; };
  const ownerAway = async () => { if (!(await ownerIdle())) throw Object.assign(new Error('ABORT: someone is using the PC'), { abort: true }); };

  const base = await h.ok('work_area');
  const mon = base.monitor;
  const fg0 = await h.ok('foreground');
  const wins0 = (await h.ok('windows')).windows.filter((w) => !w.minimized);
  const workIs = async (want, ms) => { const t = Date.now(); do { if (same((await h.ok('work_area')).rect, want)) return Date.now() - t; await sleep(50); } while (Date.now() - t < ms); return -1; };
  const shrunk = (by) => [base.rect[0], base.rect[1], base.rect[2] - by, base.rect[3]];
  // owner windows (normal, not maximized) that are not where they were at the start
  const displaced = async () => {
    const now = (await h.ok('windows')).windows;
    return wins0.map((w) => ({ w, n: now.find((x) => x.hwnd === w.hwnd) }))
      .filter(({ w, n }) => n && !n.minimized && !n.maximized && !w.maximized && !near(n.rect, w.rect, 2));
  };
  const describe = (list) => list.map(({ w, n }) => `${w.process} ${w.rect.join(',')} -> ${n.rect.join(',')}`).join('; ');
  // test safety net: put displaced owner windows back (only while nobody is using the PC)
  const putOwnerBack = async () => {
    const list = await displaced();
    if (list.length && await ownerIdle()) for (const { w } of list) await h.call('window_set', { hwnd: w.hwnd, action: 'move', rect: w.rect });
    return list;
  };
  note(`monitor ${mon.join(',')}, work area ${base.rect.join(',')}, ${wins0.length} owner windows on screen`);

  let tw = null, hwnd = 0;
  const victims = [];
  const deadBars = []; // [pid, bar] of stopped helpers whose bar may linger
  let code = 0;
  try {
    tw = spawn(EXE, ['--test-window'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    hwnd = await new Promise((resolve, reject) => {
      let b = '';
      const t = setTimeout(() => reject(new Error('test window did not start')), 10000);
      tw.stdout.on('data', (d) => { b += d; const i = b.indexOf('\n'); if (i >= 0) { clearTimeout(t); resolve(JSON.parse(b.slice(0, i)).hwnd); } });
    });
    const rectOf = async () => { const w = (await h.ok('windows')).windows.find((x) => x.hwnd === hwnd); return w ? w.rect : []; };
    note('test window hwnd ' + hwnd);

    // 1. window_set move: the visible frame lands exactly on the rect
    await ownerAway();
    const box = [mon[0] + 200, mon[1] + 200, 900, 560];
    const mv = await h.ok('window_set', { hwnd, action: 'move', rect: box });
    check(mv.ok && near(mv.rect, box, 2), 'window_set move -> ' + mv.rect.join(',') + ' (asked ' + box.join(',') + ')');

    // 2. dock the right third
    await ownerAway();
    const S = Math.round(mon[2] / 3);
    const d = await h.ok('appbar', { action: 'dock', hwnd, edge: 'right', size: S });
    check(d.rect[2] === S && d.rect[0] + d.rect[2] === base.rect[0] + base.rect[2] && d.rect[1] === mon[1],
      `dock granted ${d.rect.join(',')} (width ${S}, right edge of the screen)`);
    check(same(d.work, shrunk(S)), `work area shrank by exactly ${S}: ${d.work.join(',')} (was ${base.rect.join(',')})`);
    check(same((await h.ok('work_area')).rect, shrunk(S)), 'work_area agrees');
    await sleep(900); // the helper notes which windows the shell pushed aside
    const pushed = await displaced();
    note(pushed.length ? 'the shell pushed owner windows aside: ' + describe(pushed) : 'no owner window was pushed aside');

    // 3. maximize the app: it fills exactly the left part
    await ownerAway();
    const mx = await h.ok('window_set', { hwnd, action: 'maximize' });
    await sleep(300);
    const mxr = await rectOf();
    check(mx.ok && near(mxr, shrunk(S), 2), `maximized app fits the left part: ${mxr.join(',')}`);

    // 4. dock again = re-place, no second reservation
    const d2 = await h.ok('appbar', { action: 'dock', hwnd, edge: 'right', size: S });
    check(same(d2.rect, d.rect) && same(d2.work, d.work), 'dock again is idempotent');

    // 5. undock: work area back, the maximized app grows back, pushed windows go back
    await ownerAway();
    const u = await h.ok('appbar', { action: 'undock', hwnd });
    const back = await workIs(base.rect, 3000);
    check(u.removed === 1 && back >= 0, `undock: work area restored in ${back} ms`);
    await sleep(500);
    const full = await rectOf();
    check(near(full, base.rect, 2), `maximized app re-fits the whole screen: ${full.join(',')}`);
    const left = await displaced();
    check(left.length === 0, `undock put back the ${u.restored} window(s) the dock pushed aside` + (left.length ? '; still moved: ' + describe(left) : ''));
    await putOwnerBack();

    // 6. restore / minimize / restore
    await ownerAway();
    const rs = await h.ok('window_set', { hwnd, action: 'restore' });
    check(rs.ok && !rs.maximized && !rs.minimized, 'restore -> ' + rs.rect.join(','));
    const mn = await h.ok('window_set', { hwnd, action: 'minimize' });
    check(mn.ok && mn.minimized, 'minimize');
    const rs2 = await h.ok('window_set', { hwnd, action: 'restore' });
    check(rs2.ok && !rs2.minimized, 'restore after minimize');

    // 6b. our own window straddling the strip: pushed on dock?, and put back on undock
    await ownerAway();
    const straddle = [mon[0] + mon[2] - S - 300, mon[1] + 250, 800, 500];
    const sm = await h.ok('window_set', { hwnd, action: 'move', rect: straddle });
    check(sm.ok, 'test window straddles the strip: ' + sm.rect.join(','));
    await h.ok('appbar', { action: 'dock', hwnd, size: S });
    await sleep(900);
    const pr = await rectOf();
    note(near(pr, straddle, 2) ? 'the shell did NOT push the test window (WinForms)' : 'the shell pushed the test window to ' + pr.join(','));
    const u2 = await h.ok('appbar', { action: 'undock', hwnd });
    await workIs(base.rect, 3000);
    await sleep(500);
    const br = await rectOf();
    check(near(br, straddle, 2), `after undock the test window is where it was: ${br.join(',')} (restored ${u2.restored})`);
    await putOwnerBack();

    // 7. may a helper register a window of ANOTHER process as the AppBar? (the test window is another process)
    await ownerAway();
    await h.ok('window_set', { hwnd, action: 'move', rect: box });
    const dr = await h.call('appbar', { action: 'dock', hwnd, size: 200, direct: true });
    if (dr.ok) {
      const t = await workIs(shrunk(200), 1500);
      note(`direct (foreign hwnd) registration: ABM_NEW accepted, work area ${t >= 0 ? 'shrank by 200' : 'did NOT shrink'}`);
      await h.ok('appbar', { action: 'undock', hwnd });
      check(await workIs(base.rect, 3000) >= 0, 'direct registration removed again');
    } else note('direct (foreign hwnd) registration refused: ' + dr.error);
    await sleep(300);
    await putOwnerBack();

    // 8. helper KILLED with the guard switched off: does the shell clean up a dead AppBar by itself?
    await ownerAway();
    const v1 = startHelper({ HELPER_NO_BAR_GUARD: '1' }); victims.push(v1);
    const d3 = await v1.ok('appbar', { action: 'dock', hwnd, size: 150 });
    check(await workIs(shrunk(150), 1500) >= 0, 'second helper docked 150 px');
    v1.p.kill(); deadBars.push([v1.p.pid, d3.bar]);
    const self = await workIs(base.rect, 4000);
    note(self >= 0 ? `the shell freed a killed helper's space by itself (${self} ms)` : "the shell KEEPS a killed helper's space (4 s): the guard is needed");
    if (self < 0) {
      const g = spawn(EXE, ['--appbar-guard', String(v1.p.pid), String(d3.bar)], { windowsHide: true, stdio: 'ignore' });
      await new Promise((r) => g.on('exit', r));
      const t = await workIs(base.rect, 3000);
      check(t >= 0, `guard (run by hand for the dead helper) freed the space in ${t} ms`);
    }
    await sleep(300);
    await putOwnerBack();

    // 9. helper KILLED with its guard: space comes back
    await ownerAway();
    const v2 = startHelper({}); victims.push(v2);
    const d4 = await v2.ok('appbar', { action: 'dock', hwnd, size: 150 });
    check(await workIs(shrunk(150), 1500) >= 0, 'guarded helper docked 150 px');
    await sleep(700); // the guard process is up
    v2.p.kill(); deadBars.push([v2.p.pid, d4.bar]);
    const g2 = await workIs(base.rect, 5000);
    check(g2 >= 0, `killed helper: its guard freed the space in ${g2} ms`);
    await sleep(300);
    await putOwnerBack();

    // 10. helper exits normally (stdin closed): it frees the space and puts pushed windows back itself
    await ownerAway();
    const v3 = startHelper({ HELPER_NO_BAR_GUARD: '1' }); victims.push(v3);
    const d5 = await v3.ok('appbar', { action: 'dock', hwnd, size: 150 });
    check(await workIs(shrunk(150), 1500) >= 0, 'third helper docked 150 px');
    await sleep(900);
    const p3 = await displaced();
    v3.p.stdin.end(); deadBars.push([v3.p.pid, d5.bar]);
    await v3.exit();
    const e3 = await workIs(base.rect, 4000);
    check(e3 >= 0, `helper exit (stdin closed) freed the space in ${e3} ms`);
    await sleep(500);
    const l3 = await displaced();
    check(l3.length === 0, `helper exit put back ${p3.length} pushed window(s)` + (l3.length ? '; still moved: ' + describe(l3) : ''));
    await putOwnerBack();

    // 11. the panel window closes without an undock: the dock notices, frees the space, puts windows back
    await ownerAway();
    await h.ok('appbar', { action: 'dock', hwnd, size: 150 });
    check(await workIs(shrunk(150), 1500) >= 0, 'docked for the test window again');
    await sleep(900);
    tw.stdin.end();
    const gone = await workIs(base.rect, 6000);
    check(gone >= 0, `panel window closed without undock: space freed in ${gone} ms`);
    await sleep(500);
    const l4 = await displaced();
    check(l4.length === 0, 'and pushed windows went back' + (l4.length ? '; still moved: ' + describe(l4) : ''));
  } catch (e) {
    if (e.abort) { console.log(e.message); code = 4; } else { check(false, 'error: ' + e.message); }
  } finally {
    // ---- clean up everything, whatever happened ----
    try { await h.ok('appbar', { action: 'undock' }); } catch (_) { }
    for (const v of victims) { try { v.p.kill(); } catch (_) { } }
    if (tw) { try { tw.stdin.end(); } catch (_) { } }
    await sleep(500);
    for (const [pid, bar] of deadBars) { // their helpers are gone: a guard run by hand removes a leftover record at once
      const g = spawn(EXE, ['--appbar-guard', String(pid), String(bar)], { windowsHide: true, stdio: 'ignore' });
      await new Promise((r) => g.on('exit', r));
    }
    const endWork = await workIs(base.rect, 4000);
    check(endWork >= 0, 'work area back to ' + base.rect.join(',') + ' at the end: ' + (await h.ok('work_area')).rect.join(','));
    await sleep(300);
    const fixed = await putOwnerBack();
    if (fixed.length) note('safety net put back: ' + describe(fixed));
    await sleep(500);
    const still = await displaced();
    check(still.length === 0, 'owner windows where they were' + (still.length ? ': ' + describe(still) : ''));
    try {
      const f = await h.ok('foreground');
      const now = (await h.ok('windows')).windows;
      if (f.hwnd !== fg0.hwnd && fg0.hwnd && now.some((w) => w.hwnd === fg0.hwnd)) { const r = await h.ok('focus', { hwnd: fg0.hwnd }); note('gave the focus back to ' + fg0.process + ': ' + r.ok); }
    } catch (_) { }
    h.p.stdin.end();
  }
  console.log(fail ? fail + ' FAILED' : code === 4 ? 'ABORTED (owner came back), cleaned up' : 'ALL PASSED');
  return fail ? 1 : code;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
