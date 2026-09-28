// Pure helpers behind main.js (main.js itself only loads under Electron and is never required here):
// widget geometry, safety diary + retention, family-alert consent and wording, Scam Shield delay, config reset.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const geom = require('../src/widgetgeom');
const diary = require('../src/diary');
const alerts = require('../src/alerts');
const { Config } = require('../src/config');
const startup = require('../src/startup');
const status = require('../ui/status');

const WA = { x: 0, y: 0, width: 1920, height: 1032 };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'barnaby-test-'));
const tmpDir = () => fs.mkdtempSync(path.join(ROOT, 'd-'));
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

test('widget size grows with the text size and for a confirm card, never past the work area', () => {
  assert.deepStrictEqual(geom.size(false, WA), { width: 248, height: 112 });
  assert.deepStrictEqual(geom.size(true, WA, { scale: 1 }), { width: 480, height: 760 });
  assert.deepStrictEqual(geom.size(true, WA, { scale: 1.2 }), { width: 576, height: 912 });
  assert.deepStrictEqual(geom.size(true, WA, { scale: 1.6 }), { width: 768, height: 1000 }, 'capped at work area - 32');
  assert.deepStrictEqual(geom.size(true, WA, { scale: 9 }), geom.size(true, WA, { scale: 1.6 }), 'scale clamped to 1.6');
  assert.strictEqual(geom.size(true, WA, { scale: 1, confirm: true }).height, Math.round(1032 * 0.9));
  const small = { x: 0, y: 0, width: 1280, height: 672 };
  assert.deepStrictEqual(geom.size(true, small, { scale: 1.4 }), { width: 672, height: 640 });
  assert.strictEqual(geom.size(true, small, { confirm: true }).height, 640, 'confirm never taller than work area - 32');
  const narrow = { x: 0, y: 0, width: 600, height: 1000 };
  assert.strictEqual(geom.size(true, narrow, { scale: 1.6 }).width, 568);
});

test('pill starts bottom-right; expanding grows from the pill corner; collapsing snaps to the nearest corner', () => {
  const pill = geom.bounds(null, false, WA);
  assert.deepStrictEqual(pill, { x: 1920 - 16 - 248, y: 1032 - 16 - 112, width: 248, height: 112 });
  const panel = geom.bounds(pill, true, WA, { scale: 1 });
  assert.deepStrictEqual(panel, { x: 1920 - 16 - 480, y: 1032 - 16 - 760, width: 480, height: 760 }, 'bottom-right kept');
  // "Move me" put the panel at the top-left: collapsing puts the pill top-left, not back bottom-right.
  const tl = { x: 16, y: 16, width: 480, height: 760 };
  assert.strictEqual(geom.nearestCorner(tl, WA), 'tl');
  assert.deepStrictEqual(geom.bounds(tl, false, WA), { x: 16, y: 16, width: 248, height: 112 });
  // top-left pill expands down-right; bottom-left pill expands up-right
  assert.deepStrictEqual(geom.bounds({ x: 16, y: 16, width: 248, height: 112 }, true, WA), { x: 16, y: 16, width: 480, height: 760 });
  const bl = { x: 16, y: 1032 - 16 - 112, width: 248, height: 112 };
  assert.strictEqual(geom.nearestCorner(bl, WA), 'bl');
  assert.deepStrictEqual(geom.bounds(bl, true, WA), { x: 16, y: 1032 - 16 - 760, width: 480, height: 760 });
  // top-right panel -> top-right pill
  assert.deepStrictEqual(geom.bounds({ x: 1424, y: 16, width: 480, height: 760 }, false, WA), { x: 1920 - 16 - 248, y: 16, width: 248, height: 112 });
  // a second monitor to the left (negative x) works the same
  const left = { x: -1280, y: 0, width: 1280, height: 984 };
  assert.deepStrictEqual(geom.bounds({ x: -1264, y: 100, width: 480, height: 760 }, false, left), { x: -1264, y: 16, width: 248, height: 112 });
  // growing near an edge is clamped onto the screen
  const b = geom.bounds({ x: 1600, y: 500, width: 248, height: 112 }, true, WA, { confirm: true });
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 1920 && b.y + b.height <= 1032, JSON.stringify(b));
});

