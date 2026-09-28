// Copy lint for the launcher, lessons and settings pages (research/02_ux_guidelines.md 8.3 + 03_naming.md).
// Checks every quoted string and every piece of HTML text in the UI files this test lists.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const COPY_LINT = /\b(oops|uh-?oh|whoops|invalid|illegal|fatal|abort(ed)?|execute|simply|obviously|easy|easily|just (click|press|type|tap)|senior|elderly|dear|honey|sweetie|sweetheart|young lady|good (girl|boy)|0x[0-9a-f]{4,})\b|!!/i;
const CAPS_LINT = /\b[A-Z]{5,}\b/;
const EXTRA = /\b(Barney|submit|user|input|error|timed out)\b/i; // our own UI never says these

const UI = path.join(__dirname, '..', 'ui');
const FILES = ['launcher.html', 'launcher.js', 'lessons.html', 'lessons.js', 'settings.html', 'settings.js', 'demo-stub.js',
  'widget.html', 'widget.js', 'status.js'];

function strings(src) {
  const out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|>([^<>{}]+)</g;
  let m;
  while ((m = re.exec(src))) out.push(m[1] || m[2] || m[3] || '');
  return out.map((s) => s.trim()).filter((s) => /[a-z]{3,} [a-z]/i.test(s)); // looks like words, not code
}

test('UI copy passes COPY_LINT and the naming rules', () => {
  const bad = [];
  for (const f of FILES) {
    for (const s of strings(fs.readFileSync(path.join(UI, f), 'utf8'))) {
      if (/^(https?:|data:|[\w-]+\.(js|css|svg|png)$)/.test(s) || /[{}();=]/.test(s)) continue; // code, not copy
      if (COPY_LINT.test(s) || CAPS_LINT.test(s) || EXTRA.test(s)) bad.push(f + ': ' + s);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('pages take the product name from helper.product, never hardcoded in HTML body text', () => {
  for (const f of ['launcher.html', 'lessons.html', 'settings.html']) {
    const body = fs.readFileSync(path.join(UI, f), 'utf8').split('<body')[1];
    assert.ok(!/Barnaby/.test(body.replace(/alt="Barnaby"/g, '')), f + ' hardcodes the name');
  }
});
