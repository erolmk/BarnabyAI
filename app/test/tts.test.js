// Barnaby's natural voice (src/tts.js, research/07_voice.md) with a fake fetch: no network, no sound.
// The one live check (costs about $0.002, writes a WAV file, never plays it):
//   LIVE=1 OPENROUTER_API_KEY=... node --test test/tts.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tts = require('../src/tts');
const llm = require('../src/llm');
const { Config } = require('../src/config');

const M = 'microsoft/mai-voice-2';
const RATE = 24000;
const sil = Buffer.alloc(RATE * 2 * 0.3);
const tone = Buffer.alloc(RATE * 2 * 0.2);
for (let i = 0; i < tone.length / 2; i++) tone.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
const audio = () => new Response(Buffer.concat([sil, tone, sil]), { headers: { 'content-type': 'audio/pcm;rate=24000;channels=1' } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = { apiKey: 'k', speechRate: 0.9, muted: false }; // settings as config.get() returns them

// A fake OpenRouter: records each request; `delay(input)` says how long that sentence takes; status(input) an HTTP code.
function fakeFetch({ delay = () => 20, status = () => 200 } = {}) {
  const f = (url, o) => {
    const b = JSON.parse(o.body);
    f.calls.push({ url, body: b, headers: o.headers });
    f.inFlight++;
    f.maxInFlight = Math.max(f.maxInFlight, f.inFlight);
    return new Promise((resolve, reject) => {
      let open = true;
      const done = () => { if (open) f.inFlight--; open = false; };
      const t = setTimeout(() => { done(); const st = status(b.input); resolve(st === 200 ? audio() : new Response('nope', { status: st })); }, delay(b.input));
      o.signal.addEventListener('abort', () => { clearTimeout(t); done(); reject(o.signal.reason); }, { once: true });
    });
  };
  f.calls = []; f.inFlight = 0; f.maxInFlight = 0;
  f.inputs = () => f.calls.map((c) => c.body.input);
  return f;
}
test.beforeEach(() => tts._mem.clear());

// Four sentences of about 120 characters: too long to group, so each is its own request.
const LONG = [1, 2, 3, 4].map((n) => 'Sentence ' + n + ' is a long one, so it goes to the voice service on its own and is never grouped with the next one at all, ever.');

test('chunks: sentences split like the widget, then grouped up to 220 characters; "Step 2 of 5." alone with 600 ms after it', () => {
  const c = tts.chunks("Step 2 of 5. I'm clicking the blue Compose button. Take your time! Is that right?");
  assert.deepEqual(c.map((x) => x.text), ['Step 2 of 5.', "I'm clicking the blue Compose button. Take your time! Is that right?"]);
  assert.deepEqual(c.map((x) => x.gapMs), [600, 0]);
  const hundred = ['a', 'b', 'c'].map((x) => x.repeat(99) + '.');
  const g = tts.chunks(hundred.join(' '));
  assert.equal(g.length, 2);
  assert.ok(g[0].text.length <= 220 && g[0].text === hundred[0] + ' ' + hundred[1], String(g[0].text.length));
  assert.deepEqual(g.map((x) => x.gapMs), [350, 0]);
  assert.equal(tts.chunks(LONG.join(' ')).length, 4);
  assert.deepEqual(tts.chunks('Hello there').map((x) => x.text), ['Hello there'], 'no full stop: one sentence');
  assert.deepEqual(tts.chunks('She said "yes." Then left.').map((x) => x.text), ['She said "yes." Then left.'], 'a closing quote stays with its sentence');
  assert.deepEqual(tts.chunks('...'), []);
  assert.deepEqual(tts.chunks(''), []);
});

test('trim: the model\'s edge silence goes, 30 ms of air stays before and 80 ms after (the last consonant\'s tail)', () => {
  const t = tts.trim(Buffer.concat([sil, tone, sil]), RATE);
  assert.ok(Math.abs(t.length / 2 / RATE - 0.31) < 0.03, String(t.length / 2 / RATE));
  assert.equal(tts.trim(sil, RATE).length, 0);
});

test('privacy: a model that is not zero-retention is refused before any request; the request asks for ZDR', async () => {
  const f = fakeFetch();
  for (const model of ['google/gemini-3.8-flash-tts', 'x-ai/grok-voice-tts-1.0', '', undefined]) {
    await assert.rejects(tts.synth('Hi.', { apiKey: 'x', model, voice: 'Charon', fetchImpl: f }), (e) => e.kind === 'notzdr');
  }
  assert.equal(f.calls.length, 0);
  await assert.rejects(tts.synth('Hi.', { apiKey: '', model: M, voice: 'v', fetchImpl: f }), (e) => e.kind === 'nokey');
  const r = await tts.synth('Hi.', { apiKey: 'x', model: M, voice: tts.VOICES[0], speed: 0.8, fetchImpl: f });
  assert.equal(r.rate, 24000);
  assert.ok(r.pcm.length > 0);
  const b = f.calls[0].body;
  assert.deepEqual([b.model, b.voice, b.speed, b.response_format, b.input], [M, 'en-US-Ethan:MAI-Voice-2', 0.8, 'pcm', 'Hi.']);
  assert.deepEqual(b.provider, { zdr: true, data_collection: 'deny' });
  assert.equal(f.calls[0].url, 'https://openrouter.ai/api/v1/audio/speech');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer x');
  assert.deepEqual([...tts.ZDR_TTS].sort(), ['microsoft/mai-voice-2', 'microsoft/mai-voice-2-flash'], 'the allow-list is only the Azure (ZDR) MAI voices');
});

test('pipelining: one sentence ahead, requests in order, sentences come out in order even when a later one is faster', async () => {
  const f = fakeFetch({ delay: (t) => (t === LONG[0] ? 60 : 10) });
  const got = [];
  for await (const c of tts.speak(LONG.join(' '), { apiKey: 'x', model: M, voice: 'v', fetchImpl: f })) {
    if (c.seq === 0) assert.deepEqual(f.inputs(), LONG.slice(0, 2), 'the 2nd sentence is in flight while the 1st plays');
    got.push([c.seq, c.gapMs, c.last, c.rate]);
  }
  assert.deepEqual(got, [[0, 350, false, 24000], [1, 350, false, 24000], [2, 350, false, 24000], [3, 0, true, 24000]]);
  assert.deepEqual(f.inputs(), LONG);
  assert.ok(f.maxInFlight <= 2, 'never more than the playing sentence and the next: ' + f.maxInFlight);
});

test('cancel: Stop / Talk / the ack aborts the job; nothing more is sent or requested', async () => {
  const f = fakeFetch();
  const sent = [];
  // main forwards each sentence as soon as it is made; the widget's ack for line 7 comes with the first one
  const sp = tts.createSpeaker({ send: (m) => { sent.push(m); if (m.id === 7) sp.cancel(7); }, fetchImpl: f });
  const plan = sp.plan(S, LONG.join(' '));
  await sp.run(7, LONG.join(' '), plan);
  await wait(60);
  assert.deepEqual(f.inputs(), LONG.slice(0, 2), 'the sentence sent and the one in flight; nothing after the cancel');
  assert.deepEqual(sent.map((m) => m.seq), [0]);
  assert.equal(f.inFlight, 0, 'the request in flight was aborted too');
  assert.ok(sent.every((m) => !m.error), 'a cancel is not a failure: the Windows voice does not take over');
  assert.equal(sp.downUntil, 0);
  // cancelAll (Stop): every line in flight
  const a = sp.run(8, LONG.slice(0, 2).join(' '), plan), b = sp.run(9, LONG.slice(2).join(' '), plan);
  sp.cancelAll();
  await Promise.all([a, b]);
  assert.ok(!sent.some((m) => m.id === 8 || m.id === 9), 'nothing sent for cancelled lines');
});

test('fallback: a failure hands the rest of the line to the Windows voice and keeps it for 5 minutes', async () => {
  let now = 1e12;
  const line = LONG.slice(0, 3).join(' ');
  const f = fakeFetch({ status: (t) => (t === LONG[1] ? 500 : 200) });
  const sent = [], logs = [], problems = [];
  const sp = tts.createSpeaker({ send: (m) => sent.push(m), log: (...a) => logs.push(a.join(' ')), onProblem: (k) => problems.push(k), fetchImpl: f, now: () => now });
  await sp.run(1, line, sp.plan(S, line));
  assert.deepEqual(sent.map((m) => (m.error ? 'error:' + m.error : m.seq)), [0, 'error:other']);
  assert.equal(sent[1].rest, LONG[1] + ' ' + LONG[2], 'the sentences not yet played');
  assert.equal(f.inputs().filter((x) => x === LONG[1]).length, 2, 'one retry on a 5xx');
  assert.deepEqual(problems, ['other']);
  assert.equal(logs.filter((l) => /failed/.test(l)).length, 1);
  assert.ok(logs.some((l) => /^\[tts\] first \d+ ms/.test(l)), 'the first chunk\'s latency is logged');
  assert.ok(logs.every((l) => !/Sentence|long one/.test(l)) && logs.every((l) => l.includes(line.length + ' chars')), 'the log has the length, never the words: ' + logs);
  assert.equal(sp.downUntil, now + tts.COOLDOWN_MS);
  assert.equal(sp.plan(S, 'Hello.'), null, 'the Windows voice for the next 5 minutes');
  now += tts.COOLDOWN_MS - 1;
  assert.equal(sp.plan(S, 'Hello.'), null);
  now += 2;
  assert.ok(sp.plan(S, 'Hello.'), 'the natural voice comes back after 5 minutes');
  // a credit or key problem reaches main's connectionProblem; no retry on a 4xx
  const g = fakeFetch({ status: () => 402 });
  const sp2 = tts.createSpeaker({ send: (m) => sent.push(m), onProblem: (k) => problems.push(k), fetchImpl: g });
  await sp2.run(2, 'Hi.', sp2.plan(S, 'Hi.'));
  assert.equal(g.calls.length, 1);
  assert.equal(problems.at(-1), 'credit');
  assert.deepEqual(sent.at(-1), { id: 2, error: 'credit', rest: 'Hi.' });
});

test('fallback: a hung voice service gets the Windows voice after the timeout, with no second wait', async () => {
  const f = fakeFetch({ delay: () => 10000 });
  const sent = [];
  const sp = tts.createSpeaker({ send: (m) => sent.push(m), fetchImpl: f });
  const t0 = Date.now();
  await sp.run(3, 'Hello there. Bye.', { ...sp.plan(S, 'Hello there. Bye.'), timeoutMs: 50 });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(f.calls.filter((c) => c.body.input === 'Hello there. Bye.').length, 1, 'no retry after a timeout (a short line is one request)');
  assert.deepEqual(sent, [{ id: 3, error: 'timeout', rest: 'Hello there. Bye.' }]);
});

test('allow-list: a settings file naming another TTS model never reaches the network; the Windows voice speaks', async () => {
  const f = fakeFetch();
  const sent = [];
  const sp = tts.createSpeaker({ send: (m) => sent.push(m), fetchImpl: f });
  const plan = sp.plan({ ...S, ttsModel: 'google/gemini-3.8-flash-tts' }, 'Hello.');
  await sp.run(4, 'Hello.', plan);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(sent, [{ id: 4, error: 'notzdr', rest: 'Hello.' }]);
});

test('muted (and HELPER_MUTE=1) means no request at all; so do the computer\'s own voice, no key and private numbers', async () => {
  const f = fakeFetch();
  const sp = tts.createSpeaker({ send: () => { throw new Error('nothing may be sent'); }, fetchImpl: f });
  assert.equal(sp.plan({ ...S, muted: true }, 'Hello.'), null);
  assert.equal(sp.plan({ ...S, ttsVoice: tts.LOCAL }, 'Hello.'), null);
  assert.equal(sp.plan({ ...S, apiKey: '' }, 'Hello.'), null);
  assert.equal(sp.plan(S, 'Your card ends in 1111.', true), null, 'guardian.sensitive lines stay on this computer');
  assert.equal(sp.plan(S, '...'), null, 'nothing to say');
  const was = process.env.HELPER_MUTE;
  process.env.HELPER_MUTE = '1';
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barnaby-tts-'));
    const c = new Config(dir);
    c.save({ apiKey: 'sk-test', muted: false });
    assert.equal(sp.plan(c.get(), 'Hello, Rose.'), null, 'HELPER_MUTE=1 wins over a saved muted:false');
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { if (was === undefined) delete process.env.HELPER_MUTE; else process.env.HELPER_MUTE = was; }
  assert.equal(sp.runs, 0);
  assert.equal(f.calls.length, 0);
});

test('plan: Ethan by default, the chosen voice, speed = speechRate (clamped), the MAI model', () => {
  const p = tts.pick(S, 'Hello.');
  assert.deepEqual(p, { apiKey: 'k', model: M, voice: 'en-US-Ethan:MAI-Voice-2', speed: 0.72, style: 'happy' });
  const plain = { ...S, ttsStyle: 'none' };
  assert.deepEqual(tts.pick(plain, 'Hello.'), { apiKey: 'k', model: M, voice: 'en-US-Ethan:MAI-Voice-2', speed: 0.9, style: '' });
  assert.equal(tts.pick({ ...S, ttsVoice: 'en-US-Harper:MAI-Voice-2' }, 'Hi.').voice, 'en-US-Harper:MAI-Voice-2');
  assert.equal(tts.pick({ ...S, ttsVoice: 'en-US-Nobody' }, 'Hi.').voice, 'en-US-Ethan:MAI-Voice-2', 'unknown voice: Ethan');
  assert.deepEqual([0.8, 1.0, 0.3, 5, undefined].map((r) => tts.pick({ ...plain, speechRate: r }, 'Hi.').speed), [0.8, 1.0, 0.7, 1.2, 0.9]);
  const flash = tts.pick({ ...S, ttsModel: 'microsoft/mai-voice-2-flash' }, 'Hi.');
  assert.deepEqual([flash.model, flash.voice], ['microsoft/mai-voice-2-flash', 'en-US-Ethan:MAI-Voice-2-Flash'], 'the Flash model gets the -Flash voice id');
});

test('style: warm ("happy") and a little slower on Ethan and Harper; calm for bad news, scams and refusals; off with ttsStyle none', async () => {
  assert.deepEqual([tts.pick(S, 'Great, I found it.').style, tts.pick(S, 'Great, I found it.').speed], ['happy', 0.72]);
  for (const t of ['This looks like a scam.', 'Sorry, I couldn’t find it.', 'Okay, I stopped.', 'I can’t do payments.', 'Please type your password.']) {
    assert.deepEqual([tts.pick(S, t).style, tts.pick(S, t).speed], ['', 0.9], t);
  }
  assert.equal(tts.pick({ ...S, ttsVoice: 'en-US-Grant:MAI-Voice-2' }, 'Great.').style, '', 'Grant has no styles');
  assert.equal(tts.pick({ ...S, ttsVoice: 'en-US-Harper:MAI-Voice-2' }, 'Great.').style, 'happy');
  assert.equal(tts.pick({ ...S, ttsStyle: 'none' }, 'Great.').style, '');
  assert.equal(tts.pick({ ...S, ttsStyle: 'excited' }, 'Great.').style, 'excited');
  // on the wire: the style rides on the same zero-retention provider block; the cache keeps styles apart
  const f = fakeFetch();
  await tts.synth('Great.', { apiKey: 'x', model: M, voice: tts.VOICES[0], style: 'happy', fetchImpl: f });
  assert.deepEqual(f.calls[0].body.provider, { zdr: true, data_collection: 'deny', options: { azure: { style: 'happy' } } });
  const o = { apiKey: 'x', model: M, voice: 'v', fetchImpl: f };
  for await (const _ of tts.speak('Well done.', o)) { /* drain */ }
  for await (const _ of tts.speak('Well done.', { ...o, style: 'happy' })) { /* drain */ }
  assert.equal(f.calls.length, 3, 'the same words with and without a style are two recordings');
});

test('cache: a repeated line makes no request (memory only, 64 sentences)', async () => {
  const f = fakeFetch();
  const o = { apiKey: 'x', model: M, voice: 'v', fetchImpl: f };
  for await (const _ of tts.speak('Okay, I stopped.', o)) { /* drain */ }
  for await (const _ of tts.speak('Okay, I stopped.', o)) { /* drain */ }
  assert.equal(f.calls.length, 1);
  for await (const _ of tts.speak('Okay, I stopped.', { ...o, speed: 0.8 })) { /* drain */ }
  assert.equal(f.calls.length, 2, 'another pace is another recording');
  for (let i = 0; i < 70; i++) for await (const _ of tts.speak('Line ' + i + '.', o)) { /* drain */ }
  assert.equal(tts._mem.size, 64);
});

test('the Settings page offers exactly the voices tts.js allows, Ethan first', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'settings.js'), 'utf8');
  const found = [...src.matchAll(/'(en-US-\w+:MAI-Voice-2)'/g)].map((m) => m[1]);
  assert.deepEqual(found, tts.VOICES);
  assert.equal(tts.VOICES[0], 'en-US-Ethan:MAI-Voice-2');
});

