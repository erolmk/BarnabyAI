// Self-test for native/bin/helper.exe.  node native/selftest.js [--no-input]
// Never calls speak or audio_set. The input test only touches a Notepad window it opens itself.
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const EXE = path.join(__dirname, 'bin', 'helper.exe');
const NO_INPUT = process.argv.includes('--no-input');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startHelper() {
  const p = spawn(EXE, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
      if (w) { pending.delete(msg.id); clearTimeout(w.t); w.resolve(msg); }
    }
  });
  p.stderr.on('data', (d) => process.stderr.write('[helper stderr] ' + d));
  p.on('exit', (code) => { exited = code; for (const w of pending.values()) w.reject(new Error('helper exited ' + code)); pending.clear(); });
  // call() resolves with the raw response {id, ok, result|error}
  const call = (cmd, args = {}, timeoutMs = 15000) => new Promise((resolve, reject) => {
    if (exited !== null) return reject(new Error('helper exited ' + exited));
    const id = next++;
    const t = setTimeout(() => { pending.delete(id); reject(new Error(cmd + ' timed out')); }, timeoutMs);
    pending.set(id, { resolve, reject, t });
    p.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
  });
  // ok() returns result or throws the helper's error
  const ok = async (cmd, args, timeoutMs) => {
    const r = await call(cmd, args, timeoutMs);
    if (!r.ok) throw new Error(cmd + ': ' + r.error);
    return r.result;
  };
  return { p, call, ok, alive: () => exited === null };
}

