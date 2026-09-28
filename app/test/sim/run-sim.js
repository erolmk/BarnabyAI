// Simulated-desktop run of the REAL agent (live brain + Jev) against mock pages in an offscreen
// window. Works while the Windows session is locked (nothing is ever shown, no audio).
//   cd /g/seniorhelper/app && HELPER_MUTE=1 HELPER_USER_DATA=G:/seniorhelper/sim-runs/userdata \
//     node_modules/electron/dist/electron.exe test/sim/run-sim.js --scenario anne-marie
// Env: OPENROUTER_API_KEY (required), SIM_MAX_USD (per-run brain spend cap, default 0.30).
// Output: G:\seniorhelper\sim-runs\<scenario>\report.md, step-NN.png, events.jsonl
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const APP = path.join(__dirname, '..', '..');
const src = (m) => require(path.join(APP, 'src', m));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const NAME = arg('--scenario') || 'chat';
const scenarios = require('./scenarios');
const SC = scenarios[NAME];
const UD = process.env.HELPER_USER_DATA || path.join(APP, '..', 'sim-runs', 'userdata');
const OUT = path.join(APP, '..', 'sim-runs', NAME);
const MAX_USD = Number(process.env.SIM_MAX_USD) || 0.30;
const MODELS = {
  brainModel: 'deepseek/deepseek-v4.1-flash', fallbackModel: '', jevModel: '~typesafe/jev-latest', thinking: 'auto',
  providers: ['phala', 'fireworks', 'together', 'baseten/fp8', 'deepinfra/fp8'],
};

app.disableHardwareAcceleration();
app.setPath('userData', UD);

const T0 = Date.now();
const events = [];
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^step-\d+\.png$|^report\.md$|^events\.jsonl$/.test(f)) fs.rmSync(path.join(OUT, f));
function rec(type, data = {}) {
  const e = { t: Date.now() - T0, wall: Date.now(), type, ...data };
  events.push(e);
  try { fs.appendFileSync(path.join(OUT, 'events.jsonl'), JSON.stringify(e) + '\n'); } catch (_) {}
  if (/^(say|ask|answer|tool|route|llm-error|violation|done|person|warn|budget-stop|timeout)$/.test(type)) {
    process.stdout.write(((e.t / 1000).toFixed(1)) + 's ' + type + ' ' + JSON.stringify(data).slice(0, 220) + '\n');
  }
  return e;
}
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const contentText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && p.text) || '').join(' ') : '');

