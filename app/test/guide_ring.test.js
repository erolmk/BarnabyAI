// "Show me how" ring (the owner's 2026-09-28 test): right clicks count, typing is noticed, the screen settles before
// the next look, a click outside is not automatically a miss, the green "didn't notice" answer, and click snapping.
const test = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../src/tools');
const F = require('./fakes');

const GREEN = "I did it, but Barnaby didn't notice";
const COMPOSE = F.GMAIL_ELEMENTS[0], TO = F.GMAIL_ELEMENTS[2];

// handlers[cmd]: a value or fn(args, n) (n = how many times cmd was called before). The screen is steady by default.
function nat(handlers = {}) {
  const calls = [];
  return {
    calls,
    cmds: () => calls.map((c) => c.cmd),
    async call(cmd, args = {}) {
      const n = calls.filter((c) => c.cmd === cmd).length;
      calls.push({ cmd, args });
      const h = handlers[cmd];
      if (typeof h === 'function') return h(args, n);
      if (h !== undefined) return h;
      if (cmd === 'foreground') return { hwnd: 100, title: 'Inbox' };
      if (cmd === 'windows') return { windows: [{ hwnd: 100, title: 'Inbox' }] };
      return {};
    },
  };
}
function makeCtx({ native, answer, mode = 'teach', elements = F.GMAIL_ELEMENTS } = {}) {
  const events = [];
  return {
    mode, goal: 'save a picture', native, ui: F.fakeUi(events, { answer: answer || (() => F.PENDING) }),
    guardian: F.fakeGuardian(), steps: [], heard: [], status() {}, check() {}, log() {},
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), timing: { settle: 0, open: 0 },
    obs: { img: F.IMG, elements: new Map(elements.map((e) => [e.id, e])), window: F.GMAIL_WINDOW, complete: true },
  };
}
const guide = (ctx, args) => tools.execute({ name: 'guide_user', args }, ctx);
const click = (b, rect, inRect = true) => ({ clicked: true, x: rect[0] + 5, y: rect[1] + 5, button: b, inRect });

test('a right click in the ring counts (even on a "done" step), says which button; the green answer is first', async () => {
  const native = nat({ wait_click: (a) => click('right', a.rect) });
  const ctx = makeCtx({ native });
  const r = await guide(ctx, { element_id: 1, instruction: 'Please right-click the picture.', wait_for: 'done' });
  assert.match(r, /clicked inside the highlighted area with the right mouse button/);
  assert.equal(ctx.ui.asks[0].choices[0], GREEN);
  assert.equal(ctx.ui.asks[0].green, GREEN);
  assert.ok(native.cmds().filter((c) => c === 'windows').length >= 3, 'waited for the screen to settle');
  // a left click where a right-click was asked still moves on, and says so
  const l = await guide(makeCtx({ native: nat({ wait_click: (a) => click('left', a.rect) }) }), { element_id: 1, instruction: 'Right-click the picture.' });
  assert.match(l, /inside the highlighted area, but with the LEFT mouse button/);
  // the green button counts as "I did it"
  const g = makeCtx({ native: nat({ wait_click: () => new Promise(() => {}) }), answer: (a) => a.green });
  assert.match(await guide(g, { element_id: 1, instruction: 'Click Compose.' }), /said they did it/);
  assert.equal(g.stuck, 0);
});

