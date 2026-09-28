// Main process: windows, IPC, the `ui` bridge for the agent, Scam Shield loop, tray, shortcuts.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const logm = require('./src/log');
const { log } = logm;
const product = require('./src/product');
const { Config } = require('./src/config');
const { Native } = require('./src/native');
const llm = require('./src/llm');
const tts = require('./src/tts');
const jev = require('./src/jev');
const { normalizeAnswer } = require('./src/answers');
const geom = require('./src/widgetgeom');
const diary = require('./src/diary');
const alerts = require('./src/alerts');
const startup = require('./src/startup');

const SMOKE = process.argv.includes('--smoke');
const START_HIDDEN = process.argv.includes('--hidden');
// The browser demo (a streamed Windows session on AWS): no setup wizard, no taskbar pin, and clicks that reach us
// through the stream count as the person's (the stream injects them, so the R19 hook would otherwise see none).
const DEMO = process.argv.includes('--demo');
if (DEMO) process.env.BARNABY_ALLOW_INJECTED = '1';

// Dev launch (Open Barnaby.vbs): an elevated start does not inherit the caller's environment, so the launcher passes
// where the key is instead (--key-file=<a file with an OPENROUTER_API_KEY=... line>). It is only read, never copied.
const KEY_FILE = (process.argv.find((a) => a.startsWith('--key-file=')) || '').slice('--key-file='.length);
if (KEY_FILE && !process.env.OPENROUTER_API_KEY) {
  try { const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(fs.readFileSync(KEY_FILE, 'utf8')); if (m) process.env.OPENROUTER_API_KEY = m[1].trim(); } catch (_) {}
}

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('com.hellobarnaby.app');

let config, native, agent, guardian, lessons, memory, support, apps, router;
let launcherWin = null, widgetWin = null, overlayWin = null, settingsWin = null, tray = null;
let widgetExpanded = false, confirmOpen = false;
let lastStatus = { state: 'idle' };
let lastTarget = null;
let pendingAsk = null; // {requestId, kind, choices, resolve, reject}
let askSeq = 0, saySeq = 0;
const pendingSay = new Map();
let quitting = false;
let wake = null, micOpen = false;

const P = (...p) => path.join(__dirname, ...p);
const UD = (...p) => path.join(app.getPath('userData'), ...p);
const DIARY = 'safety-diary.jsonl', STATS = 'stats.json';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const helperExe = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'native', 'helper.exe')
  : P('native', 'bin', 'helper.exe'));

function alive(w) { return w && !w.isDestroyed(); }
function send(w, ch, payload) { if (alive(w)) w.webContents.send(ch, payload); }
function broadcast(ch, payload) { for (const w of [launcherWin, widgetWin, overlayWin, settingsWin]) send(w, ch, payload); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { log('readJson failed', file, e.message); return fallback; }
}

// ---------- windows ----------
const WEB = { preload: P('preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };

// A crashed or hung renderer is reloaded: a dead transparent widget paints nothing, so the helper would vanish
// while the process (and the single-instance lock) lives on. After any load the widget gets main's state back.
function watchRenderer(w, name) {
  const wc = w.webContents;
  let hung = null;
  wc.on('render-process-gone', (_e, d) => {
    log('[window] renderer gone', name, d && d.reason);
    if (!quitting && alive(w)) wc.reload();
  });
  w.on('unresponsive', () => {
    clearTimeout(hung);
    hung = setTimeout(() => { if (!quitting && alive(w)) { log('[window] still hung, restarting', name); wc.forcefullyCrashRenderer(); } }, 15000);
  });
  w.on('responsive', () => clearTimeout(hung));
  wc.on('did-finish-load', () => {
    send(w, 'status', lastStatus);
    if (w !== widgetWin) return;
    send(w, 'widget-state', { expanded: widgetExpanded, docked: !!dock });
    if (pendingAsk) send(w, 'ask', pendingAsk.msg); // the open question comes back instead of hanging unseen
  });
}

function createLauncher() {
  const wa = screen.getPrimaryDisplay().workArea;
  launcherWin = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height, frame: false, show: false,
    backgroundColor: '#F7F4EE', title: product.name, webPreferences: WEB,
  });
  launcherWin.setMenu(null);
  watchRenderer(launcherWin, 'launcher');
  launcherWin.loadFile(P('ui', 'launcher.html'));
  launcherWin.once('ready-to-show', () => { if (!SMOKE && !START_HIDDEN) { launcherWin.maximize(); launcherWin.show(); } });
  launcherWin.on('close', (e) => { if (!quitting) { e.preventDefault(); askToQuit(); } });
  launcherWin.on('query-session-end', () => { quitting = true; }); // Windows shutting down: no question
}

// Size and place the widget for its state (src/widgetgeom.js). Docked (settings.dockPanel, the default): the open
// panel is the right third of the screen. Floating: the panel grows with the text size and for a confirm card, and
// the collapsed pill snaps into the screen corner nearest to where the panel was. Closing a docked panel puts the
// pill back in the corner it had before.
function layoutWidget() {
  if (!alive(widgetWin)) return;
  if (dockWanted()) {
    if (!dock) startDock();
    widgetWin.setBounds(dock.panel);
    return;
  }
  let cur = widgetWin.getBounds(), wa = screen.getDisplayMatching(cur).workArea;
  if (dock) { wa = dock.wa; cur = geom.atCorner(geom.size(false, wa), dock.corner, wa); endDock(); }
  widgetWin.setBounds(geom.bounds(cur, widgetExpanded, wa, { scale: config.get().textScale, confirm: confirmOpen }));
}

function createWidget() {
  widgetWin = new BrowserWindow({
    ...geom.bounds(null, false, screen.getPrimaryDisplay().workArea), frame: false, transparent: true, resizable: false, maximizable: false,
    minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    show: false, title: product.assistantName, backgroundColor: '#00000000', webPreferences: WEB,
  });
  widgetWin.setAlwaysOnTop(true, 'screen-saver');
  // Keep our own UI out of the agent's screenshots (also hides it from screen sharing).
  widgetWin.setContentProtection(true);
  widgetWin.setVisibleOnAllWorkspaces(true);
  widgetWin.setMenu(null);
  watchRenderer(widgetWin, 'widget');
  widgetWin.loadFile(P('ui', 'widget.html'));
  widgetWin.once('ready-to-show', () => { if (!SMOKE) widgetWin.showInactive(); });
  widgetWin.on('close', (e) => { if (!quitting) { e.preventDefault(); askToQuit(); } });
}

function expandWidget(expanded) {
  if (!alive(widgetWin)) return;
  widgetExpanded = !!expanded;
  layoutWidget();
  send(widgetWin, 'widget-state', { expanded: widgetExpanded, docked: !!dock });
}

// ---------- docked panel ----------
// Open, Barnaby is the right third of the screen the person is using, full height, and the program they use fills
// the other two thirds; closed, the pill goes back to its corner and the program gets the whole screen again.
// The panel registers as a Windows AppBar (native 'appbar'), so the work area shrinks: maximized windows re-fit by
// themselves and new ones open beside him. Without an AppBar (older helper, a failure) the panel still takes the
// right third and the program is moved beside it (native 'window_set'). The hidden smoke run (and --no-appbar)
// registers no AppBar and moves no real window: geometry only.
// ponytail: another bar already on the right edge is not measured (the rect the shell returns is ignored).
const NO_APPBAR = SMOKE || process.argv.includes('--no-appbar');
const DOCK_FILE = 'dock.json'; // {hwnd} while an AppBar is registered: after a crash the next start removes it
let dock = null; // {id, wa, panel, left, corner, appbar, hwnd, fitted:Set(hwnd), moved:Set(hwnd)}
let dockChain = Promise.resolve();
let dockNativeCalls = 0; // the smoke run checks it stays 0
const lastDock = new Map(); // display id -> the last dock there (its work area stays short until the shell catches up)
const dockWanted = () => widgetExpanded && !!config && config.get().dockPanel !== false;
const queueDock = (f) => { dockChain = dockChain.then(f).catch((e) => log('[dock]', e.message)); return dockChain; };
function dockCall(cmd, args) { dockNativeCalls++; return native.call(cmd, args, 5000); }

function hwndOf(w) {
  const b = w.getNativeWindowHandle();
  return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0);
}
const physRect = (r) => { const p = screen.dipToScreenRect(null, r); return [p.x, p.y, p.width, p.height]; };
function dipRect(a) {
  if (!Array.isArray(a) || !(a[2] > 0 && a[3] > 0)) return null;
  try { return screen.screenToDipRect(null, { x: a[0], y: a[1], width: a[2], height: a[3] }); } catch (_) { return null; }
}
// Within 1 DIP: on a screen with non-integer scaling (e.g. 150% next to 200%) Windows rounds window sizes by a pixel.
const near = (p, q) => Math.abs(p - q) <= 1;
const sameRect = (a, b) => !!a && !!b && near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);