async function main() {
  if (!SC) { process.stdout.write('unknown scenario ' + NAME + '; known: ' + Object.keys(scenarios).join(', ') + '\n'); return app.exit(2); }
  if (!process.env.OPENROUTER_API_KEY) { process.stdout.write('OPENROUTER_API_KEY is not set\n'); return app.exit(2); }

  // Fresh per-scenario data: empty memory, no lessons, settings from the scenario.
  const DATA = path.join(UD, NAME);
  fs.rmSync(DATA, { recursive: true, force: true });
  const logm = src('log');
  logm.init(path.join(DATA, 'logs'));
  const { Config } = src('config');
  const config = new Config(DATA);
  config.save({ ...SC.settings, ...MODELS, mode: SC.mode, setupDone: true, taskCostCapUsd: 0.25, scamShield: true });

  // ---- the "screen" ----
  const win = new BrowserWindow({
    show: false, width: 1280, height: 800, useContentSize: true,
    webPreferences: { offscreen: true, partition: 'sim-' + NAME + '-' + T0, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
  const { SimNative } = require('./simnative');
  const { Person } = require('./person');
  const sim = new SimNative({ win, outDir: OUT, rec });
  await sim.navigate(SC.start === 'scam' ? 'sim:scam' : 'newtab', 'start');
  const person = new Person({ sim, facts: SC.facts, rec });
  const ui = person.ui();

  // ---- the real product modules, with recording wrappers ----
  const llm = src('llm');
  const jev = src('jev');
  const tools = src('tools');
  const { Guardian } = src('guardian');
  const { Agent } = src('agent');
  const { Lessons } = src('lessons');
  const { Memory } = src('memory');
  const support0 = src('support');
  const apps = src('apps');
  const router0 = src('router');
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(APP, 'src', f), 'utf8')); } catch (_) { return d; } };
  const guardian = new Guardian({ config, jev, signals: readJson('scam_signals.json', {}), log: logm.log });
  const lessons = new Lessons(path.join(DATA, 'lessons'));
  const memory = new Memory(path.join(DATA, 'memory.json'));
  for (const f of SC.memory || []) memory.add(f);
  let agent = null;

  const exec0 = tools.execute;
  tools.execute = async (call, ctx) => {
    rec('tool', { name: call.name, args: call.args });
    try {
      const res = await exec0(call, ctx);
      rec('tool-result', { name: call.name, args: call.args, result: String(res) });
      return res;
    } catch (e) { rec('tool-result', { name: call.name, args: call.args, result: 'THROW ' + e.message }); throw e; }
  };
  // SIM_FORCE_FALLBACK="3-5": brain calls #3..#5 go to the fallback model only, as if the main model
  // were down for a moment (tests history hand-over between models: reasoning_details, thought signatures).
  const [fbFrom, fbTo] = String(process.env.SIM_FORCE_FALLBACK || '').split('-').map(Number);
  let llmN = 0;
  const llmW = {
    ...llm,
    async chat(a) {
      const t0 = Date.now();
      llmN++;
      if (fbFrom && llmN >= fbFrom && llmN <= (fbTo || fbFrom) && a.fallbackModel) {
        rec('force-fallback', { n: llmN, model: a.fallbackModel });
        a = { ...a, model: a.fallbackModel, fallbackModel: undefined };
      }
      try {
        const r = await llm.chat(a);
        const m = r.message || {};
        rec('llm', {
          model: r.model, provider: r.provider, cost: r.cost, ms: Date.now() - t0, tools: !!(a.tools && a.tools.length), finish: r.finish,
          tokens: r.usage ? { in: r.usage.prompt_tokens, out: r.usage.completion_tokens,
            cached: (r.usage.prompt_tokens_details || {}).cached_tokens, reasoning: (r.usage.completion_tokens_details || {}).reasoning_tokens } : null,
          effort: a.reasoningEffort || null, msgs: a.messages.length,
          reasoning_details: Array.isArray(m.reasoning_details) ? m.reasoning_details.length : 0,
          text: clip(contentText(m.content), 300), calls: (m.tool_calls || []).map((c) => c.function && c.function.name),
        });
        if (llm.stats().totalCost > MAX_USD && agent) { rec('budget-stop', { spent: llm.stats().totalCost }); agent.stop(); }
        return r;
      } catch (e) { rec('llm-error', { model: a.model, error: clip(e.message, 600) }); throw e; }
    },
  };
  const cs0 = guardian.checkScreen.bind(guardian);
  let checkSource = 'agent';
  guardian.checkScreen = async (x) => { const src_ = checkSource; const r = await cs0(x); rec('checkScreen', { source: src_, title: x.title, result: r }); return r; };
  const ga0 = guardian.gateAction.bind(guardian);
  guardian.gateAction = async (a, c) => { const r = await ga0(a, c); rec('gate', { tool: a.tool, verdict: r.verdict, rule: r.rule || '', conf: r.confidence }); return r; };
  const router = { ...router0, async route(u, o) { const r = await router0.route(u, o); rec('route', r); return r; } };
  const applyFixCalls = [];
  const support = {
    ...support0,
    async runCheck(n) { const r = await support0.runCheck(n); rec('check', { name: n, ok: r.ok, ms: r.ms, text: clip(r.text, 500) }); return r; },
    // Safety: the simulation never changes this machine, even if the product logic breaks.
    async applyFix(n, a) { applyFixCalls.push({ name: n, arg: a }); rec('violation', { what: 'applyFix reached (blocked by the harness)', name: n, arg: a }); return { ok: false, text: 'Simulation: not applied.' }; },
    // run_command routes through support.ps: never let it touch the real machine in a simulation.
    async ps(script) { rec('violation', { what: 'run_command ps reached (blocked by the harness)', script: clip(String(script), 120) }); return 'Simulation: the command was not run.'; },
  };

  agent = new Agent({ config, native: sim, llm: llmW, jev, guardian, router, memory, lessons, support, apps, playbooks: readJson('playbooks.json', []), ui, log: logm.log });
  agent.on('done', (d) => rec('done', d || {}));
  agent.on('error', (e) => rec('agent-error', { error: e && e.message }));

  // Scam Shield, as main.js runs it (every 2 s: foreground change -> window_text -> checkScreen -> warning).
  let lastKey = '', shieldBusy = false;
  const shield = setInterval(async () => {
    if (shieldBusy) return;
    shieldBusy = true;
    try {
      const fg = await sim._do('foreground', {});
      if (fg.title === lastKey) return;
      lastKey = fg.title;
      const wt = await sim._do('window_text', { max: 4000 });
      checkSource = 'shield';
      const r = await guardian.checkScreen({ title: wt.title, text: wt.text }).finally(() => { checkSource = 'agent'; });
      if (r && r.scam) {
        ui.warn({ title: r.title || 'This looks like a scam.', body: r.reason, level: 'scam' });
        rec('say', { from: 'shield', text: (r.reason || 'This screen looks like a scam.') + ' You are safe as long as you do not call the number or pay anything. Would you like me to close it for you?' });
      }
    } catch (_) { /* page busy */ } finally { shieldBusy = false; }
  }, 2000);
  await new Promise((r) => setTimeout(r, 2500)); // let the shield look once, like a real session

  rec('start', { scenario: NAME, utterance: SC.utterance, mode: SC.mode });
  const hard = setTimeout(() => { rec('timeout', {}); agent.stop(); }, 14 * 60 * 1000);
  try {
    await agent.handle(SC.utterance, { mode: SC.mode });
  } catch (e) { rec('agent-error', { error: e.message }); }
  clearTimeout(hard);
  clearInterval(shield);
  await new Promise((r) => setTimeout(r, 500));

  let sent = [];
  try { sent = await sim.js('JSON.parse(localStorage.getItem("sim_sent") || "[]")'); } catch (_) {}
  const r = { events, sent, lessons: lessons.list(), applyFixCalls, violations: sim.violations, memory: memory.all(), settings: config.get() };
  const results = SC.evaluate(r);
  const ls = llm.stats(), js = jev.stats();
  writeReport({ results, r, ls, js, config });
  const ok = results.every((x) => x.pass);
  fs.appendFileSync(path.join(OUT, '..', 'summary.jsonl'), JSON.stringify({
    date: new Date().toISOString(), scenario: NAME, pass: ok, llmUsd: +ls.totalCost.toFixed(4), jevUsd: +js.totalCost.toFixed(5), jevCalls: js.calls,
    cachedShare: (() => { const t = events.filter((e) => e.type === 'llm' && e.tokens); const i = t.reduce((n, e) => n + (e.tokens.in || 0), 0);
      return i ? +(t.reduce((n, e) => n + (e.tokens.cached || 0), 0) / i).toFixed(3) : null; })(),
    brainCalls: events.filter((e) => e.type === 'llm').length, served: ls.served, seconds: Math.round((Date.now() - T0) / 1000),
    failed: results.filter((x) => !x.pass).map((x) => x.name),
  }) + '\n');
  process.stdout.write('\n' + results.map((x) => (x.pass ? 'PASS ' : 'FAIL ') + x.name).join('\n') +
    '\nLLM $' + ls.totalCost.toFixed(4) + '  Jev calls ' + js.calls + '  -> ' + path.join(OUT, 'report.md') + '\n');
  app.exit(ok ? 0 : 1);
}

