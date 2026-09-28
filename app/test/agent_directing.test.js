// The owner's change list (2026-09-28), agent side: cacheable prompts, sticky effort, usage log, act-first prompt,
// instant "thinking", Send when the request said so, contacts saved by voice, actions that do not wait for speech.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Agent, taskSystem, taskFacts } = require('../src/agent');
const { Guardian, sendAsked } = require('../src/guardian');
const apps = require('../src/apps');
const { Memory } = require('../src/memory');
const { Lessons } = require('../src/lessons');
const F = require('./fakes');
const { tc, assistant } = F;
const signals = require('../src/scam_signals.json');

// Its own temp folder: test files run in parallel, and agent.test.js wipes test/.tmp when it ends.
const TMP = path.join(__dirname, '.tmp-directing', 'p' + process.pid); // per process: a parallel suite wipes only its own
const tmpDir = () => { fs.mkdirSync(TMP, { recursive: true }); return fs.mkdtempSync(path.join(TMP, 'a-')); };
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function makeAgent({ script = [], settings = {}, uiOpts, router, jev, log } = {}) {
  const events = [];
  const dir = tmpDir();
  const h = {
    events, native: F.fakeNative(events), ui: F.fakeUi(events, uiOpts), llm: F.fakeLlm(script), guardian: F.fakeGuardian(),
    support: F.fakeSupport(events), config: F.fakeConfig({ mode: 'do', ...settings }), memory: new Memory(path.join(dir, 'memory.json')), done: [],
  };
  h.agent = new Agent({
    config: h.config, native: h.native, llm: h.llm, jev: jev || {}, guardian: h.guardian,
    router: router || { route: async () => ({ intent: 'task', confidence: 1 }) },
    memory: h.memory, lessons: new Lessons(path.join(dir, 'lessons')), support: h.support, apps, playbooks: require('../src/playbooks.json'),
    ui: h.ui, timing: { settle: 0, open: 0 }, log: log || (() => {}),
  });
  h.agent.on('done', (d) => h.done.push(d));
  h.agent.on('error', () => {});
  h.toolResults = (i) => h.llm.calls[i].messages.filter((m) => m.role === 'tool').map((m) => m.content);
  return h;
}
// A real Guardian; `answers` is the fake Jev (null = Jev down).
function realGuardian(h, answers) {
  const jev = { ask: async () => { if (!answers) throw new Error('jev down'); return { answers: answers() }; } };
  h.agent.guardian = new Guardian({ config: h.config, jev, signals, log: () => {} });
  return h.agent.guardian;
}

test('the system prompt is byte-identical between tasks; the person, memory, recipes and time are in the first user message', async () => {
  const run = async (goal, settings, fact) => {
    const h = makeAgent({ settings, script: [assistant(tc('done', { summary: 'ok' }))] });
    h.memory.add(fact);
    await h.agent.runTask(goal, { mode: 'together' });
    return h.llm.calls[0].messages;
  };
  const a = await run('send photos to Anne Marie', { userName: 'Margaret' }, 'Email: Gmail');
  const b = await run('read my email', { userName: 'Harold' }, 'Photos: iCloud');
  assert.equal(a[0].content, b[0].content);
  for (const t of ['Today is', 'Margaret', 'Email: Gmail', 'Send photos by email']) assert.ok(!a[0].content.includes(t), t);
  for (const t of ['Today is', 'Their name: Margaret', 'Email: Gmail', 'Send photos by email', 'The person said: "send photos to Anne Marie"']) assert.ok(a[1].content.includes(t), t);

  const sup = async (settings, fact) => {
    const h = makeAgent({ settings, script: [assistant(tc('done', { summary: 'ok' }))] });
    h.memory.add(fact);
    await h.agent.runSupport('my computer is slow');
    return h.llm.calls[0].messages;
  };
  const s1 = await sup({ userName: 'Margaret' }, 'Printer: HP');
  const s2 = await sup({ userName: 'Harold' }, 'Email: AOL');
  assert.equal(s1[0].content, s2[0].content);
  assert.ok(!/Today is|Margaret|Printer: HP/.test(s1[0].content));
  assert.ok(/Their name: Margaret/.test(s1[1].content) && /Printer: HP/.test(s1[1].content) && /Today is/.test(s1[1].content));

  const chat = makeAgent({ settings: { userName: 'Margaret' }, router: { route: async () => ({ intent: 'chat' }) }, script: [{ role: 'assistant', content: 'Hello.' }] });
  await chat.agent.handle('hello');
  assert.ok(!/Margaret|Today is/.test(chat.llm.calls[0].messages[0].content));
  assert.match(chat.llm.calls[0].messages[1].content, /Their name: Margaret[\s\S]*Today is/);
});

