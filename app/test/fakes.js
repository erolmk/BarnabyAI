// Shared fakes for agent tests: native helper, ui bridge, scripted LLM, guardian, support, config.
const fs = require('fs');
const path = require('path');
const { DEFAULTS, merge } = require('../src/config');

const IMG = { width: 1280, height: 720, factor: 2.25, originX: 0, originY: 0 };
const PENDING = Symbol('pending');

// A Gmail-like window, rects in PHYSICAL px (factor 2.25).
const GMAIL_ELEMENTS = [
  { id: 1, name: 'Compose', role: 'Button', rect: [90, 472, 270, 99], enabled: true },
  { id: 2, name: 'Send', role: 'Button', rect: [1400, 1300, 200, 90], enabled: true },
  { id: 3, name: 'To recipients', role: 'Edit', rect: [1400, 500, 900, 60], enabled: true, focused: true },
  { id: 4, name: 'Subject', role: 'Edit', rect: [1400, 580, 900, 60], enabled: true },
  { id: 5, name: 'Message Body', role: 'Edit', rect: [1400, 660, 900, 500], enabled: true },
  { id: 6, name: 'Attach files', role: 'Button', rect: [1700, 1300, 90, 90], enabled: true },
];
const GMAIL_WINDOW = { hwnd: 100, title: 'Inbox - Gmail - Google Chrome', process: 'chrome', pid: 4242, rect: [0, 0, 2880, 1620] };

function fakeNative(events, opts = {}) {
  const img = opts.img || IMG;
  const calls = [];
  return {
    calls,
    async call(cmd, args = {}) {
      calls.push({ cmd, args });
      events.push({ type: 'native', cmd, args });
      if (opts.fail && opts.fail.includes(cmd)) throw new Error('native ' + cmd + ' failed');
      switch (cmd) {
        case 'windows': return { windows: [{ ...GMAIL_WINDOW, foreground: true }, { hwnd: 200, title: 'Photos - iCloud', process: 'msedge', pid: 5000, rect: [0, 0, 100, 100] }, { hwnd: 300, title: 'Barnaby', process: 'electron', pid: 1 }] };
        case 'foreground': return { ...GMAIL_WINDOW };
        case 'elements': return { window: { hwnd: 100, title: GMAIL_WINDOW.title, process: 'chrome', rect: GMAIL_WINDOW.rect }, elements: opts.elements || GMAIL_ELEMENTS };
        case 'screenshot': return { png: 'iVBORw0KGgo=', ...img };
        case 'click_element': return { x: 0, y: 0, method: 'invoke' };
        case 'wait_click': return opts.waitClick ? opts.waitClick(args) : { clicked: true, x: args.rect[0] + 5, y: args.rect[1] + 5, button: 'left', inRect: true };
        case 'window_text': return { title: 'Windows Defender Alert', text: 'Your computer is infected! Call Microsoft support now at 1-888-555-0199. Do not restart.' };
        default: return {};
      }
    },
  };
}

function defaultAnswer(a) {
  if (a.kind === 'confirm') return 'yes';
  const c = a.choices || [];
  if (c.includes('Please do it for me')) return PENDING; // wait for the real click
  if (c.includes('I did it')) return 'I did it';
  return c.length ? c[0] : 'okay';
}

function fakeUi(events, opts = {}) {
  let pending = null;
  const ui = {
    ownPid: 1, said: [], asks: [], highlights: [], statuses: [], cancels: 0, clears: 0, warns: [],
    say(text) {
      events.push({ type: 'say', text });
      ui.said.push(text);
      if (opts.onSay) opts.onSay(text);
      return Promise.resolve();
    },
    status(s) { ui.statuses.push(s); },
    ask(a) {
      events.push({ type: 'ask', ...a });
      ui.asks.push(a);
      const ans = opts.answer ? opts.answer(a) : defaultAnswer(a);
      if (ans === PENDING) return new Promise((resolve, reject) => { pending = { resolve, reject }; });
      return Promise.resolve(ans);
    },
    cancelAsk() {
      ui.cancels++;
      if (pending) { const p = pending; pending = null; p.reject(new Error('cancelled')); }
    },
    highlight(rect, label) { events.push({ type: 'highlight', rect, label }); ui.highlights.push({ rect, label }); },
    clearOverlay() { ui.clears++; },
    warn(w) { ui.warns.push(w); },
    showLauncher() { ui.launcherShown = true; },
    hideLauncher() {},
    expandWidget() {},
    lastTarget: () => null,
  };
  return ui;
}