// Now: the geometry and the window. Then, in order: the AppBar, the home screen, the program.
function startDock() {
  const cur = widgetWin.getBounds();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); // the screen the person is using
  const prev = lastDock.get(d.id);
  const wa = prev && sameRect(d.workArea, prev.left) ? prev.wa : { ...d.workArea }; // our last AppBar still counted
  dock = { id: d.id, wa, ...geom.dock(wa, d.bounds.width, config.get().textScale), corner: geom.nearestCorner(cur, screen.getDisplayMatching(cur).workArea),
    appbar: false, hwnd: 0, fitted: new Set(), moved: new Set() };
  lastDock.set(d.id, dock);
  const mine = dock;
  queueDock(() => registerDock(mine));
}
async function registerDock(d) {
  if (dock !== d || NO_APPBAR) return;
  try {
    const hwnd = hwndOf(widgetWin);
    await dockCall('appbar', { action: 'dock', hwnd, edge: 'right', size: physRect(d.panel)[2] });
    d.appbar = true;
    d.hwnd = hwnd;
    try { fs.writeFileSync(UD(DOCK_FILE), JSON.stringify({ hwnd })); } catch (_) {}
  } catch (e) { log('[dock] no AppBar, the program is moved beside the panel instead:', e.message); }
  if (dock !== d) return; // closed meanwhile: the undock queued after us removes the AppBar
  fitLauncher();
  await fitWindow(lastTarget, true);
}
function endDock() {
  const d = dock;
  dock = null;
  queueDock(() => releaseDock(d));
}
async function releaseDock(d) {
  if (d.appbar) {
    try { await dockCall('appbar', { action: 'undock', hwnd: d.hwnd }); } catch (e) { log('[dock] undock', e.message); }
    try { fs.rmSync(UD(DOCK_FILE), { force: true }); } catch (_) {}
  }
  // Maximized programs grow back with the work area by themselves; the ones moved beside the panel are maximized.
  for (const hwnd of d.moved) await dockCall('window_set', { hwnd, action: 'maximize' }).catch(() => {});
  if (!dock) fitLauncher();
}
// A program fits into the left two thirds once: at docking the one the person was using (force); later a window
// that comes to the front reaching under the panel (a new browser window). Small dialogs and other screens are left.
async function fitWindow(t, force) {
  const d = dock;
  if (!d || NO_APPBAR || !t || !t.hwnd || t.pid === process.pid || t.minimized || d.fitted.has(t.hwnd)) return;
  d.fitted.add(t.hwnd);
  const r = dipRect(t.rect);
  if (!r || screen.getDisplayMatching(r).id !== d.id || !(force || geom.needsFit(r, d.panel))) return;
  try {
    if (d.appbar) await dockCall('window_set', { hwnd: t.hwnd, action: 'maximize' });
    else { await dockCall('window_set', { hwnd: t.hwnd, action: 'move', rect: physRect(d.left) }); d.moved.add(t.hwnd); }
  } catch (e) { log('[dock] window_set', e.message); }
}
// The home screen shares the screen like any program: the left two thirds while docked, all of it otherwise.
function fitLauncher(force) {
  if (!alive(launcherWin) || launcherWin.isMinimized() || !(force || launcherWin.isVisible())) return;
  if (dock && screen.getDisplayMatching(launcherWin.getBounds()).id === dock.id) launcherWin.setBounds(dock.left);
  else launcherWin.maximize();
}
// A crash leaves the AppBar registered (the work area stays short): remove it by the handle the last run wrote down.
function cleanStaleDock() {
  let old = 0;
  try { old = +JSON.parse(fs.readFileSync(UD(DOCK_FILE), 'utf8')).hwnd || 0; } catch (_) { return; }
  if (NO_APPBAR) return;
  log('[dock] removing the AppBar a previous run left behind');
  dockCall('appbar', { action: 'undock', hwnd: old }).catch((e) => log('[dock] stale undock', e.message))
    .then(() => { try { fs.rmSync(UD(DOCK_FILE), { force: true }); } catch (_) {} });
}

function createOverlay() {
  const d = screen.getPrimaryDisplay();
  overlayWin = new BrowserWindow({
    ...d.bounds, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, fullscreenable: false,
    backgroundColor: '#00000000', webPreferences: WEB,
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWin.setContentProtection(true);
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setMenu(null);
  watchRenderer(overlayWin, 'overlay');
  overlayWin.loadFile(P('ui', 'overlay.html'));
  overlayWin.on('close', (e) => { if (!quitting) e.preventDefault(); });
}

function openSettings() {
  if (alive(settingsWin)) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1040, height: 860, show: false, title: product.name + ' — Settings',
    backgroundColor: '#F7F4EE', webPreferences: WEB,
  });
  settingsWin.setMenu(null);
  watchRenderer(settingsWin, 'settings');
  settingsWin.loadFile(P('ui', 'settings.html'));
  settingsWin.once('ready-to-show', () => { if (!SMOKE) settingsWin.show(); });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function showLauncher() {
  if (!alive(launcherWin)) return;
  if (launcherWin.isMinimized()) launcherWin.restore();
  fitLauncher(true);
  launcherWin.show();
  launcherWin.focus();
}
function hideLauncher() { if (alive(launcherWin) && !launcherWin.isMinimized()) launcherWin.minimize(); }

// Physical screen px (native helper) -> overlay-local DIP.
function toDip(rect) {
  const [x, y, w, h] = rect;
  let r;
  try { r = screen.screenToDipRect(null, { x, y, width: w, height: h }); } catch (_) {
    const sf = screen.getPrimaryDisplay().scaleFactor || 1;
    r = { x: x / sf, y: y / sf, width: w / sf, height: h / sf };
  }
  const ob = alive(overlayWin) ? overlayWin.getBounds() : { x: 0, y: 0 };
  return [Math.round(r.x - ob.x), Math.round(r.y - ob.y), Math.round(r.width), Math.round(r.height)];
}

// The overlay covers one display: the one holding the ring or the warned-about window (second screens, WR-1).
function placeOverlay(physRect) {
  if (!alive(overlayWin)) return;
  let d = screen.getPrimaryDisplay();
  if (Array.isArray(physRect) && physRect[2] > 0 && physRect[3] > 0) {
    const [x, y, width, height] = physRect;
    try { d = screen.getDisplayMatching(screen.screenToDipRect(null, { x, y, width, height })); } catch (_) { /* primary */ }
  }
  const b = overlayWin.getBounds(), t = d.bounds;
  if (b.x === t.x && b.y === t.y && b.width === t.width && b.height === t.height) return;
  overlayWin.setBounds(t);
  overlayWin.setBounds(t); // twice: a move between displays of different scaling sizes the first one wrongly
}

// A warning card stays until the person closes it, or Stop / Home / closing the page (UX 12): the agent's
// clearOverlay and its rings never wipe it (clearWarning does).
let warningShown = false;
function overlay(msg) {
  if (!alive(overlayWin)) return;
  warningShown = msg.type === 'warning';
  send(overlayWin, 'overlay', msg);
  if (SMOKE) return; // the hidden test run never puts the overlay on the real screen
  if (msg.type === 'clear') {
    overlayWin.setIgnoreMouseEvents(true);
    overlayWin.setFocusable(false);
    overlayWin.hide();
  } else {
    const interactive = msg.type === 'warning';
    overlayWin.setIgnoreMouseEvents(!interactive);
    overlayWin.setFocusable(interactive);
    overlayWin.showInactive();
    if (interactive) overlayWin.focus();
  }
}

// ---------- the ui bridge the agent talks to ----------
// UX 14: reading-time wait max(2500, 350 ms/word at the normal 0.9 pace, scaled by the chosen speed); when speaking
// this is only a fallback for a lost ack (the natural voice gets 6 s on top: its first sentence takes 1-2 s to arrive).
function readingMs(text, muted, natural, rate) {
  const words = text.split(/\s+/).length;
  const read = Math.max(2500, 350 * words * 0.9 / (Number(rate) || 0.9));
  return muted ? read : read + (natural ? 6000 : 4000);
}

// Barnaby's natural voice (src/tts.js, research/07_voice.md). Every spoken line (ui.say and ui.ask) is captioned now,
// and its synthesis starts now too, while the line before it may still be playing; the sentences go to the widget
// as PCM over 'tts'. The widget's ack for the line, Talk and Stop cancel what is still being made. A failure: the
// Windows voice for the rest of that line and 5 minutes. Muted lines, and lines holding a private number, never
// reach the voice service.
const voiceOut = tts.createSpeaker({ send: (m) => send(widgetWin, 'tts', m), log, onProblem: (kind) => connectionProblem(kind) });
// again: the widget's "Say it again" (no second caption; a little slower, UX 9.5).
function speakOut(id, text, again) {
  const s = config.get();
  let sensitive = false;
  try { sensitive = !!(guardian && guardian.sensitive(text)); } catch (_) { sensitive = true; }
  const plan = voiceOut.plan(s, text, sensitive);
  if (plan && again) plan.speed = Math.max(0.5, Math.round((plan.speed - 0.05) * 100) / 100);
  send(widgetWin, 'say', { id, text, speak: !s.muted, natural: !!plan, again: !!again }); // before any 'tts' for this id
  if (plan) voiceOut.run(id, text, plan);
  return !!plan;
}

const ui = {
  ownPid: process.pid,
  say(text, { wait = true, again = false } = {}) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve();
    const id = ++saySeq;
    const { muted, speechRate } = config.get();
    if (!widgetExpanded) expandWidget(true); // every spoken line is captioned; the collapsed pill has no caption (UX 5.1)
    if (wake) wake.pause(); // never let Barnaby's own voice ("I'm Barnaby...") wake him
    const natural = speakOut(id, text, again);
    if (!again) send(launcherWin, 'say', { id, text, speak: false });
    log('[say]', text.length + ' chars'); // the log never holds what was said (04_safety 7.1)
    // Muted, the widget acks as soon as the caption is up, so the reading time decides (UX 5.2). Stop ends it at once.
    // A wait:false line is registered too, so the wake loop stays paused until Barnaby's voice has finished.
    const spoken = new Promise((resolve) => {
      const done = () => { clearTimeout(t); pendingSay.delete(id); resolve(); };
      const t = setTimeout(done, readingMs(text, !!muted, natural, speechRate));
      pendingSay.set(id, { done, byAck: !muted });
    });
    return wait ? spoken : Promise.resolve();
  },
  status(st) { lastStatus = st || { state: 'idle' }; broadcast('status', lastStatus); },
  ask({ question, choices = [], kind = 'choice', details = null, noAutoMic = false }) {
    if (pendingAsk) ui.cancelAsk();
    const requestId = 'q' + (++askSeq);
    confirmOpen = kind === 'confirm'; // the confirm card may use up to 90% of the screen height
    expandWidget(true);
    const id = ++saySeq;
    // sayId: the widget opens the mic once it is said; noAutoMic: main's own questions (a scam page's looping voice or
    // a TV must never answer them, and what they hear would become a new request) wait for Talk or a button.
    const msg = { requestId, question, choices, kind, details, sayId: id, noAutoMic: !!noAutoMic };
    speakOut(id, question);
    broadcast('ask', msg);
    log('[ask]', kind, choices.length + ' choices');
    const answered = new Promise((resolve, reject) => { pendingAsk = { requestId, kind, choices, resolve, reject, msg }; });
    if (confirmOpen && !SMOKE) watchRealClicks(requestId); // R19 (the hidden test run hooks no mouse)
    return answered;
  },
  cancelAsk() {
    if (!pendingAsk) return;
    const p = pendingAsk;
    pendingAsk = null;
    closeConfirm();
    broadcast('ask-cancel', { requestId: p.requestId });
    p.reject(new Error('cancelled'));
  },
  // opts.dim (default true) dims the rest of the screen while the PERSON is to click; the agent's own-click
  // ring passes {dim:false} (UX 11.4).
  highlight(rect, label, opts = {}) {
    if (warningShown) return; // the warning card stays on top until the person closes it
    placeOverlay(rect);
    overlay({ type: 'highlight', rect: toDip(rect), label: label || '', arrow: true, dim: opts.dim !== false });
  },
  clearOverlay() { if (!warningShown) overlay({ type: 'clear' }); },
  // kind: the guardian's scam kind (tech_support, gift_card, ...). Every scam warning goes into the safety diary.
  warn({ title, body, level = 'info', kind }) {
    placeOverlay(lastTarget && lastTarget.rect);
    overlay({ type: 'warning', title, body, level });
    if (level === 'scam') {
      lastWarn = { kind: kind || 'other', t: Date.now() };
      addDiary('warning', alerts.warningLine(product.assistantName, kind));
    }
  },
  showLauncher, hideLauncher, expandWidget,
  lastTarget: () => lastTarget,
  // True when Scam Shield warned about this window in the last 10 minutes (avoids a second card).
  recentWarning(hwnd) {
    const now = Date.now();
    for (const [k, t] of warned) if (k.startsWith(hwnd + '|') && now - t < 10 * 60 * 1000) return true;
    return false;
  },
};

