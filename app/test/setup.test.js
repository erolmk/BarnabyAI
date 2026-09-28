// Setup: the family helper (picked in the wizard), Auto as the default mode, and the shared speaking speeds.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const alerts = require('../src/alerts');
const { Config } = require('../src/config');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'barnaby-setup-'));
const UI = path.join(__dirname, '..', 'ui');

test('family helper: picks during first-run setup apply at once; after setup the email waits a day like the phone', () => {
  const now = new Date('2026-09-28T10:00:00').getTime();
  const fam = { name: 'Anna', phone: '5550142', email: 'a@x.com', ntfyTopic: 'barnaby-x', alertConsent: 'tell_family', weeklyNote: true };
  const before = { scamShield: true, family: fam, pendingFamily: [] };
  const pre = alerts.safetyPatch({ ...before, setupDone: false }, { family: { ...fam, name: 'Ben', alertConsent: 'just_me' } }, now);
  assert.strictEqual(pre.patch.family.name, 'Ben');
  assert.strictEqual(pre.patch.family.alertConsent, 'just_me');
  assert.deepStrictEqual(pre.patch.pendingFamily, []);
  assert.strictEqual(pre.familyAdded.length, 0, 'nobody is told during setup');
  const em = alerts.safetyPatch({ ...before, setupDone: true }, { family: { email: 'b@x.com' } }, now);
  assert.strictEqual(em.patch.family.email, 'a@x.com');
  assert.deepStrictEqual(em.patch.pendingFamily.map((x) => x.field), ['email']);
  // no setupDone at all keeps the lock (fail closed)
  assert.strictEqual(alerts.safetyPatch(before, { family: { name: 'Ben' } }, now).patch.family.name, 'Anna');
});

test('config: Auto ("do") is the default, a saved old default moves once, a later "together" choice stays', () => {
  const c = new Config(tmpDir());
  assert.strictEqual(c.get().mode, 'do');
  assert.strictEqual(c.get().autoListen, true, 'the mic opens by itself after a question unless the family turns it off');
  assert.strictEqual(c.get().ttsStyle, 'happy');
  assert.strictEqual(c.get().family.email, '');
  const old = tmpDir();
  fs.writeFileSync(path.join(old, 'settings.json'), JSON.stringify({ mode: 'together', userName: 'Rose' }));
  const o = new Config(old);
  assert.strictEqual(o.get().mode, 'do', 'an install saved before Auto moves to Auto');
  o.save({ mode: 'together' }); // the family picks it again
  assert.strictEqual(new Config(old).get().mode, 'together', 'a deliberate choice is never moved again');
  const teach = tmpDir();
  fs.writeFileSync(path.join(teach, 'settings.json'), JSON.stringify({ mode: 'teach' }));
  assert.strictEqual(new Config(teach).get().mode, 'teach');
});

test('speaking speeds: Settings has Slower/Normal/Faster, and the widget speed buttons use the same list', () => {
  const src = fs.readFileSync(path.join(UI, 'settings.js'), 'utf8');
  const m = /const SPEEDS = \[([^\]]*)\]/.exec(src);
  assert.ok(m, 'settings.js has SPEEDS');
  const speeds = m[1].split(',').map(Number);
  assert.strictEqual(speeds.length, 3);
  for (const r of speeds) assert.ok(r >= 0.7 && r <= 1.1, 'inside the voice-command clamp (tools.js 0.7-1.1)');
  const widget = ['widget.html', 'widget.js'].map((f) => fs.readFileSync(path.join(UI, f), 'utf8')).join('\n');
  const rates = [...widget.matchAll(/data-rate="([\d.]+)"/g)].map((x) => +x[1]);
  const list = /const SPEEDS = \[([^\]]*)\]/.exec(widget);
  if (rates.length) assert.deepStrictEqual(rates, speeds, 'widget.html data-rate buttons');
  if (list) assert.deepStrictEqual(list[1].split(',').map(Number), speeds, 'widget.js SPEEDS');
});
