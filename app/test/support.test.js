// support.js: every check runs LIVE (read-only). Fixes are only exercised on refusal / dry-run paths:
// nothing is deleted, no audio is changed, nothing is restarted.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const support = require('../src/support');

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

test('catalog lists every check and fix with the contract shape', () => {
  const cat = support.catalog();
  const names = cat.map((c) => c.name);
  for (const n of ['overview', 'top_processes', 'startup_apps', 'disk_space', 'network', 'sound', 'updates', 'defender', 'printers']) {
    assert.ok(names.includes(n), 'missing check ' + n);
  }
  for (const n of ['clear_temp', 'disable_startup_app', 'close_app', 'restart_explorer', 'flush_dns', 'defender_quick_scan', 'unmute_audio', 'restart_computer']) {
    assert.ok(names.includes(n), 'missing fix ' + n);
  }
  for (const c of cat) {
    assert.ok(c.title && c.description, c.name);
    assert.ok(c.kind === 'check' || c.kind === 'fix', c.name);
    assert.strictEqual(typeof c.needsArg, 'boolean', c.name);
  }
  assert.deepStrictEqual(cat.filter((c) => c.needsArg).map((c) => c.name).sort(), ['close_app', 'disable_startup_app', 'restart_computer']);
});

test('every check runs live, read-only, within its time budget', async () => {
  const rows = [];
  for (const c of support.catalog().filter((x) => x.kind === 'check')) {
    const r = await support.runCheck(c.name);
    rows.push({ check: r.name, ok: r.ok, ms: r.ms, lines: r.text.split('\n').length, first: r.text.split('\n')[0].slice(0, 70) });
    assert.strictEqual(r.name, c.name);
    assert.strictEqual(r.title, c.title);
    assert.ok(r.ok, c.name + ' failed: ' + r.text);
    assert.ok(r.text.trim().length > 10, c.name + ' returned no text');
    assert.ok(r.text.length <= 3600, c.name + ' text too long');
    assert.strictEqual(typeof r.ms, 'number');
    assert.ok(r.ms > 0 && r.ms < (c.name === 'overview' ? 4000 : 8000), c.name + ' took ' + r.ms + ' ms');
    assert.strictEqual(r.summary, r.text.split('\n')[0]);
    assert.strictEqual(r.details, r.text);
  }
  console.table(rows);
});

test('check output carries the facts the brain needs', async () => {
  const o = await support.runCheck('overview');
  assert.match(o.text, /Memory in use: [\d.,]+ GB of [\d.,]+ GB \(\d+%\)/);
  assert.match(o.text, /Processor: .+busy right now: \d+%/);
  assert.match(o.text, /Time since the last restart: \d+ days \d+ hours/);
  assert.match(o.text, /Main drive \([A-Z]:\): [\d.,]+ GB free/);
  assert.match(o.text, /Windows: .*Windows/);
  const t = await support.runCheck('top_processes');
  assert.ok(t.text.split('\n').filter((l) => l.startsWith('- ')).length >= 3, t.text);
  assert.match(t.text, /MB, processor \d+%/);
  const s = await support.runCheck('startup_apps');
  assert.match(s.text, /^\d+ programs are set to start with the computer: \d+ on, \d+ off\./);
});

test('unknown check resolves ok:false instead of throwing', async () => {
  const r = await support.runCheck('nope');
  assert.strictEqual(r.ok, false);
  assert.match(r.text, /no check called/);
});

test('ps() returns utf8 stdout and handles multi-line blocks', async () => {
  const out = await support.ps('$x = 2\nif ($x -eq 1) { "one" }\nelse { "héllo ü 日本" }\ntry { throw "x" }\ncatch { "caught" }');
  assert.strictEqual(out, 'héllo ü 日本\ncaught');
});

test('ps() caps long output', async () => {
  const out = await support.ps('"x" * 10000');
  assert.ok(out.length < 3600 && out.includes('more lines cut'), 'len ' + out.length);
});

test('ps() rejects with stderr on a thrown error and on a non-zero exit', async () => {
  await assert.rejects(support.ps('"before"\nthrow "boom here"'), /boom here/);
  await assert.rejects(support.ps('exit 3'), /code 3/);
  await assert.rejects(support.ps('if ( {'), /Missing closing/);
});

test('ps() timeout kills the whole process tree', async () => {
  const f = path.join(os.tmpdir(), 'support-test-pids-' + process.pid + '.txt');
  const script = '$c = Start-Process -FilePath ping.exe -ArgumentList "-n","60","127.0.0.1" -NoNewWindow -PassThru\n' +
    'Set-Content -LiteralPath ' + "'" + f + "'" + ' -Value ($PID.ToString() + " " + $c.Id)\nStart-Sleep -Seconds 60';
  const t0 = Date.now();
  await assert.rejects(support.ps(script, 2500), /timed out/);
  assert.ok(Date.now() - t0 < 8000, 'timeout took ' + (Date.now() - t0) + ' ms');
  const pids = fs.readFileSync(f, 'utf8').trim().split(/\s+/).map(Number);
  fs.unlinkSync(f);
  assert.strictEqual(pids.length, 2);
  await new Promise((r) => setTimeout(r, 500));
  for (const pid of pids) assert.ok(!alive(pid), 'process ' + pid + ' still running');
});