function clearWarning() { overlay({ type: 'clear' }); }
function closeConfirm() { if (confirmOpen) { confirmOpen = false; layoutWidget(); } }

function resolveAsk(requestId, value) {
  if (!pendingAsk) return false;
  if (requestId && requestId !== pendingAsk.requestId) return false;
  const p = pendingAsk;
  const ans = normalizeAnswer(p, value);
  if (p.kind === 'confirm' && ans === 'yes') {
    realClickSince(Date.now() - 2000, 800).then((ok) => {
      if (pendingAsk !== p) return; // stopped or answered meanwhile
      if (ok) return settleAsk(p, ans);
      log('[answer]', p.requestId, 'yes without a real click on the card: not taken (R19)');
      send(widgetWin, 'ask', p.msg); // the card comes back
      ui.say('To be safe, please press "Yes, that\'s right" on the card with your mouse.', { wait: false });
    });
    return true;
  }
  settleAsk(p, ans);
  return true;
}
function settleAsk(p, ans) {
  pendingAsk = null;
  closeConfirm();
  log('[answer]', p.requestId, /^(yes|no)$/.test(ans) ? ans : String(ans).length + ' chars');
  broadcast('ask-cancel', { requestId: p.requestId });
  p.resolve(ans);
}

// R19: a Yes on a confirm card (send, pay, delete, settings, install) counts only after a real click on our
// widget. The native mouse hook skips injected clicks (LLMHF_INJECTED), so a remote-control program's click,
// a spoken or a typed "yes" never confirms. No hook (helper down) means no yes: nothing could act anyway.
let lastRealClick = 0;
async function watchRealClicks(requestId) {
  while (pendingAsk && pendingAsk.requestId === requestId && alive(widgetWin) && !quitting) {
    let c = null;
    try { c = await native.call('wait_click', { timeoutMs: 15000 }, 20000); } catch (_) { await wait(1000); continue; }
    if (!(c && c.clicked) || !alive(widgetWin)) continue;
    const pt = screen.screenToDipPoint({ x: c.x, y: c.y }), b = widgetWin.getBounds();
    if (pt.x >= b.x && pt.y >= b.y && pt.x < b.x + b.width && pt.y < b.y + b.height) lastRealClick = Date.now();
  }
}
// The hook's report can land just after the widget's answer: wait a moment for it.
async function realClickSince(t, graceMs) {
  for (const end = Date.now() + graceMs; lastRealClick < t && Date.now() < end;) await wait(50);
  return lastRealClick >= t;
}

// ---------- stop and routing ----------
// An utterance is routed (Jev with retries, maybe an LLM fallback: up to ~14 s) before the agent is busy.
// `routing` covers that gap; a route that finishes after Stop is dropped by agent.handle, so it never starts.
let routing = null;
const busyNow = () => !!routing || !!(agent && agent.busy);
const STILL_WORKING = "I'm still working on the last thing. Say stop if you'd like me to stop.";

// The router's own stop / home words (whole utterance: "please stop", not "Cancel my newspaper"), no Jev call.
const KEYWORDS_ONLY = { ask: async () => { throw new Error('keywords only'); } };
async function keywordIntent(text) {
  const r = await router.route(text, { jev: KEYWORDS_ONLY });
  return r && r.source === 'keyword' ? r.intent : null;
}

function stopAll() {
  routing = null;
  if (agent) agent.stop(); // also ends guide_user's mouse hook (cancel_wait)
  ui.cancelAsk();
  clearWarning();
  ui.status({ state: 'idle' });
  send(widgetWin, 'hush'); // queued lines stop now (UX 9.2), whichever Stop was used
  voiceOut.cancelAll(); // and no more of Barnaby's voice is made for them
  for (const p of [...pendingSay.values()]) p.done();
}

async function handleUtterance(text, opts = {}) {
  text = String(text || '').trim();
  if (!text) return;
  log('[heard]', text.length + ' chars');
  const kw = await keywordIntent(text); // before the busy check, so "please stop" works mid-task
  if (kw === 'stop') { stopAll(); return ui.say('Okay, I stopped.'); }
  if (kw === 'home') { stopAll(); expandWidget(false); return showLauncher(); }
  if (kw === 'quit') return quitAsking ? resolveAsk(null, QUIT_YES) : askToQuit();
  if (remoteOn) return ui.say(REMOTE_PAUSED); // R16: whoever controls the computer could be typing this
  if (pendingAsk) { resolveAsk(null, text); return; }
  if (busyNow()) return ui.say(STILL_WORKING);
  expandWidget(true);
  const me = routing = {};
  ui.status({ state: 'thinking' });
  // Heard, and nothing said yet 2.5 s later: a short spoken sign of life (UX 9.7), once. Any line or question from
  // the agent first (saySeq moved) skips it. After its first time it comes from tts.js's memory, with no wait.
  const said = saySeq;
  const ackT = setTimeout(() => { if (routing === me && saySeq === said && !pendingAsk) ui.say('One moment.', { wait: false }); }, 2500);
  try {
    await agent.handle(text, opts);
  } catch (e) {
    log('agent.handle error', e);
    ui.say("I'm sorry, something went wrong on my side. Let's try that again in a moment.");
    ui.status({ state: 'idle' });
  } finally {
    clearTimeout(ackT);
    if (routing === me) routing = null;
  }
}

// ---------- tiles ----------
async function openTarget(name) {
  const t = apps.resolve(name, config.get());
  if (!t) return false;
  try {
    await native.call('open', t.args ? { target: t.value, args: t.args } : { target: t.value }, 10000);
  } catch (e) {
    if (!t.fallback) throw e;
    log('open failed, trying the fallback', t.value, e.message);
    await native.call('open', { target: t.fallback }, 10000);
  }
  return true;
}