test('prompt: act first, ask the minimum, no repeating the task; every safety line is still there', () => {
  const t = taskSystem('together');
  for (const s of ['same reply', 'Never repeat the task', 'truly cannot find out', 'You never type these', 'Never install programs', 'AnyDesk',
    'Never say or show a command', 'save_contact']) assert.ok(t.includes(s), s);
  const pb = require('../src/playbooks.json').find((p) => (p.ask_first || []).length);
  const f = taskFacts({ settings: {}, memoryText: '', playbooks: [pb], now: 'Sunday' });
  assert.match(f, /Needed \(find it yourself first/);
  assert.doesNotMatch(f, /Ask first/);
});

test('set_plan and the first action in one reply run in one step', async () => {
  const h = makeAgent({ script: [
    assistant(tc('set_plan', { steps: ['Open your email', 'Write the note', 'Send it'] }), tc('open', { target: 'gmail', explain: 'Opening Gmail.' })),
    assistant(tc('done', { summary: 'ok' })),
  ] });
  await h.agent.runTask('write an email');
  assert.equal(h.llm.calls.filter((c) => c.tools).length, 2);
  assert.ok(h.native.calls.some((c) => c.cmd === 'open'));
  assert.ok(h.ui.statuses.some((s) => Array.isArray(s.plan) && s.plan[0].state === 'now'));
});

test('effort: high for step 1 and right after a surprise only (no sticky high), and Jev is never asked', async () => {
  const s = makeAgent({ script: [
    assistant(tc('click', { element_id: 1, explain: 'Clicking.' })),
    assistant(tc('click', { element_id: 999, explain: 'Clicking the missing one.' })),
    assistant(tc('scroll', { direction: 'down', explain: 'Scrolling.' })),
    assistant(tc('done', { summary: 'ok' })),
  ] });
  await s.agent.runTask('do it');
  assert.deepEqual(s.llm.calls.filter((c) => c.tools).map((c) => c.reasoningEffort), ['high', 'low', 'high', 'low']);
  assert.deepEqual(s.llm.calls.filter((c) => c.tools).map((c) => c.maxTokens), [6000, 2500, 6000, 2500]);

  let n = 0;
  const j = makeAgent({ jev: { noul: async () => { n++; return 0.9; } }, script: [
    assistant(tc('ask_user', { question: 'Who is it for?', choices: ['Anne', 'Sarah'] })),
    assistant(tc('click', { element_id: 1, explain: 'Clicking Compose.' })),
    assistant(tc('click', { element_id: 3, explain: 'Clicking the To box.' })),
    assistant(tc('done', { summary: 'ok' })),
  ] });
  await j.agent.runTask('write an email');
  assert.equal(n, 0, 'no Jev effort call');
  assert.deepEqual(j.llm.calls.filter((c) => c.tools).map((c) => c.reasoningEffort), ['high', 'low', 'low', 'low']);

  // support diagnosis thinks hard until a fix is proposed; settings.thinking overrides the policy
  const sup = makeAgent({ script: [
    assistant(tc('run_check', { name: 'overview' })),
    assistant(tc('apply_fix', { name: 'clear_temp', explain: 'This frees up space.' })),
    assistant(tc('done', { summary: 'ok' })),
  ] });
  await sup.agent.runSupport('my computer is slow');
  assert.deepEqual(sup.llm.calls.filter((c) => c.tools).map((c) => c.reasoningEffort), ['high', 'high', 'low']);
  for (const [thinking, want] of [['always', 'high'], ['never', 'none']]) {
    const t = makeAgent({ settings: { thinking }, script: [assistant(tc('scroll', { direction: 'down', explain: 'x' })), assistant(tc('done', { summary: 'ok' }))] });
    await t.agent.runTask('scroll');
    assert.deepEqual(t.llm.calls.filter((c) => c.tools).map((c) => c.reasoningEffort), [want, want], thinking);
  }

  let m = 0;
  const p = makeAgent({ jev: { noul: async () => { m++; return 0.9; } }, script: [
    assistant(tc('set_plan', { steps: ['Open your email', 'Write it'] })), assistant(tc('scroll', { direction: 'down', explain: 'Scrolling.' })),
  ] });
  await p.agent.runTask('write an email');
  assert.equal(m, 0, 'a plan step is not a decision');
  assert.equal(p.llm.calls[1].reasoningEffort, 'low');
});

test('effort: Jev picks none / low / high beside the look; unsure takes the higher of its top two; a surprise thinks at least a little', async () => {
  const answers = [
    { choice: 'high', confidence: 0.9, probabilities: { none: 0.05, low: 0.05, high: 0.9 } }, // a new plan
    { choice: 'none', confidence: 0.97, probabilities: { none: 0.97, low: 0.02, high: 0.01 } }, // routine
    { choice: 'none', confidence: 0.4, probabilities: { none: 0.45, low: 0.15, high: 0.4 } }, // unsure: none or high -> high
    { choice: 'none', confidence: 0.99, probabilities: { none: 0.99, low: 0.01, high: 0 } }, // after an error: at least low
  ];
  const asked = [], lines = [];
  const h = makeAgent({
    log: (...a) => lines.push(a.join(' ')),
    jev: { choice: async (state, ask, criteria, opts) => { h.events.push({ type: 'jev' }); asked.push({ state, criteria, opts }); return answers[asked.length - 1]; } },
    script: [
      assistant(tc('click', { element_id: 1, explain: 'Clicking.' })),
      assistant(tc('click', { element_id: 1, explain: 'Clicking again.' })),
      assistant(tc('click', { element_id: 999, explain: 'Clicking the missing one.' })),
      assistant(tc('done', { summary: 'ok' })),
    ],
  });
  await h.agent.runTask('do it');
  const brain = h.llm.calls.filter((c) => c.tools);
  assert.deepEqual(brain.map((c) => c.reasoningEffort), ['high', 'none', 'high', 'low']);
  assert.deepEqual(brain.map((c) => c.maxTokens), [6000, 1200, 6000, 2500]);
  assert.deepEqual(Object.keys(asked[0].criteria), ['none', 'low', 'high']);
  assert.equal(asked[0].opts.timeoutMs, 1500);
  assert.deepEqual(asked.map((a) => a.state.step), [1, 2, 3, 4]);
  assert.equal(asked[0].state.goal, 'do it');
  assert.match(asked[3].state.last_results[0], /ERROR|no item|not/i);
  // asked before the look, not after it
  const ev = h.events.map((e) => e.type === 'native' ? e.cmd : e.type);
  assert.ok(ev.indexOf('jev') < ev.indexOf('screenshot'), ev.join(','));
  assert.ok(lines.some((l) => /^\[think\] none jev 0\.97 \d+ms$/.test(l)), lines.join('\n'));
});

test('each brain call logs its token counts and provider, never content', async () => {
  const lines = [];
  const h = makeAgent({ log: (...a) => lines.push(a.join(' ')), script: [assistant(tc('done', { summary: 'ok' }))] });
  const chat = h.llm.chat;
  h.agent.llm = { chat: async (a) => ({ ...(await chat(a)), usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 80 }, completion_tokens: 7 }, provider: 'Phala' }) };
  await h.agent.runTask('email my granddaughter Lucy');
  const l = lines.find((x) => x.startsWith('[llm]'));
  assert.match(l, /^\[llm\] \w+ high 100 in 80 cached 7 out Phala$/);
  assert.ok(!lines.some((x) => /Lucy/.test(x)));
});