test('docked: the panel is the right third (440-760 wide), full work-area height; the program gets exactly the rest', () => {
  const d = geom.dock(WA, 1920);
  assert.deepStrictEqual(d.panel, { x: 1280, y: 0, width: 640, height: 1032 });
  assert.deepStrictEqual(d.left, { x: 0, y: 0, width: 1280, height: 1032 });
  // a 1366 x 768 laptop: a third is 455; at 125% (1093 DIP) the minimum 440 holds
  assert.strictEqual(geom.dock({ x: 0, y: 0, width: 1366, height: 728 }, 1366).panel.width, 455);
  assert.strictEqual(geom.dock({ x: 0, y: 0, width: 1093, height: 582 }, 1093).panel.width, 440);
  assert.strictEqual(geom.dock({ x: 0, y: 0, width: 3840, height: 2100 }, 3840).panel.width, 760, 'a 4K screen: at most 760');
  // a taskbar on the left (work area starts at x=48) and a second screen to the left (negative x)
  const tb = geom.dock({ x: 48, y: 0, width: 1872, height: 1080 }, 1920);
  assert.deepStrictEqual(tb.panel, { x: 1280, y: 0, width: 640, height: 1080 });
  assert.strictEqual(tb.left.x + tb.left.width, tb.panel.x, 'no gap and no overlap');
  const neg = geom.dock({ x: -1280, y: 40, width: 1280, height: 984 }, 1280);
  assert.deepStrictEqual(neg.panel, { x: -440, y: 40, width: 440, height: 984 });
  assert.deepStrictEqual(neg.left, { x: -1280, y: 40, width: 840, height: 984 });
  // never wider than the work area
  assert.strictEqual(geom.dock({ x: 0, y: 0, width: 300, height: 500 }, 300).panel.width, 300);
  // bigger text widens a small screen's panel, at most to 45%; a big screen's third is already wide enough
  assert.strictEqual(geom.dock({ x: 0, y: 0, width: 1366, height: 728 }, 1366, 1.4).panel.width, 615);
  assert.strictEqual(geom.dock({ x: 0, y: 0, width: 1920, height: 1032 }, 1920, 1.4).panel.width, 640);
  assert.strictEqual(geom.dock(WA, 1920, 9).panel.width, geom.dock(WA, 1920, 1.6).panel.width, 'scale clamped to 1.6');
});

test('docked: a window that reaches under the panel is fitted beside it; small dialogs and windows on the left are left alone', () => {
  const { panel } = geom.dock(WA, 1920);
  assert.strictEqual(geom.needsFit({ x: 0, y: 0, width: 1920, height: 1032 }, panel), true, 'a full-width browser');
  assert.strictEqual(geom.needsFit({ x: 900, y: 100, width: 800, height: 600 }, panel), true, 'a window half under the panel');
  assert.strictEqual(geom.needsFit({ x: 0, y: 0, width: 1280, height: 1032 }, panel), false, 'already beside it');
  assert.strictEqual(geom.needsFit({ x: 1100, y: 400, width: 380, height: 200 }, panel), false, 'a small dialog');
  assert.strictEqual(geom.needsFit({ x: 1275, y: 0, width: 600, height: 800 }, { ...panel, x: 1280 }), true);
  assert.strictEqual(geom.needsFit(null, panel), false);
});