const results = [];
function record(name, pass, ms, detail) {
  results.push({ name, pass, ms, detail });
  console.log(`${pass === 'skip' ? 'SKIP' : pass ? 'PASS' : 'FAIL'}  ${name}  (${ms} ms)${detail ? '  ' + detail : ''}`);
}
// Tests that need the interactive desktop are skipped (not failed) while the session is locked.
let LOCKED = false;
async function desk(name, fn) {
  const t0 = Date.now();
  try { const d = await fn(); record(name, true, Date.now() - t0, d || ''); }
  catch (e) {
    const skip = LOCKED || /screen not available/.test(e.message); // capture refused on a locked / secure desktop
    record(name, skip ? 'skip' : false, Date.now() - t0, (skip ? 'no desktop: ' : '') + e.message);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function test(name, fn) {
  const t0 = Date.now();
  try { const d = await fn(); record(name, true, Date.now() - t0, d || ''); }
  catch (e) { record(name, false, Date.now() - t0, e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }

function elementLines(res, n) {
  return res.elements.slice(0, n).map((e) =>
    `    [${e.id}] ${e.role} "${e.name}"${e.value ? ' =' + JSON.stringify(e.value.slice(0, 40)) : ''} (${e.rect.join(',')})`).join('\n');
}

async function main() {
  const h = startHelper();
  let primary = null;
  LOCKED = (await h.ok('foreground')).locked;
  if (LOCKED) console.log('NOTE: session is locked - desktop-dependent tests will be skipped, not failed');

  await test('ping', async () => { const r = await h.ok('ping'); assert(r.pong === true && r.version === '1', JSON.stringify(r)); });
  await test('unknown cmd -> ok:false', async () => { const r = await h.call('nope'); assert(r.ok === false && /unknown/.test(r.error), JSON.stringify(r)); });

  await test('screen_info', async () => {
    const r = await h.ok('screen_info');
    primary = r.monitors.find((m) => m.primary);
    assert(r.width > 0 && r.height > 0 && r.scale > 0 && primary, JSON.stringify(r));
    return `${r.width}x${r.height} scale ${r.scale}, ${r.monitors.length} monitor(s): ` +
      r.monitors.map((m) => `${m.width}x${m.height}@${m.x},${m.y} s${m.scale}${m.primary ? ' primary' : ''}`).join('; ');
  });

  await desk('screenshot png', async () => {
    const r = await h.ok('screenshot', { maxWidth: 1280 });
    const b = Buffer.from(r.png, 'base64');
    assert(b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'bad PNG signature');
    const w = b.readUInt32BE(16), hh = b.readUInt32BE(20);
    assert(w === r.width && hh === r.height, `IHDR ${w}x${hh} vs ${r.width}x${r.height}`);
    assert(r.width <= 1280, 'not downscaled');
    assert(Math.abs(r.factor - primary.width / r.width) < 1e-9, 'factor ' + r.factor);
    return `${r.width}x${r.height} factor ${r.factor.toFixed(4)} ${Math.round(b.length / 1024)} KB`;
  });

  // Pure geometry + field matcher of the screenshot redaction (no screen needed).
  await test('redaction geometry (offline)', async () => {
    // 2000x1000 region at 100,50 scaled to 1000x500 (factor 2)
    const a = await h.ok('redact_map', { x: 100, y: 50, width: 2000, height: 1000, maxWidth: 1000, rects: [
      [300, 250, 401, 41],    // inside: odd edges round outward in the image
      [50, 20, 100, 60],      // sticks out top-left: clipped
      [3000, 0, 10, 10],      // outside: dropped
      [500, 500, 0, 10],      // empty: dropped
      [2050, 1000, 100, 100], // sticks out bottom-right: clipped
    ] });
    assert(a.width === 1000 && a.height === 500, 'size ' + a.width + 'x' + a.height);
    assert(same(a.src, [[200, 200, 401, 41], [0, 0, 50, 30], [1950, 950, 50, 50]]), 'src ' + JSON.stringify(a.src));
    assert(same(a.image, [[100, 100, 201, 21], [0, 0, 25, 15], [975, 475, 25, 25]]), 'image ' + JSON.stringify(a.image));
    // 1366x768 -> 1280x720 (non-integer factor), clipped to a window that ends at x=1000
    const b = await h.ok('redact_map', { x: 0, y: 0, width: 1366, height: 768, maxWidth: 1280, window: [0, 0, 1000, 768],
      rects: [[990, 700, 66, 68], [1200, 10, 50, 20]] });
    assert(b.width === 1280 && b.height === 720, 'size ' + b.width + 'x' + b.height);
    assert(same(b.src, [[990, 700, 10, 68]]) && same(b.image, [[927, 656, 11, 64]]), JSON.stringify(b));
    for (const r of b.image.concat(a.image)) assert(r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0, 'bad image rect ' + r);
    return `${a.image.length}/5 and ${b.image.length}/2 rects kept`;
  });

  await test('redaction field matcher (offline)', async () => {
    const secret = [{ name: 'Card number' }, { id: 'cc-number' }, { id: 'cardNumber' }, { id: 'ccnum' }, { name: 'CVV' },
      { name: 'Security code' }, { name: 'Social Security number' }, { name: 'SSN' }, { name: 'Routing number' },
      { name: 'Account number' }, { name: 'PIN' }, { name: 'Enter one-time code' }, { name: 'Password' }, { id: 'newpassword' },
      { name: 'Amount', value: '4111 1111 1111 1111' }, { name: 'Notes', value: '078-05-1120' }];
    const plain = [{ name: 'Email' }, { name: 'Cc' }, { name: 'Subject' }, { name: 'Search' }, { name: 'Business name' },
      { name: 'Pinterest' }, { name: 'Name on card' }, { name: 'Zip code' }, { name: 'Phone', value: '555-123-4567' },
      { name: 'Amount', value: '4111 1111 1111 1112' }];
    const r = await h.ok('redact_map', { width: 10, height: 10, fields: secret.concat(plain) });
    const bad = secret.concat(plain).filter((f, i) => r.secret[i] !== i < secret.length);
    assert(bad.length === 0, 'wrong: ' + JSON.stringify(bad));
    return `${secret.length} secret, ${plain.length} plain`;
  });

  await desk('screenshot redaction (live, read-only)', async () => {
    const t0 = Date.now();
    const r = await h.ok('screenshot', { maxWidth: 1280 });
    const took = Date.now() - t0;
    assert(typeof r.redacted === 'number' && Array.isArray(r.redactedRects) && r.redacted === r.redactedRects.length, JSON.stringify({ n: r.redacted, rects: r.redactedRects }));
    for (const q of r.redactedRects) assert(q[0] >= 0 && q[1] >= 0 && q[0] + q[2] <= r.width && q[1] + q[3] <= r.height, 'rect off image ' + q);
    assert(r.redactMs < 1500, 'redaction scan took ' + r.redactMs + ' ms');
    const off = await h.ok('screenshot', { maxWidth: 640, redact: false });
    assert(off.redacted === 0, 'redact:false still redacted ' + off.redacted);
    return `redacted ${r.redacted}${r.redactIncomplete ? ' (scan incomplete)' : ''}, scan ${r.redactMs} ms, total ${took} ms`;
  });

  await test('audio_status (read-only)', async () => {
    const r = await h.call('audio_status');
    if (!r.ok && /no sound device/.test(r.error)) return 'no sound device on this machine';
    assert(r.ok, r.error);
    const a = r.result;
    assert(typeof a.device === 'string' && Number.isInteger(a.volume) && a.volume >= 0 && a.volume <= 100 && typeof a.muted === 'boolean', JSON.stringify(a));
    return `"${a.device}" volume ${a.volume}${a.muted ? ' muted' : ''}`;
  });

  await desk('screenshot region jpeg', async () => {
    const r = await h.ok('screenshot', { x: primary.x, y: primary.y, width: 400, height: 300, format: 'jpeg', maxWidth: 1280 });
    const b = Buffer.from(r.jpeg, 'base64');
    assert(b[0] === 0xff && b[1] === 0xd8, 'bad JPEG signature');
    assert(r.width === 400 && r.height === 300 && r.factor === 1, JSON.stringify({ w: r.width, h: r.height, f: r.factor }));
    return `${Math.round(b.length / 1024)} KB`;
  });

  let wins = [];
  await test('windows', async () => {
    wins = (await h.ok('windows')).windows;
    assert(wins.length > 0, 'no windows');
    assert(wins.every((w) => Number.isInteger(w.pid) && w.pid > 0), 'window without pid');
    return `${wins.length} windows; e.g. ` + wins.slice(0, 4).map((w) => `${w.process}:"${w.title.slice(0, 30)}"`).join(', ');
  });

  let fg = null;
  await desk('foreground', async () => {
    fg = await h.ok('foreground');
    assert(fg.hwnd !== 0 && Number.isInteger(fg.pid) && fg.pid > 0, 'no foreground window / pid ' + JSON.stringify(fg));
    return `${fg.process} "${fg.title.slice(0, 50)}" rect ${fg.rect.join(',')}`;
  });

  await desk('elements (foreground)', async () => {
    const r = await h.ok('elements', { scope: 'foreground', max: 250 }, 20000);
    assert(Array.isArray(r.elements), 'no elements array');
    return `${r.window.process} "${r.window.title.slice(0, 40)}": ${r.elements.length} shown / ${r.found} found in ${r.ms} ms` +
      ` (find ${r.findMs} ms)${r.truncated ? ' truncated' : ''}\n` + elementLines(r, 15);
  });

  const browsers = wins.filter((w) => /^(msedge|chrome)$/i.test(w.process) && !w.minimized);
  if (browsers.length === 0) {
    record('elements (Edge/Chrome)', 'skip', 0, 'no Edge/Chrome window open');
  }
  for (const bw of browsers.slice(0, 2)) {
    await test(`elements (${bw.process} "${bw.title.slice(0, 30)}")`, async () => {
      const r = await h.ok('elements', { scope: 'window', hwnd: bw.hwnd, max: 250 }, 20000);
      const doc = r.elements.find((e) => e.role === 'Document');
      const toolbarBottom = bw.rect[1] + 150; // web content lives below tabs + toolbar
      const web = r.elements.filter((e) => e.rect[1] > toolbarBottom);
      assert(doc || web.length > 0, 'no web content elements found');
      return `${r.elements.length} shown / ${r.found} found in ${r.ms} ms (find ${r.findMs} ms), document ${doc ? 'yes' : 'no'}, ` +
        `${web.length} elements in page area${r.truncated ? ' truncated' : ''}\n` + elementLines(r, 15) +
        (web.length ? '\n    page area sample:\n' + elementLines({ elements: web }, 8) : '');
    });
    await test(`window_text (${bw.process})`, async () => {
      const r = await h.ok('window_text', { hwnd: bw.hwnd, max: 4000 }, 20000);
      assert(typeof r.text === 'string', 'no text');
      return `${r.text.length} chars in ${r.ms} ms: ${JSON.stringify(r.text.slice(0, 100))}`;
    });
  }

  await desk('window_text (foreground)', async () => {
    const r = await h.ok('window_text', { max: 4000 }, 20000);
    assert(typeof r.title === 'string' && typeof r.text === 'string', JSON.stringify(r).slice(0, 200));
    return `${r.text.length} chars in ${r.ms} ms`;
  });

  let cur = null;
  await test('cursor', async () => {
    cur = await h.ok('cursor');
    assert(Number.isInteger(cur.x) && Number.isInteger(cur.y), JSON.stringify(cur));
    return `${cur.x},${cur.y}`;
  });

  await test('window_at cursor', async () => {
    const r = await h.ok('window_at', cur);
    return `${r.process} "${r.title.slice(0, 40)}"`;
  });

  await dockOffline(h, wins);

  await test('wait_click 1500 ms (expect clicked:false) + concurrency', async () => {
    const t0 = Date.now();
    const wc = h.ok('wait_click', { timeoutMs: 1500 });
    const p0 = Date.now();
    await h.ok('ping');
    const pingMs = Date.now() - p0;
    const r = await wc;
    const took = Date.now() - t0;
    assert(pingMs < 500, 'ping blocked by wait_click: ' + pingMs + ' ms');
    assert(took >= 1400 && took < 3500, 'wait_click took ' + took);
    assert(r.clicked === false, 'clicked:true (did someone click the mouse?) ' + JSON.stringify(r));
    return `returned after ${took} ms, ping during wait ${pingMs} ms`;
  });

  await test('cancel_wait', async () => {
    const wc = h.ok('wait_click', { timeoutMs: 10000 });
    await sleep(300);
    const c = await h.ok('cancel_wait');
    const r = await wc;
    assert(c.cancelled >= 1 && r.clicked === false && r.cancelled === true, JSON.stringify({ c, r }));
  });

  await test('listen 2000 ms (no crash)', async () => {
    const r = await h.call('listen', { timeoutMs: 2000, culture: 'en-US' }, 15000);
    const pong = await h.ok('ping');
    assert(h.alive() && pong.pong, 'helper died');
    return r.ok ? `text ${JSON.stringify(r.result.text)} confidence ${r.result.confidence.toFixed(2)} (engine load ${r.result.loadMs} ms, total ${r.result.ms} ms)` : `ok:false (${r.error})`;
  });

  await test('listen 2000 ms again (cached engine, bounded time)', async () => {
    const t0 = Date.now();
    const r = await h.call('listen', { timeoutMs: 2000 }, 15000);
    const took = Date.now() - t0;
    assert(took < 6000, 'took ' + took + ' ms');
    return (r.ok ? `text ${JSON.stringify(r.result.text)}` : `ok:false (${r.error})`) + ` in ${took} ms`;
  });

  const lock = await h.ok('foreground');
  if (NO_INPUT) record('notepad input test', 'skip', 0, '--no-input');
  else if (lock.locked) {
    record('notepad input test', 'skip', 0, `screen is locked (${lock.process}): input would go to the lock screen`);
    await test('input refused while locked', async () => {
      const r = await h.call('key', { combo: 'shift' });
      assert(r.ok === false && /screen is locked|SendInput blocked/.test(r.error), JSON.stringify(r)); return r.error;
    });
  }
  else await notepadTest(h, cur);

  await test('exits when stdin closes', async () => {
    const t0 = Date.now();
    h.p.stdin.end();
    while (h.alive() && Date.now() - t0 < 3000) await sleep(50);
    assert(!h.alive(), 'still running after 3 s');
    return `exited after ${Date.now() - t0} ms`;
  });

  const failed = results.filter((r) => !r.pass);
  const skipped = results.filter((r) => r.pass === 'skip').length;
  console.log(`\n${results.length - failed.length - skipped} passed, ${failed.length} failed, ${skipped} skipped`);
  process.exit(failed.length ? 1 : 0);
}

// ---------------- docking / window_set / is_elevated / work_area / idle (offline) ----------------
// Read-only calls, and calls the helper must REJECT before touching anything. The live dock test is appbar_selftest.js.
async function dockOffline(h, wins) {
  const rejects = async (cmd, args, re) => {
    const r = await h.call(cmd, args);
    assert(r.ok === false && re.test(r.error), cmd + ' ' + JSON.stringify(args) + ' -> ' + JSON.stringify(r));
  };
  const info = await h.ok('screen_info');
  const prim = info.monitors.find((m) => m.primary);

  await test('is_elevated', async () => {
    const r = await h.ok('is_elevated');
    assert(typeof r.elevated === 'boolean' && typeof r.adminGroup === 'boolean' && ['default', 'full', 'limited'].includes(r.elevationType), JSON.stringify(r));
    assert(!r.elevated || r.adminGroup, 'elevated but not in Administrators ' + JSON.stringify(r));
    return JSON.stringify(r);
  });

  await test('work_area (primary, and per window)', async () => {
    const r = await h.ok('work_area');
    assert(same(r.rect, prim.work), 'SPI_GETWORKAREA ' + r.rect + ' vs monitor work ' + prim.work);
    assert(same(r.monitor, [prim.x, prim.y, prim.width, prim.height]), 'monitor ' + r.monitor);
    const w = wins.find((x) => !x.minimized);
    if (w) {
      const m = await h.ok('window_monitor', { hwnd: w.hwnd });
      const r2 = await h.ok('work_area', { hwnd: w.hwnd });
      assert(same(r2.rect, m.work), 'per-window work ' + r2.rect + ' vs ' + m.work);
    }
    return 'work ' + r.rect.join(',') + ' of ' + r.monitor.join(',');
  });

  await test('idle', async () => {
    const r = await h.ok('idle');
    assert(Number.isInteger(r.idleMs) && r.idleMs >= 0 && typeof r.locked === 'boolean', JSON.stringify(r));
    return `idle ${Math.round(r.idleMs / 1000)} s, locked ${r.locked}`;
  });

  await test('appbar rejects bad calls (nothing docked)', async () => {
    const any = wins[0] ? wins[0].hwnd : 0;
    await rejects('appbar', { action: 'park' }, /dock or undock/);
    await rejects('appbar', { action: 'dock', hwnd: any, edge: 'left', size: 300 }, /only edge right/);
    await rejects('appbar', { action: 'dock', hwnd: 0, size: 300 }, /no such window/);
    if (any) {
      await rejects('appbar', { action: 'dock', hwnd: any, size: prim.width }, /size must be/);
      await rejects('appbar', { action: 'dock', hwnd: any, size: 10 }, /size must be/);
    }
    const u = await h.ok('appbar', { action: 'undock' });
    assert(u.removed === 0, 'undock with nothing docked removed ' + u.removed);
    const after = await h.ok('work_area');
    assert(same(after.rect, prim.work), 'work area changed: ' + after.rect);
  });

  await test('window_set rejects bad calls (no window touched)', async () => {
    await rejects('window_set', { hwnd: 0, action: 'maximize' }, /no such window/);
    const w = wins.find((x) => !x.minimized);
    if (w) {
      await rejects('window_set', { hwnd: w.hwnd, action: 'noop' }, /action must be/);
      await rejects('window_set', { hwnd: w.hwnd, action: 'move', rect: [0, 0, 10, 10] }, /rect/);
    }
    // the taskbar strip (only when the taskbar reserves space at the bottom): refused before the action is read
    if (prim.work[3] < prim.height && prim.work[1] === prim.y) {
      const at = await h.ok('window_at', { x: prim.x + Math.floor(prim.width / 2), y: prim.y + prim.height - 3 });
      await rejects('window_set', { hwnd: at.hwnd, action: 'noop' }, /part of Windows itself/);
      return 'taskbar refused (' + at.process + ')';
    }
    return 'taskbar not at the bottom: refusal not checked';
  });

  await test('appbar guard process: exits at once for a dead helper, 2 on bad args', async () => {
    const dead = spawn(process.execPath, ['-e', '0'], { windowsHide: true });
    await new Promise((r) => dead.on('exit', r));
    const run = (args) => new Promise((resolve) => {
      const t0 = Date.now();
      const g = spawn(EXE, args, { windowsHide: true, stdio: 'ignore' });
      const kill = setTimeout(() => g.kill(), 8000);
      g.on('exit', (code) => { clearTimeout(kill); resolve({ code, ms: Date.now() - t0 }); });
    });
    const a = await run(['--appbar-guard', String(dead.pid), '0']); // bar 0: the shell has no such record, a no-op
    assert(a.code === 0 && a.ms < 3000, 'dead parent: ' + JSON.stringify(a));
    const b = await run(['--appbar-guard', 'x', 'y']);
    assert(b.code === 2, 'bad args: ' + JSON.stringify(b));
    return `dead parent ${a.ms} ms`;
  });
}

// ---------------- Notepad input test ----------------
const TEXT = 'helper self test';

async function notepadTest(h, savedCursor) {
  const t0 = Date.now();
  let nh = 0;
  const step = (s) => console.log('    notepad: ' + s);
  const isNotepad = (w) => /^notepad$/i.test(w.process);
  const guard = async () => {
    const f = await h.ok('foreground');
    if (f.hwnd !== nh) throw new Error(`ABORT: foreground is ${f.process} "${f.title}", not our Notepad`);
  };
  const editor = async () => {
    const r = await h.ok('elements', { scope: 'window', hwnd: nh, max: 400 }, 20000);
    const docs = r.elements.filter((e) => e.role === 'Document' || e.role === 'Edit');
    docs.sort((a, b) => b.rect[2] * b.rect[3] - a.rect[2] * a.rect[3]);
    return { r, doc: docs[0] };
  };
  const docText = async () => {
    const { doc } = await editor();
    if (doc && doc.value !== undefined) return doc.value;
    const t = await h.ok('window_text', { hwnd: nh, max: 4000 });
    return t.text.includes(TEXT) ? TEXT : (doc && doc.name === TEXT ? TEXT : '');
  };
  const exists = async () => (await h.ok('windows')).windows.some((w) => w.hwnd === nh);

  try {
    const before = new Set((await h.ok('windows')).windows.filter(isNotepad).map((w) => w.hwnd));
    step(`${before.size} Notepad window(s) already open (never touched)`);
    const o = await h.ok('open', { target: 'notepad.exe' });
    step('opened, pid ' + o.pid);
    for (let i = 0; i < 50 && !nh; i++) {
      await sleep(200);
      const w = (await h.ok('windows')).windows.find((x) => isNotepad(x) && !before.has(x.hwnd));
      if (w) nh = w.hwnd;
    }
    if (!nh) throw new Error('no NEW Notepad window appeared (not touching existing ones)');
    await sleep(600); // let it finish initialising
    const f = await h.ok('focus', { hwnd: nh });
    step('focus ok=' + f.ok);
    await guard();

    let { r: els, doc } = await editor();
    step(`${els.elements.length} elements in ${els.ms} ms; editor: ${doc ? doc.role + ' "' + doc.name + '" ' + doc.rect.join(',') + ' value=' + JSON.stringify(doc.value) : 'none'}`);
    if (!doc) throw new Error('no text area found in Notepad');
    if (doc.value !== '') throw new Error('ABORT: new Notepad tab is not verifiably empty: ' + JSON.stringify(doc.value));
    const wr = els.window.rect;
    const cx = doc.rect[0] + Math.floor(doc.rect[2] / 2), cy = doc.rect[1] + Math.floor(doc.rect[3] / 2);
    if (!(cx > wr[0] && cx < wr[0] + wr[2] && cy > wr[1] && cy < wr[1] + wr[3])) throw new Error('ABORT: editor centre outside window');
    const at = await h.ok('window_at', { x: cx, y: cy });
    if (at.hwnd !== nh) throw new Error(`ABORT: point ${cx},${cy} is covered by ${at.process}`);

    await guard();
    const ce = await h.ok('click_element', { id: doc.id }); // editor is not a pattern role -> real click at its centre
    step(`click_element -> ${ce.method} at ${ce.x},${ce.y}`);
    if (ce.method !== 'click' || Math.abs(ce.x - cx) > 2 || Math.abs(ce.y - cy) > 2) throw new Error('ABORT: click_element did not click the editor centre ' + JSON.stringify(ce));
    await h.ok('scroll', { x: cx, y: cy, amount: -1 });
    await guard();
    await h.ok('type', { text: TEXT });
    await sleep(400);
    const typed = await docText();
    record('notepad: click + type + read back', typed.trim() === TEXT, Date.now() - t0, 'read back ' + JSON.stringify(typed));

    // An injected (SendInput) click during wait_click must NOT count as the person's click.
    const t1 = Date.now();
    const wc = h.ok('wait_click', { timeoutMs: 2000, rect: doc.rect });
    await sleep(300);
    await guard();
    await h.ok('click', { x: cx, y: cy });
    const w = await wc;
    record('notepad: injected click ignored by wait_click', w.clicked === false, Date.now() - t1, JSON.stringify(w));

    // clean up: empty the tab (Windows 11 Notepad restores unsaved tabs), then close it
    const now = (await docText()).trim();
    if (now !== TEXT) throw new Error('ABORT: editor holds unexpected text ' + JSON.stringify(now));
    await guard();
    await h.ok('key', { combo: 'ctrl+a' });
    await guard();
    await h.ok('key', { combo: 'delete' });
    await sleep(300);
    const after = await docText();
    record('notepad: select all + delete', after.trim() === '', Date.now() - t1, 'text now ' + JSON.stringify(after));
  } catch (e) {
    record('notepad input test', false, Date.now() - t0, e.message);
  } finally {
    try {
      if (nh && (await exists())) {
        await h.ok('focus', { hwnd: nh });
        const f = await h.ok('foreground');
        let t = f.hwnd === nh ? (await docText()).trim() : null;
        if (t === TEXT) { // aborted after typing: remove only our own text
          await guard(); await h.ok('key', { combo: 'ctrl+a' });
          await guard(); await h.ok('key', { combo: 'delete' });
          await sleep(300);
          t = (await docText()).trim();
        }
        if (t === '') {
          await guard();
          await h.ok('key', { combo: 'ctrl+w' });
          for (let i = 0; i < 15 && (await exists()); i++) await sleep(200);
          if (await exists()) {
            const f2 = await h.ok('foreground');
            if (f2.hwnd === nh && (await docText()).trim() === '') await h.ok('key', { combo: 'alt+f4' });
            for (let i = 0; i < 15 && (await exists()); i++) await sleep(200);
          }
        }
        record('notepad: window closed', !(await exists()), Date.now() - t0, (await exists()) ? `left open (hwnd ${nh}, text ${JSON.stringify(t)})` : '');
      }
    } catch (e) { record('notepad: cleanup', false, Date.now() - t0, e.message); }
    if (savedCursor) {
      await h.ok('move', savedCursor);
      const c = await h.ok('cursor');
      record('cursor restored', c.x === savedCursor.x && c.y === savedCursor.y, 0, `${c.x},${c.y}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