function line(e) {
  const ts = (e.t / 1000).toFixed(1).padStart(6) + 's ';
  const brief = (o) => clip(JSON.stringify(o || {}), 260);
  switch (e.type) {
    case 'start': return ts + '**Person says:** "' + e.utterance + '" (mode ' + e.mode + ')';
    case 'say': return ts + (e.from === 'shield' ? '**Scam Shield says:** ' : '**Barnaby:** ') + e.text;
    case 'ask': return ts + '**Barnaby asks** (' + e.kind + '): ' + e.question + (e.choices.length ? ' [' + e.choices.join(' | ') + ']' : '') +
      (e.details ? '\n' + (e.details.fields || []).map((f) => '        > ' + f.label + ': ' + clip(f.value, 300).replace(/\n/g, ' / ')).join('\n') : '');
    case 'answer': return ts + '**Person:** ' + e.answer;
    case 'ask-cancel': return ts + '_(question closed)_';
    case 'person': return ts + '_Person ' + e.did + (e.text ? ' "' + e.text + '"' : ' at ' + e.x + ',' + e.y + (e.ctrl ? ' with Ctrl' : '')) + (e.why ? ' (' + e.why + ')' : '') + '_';
    case 'person-check': return ts + '_Person checks the email card: address ok=' + e.okTo + ', attachment ok=' + e.okAtt + ', message ok=' + e.okMsg + '_';
    case 'tool': return ts + '-> `' + e.name + '` ' + brief(e.args);
    case 'tool-result': return ts + '   <- ' + clip(e.result, 300).replace(/\n/g, ' / ');
    case 'native': return ts + '   . agent native `' + e.cmd + '` ' + brief(e.args);
    case 'screenshot': return ts + '   screen: [' + e.file + '](' + e.file + ')';
    case 'llm': return ts + '   [brain ' + e.model + ' $' + (e.cost || 0).toFixed(5) + ' in=' + (e.tokens && e.tokens.in) + ' cached=' + (e.tokens && e.tokens.cached) + ' out=' + (e.tokens && e.tokens.out) + ' effort=' + e.effort + ' ' + (e.provider || '') + ' ' + e.ms + 'ms' +
      (e.calls.length ? ' calls=' + e.calls.join(',') : '') + (e.text ? ' text="' + e.text.replace(/\s+/g, ' ') + '"' : '') + (e.reasoning_details ? ' reasoning_details=' + e.reasoning_details : '') + ']';
    case 'route': return ts + '[router -> ' + e.intent + ' (' + e.source + ', ' + e.confidence + ')]';
    case 'checkScreen': return ts + '[checkScreen by ' + e.source + ' on "' + clip(e.title, 60) + '": scam=' + e.result.scam + ' p=' + e.result.probability + ' kind=' + e.result.kind + ']';
    case 'gate': return ts + '   [gate ' + e.tool + ': ' + e.verdict + (e.rule ? ' ' + e.rule : '') + ' conf=' + (typeof e.conf === 'number' ? e.conf.toFixed(2) : e.conf) + ']';
    case 'highlight': return ts + '   (ring on [' + e.rect + ']: "' + e.label + '")';
    case 'warn': return ts + '**WARNING CARD:** ' + e.title + ' - ' + e.body;
    case 'navigate': return ts + '   [page -> ' + e.page + ' (' + e.why + ': ' + clip(e.target, 80) + ')]';
    case 'check': return ts + '   [check ' + e.name + ' ok=' + e.ok + ' ' + e.ms + 'ms: ' + clip(e.text, 200).replace(/\n/g, ' / ') + ']';
    case 'status': return null;
    default: { const { t, wall, type, ...rest } = e; return ts + '[' + type + '] ' + brief(rest); }
  }
}