test('status words: the card, the pill and the launcher say what Barnaby is doing (ui/status.js)', () => {
  const v = (st) => status.view(st, 'Barnaby');
  assert.deepStrictEqual([v().state, v().title, v().pill, v().busy], ['idle', 'Ready when you are', '', false]);
  assert.deepStrictEqual([v({ state: 'nonsense' }).state], ['idle']);
  const t = v({ state: 'thinking', effort: 'high' });
  assert.deepStrictEqual([t.title, t.pill, t.busy, t.careful, t.icon], ['Thinking carefully…', 'Thinking…', true, true, 'think']);
  assert.strictEqual(t.launcherSub, 'Barnaby is thinking carefully…');
  assert.strictEqual(v({ state: 'thinking' }).title, 'Thinking…');
  const a = v({ state: 'acting', label: 'Clicking “New mail”', detail: 'That starts a new email.', step: 2, totalSteps: 5 });
  assert.deepStrictEqual([a.title, a.kicker, a.detail, a.pill], ['Clicking “New mail”', 'Step 2 of 5', 'That starts a new email.', 'Working…']);
  assert.strictEqual(v({ state: 'acting', label: 'Clicking “New mail”' }).kicker, 'Doing a step');
  assert.strictEqual(v({ state: 'waiting', label: 'Pick the photos', step: 2, totalSteps: 5 }).kicker, 'Your turn · Step 2 of 5');
  assert.strictEqual(a.launcherSub, 'Barnaby is working · Step 2 of 5');
  assert.strictEqual(v({ state: 'acting', step: 2 }).kicker, 'Step 2', 'no label: the sentence is the title, the step goes above');
  assert.strictEqual(v({ state: 'acting', step: 3, totalSteps: 2 }).step, 'Step 3', 'a wrong total is not shown');
  const w = v({ state: 'waiting', label: 'Pick the photos' });
  assert.deepStrictEqual([w.kicker, w.pill, w.busy, w.launcherSub], ['Your turn', 'Your turn', false, 'Your turn: Barnaby is waiting for you']);
  assert.deepStrictEqual([v({ state: 'looking' }).title, v({ state: 'looking' }).icon], ['Looking at your screen…', 'eye']);
  assert.strictEqual(v({ state: 'running' }).title, 'Running a check on your computer…');
  assert.strictEqual(v({ state: 'listening' }).launcherSub, '', 'the Talk button says listening itself');
  assert.strictEqual(v({ state: 'thinking', label: 'Thinking…' }).kicker, '', 'never the same words twice');
  for (const st of Object.keys(status.STATES)) {
    const x = v({ state: st, effort: 'high', step: 1, totalSteps: 3 });
    for (const s2 of [x.title, x.kicker, x.pill, x.launcherSub]) assert.ok(!/\b(oops|error|user|input|simply|just)\b/i.test(s2), s2);
  }
});

test('status plan: at most 6 steps in view around the current one, the rest counted', () => {
  const plan = (n, now) => Array.from({ length: n }, (_, i) => ({ text: 'Step ' + (i + 1), state: i < now ? 'done' : i === now ? 'now' : 'next' }));
  const short = status.planWindow(plan(4, 1));
  assert.deepStrictEqual(short.items.map((x) => x.state), ['done', 'now', 'next', 'next']);
  assert.deepStrictEqual([short.before, short.after, short.items[3].n], [0, 0, 4]);
  const mid = status.planWindow(plan(10, 5));
  assert.deepStrictEqual(mid.items.map((x) => x.n), [5, 6, 7, 8, 9, 10], 'one done step before the current one');
  assert.deepStrictEqual([mid.before, mid.after], [4, 0]);
  const early = status.planWindow(plan(10, 0));
  assert.deepStrictEqual([early.items[0].n, early.before, early.after], [1, 0, 4]);
  assert.deepStrictEqual(status.planWindow([{ text: '  ' }, null, { text: 'Open Outlook', state: 'weird' }]).items,
    [{ n: 1, text: 'Open Outlook', state: 'next' }], 'blank steps dropped, unknown state = next');
  assert.deepStrictEqual(status.planWindow(undefined), { items: [], before: 0, after: 0 });
});

