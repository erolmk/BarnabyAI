// Helper widget: collapsed "Help" pill / expanded panel (UX 11.2, 11.3, 9.x), docked as the right third of the
// screen or floating in a corner. Talks to main only through window.helper (preload). In a normal browser
// ?demo=collapsed|busy|chat|choice|confirm|text|listening|thinking|looking|plan|running shows a scripted state
// (&docked=440 previews the docked panel at that width); the microphone and the voice are never used in demo mode.
(function () {
  'use strict';
  if (!window.helper) window.helper = pageStub();
  const H = window.helper;
  const DEMO = !!H.isDemo;
  const V = window.Voice;
  const $ = (id) => document.getElementById(id);
  const P = H.product || {};
  const NAME = P.assistantName || P.name || 'your helper';
  const q = new URLSearchParams(location.search);

  // ---------- settings ----------
  let settings = { muted: false, speechRate: 0.9, voiceName: '', textScale: 1 };
  function applySettings(s) {
    Object.assign(settings, s || {});
    const scale = Number(q.get('scale')) || Number(settings.textScale) || 1;
    document.documentElement.style.setProperty('--ui-scale', String(Math.max(1, Math.min(1.6, scale))));
    if ((q.get('theme') || settings.theme) === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    renderSpeed();
    fitCompact();
  }
  // Speaking speed, one press away (the owner: "a toggle to speaking speed"). Same steps as Settings.
  const SPEEDS = [0.8, 0.9, 1.0]; // Slower, Normal, Faster: same list in settings.js (test/setup.test.js checks)
  const speedIdx = (r) => { r = +r || 0.9; return r < 0.85 ? 0 : r > 0.95 ? 2 : 1; }; // a rate set by voice (0.7, 1.1) shows as its nearest step
  const SPEED_SAID = ['All right, I’ll talk more slowly.', 'All right, back to my normal speed.', 'All right, I’ll talk a little faster.'];
  function renderSpeed() {
    const row = $('speedRow');
    if (!row) return;
    row.hidden = !!settings.muted; // no voice, nothing to pace
    const i = speedIdx(settings.speechRate);
    row.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  }
  function setSpeed(i) {
    settings.speechRate = SPEEDS[i];
    renderSpeed();
    // said after the save, so it is already at the new pace, in the natural voice
    Promise.resolve(H.saveSettings({ speechRate: SPEEDS[i] })).then(() => sayOwn(SPEED_SAID[i])).catch(() => {});
  }
  // Big text in a short window: drop the "More below" row (the wide scrollbar and the wheel remain) so the
  // words keep their room. ponytail: fixed thresholds; the real fix is main sizing the window by textScale.
  function fitCompact() {
    const scale = Number(document.documentElement.style.getPropertyValue('--ui-scale')) || 1;
    document.body.classList.toggle('compact', scale >= 1.3 || window.innerHeight < 600);
  }
  window.addEventListener('resize', fitCompact);
  applySettings({});
  Promise.resolve().then(() => H.getSettings()).then(applySettings).catch(() => {});

  // ---------- 600 ms double-activation guard (UX 4.2) ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, [role="button"]');
    if (!b) return;
    const now = Date.now();
    if (now - (b._lastClick || 0) < 600) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b._lastClick = now;
  }, true);

  // ---------- expanded / collapsed / docked ----------
  let expanded = false;
  function setExpanded(b, docked) {
    expanded = !!b;
    document.body.classList.toggle('expanded', expanded);
    document.body.classList.toggle('collapsed', !expanded);
    if (docked !== undefined) document.body.classList.toggle('docked', !!docked);
    if (expanded) requestAnimationFrame(updateMore);
  }
  function expand(b) { H.widget.expand(b); if (DEMO) setExpanded(b); }

  // ---------- status: what Barnaby is doing, always on screen (card + plan in the panel, a word on the pill) ----------
  const S = window.BarnabyStatus;
  let mainStatus = { state: 'idle' };
  let localStatus = null; // the widget's own: listening, writing down what was said
  let looked = false; // screenshots were taken during this task: the eye note stays until he is idle (04_safety 7.2)
  const ICON = (name) => (window.icon ? window.icon(name) : '');
  function renderStatus() {
    const v = S.view(localStatus || mainStatus, NAME);
    if (v.state === 'looking') looked = true;
    if (v.state === 'idle') looked = false;
    const card = $('statusCard');
    card.dataset.state = v.state;
    card.classList.toggle('busy', v.busy);
    if (card._icon !== v.icon) { $('stIcon').innerHTML = ICON(v.icon); card._icon = v.icon; }
    $('stKicker').textContent = v.kicker;
    $('stKicker').hidden = !v.kicker;
    $('status').textContent = v.title;
    $('stDetail').textContent = v.detail;
    $('stDetail').hidden = !v.detail;
    $('eye').hidden = !(looked && v.state !== 'idle' && v.state !== 'looking'); // 'looking' says it in the card
    // The big "please wait" sign (the owner: "big thinking indicator ... animated"): whenever he is working and
    // nothing is asked of the person. Outside the scroll area, so it is always in view.
    const noWait = !v.busy || !!openAsk || listening;
    if ($('thinkBig').hidden !== noWait) { // the card changes height: keep the newest line in view
      $('thinkBig').hidden = noWait;
      if (!openAsk) requestAnimationFrame(showNewest);
    }
    renderPlan(S.planWindow((localStatus || mainStatus).plan, window.innerHeight < 800 ? 4 : 6)); // short screens: fewer rows
    const pill = $('pill');
    pill.dataset.state = v.state;
    pill.classList.toggle('has-state', !!v.pill);
    pill.classList.toggle('busy', v.busy);
    $('pillWord').textContent = v.pill;
    $('pillState').hidden = !v.pill;
    pill.setAttribute('aria-label', 'Help from ' + NAME + (v.pill ? '. ' + v.pill : ''));
    updateMore();
  }
  function renderPlan(pw) {
    const ol = $('plan');
    ol.textContent = '';
    ol.hidden = !pw.items.length;
    const count = (t) => ol.append(mk('li', 'count', t));
    if (pw.before) count(pw.before === 1 ? '1 step done' : pw.before + ' steps done');
    for (const st of pw.items) {
      const li = mk('li', st.state);
      const mark = mk('span', 'mark');
      mark.setAttribute('aria-hidden', 'true');
      if (st.state === 'done') mark.innerHTML = ICON('check');
      else if (st.state === 'now') mark.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
      else mark.textContent = String(st.n);
      li.append(mark, mk('span', '', st.text), mk('span', 'sr-only', st.state === 'done' ? ' (done)' : st.state === 'now' ? ' (doing now)' : ''));
      ol.append(li);
    }
    if (pw.after) count(pw.after === 1 ? '1 more step after these' : pw.after + ' more steps after these');
  }
  function onStatus(st) { mainStatus = st || { state: 'idle' }; clearWait(); renderStatus(); }
  function setLocal(st) { localStatus = st || null; renderStatus(); }
  // Sent, waiting for main: "Thinking" at once instead of a flash of "Ready when you are", until main's own status,
  // a line or a question arrives (15 s at most).
  let waitT = null;
  function thinkNow() {
    setLocal({ state: 'thinking', wait: true });
    clearTimeout(waitT);
    waitT = setTimeout(clearWait, 15000);
  }
  function clearWait() { clearTimeout(waitT); if (localStatus && localStatus.wait) setLocal(null); }

  // ---------- captions: last helper line big, the item before it small, a later "You said" bubble below ----------
  const lines = []; // {who: 'helper'|'you', text, how?: 'said'|'typed'|'chose', pending?}
  function addLine(who, text, how) {
    const l = { who, text, how };
    lines.push(l);
    if (lines.length > 20) lines.shift();
    renderCaptions();
    return l;
  }
  function dropLine(l) { const i = lines.indexOf(l); if (i >= 0) { lines.splice(i, 1); renderCaptions(); } }
  function lastHelper() {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].who === 'helper') return i;
    return -1;
  }
  function renderCaptions() {
    const i = lastHelper();
    const before = i > 0 ? lines[i - 1] : null;
    const after = lines.length - 1 > i ? lines[lines.length - 1] : null;
    const youBefore = before && before.who === 'you' ? before : null;
    $('prevLine').textContent = before && !youBefore ? before.text : '';
    $('prevLine').hidden = !before || !!youBefore || !!openAsk;
    $('curLine').textContent = i >= 0 ? lines[i].text : 'Press Talk, or type below, whenever you would like help.';
    // His own words in a bubble of their own: a bold "You said" label, then the words as he said them (no quotes).
    // Newest: below Barnaby's line; once Barnaby answers, it stays just above the answer.
    bubble($('youBefore'), openAsk ? null : youBefore);
    bubble($('youSaid'), after);
    const legend = document.querySelector('#answers .legend');
    if (legend) legend.hidden = i >= 0 && lines[i].text.trim() === legend.textContent.trim();
    if (!openAsk) showNewest();
    updateMore();
  }
  function bubble(el, l) {
    el.hidden = !l;
    if (!l) return;
    el.querySelector('.you-how span').textContent = 'You ' + (l.how || 'said');
    el.querySelector('.you-text').textContent = l.text;
    el.classList.toggle('pending', !!l.pending);
  }
  // The newest line is always in view (instant, no animation); a line taller than the view shows its start.
  function showNewest() {
    const m = $('middle'), mr = m.getBoundingClientRect();
    const el = $('youSaid').hidden ? $('curLine') : $('youSaid');
    const r = el.getBoundingClientRect();
    if (r.height > mr.height || r.top < mr.top) m.scrollTop += r.top - mr.top - 8;
    else if (r.bottom > mr.bottom) m.scrollTop += r.bottom - mr.bottom + 8;
  }

  // ---------- speech queue: lines are captioned and spoken in order; main gets spoken(id) after each ----------
  // A `natural` line is in Barnaby's natural voice: main sends its sentences over 'tts' as they are made (often
  // before the line's turn), and they wait here in ttsLines until then.
  const queue = [];
  const ttsLines = new Map(); // id -> {items: [{pcm, rate, gapMs, last} | {error, rest}], wake}
  let pumping = false;
  function onTts(c) {
    const b = c && ttsLines.get(c.id);
    if (!b) return; // a line already finished or stopped
    b.items.push(c);
    if (b.wake) { b.wake(); b.wake = null; }
  }
  async function* sentences(b) {
    for (let i = 0; ; i++) {
      while (i >= b.items.length) await new Promise((r) => { b.wake = r; });
      yield b.items[i];
      if (b.items[i].error || b.items[i].last) return;
    }
  }
  function ack(s) { ttsLines.delete(s.id); if (s.id != null) H.spoken(s.id); }
  let hushGen = 0; // hush() bumps it: a line that ends with it changed was cut short, not finished
  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const s = queue.shift();
      if (!s.again) addLine('helper', s.text); // "Say it again": the caption is already there
      const g = hushGen;
      let spoke = false;
      if (s.speak && !settings.muted && !DEMO && V && !listening) { // never talk into our own open microphone
        const opts = { text: s.text, rate: settings.speechRate, voiceName: settings.voiceName };
        const b = s.natural && V.play && ttsLines.get(s.id);
        await (b ? V.play(sentences(b), opts) : V.speak(s.text, opts)).catch(() => {});
        spoke = true;
      }
      ack(s); // after the last sentence (main then stops making any more of this line)
      // The question has been said to the end: open the microphone for the answer (UX 9.2's quiet no-speech close).
      if (spoke && openAsk && s.id != null && openAsk.sayId === s.id && V.autoListen &&
        V.autoListen(openAsk, { muted: settings.muted, listening, talking, demo: DEMO, gen: g, genNow: hushGen, enabled: settings.autoListen })) talk({ auto: true });
    }
    pumping = false;
  }
  function onSay(s) {
    if (!s || !String(s.text || '').trim()) { if (s && s.id != null) H.spoken(s.id); return; }
    // A new line never lands silently in an open microphone nobody has spoken into yet (the auto one): close it.
    if (autoMic && listening && !heardNow) { talkGen++; V.cancel(); listening = false; renderListening(); }
    if (s.id != null) clearWait();
    queue.push({ id: s.id, text: String(s.text).trim(), speak: s.speak !== false, natural: !!s.natural, again: !!s.again });
    if (s.natural && s.id != null) ttsLines.set(s.id, { items: [], wake: null });
    pump();
  }
  function say(text, speak) { onSay({ id: null, text, speak: !!speak }); } // our own lines (no ack)
  // Our own spoken lines go through main, so they are in Barnaby's natural voice too (not the computer's own).
  function sayOwn(text, o) { if (H.sayLine) H.sayLine(text, o); else say(text, true); }
  // Barge-in / Stop: silence now; queued lines still get their caption and their ack.
  function hush() {
    hushGen++;
    if (V) V.stopSpeaking();
    while (queue.length) {
      const s = queue.shift();
      if (!s.again) addLine('helper', s.text);
      ack(s);
    }
  }

  // ---------- questions ----------
  let openAsk = null;
  function mk(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function choiceBtn(label, value, cls) {
    const b = mk('button', cls || '', label);
    b.type = 'button';
    b.addEventListener('click', () => answer(value, label));
    return b;
  }

  function onAsk(a) {
    if (!a || !a.requestId) return;
    openAsk = a;
    const box = $('answers');
    box.textContent = '';
    box.classList.remove('two');
    const choices = (Array.isArray(a.choices) ? a.choices : []).map(String).filter((c) => c.trim());
    let kind = a.kind || 'choice';
    if (kind === 'choice' && !choices.length) kind = 'text';

    if (kind === 'confirm') {
      const d = a.details || {};
      const title = mk('h2', 'card-title', d.title || a.question || 'Is everything right?');
      title.id = 'cardTitle';
      title.tabIndex = -1;
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
      const dl = mk('dl', scale < 1.3 && window.innerWidth >= 520 ? 'fields side' : 'fields'); // narrow docked panel: label above value
      for (const f of Array.isArray(d.fields) ? d.fields : []) {
        const row = mk('div', 'field');
        row.append(mk('dt', '', String(f.label || '')),
          mk('dd', '', Array.isArray(f.value) ? f.value.join(', ') : String(f.value == null ? '' : f.value)));
        dl.append(row);
      }
      box.append(title);
      if (dl.children.length) box.append(dl);
    } else {
      if (a.question) box.append(mk('p', 'legend', a.question));
      if (kind === 'text') {
        const lab = mk('label', '', 'Type your answer');
        lab.htmlFor = 'answerInput';
        const inp = mk('input');
        inp.id = 'answerInput';
        inp.type = 'text';
        inp.autocomplete = 'off';
        const note = mk('p', 'note', '');
        note.hidden = true;
        const ok = mk('button', 'primary', 'OK, that’s my answer');
        ok.type = 'button';
        const send = () => {
          const v = inp.value.trim();
          if (!v) { note.textContent = 'Type your answer in the box first, or press Talk and say it.'; note.hidden = false; inp.focus(); return; }
          answer(v, v);
        };
        ok.addEventListener('click', send);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        const wrap = mk('div');
        wrap.append(lab, inp);
        box.append(wrap, note, ok, choiceBtn('I’m not sure', 'I’m not sure'));
      } else if (kind === 'done') {
        if (choices.length) choices.forEach((c, i) => box.append(choiceBtn(c, c, i === 0 ? 'primary' : '')));
        else box.append(choiceBtn('I did it', 'done', 'primary'));
      } else {
        // Short answers sit two to a row so more of them fit without scrolling.
        const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
        const two = choices.length >= 2 && choices.every((c) => c.length <= Math.floor(12 / scale));
        box.classList.toggle('two', two);
        choices.forEach((c) => box.append(choiceBtn(c, c)));
        if (!choices.some((c) => /not sure/i.test(c))) {
          box.append(choiceBtn('I’m not sure', 'I’m not sure', choices.length % 2 ? '' : 'full'));
        }
      }
    }
    box.hidden = false;
    document.body.classList.add('asking');
    $('typeBox').hidden = true;
    $('smallBtn').hidden = $('smallBtn2').hidden = true; // never shrink away from an open question (UX 11.2)
    $('confirmRow').hidden = kind !== 'confirm';
    clearWait();
    renderStatus(); // the big "please wait" sign gives way to the question
    renderCaptions();
    const title = kind === 'confirm' ? $('cardTitle') : null;
    requestAnimationFrame(() => {
      const m = $('middle');
      m.scrollTop = 0;
      if (title) { // the card starts at the top of the view; the spoken summary stays just above it
        m.scrollTop = title.getBoundingClientRect().top - m.getBoundingClientRect().top - 8;
        title.focus({ preventScroll: true });
      }
      updateMore();
    });
  }

  function closeAsk() {
    // An auto microphone belongs to this question: a click on an answer (or the question going away) ends it,
    // and talkGen drops what it heard, so it never goes to main as a new request.
    if (autoMic && listening) { talkGen++; V.cancel(); }
    openAsk = null;
    document.body.classList.remove('asking');
    $('answers').hidden = true;
    $('answers').textContent = '';
    $('typeBox').hidden = listening;
    $('smallBtn').hidden = $('smallBtn2').hidden = false;
    $('confirmRow').hidden = true;
    renderStatus();
    renderCaptions();
  }
  function onAskCancel(c) { if (openAsk && c && c.requestId === openAsk.requestId) closeAsk(); }

  function answer(value, shown) {
    if (!openAsk) return;
    const id = openAsk.requestId;
    closeAsk();
    hush();
    addLine('you', shown, 'chose');
    H.answer(id, value);
    thinkNow();
  }

  // ---------- talking ----------
  let listening = false, talking = false, smooth = 0, micShown = false;
  let talkGen = 0; // Stop / Home bump it so a transcription that finishes later is dropped, not sent
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The real cause when the recording could not be written down (main returns the connection's error kind);
  // then the computer's own, simpler listening takes over.
  const FAMILY = 'My connection needs your family helper’s attention, so I’ll listen the simpler way. Please say it once more.';
  const HEARD_FAIL = {
    offline: 'Your internet seems to be off, so I’ll listen the simpler way. Please say it once more.',
    auth: FAMILY, credit: FAMILY, nokey: FAMILY,
    rate: 'I’m very busy right now. Please say it once more.',
    timeout: 'My connection is very slow right now. Please say it once more.',
  };
  function setLevel(l) {
    smooth = Math.max(l, smooth * 0.85);
    $('meterFill').style.width = Math.round(smooth * 100) + '%';
  }
  function renderListening(offline) {
    $('listenRow').hidden = !listening;
    $('typeBox').hidden = listening || !!openAsk;
    $('meter').hidden = !!offline;
    $('talkBtn').classList.toggle('listening', listening);
    $('talkBtn').setAttribute('aria-pressed', String(listening));
    $('talkLabel').textContent = listening ? 'Done talking' : 'Talk to ' + NAME;
    if (!listening) { smooth = 0; $('meterFill').style.width = '0%'; }
    // A closed microphone keeps the "Please wait" of an answer just given (a cancelled auto mic closes after it).
    if (listening) setLocal({ state: 'listening' }); else if (!(localStatus && localStatus.wait)) setLocal(null);
    if (listening !== micShown && H.listening) { micShown = listening; H.listening(listening); } // launcher's Talk shows it too
    updateMore();
  }

  // How long a pause ends what he says: short for a one-word choice, longer for a sentence (UX 9.2 allows 1.0-3.0 s).
  // ponytail: fixed per context; UX 9.2's "+0.4 s after being cut off twice" is the upgrade.
  const END_MS = { choice: 1000, text: 1400, free: 1300 };
  let autoMic = false, heardNow = false; // the open microphone was opened by a question, and whether he has spoken yet
  // opt.auto: opened by itself after a question was said (quiet: no nagging lines if nobody speaks).
  async function talk(opt) {
    const auto = !!(opt && opt.auto === true);
    if (listening) { if (!auto) (DEMO ? demoMic : V).finish(); return; }
    if (talking) { if (!auto) say('One moment — I’m working out what you said.'); return; }
    talking = true;
    const my = talkGen;
    const askId = openAsk && openAsk.requestId; // what it hears belongs to this question only
    let pend = null; // the "You said" bubble, shown the moment he has been heard
    try {
      hush(); // barge-in: stop speaking first
      if (!settings.muted && !DEMO) V.earcon('open');
      await wait(300); // do not hear our own last word (and the tone is over before the microphone opens)
      if (my !== talkGen) return;
      listening = true;
      autoMic = auto; heardNow = false;
      renderListening();
      let rec = null;
      try {
        rec = await (DEMO ? demoMic : V).listen({ onLevel: setLevel, onState: (st) => { if (st === 'hearing') heardNow = true; },
          silenceMs: !openAsk ? END_MS.free : openAsk.kind === 'choice' && (openAsk.choices || []).length ? END_MS.choice : END_MS.text, noSpeechMs: 8000 });
      } catch (e) {
        listening = false;
        renderListening();
        if (auto) return; // he did not ask for it: the buttons are still there
        say('I can’t hear the microphone right now. You can type in the box instead.');
        $('typeInput').focus();
        return;
      }
      listening = false;
      renderListening();
      if (my !== talkGen) return;
      if (!rec) { if (!auto) say('Press Talk or F9 when you’re ready.'); return; } // an auto microphone closes quietly
      if (!settings.muted && !DEMO) V.earcon('heard');
      pend = addLine('you', 'Writing down what you said…', 'said');
      pend.pending = true;
      renderCaptions();
      setLocal({ state: 'thinking', label: 'Writing down what you said…' });
      let r = null;
      try { r = await H.transcribe(rec.wavBase64); } catch (_) { r = { error: 'transcribe' }; }
      if (!r || r.error) {
        say(HEARD_FAIL[r && r.error] || 'Sorry, I didn’t catch that — my fault. Please say it once more.');
        listening = true;
        renderListening(true);
        try { r = await H.listenOffline(); } catch (_) { r = null; }
        listening = false;
        renderListening();
      }
      if (!(localStatus && localStatus.wait)) setLocal(null); // a button answered meanwhile: its "Please wait" stays
      if (my !== talkGen) return;
      if (askId && (!openAsk || openAsk.requestId !== askId)) return; // that question was answered or went away: drop it
      const text = String((r && r.text) || '').trim();
      if (!text) { sayOwn('I didn’t catch that — my fault. Could you say it again, or press a button?'); return; }
      pend.text = text; // the bubble now holds his words
      delete pend.pending;
      pend = null;
      renderCaptions();
      if (openAsk) { const id = openAsk.requestId; closeAsk(); H.answer(id, text); } else H.ask(text);
      thinkNow();
    } finally {
      if (pend) dropLine(pend); // nothing was written down (or Stop): no empty bubble stays
      talking = false;
      autoMic = false;
      if (!listening && !(localStatus && localStatus.wait)) setLocal(null);
    }
  }

  function typed() {
    const inp = $('typeInput');
    const text = inp.value.trim();
    if (!text) { say('Type what you would like in the box first, or press Talk and say it.'); inp.focus(); return; }
    inp.value = '';
    if (openAsk) return answer(text, text);
    addLine('you', text, 'typed');
    H.ask(text);
    thinkNow();
  }

  function halt() {
    talkGen++;
    hush();
    if (listening) { (DEMO ? demoMic : V).cancel(); listening = false; renderListening(); }
  }
  function stopAll() { halt(); H.stop(); }

  // "Move me": bottom-right -> bottom-left -> top-left -> top-right (UX 4.4), no dragging needed.
  function moveMe() {
    const s = window.screen, M = 16;
    const w = window.outerWidth, h = window.outerHeight;
    const L = s.availLeft || 0, T = s.availTop || 0, R = L + s.availWidth, B = T + s.availHeight;
    const spots = [[R - w - M, B - h - M], [L + M, B - h - M], [L + M, T + M], [R - w - M, T + M]];
    let cur = 0, best = Infinity;
    spots.forEach((p, i) => {
      const d = Math.hypot(p[0] - window.screenX, p[1] - window.screenY);
      if (d < best) { best = d; cur = i; }
    });
    const next = spots[(cur + 1) % 4];
    H.widget.dragBy(next[0] - window.screenX, next[1] - window.screenY);
  }

  function sayAgain() {
    const i = lastHelper();
    if (i < 0) { say('I haven’t said anything yet. Press Talk when you would like help.'); return; }
    if (autoMic && listening && !heardNow) { talkGen++; V.cancel(); listening = false; renderListening(); } // an unused auto mic gives way
    if (settings.muted || DEMO || !V || listening) return; // the caption is already on screen
    hush();
    const again = V.replay && V.replay(lines[i].text); // the natural voice again, from memory
    if (again) again.catch(() => {});
    else if (H.sayLine) H.sayLine(lines[i].text, { again: true }); // cut short or not kept: main makes it again, a little slower
    else V.speak(lines[i].text, { rate: (Number(settings.speechRate) || 0.9) - 0.05, voiceName: settings.voiceName }).catch(() => {});
  }

  // ---------- "More below" (no tiny scrollbar as the only way down, UX 3.8) ----------
  function updateMore() {
    const m = $('middle'), btn = $('moreBtn');
    if (!expanded) return;
    const over = m.scrollHeight - m.clientHeight > 4 && !document.body.classList.contains('compact');
    if (btn.hidden === over) btn.hidden = !over;
    if (!over) return;
    const atEnd = m.scrollTop + m.clientHeight >= m.scrollHeight - 4;
    btn.classList.toggle('up', atEnd);
    $('moreLabel').textContent = atEnd ? 'Back to top' : 'More below';
  }
  function more() {
    const m = $('middle');
    if (m.scrollTop + m.clientHeight >= m.scrollHeight - 4) m.scrollTop = 0;
    else m.scrollTop += Math.round(m.clientHeight * 0.8);
    updateMore();
  }

  // ---------- wiring ----------
  $('pill').addEventListener('click', () => expand(true));
  $('smallBtn').addEventListener('click', () => expand(false));
  $('smallBtn2').addEventListener('click', () => expand(false));
  $('talkBtn').addEventListener('click', talk);
  $('typeBtn').addEventListener('click', typed);
  $('typeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') typed(); });
  $('againBtn').addEventListener('click', sayAgain);
  $('stopBtn').addEventListener('click', stopAll);
  $('homeBtn').addEventListener('click', () => { halt(); H.goHome(); if (DEMO) setExpanded(false); });
  $('moveBtn').addEventListener('click', moveMe);
  $('yesBtn').addEventListener('click', () => answer('yes', 'Yes, that’s right'));
  $('noBtn').addEventListener('click', () => answer('no', 'No, change something'));
  $('moreBtn').addEventListener('click', more);
  $('speedRow').querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => setSpeed(i)));
  $('middle').addEventListener('scroll', updateMore);
  // Next frame: showing the "More below" button resizes #middle, which inside the callback is a ResizeObserver loop.
  if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(updateMore)).observe($('middle'));

  const on = (ch, f) => { try { H.on(ch, f); } catch (_) {} };
  on('say', onSay);
  on('tts', onTts);
  on('status', onStatus);
  on('ask', onAsk);
  on('ask-cancel', onAskCancel);
  on('talk-toggle', talk);
  on('hush', halt); // Stop from anywhere (Ctrl+Alt+H, a spoken "stop", the tray): silence now, drop the microphone
  on('widget-state', (s) => setExpanded(s && s.expanded, s && s.docked));
  on('settings-changed', applySettings);

  document.title = NAME;
  $('whoName').textContent = NAME;
  $('pill').setAttribute('aria-label', 'Help from ' + NAME);
  $('panel').setAttribute('aria-label', NAME);
  renderListening();
  renderCaptions();
  renderStatus();

  // ---------- browser demo ----------
  // Fake microphone: moving level, never touches getUserMedia.
  const demoMic = {
    _end: null,
    listen({ onLevel }) {
      let t = 0;
      const iv = setInterval(() => { t++; onLevel(0.35 + 0.3 * Math.abs(Math.sin(t / 3)) + 0.15 * Math.sin(t * 1.7)); }, 80);
      return new Promise((res) => { demoMic._end = (keep) => { clearInterval(iv); demoMic._end = null; res(keep ? { wavBase64: '', durationMs: 2000 } : null); }; });
    },
    finish() { if (demoMic._end) demoMic._end(true); },
    cancel() { if (demoMic._end) demoMic._end(false); },
  };

  if (DEMO) {
    document.body.classList.add('demo');
    const dockW = Number(q.get('docked'));
    if (q.has('docked')) {
      document.body.classList.add('docked');
      if (dockW >= 300) document.documentElement.style.setProperty('--demo-dock-w', dockW + 'px');
    }
    const which = q.get('demo') || 'chat';
    // demo-stub.js auto-runs its own script of the same name at load + 600 ms; ours runs after it so this
    // page shows its own scripted state (and every stub event still flows through the real handlers).
    const clash = H._demo && Array.isArray(H._demo.scripts) && H._demo.scripts.includes(which);
    if (clash) window.addEventListener('load', () => setTimeout(() => runDemo(which), 700));
    else runDemo(which);
  }

  function runDemo(which) {
    if (!['collapsed', 'busy', 'chat', 'choice', 'text', 'confirm', 'listening', 'thinking', 'looking', 'plan', 'running'].includes(which)) return; // stub-only scenario
    const line = (text) => onSay({ id: null, text, speak: false });
    const PLAN = [{ text: 'Open Outlook', state: 'done' }, { text: 'Start a new email', state: 'done' },
      { text: 'Add the 2 photos', state: 'now' }, { text: 'Write a short note', state: 'next' }, { text: 'You press Send', state: 'next' }];
    if (which === 'collapsed' || which === 'busy') {
      setExpanded(false);
      line('Hello, Rose. I am ' + NAME + '. Press the big Talk button whenever you would like some help.');
      if (which === 'busy') onStatus({ state: 'thinking', effort: 'high' });
    } else if (which === 'thinking') {
      setExpanded(true);
      addLine('you', 'Why is my computer so slow in the mornings?', 'said');
      line('Good question. Let me think about that for a moment.');
      onStatus({ state: 'thinking', effort: 'high', detail: 'This one takes a little longer, so I’m checking my answer.' });
    } else if (which === 'looking') {
      setExpanded(true);
      addLine('you', 'Help me send Anne Marie the garden photos.', 'said');
      line('I’m having a look at your screen so I know where things are.');
      onStatus({ state: 'looking', step: 1, totalSteps: 5, plan: PLAN.map((p, i) => ({ text: p.text, state: i ? 'next' : 'now' })) });
    } else if (which === 'plan') {
      setExpanded(true);
      line('Step 3 of 5. I’m clicking the paper clip, “Attach file”, at the top — that adds your photos.');
      onStatus({ state: 'acting', step: 3, totalSteps: 5, label: 'Clicking “Attach file”', detail: 'That adds your photos to the email.', plan: PLAN });
    } else if (which === 'running') {
      setExpanded(true);
      addLine('you', 'My computer is so slow.', 'said');
      line('I’ll run a few checks. They only look; they don’t change anything.');
      onStatus({ state: 'running', label: 'Checking how busy your computer is', detail: 'This only looks. It changes nothing.', step: 2, totalSteps: 4,
        plan: [{ text: 'Check memory and disk', state: 'done' }, { text: 'See what is running', state: 'now' }, { text: 'Look at start-up programs', state: 'next' }, { text: 'Tell you what I found', state: 'next' }] });
    } else {
      setExpanded(true);
      line('I can help with that. It’s 5 steps: open your photos, pick them, save them, write the email, and send.');
      if (which === 'chat') {
        addLine('you', 'I want to send Anne Marie some photos from my iCloud.', 'said');
        line('Step 2 of 5. I’m clicking the blue “New mail” button, top left — that starts a new email.');
        onStatus({ state: 'acting', step: 2, totalSteps: 5 });
      } else if (which === 'choice') {
        onStatus({ state: 'waiting' });
        const qn = 'Which email do you use: Gmail, Outlook, AOL, or Yahoo?';
        line(qn);
        onAsk({ requestId: 'demo-choice', question: qn, choices: ['Gmail', 'Outlook', 'AOL', 'Yahoo'], kind: 'choice' });
      } else if (which === 'text') {
        onStatus({ state: 'waiting' });
        const qn = 'What would you like the note to say? Or I can write a short one for you.';
        line(qn);
        onAsk({ requestId: 'demo-text', question: qn, kind: 'text' });
      } else if (which === 'confirm') {
        onStatus({ state: 'waiting' });
        const qn = 'This will go to Anne Marie Kowalski, with 2 photos of the garden. Is everything right?';
        line(qn);
        onAsk({
          requestId: 'demo-confirm', question: qn, kind: 'confirm', choices: [],
          details: {
            title: 'Ready to send this email?',
            fields: [
              { label: 'To', value: 'Anne Marie Kowalski — annemarie.k@gmail.com' },
              { label: 'Subject', value: 'Photos from the garden party' },
              { label: 'Message', value: 'Hi Anne Marie,\n\nHere are the photos from the garden party on Sunday. The roses came out beautifully this year, and I thought of you when I took the second one.\n\nLove,\nRose' },
              { label: 'Photos', value: '2 photos: garden.jpg and roses.jpg' },
            ],
          },
        });
      } else if (which === 'listening') {
        onStatus({ state: 'idle' });
        talk();
      }
    }
  }

  // Minimal stand-in when ui/demo-stub.js is missing: renders, records calls, never speaks or listens.
  function pageStub() {
    const log = (n) => (...a) => { console.info('[demo] helper.' + n, ...a); return Promise.resolve(); };
    return {
      isDemo: true,
      product: {}, // the name lives only in src/product.js; demo-stub.js supplies it
      getSettings: () => Promise.resolve({ muted: true, speechRate: 0.9, textScale: 1, family: { name: 'Anna', phone: '5550142' } }),
      saveSettings: log('saveSettings'), ask: log('ask'), answer: log('answer'), stop: log('stop'), goHome: log('goHome'),
      transcribe: () => Promise.resolve({ text: 'Help me send some photos to Anne Marie.' }),
      listenOffline: () => Promise.resolve({ text: '' }), spoken: log('spoken'), overlayDismiss: log('overlayDismiss'),
      widget: { expand: log('widget.expand'), dragBy: log('widget.dragBy') },
      on: () => () => {},
    };
  }
})();
