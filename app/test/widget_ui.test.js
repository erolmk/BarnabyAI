// The widget panel (ui/widget.*) under Node: the green "I did it" button, the thinking dots that never stand still, and
// the panel's text sizes (the owner's test report, 2026-09-28).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI = path.join(__dirname, '..', 'ui');
const read = (f) => fs.readFileSync(path.join(UI, f), 'utf8');

// ui/widget.js in a tiny fake page: just enough DOM for a question to be drawn and answered.
function fakePage() {
  const els = {};
  const el = (tag) => {
    const cls = new Set(), kids = [], on = {};
    const e = {
      tagName: tag, hidden: false, style: { setProperty() {} }, dataset: {}, innerHTML: '', value: '', scrollTop: 0,
      scrollHeight: 0, clientHeight: 0, children: kids,
      get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, b) => ((b === undefined ? !cls.has(c) : b) ? cls.add(c) : cls.delete(c)) },
      _text: '', get textContent() { return e._text; }, set textContent(v) { e._text = String(v); kids.length = 0; },
      append: (...k) => kids.push(...k), addEventListener: (t, f) => { on[t] = f; }, click: () => on.click && on.click({}),
      setAttribute() {}, focus() {}, setPointerCapture() {}, querySelector: () => el('x'), querySelectorAll: () => [],
      getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }),
    };
    return e;
  };
  const byId = (id) => els[id] || (els[id] = el('div'));
  const handlers = {}, answers = [];
  const win = { innerWidth: 560, innerHeight: 1000, addEventListener() {}, location: { search: '' }, screen: {} };
  win.helper = { product: { assistantName: 'Barnaby' }, getSettings: () => Promise.resolve({ muted: true }), saveSettings() {},
    on: (ch, f) => { handlers[ch] = f; }, answer: (id, v) => answers.push([id, v]), ask() {}, stop() {}, goHome() {}, spoken() {},
    widget: { expand() {}, dragBy() {} } };
  win.BarnabyStatus = require('../ui/status');
  const doc = { getElementById: byId, createElement: el, addEventListener() {}, querySelector: () => null,
    documentElement: { style: { setProperty() {}, getPropertyValue: () => '1' }, dataset: {} }, body: el('body'), title: '' };
  const ctx = { window: win, document: doc, location: win.location, URLSearchParams, Promise, Number, String, Math, Array, Object,
    Date, Map, Set, setTimeout: (f, ms) => setTimeout(f, ms).unref(), clearTimeout, console, requestAnimationFrame: () => 0, getComputedStyle: () => ({ getPropertyValue: () => '1' }) };
  vm.runInNewContext(read('widget.js'), ctx);
  return { els, handlers, answers };
}

test('widget: the ring question shows "I did it, but Barnaby didn\'t notice" first as the big green button, and it answers', () => {
  const p = fakePage();
  const did = 'I did it, but Barnaby didn\'t notice';
  p.handlers.ask({ requestId: 'q1', question: 'Click the blue button.', kind: 'choice', green: did,
    choices: ['Please do it for me', did, 'I need help'] });
  const btns = p.els.answers.children.filter((c) => c.tagName === 'button');
  assert.strictEqual(btns[0].textContent, did, 'first');
  assert.ok(btns[0].classList.contains('green'), 'green');
  assert.strictEqual(btns.filter((b) => b.classList.contains('green')).length, 1, 'only that one');
  assert.deepStrictEqual(btns.map((b) => b.textContent).slice(1, 3), ['Please do it for me', 'I need help'], 'the others stay');
  btns[0].click();
  assert.deepStrictEqual(p.answers, [['q1', did]], 'counts exactly like the old "I did it"');
  // no green field: plain buttons as before
  p.handlers.ask({ requestId: 'q2', question: 'Which one?', kind: 'choice', choices: ['Gmail', 'Outlook'] });
  assert.ok(!p.els.answers.children.some((c) => c.classList.contains('green')));
});

test('main forwards the ask\'s green field to the widget unchanged', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /ask\(\{[^}]*\bgreen\b[^}]*\}\)/, 'ui.ask takes green');
  assert.match(src, /const msg = \{[^}]*\bgreen\b[^}]*\};/, 'and puts it in the ask message');
});

test('thinking dots never stand still: the panel is never paused as hidden, and reduced motion still fades them in turn', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /widgetWin = new BrowserWindow\(\{[\s\S]*?webPreferences: \{ \.\.\.WEB, backgroundThrottling: false \}/);
  const css = read('widget.css');
  const reduced = css.split('@media (prefers-reduced-motion: reduce)')[1] || '';
  assert.match(reduced, /\.think-big i \{ animation: think-fade [^;]*infinite !important; \}/, 'overrides shared.css animation: none');
  assert.match(reduced, /nth-child\(2\) \{ animation-delay: [^;]+ !important/, 'the dots still take turns');
  const fade = /@keyframes think-fade \{([^\n]*)\}/.exec(css);
  assert.ok(fade && !/transform/.test(fade[1]), 'fading only, no movement');
});

test('panel sizes: Barnaby\'s words bigger than the buttons, the bottom row smaller, nothing below 18 px at text size 1', () => {
  const css = read('widget.css');
  const px = (name, where = css) => +(new RegExp(name + ':\\s*calc\\((\\d+)px \\* var\\(--ui-scale\\)\\)').exec(where) || [])[1];
  const [caption, button, body, min, bottom] = ['--fs-caption', '--fs-button', '--fs-body', '--fs-min', '--fs-bottom'].map((n) => px(n));
  assert.ok(caption > button && button > bottom, [caption, button, bottom].join(' > '));
  for (const v of [body, min, bottom]) assert.ok(v >= 18, 'at least 18 px: ' + v);
  assert.ok(body < 24 && button < 26, 'plain text and buttons a bit smaller than the shared 24 / 26 px');
});
