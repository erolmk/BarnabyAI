// Router unit tests with a fake Jev. Run: node --test test/router.test.js
const test = require('node:test');
const assert = require('node:assert');
const { route, INTENTS, CRITERIA, parseIntent } = require('../src/router');

function fakeJev(choice, confidence = 0.95) {
  const calls = [];
  return { calls, ask: async (state, questions, opts) => { calls.push({ state, questions, opts }); return { answers: { intent: { choice, confidence, probabilities: {} } } }; } };
}
const down = { ask: async () => { throw new Error('jev HTTP 524'); } };

test('keyword fast path: stop and home only when unambiguous, no Jev call', async () => {
  const jev = fakeJev('task');
  for (const u of ['stop', 'Stop!', 'okay, stop', 'never mind', 'cancel that', 'Stop it please.', "that's enough", 'That is enough, thank you.'])
    assert.deepStrictEqual(await route(u, { jev }), { intent: 'stop', confidence: 1, source: 'keyword' }, u);
  for (const u of ['go home', 'Take me home.', 'back to the home screen', 'home', 'go to the main screen please'])
    assert.deepStrictEqual(await route(u, { jev }), { intent: 'home', confidence: 1, source: 'keyword' }, u);
  assert.strictEqual(jev.calls.length, 0);
  for (const u of ['stop the music', 'my computer will not stop beeping', 'how do I set my home page', 'call my home phone']) {
    const r = await route(u, { jev });
    assert.strictEqual(r.source, 'jev', u);
  }
});

test('closing Barnaby himself is a keyword; a bare "close it" or "quit" is not', async () => {
  const jev = fakeJev('task');
  for (const u of ['Close Barnaby', 'please turn yourself off', 'quit Barnaby now', 'shut down Barnaby please', 'turn Barnaby off for today'])
    assert.deepStrictEqual(await route(u, { jev }), { intent: 'quit', confidence: 1, source: 'keyword' }, u);
  assert.strictEqual((await route('quit', { jev })).intent, 'stop');
  for (const u of ['close it', 'close the page', 'turn off the computer', 'close barnaby’s window and open email'])
    assert.strictEqual((await route(u, { jev })).source, 'jev', u);
});

test('one Jev choice over all intents, with examples inside the criteria', async () => {
  const jev = fakeJev('support', 0.97);
  const r = await route('my computer is so slow', { apiKey: 'k', jevModel: 'm', jev });
  assert.deepStrictEqual(r, { intent: 'support', confidence: 0.97, source: 'jev' });
  const { state, questions, opts } = jev.calls[0];
  assert.deepStrictEqual(opts, { apiKey: 'k', model: 'm' });
  assert.strictEqual(state.utterance, 'my computer is so slow');
  assert.strictEqual(questions.intent.type, 'choice');
  assert.deepStrictEqual(Object.keys(questions.intent.criteria).sort(), [...INTENTS].sort());
  for (const k of INTENTS) assert.ok(CRITERIA[k].examples.length >= 3 || ['stop', 'home'].includes(k), k);
});

test('low confidence goes to the LLM fallback when given', async () => {
  const llm = async () => 'scam_check';
  assert.deepStrictEqual(await route('he said he is from the bank', { jev: fakeJev('support', 0.4), llmFallback: llm }), { intent: 'scam_check', confidence: 0.4, source: 'llm' });
  assert.strictEqual((await route('x y', { jev: fakeJev('chat', 0.4), llmFallback: async () => 'Scam check.' })).intent, 'scam_check', 'loose LLM text');
  assert.deepStrictEqual(await route('x y', { jev: fakeJev('chat', 0.4), llmFallback: async () => 'banana' }), { intent: 'chat', confidence: 0.4, source: 'jev' });
  assert.deepStrictEqual(await route('x y', { jev: fakeJev('chat', 0.4), llmFallback: async () => { throw new Error('402'); } }), { intent: 'chat', confidence: 0.4, source: 'jev' });
  assert.deepStrictEqual(await route('x y', { jev: fakeJev('chat', 0.4) }), { intent: 'chat', confidence: 0.4, source: 'jev' });
  let called = false;
  await route('x y', { jev: fakeJev('chat', 0.8), llmFallback: async () => { called = true; return 'task'; } });
  assert.strictEqual(called, false, 'confident Jev skips the LLM');
});