test('safety diary: a command is one short line, private words hidden', () => {
  const redact = (t) => t.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]');
  assert.strictEqual(alerts.commandLine('Barnaby', { cmd: 'Get-Service Spooler', verdict: 'auto', ok: true }), 'Barnaby ran a command: “Get-Service Spooler”.');
  assert.strictEqual(alerts.commandLine('Barnaby', { cmd: 'ipconfig /flushdns', verdict: 'confirm', ok: true }), 'Barnaby ran a command after a yes on the card: “ipconfig /flushdns”.');
  assert.strictEqual(alerts.commandLine('Barnaby', { cmd: 'format c:', verdict: 'refuse', ok: false, rule: 'C1' }), 'Barnaby said no to a command: “format c:”.');
  assert.strictEqual(alerts.commandLine('Barnaby', { cmd: 'Get-Printer', verdict: 'auto', ok: false }), 'Barnaby tried a command, but it did not work: “Get-Printer”.');
  assert.strictEqual(alerts.commandLine('Barnaby', { cmd: '  ' }), null);
  assert.strictEqual(alerts.commandLine('Barnaby', null), null);
  const hid = (c) => alerts.commandText(c, redact);
  assert.strictEqual(hid("net user rose Secr3t! /add"), "net user rose [hidden] /add");
  assert.strictEqual(hid("net user rose /delete"), "net user rose /delete");
  assert.strictEqual(hid('ConvertTo-SecureString "pw 1" -AsPlainText -Force'), 'ConvertTo-SecureString [hidden] -AsPlainText -Force');
  assert.strictEqual(hid('net use \\\\nas\\photos /user:rose /p:Hunter2'), 'net use \\\\nas\\photos /user:rose /p:[hidden]');
  assert.strictEqual(hid('setx API_KEY=sk-or-v1-abcdef1234567890'), 'setx API_KEY=[hidden]');
  assert.strictEqual(hid('curl -H token: ghp_abcdefghijklmnop https://x'), 'curl -H token: [hidden] https://x');
  assert.strictEqual(hid('echo 123-45-6789'), 'echo [ssn]', 'the guardian redact runs first');
  assert.strictEqual(hid('Get-Thing -Password "my pass word" -Name x'), 'Get-Thing -Password [hidden] -Name x');
  assert.strictEqual(hid('x '.repeat(60)).length, 80, 'shortened to 80 characters');
  assert.ok(hid('x '.repeat(60)).endsWith('…'));
  assert.strictEqual(hid('a\n  b\t c'), 'a b c', 'one line');
});

test('Start with Windows: a logon task with highest privileges and no 3-day time limit; off deletes it', async () => {
  const xml = startup.taskXml({ exe: 'C:\\Program Files\\Barnaby & Co\\Barnaby.exe', user: 'PC\\rose', name: 'Barnaby' });
  assert.match(xml, /<RunLevel>HighestAvailable<\/RunLevel>/);
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(xml, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
  assert.match(xml, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
  assert.match(xml, /<Command>C:\\Program Files\\Barnaby &amp; Co\\Barnaby.exe<\/Command><Arguments>--hidden<\/Arguments>/);
  assert.match(xml, /<LogonTrigger><Enabled>true<\/Enabled><UserId>PC\\rose<\/UserId><\/LogonTrigger>/);
  const dir = tmpDir(), calls = [];
  let written = '';
  const run = async (args) => { calls.push(args); if (args[0] === '/Create') written = fs.readFileSync(args[4]); return 0; };
  assert.strictEqual(await startup.setLogonTask(true, { name: 'Barnaby', exe: 'C:\\B.exe', user: '', tmpDir: dir, run }), true);
  assert.deepStrictEqual(calls[0].slice(0, 4).concat(calls[0].slice(5)), ['/Create', '/TN', 'Barnaby', '/XML', '/F']);
  assert.deepStrictEqual([...written.subarray(0, 2)], [0xff, 0xfe], 'UTF-16 with a BOM');
  assert.ok(!/UserId/.test(written.toString('utf16le')), 'no user: any sign-in');
  assert.deepStrictEqual(fs.readdirSync(dir), [], 'the task file is removed');
  assert.strictEqual(await startup.setLogonTask(true, { name: 'Barnaby', exe: 'x', tmpDir: dir, run: async () => 1 }), false);
  assert.strictEqual(await startup.setLogonTask(false, { name: 'Barnaby', run }), true);
  assert.deepStrictEqual(calls[calls.length - 1], ['/Delete', '/TN', 'Barnaby', '/F']);
});

test('the pill fits inside the corner the launcher keeps free (--widget-reserve)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ui', 'launcher.css'), 'utf8');
  const reserve = +(/--widget-reserve:\s*(\d+)px/.exec(css) || [])[1];
  assert.ok(reserve > 0, 'launcher.css defines --widget-reserve');
  assert.ok(geom.PILL_W + geom.MARGIN <= reserve, geom.PILL_W + ' + ' + geom.MARGIN + ' > ' + reserve);
});

