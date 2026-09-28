// Real-desktop end-to-end: the REAL agent (LLM + Jev guardian + native helper) opens Notepad and types a line.
// Run only when the PC is unlocked and idle (native/run_when_idle.js chains it after the native self-test).
// Safety: it only works in a NEW Notepad window it opens; cleanup empties that window and closes it unsaved.
// Usage: node test/live_desktop.js   (OPENROUTER_API_KEY in env; HELPER_MUTE=1)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Native } = require('../src/native');
const { Config } = require('../src/config');
const llm = require('../src/llm');
const jev = require('../src/jev');
const router = require('../src/router');
const support = require('../src/support');
const apps = require('../src/apps');
const { Guardian } = require('../src/guardian');
const { Agent } = require('../src/agent');
const { Lessons } = require('../src/lessons');
const { Memory } = require('../src/memory');

const PHRASE = 'Hello from Barnaby';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barnaby-live-'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const native = new Native(path.join(__dirname, '..', 'native', 'bin', 'helper.exe'));
  native.start();
  const config = new Config(dir);
  config.save({ setupDone: true, userName: 'Tester', mode: 'do', taskCostCapUsd: 0.08, maxSteps: 12, email: { provider: 'gmail' } });
  const before = new Set(((await native.call('windows')).windows || []).map((w) => w.hwnd));
  const said = [];
  const ui = {
    ownPid: process.pid,
    say: async (t) => { said.push(t); log('SAY', t); },
    status: () => {},
    ask: async (q) => { log('ASK', q.kind, q.question, q.choices || ''); return q.kind === 'confirm' ? 'yes' : (q.choices && q.choices.includes('I did it') ? 'I did it' : (q.choices && q.choices[0]) || 'yes'); },
    cancelAsk: () => {}, highlight: () => {}, clearOverlay: () => {}, warn: (w) => log('WARN', w.title),
    showLauncher: () => {}, hideLauncher: () => {}, expandWidget: () => {}, lastTarget: () => null, recentWarning: () => false,
  };
  const guardian = new Guardian({ config, jev, signals: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'scam_signals.json'), 'utf8')), log });
  const agent = new Agent({
    config, native, llm, jev, guardian, router, support, apps, ui, log,
    memory: new Memory(path.join(dir, 'memory.json')), lessons: new Lessons(path.join(dir, 'lessons')),
    playbooks: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'playbooks.json'), 'utf8')),
  });
  let pass = false, mine = null;
  try {
    await Promise.race([
      agent.runTask('Open Notepad and type exactly this line: ' + PHRASE + '. Do not save anything.', { mode: 'do' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 240000)),
    ]);
  } catch (e) { log('task ended:', e.message); agent.stop(); }
  try {
    const now = (await native.call('windows')).windows || [];
    mine = now.find((w) => !before.has(w.hwnd) && /notepad/i.test(w.process || ''));
    if (mine) {
      const t = await native.call('window_text', { hwnd: mine.hwnd, max: 2000 });
      pass = String(t.text || '').includes(PHRASE);
      log('notepad text:', JSON.stringify(String(t.text || '').slice(0, 120)));
    } else log('no new Notepad window found');
  } finally {
    if (mine) { // clean up: empty the new tab, close without saving
      try {
        await native.call('focus', { hwnd: mine.hwnd });
        await native.call('key', { combo: 'ctrl+a' });
        await native.call('key', { combo: 'delete' });
        await native.call('key', { combo: 'ctrl+w' });
      } catch (e) { log('cleanup:', e.message); }
    }
    native.stop();
  }
  log('LLM cost $' + llm.stats().totalCost.toFixed(4), 'Jev calls', jev.stats().calls);
  log(pass ? 'LIVE DESKTOP PASS' : 'LIVE DESKTOP FAIL');
  process.exit(pass ? 0 : 1);
})().catch((e) => { log('ERROR', e.stack || e.message); process.exit(2); });