test('close_app refuses Windows system parts and this helper', async () => {
  const names = ['explorer', 'winlogon', 'csrss', 'svchost', 'lsass', 'system', 'dwm', 'smss', 'services', 'wininit',
    'EXPLORER.EXE', 'C:\\Windows\\System32\\svchost.exe', ' dwm ', 'Memory Compression'];
  for (const n of names) {
    const r = await support.applyFix('close_app', n);
    assert.strictEqual(r.ok, false, n);
    assert.match(r.text, /part of Windows/, n);
  }
  for (const n of ['electron', 'Electron.exe', 'helper', path.basename(process.execPath)]) {
    const r = await support.applyFix('close_app', n);
    assert.strictEqual(r.ok, false, n);
    assert.match(r.text, /close myself/, n);
  }
  const empty = await support.applyFix('close_app', '');
  assert.strictEqual(empty.ok, false);
  assert.match(empty.text, /Which program/);
});

test('close_app on a program that is not open does nothing, and quotes cannot inject', async () => {
  const r = await support.applyFix('close_app', 'zzq-not-running-12345');
  assert.strictEqual(r.ok, false);
  assert.match(r.text, /not open right now/);
  const inj = await support.applyFix('close_app', "zz'; exit 7; '");
  assert.match(inj.text, /not open right now/, inj.text);
  const curly = await support.applyFix('close_app', 'zz\u2019; exit 7; \u2019');
  assert.match(curly.text, /not open right now/, curly.text);
});

test('disable_startup_app refuses names it cannot find', async () => {
  for (const n of ['NoSuchProgram-zz-4242', "zz'; exit 7; '"]) {
    const r = await support.applyFix('disable_startup_app', n);
    assert.strictEqual(r.ok, false, n);
    assert.match(r.text, /could not find a program called/, n);
  }
  const empty = await support.applyFix('disable_startup_app', '');
  assert.strictEqual(empty.ok, false);
});

test('disable_startup_app dry run: user entries would be turned off, everyone-entries need an administrator', async () => {
  const s = await support.runCheck('startup_apps');
  const rows = s.text.split('\n').filter((l) => l.startsWith('- ')).map((l) => {
    const m = /^- (.+?): (on|off) - (this user|everyone)/.exec(l);
    return m && { name: m[1], on: m[2] === 'on', user: m[3] === 'this user' };
  }).filter(Boolean);
  const count = (n) => rows.filter((r) => r.name === n).length;
  const user = rows.find((r) => r.on && r.user && count(r.name) === 1);
  const machine = rows.find((r) => r.on && !r.user && count(r.name) === 1);
  if (user) {
    const r = await support.applyFix('disable_startup_app', { name: user.name, dryRun: true });
    assert.ok(r.ok, r.text);
    assert.match(r.text, /would turn off/, r.text);
  }
  if (machine) {
    const r = await support.applyFix('disable_startup_app', { name: machine.name, dryRun: true });
    assert.strictEqual(r.ok, false);
    assert.match(r.text, /needs an administrator/, r.text);
  }
  if (!user && !machine) console.log('no enabled startup entries on this machine; dry-run paths skipped');
});

test('clear_temp dry run measures without deleting anything', async () => {
  const f = path.join(os.tmpdir(), 'support-test-old-' + process.pid + '.tmp');
  fs.writeFileSync(f, 'x'.repeat(1000));
  const old = new Date(Date.now() - 3 * 86400000);
  fs.utimesSync(f, old, old);
  try {
    const r = await support.applyFix('clear_temp', { dryRun: true });
    assert.ok(r.ok, r.text);
    assert.ok(r.files >= 1 && r.bytes >= 1000, JSON.stringify(r));
    assert.match(r.text, /could be cleared/);
    assert.ok(fs.existsSync(f), 'dry run deleted a file');
  } finally { fs.unlinkSync(f); }
});

test('restart_computer only runs after an explicit confirmation', async () => {
  for (const a of [undefined, '', 'yes', true, { confirmed: true }]) {
    const r = await support.applyFix('restart_computer', a);
    assert.strictEqual(r.ok, false);
    assert.match(r.text, /only restart the computer after you say yes/);
  }
});

test('unknown fix resolves ok:false', async () => {
  const r = await support.applyFix('format_c', 'x');
  assert.strictEqual(r.ok, false);
  assert.match(r.text, /no fix called/);
});