test('safety diary: append, read, prune after 90 days, readable dates', () => {
  const dir = tmpDir(), f = path.join(dir, 'safety-diary.jsonl');
  const now = Date.parse('2026-09-26T15:00:00');
  assert.deepStrictEqual(diary.read(f), []);
  assert.strictEqual(diary.prune(f, 90 * diary.DAY, now), 0, 'missing file is fine');
  diary.append(f, { kind: 'warning', what: 'old' }, now - 100 * diary.DAY);
  diary.append(f, { kind: 'warning', what: 'Barnaby warned about a fake virus pop-up.' }, now - 2 * diary.DAY);
  fs.appendFileSync(f, 'not json\n');
  assert.strictEqual(diary.read(f).length, 2);
  assert.strictEqual(diary.prune(f, 90 * diary.DAY, now), 2, 'old entry and broken line dropped');
  assert.deepStrictEqual(diary.read(f).map((e) => e.what), ['Barnaby warned about a fake virus pop-up.']);
  assert.deepStrictEqual(Object.keys(diary.read(f)[0]).sort(), ['kind', 'time', 'what']);
  const at = (d) => new Date(d).toISOString();
  assert.match(diary.when(at('2026-09-26T09:05:00'), now), /^Today 9:05\sAM$/);
  assert.match(diary.when(at('2026-09-22T15:42:00'), now), /^Tuesday 3:42\sPM$/);
  assert.match(diary.when(at('2026-09-01T15:42:00'), now), /^September 1, 3:42\sPM$/);
});

test('logs: files untouched for 14 days are deleted, older lines are cut from newer files', () => {
  const dir = tmpDir(), now = Date.now(), DAY = diary.DAY;
  const old = path.join(dir, 'app.log.old'), cur = path.join(dir, 'app.log');
  fs.writeFileSync(old, new Date(now - 20 * DAY).toISOString() + ' old line\n');
  fs.utimesSync(old, new Date(now - 20 * DAY), new Date(now - 20 * DAY));
  fs.writeFileSync(cur, [
    new Date(now - 15 * DAY).toISOString() + ' too old', '    at stack line of the old entry',
    new Date(now - 1 * DAY).toISOString() + ' recent', '    at stack line of the recent entry', ''].join('\n'));
  diary.pruneLogs(dir, 14 * DAY, now);
  assert.ok(!fs.existsSync(old), '.old file deleted');
  const left = fs.readFileSync(cur, 'utf8');
  assert.ok(!/too old|old entry/.test(left), left);
  assert.ok(/recent[\s\S]*recent entry/.test(left), left);
  diary.pruneLogs(path.join(dir, 'missing'), 14 * DAY, now); // no logs folder yet: no throw
});

test('family alerts need consent and a code; one scam alert per hour', () => {
  const s = (consent, topic) => ({ userName: 'Rose', family: { name: 'Anna', ntfyTopic: topic, alertConsent: consent } });
  assert.strictEqual(alerts.canAlert({}), false);
  assert.strictEqual(alerts.canAlert(s('just_me', 'barnaby-abc')), false, 'Just me: nothing goes out');
  assert.strictEqual(alerts.canAlert(s('tell_family', '')), false, 'no code');
  assert.strictEqual(alerts.canAlert(s('tell_family', 'barnaby-abc')), true);
  const ok = s('tell_family', 'barnaby-abc'), now = 1e12;
  assert.strictEqual(alerts.scamAlertAllowed(ok, 0, now), true);
  assert.strictEqual(alerts.scamAlertAllowed(ok, now - 10 * 60 * 1000, now), false, 'same episode');
  assert.strictEqual(alerts.scamAlertAllowed(ok, now - 61 * 60 * 1000, now), true);
  assert.strictEqual(alerts.scamAlertAllowed(s('just_me', 'barnaby-abc'), 0, now), false);
});