async function openTile(id, arg) {
  const s = config.get();
  log('[tile]', id);
  try {
    switch (id) {
      case 'talk':
        expandWidget(true);
        if (alive(widgetWin)) widgetWin.focus();
        return send(widgetWin, 'talk-toggle', {});
      case 'email':
        if (s.email && s.email.provider) { hideLauncher(); await openTarget(s.email.provider); return ui.say('Here is your email. Tell me if you would like help with anything.'); }
        return handleUtterance('I want to check my email');
      case 'photos':
        if (s.photos && s.photos.provider) { hideLauncher(); await openTarget(s.photos.provider + ' photos'); return ui.say('Here are your photos.'); }
        return handleUtterance('I want to look at my photos');
      case 'video':
        return handleUtterance('I want to make a video call');
      case 'internet':
        hideLauncher();
        await openTarget('browser');
        return ui.say('The internet is open. Tell me what you would like to look up, and I will help you find it.');
      case 'games':
        hideLauncher();
        await openTarget('solitaire');
        return ui.say('Here is a game of cards. Have fun!');
      case 'scam':
        if (busyNow()) return ui.say(STILL_WORKING);
        hideLauncher();
        expandWidget(true);
        return agent.scamCheck('Please check whether what is on my screen is a scam.');
      case 'support': {
        if (busyNow()) return ui.say(STILL_WORKING); // its question would close the agent's open one
        expandWidget(true);
        const ans = await ui.ask({
          question: 'What seems to be the trouble?',
          choices: ['It is slow', 'No sound', 'The internet is not working', 'The printer', 'Something else'],
          kind: 'choice',
        });
        let problem = ans;
        if (ans === 'Something else') problem = await ui.ask({ question: 'Tell me in your own words what is happening.', kind: 'text' });
        return agent.runSupport('My computer problem: ' + problem);
      }
      case 'family': {
        if (!arg || !arg.name) return;
        const what = arg.action === 'video' ? 'Help me make a video call with ' : 'Help me send an email to ';
        return handleUtterance(what + arg.name);
      }
      default:
        return handleUtterance(String(arg || id));
    }
  } catch (e) {
    if (e && e.message === 'cancelled') return;
    log('openTile error', e);
    ui.say('I could not open that just now. Let me know if you would like me to try again.');
  }
}