test('parseIntent: thinking dropped, last intent word wins, nothing when none is named', async () => {
  assert.strictEqual(parseIntent('support'), 'support');
  assert.strictEqual(parseIntent('Scam check.'), 'scam_check');
  assert.strictEqual(parseIntent('scam-check'), 'scam_check');
  assert.strictEqual(parseIntent('<think>Could be task or chat. They mention the bank calling.</think>\nscam_check'), 'scam_check');
  assert.strictEqual(parseIntent('<think>maybe task, maybe support'), '', 'cut off mid-thought: no answer');
  assert.strictEqual(parseIntent('Not a task. Answer: support'), 'support');
  assert.strictEqual(parseIntent('banana'), '');
  assert.strictEqual(parseIntent(null), '');
  assert.strictEqual((await route('x y', { jev: fakeJev('chat', 0.4), llmFallback: async () => '<think>task?</think> family' })).intent, 'family');
});

test('jev requests carry the privacy provider block', async () => {
  const jev = require('../src/jev');
  jev.reset();
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ answers: { q: { noul: 0.1 } } }) }; };
  await jev.noul({ a: 1 }, 'is it?', { apiKey: 'k', fetchImpl });
  assert.strictEqual(sent.url, 'https://openrouter.ai/api/alpha/decisions');
  assert.deepStrictEqual(sent.body.provider, { zdr: true, data_collection: 'deny' });
  assert.deepStrictEqual(Object.keys(sent.body).sort(), ['model', 'provider', 'questions', 'state']);
});

test('Jev failure or a strange answer falls back to keyword heuristics', async () => {
  const cases = {
    'I want to send photos to Anne Marie': 'task',
    'my computer is so slow': 'support',
    'the internet is not working': 'support',
    'what is the weather like': 'chat',
    'show me how to attach a file': 'teach',
    'how do I make the letters bigger': 'teach',
    'a man called saying he is from Microsoft': 'scam_check',
    'someone wants me to buy gift cards': 'scam_check',
    'call my daughter': 'family',
  };
  for (const [u, want] of Object.entries(cases)) {
    const r = await route(u, { jev: down });
    assert.deepStrictEqual([r.intent, r.source], [want, 'heuristic'], u);
  }
  assert.strictEqual((await route('open my email', { jev: fakeJev('dance') })).source, 'heuristic');
  assert.strictEqual((await route('open my email', {})).source, 'heuristic', 'no API key');
  assert.deepStrictEqual(await route('   ', { jev: down }), { intent: 'chat', confidence: 0, source: 'empty' });
});

test('jev circuit breaker: one failed call, then instant failures until a probe succeeds', async () => {
  const jev = require('../src/jev');
  jev.reset();
  let hits = 0;
  const bad = async () => { hits++; return { ok: false, status: 503, text: async () => 'busy' }; };
  const opts = { apiKey: 'k', fetchImpl: bad };
  await assert.rejects(jev.ask({}, {}, opts), /jev HTTP 503/);
  assert.strictEqual(hits, 2, 'one retry by default');
  const t0 = Date.now();
  await assert.rejects(jev.ask({}, {}, opts), /circuit open/);
  assert.strictEqual(hits, 2, 'no request while the circuit is open');
  assert.ok(Date.now() - t0 < 50);
  assert.strictEqual((await route('open my email', { apiKey: 'k', jev })).source, 'heuristic', 'router falls back at once');
  jev.reset();
  const good = async () => ({ ok: true, json: async () => ({ answers: { q: { choice: 'task' } } }) });
  assert.deepStrictEqual((await jev.ask({}, {}, { apiKey: 'k', fetchImpl: good })).answers, { q: { choice: 'task' } });
  assert.strictEqual(jev.stats().circuitOpen, false);
});