test('"thinking" shows the moment Barnaby hears the person, before routing finishes', async () => {
  let release;
  const h = makeAgent({ router: { route: () => new Promise((r) => { release = r; }) }, script: [assistant(tc('done', { summary: 'ok' }))] });
  const p = h.agent.handle('open my email');
  while (!release) await new Promise((r) => setImmediate(r));
  assert.equal(h.ui.statuses[0].state, 'thinking');
  h.agent.stop();
  release({ intent: 'task' });
  await p;
  assert.equal(h.ui.statuses.at(-1).state, 'idle');
});

test('an action does not wait for its whole explain to be spoken', async () => {
  const h = makeAgent({ script: [assistant(tc('scroll', { direction: 'down', explain: 'Scrolling down to see more.' })), assistant(tc('done', { summary: 'ok' }))] });
  const say = h.ui.say;
  h.ui.say = (t, o) => { say.call(h.ui, t, o); return t === 'Scrolling down to see more.' ? new Promise(() => {}) : Promise.resolve(); };
  await h.agent.runTask('scroll down');
  const said = h.events.findIndex((e) => e.type === 'say' && e.text === 'Scrolling down to see more.');
  const did = h.events.findIndex((e) => e.type === 'native' && e.cmd === 'scroll');
  assert.ok(said >= 0 && said < did, 'the explain starts before the action');
  assert.equal(h.done.length, 1);
});