// ---------- weather ----------
let weatherCache = { t: 0, v: null };
async function getWeather() {
  const city = (config.get().city || '').trim();
  if (Date.now() - weatherCache.t < 30 * 60 * 1000 && weatherCache.v && weatherCache.v.city === city) return weatherCache.v;
  try {
    const res = await fetch('https://wttr.in/' + encodeURIComponent(city) + '?format=j1', { signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    const c = j.current_condition[0];
    const area = j.nearest_area && j.nearest_area[0] && j.nearest_area[0].areaName && j.nearest_area[0].areaName[0].value;
    weatherCache = { t: Date.now(), v: { tempF: +c.temp_F, tempC: +c.temp_C, desc: c.weatherDesc[0].value, city: city || area || '' } };
    return weatherCache.v;
  } catch (e) { log('weather failed', e.message); return null; }
}

// ---------- Scam Shield ----------
let lastScanKey = '';
const warned = new Map();
async function scamShieldTick() {
  if (!native || !guardian) return;
  let fg;
  try { fg = await native.call('foreground', {}, 3000); } catch (_) { return; }
  if (!fg || !fg.hwnd) return;
  if (fg.pid !== process.pid) {
    if (dock && (!lastTarget || lastTarget.hwnd !== fg.hwnd)) fitWindow(fg, false); // a new program: beside the panel
    lastTarget = fg;
  }
  if (!alerts.shieldOn(config.get(), Date.now()) || fg.pid === process.pid) return;
  const key = fg.hwnd + '|' + (fg.title || '');
  if (key === lastScanKey) return;
  lastScanKey = key;
  let wt;
  try { wt = await native.call('window_text', { hwnd: fg.hwnd, max: 4000 }, 6000); } catch (_) { return; }
  const r = await guardian.checkScreen({ title: wt.title || fg.title, text: wt.text || '' }).catch((e) => { log('checkScreen', e.message); return null; });
  if (!r || !r.scam) return;
  if (Date.now() - (warned.get(key) || 0) < 10 * 60 * 1000) return;
  warned.set(key, Date.now());
  if (agent) agent.markScam(); // a scam episode: for the next hour nothing the agent does is routine (R17)
  log('[scam-shield] warning', r.kind); // never the window title or page words (04_safety 7.1)
  ui.warn({ title: r.title || 'This looks like a scam.', body: r.reason || 'This screen is trying to scare you. Do not call any number on it, and do not pay anything.', level: 'scam', kind: r.kind });
  ui.say((r.reason || 'This screen looks like a scam.') + ' You are safe as long as you do not call the number or pay anything.', { wait: false });
  offerClose(fg).catch((e) => log('offer close', e.message));
  familyAlert(alerts.scamAlertText(config.get(), r.kind, Date.now()), { scam: true }).catch((e) => log('family alert', e.message));
}

// ---------- R16: a remote-control program is open ----------
// While its window is open the agent refuses everything but closing it (guardian R16), and typed or spoken
// requests are not taken: whoever controls the computer could be typing them (04_safety T4).
// ponytail: visible windows only (native 'windows'), so a tray-only session is missed; a process list would catch
// it, but the always-running services of an installed TeamViewer or AnyDesk would then pause us for good.
const REMOTE_PAUSED = 'A program that lets someone else control this computer is open, so I am pausing until it is closed. ' +
  'If someone on the phone asked you to open it, it is safest to hang up.';
let remoteOn = false;
async function remoteTick() {
  if (!native || !guardian || !agent) return;
  let r;
  try { r = await native.call('windows', {}, 4000); } catch (_) { return; }
  const w = ((r && r.windows) || []).find((x) => x && x.pid !== process.pid && guardian.isRemoteAccess(x.process || ''));
  if (!!w === remoteOn) return;
  remoteOn = agent.remoteSession = !!w;
  log('[remote] session', remoteOn ? 'on' : 'off');
  if (!remoteOn) return;
  if (busyNow()) { routing = null; agent.stop(); } // the task freezes (T4); a scam card stays
  agent.markScam();
  addDiary('remote', 'A program that lets someone else control this computer was open (' + w.process + ').');
  ui.say(REMOTE_PAUSED, { wait: false });
}

// The offer to close the page is a real question, so a spoken "yes please" closes it instead of starting a
// new request. While the agent works (its question must not be closed) the card's button is the way.
const CLOSE_YES = 'Yes, close it', CLOSE_NO = 'No, leave it';
let scamAskId = null;
async function offerClose(target) {
  if (busyNow() || pendingAsk) return ui.say('If you would like me to close it, press "Close this page for me".', { wait: false });
  const q = ui.ask({ question: 'Would you like me to close it for you?', choices: [CLOSE_YES, CLOSE_NO], kind: 'choice', noAutoMic: true });
  const id = scamAskId = pendingAsk.requestId;
  let ans;
  try { ans = await q; } catch (_) { return; } finally { if (scamAskId === id) scamAskId = null; }
  if (ans === CLOSE_YES) return closePage(target);
  clearWarning();
  if (ans !== CLOSE_NO && !/not sure/i.test(ans)) return handleUtterance(ans); // not an answer to this: a new request
}

async function closePage(target) {
  clearWarning();
  try {
    if (!target) throw new Error('no window to close');
    await native.call('focus', { hwnd: target.hwnd }, 3000);
    const browser = /chrome|msedge|firefox|brave|opera|iexplore/i.test(target.process || '');
    await native.call('key', { combo: browser ? 'ctrl+w' : 'alt+f4' }, 3000);
    ui.say('I closed it. You are safe. If it comes back, tell me and we will deal with it together.');
  } catch (e) { log('close_page failed', e.message); ui.say("I could not close it by myself. Let's do it together."); }
}

// ---------- closing Barnaby ----------
// His button is pinned to the taskbar at the end of setup, so a closed Barnaby is one click away. Closing him
// (tray, Alt+F4, the taskbar's "Close window", "close Barnaby") asks first, then points at that button.
const APP_ID = 'com.hellobarnaby.app';
const PINNED_DIR = path.join(process.env.APPDATA || '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
function isPinned() {
  try { return fs.readdirSync(PINNED_DIR).some((f) => f.toLowerCase().startsWith(product.name.toLowerCase()) && f.endsWith('.lnk')); } catch (_) { return false; }
}
async function pinToTaskbar() {
  if (SMOKE || DEMO) return false;
  if (isPinned()) return true;
  // The pin comes from the home screen's own taskbar button, so it must have one (started hidden at logon: none yet).
  if (alive(launcherWin) && !launcherWin.isVisible()) launcherWin.minimize();
  let ok = false;
  try {
    await wait(600);
    const r = await native.call('taskbar', { aumid: APP_ID, name: product.name, pin: true }, 10000);
    ok = !!(r.pinned || r.invoked);
    log('[pin] button', r.found ? 'found' : 'missing', r.pinned ? 'pinned already' : r.invoked ? 'pinned now' : 'no pin item');
  } catch (e) { log('[pin] failed', e.message); }
  return ok;
}

const QUIT_YES = 'Yes, close ' + product.assistantName, QUIT_NO = 'No, stay open';
let quitAsking = false;
async function askToQuit() {
  if (quitting || quitAsking) return;
  // R16: whoever controls the computer from afar must not switch off Scam Shield this way.
  if (remoteOn) return ui.say('While someone else can control this computer, I stay open to keep you safe.', { wait: false });
  quitAsking = true;
  try {
    stopAll();
    let ans;
    try {
      ans = await ui.ask({ question: 'Are you sure you want to close me? While I am closed, I cannot help you or watch for scams.', choices: [QUIT_YES, QUIT_NO], kind: 'choice', noAutoMic: true });
    } catch (_) { return; } // stopped
    if (ans !== QUIT_YES) {
      if (ans === QUIT_NO) return ui.say('Good, I will stay right here.', { wait: false });
      return handleUtterance(ans); // not an answer to this: a new request
    }
    const pinned = await pinToTaskbar();
    const btn = pinned ? await native.call('taskbar', { aumid: APP_ID, name: product.name }, 4000).catch(() => null) : null;
    if (btn && btn.found) {
      ui.highlight(btn.rect, 'Click here to open me again', { dim: false });
      await ui.say('I am pinned to your taskbar, at the bottom of the screen. Whenever you want me back, click my picture there. Goodbye for now!');
      await wait(1500);
    } else {
      await ui.say(`To open me again, double-click ${product.assistantName} on your desktop. Goodbye for now!`);
    }
    log('[quit] closed by the person');
    quitting = true;
    app.quit();
  } finally { quitAsking = false; }
}

// ---------- safety diary, family alerts, weekly note ----------
let sendAlert = async () => false; // guardian's real ntfy sender; guardian.alertFamily itself is wrapped at boot
let lastScamAlertAt = 0, lastWarn = { kind: 'other', t: 0 };
let pendingScam = null; // {text, t}: a scam alert that did not go out (offline); the tick retries it for an hour

function addDiary(kind, what) {
  try { diary.append(UD(DIARY), { kind, what }); } catch (e) { log('diary append failed', e.message); }
}

// The only way anything reaches family: needs "Tell <family> if I might be in a scam" (04_safety 8.3),
// one scam alert per episode, lands in the diary with the exact text sent, and the person is told.
async function familyAlert(text, { scam = false, announce = true } = {}) {
  const s = config.get(), now = Date.now();
  if (scam ? !alerts.scamAlertAllowed(s, lastScamAlertAt, now) : !alerts.canAlert(s)) return false;
  const prev = lastScamAlertAt;
  if (scam) lastScamAlertAt = now;
  const sent = await sendAlert(text);
  if (!sent) {
    if (scam) { lastScamAlertAt = prev; if (!pendingScam) pendingScam = { text, t: now }; }
    return false;
  }
  if (scam) pendingScam = null;
  addDiary('alert', 'Alert sent to ' + (String((s.family || {}).name || '').trim() || 'family') + ': "' + text + '"');
  if (announce) ui.say(alerts.toldFamilyLine(s), { wait: false });
  return true;
}

// The connection key was refused or its credit ran out (llm e.kind auth | credit): only family can fix it.
// Once a day a diary line (the Settings diary shows it) and, with consent, one alert.
let connProblemAt = 0;
function connectionProblem(kind) {
  if (kind !== 'auth' && kind !== 'credit') return;
  const now = Date.now();
  if (now - connProblemAt < diary.DAY) return;
  connProblemAt = now;
  const text = alerts.connectionText(config.get(), kind);
  addDiary('setting', text);
  familyAlert(text, { announce: false }).catch((e) => log('connection alert', e.message));
}

// userData/stats.json: {done: [ms of finished tasks, last 8 days], weeklyAt: ms of the last weekly note}.
function stats(update) {
  let st = {};
  try { st = JSON.parse(fs.readFileSync(UD(STATS), 'utf8')) || {}; } catch (_) {}
  st = { done: Array.isArray(st.done) ? st.done : [], weeklyAt: +st.weeklyAt || 0 };
  if (!update) return st;
  update(st);
  st.done = st.done.filter((t) => Date.now() - t < 8 * diary.DAY);
  try { fs.writeFileSync(UD(STATS), JSON.stringify(st)); } catch (e) { log('stats save failed', e.message); }
  return st;
}

function weeklyNote(now) {
  const s = config.get();
  if (!(s.family && s.family.weeklyNote)) return;
  const st = stats();
  if (!st.weeklyAt) { stats((x) => { x.weeklyAt = now; }); return; } // the first note comes a week after switching it on
  if (!alerts.weeklyDue(s, st, now)) return;
  const since = now - alerts.WEEK;
  const warnings = diary.read(UD(DIARY)).filter((e) => e.kind === 'warning' && Date.parse(e.time) > since).length;
  const text = alerts.weeklyNoteText(s, st.done.filter((t) => t > since).length, warnings, product.assistantName);
  // Marked sent only once it went out: offline now, the next tick tries again.
  familyAlert(text, { announce: false }).then((ok) => { if (ok) stats((x) => { x.weeklyAt = now; }); }, (e) => log('weekly note', e.message));
}

// Every 10 minutes while running (Barnaby runs for weeks without a restart).
function maintenanceTick() {
  const now = Date.now();
  // Retention (04_safety 7.1): logs 14 days and 5 MB, safety diary 90 days.
  diary.pruneLogs(UD('logs'), 14 * diary.DAY, now);
  logm.init(UD('logs'));
  try { diary.prune(UD(DIARY), 90 * diary.DAY, now); } catch (e) { log('diary prune failed', e.message); }
  const due = alerts.dueFamily(config.get(), now);
  if (due) { config.save(due); addDiary('setting', 'The family contact change is now in effect.'); }
  if (pendingScam && now - pendingScam.t > alerts.EPISODE) pendingScam = null;
  if (pendingScam) familyAlert(pendingScam.text, { scam: true, announce: false }).catch((e) => log('scam alert retry', e.message));
  weeklyNote(now);
}

// ---------- native helper down ----------
// Down for a minute: Scam Shield and the agent's eyes are off. The person, the diary and family hear it once.
let nativeDownTimer = null, nativeDownTold = false;
function watchNative() {
  native.on('down', () => { if (!nativeDownTimer && !nativeDownTold) nativeDownTimer = setTimeout(nativeStillDown, 60 * 1000); });
  native.on('up', () => {
    clearTimeout(nativeDownTimer);
    nativeDownTimer = null;
    if (nativeDownTold) { nativeDownTold = false; addDiary('setting', product.assistantName + ' can see the screen again, and Scam Shield is back on.'); }
  });
}
function nativeStillDown() {
  nativeDownTimer = null;
  if (quitting) return;
  nativeDownTold = true;
  addDiary('setting', 'Scam Shield was paused: ' + product.assistantName + ' could not see the screen.');
  ui.say("I can't see your screen right now, so Scam Shield is paused. Restarting the computer usually fixes this.", { wait: false });
  familyAlert(alerts.helperDownText(config.get()), { announce: false }).catch((e) => log('helper-down alert', e.message));
}

// ---------- tray / icon ----------
function iconImage() {
  const f = P('ui', 'assets', 'icon.png');
  return fs.existsSync(f) ? nativeImage.createFromPath(f) : nativeImage.createEmpty();
}
function createTray() {
  try {
    tray = new Tray(iconImage().resize({ width: 16, height: 16 }));
    tray.setToolTip(product.name);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open home screen', click: showLauncher },
      { label: 'Talk to ' + product.assistantName, click: () => { expandWidget(true); send(widgetWin, 'talk-toggle', {}); } },
      { label: 'Settings (for family)', click: openSettings },
      { type: 'separator' },
      { label: 'Quit ' + product.name, click: askToQuit },
    ]));
    tray.on('click', showLauncher);
  } catch (e) { log('tray failed', e.message); }
}