test('alert text carries only the kind and the time (W17), never page text', () => {
  const s = { userName: 'Rose', family: { name: 'Anna' } };
  const t = alerts.scamAlertText(s, 'tech_support', new Date('2026-09-26T15:42:00').getTime());
  assert.match(t, /^Rose's computer helper showed a scam warning at 3:42\sPM: fake virus pop-up\. They were told it's a scam and not to call or pay\. A kind call from you would help\.$/);
  assert.match(alerts.scamAlertText({}, 'weird_kind', Date.now()), /^Your family member's .*: suspicious screen\./);
  assert.match(alerts.scamAlertText(s, 'request to buy gift cards', Date.now()), /: request to buy gift cards\./, 'labels pass through');
  assert.ok(!/http|www|\$|\d{3}-\d{4}/.test(t));
  assert.strictEqual(alerts.toldFamilyLine(s), "I've let Anna know, like you asked me to.");
  assert.strictEqual(alerts.toldFamilyLine({}), "I've let your family know, like you asked me to.");
  assert.strictEqual(alerts.warningLine('Barnaby', 'tech_support'), 'Barnaby warned about a fake virus pop-up.');
  assert.strictEqual(alerts.warningLine('Barnaby', 'other'), 'Barnaby warned about a suspicious screen.');
  assert.strictEqual(alerts.warningLine('Barnaby', 'romance'), 'Barnaby warned about an online friend asking for money.');
  assert.strictEqual(alerts.refusalLine('Barnaby', 'R1'), 'Barnaby said no to opening a remote-control program.');
  assert.strictEqual(alerts.refusalLine('Barnaby', 'R99'), 'Barnaby said no to something that was not safe.');
  assert.strictEqual(alerts.refusalLine('Barnaby', 'final'), null, 'the person pressing Send is not a refusal');
  for (const r of ['R1', 'R16', 'R3', 'R4', 'R5']) assert.ok(alerts.REFUSAL_ALERT[r], r + ' alerts family');
  assert.ok(!alerts.REFUSAL_ALERT.R2 && !alerts.REFUSAL_ALERT.R14);
});

test('Scam Shield off waits 24 hours; turning it back on cancels', () => {
  const now = new Date('2026-09-26T15:42:00').getTime();
  assert.deepStrictEqual(alerts.shieldChange({ scamShield: true }, { scamShield: false }, now), { offAt: now + alerts.DAY });
  assert.strictEqual(alerts.shieldChange({ scamShield: false, scamShieldOffAt: now + 5 }, { scamShield: false }, now), null, 'repeat saves keep the time');
  assert.deepStrictEqual(alerts.shieldChange({ scamShield: false, scamShieldOffAt: now + 5 }, { scamShield: true }, now), { offAt: 0 });
  assert.strictEqual(alerts.shieldChange({ scamShield: true }, { scamShield: true }, now), null);
  assert.strictEqual(alerts.shieldChange({ scamShield: true }, { userName: 'Rose' }, now), null);
  const pending = { scamShield: false, scamShieldOffAt: now + alerts.DAY };
  assert.strictEqual(alerts.shieldOn(pending, now), true, 'still watching during the day');
  assert.strictEqual(alerts.shieldOn(pending, now + alerts.DAY + 1), false);
  assert.strictEqual(alerts.shieldOn({ scamShield: true }, now), true);
  assert.strictEqual(alerts.shieldOn({ scamShield: false, scamShieldOffAt: 0 }, now), false);
  assert.match(alerts.shieldOffText({ userName: 'Rose' }, now + alerts.DAY), /^Rose's computer helper: Scam Shield will switch off tomorrow at 3:42\sPM\./);
});

test('weekly note: counts only, once a week, only with consent', () => {
  const s = { userName: 'Rose', family: { ntfyTopic: 'barnaby-x', alertConsent: 'tell_family', weeklyNote: true } };
  const now = 1e12;
  assert.strictEqual(alerts.weeklyDue(s, { weeklyAt: 0 }, now), false, 'clock not started');
  assert.strictEqual(alerts.weeklyDue(s, { weeklyAt: now - 6 * alerts.DAY }, now), false);
  assert.strictEqual(alerts.weeklyDue(s, { weeklyAt: now - 7 * alerts.DAY }, now), true);
  assert.strictEqual(alerts.weeklyDue({ ...s, family: { ...s.family, alertConsent: 'just_me' } }, { weeklyAt: 1 }, now), false);
  assert.strictEqual(alerts.weeklyDue({ ...s, family: { ...s.family, weeklyNote: false } }, { weeklyAt: 1 }, now), false);
  assert.strictEqual(alerts.weeklyNoteText(s, 9, 1, 'Barnaby'), 'This week Barnaby helped Rose 9 times and showed 1 scam warning.');
  assert.strictEqual(alerts.weeklyNoteText({}, 1, 0, 'Barnaby'), 'This week Barnaby helped your family member 1 time and showed 0 scam warnings.');
});

test('config: consent defaults to "just_me"; reset keeps only the connection key', () => {
  const dir = tmpDir();
  const c = new Config(dir);
  assert.strictEqual(c.get().family.alertConsent, 'just_me');
  assert.strictEqual(c.get().family.weeklyNote, false);
  assert.strictEqual(c.get().scamShieldOffAt, 0);
  c.save({ apiKey: 'sk-test', userName: 'Rose', setupDone: true, family: { name: 'Anna', ntfyTopic: 'barnaby-x', alertConsent: 'tell_family' } });
  const r = c.reset(['apiKey']);
  assert.strictEqual(r.userName, '');
  assert.strictEqual(r.setupDone, false);
  assert.strictEqual(r.family.name, '');
  assert.strictEqual(r.family.alertConsent, 'just_me');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.strictEqual(saved.apiKey, 'sk-test');
  assert.strictEqual(new Config(dir).get().userName, '');
  assert.strictEqual(require('../src/config').DEFAULTS.family.name, '', 'DEFAULTS untouched');
});

test('config: a damaged settings.json loads the last good copy, never silent DEFAULTS; saves are announced', () => {
  const dir = tmpDir(), file = path.join(dir, 'settings.json');
  const c = new Config(dir);
  let saves = 0;
  c.on('saved', () => saves++);
  c.save({ apiKey: 'sk-1', family: { name: 'Anna', ntfyTopic: 'barnaby-x', alertConsent: 'tell_family' } });
  c.save({ userName: 'Rose' });
  assert.strictEqual(saves, 2, 'every save tells main (the open windows refresh)');
  fs.writeFileSync(file, '\0'.repeat(64)); // power cut mid-save
  const r = new Config(dir);
  assert.strictEqual(r.loadProblem, 'backup');
  assert.strictEqual(r.get().family.alertConsent, 'tell_family', 'the backup keeps family alerts on');
  assert.strictEqual(r.data.apiKey, 'sk-1'); // (get() may show OPENROUTER_API_KEY instead)
  assert.ok(fs.existsSync(file + '.corrupt'), 'the damaged file is kept');
  r.save({ city: 'Springfield' });
  assert.strictEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).family.name, 'Anna', 'the damaged file never becomes the backup');
  const bare = tmpDir();
  fs.writeFileSync(path.join(bare, 'settings.json'), '{"userName": "Ro');
  const d = new Config(bare);
  assert.strictEqual(d.loadProblem, 'defaults');
  assert.strictEqual(new Config(tmpDir()).loadProblem, null, 'first run is not a problem');
});

