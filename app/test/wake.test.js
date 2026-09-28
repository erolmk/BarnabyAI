const test = require('node:test');
const assert = require('node:assert');
const { startWakeLoop } = require('../src/wake');

const tick = () => new Promise((r) => setImmediate(r));

function fakeNative(script) {
  const calls = [];
  return {
    calls,
    async call(cmd, args) {
      calls.push(cmd);
      if (cmd === 'wake_cancel') return {};
      const next = script.shift();
      if (next instanceof Error) throw next;
      await tick();
      return next || { heard: false };
    },
  };
}

test('heard phrase while quiet -> onWake once', async () => {
  const native = fakeNative([{ heard: true, phrase: 'hello barnaby', confidence: 0.95 }]);
  const woke = [];
  const loop = startWakeLoop({ native, config: { get: () => ({ wakeWord: true }) }, isQuiet: () => true, onWake: (r) => woke.push(r.phrase), sleep: tick });
  for (let i = 0; i < 20; i++) await tick();
  loop.stop();
  assert.deepStrictEqual(woke.slice(0, 1), ['hello barnaby']);
});

test('setting off or busy -> never listens', async () => {
  const native = fakeNative([]);
  let quiet = false;
  const loop = startWakeLoop({ native, config: { get: () => ({ wakeWord: true }) }, isQuiet: () => quiet, onWake: () => assert.fail('woke'), sleep: tick });
  for (let i = 0; i < 10; i++) await tick();
  assert.ok(!native.calls.includes('wake_wait'), 'no listening while busy');
  loop.stop();
  const native2 = fakeNative([]);
  const loop2 = startWakeLoop({ native: native2, config: { get: () => ({ wakeWord: false }) }, isQuiet: () => true, onWake: () => assert.fail('woke'), sleep: tick });
  for (let i = 0; i < 10; i++) await tick();
  assert.ok(!native2.calls.includes('wake_wait'), 'no listening when turned off');
  loop2.stop();
  quiet = true;
});

test('heard, but Barnaby started talking meanwhile -> ignored', async () => {
  const native = fakeNative([{ heard: true, phrase: 'hello barnaby', confidence: 0.9 }]);
  let quiet = true;
  const loop = startWakeLoop({
    native, config: { get: () => ({ wakeWord: true }) },
    isQuiet: () => { const q = quiet; quiet = false; return q; }, // quiet when starting, busy when the result lands
    onWake: () => assert.fail('must not wake on its own voice'), sleep: tick,
  });
  for (let i = 0; i < 20; i++) await tick();
  loop.stop();
});

test('no microphone -> backs off instead of spinning', async () => {
  const native = fakeNative([new Error('no microphone: none'), new Error('no microphone: none')]);
  const slept = [];
  const loop = startWakeLoop({ native, config: { get: () => ({ wakeWord: true }) }, isQuiet: () => true, onWake: () => {}, sleep: (ms) => { slept.push(ms); return tick(); } });
  for (let i = 0; i < 12; i++) await tick();
  loop.stop();
  assert.ok(slept.includes(3000) && slept.includes(6000), 'growing back-off: ' + slept.join(','));
});
