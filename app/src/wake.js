// "Hello, Barnaby" wake loop. The native helper listens offline for a small fixed grammar (nothing leaves the
// computer); when it hears the phrase we open the Talk flow. Paused while Barnaby is busy, speaking or already
// listening, so his own voice ("I'm Barnaby...") can never wake him.
function startWakeLoop({ native, config, isQuiet, onWake, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let stopped = false;
  let failures = 0;

  (async () => {
    while (!stopped) {
      const s = config.get();
      if (!s.wakeWord || !isQuiet()) { await sleep(1500); continue; }
      let r;
      try {
        r = await native.call('wake_wait', { timeoutMs: 30000, minConfidence: s.wakeConfidence || 0.75 }, 40000);
        failures = 0;
      } catch (e) {
        failures++;
        log('[wake] ' + e.message);
        // No microphone / no recognizer: back off (up to 2 minutes) instead of spinning.
        await sleep(Math.min(120000, 3000 * failures));
        continue;
      }
      if (stopped) break;
      if (r && r.heard && isQuiet()) {
        log('[wake] heard "' + r.phrase + '" ' + Number(r.confidence).toFixed(2));
        try { onWake(r); } catch (e) { log('[wake] onWake failed ' + e.message); }
        await sleep(2000); // let the Talk flow take the microphone
      }
    }
  })();

  return {
    stop() { stopped = true; native.call('wake_cancel', {}, 3000).catch(() => {}); },
    // Call when the widget opens the microphone or Barnaby starts speaking.
    pause() { native.call('wake_cancel', {}, 3000).catch(() => {}); },
  };
}

module.exports = { startWakeLoop };