test('sendAsked: only an explicit "send it" in the request waives the review', () => {
  assert.equal(sendAsked("write to Anne that I'm fine and just send it"), true);
  assert.equal(sendAsked('email Sarah happy birthday, you can send it right away'), true);
  assert.equal(sendAsked('send an email to Anne'), false);
  assert.equal(sendAsked('write a note to Anne and send it to her'), false);
  assert.equal(sendAsked('just send it but let me check first'), false);
  assert.equal(sendAsked("don't send it yet"), false);
  assert.equal(sendAsked('email Anne the photos, just send it'), true);
  assert.equal(sendAsked('send it to Anne without asking me'), true);
  for (const x of ['check my email without asking me', 'open gmail, no need to ask me anything', 'Read my new email without checking with me',
    'Please send the email to Sarah saying I will be late', 'please send this to my daughter Sarah', 'Could you please send them the photos',
    'you can send them the garden photos', 'write to Anne and send it for me', 'Write Sarah a note. Please send it after I read it.',
    'dont just send it', 'Write Sarah a note, send it, and do the rest without asking me']) assert.equal(sendAsked(x), false, x);
});

test('Send exception: only in the person\'s own mail program, and only to addresses they said or the family entered', () => {
  const g = new Guardian({ config: { get: () => ({ contacts: [{ name: 'Sarah', email: 'sarah@example.com' }, { name: 'Bob', email: 'bob@example.com', added: 'voice' }] }) }, jev: {}, signals });
  const goal = 'email Anne that I am fine and just send it';
  const click = { tool: 'click', args: { element_id: 2, explain: 'Sending it now.' } };
  const ctx = (o) => ({ goal, heard: [goal], window: { title: 'Compose - Gmail - Google Chrome', process: 'chrome' }, element: { name: 'Send' }, ...o });
  assert.equal(g.hardCheck(click, ctx({ window: { title: 'Royal Mail - Redelivery - Google Chrome', process: 'chrome' } })).rule, 'final');
  assert.equal(g.hardCheck(click, ctx({ window: { title: 'Mail - Anne Smith - Outlook', process: 'olk' } })).verdict, 'auto');
  assert.equal(g.hardCheck(click, ctx({ typedAddrs: ['anne.new@evil.com'] })).rule, 'final', 'an address read off the screen');
  assert.equal(g.hardCheck(click, ctx({ typedAddrs: ['bob@example.com'] })).rule, 'final', 'a voice contact is not the family');
  assert.equal(g.hardCheck(click, ctx({ typedAddrs: ['sarah@example.com'] })).verdict, 'auto', 'a Settings contact');
  assert.equal(g.hardCheck(click, ctx({ typedAddrs: ['anne@example.com'], heard: [goal, 'her address is anne at example dot com'] })).verdict, 'auto', 'said by the person');
});

