// Barnaby's natural voice (research/07_voice.md): Microsoft MAI-Voice-2 through OpenRouter /api/v1/audio/speech, on
// the key the brain already uses. Main process only, so the key never reaches a renderer: the widget gets PCM.
// speak(text, opts) -> async iterator of {seq, pcm: Buffer (16-bit mono PCM), rate, gapMs, words, last}. One request
// per sentence, the next one already in flight while this one plays, so only the first sentence's wait is heard.
const { tag, RETRY } = require('./llm');
const product = require('./product');

const URL = 'https://openrouter.ai/api/v1/audio/speech';
// Privacy (safety.html "not kept"): OpenRouter ignores provider.zdr on /audio/speech (verified 2026-09-26: a non-ZDR
// Gemini request with zdr:true still returned audio), so only models whose every endpoint is on
// https://openrouter.ai/api/v1/endpoints/zdr may be called. mai-voice-2's only endpoint is Azure (ZDR).
const ZDR_TTS = new Set(['microsoft/mai-voice-2', 'microsoft/mai-voice-2-flash']);
const MODEL = 'microsoft/mai-voice-2';
// Settings "Voice": Ethan first (the default), then Grant, Jasper, Harper. 'local' = the computer's own voice.
const VOICES = ['en-US-Ethan:MAI-Voice-2', 'en-US-Grant:MAI-Voice-2', 'en-US-Jasper:MAI-Voice-2', 'en-US-Harper:MAI-Voice-2'];
const LOCAL = 'local';
const COOLDOWN_MS = 5 * 60 * 1000; // after a failure the Windows voice speaks for 5 minutes: no flipping voices mid-task

// UX 9.1: 350 ms between sentences, 600 ms after "Step 2 of 5."; the model's own edge silence is trimmed first
// so these are the real gaps. Same sentence split as ui/voice.js.
function chunks(text) {
  const parts = (String(text || '').match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || []).map((s) => s.trim()).filter(Boolean);
  return parts.map((t, i) => ({ text: t, gapMs: i === parts.length - 1 ? 0 : /^step \d+ of \d+[.!]?$/i.test(t) ? 600 : 350 }));
}

// Drop leading/trailing silence (10 ms frames under ~-40 dBFS), keep 30 ms of air on each side.
function trim(pcm, rate) {
  const n = pcm.length >> 1, f = Math.max(1, Math.round(rate / 100)), pad = Math.round(rate * 0.03);
  const loud = (i) => { let s = 0; for (let j = i; j < Math.min(n, i + f); j++) { const v = pcm.readInt16LE(j * 2); s += v * v; } return Math.sqrt(s / f) > 330; };
  let a = 0, b = n;
  while (a < n && !loud(a)) a += f;
  while (b > a && !loud(Math.max(a, b - f))) b -= f;
  if (a >= b) return pcm.subarray(0, 0);
  return pcm.subarray(Math.max(0, a - pad) * 2, Math.min(n, b + pad) * 2);
}

// One sentence. 8 s per attempt; one retry on 408/429/5xx or a dropped connection, none after a timeout (a hung
// service gets the Windows voice now, not 16 s of silence). Errors carry e.kind like llm.js ('aborted' on Stop).
async function synth(text, { apiKey, model, voice, speed = 0.9, signal, timeoutMs = 8000, fetchImpl = fetch }) {
  if (!apiKey) throw Object.assign(new Error('no API key'), { kind: 'nokey' });
  if (!ZDR_TTS.has(model)) throw Object.assign(new Error('TTS model not on the zero-retention list: ' + model), { kind: 'notzdr' });
  // Pace comes from the model's own speed (0.8 Slower / 0.9 Normal / 1.0 A bit faster), never a time-stretch.
  const body = JSON.stringify({ model, input: text, voice, response_format: 'pcm', speed, provider: { zdr: true, data_collection: 'deny' } });
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      const res = await fetchImpl(URL, {
        method: 'POST', signal: sig, body,
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'HTTP-Referer': product.website, 'X-Title': product.name },
      });
      if (!res.ok) {
        last = tag(new Error('TTS HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200)), res.status);
        if (RETRY.has(res.status)) continue;
        break;
      }
      const rate = Number(((res.headers.get('content-type') || '').match(/rate=(\d+)/) || [])[1]) || 24000;
      return { pcm: trim(Buffer.from(await res.arrayBuffer()), rate), rate };
    } catch (e) {
      if (signal && signal.aborted) throw Object.assign(e, { kind: 'aborted' });
      last = e.kind ? e : tag(e);
      if (last.kind === 'timeout') break;
    }
  }
  throw last;
}