// "Start with Windows": the app runs as administrator, so it is a logon task with the highest privileges
// (src/startup.js), made or removed when the setting changes (and at every start, which keeps the path current).
function applySettingsSideEffects(s, before) {
  if (s.setupDone && before && !before.setupDone) pinToTaskbar(); // the end of setup
  if (!app.isPackaged || (before && !!before.startAtLogin === !!s.startAtLogin)) return;
  // The Run-key entry of older versions: Windows skips it for an administrator app, so it goes.
  try { app.setLoginItemSettings({ openAtLogin: false, args: ['--hidden'] }); } catch (e) { log('login item', e.message); }
  const user = process.env.USERDOMAIN && process.env.USERNAME ? process.env.USERDOMAIN + '\\' + process.env.USERNAME : '';
  startup.setLogonTask(!!s.startAtLogin, { name: product.name, exe: process.execPath, user, tmpDir: app.getPath('temp') })
    .then((ok) => log('[startup] logon task', s.startAtLogin ? 'on' : 'off', ok ? 'done' : 'failed'), (e) => log('[startup]', e.message));
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.on('get-product', (e) => { e.returnValue = product; });
  ipcMain.handle('get-settings', () => config.publicView());
  ipcMain.handle('save-settings', (_e, patch) => {
    const before = config.get(), now = Date.now();
    // Delay, not deny (04_safety 8.5): Scam Shield off and weaker family-contact changes wait 24 h, family is told.
    const { patch: p, shield: sh, familyAdded } = alerts.safetyPatch(before, patch, now);
    config.save(p); // -> 'saved' -> every window gets settings-changed
    const s = config.get();
    if (sh && sh.offAt) {
      addDiary('setting', 'Scam Shield was switched off. It keeps watching until tomorrow at ' + alerts.clock(sh.offAt) + '.');
      familyAlert(alerts.shieldOffText(s, sh.offAt)).catch((e) => log('shield-off alert', e.message));
    }
    if (familyAdded.length) { // told to the family contact as it was before the change
      addDiary('setting', alerts.familyChangeLine(familyAdded[0].at));
      familyAlert(alerts.familyChangeText(s, familyAdded[0].at), { announce: false }).catch((e) => log('family-change alert', e.message));
    }
    if ((s.dockPanel !== false) !== (before.dockPanel !== false)) expandWidget(widgetExpanded); // dock or float now
    applySettingsSideEffects(s, before);
    return config.publicView();
  });
  ipcMain.handle('ask', (_e, text, opts) => { handleUtterance(text, opts); return true; });
  ipcMain.on('answer', (_e, requestId, value) => resolveAsk(requestId, value));
  ipcMain.on('stop', () => stopAll());
  ipcMain.on('go-home', () => { stopAll(); expandWidget(false); showLauncher(); });
  ipcMain.handle('open-tile', (_e, id, arg) => { openTile(id, arg); return true; });
  ipcMain.handle('transcribe', async (_e, wavBase64) => {
    const s = config.get();
    const t0 = Date.now();
    try {
      const hints = [s.userName, s.family && s.family.name, ...(s.contacts || []).map((c) => c.name), product.assistantName].filter(Boolean);
      const r = await llm.transcribe({ apiKey: s.apiKey, model: s.sttModel, wavBase64, hints });
      log('[stt]', String(r.text || '').length + ' chars', (Date.now() - t0) + ' ms');
      return { text: r.text };
    } catch (e) {
      log('transcribe failed', e.kind || 'other');
      connectionProblem(e.kind);
      return { text: '', error: e.kind || 'other' }; // the widget says the real cause (offline, auth, credit, rate, timeout)
    }
  });
  ipcMain.handle('listen-offline', async () => {
    try { return await native.call('listen', { timeoutMs: 15000, culture: 'en-US' }, 20000); } catch (e) { return { text: '', error: e.message }; }
  });
  ipcMain.handle('list-lessons', () => lessons.list());
  ipcMain.handle('get-lesson', (_e, id) => lessons.get(id));
  ipcMain.handle('delete-lesson', (_e, id) => lessons.remove(id));
  ipcMain.handle('replay-lesson', (_e, id) => {
    const l = lessons.get(id);
    if (!l) return false;
    if (busyNow()) { ui.say("I'm still working on the last thing. Say stop first if you'd like to start this lesson."); return false; }
    hideLauncher();
    expandWidget(true);
    agent.runTask(l.title, { mode: 'teach', lessonHint: l.steps }).catch((e) => log('replay failed', e));
    return true;
  });
  ipcMain.handle('run-check', (_e, name) => support.runCheck(name));
  // The widget finished a line (or dropped it: Talk, Stop): the rest of its voice is not needed any more.
  ipcMain.on('spoken', (_e, id) => { voiceOut.cancel(id); const p = pendingSay.get(id); if (p && p.byAck) p.done(); });
  // The widget's own spoken lines ("All right, I'll talk more slowly.", "Say it again"): through ui.say, so they are
  // in Barnaby's natural voice too, not the computer's own. again: no second caption, a little slower.
  ipcMain.on('say-line', (_e, text, o) => { ui.say(String(text || '').slice(0, 1000), { wait: false, again: !!(o && o.again) }); });
  // Settings "Test the voice" (only on that click): the chosen voice and pace, made here so the key stays in main.
  // {error:'muted'} plays nothing at all; {error:'local'} means the page uses the computer's own voice.
  ipcMain.handle('tts-test', async (_e, o) => {
    const s = config.get();
    if (s.muted) return { error: 'muted' };
    const text = 'Hello' + (s.userName ? ', ' + s.userName : '') + '. I am ' + product.assistantName + '. I will help you, one step at a time.';
    const plan = tts.pick({ ...s, ttsVoice: o && o.voice, speechRate: (o && o.speed) || s.speechRate }, text);
    if (!plan) return { error: 'local' };
    try {
      const chunks = [];
      for await (const c of tts.speak(text, plan)) chunks.push(c);
      return { chunks };
    } catch (e) {
      log('[tts] test failed', e.kind || 'other');
      connectionProblem(e.kind);
      return { error: e.kind || 'other' };
    }
  });
  ipcMain.on('overlay-dismiss', (_e, action) => {
    if (pendingAsk && pendingAsk.requestId === scamAskId) ui.cancelAsk(); // the card answered the spoken offer
    clearWarning();
    if (action === 'close_page') {
      closePage(lastTarget);
    } else if (action === 'call_family') {
      const f = config.get().family || {};
      ui.say(f.phone ? 'You can call ' + (f.name || 'your family') + ' at ' + f.phone.split('').join(' ') + '.' : 'Please call someone in your family you trust, on a number you already know.');
    }
  });
  ipcMain.handle('get-weather', () => getWeather());
  ipcMain.handle('is-elevated', async () => {
    try { return await native.call('is_elevated', {}, 3000); } catch (_) { return { elevated: null, adminGroup: null }; }
  });
  ipcMain.on('open-settings', () => openSettings());
  ipcMain.on('launcher-minimize', () => hideLauncher());
  ipcMain.on('widget-expand', (_e, b) => expandWidget(!!b));
  // The widget's microphone opened/closed: every window shows it (the launcher's Talk button too).
  ipcMain.on('listening', (_e, on) => {
    micOpen = !!on;
    if (micOpen && wake) wake.pause(); // the Talk flow owns the microphone now
    broadcast('status', on ? { state: 'listening' } : lastStatus);
  });
  ipcMain.handle('get-diary', () => diary.read(UD(DIARY)).reverse()
    .map((e) => ({ when: diary.when(e.time), kind: e.kind, what: e.what })));
  // "Send a test alert": goes out whenever a code is set (skips consent and the 10-minute repeat guard).
  ipcMain.handle('test-alert', async () => {
    if (!String((config.get().family || {}).ntfyTopic || '').trim()) return { ok: false, why: 'no_code' };
    const msg = 'This is a test from ' + product.assistantName + '. Alerts are working.';
    if (guardian.alerted instanceof Map) guardian.alerted.delete(msg);
    const ok = await sendAlert(msg);
    return { ok, why: ok ? '' : 'not_sent', time: alerts.clock(Date.now()) };
  });
  // "Delete everything <name> knows": lessons, memories, safety diary, stats, logs, settings (not the key).
  ipcMain.handle('delete-everything', () => {
    stopAll();
    while (memory.all().length) memory.remove(0);
    for (const p of ['lessons', 'memory.json', DIARY, STATS, 'logs']) {
      try { fs.rmSync(UD(p), { recursive: true, force: true }); } catch (e) { log('delete-everything', p, e.message); }
    }
    fs.mkdirSync(UD('lessons'), { recursive: true });
    logm.init(UD('logs'));
    config.reset(['apiKey']); // -> 'saved' -> every window gets settings-changed
    lastScamAlertAt = 0;
    pendingScam = null;
    const pub = config.publicView();
    applySettingsSideEffects(config.get());
    layoutWidget();
    broadcast('lesson-saved', { id: '', title: '' }); // an open lessons list refreshes (now empty)
    log('everything deleted at the request of the person');
    return pub;
  });
  ipcMain.on('widget-drag', (_e, dx, dy) => {
    if (!alive(widgetWin) || dock) return; // the docked panel has its place
    const b = widgetWin.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const x = Math.max(wa.x, Math.min(b.x + dx, wa.x + wa.width - b.width));
    const y = Math.max(wa.y, Math.min(b.y + dy, wa.y + wa.height - b.height));
    widgetWin.setBounds({ x, y, width: b.width, height: b.height });
  });
}

