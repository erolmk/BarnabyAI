// Mic capture + voice-activity detection + 16 kHz WAV, and the TTS voice. Exposes window.Voice.
// Renderer is sandboxed: browser APIs only. In the browser demo (helper.isDemo / no helper) speak() is silent.
(function () {
  'use strict';
  const OUT_RATE = 16000;
  const demo = () => !window.helper || !!window.helper.isDemo;

  // ---------- VAD (pure, so it can be self-tested without a microphone) ----------
  // Adaptive noise floor: falls fast, rises only slowly while it is not speech, so a fan or a TV
  // raises the bar but the person's own voice never becomes "noise".
  function makeVad({ silenceMs = 1600, noSpeechMs = 8000, maxMs = 30000 } = {}) {
    let floor = null, t = 0, run = 0, started = false, startAt = 0, lastVoice = 0;
    return {
      get started() { return started; },
      get startAt() { return startAt; },
      get lastVoice() { return lastVoice; },
      // returns {rms, level 0..1, verdict: 'wait'|'end'|'nospeech'|'max'}
      push(buf, rate) {
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / Math.max(1, buf.length));
        const dur = (buf.length / rate) * 1000;
        if (floor === null) floor = rms;
        const thr = Math.max(0.006, floor * 3);
        if (rms > thr) floor = floor * 0.9995 + rms * 0.0005;
        else floor = rms < floor ? floor * 0.8 + rms * 0.2 : floor * 0.98 + rms * 0.02;
        if (rms > thr) {
          run += dur;
          if (!started && run >= 100) { started = true; startAt = Math.max(0, t - run); }
        } else run = 0;
        t += dur;
        if (started && rms > thr * 0.7) lastVoice = t;
        const db = 20 * Math.log10(rms + 1e-8);
        const level = Math.max(0, Math.min(1, (db + 60) / 45));
        let verdict = 'wait';
        if (t >= maxMs) verdict = 'max';
        else if (started && t - lastVoice >= silenceMs) verdict = 'end';
        else if (!started && t >= noSpeechMs) verdict = 'nospeech';
        return { rms, level, verdict };
      },
    };
  }

  // ---------- WAV: average-decimate to 16 kHz mono, 16-bit PCM ----------
  function wav16(f32, rateIn) {
    const ratio = rateIn / OUT_RATE;
    const n = Math.floor(f32.length / ratio);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, OUT_RATE, true); v.setUint32(28, OUT_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(f32.length, Math.floor((i + 1) * ratio));
      let x = f32[a] || 0;
      if (b > a + 1) { let s = 0; for (let j = a; j < b; j++) s += f32[j]; x = s / (b - a); }
      x = Math.max(-1, Math.min(1, x));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  function base64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---------- capture ----------
  const WORKLET = "registerProcessor('tap', class extends AudioWorkletProcessor {" +
    "constructor(){super();this.b=new Float32Array(2048);this.n=0;}" +
    "process(inp){const c=inp[0]&&inp[0][0];if(c){for(let i=0;i<c.length;i++){this.b[this.n++]=c[i];" +
    "if(this.n===this.b.length){this.port.postMessage(this.b.slice(0));this.n=0;}}}return true;}});";

  async function tap(ctx, src, onChunk) {
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, 'tap');
      node.port.onmessage = (e) => onChunk(e.data);
      src.connect(node); node.connect(ctx.destination); // outputs silence; keeps the node pulled
      return node;
    } catch (_) {
      const node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node); node.connect(ctx.destination);
      return node;
    }
  }

  let session = null; // {finish(keep)}

  // Resolves {wavBase64, durationMs} or null (no speech / cancelled). Rejects if there is no microphone.
  async function listen({ onState, onLevel, maxMs = 30000, silenceMs = 1600, noSpeechMs = 8000 } = {}) {
    if (session) session.finish(false);
    const state = (s) => { try { onState && onState(s); } catch (_) {} };
    state('starting');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const ctx = new AudioContext();
    const rate = ctx.sampleRate;
    const src = ctx.createMediaStreamSource(stream);
    const vad = makeVad({ silenceMs, noSpeechMs, maxMs });
    const chunks = [];
    let total = 0, done = false, node = null, heard = false;

    return new Promise((resolve) => {
      function finish(keep) {
        if (done) return;
        done = true;
        session = null;
        try { node && node.disconnect(); src.disconnect(); } catch (_) {}
        stream.getTracks().forEach((t) => t.stop()); // release the mic after every listen
        ctx.close().catch(() => {});
        state('done');
        if (!keep || !total) return resolve(null);
        // Trim to the speech (+ a little air); with no detected start ("Done talking" pressed) keep it all.
        const ms2s = (ms) => Math.round((ms / 1000) * rate);
        const a = vad.started ? Math.max(0, ms2s(vad.startAt - 400)) : 0;
        const b = vad.started ? Math.min(total, ms2s(vad.lastVoice + 500)) : total;
        const all = new Float32Array(Math.max(0, b - a));
        let off = 0, pos = 0;
        for (const c of chunks) {
          const s = Math.max(a - pos, 0), e = Math.min(c.length, b - pos);
          if (e > s) { all.set(c.subarray(s, e), off); off += e - s; }
          pos += c.length;
        }
        const wav = wav16(all, rate);
        resolve({ wavBase64: base64(wav), durationMs: Math.round(((wav.length - 44) / 2 / OUT_RATE) * 1000) });
      }
      session = { finish };
      tap(ctx, src, (buf) => {
        if (done) return;
        chunks.push(buf); total += buf.length;
        const r = vad.push(buf, rate);
        try { onLevel && onLevel(r.level); } catch (_) {}
        if (vad.started && !heard) { heard = true; state('hearing'); }
        if (r.verdict === 'end' || r.verdict === 'max') finish(true);
        else if (r.verdict === 'nospeech') finish(false);
      }).then((n) => { node = n; if (done) { try { n.disconnect(); } catch (_) {} } else state('listening'); });
    });
  }

  // "Done talking": stop now and keep what was said. cancel(): stop and throw it away.
  function finish() { if (session) session.finish(true); }
  function cancel() { if (session) session.finish(false); }

  // ---------- speech ----------
  let gen = 0;
  let stopNow = null; // ends the play() in progress at once (barge-in within 300 ms, UX 9.2)
  let node = null; // the WebAudio source playing now
  let actx = null;
  let clip = null; // {text, chunks}: the last line in the natural voice, so "Say it again" needs no network
  const hasTts = () => typeof speechSynthesis !== 'undefined';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STOP = {};

  function loadVoices() {
    if (!hasTts()) return Promise.resolve([]);
    const now = speechSynthesis.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((res) => {
      const t = setTimeout(() => res(speechSynthesis.getVoices()), 1500);
      speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(speechSynthesis.getVoices()); }, { once: true });
    });
  }

  // Default = a lower-pitched English voice (UX 9.1); never pitch-shifted.
  const LOW = /\b(guy|davis|andrew|brian|christopher|eric|roger|ryan|thomas|george|david|mark|james)\b/i;
  function pickVoice(list, name) {
    if (name) { const v = list.find((x) => x.name === name); if (v) return v; }
    const en = list.filter((v) => /^en/i.test(v.lang));
    const lang = (navigator.language || 'en-US').toLowerCase();
    return en.find((v) => LOW.test(v.name) && v.lang.toLowerCase() === lang) || en.find((v) => LOW.test(v.name)) ||
      en.find((v) => v.default) || en[0] || list[0] || null;
  }

  function sayOne(text, voice, rate, my) {
    return new Promise((res) => {
      if (my !== gen) return res();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = rate; u.pitch = 1;
      // Safety net: Chromium sometimes never fires onend.
      const guard = setTimeout(res, 4000 + text.split(/\s+/).length * 700);
      u.onend = u.onerror = () => { clearTimeout(guard); res(); };
      speak._u = u; // keep a reference (GC'd utterances lose their onend in Chromium)
      speechSynthesis.speak(u);
    });
  }

  // The computer's own voice: sentence by sentence with 350 ms pauses (UX 9.1). Resolves when finished or stopped.
  async function speak(text, { rate = 0.9, voiceName = '' } = {}) {
    text = String(text || '').trim();
    if (!text || demo() || !hasTts()) return;
    stopSpeaking();
    return windowsVoice(text, rate, voiceName, gen);
  }
  async function windowsVoice(text, rate, voiceName, my) {
    if (!hasTts()) return;
    let r = Number(rate) || 0.9;
    if (text.split(/\s+/).length > 25) r -= 0.05;
    r = Math.max(0.75, Math.min(1.2, r));
    const voice = pickVoice(await loadVoices(), voiceName);
    const parts = text.match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || [text];
    for (const p of parts) {
      if (my !== gen) return;
      await sayOne(p.trim(), voice, r, my);
      if (my !== gen) return;
      await new Promise((ok) => setTimeout(ok, 350));
    }
  }

  // Barnaby's natural voice: the sentences main makes (src/tts.js), 16-bit mono PCM, played with WebAudio as they
  // arrive. `chunks` is an array or an async iterator of {pcm, rate, gapMs, last}; a {error, rest} chunk means the
  // voice service failed, and the rest of the line is said in the computer's own voice. Resolves when the last
  // sentence has finished, or at once on stopSpeaking(). opts.text keeps the line for replay().
  async function play(chunks, { text = '', rate = 0.9, voiceName = '' } = {}) {
    if (demo()) return;
    stopSpeaking();
    const my = gen;
    const stopped = new Promise((r) => { stopNow = () => r(STOP); });
    const it = (chunks[Symbol.asyncIterator] || chunks[Symbol.iterator]).call(chunks);
    const kept = [];
    try {
      for (;;) {
        const r = await Promise.race([it.next(), stopped]); // still waiting for a sentence: Stop ends it too
        if (r === STOP || my !== gen || r.done) return;
        const c = r.value;
        if (c.error) { clip = null; if (c.rest) await windowsVoice(c.rest, rate, voiceName, my); return; }
        kept.push(c);
        await pcm(c, my);
        if (my !== gen) return;
        if (c.gapMs && !c.last) await Promise.race([sleep(c.gapMs), stopped]);
        if (c.last) { if (text) clip = { text, chunks: kept }; return; }
      }
    } finally {
      if (my === gen) stopNow = null;
      idle();
    }
  }
  // No open sound device while quiet, but not right after a line: the next line would resume a cold device, and
  // Windows (Bluetooth and USB outputs most) drops the first 50-300 ms after a resume, clipping the first syllable.
  let idleT = null;
  function idle() {
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (!stopNow && actx && actx.state === 'running') actx.suspend().catch(() => {}); }, 15000);
  }

  async function pcm(c, my) {
    const n = c.pcm ? c.pcm.byteLength >> 1 : 0;
    if (!n || my !== gen) return;
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') await actx.resume().catch(() => {});
    if (my !== gen) return;
    const buf = actx.createBuffer(1, n, c.rate || 24000);
    const ch = buf.getChannelData(0), dv = new DataView(c.pcm.buffer, c.pcm.byteOffset, n * 2);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    await new Promise((res) => {
      const guard = setTimeout(end, buf.duration * 1000 + 2000); // an ended event that never comes
      function end() { clearTimeout(guard); if (node === src) node = null; res(); }
      src.onended = end;
      node = src;
      src.start(actx.currentTime + 0.03); // a moment for a just-resumed device, so the first syllable is heard
    });
  }

  // Short, quiet tones (02_ux 2.4: 300 ms or less, below 800 Hz, well under speech): 'open' = the microphone is on,
  // 'heard' = got it, now writing it down. Never in the browser demo; muted (HELPER_MUTE=1 too) the widget skips them.
  function earcon(kind) {
    if (demo()) return;
    try {
      if (!actx) actx = new AudioContext();
      actx.resume().catch(() => {});
      const t0 = actx.currentTime + 0.02;
      (kind === 'heard' ? [392, 523] : [440]).forEach((f, i) => {
        const t = t0 + i * 0.12, o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + 0.12);
      });
      idle();
    } catch (_) {}
  }

  // Open the microphone by itself once a question has been said (the owner: "it automatically turns on microphone
  // when it asks us a question"). Only a choice or a typed answer: a confirm card needs a real click (R19) and a
  // 'done' step has the person busy on the screen. Never while muted (no voice, and no surprise microphone), never
  // twice, never after the question was cut short (Stop, Talk, an answer, Say it again: c.gen moved on).
  function autoListen(ask, c) {
    c = c || {};
    return !!ask && (ask.kind === 'choice' || ask.kind === 'text') && !ask.noAutoMic && !c.muted && !c.listening && !c.talking && !c.demo &&
      c.gen === c.genNow && c.enabled !== false;
  }

  // "Say it again" (UX 9.5): the last natural line once more, with no network call and a little slower (longer
  // pauses between sentences; never pitch-shifted). Null when that line was not in the natural voice.
  function replay(text) {
    if (!clip || clip.text !== text || demo()) return null;
    return play(clip.chunks.map((c) => Object.assign({}, c, { gapMs: c.last ? 0 : c.gapMs + 250 })));
  }

  function stopSpeaking() {
    gen++;
    if (hasTts()) speechSynthesis.cancel();
    if (node) { try { node.stop(); } catch (_) {} node = null; }
    if (stopNow) { stopNow(); stopNow = null; }
  }

  function voices() { return loadVoices().then((l) => l.map((v) => ({ name: v.name, lang: v.lang }))); }

  // Runnable check (no mic, no sound): Voice._selfTest() in a console -> true or throws.
  function selfTest() {
    const rate = 48000, blk = 2048;
    const noise = (a) => Float32Array.from({ length: blk }, () => (Math.random() * 2 - 1) * a);
    const tone = () => Float32Array.from({ length: blk }, (_, i) => 0.2 * Math.sin(i / 7));
    const vad = makeVad({ silenceMs: 1600, noSpeechMs: 8000 });
    let v;
    for (let i = 0; i < 20; i++) v = vad.push(noise(0.002), rate).verdict;      // ~0.85 s room noise
    if (v !== 'wait' || vad.started) throw new Error('noise counted as speech');
    for (let i = 0; i < 30; i++) vad.push(tone(), rate);                          // ~1.3 s voice
    if (!vad.started) throw new Error('speech not detected');
    let n = 0;
    do { v = vad.push(noise(0.002), rate).verdict; n++; } while (v === 'wait' && n < 200);
    const ms = (n * blk / rate) * 1000;
    if (v !== 'end' || ms < 1500 || ms > 1800) throw new Error('end-of-speech after ' + ms + ' ms');
    const quiet = makeVad({ noSpeechMs: 1000 });
    for (n = 0; n < 100 && v !== 'nospeech'; n++) v = quiet.push(noise(0.002), rate).verdict;
    if (v !== 'nospeech') throw new Error('no-speech not reported');
    const w = wav16(new Float32Array(48000), 48000);
    const dv = new DataView(w.buffer);
    if (w.length !== 44 + 32000 || dv.getUint32(24, true) !== 16000 || dv.getUint32(40, true) !== 32000) throw new Error('wav header');
    if (base64(new Uint8Array([82, 73, 70, 70])) !== 'UklGRg==') throw new Error('base64');
    return true;
  }

  window.Voice = { listen, finish, cancel, speak, play, replay, stopSpeaking, voices, earcon, autoListen, _selfTest: selfTest, _makeVad: makeVad };
})();