function writeReport({ results, r, ls, js, config }) {
  const ev = r.events;
  const llmEv = ev.filter((e) => e.type === 'llm');
  const s = config.get();
  const md = [
    '# Simulation: ' + NAME, '',
    'Utterance: "' + SC.utterance + '"  ', 'Mode: ' + SC.mode + '  ', 'Models: brain ' + s.brainModel + ', fallback ' + s.fallbackModel + ', Jev ' + s.jevModel + '  ',
    'Date: ' + new Date().toISOString() + '  ', 'Duration: ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s', '',
    '## Result: ' + (results.every((x) => x.pass) ? 'PASS' : 'FAIL'), '',
    '| Criterion | Result | Detail |', '|---|---|---|',
    ...results.map((x) => '| ' + x.name + ' | ' + (x.pass ? 'PASS' : '**FAIL**') + ' | ' + clip(String(x.detail || ''), 700).replace(/\|/g, '/').replace(/\n/g, '<br>') + ' |'),
    '', '## Numbers', '',
    '- Brain calls: ' + llmEv.length + ' (models: ' + [...new Set(llmEv.map((e) => e.model))].join(', ') + ')',
    '- Tool calls: ' + ev.filter((e) => e.type === 'tool').length + ', screenshots: ' + ev.filter((e) => e.type === 'screenshot').length,
    '- LLM cost (llm.stats): $' + ls.totalCost.toFixed(4),
    '- Served by (providers): ' + JSON.stringify(ls.served || {}),
    '- Jev calls (jev.stats): ' + js.calls + ' ($' + js.totalCost.toFixed(5) + ')',
    '- Brain errors: ' + ev.filter((e) => e.type === 'llm-error').length,
    '- Remembered: ' + (r.memory.join('; ') || 'nothing'),
    '- Sent mail: ' + (JSON.stringify(r.sent) || '[]'),
    '', '## Transcript', '',
    ...ev.map(line).filter(Boolean).map((l) => l + '  '),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
}

app.whenReady().then(main).catch((e) => { process.stdout.write('sim failed: ' + (e.stack || e) + '\n'); app.exit(3); });
process.on('unhandledRejection', (e) => rec('unhandled', { error: String(e && e.message || e) }));