test('speech-to-text is pinned to zero retention, with a non-China fallback model', async () => {
  const bodies = [];
  const f = async (url, o) => {
    bodies.push(JSON.parse(o.body));
    return bodies.length === 1 ? new Response('{"error":{"message":"No endpoints"}}', { status: 404 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { status: 200 });
  };
  await assert.rejects(llm.transcribe({ apiKey: 'x', model: 'google/gemini-3.1-flash-lite', wavBase64: 'UklGRg==', fetchImpl: f }));
  assert.equal(bodies.length, 1, 'a 404 is not retried without zero retention');
  assert.deepEqual(bodies[0].provider, { zdr: true, data_collection: 'deny' });
  assert.deepEqual(bodies[0].models, ['google/gemini-3.1-flash-lite', 'mistralai/voxtral-small-24b-2507']);
  assert.ok(!/^(deepseek|qwen|alibaba|moonshotai|z-ai|minimax|xiaomi|baidu|tencent|bytedance)\//.test(llm.STT_FALLBACK));
});

// ---------- the one live check ----------
const LIVE = process.env.LIVE === '1' && !!process.env.OPENROUTER_API_KEY;
test('LIVE: one short line in Ethan\'s voice through tts.js, written to a WAV file (never played); speech-to-text reads it back', { skip: !LIVE && 'set LIVE=1 and OPENROUTER_API_KEY' }, async () => {
  const line = 'Hello Rose. I am Barnaby.';
  const plan = tts.pick({ apiKey: process.env.OPENROUTER_API_KEY, speechRate: 0.9 }, line);
  const t0 = Date.now(), parts = [];
  let first = 0;
  for await (const c of tts.speak(line, plan)) {
    if (!first) first = Date.now() - t0;
    assert.equal(c.rate, 24000);
    parts.push(c.pcm, Buffer.alloc(Math.round(c.rate * c.gapMs / 1000) * 2));
  }
  const pcm = Buffer.concat(parts);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  const file = process.env.LIVE_WAV || path.join(os.tmpdir(), 'barnaby-tts-live.wav');
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
  // read the file back: a real WAV header and a plausible length for 6 words at speed 0.9
  const w = fs.readFileSync(file);
  assert.deepEqual([w.toString('ascii', 0, 4), w.toString('ascii', 8, 12), w.toString('ascii', 12, 16), w.toString('ascii', 36, 40)], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.deepEqual([w.readUInt16LE(20), w.readUInt16LE(22), w.readUInt32LE(24), w.readUInt16LE(34)], [1, 1, 24000, 16]);
  assert.equal(w.readUInt32LE(40), w.length - 44);
  const sec = (w.length - 44) / 2 / 24000;
  let peak = 0;
  for (let i = 44; i < w.length; i += 2) peak = Math.max(peak, Math.abs(w.readInt16LE(i)));
  process.stdout.write(JSON.stringify({ file, firstAudioMs: first, seconds: +sec.toFixed(2), peak }) + '\n');
  assert.ok(sec > 1 && sec < 6, 'length ' + sec + ' s');
  assert.ok(peak > 3000, 'there is sound in it: peak ' + peak);
  // the same file through the pinned (zero-retention) speech-to-text: primary, then the fallback model on its own
  const b64 = w.toString('base64');
  for (const model of ['google/gemini-3.1-flash-lite', llm.STT_FALLBACK]) {
    const r = await llm.transcribe({ apiKey: process.env.OPENROUTER_API_KEY, model, wavBase64: b64 });
    process.stdout.write(JSON.stringify({ stt: model, text: r.text, cost: r.cost, served: llm.stats().served }) + '\n');
    assert.match(r.text, /rose/i);
    assert.match(r.text, /barnaby/i);
  }
});