test('safety lock: Shield off and weaker family-contact changes wait a day; stronger ones and going back are immediate', () => {
  const now = new Date('2026-09-26T15:42:00').getTime(), DAY = alerts.DAY;
  const fam = { name: 'Anna', phone: '5550142', ntfyTopic: 'barnaby-x', alertConsent: 'tell_family', weeklyNote: true };
  const before = { scamShield: true, scamShieldOffAt: 0, family: fam, pendingFamily: [] };
  // 0 or null for Scam Shield is "off", and off waits a day (it used to switch off at once)
  for (const v of [0, null, 'no']) {
    const r = alerts.safetyPatch(before, { scamShield: v }, now);
    assert.strictEqual(r.patch.scamShield, false);
    assert.strictEqual(r.patch.scamShieldOffAt, now + DAY);
  }
  assert.ok(!('pendingFamily' in alerts.safetyPatch(before, { pendingFamily: [], scamShieldOffAt: 1 }, now).patch), 'windows cannot set these');
  // "Just me" and a new alert code wait; the weekly note does not
  const r = alerts.safetyPatch(before, { family: { ...fam, alertConsent: 'just_me', ntfyTopic: 'new-code', weeklyNote: false } }, now);
  assert.strictEqual(r.patch.family.alertConsent, 'tell_family');
  assert.strictEqual(r.patch.family.ntfyTopic, 'barnaby-x');
  assert.strictEqual(r.patch.family.weeklyNote, false);
  assert.deepStrictEqual(r.patch.pendingFamily.map((x) => [x.field, x.value, x.at]), [['ntfyTopic', 'new-code', now + DAY], ['alertConsent', 'just_me', now + DAY]]);
  assert.strictEqual(r.familyAdded.length, 2);
  // saving the same again an hour later keeps the time and tells nobody twice
  const after = { ...before, pendingFamily: r.patch.pendingFamily };
  const again = alerts.safetyPatch(after, { family: { ...fam, alertConsent: 'just_me', ntfyTopic: 'new-code' } }, now + 3600e3);
  assert.deepStrictEqual(again.patch.pendingFamily, r.patch.pendingFamily);
  assert.strictEqual(again.familyAdded.length, 0);
  // changing the code back cancels that wait only
  const back = alerts.safetyPatch(after, { family: { ...fam, alertConsent: 'just_me' } }, now);
  assert.deepStrictEqual(back.patch.pendingFamily.map((x) => x.field), ['alertConsent']);
  // clearing the family phone waits; a first family contact and "Tell family" are immediate
  assert.strictEqual(alerts.safetyPatch(before, { family: { phone: '' } }, now).patch.family.phone, '5550142');
  const empty = { family: { name: '', phone: '', ntfyTopic: '', alertConsent: 'just_me' }, pendingFamily: [] };
  const first = alerts.safetyPatch(empty, { family: fam }, now);
  assert.deepStrictEqual(first.patch.family, fam);
  assert.deepStrictEqual(first.patch.pendingFamily, []);
  // when the day is over the changes apply
  assert.strictEqual(alerts.dueFamily(after, now + DAY - 1), null);
  assert.deepStrictEqual(alerts.dueFamily(after, now + DAY), { family: { ntfyTopic: 'new-code', alertConsent: 'just_me' }, pendingFamily: [] });
  assert.match(alerts.familyChangeText({ userName: 'Rose' }, now + DAY), /^Rose's computer helper: The family contact or alert settings were changed\. The change takes effect tomorrow at 3:42\sPM\. It can be undone in Settings\.$/);
  assert.match(alerts.helperDownText({}), /^The computer helper cannot see the screen right now, so Scam Shield is paused\./);
  assert.strictEqual(alerts.connectionText({ userName: 'Rose' }, 'credit'), "Rose's computer helper cannot connect: the connection has run out of credit. Please check it in Settings.");
  assert.match(alerts.connectionText({}, 'auth'), /^The computer helper cannot connect: the connection key was not accepted\./);
});

test('main stops only on a whole stop or home utterance (the router keyword path main uses, no Jev call)', async () => {
  const router = require('../src/router');
  const NO_JEV = { ask: async () => { throw new Error('keywords only'); } };
  const kw = async (t) => { const r = await router.route(t, { jev: NO_JEV }); return r.source === 'keyword' ? r.intent : null; };
  for (const t of ['stop', 'Please stop.', 'Okay, stop', 'That’s enough', 'never mind', 'cancel that']) assert.strictEqual(await kw(t), 'stop', t);
  for (const t of ['Cancel my newspaper subscription', 'Stop Spotify from starting by itself', 'stop the music', 'never mind the printer, fix the sound'])
    assert.strictEqual(await kw(t), null, t + ' is a request');
  assert.strictEqual(await kw('take me home'), 'home');
});

test('native helper: a missing or damaged helper.exe never throws, fails calls at once, reports down and retries', async () => {
  const { Native } = require('../src/native');
  const dir = tmpDir();
  const empty = path.join(dir, 'helper.exe');
  fs.writeFileSync(empty, ''); // zero bytes: spawn throws synchronously on Windows
  for (const exe of [empty, path.join(dir, 'missing.exe')]) {
    const n = new Native(exe);
    const down = new Promise((r) => n.once('down', r));
    assert.doesNotThrow(() => n.start());
    await down;
    await assert.rejects(n.call('foreground', {}, 3000), /not running/);
    assert.ok(n.retry, 'a restart is scheduled');
    n.stop();
  }
});