let seq = 0;
const tc = (name, args) => ({ id: 'call_' + (++seq), type: 'function', function: { name, arguments: JSON.stringify(args) } });
const assistant = (...calls) => ({ role: 'assistant', content: null, tool_calls: calls });

// script[i] = assistant message (or fn(args) -> message) for the i-th call; past the end -> done.
function fakeLlm(script, { cost = 0.001 } = {}) {
  const calls = [];
  return {
    calls,
    async chat(args) {
      calls.push(structuredClone(args));
      const next = script[calls.length - 1];
      const m = next === undefined ? assistant(tc('done', { summary: 'All done.' })) : typeof next === 'function' ? next(args) : next;
      return { message: structuredClone(m), finish: 'stop', cost, model: args.model };
    },
  };
}

function fakeGuardian(opts = {}) {
  const g = {
    gates: [], alerts: [],
    async gateAction(action, context) {
      g.gates.push({ action, context });
      if (opts.gate) return opts.gate(action, context);
      return { verdict: 'auto', reason: '', confidence: 0.9 };
    },
    hardCheck() { return null; },
    isRemoteAccess: (s) => /anydesk|any desk|teamviewer|quick assist/i.test(String(s)),
    sensitive: () => false,
    async checkScreen({ title, text } = {}) {
      g.screens = (g.screens || 0) + 1;
      if (!/infected|virus|defender alert/i.test(title + ' ' + text)) return { scam: false, probability: 0, reason: '', matched: [] };
      return { scam: true, probability: 0.95, kind: 'tech_support', reason: 'This is a fake warning.', matched: ['infected'] };
    },
    async alertFamily(m) { g.alerts.push(m); return true; },
  };
  return g;
}

function fakeSupport(events) {
  return {
    catalog: () => [
      { name: 'overview', title: 'Computer overview', kind: 'check', needsArg: false },
      { name: 'top_processes', title: 'Busy programs', kind: 'check', needsArg: false },
      { name: 'startup_apps', title: 'Programs that start by themselves', kind: 'check', needsArg: false },
      { name: 'disk_space', title: 'Storage space', kind: 'check', needsArg: false },
      { name: 'clear_temp', title: 'Clear temporary files', kind: 'fix', needsArg: false },
      { name: 'close_app', title: 'Close a program', kind: 'fix', needsArg: true },
    ],
    async runCheck(name) { events.push({ type: 'check', name }); return { name, title: 'Computer overview', ok: true, text: 'Up for 12 days. Memory 7.1 of 8 GB in use. C: 4 GB free of 237 GB.', ms: 10 }; },
    async applyFix(name, arg) { events.push({ type: 'fix', name, arg }); return { ok: true, text: 'Cleared 3.2 GB.' }; },
    async ps(script) { events.push({ type: 'ps', script }); return 'PS OUTPUT: ' + String(script).slice(0, 40); },
  };
}

function fakeConfig(over = {}) {
  let data = merge(DEFAULTS, { apiKey: 'test-key', ...over });
  const c = {
    saves: [],
    get: () => JSON.parse(JSON.stringify(data)),
    save(p) { c.saves.push(p); data = merge(data, p); return c.get(); },
  };
  return c;
}

// Temp dirs on the same drive as the repo (G:), removed after the run.
const TMP = path.join(__dirname, '.tmp');
function tmpDir() {
  fs.mkdirSync(TMP, { recursive: true });
  return fs.mkdtempSync(path.join(TMP, 'a-'));
}
function cleanTmp() { fs.rmSync(TMP, { recursive: true, force: true }); }

module.exports = {
  IMG, PENDING, GMAIL_ELEMENTS, GMAIL_WINDOW, fakeNative, fakeUi, fakeLlm, fakeGuardian, fakeSupport, fakeConfig,
  tc, assistant, tmpDir, cleanTmp,
};