// ---------- smoke test ----------
// Docking in the hidden run: no AppBar and no real window is touched (NO_APPBAR), only the geometry. Open = the right
// third of the screen the pointer is on, full work-area height; closed = the pill back in its corner; the status card
// shows the plan; with docking off the panel floats in the corner as before.
async function smokeDock(out, shot) {
  const was = config.get().dockPanel;
  const js = (code) => widgetWin.webContents.executeJavaScript(code);
  const d = {};
  try {
    expandWidget(false); await wait(200);
    const pill = widgetWin.getBounds();
    config.save({ dockPanel: true });
    expandWidget(true); await wait(400);
    const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    d.want = geom.dock(disp.workArea, disp.bounds.width, config.get().textScale).panel;
    d.panel = widgetWin.getBounds();
    d.bodyDocked = await js('document.body.classList.contains("docked")');
    ui.status({ state: 'acting', label: 'Clicking \u201cNew mail\u201d', detail: 'That starts a new email.', step: 2, totalSteps: 4,
      plan: [{ text: 'Open Outlook', state: 'done' }, { text: 'Start a new email', state: 'now' }, { text: 'Write the note', state: 'next' }, { text: 'You press Send', state: 'next' }] });
    await wait(900); // a hidden window repaints slowly: the shot below should show the card
    d.planItems = await js('document.querySelectorAll("#plan li").length');
    d.title = await js('document.getElementById("status").textContent');
    await shot(widgetWin, 'widget-docked');
    ui.status({ state: 'thinking', effort: 'high' });
    await wait(300);
    d.thinkBig = await js('!document.getElementById("thinkBig").hidden'); // the big "please wait" sign
    d.speedButtons = await js('document.querySelectorAll("#speedRow button").length');
    await shot(widgetWin, 'widget-thinking');
    expandWidget(false); await wait(300);
    d.pillBusy = await js('document.getElementById("pillState").textContent');
    await shot(widgetWin, 'widget-pill-busy');
    ui.status({ state: 'idle' });
    await wait(100);
    d.thinkBigIdle = await js('!document.getElementById("thinkBig").hidden');
    d.pill = widgetWin.getBounds();
    d.pillWant = geom.atCorner(geom.size(false, disp.workArea), geom.nearestCorner(pill, screen.getDisplayMatching(pill).workArea), disp.workArea);
    config.save({ dockPanel: false });
    expandWidget(true); await wait(300);
    d.floating = widgetWin.getBounds();
    d.floatingWant = geom.bounds(d.pill, true, disp.workArea, { scale: config.get().textScale });
    // A text size saved outside the Settings page (Barnaby's own update_settings) resizes the open panel at once.
    const s0 = config.get().textScale;
    config.save({ textScale: s0 >= 1.3 ? 1.0 : 1.4 }); await wait(200);
    d.rescaledWidth = widgetWin.getBounds().width;
    config.save({ textScale: s0 }); await wait(200);
    if (d.rescaledWidth === d.floating.width) out.errors.push('dock: a new text size did not resize the open panel');
    expandWidget(false); await wait(200);
    d.nativeCalls = dockNativeCalls;
    const bad = [];
    if (!sameRect(d.panel, d.want)) bad.push('docked panel ' + JSON.stringify(d.panel) + ' is not the right third ' + JSON.stringify(d.want));
    if (!d.bodyDocked) bad.push('the widget page was not told it is docked');
    if (d.planItems !== 4 || d.title !== 'Clicking \u201cNew mail\u201d') bad.push('status card: ' + d.planItems + ' plan steps, title ' + d.title);
    if (d.pillBusy !== 'Thinking\u2026') bad.push('the pill says ' + JSON.stringify(d.pillBusy) + ' while thinking');
    if (!d.thinkBig || d.thinkBigIdle) bad.push('big thinking sign: shown while thinking ' + d.thinkBig + ', while idle ' + d.thinkBigIdle);
    if (d.speedButtons !== 3) bad.push('speed row has ' + d.speedButtons + ' buttons');
    if (!sameRect(d.pill, d.pillWant)) bad.push('pill after docking ' + JSON.stringify(d.pill) + ', not back in its corner ' + JSON.stringify(d.pillWant));
    if (!sameRect(d.floating, d.floatingWant)) bad.push('floating panel ' + JSON.stringify(d.floating) + ' != ' + JSON.stringify(d.floatingWant));
    if (d.nativeCalls) bad.push('the hidden run called the native AppBar or moved a window');
    for (const b of bad) out.errors.push('dock: ' + b);
  } catch (e) { out.errors.push('dock checks: ' + e.message); }
  config.save({ dockPanel: was });
  out.dock = d;
}

async function runSmoke() {
  const out = { ok: true, windows: {}, errors: [] };
  const wins = { launcher: launcherWin, widget: widgetWin, overlay: overlayWin, settings: settingsWin };
  for (const [name, w] of Object.entries(wins)) {
    w.webContents.on('console-message', (e) => {
      const level = e.level !== undefined ? e.level : e;
      if (level === 'error' || level === 3) out.errors.push(name + ': ' + (e.message || ''));
    });
  }
  await new Promise((r) => setTimeout(r, 4000));
  const shotDir = path.join(app.getPath('userData'), 'smoke');
  fs.mkdirSync(shotDir, { recursive: true });
  for (const [name, w] of Object.entries(wins)) {
    try {
      const has = await w.webContents.executeJavaScript('typeof window.helper === "object" && !!window.helper.product && document.readyState');
      const settingsOk = await w.webContents.executeJavaScript('window.helper.getSettings().then(s => !!s && typeof s === "object")');
      const img = await w.webContents.capturePage();
      const file = path.join(shotDir, name + '.png');
      fs.writeFileSync(file, img.toPNG());
      out.windows[name] = { bridge: has, settingsOk, shot: file, size: img.getSize() };
    } catch (e) {
      out.ok = false;
      out.windows[name] = { error: e.message };
    }
  }
  out.native = null;
  try { out.native = await native.call('ping', {}, 5000); } catch (e) { out.native = { error: e.message }; }
  try { // closing the home screen asks first; No keeps everything open
    launcherWin.close();
    await wait(300);
    out.quitAsk = !!pendingAsk && pendingAsk.choices[0] === QUIT_YES;
    if (!out.quitAsk) out.errors.push('closing the home screen did not ask "' + QUIT_YES + '"');
    resolveAsk(null, 'no');
    await wait(300);
    if (quitting || !alive(launcherWin)) out.errors.push('answering No still closed Barnaby');
    // Muted (HELPER_MUTE=1): a question never opens the microphone by itself (no voice, no getUserMedia here).
    out.autoMicMuted = await widgetWin.webContents.executeJavaScript('document.getElementById("listenRow").hidden');
    if (!out.autoMicMuted) out.errors.push('muted, but the question opened the microphone by itself');
  } catch (e) { out.errors.push('quit ask: ' + e.message); }
  // Hidden-window checks: widget sizes (panel, confirm card, pill corner) and the settings views.
  const shot = async (w, name) => fs.writeFileSync(path.join(shotDir, name + '.png'), (await w.webContents.capturePage()).toPNG());
  try {
    expandWidget(true); await wait(400);
    out.widgetExpanded = widgetWin.getBounds();
    await shot(widgetWin, 'widget-expanded');
    ui.ask({ question: 'This will go to Anne Marie. Is everything right?', kind: 'confirm',
      details: { title: 'Ready to send this email?', fields: [{ label: 'To', value: 'Anne Marie Kowalski' }, { label: 'Subject', value: 'Photos' }] } }).catch(() => {});
    await wait(600);
    out.widgetConfirm = widgetWin.getBounds();
    await shot(widgetWin, 'widget-confirm');
    // R19: a yes with no real click on the card (spoken, typed, injected) is not taken; the card stays open.
    const cardId = pendingAsk && pendingAsk.requestId;
    resolveAsk(cardId, 'yes');
    await wait(1200);
    out.confirmNeedsRealClick = !!pendingAsk && pendingAsk.requestId === cardId;
    if (!out.confirmNeedsRealClick) out.errors.push('a confirm card took a yes without a real click');
    ui.cancelAsk(); expandWidget(false); await wait(300);
    // A warning card outlives the agent's clear and ring; Stop clears it. A ring's overlay covers the ring's display.
    ui.warn({ title: 'Test card', body: 'Test card', level: 'info' });
    ui.clearOverlay();
    ui.highlight([20, 20, 60, 40], 'test');
    out.warningKept = warningShown;
    stopAll();
    ui.highlight([20, 20, 60, 40], 'test');
    const ob = overlayWin.getBounds(), db = screen.getDisplayMatching(screen.screenToDipRect(null, { x: 20, y: 20, width: 60, height: 40 })).bounds;
    out.overlayOnRingDisplay = ob.x === db.x && ob.y === db.y && ob.width === db.width && ob.height === db.height;
    ui.clearOverlay();
    if (!out.warningKept || warningShown || !out.overlayOnRingDisplay) out.errors.push('overlay: warning kept ' + out.warningKept + ', on ring display ' + out.overlayOnRingDisplay);
    out.widgetCollapsed = widgetWin.getBounds();
    // The natural voice: muted (HELPER_MUTE=1) not one line went to the voice service and the Settings test plays
    // nothing; the widget can play it and the bridge knows its channel.
    out.tts = {
      runs: voiceOut.runs,
      muted: !!config.get().muted,
      test: await settingsWin.webContents.executeJavaScript('window.helper.testVoice({}).then((r) => r && r.error)'),
      widget: await widgetWin.webContents.executeJavaScript('typeof Voice.play === "function" && typeof Voice.replay === "function" && typeof Voice.earcon === "function" && typeof window.helper.on("tts", () => {}) === "function"'),
      sayLine: await widgetWin.webContents.executeJavaScript('typeof window.helper.sayLine === "function"'), // preload's say-line bridge
    };
    if (out.tts.muted && (out.tts.runs || out.tts.test !== 'muted')) out.errors.push('tts: muted, but ' + out.tts.runs + ' lines went to the voice service, test ' + out.tts.test);
    if (!out.tts.widget) out.errors.push('tts: the widget cannot play the natural voice');
    if (!out.tts.sayLine) out.errors.push('tts: preload has no sayLine, so the widget\'s own lines use the computer\'s voice');
    await smokeDock(out, shot);
    addDiary('warning', alerts.warningLine(product.assistantName, 'tech_support')); // shown in the diary shot, removed below
    addDiary('command', alerts.commandLine(product.assistantName, { cmd: 'Get-Service Spooler', verdict: 'auto', ok: true }));
    for (const [name, hash] of [['settings-all', 'all'], ['settings-family', 'family'], ['settings-key', 'key'], ['settings-safety', 'safety'], ['settings-voice', 'voice'], ['settings-mode', 'mode'], ['settings-brain', 'brain'], ['settings-commands', 'commands'], ['settings-diary', 'diary'], ['settings-privacy', 'privacy']]) {
      await settingsWin.webContents.executeJavaScript('location.hash = ' + JSON.stringify(hash) + '; 1');
      await wait(700);
      await shot(settingsWin, name);
    }
    out.diaryShown = await settingsWin.webContents.executeJavaScript('document.querySelectorAll("#sec-diary li").length');
    out.adminLine = await settingsWin.webContents.executeJavaScript('(document.getElementById("admin-now") || {}).textContent');
    // The alert-code row and the delete confirm card (opened, never confirmed).
    await settingsWin.webContents.executeJavaScript('document.getElementById("f-family-ntfyTopic").scrollIntoView({ block: "center" }); 1');
    await wait(300); await shot(settingsWin, 'settings-alertcode');
    await settingsWin.webContents.executeJavaScript('document.querySelector("[data-delete-ask]").click(); document.getElementById("delete-area").scrollIntoView({ block: "center" }); 1');
    await wait(300); await shot(settingsWin, 'settings-delete-card');
    out.deleteCard = await settingsWin.webContents.executeJavaScript('!!document.querySelector("[data-delete-yes]") && document.activeElement.id');
    fs.rmSync(UD(DIARY), { force: true });
  } catch (e) { out.errors.push('smoke checks: ' + e.message); }
  try { // a crashed widget renderer comes back by itself, bridge and all
    widgetWin.webContents.forcefullyCrashRenderer();
    await wait(3000);
    out.widgetRecovered = await widgetWin.webContents.executeJavaScript('typeof window.helper === "object" && document.readyState');
    if (out.widgetRecovered !== 'complete') out.errors.push('widget did not come back after a renderer crash');
  } catch (e) { out.errors.push('crash recovery: ' + e.message); }
  if (out.errors.length) out.ok = false;
  const outFile = path.join(app.getPath('userData'), 'smoke.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  quitting = true;
  app.exit(out.ok ? 0 : 1);
}

// ---------- boot ----------
app.on('second-instance', () => showLauncher());
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });
// Quitting gives the screen back first: the AppBar goes (at most 2.5 s), then the app quits.
let quitUndocked = false;
app.on('before-quit', (e) => {
  quitting = true;
  if (!dock || !dock.appbar || quitUndocked) return;
  e.preventDefault();
  const d = dock;
  dock = null;
  Promise.race([releaseDock(d), wait(2500)]).finally(() => { quitUndocked = true; app.quit(); });
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (native) native.stop(); });

