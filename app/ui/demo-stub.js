// Browser demo stub for window.helper. Runs ONLY when a page is opened outside Electron (no preload).
// Mirrors preload.js exactly, with demo data for "Rose". Never makes a sound.
// Scenarios for reviewing other pages: add ?demo=<name> to the URL.
//   firstrun  -> settings with setupDone:false (the setup wizard)
//   noweather -> getWeather() returns null
//   task      -> a task runs: status steps, captions, a choice question
//   confirm   -> a confirm card (email To / Subject / Message / Photos)
//   listening -> the widget is listening
//   scam      -> overlay scam warning (overlay page)
//   highlight -> overlay teaching ring (overlay page)
// Console: helper._demo.emit(channel, payload) or helper._demo.run('task').
(function () {
  if (window.helper) return;

  // Belt and braces: the demo is always silent.
  try { if (window.speechSynthesis) window.speechSynthesis.speak = function () {}; } catch (_) {}
  try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (_) {}

  const params = new URLSearchParams(location.search);
  const scenario = params.get('demo') || '';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b || {})) out[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
    return out;
  };
  const daysAgo = (n, h) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h || 10, 15, 0, 0); return d.toISOString(); };

  const product = {
    name: 'Barnaby', assistantName: 'Barnaby', tagline: 'Help that never hurries.',
    descriptor: 'Your patient computer helper. He does it with you and shows you how.',
    trustLine: 'Barnaby will never phone you, never ask for money, and never ask for gift cards.',
    website: 'https://hellobarnaby.com', version: '0.1.0-demo',
  };

  let settings = {
    userName: 'Rose', apiKey: '********', hasApiKey: true,
    brainModel: 'deepseek/deepseek-v4.1-flash', fallbackModel: '', thinking: 'auto',
    providers: { order: ['phala', 'fireworks', 'together', 'baseten/fp8', 'deepinfra/fp8'], only: ['phala', 'fireworks', 'together', 'baseten/fp8', 'deepinfra/fp8'],
      allow_fallbacks: true, zdr: true, data_collection: 'deny', require_parameters: true },
    dockPanel: true, allowCommands: true,
    sttModel: 'google/gemini-3.1-flash-lite', jevModel: '~typesafe/jev-latest',
    ttsVoice: 'en-US-Ethan:MAI-Voice-2', voiceName: '', speechRate: 0.9, muted: false, textScale: 1.0, mode: 'do',
    email: { provider: 'outlook', address: 'rose.kowalski@outlook.com' },
    photos: { provider: 'icloud' },
    video: { provider: 'zoom' },
    contacts: [
      { name: 'Sarah', relation: 'Daughter', email: 'sarah.kowalski@gmail.com', phone: '555-201-4477' },
      { name: 'Anne Marie Kowalski', relation: 'Friend', email: 'annemarie.k@gmail.com', phone: '555-318-9021' },
    ],
    family: { name: 'Sarah', phone: '555-201-4477', email: 'sarah.kowalski@gmail.com', ntfyTopic: 'rose-kowalski-4821' },
    tiles: ['email', 'photos', 'video', 'internet', 'family', 'lessons', 'scam', 'support', 'games'],
    city: 'Springfield', startAtLogin: true, scamShield: true, taskCostCapUsd: 0.25, maxSteps: 40,
    setupDone: true,
  };
  if (scenario === 'firstrun') {
    settings = merge(settings, { userName: '', apiKey: '', hasApiKey: false, setupDone: false, city: '',
      email: { provider: '', address: '' }, photos: { provider: '' }, video: { provider: '' },
      family: { name: '', phone: '', email: '', ntfyTopic: '' }, startAtLogin: false });
    settings.contacts = [];
  }
  const ts = parseFloat(params.get('scale'));
  if (ts >= 1 && ts <= 1.6) settings.textScale = ts;

  let lessons = [
    { id: 'send-photos-to-anne-marie-a1b2c3', title: 'Send photos to Anne Marie', created: daysAgo(1, 15),
      utterance: 'I want to send my friend Anne Marie some photos from my iCloud.', mode: 'together',
      needs: ['Your iCloud photos', 'Outlook', "Anne Marie's email address"],
      alsoFor: 'Sending a document: the same steps, but pick the document in step 3.',
      steps: [
        { text: 'Open your photos: click **"Photos"** on the home screen.', see: 'Your iCloud photos open, newest at the top.', by: 'barnaby' },
        { text: 'Type your Apple password in the box with the ring around it.', see: 'Your photos appear.', by: 'you' },
        { text: 'Click a photo you would like to send.', see: 'It gets a blue tick in the corner.', by: 'you' },
        { text: 'Click the **"Download"** button at the top right. It saves the photo onto this computer.', see: 'The photo is in your Downloads folder.', by: 'barnaby' },
        { text: 'In Outlook, click the blue **"New mail"** button at the top left.', see: 'An empty email opens on the right.', by: 'barnaby' },
        { text: 'Click the paper clip, **"Attach file"**, and pick the photo.', see: 'The photo shows under the subject line.', by: 'barnaby' },
        { text: 'Press the blue **"Send"** button at the top left.', see: 'The email moves to "Sent Items".', by: 'you' },
      ] },
    { id: 'make-text-bigger-d4e5f6', title: 'Make the words on the screen bigger', created: daysAgo(4, 11),
      utterance: 'The letters are too small', mode: 'teach',
      steps: [
        { text: 'Hold down the **Ctrl** key, bottom left of the keyboard.', see: 'Nothing changes yet.', by: 'you' },
        { text: 'While holding it, press the **+** key once or twice.', see: 'Everything on the page gets bigger.', by: 'you' },
        { text: 'To go back, hold **Ctrl** and press **0** (zero).', see: 'The page is its normal size again.', by: 'you' },
      ] },
    { id: 'join-zoom-with-sarah-g7h8i9', title: 'Join a Zoom call with Sarah', created: daysAgo(9, 17),
      utterance: 'Sarah sent me a Zoom link', mode: 'together',
      steps: [
        { text: 'Open your email and find the message from **Sarah**.', see: 'Her email opens.', by: 'barnaby' },
        { text: 'Click the blue link that starts with **"zoom.us"**.', see: 'A page opens and asks to open Zoom.', by: 'you' },
        { text: 'Click **"Open Zoom Meetings"**.', see: 'Zoom starts and shows your camera.', by: 'barnaby' },
        { text: 'Click **"Join with Computer Audio"**.', see: 'Sarah can hear you now.', by: 'you' },
      ] },
  ];

  const subs = {};
  const CHANNELS = ['say', 'status', 'ask', 'ask-cancel', 'overlay', 'lesson-saved',
    'settings-changed', 'task-done', 'talk-toggle', 'widget-state', 'hush', 'tts'];
  let seq = 0, openAsk = null, expanded = false;
  const timers = [];
  function emit(ch, payload) { (subs[ch] || []).slice().forEach((cb) => { try { cb(clone(payload)); } catch (e) { console.warn(e); } }); }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearScript() { while (timers.length) clearTimeout(timers.pop()); }
  function say(text) { emit('say', { id: ++seq, text, speak: false }); }
  function status(state, extra) { emit('status', Object.assign({ state }, extra || {})); }
  function ask(question, choices, kind, details) {
    openAsk = 'q' + (++seq);
    if (!expanded) { expanded = true; emit('widget-state', { expanded: true }); }
    say(question);
    emit('ask', { requestId: openAsk, question, choices: choices || [], kind: kind || 'choice', details: details || null });
  }
  function pub() { return clone(settings); }

  const SCRIPTS = {
    listening() { status('listening'); },
    reply(text) {
      status('thinking');
      later(900, () => { say(text); status('idle'); });
    },
    task() {
      const plan = (now) => ['Open your photos', 'Pick the photos', 'Save them', 'Write the email', 'You press Send']
        .map((text, i) => ({ text, state: i < now ? 'done' : i === now ? 'now' : 'next' }));
      status('thinking', { effort: 'high' });
      later(700, () => say("I can help with that. It's 5 steps. I'll do the fiddly bits and show you each one."));
      later(1400, () => status('acting', { step: 1, totalSteps: 5, label: 'Opening your photos', plan: plan(0) }));
      later(2000, () => say("Step 1 of 5. I'm opening the iCloud website - that's where your iPhone photos are kept."));
      later(2800, () => { status('waiting', { step: 2, totalSteps: 5, label: 'Pick the photos', plan: plan(1) });
        ask('Which email do you use: Gmail, Outlook, AOL, or Yahoo?', ['Gmail', 'Outlook', 'AOL', 'Yahoo', "I'm not sure"]); });
    },
    confirm() {
      status('waiting', { step: 4, totalSteps: 5, label: 'Check the email' });
      ask('Is everything right?', ["Yes, that's right", 'No, change something'], 'confirm', {
        title: 'Ready to send this email?',
        fields: [
          { label: 'To', value: 'Anne Marie Kowalski (annemarie.k@gmail.com)' },
          { label: 'Subject', value: 'Photos from the garden party' },
          { label: 'Message', value: 'Hi Anne Marie, here are the photos from the garden party. Love, Rose.' },
          { label: 'Photos', value: '1 photo: the garden' },
        ] });
    },
    scam() {
      emit('overlay', { type: 'warning', level: 'scam', title: 'Stop. This looks like a trick.',
        body: 'This page says your computer has a virus and shows a phone number. Microsoft never does that. Your computer is fine.' });
    },
    highlight() {
      emit('overlay', { type: 'highlight', rect: [220, 160, 180, 64], label: 'Click "New mail"', arrow: true });
    },
  };
  function run(name, arg) { clearScript(); if (SCRIPTS[name]) SCRIPTS[name](arg); }

  window.helper = {
    product,
    isDemo: true,
    getSettings: () => Promise.resolve(pub()),
    saveSettings: (patch) => {
      const p = Object.assign({}, patch || {});
      if (p.apiKey === '********') delete p.apiKey;
      if (typeof p.apiKey === 'string') { p.hasApiKey = !!p.apiKey; p.apiKey = p.apiKey ? '********' : ''; }
      settings = merge(settings, p);
      emit('settings-changed', pub());
      return Promise.resolve(pub());
    },
    ask: (text) => {
      text = String(text || '').trim();
      if (text && openAsk) { helper.answer(openAsk, text); return Promise.resolve(true); }
      if (text) run('reply', 'All right. In the real app I would help with: ' + text + '.');
      return Promise.resolve(true);
    },
    answer: (requestId, value) => {
      if (!openAsk || (requestId && requestId !== openAsk)) return;
      emit('ask-cancel', { requestId: openAsk });
      openAsk = null;
      status('thinking');
      later(700, () => { say(value === 'no' ? 'All right. Nothing was sent.' : 'Thank you. ' + (value === 'yes' ? 'I will carry on.' : 'You chose ' + value + '.')); status('idle'); });
    },
    stop: () => { clearScript(); if (openAsk) { emit('ask-cancel', { requestId: openAsk }); openAsk = null; } status('idle'); say('Okay, I stopped.'); },
    goHome: () => { clearScript(); status('idle'); expanded = false; emit('widget-state', { expanded: false }); },
    openTile: (id, arg) => {
      console.info('[demo] openTile', id, arg || '');
      if (id === 'talk') { emit('talk-toggle', {}); run('listening'); later(3000, () => run('reply', 'I heard you. In the real app I would help you now.')); }
      else if (id === 'family' && arg) run('reply', (arg.action === 'video' ? 'I can help you make a video call with ' : 'I can help you send an email to ') + arg.name + '.');
      else if (id === 'support') ask('What seems to be the trouble?', ['It is slow', 'No sound', 'The internet is not working', 'The printer', 'Something else']);
      else if (id === 'scam') run('reply', "Let me look at what's on your screen. This only looks. It doesn't change anything.");
      else run('reply', 'In the real app I would open ' + id + ' now.');
      return Promise.resolve(true);
    },
    transcribe: () => Promise.resolve({ text: 'I want to send photos to Anne Marie' }),
    listenOffline: () => Promise.resolve({ text: 'I want to send photos to Anne Marie', confidence: 0.9 }),
    listLessons: () => Promise.resolve(clone(lessons)),
    getLesson: (id) => Promise.resolve(clone(lessons.find((l) => l.id === id) || null)),
    replayLesson: (id) => {
      const l = lessons.find((x) => x.id === id);
      if (l) run('reply', "Let's go through '" + l.title + "' together. You do the clicks, and I'll point.");
      return Promise.resolve(!!l);
    },
    deleteLesson: (id) => { const n = lessons.length; lessons = lessons.filter((l) => l.id !== id); return Promise.resolve(lessons.length < n); },
    runCheck: (name) => Promise.resolve({ name, title: 'Computer check', ok: true, ms: 1200,
      summary: 'Your computer is busy, not broken.', text: '14 programs start by themselves. The disk has 112 GB free.', details: '' }),
    spoken: () => {},
    testVoice: () => Promise.resolve({ error: 'demo' }),
    overlayDismiss: (action) => { console.info('[demo] overlayDismiss', action); emit('overlay', { type: 'clear' }); },
    isElevated: () => Promise.resolve({ elevated: true, adminGroup: true }),
    getWeather: () => Promise.resolve(scenario === 'noweather' ? null : { tempF: 68, tempC: 20, desc: 'Sunny', city: 'Springfield' }),
    openSettings: () => { console.info('[demo] openSettings'); window.open('settings.html', '_blank'); },
    minimizeLauncher: () => { console.info('[demo] minimizeLauncher'); },
    widget: {
      expand: (b) => { expanded = !!b; emit('widget-state', { expanded }); },
      dragBy: () => {},
    },
    on: (channel, cb) => {
      if (!CHANNELS.includes(channel)) throw new Error('unknown channel ' + channel);
      (subs[channel] = subs[channel] || []).push(cb);
      return () => { subs[channel] = subs[channel].filter((f) => f !== cb); };
    },
    _demo: { emit, run, say, status, ask, scripts: Object.keys(SCRIPTS) },
  };

  if (SCRIPTS[scenario]) window.addEventListener('load', () => setTimeout(() => run(scenario), 600));
})();
