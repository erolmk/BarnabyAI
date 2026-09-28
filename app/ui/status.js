// What Barnaby is doing, in plain words, for every window: the widget's status card, the collapsed pill and the
// launcher's Talk button all read the same words from here (UX 6.10: status is never silent).
// Input: the ui.status payload {state, label?, detail?, step?, totalSteps?, plan?:[{text, state}], effort?}.
// Works as a browser script (window.BarnabyStatus) and as a Node module (test/main_logic.test.js).
(function (root) {
  'use strict';
  const STATES = {
    // state: [icon, word (short, above the label), sentence (when there is no label), pill word]
    idle: ['talk', '', 'Ready when you are', ''],
    listening: ['talk', 'Listening', 'I’m listening…', 'Listening…'],
    thinking: ['think', 'Thinking', 'Thinking…', 'Thinking…'],
    looking: ['eye', 'Looking', 'Looking at your screen…', 'Looking…'],
    acting: ['pointer', 'Doing a step', 'Working on it…', 'Working…'],
    running: ['support', 'Running a check', 'Running a check on your computer…', 'Working…'],
    waiting: ['person', 'Your turn', 'Your turn', 'Your turn'],
    speaking: ['speaker', 'Talking', 'Talking…', 'Talking…'],
  };
  const BUSY = { thinking: 1, looking: 1, acting: 1, running: 1 };
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // At most `max` plan steps in view, around the current one; the rest are counted ("2 steps done", "3 more").
  function planWindow(plan, max) {
    max = max || 6;
    const p = (Array.isArray(plan) ? plan : []).filter((s) => s && clean(s.text))
      .map((s, i) => ({ n: i + 1, text: clean(s.text), state: s.state === 'done' || s.state === 'now' ? s.state : 'next' }));
    let now = p.findIndex((s) => s.state === 'now');
    if (now < 0) now = p.filter((s) => s.state === 'done').length;
    const start = p.length <= max ? 0 : Math.max(0, Math.min(now - 1, p.length - max));
    const items = p.slice(start, start + max);
    return { items, before: start, after: p.length - start - items.length };
  }

  function view(st, name) {
    st = st && typeof st === 'object' ? st : {};
    name = name || 'Barnaby';
    const state = STATES[st.state] ? st.state : 'idle';
    const [icon, word0, sentence0, pill] = STATES[state];
    const careful = state === 'thinking' && st.effort === 'high';
    const word = careful ? 'Thinking carefully' : word0;
    const sentence = careful ? 'Thinking carefully…' : sentence0;
    const step = +st.step > 0 ? 'Step ' + (+st.step) + (+st.totalSteps >= +st.step ? ' of ' + (+st.totalSteps) : '') : '';
    const label = clean(st.label);
    const title = label || sentence;
    // The small line above the title: what kind of thing is happening and where we are (never repeats the title).
    // (a step being done is said by "Step 2 of 5" alone)
    const showWord = label && word && word + '…' !== label && word !== label && !(state === 'acting' && step);
    const kicker = [showWord ? word : '', step].filter(Boolean).join(' · ');
    const busy = !!BUSY[state];
    const sub = state === 'idle' ? '' : state === 'waiting' ? 'Your turn: ' + name + ' is waiting for you'
      : state === 'listening' ? '' : name + ' is ' + ({ thinking: careful ? 'thinking carefully' : 'thinking', looking: 'looking at your screen',
        acting: 'working', running: 'running a check', speaking: 'talking' })[state] + (step ? ' · ' + step : '…');
    return { state, icon, word, title, kicker, detail: clean(st.detail), step, careful, busy, pill, launcherSub: sub,
      plan: planWindow(st.plan) };
  }

  const api = { view, planWindow, STATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BarnabyStatus = api;
})(typeof window !== 'undefined' ? window : this);