app.whenReady().then(async () => {
  if (process.env.HELPER_USER_DATA) app.setPath('userData', process.env.HELPER_USER_DATA);
  // Retention (04_safety 7.1, safety.html): logs 14 days, safety diary 90 days (and every 10 minutes: maintenanceTick).
  diary.pruneLogs(UD('logs'), 14 * diary.DAY);
  logm.init(UD('logs'));
  log('starting', product.name, product.version, 'packaged=' + app.isPackaged, 'smoke=' + SMOKE);
  try { diary.prune(UD(DIARY), 90 * diary.DAY); } catch (e) { log('diary prune failed', e.message); }
  config = new Config(app.getPath('userData'));
  if (DEMO && !config.get().setupDone) {
    config.save({ setupDone: true, startAtLogin: false, wakeWord: false,
      contacts: [{ name: 'Anne Marie Kowalski', email: 'annemarie.demo@example.com', relation: 'daughter' }] });
  }
  if (config.loadProblem) addDiary('setting', config.loadProblem === 'backup'
    ? 'The settings file was damaged, so the last good copy was used.'
    : 'The settings file was damaged and there was no copy, so the settings started over.');
  let shownScale = config.get().textScale;
  config.on('saved', () => { // Settings, the agent's remember() and update_settings
    broadcast('settings-changed', config.publicView());
    // A new text size resizes the panel window too, whoever changed it ("make your text smaller" to Barnaby included).
    const sc = config.get().textScale;
    if (+sc !== +shownScale) { shownScale = sc; if (dock) endDock(); layoutWidget(); } // bigger text: a wider docked panel
  });

  native = new Native(helperExe());
  if (!fs.existsSync(helperExe())) log('native helper missing at', helperExe());
  watchNative();
  native.start(); // never throws; a missing or damaged helper is retried while we run
  cleanStaleDock();

  const { Guardian } = require('./src/guardian');
  const { Agent } = require('./src/agent');
  const { Lessons } = require('./src/lessons');
  const { Memory } = require('./src/memory');
  support = require('./src/support');
  support.setNative(native); // Core Audio in-process for the sound check / unmute
  apps = require('./src/apps');
  router = require('./src/router');
  const signals = readJson(P('src', 'scam_signals.json'), {});
  const playbooks = readJson(P('src', 'playbooks.json'), []);
  guardian = new Guardian({ config, jev, signals, log });
  // Every family alert goes through familyAlert(): anything else asking for one (the agent's scam check)
  // gets the consent gate and the kind-and-time wording, never the page text it passed in.
  sendAlert = guardian.alertFamily.bind(guardian);
  guardian.alertFamily = () => familyAlert(alerts.scamAlertText(config.get(),
    Date.now() - lastWarn.t < 60 * 1000 ? lastWarn.kind : 'other', Date.now()), { scam: true });
  lessons = new Lessons(path.join(app.getPath('userData'), 'lessons'));
  memory = new Memory(path.join(app.getPath('userData'), 'memory.json'));
  agent = new Agent({ config, native, llm, jev, guardian, router, memory, lessons, support, apps, playbooks, ui });
  agent.on('done', (d) => {
    stats((st) => { st.done.push(Date.now()); });
    broadcast('task-done', { summary: d && d.summary });
    if (d && d.lessonId) {
      const l = lessons.get(d.lessonId);
      broadcast('lesson-saved', { id: d.lessonId, title: l ? l.title : '' });
    }
  });
  agent.on('error', (e) => { log('agent error event', e && e.kind); connectionProblem(e && e.kind); });
  // Every command line the agent ran, was refused or failed: one diary line, shortened, private words hidden.
  agent.on('command', (c) => {
    const line = alerts.commandLine(product.assistantName, c, (t) => guardian.redact(t));
    if (line) addDiary('command', line);
    log('[command]', (c && c.verdict) || '?', c && c.ok ? 'ok' : 'not ok'); // never the command text in the log
  });
  // Guardian refusals the agent reports ({rule: 'R1'...}): into the diary; remote tools and money exits alert family.
  agent.on('refused', (r) => {
    const rule = r && (r.rule || r.ruleId);
    const line = alerts.refusalLine(product.assistantName, rule);
    if (!line) return;
    addDiary('refusal', line);
    const kind = alerts.REFUSAL_ALERT[rule];
    if (kind) familyAlert(alerts.scamAlertText(config.get(), kind, Date.now()), { scam: true }).catch((e) => log('family alert', e.message));
  });

  const allowed = new Set(['media', 'speaker-selection', 'clipboard-sanitized-write']); // mic, voice, "Copy the code"
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));

  registerIpc();
  createLauncher();
  createWidget();
  createOverlay();
  const s = config.get();
  if (SMOKE) { openSettings(); return runSmoke(); }

  createTray();
  applySettingsSideEffects(s);
  globalShortcut.register('F9', () => { expandWidget(true); send(widgetWin, 'talk-toggle', {}); });
  globalShortcut.register('CommandOrControl+Alt+H', () => { stopAll(); showLauncher(); });
  if (!s.setupDone || !s.apiKey) openSettings();
  setInterval(() => { scamShieldTick().catch((e) => log('scam shield', e.message)); }, 2000);
  setInterval(() => { remoteTick().catch((e) => log('remote watch', e.message)); }, 2000);
  // "Hello, Barnaby" (settings.wakeWord): offline wake phrase in the native helper, only while nothing else is going on.
  wake = require('./src/wake').startWakeLoop({
    native, config, log,
    isQuiet: () => !busyNow() && !pendingAsk && pendingSay.size === 0 && !micOpen && !remoteOn,
    onWake: () => { expandWidget(true); send(widgetWin, 'talk-toggle', {}); },
  });
  // A screen plugged in, unplugged or rescaled: the widget stays on a screen, a warning card follows its window.
  // Our own AppBar changes only the work area; a screen added, removed, resized or rescaled docks the panel anew.
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(ev, (_e, _d, changed) => {
      if (dock && (ev !== 'display-metrics-changed' || (changed || []).some((c) => c !== 'workArea'))) { lastDock.clear(); endDock(); }
      layoutWidget();
      if (warningShown) placeOverlay(lastTarget && lastTarget.rect);
    });
  }
  setTimeout(maintenanceTick, 60 * 1000);
  setInterval(maintenanceTick, 10 * 60 * 1000);
  // Prompt-free quit: Barnaby runs as administrator, so a normal process can't close it. Any program of this user
  // may drop userData/quit.request (see "Close Barnaby.vbs"); we then quit the normal way (undock, clean up).
  setInterval(() => {
    const f = UD('quit.request');
    if (!fs.existsSync(f)) return;
    try { fs.unlinkSync(f); } catch (_) {}
    log('[quit] quit.request found');
    quitting = true;
    app.quit();
  }, 2000);
  // No spoken greeting: the collapsed pill cannot caption it (UX rule 7); the launcher greets on screen.
}).catch((e) => { log('boot failed', e); });

process.on('uncaughtException', (e) => log('uncaughtException', e));
process.on('unhandledRejection', (e) => log('unhandledRejection', e));

