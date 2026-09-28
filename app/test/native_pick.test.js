// How native/bin/helper.exe chooses which window items to list when there are more than `max`
// (owner session 2026-09-28: Gmail's inbox rows filled the 250 and cut off the Compose box's To, Send and OK).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXE = path.join(__dirname, '..', 'native', 'bin', 'helper.exe');
const skip = process.platform !== 'win32' || !fs.existsSync(EXE) ? 'needs native/bin/helper.exe on Windows' : false;

function pick(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(EXE, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    const t = setTimeout(() => { p.kill(); reject(new Error("helper timed out")); }, 20000);
    p.stdout.on('data', (d) => {
      out += d;
      const i = out.indexOf('\n');
      if (i < 0) return;
      clearTimeout(t);
      p.stdin.end(); p.kill();
      const r = JSON.parse(out.slice(0, i));
      r.ok ? resolve(r.result.keep) : reject(new Error(r.error));
    });
    p.on('error', reject);
    p.stdin.write(JSON.stringify({ id: 1, cmd: 'pick_check', args }) + '\n');
  });
}

// A Gmail-like window: 50 inbox rows (row, checkbox, star, sender link, subject text), then the Compose box
// drawn over the inbox's bottom right, later in tree order.
function inbox() {
  const items = [];
  const rows = [];
  for (let r = 0; r < 50; r++) {
    const y = 100 + r * 20;
    rows.push(items.length);
    items.push({ role: 'DataItem', rect: [250, y, 1600, 20] });
    items.push({ role: 'CheckBox', rect: [255, y, 18, 18] });
    items.push({ role: 'Button', rect: [280, y, 18, 18] });
    items.push({ role: 'Hyperlink', rect: [300, y, 200, 18] });
    items.push({ role: 'Text', rect: [520, y, 900, 18] });
  }
  const compose = {
    title: items.push({ role: 'Text', rect: [1300, 700, 300, 30] }) - 1,
    to: items.push({ role: 'Edit', rect: [1300, 740, 560, 28] }) - 1,
    subject: items.push({ role: 'Edit', rect: [1300, 770, 560, 28] }) - 1,
    body: items.push({ role: 'Document', rect: [1300, 800, 560, 200] }) - 1,
    send: items.push({ role: 'Button', rect: [1300, 1010, 80, 36] }) - 1,
    clip: items.push({ role: 'Button', rect: [1400, 1010, 30, 36] }) - 1,
  };
  return { items, rows, compose };
}

test('elements over the cap: long inbox runs are cut, the Compose box is always kept', { skip }, async () => {
  const { items, rows, compose } = inbox();
  items[compose.to].focused = true; // the person is in the To box
  const keep = await pick({ items, max: 250, regions: [[1290, 690, 580, 370]] });
  for (const k of Object.values(compose)) assert.ok(keep.includes(k), 'kept compose item ' + k);
  assert.ok(keep.includes(rows[0]) && keep.includes(rows[11]), 'first 12 rows kept');
  assert.ok(!keep.includes(rows[20]) && !keep.includes(rows[20] + 3), 'a far row and its link are dropped');
  const near = rows.filter((i) => Math.abs(items[i].rect[1] + 10 - 754) <= 40);
  assert.ok(near.some((i) => keep.includes(i)), 'rows next to the focus are kept');
  assert.deepStrictEqual(keep, [...keep].sort((a, b) => a - b), 'kept in tree order');
  assert.deepStrictEqual(await pick({ items, max: 250, regions: [[1290, 690, 580, 370]] }), keep, 'deterministic');
  const plain = await pick({ items, max: 250 }); // Compose not reported as a dialog: the row cut alone frees room
  for (const k of Object.values(compose)) assert.ok(plain.includes(k), 'kept without a dialog ' + k);
});

test('elements over the cap: still too many -> focus, dialogs, edit boxes and buttons before text', { skip }, async () => {
  const { items, compose } = inbox();
  // no focus; a tight cap after the row cut: the dialog wins, then edits/buttons, and plain text goes first
  const keep = await pick({ items, max: 12, regions: [[1290, 690, 580, 370]] });
  assert.strictEqual(keep.length, 12);
  for (const k of Object.values(compose)) assert.ok(keep.includes(k), 'dialog item ' + k + ' kept');
  assert.ok(keep.every((i) => items[i].role !== 'Text' || i === compose.title), 'no inbox text over dialog/buttons');
});

test('elements under the cap: a short list keeps every row', { skip }, async () => {
  const items = [];
  for (let r = 0; r < 16; r++) items.push({ role: 'ListItem', rect: [0, r * 30, 300, 30] }, { role: 'Text', rect: [5, r * 30 + 5, 200, 20] });
  const keep = await pick({ items, max: 250 });
  assert.strictEqual(keep.length, items.length);
});

test('elements over the cap: list-row cells (Explorer draws them as Edits) rank below the toolbar', { skip }, async () => {
  const items = [];
  for (let b = 0; b < 10; b++) items.push({ role: 'Button', rect: [150 + b * 50, 240, 40, 40] });
  for (let r = 0; r < 14; r++) {
    const y = 350 + r * 28;
    items.push({ role: 'ListItem', rect: [323, y, 675, 24] });
    for (const [x, w] of [[345, 270], [615, 162], [777, 135], [912, 90]]) items.push({ role: 'Edit', rect: [x, y + 3, w, 19] }); // the last one sticks out 4 px
  }
  const keep = await pick({ items, max: 20 });
  for (let b = 0; b < 10; b++) assert.ok(keep.includes(b), 'toolbar button ' + b + ' kept');
});
