// ui/voice.js under Node (no microphone, no sound): the end-of-speech detector, the auto-microphone rule and the
// earcon's demo guard. The vm window has no helper, so voice.js is in demo mode and never touches an AudioContext.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let made = 0; // AudioContexts created: the demo guard must keep it at 0
function load() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'ui', 'voice.js'), 'utf8'),
    { window, navigator: {}, URL, Blob, btoa, setTimeout, clearTimeout, AudioContext: class { constructor() { made++; } } });
  return window.Voice;
}
const V = load();

test('voice.js self-test passes under Node (noise, speech, end of speech, no speech, WAV header, base64)', () => {
  assert.equal(V._selfTest(), true);
});

test('end of speech: a 1.0 s silence setting (choice answers) ends about 1 s after the voice stops', () => {
  const rate = 48000, blk = 2048, blkMs = blk / rate * 1000;
  const noise = () => Float32Array.from({ length: blk }, () => (Math.random() * 2 - 1) * 0.002);
  const tone = () => Float32Array.from({ length: blk }, (_, i) => 0.2 * Math.sin(i / 7));
  const vad = V._makeVad({ silenceMs: 1000 });
  for (let i = 0; i < 20; i++) assert.equal(vad.push(noise(), rate).verdict, 'wait');
  for (let i = 0; i < 30; i++) vad.push(tone(), rate);
  assert.ok(vad.started);
  let n = 0, v;
  do { v = vad.push(noise(), rate).verdict; n++; } while (v === 'wait' && n < 200);
  const ms = n * blkMs;
  assert.equal(v, 'end');
  assert.ok(ms >= 950 && ms <= 1150, 'ended ' + ms + ' ms after the voice stopped');
});

test('auto microphone: only after a choice or text question was fully said, never muted, twice, in the demo or after Stop', () => {
  const ok = { muted: false, listening: false, talking: false, demo: false, gen: 3, genNow: 3 };
  assert.equal(V.autoListen({ kind: 'choice' }, ok), true);
  assert.equal(V.autoListen({ kind: 'text' }, ok), true);
  for (const kind of ['confirm', 'done']) assert.equal(V.autoListen({ kind }, ok), false, kind + ' needs a click / the person is busy');
  assert.equal(V.autoListen(null, ok), false);
  for (const k of ['muted', 'listening', 'talking', 'demo']) assert.equal(V.autoListen({ kind: 'choice' }, { ...ok, [k]: true }), false, k);
  assert.equal(V.autoListen({ kind: 'choice' }, { ...ok, enabled: false }), false, 'settings.autoListen false turns it off');
  assert.equal(V.autoListen({ kind: 'choice' }, { ...ok, genNow: 4 }), false, 'cut short (Stop, Talk, an answer, Say it again)');
  assert.equal(V.autoListen({ kind: 'choice', noAutoMic: true }, ok), false, 'main own questions (close the scam page, quit) wait for Talk');
});

test('earcons exist and do nothing in the demo (no AudioContext is ever made)', () => {
  assert.equal(typeof V.earcon, 'function');
  assert.doesNotThrow(() => { V.earcon('heard'); V.earcon('open'); });
  assert.equal(made, 0);
});
