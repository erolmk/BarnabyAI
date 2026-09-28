// Setup: the family helper (picked in the wizard), "Show me how" as the default mode, and the shared speaking speeds.
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

test('config: "Show me how" (teach) is the default, v3 resets mode and autoListen once, a later choice stays', () => {
  const c = new Config(tmpDir());
  assert.strictEqual(c.get().mode, 'teach');
  assert.strictEqual(c.get().autoListen, false, 'hold to talk; the mic does not open by itself');
  assert.strictEqual(c.get().keepTranscript, false, 'no transcript unless the family turns it on');
  assert.strictEqual(c.get().settingsVersion, 4);
  assert.strictEqual(c.get().ttsStyle, 'happy');
  assert.strictEqual(c.get().family.email, '');
  const old = tmpDir();
  fs.writeFileSync(path.join(old, 'settings.json'), JSON.stringify({ mode: 'together', userName: 'Rose' }));
  assert.strictEqual(new Config(old).get().mode, 'teach', 'an install saved before v2 moves to the new default');
  const v2 = tmpDir();
  fs.writeFileSync(path.join(v2, 'settings.json'), JSON.stringify({ mode: 'do', autoListen: true, userName: 'Rose', settingsVersion: 2 }));
  const o = new Config(v2);
  assert.deepStrictEqual([o.get().mode, o.get().autoListen, o.get().userName], ['teach', false, 'Rose'], 'v2 -> v3 moves once, keeps the rest');
  o.save({ mode: 'do', autoListen: true }); // the family picks them again
  const again = new Config(v2).get();
  assert.deepStrictEqual([again.mode, again.autoListen, again.settingsVersion], ['do', true, 4], 'a deliberate choice is never moved again');
  const v3 = tmpDir();
  fs.writeFileSync(path.join(v3, 'settings.json'), JSON.stringify({ mode: 'together', settingsVersion: 3 }));
  assert.strictEqual(new Config(v3).get().mode, 'together');
});

test('config v4: the old Faster is the new Normal; a saved speed keeps its label once, a later choice stays', () => {
  assert.strictEqual(new Config(tmpDir()).get().speechRate, 1.0, 'Normal is 1.0');
  const moved = [0.8, 0.9, 1.0, 0.7, 1.1].map((r) => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ speechRate: r, settingsVersion: 3 }));
    return new Config(d).get().speechRate;
  });
  assert.deepStrictEqual(moved, [0.9, 1.0, 1.1, 0.7, 1.1], 'Slower -> Slow, Normal -> Normal, Faster -> Faster; voice-set speeds stay');
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ speechRate: 0.9, settingsVersion: 3 }));
  new Config(d).save({ userName: 'Rose' }); // saved as v4
  assert.strictEqual(new Config(d).get().speechRate, 1.0, 'moved once only');
  const kept = tmpDir();
  fs.writeFileSync(path.join(kept, 'settings.json'), JSON.stringify({ speechRate: 0.9, settingsVersion: 4 }));
  assert.strictEqual(new Config(kept).get().speechRate, 0.9, 'a v4 Slow stays Slow');
});

test('speaking speeds: Settings has Slow/Normal/Faster, and the widget speed buttons use the same list', () => {
  const src = fs.readFileSync(path.join(UI, 'settings.js'), 'utf8');
  const m = /const SPEEDS = \[([^\]]*)\]/.exec(src);
  assert.ok(m, 'settings.js has SPEEDS');
  const speeds = m[1].split(',').map(Number);
  assert.deepStrictEqual(speeds, [0.9, 1.0, 1.1], 'the old Faster is the new Normal (the owner, 2026-09-28)');
  for (const r of speeds) assert.ok(r >= 0.7 && r <= 1.1, 'inside the voice-command clamp (tools.js 0.7-1.1)');
  const widget = ['widget.html', 'widget.js'].map((f) => fs.readFileSync(path.join(UI, f), 'utf8')).join('\n');
  const rates = [...widget.matchAll(/data-rate="([\d.]+)"/g)].map((x) => +x[1]);
  const list = /const SPEEDS = \[([^\]]*)\]/.exec(widget);
  if (rates.length) assert.deepStrictEqual(rates, speeds, 'widget.html data-rate buttons');
  if (list) assert.deepStrictEqual(list[1].split(',').map(Number), speeds, 'widget.js SPEEDS');
});