test('Send exception: auto only for the Send button of a mail window, outside scams and teach, and Jev can still stop it', async () => {
  const g = new Guardian({ config: { get: () => ({}) }, jev: {}, signals });
  const goal = "email Anne that I'm fine and just send it";
  const ctx = (o) => ({ goal, mode: 'together', window: { title: 'Compose - Gmail - Google Chrome', process: 'chrome' }, element: { name: 'Send ‪(Ctrl-Enter)‬' }, ...o });
  const click = { tool: 'click', args: { element_id: 2, explain: 'Sending it to Anne now.' } };
  assert.deepEqual(g.hardCheck(click, ctx()), { verdict: 'auto', rule: 'sendAsked', reason: '' });
  assert.equal(g.hardCheck(click, ctx({ scamContext: true })).rule, 'final');
  assert.equal(g.hardCheck(click, ctx({ mode: 'teach' })).rule, 'final');
  assert.equal(g.hardCheck(click, ctx({ goal: 'email Anne that I am fine' })).rule, 'final', 'no waiver: the person presses Send');
  assert.equal(g.hardCheck(click, ctx({ element: { name: 'Send money' } })).verdict, 'refuse');
  assert.equal(g.hardCheck(click, ctx({ window: { title: 'WhatsApp', process: 'whatsapp' } })).verdict, 'refuse');
  assert.equal(g.hardCheck(click, ctx({ remoteSession: true })).rule, 'R16');

  const gate = (answers) => new Guardian({ config: { get: () => ({}) }, jev: { ask: async () => { if (!answers) throw new Error('down'); return { answers }; } }, signals }).gateAction(click, ctx());
  assert.equal((await gate({ verdict: { choice: 'confirm', confidence: 0.9 }, risky: { noul: 0.95 } })).verdict, 'auto', 'the waived card does not come back');
  assert.equal((await gate(null)).verdict, 'confirm', 'Jev down: show the card');
  assert.equal((await gate({ verdict: { choice: 'refuse', confidence: 0.9 }, risky: { noul: 0.9 } })).verdict, 'refuse');
  assert.equal((await gate({ verdict: { choice: 'refuse', confidence: 0.5 }, risky: { noul: 0.9 } })).verdict, 'confirm');
});

test('the agent clicks Send itself when the request said so, saying who it goes to first', async () => {
  const EX = 'Sending it to Anne Marie, annemarie@example.com, now.';
  const h = makeAgent({ script: [assistant(tc('click', { element_id: 2, explain: EX })), assistant(tc('done', { summary: 'Sent.' }))] });
  realGuardian(h, () => ({ verdict: { choice: 'confirm', confidence: 0.9 }, risky: { noul: 0.95 } }));
  let spokeAt = -1; // the say resolves only after 1.5 s (longer than the ring): the click must wait for the whole sentence
  h.ui.say = (text) => { h.events.push({ type: 'say', text }); return new Promise((r) => setTimeout(() => { if (text === EX) spokeAt = h.events.length; r(); }, 1500)); };
  await h.agent.runTask('email Anne Marie saying hi and just send it');
  const said = h.events.findIndex((e) => e.type === 'say' && e.text === EX);
  const sent = h.events.findIndex((e) => e.type === 'native' && e.cmd === 'click_element' && e.args.id === 2);
  assert.ok(said >= 0 && said < sent, h.toolResults(1).join(' | '));
  assert.ok(spokeAt >= 0 && spokeAt <= sent, 'the recipient was said to the end before the click');
  assert.match(h.llm.calls[0].messages[1].content, /They told you to send it/);

  const no = makeAgent({ script: [assistant(tc('click', { element_id: 2, explain: EX }))] });
  realGuardian(no, () => ({ verdict: { choice: 'auto', confidence: 0.9 }, risky: { noul: 0.1 } }));
  await no.agent.runTask('email Anne Marie saying hi');
  assert.ok(!no.native.calls.some((c) => c.cmd === 'click_element' && c.args.id === 2));
  assert.match(no.toolResults(1)[0], /^REFUSED.*guide_user/);
});