test('typing is noticed: a pause after new text or Enter ends the step; a private box is never read', async () => {
  let reads = 0;
  const native = nat({
    wait_click: (a) => click('left', a.rect),
    wait_typing: (a, n) => (n === 0 ? { typed: 2, enter: false } : { typed: 4, enter: true }), // arrows first, then Enter
    focus_value: () => ({ role: 'Edit', value: reads++ < 2 ? '' : 'Rafi' }),
  });
  const ctx = makeCtx({ native });
  const r = await guide(ctx, { element_id: 3, instruction: 'Please click the To box and type Rafi.', wait_for: 'done' });
  assert.equal(r, 'The person typed in the box: "Rafi" and pressed Enter. Look at the new screen to check it, then show the next step.');
  assert.equal(native.calls.find((c) => c.cmd === 'wait_typing').args.idleMs, 2500);
  assert.equal(native.cmds().filter((c) => c === 'wait_typing').length, 2, 'unchanged text: keep watching');
  assert.ok(ctx.ui.cancels >= 1 && native.cmds().includes('cancel_wait'), 'the question and the hooks end');
  assert.deepEqual(ctx.ui.highlights[1], { rect: TO.rect, label: '' });

  const pw = [{ id: 7, name: 'Password', role: 'Edit', rect: [100, 100, 400, 60], enabled: true, password: true }];
  const p = nat({ wait_click: (a) => click('left', a.rect), wait_typing: { typed: 9, enter: false } });
  const s = await guide(makeCtx({ native: p, elements: pw }), { element_id: 7, instruction: 'Please type your password in the box.', wait_for: 'done' });
  assert.match(s, /typed in the box \(a private box, so I did not read it\)\./);
  assert.ok(!p.cmds().includes('focus_value'), 'never reads a password box');
});

test('the screen settles before the result: a new window keeps changing, then stays', async () => {
  const native = nat({
    wait_click: (a) => click('left', a.rect),
    windows: (a, n) => ({ windows: n < 4 ? [{ hwnd: 100 + n, title: 'x' }] : [{ hwnd: 9, title: 'Save As' }] }),
  });
  const t0 = Date.now();
  await guide(makeCtx({ native }), { element_id: 1, instruction: 'Click Save image as.' });
  const ms = Date.now() - t0;
  assert.ok(ms >= 600 && ms < 2800, 'settled in ' + ms + ' ms');
  assert.ok(native.cmds().filter((c) => c === 'windows').length >= 8);
});

test('a click outside the ring names what was clicked and is a miss only when nothing changed', async () => {
  const out = (rect) => ({ clicked: true, x: TO.rect[0] + 10, y: TO.rect[1] + 10, button: 'right', inRect: false });
  const same = makeCtx({ native: nat({ wait_click: out }) });
  const r = await guide(same, { element_id: 1, instruction: 'Click Compose.' });
  assert.match(r, /clicked outside the highlighted area with the right mouse button, on \[3\] "To recipients" at x=\d+, y=\d+ \(screenshot pixels\)\. Look at the new screen first/);
  assert.equal(same.stuck, 1, 'nothing changed: a miss');
  const changed = makeCtx({ native: nat({ wait_click: out, foreground: (a, n) => ({ hwnd: n ? 9 : 100, title: n ? 'Save As' : 'Inbox' }) }) });
  await guide(changed, { element_id: 1, instruction: 'Click Compose.' });
  assert.ok(!changed.stuck, 'a new window came up: not a miss');
});

test('Barnaby\'s own click snaps x,y only to the item under it or the one it names; the ring keeps the nearest item', async () => {
  const els = [{ id: 1, name: 'Archive', role: 'Button', rect: [900, 900, 180, 90], enabled: true }];
  // (900-30)/2.25 = 386.7: 30 px left of the button, within the 40-picture-px fallback
  const x = (900 - 30) / F.IMG.factor, y = 945 / F.IMG.factor;
  const n = nat();
  const ctx = makeCtx({ native: n, mode: 'do', elements: els });
  await tools.execute({ name: 'click', args: { x, y, explain: 'Clicking the empty space.' } }, ctx);
  assert.ok(!n.cmds().includes('click_element'));
  assert.deepEqual(n.calls.find((c) => c.cmd === 'click').args, { x: 870, y: 945, button: 'left', double: false });
  const named = nat();
  await tools.execute({ name: 'click', args: { x, y, explain: 'Clicking Archive.' } }, makeCtx({ native: named, mode: 'do', elements: els }));
  assert.deepEqual(named.calls.find((c) => c.cmd === 'click').args, { x: 990, y: 945, button: 'left', double: false }, 'named: snapped');
  const g = makeCtx({ native: nat({ wait_click: (a) => click('left', a.rect) }), elements: els });
  await guide(g, { x, y, instruction: 'Please click there.' });
  assert.deepEqual(g.ui.highlights[0].rect, els[0].rect, 'the ring still snaps to the nearest item');
});