// Session memory only (repeated lines, "Say it again"): never written to disk (safety.html: nothing saved).
// ponytail: a 64-sentence LRU in a Map; bundled fixed phrases (07_voice phase 2) would live in ui/assets/voice.
const mem = new Map();
const key = (o, t) => o.model + '|' + o.voice + '|' + (o.speed || 0.9) + '|' + t;
function remember(k, v) { mem.delete(k); mem.set(k, v); if (mem.size > 64) mem.delete(mem.keys().next().value); }

async function* speak(text, opts) {
  const list = chunks(text);
  const get = (i) => {
    const k = key(opts, list[i].text);
    if (mem.has(k)) { const v = mem.get(k); remember(k, v); return Promise.resolve(v); }
    const p = synth(list[i].text, opts).then((v) => { remember(k, v); return v; });
    p.catch(() => {}); // awaited below; a lookahead that is never reached must not be an unhandled rejection
    return p;
  };
  let next = list.length ? get(0) : null;
  for (let i = 0; i < list.length; i++) {
    if (opts.signal && opts.signal.aborted) return;
    const cur = next;
    next = i + 1 < list.length ? get(i + 1) : null; // one sentence ahead, in flight while this one plays
    const { pcm, rate } = await cur;
    if (opts.signal && opts.signal.aborted) return;
    yield { seq: i, pcm, rate, gapMs: list[i].gapMs, words: list[i].text.split(/\s+/).length, last: i === list.length - 1 };
  }
}

// Who says a line: {apiKey, model, voice, speed} for the natural voice, or null for the Windows voice. Muted
// (HELPER_MUTE=1 too) is null, so nothing is ever sent; so is a line holding a private number (guardian.sensitive).
function pick(s, text, { now = Date.now(), downUntil = 0, sensitive = false } = {}) {
  if (!s || s.muted || !s.apiKey || s.ttsVoice === LOCAL || sensitive || now < downUntil || !chunks(text).length) return null;
  return { apiKey: s.apiKey, model: s.ttsModel || MODEL, voice: VOICES.includes(s.ttsVoice) ? s.ttsVoice : VOICES[0],
    speed: Math.min(1.2, Math.max(0.7, Number(s.speechRate) || 0.9)) };
}

// main's side of every spoken line: each line's job (the widget's ack, Talk and Stop cancel it) and, after a failure,
// the Windows voice for the rest of that line ({id, error, rest}) and the next 5 minutes.
function createSpeaker({ send, log = () => {}, onProblem = () => {}, fetchImpl, now = Date.now }) {
  const jobs = new Map(); // id -> AbortController
  let downUntil = 0, runs = 0;
  return {
    get downUntil() { return downUntil; },
    get runs() { return runs; }, // the hidden smoke run checks it stays 0 while muted
    plan: (s, text, sensitive) => pick(s, text, { now: now(), downUntil, sensitive }),
    async run(id, text, plan) {
      const ac = new AbortController(), t0 = now();
      jobs.set(id, ac);
      runs++;
      let next = 0;
      try {
        for await (const c of speak(text, { ...plan, signal: ac.signal, fetchImpl })) { send({ id, ...c }); next = c.seq + 1; }
      } catch (e) {
        if (!ac.signal.aborted) {
          downUntil = now() + COOLDOWN_MS;
          log('[tts] failed', e.kind || 'other', text.length + ' chars', (now() - t0) + ' ms'); // never the words (04_safety 7.1)
          onProblem(e.kind);
          send({ id, error: e.kind || 'other', rest: chunks(text).slice(next).map((x) => x.text).join(' ') });
        }
      } finally {
        ac.abort(); // a lookahead still in flight after a failure is not needed
        jobs.delete(id);
      }
    },
    cancel(id) { const ac = jobs.get(id); if (ac) ac.abort(); },
    cancelAll() { for (const ac of jobs.values()) ac.abort(); },
  };
}

module.exports = { speak, chunks, trim, synth, pick, createSpeaker, VOICES, LOCAL, MODEL, ZDR_TTS, COOLDOWN_MS, _mem: mem };