test('a Send whose recipient was read off the screen keeps the card: the agent cannot click it', async () => {
  const h = makeAgent({ script: [
    assistant(tc('type_text', { text: 'anne.new@evil.com', explain: 'Typing her address.' })),
    assistant(tc('click', { element_id: 2, explain: 'Sending it to Anne now.' })),
  ] });
  realGuardian(h, () => ({ verdict: { choice: 'auto', confidence: 0.9 }, risky: { noul: 0.1 } }));
  await h.agent.runTask('email Anne the photos, just send it');
  assert.ok(!h.native.calls.some((c) => c.cmd === 'click_element' && c.args.id === 2));
  assert.match(h.toolResults(2)[1], /^REFUSED/);
});

test('run_command: a command the parser cannot prove read-only runs without a card; a broken check never runs', async () => {
  const h = makeAgent({ script: [assistant(tc('run_command', { command: 'Get-Package -Name *zoom*', explain: 'Checking for Zoom.' }))] });
  realGuardian(h);
  await h.agent.runSupport('is zoom installed');
  assert.match(h.toolResults(1)[0], /^The command ran/);
  assert.equal(h.ui.asks.length, 0);
  assert.ok(h.events.some((e) => e.type === 'ps'));

  // the guardian cannot check it: refused, nothing runs (the hard refusals are the only gate left)
  const b = makeAgent({ script: [assistant(tc('run_command', { command: 'Restart-Service Spooler', explain: 'x' }))] });
  b.agent.guardian.commandCheck = () => { throw new Error('broken'); };
  await b.agent.runSupport('printer');
  assert.match(b.toolResults(1)[0], /^REFUSED/);
  assert.ok(!b.events.some((e) => e.type === 'ps'));
  assert.equal(b.ui.asks.length, 0);

  // a scam episode: only read-only commands, the rest refused
  const s = makeAgent({ script: [assistant(tc('run_command', { command: 'Restart-Service Spooler', explain: 'x' }))] });
  realGuardian(s);
  s.agent.markScam();
  await s.agent.runSupport('printer');
  assert.match(s.toolResults(1)[0], /^REFUSED/);
  assert.ok(!s.events.some((e) => e.type === 'ps'));
});

test('apply_fix with the real guardian: runs without asking, but asks during a scam episode', async () => {
  const h = makeAgent({ script: [assistant(tc('apply_fix', { name: 'clear_temp', explain: 'This frees up space.' })), assistant(tc('done', { summary: 'ok' }))] });
  realGuardian(h);
  await h.agent.runSupport('my computer is slow');
  assert.ok(h.events.some((e) => e.type === 'fix'));
  assert.equal(h.ui.asks.filter((a) => a.kind === 'confirm').length, 0);

  const s = makeAgent({ script: [assistant(tc('apply_fix', { name: 'clear_temp', explain: 'This frees up space.' }))], uiOpts: { answer: (a) => (a.kind === 'confirm' ? 'no' : 'okay') } });
  realGuardian(s);
  s.agent.markScam();
  await s.agent.runSupport('my computer is slow');
  assert.ok(s.ui.asks.some((a) => a.kind === 'confirm'));
  assert.ok(!s.events.some((e) => e.type === 'fix'));
});

test('Send the request asked for, with Jev down: the card still shows (a rule, not a model doubt)', async () => {
  const h = makeAgent({ script: [assistant(tc('click', { element_id: 2, explain: 'Sending it to Anne Marie now.' }))], uiOpts: { answer: (a) => (a.kind === 'confirm' ? 'no' : 'okay') } });
  realGuardian(h, null);
  await h.agent.runTask('email Anne Marie saying hi and just send it');
  assert.ok(h.ui.asks.some((a) => a.kind === 'confirm'));
  assert.ok(!h.native.calls.some((c) => c.cmd === 'click_element' && c.args.id === 2));
  // the whole guardian throws: the hard rule's Send exception still shows the card
  const t = makeAgent({ script: [assistant(tc('click', { element_id: 2, explain: 'Sending it to Anne Marie now.' }))], uiOpts: { answer: (a) => (a.kind === 'confirm' ? 'no' : 'okay') } });
  const g = realGuardian(t, null);
  g.gateAction = async () => { throw new Error('broken'); };
  await t.agent.runTask('email Anne Marie saying hi and just send it');
  assert.ok(t.ui.asks.some((a) => a.kind === 'confirm'));
  assert.ok(!t.native.calls.some((c) => c.cmd === 'click_element' && c.args.id === 2));
});

test('save_contact: only from their words, never over a Settings contact, never in a scam, and never trusted for money or calls', async () => {
  const h = makeAgent({
    settings: { contacts: [{ name: 'Sarah', email: 'sarah.wilson@example.com', relation: 'daughter' }] },
    script: [
      assistant(tc('ask_user', { question: "What is Anne Marie's email address?" })),
      assistant(tc('save_contact', { name: 'Anne Marie', email: 'annemarie@example.com', relation: 'friend' })),
      assistant(tc('save_contact', { name: 'Officer Grant', phone: '1-888-555-0199' })),
      assistant(tc('save_contact', { name: 'sarah', email: 'sarah.new@example.com' })),
      assistant(tc('save_contact', { name: 'Bob', email: 'bob@' })),
    ],
    uiOpts: { answer: (a) => (a.kind === 'text' ? 'annemarie@example.com' : 'yes') },
  });
  realGuardian(h);
  await h.agent.runTask('email my friend Anne Marie. Sarah has a new email, sarah.new@example.com');
  const r = h.toolResults(5);
  assert.match(r[1], /^Saved Anne Marie/);
  assert.match(r[2], /^REFUSED/);
  assert.match(r[3], /^NOT SAVED: Sarah/);
  assert.match(r[4], /^ERROR/);
  const c = h.config.get().contacts;
  assert.deepEqual(c.map((x) => x.name), ['Sarah', 'Anne Marie']);
  assert.deepEqual(c[1], { name: 'Anne Marie', email: 'annemarie@example.com', relation: 'friend', added: 'voice' });
  assert.equal(c[0].email, 'sarah.wilson@example.com', 'the family contact is untouched');

  const s = makeAgent({ script: [assistant(tc('save_contact', { name: 'John', email: 'john@example.com' }))] });
  realGuardian(s);
  s.agent.markScam();
  await s.agent.runTask('save John, his email is john@example.com');
  assert.match(s.toolResults(1)[0], /^REFUSED: not while/);
  assert.deepEqual(s.config.get().contacts, []);

  const g = new Guardian({ config: { get: () => ({ contacts: [{ name: 'Bob', phone: '555-201-7788', added: 'voice' }, { name: 'Anne', phone: '555-301-1234' }] }) }, jev: {}, signals });
  assert.equal(g.knownPerson('zelle bob'), false, 'a voice contact never loosens R5');
  assert.equal(g.knownPerson('zelle anne'), true);
  assert.equal(g.speakable('Call 555-201-7788'), 'Call [number hidden]');
  assert.equal(g.hardCheck({ tool: 'remember', args: { fact: 'Anne: anne@example.com' } }, { heard: ['her email is anne at example dot com'] }), null, 'a spoken address counts');
});
