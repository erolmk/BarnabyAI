// Settings (for the family member who sets it up). First run (!setupDone): a step-by-step wizard.
// Afterwards: every section on one page. Every change saves by itself through helper.saveSettings.
// Review in a browser: settings.html?demo=firstrun&step=3, or settings.html#family to open one section.
(function () {
  const h = window.helper;
  const P = h.product || {};
  const NAME = P.assistantName || 'Barnaby';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round1 = (x) => Math.round(x * 10) / 10;
  const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  let draft = {};
  let wizard = false, step = 0;
  let removed = null; // {i, c}: the last person removed, so it can be put back (undo instead of "Are you sure?")
  let deleted = false; // "Delete everything" just ran: the wizard's welcome says so

  // 600 ms double-activation guard (UX 4.2)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const now = Date.now();
    if (now - (b._last || 0) < 600) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b._last = now;
  }, true);

  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, path, v) {
    const ks = path.split('.'), last = ks.pop();
    let t = o;
    for (const k of ks) t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {};
    t[last] = v;
  }

  // ---------- small builders ----------
  function field(label, path, opts) {
    opts = opts || {};
    const id = 'f-' + path.replace(/\W/g, '-'), v = get(draft, path);
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      (opts.hint ? '<p class="hint" id="' + id + '-h">' + opts.hint + '</p>' : '') +
      '<input id="' + id + '" data-path="' + path + '" type="' + (opts.type || 'text') + '" value="' + esc(v == null ? '' : v) + '"' +
      (opts.hint ? ' aria-describedby="' + id + '-h"' : '') + (opts.attrs || '') + '></div>';
  }
  function choices(path, list, cls, pressed) { // list: [value, label, hint?]; pressed: show this one as chosen instead
    const cur = pressed === undefined ? get(draft, path) : pressed;
    return '<div class="choices ' + (cls || '') + '">' + list.map((c) =>
      '<button type="button" class="choice" data-path="' + path + '" data-value="' + esc(JSON.stringify(c[0])) + '" aria-pressed="' + (cur === c[0]) + '">' +
        '<span class="choice-text"><span class="choice-label">' + c[1] + '</span>' + (c[2] ? '<small>' + c[2] + '</small>' : '') + '</span>' +
        '<span class="chosen">' + icon('check') + 'Chosen</span></button>').join('') + '</div>';
  }
  const famName = () => String((draft.family && draft.family.name) || '').trim();
  const famSpan = () => '<span data-fam-name>' + (esc(famName()) || 'my family') + '</span>';
  // The family helper: one of their people above (copies the name, phone and email) or someone typed below.
  function helperPicker() {
    const people = (draft.contacts || []).map((c, i) => [c, i]).filter((x) => String(x[0].name || '').trim());
    if (!people.length) return '';
    return '<h3>Pick one of their people</h3><div class="choices two-col">' + people.map(([c, i]) =>
      '<button type="button" class="choice" data-pick-helper="' + i + '" aria-pressed="' + (famName() === String(c.name).trim()) + '">' +
        '<span class="choice-text"><span class="choice-label">' + esc(c.name) + '</span>' +
        (c.relation || c.phone || c.email ? '<small>' + esc(c.relation || c.phone || c.email) + '</small>' : '') + '</span>' +
        '<span class="chosen">' + icon('check') + 'Chosen</span></button>').join('') + '</div><p class="hint">Or type someone else below.</p>';
  }

  // ---------- voices (deeper by default: UX 9.1, 03_naming) ----------
  const DEEP = /\b(male|david|mark|george|james|guy|ryan|christopher|eric|roger|steffan|andrew|brian|davis|tony|jason|liam|william|thomas|daniel|richard|sean|connor|mitchell|ravi|prabhat|kenneth|brandon|jacob|fred|ralph|albert|bruce|reed|eddy|rocko|grandpa)\b/i;
  const HIGH = /\b(female|zira|hazel|susan|aria|jenny|michelle|emma|ava|sonia|libby|natasha|clara|samantha|karen|moira|tessa|fiona|victoria|linda|heather|catherine|emily|ana|sara|nancy|heera|neerja|jane|maisie|hollie|olivia|elizabeth|grandma|flo|sandy|shelley)\b/i;
  const pitch = (v) => (/\bfemale\b/i.test(v.name) ? 'higher' : DEEP.test(v.name) ? 'deeper' : HIGH.test(v.name) ? 'higher' : '');
  const natural = (v) => /natural|online|neural/i.test(v.name);
  function voices() {
    let list = [];
    try { list = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (_) { list = []; }
    return list.filter((v) => /^en/i.test(v.lang))
      .sort((a, b) => (natural(b) - natural(a)) || ((pitch(b) === 'deeper') - (pitch(a) === 'deeper')) || a.name.localeCompare(b.name));
  }
  const autoVoice = () => { const l = voices(); return l.find((v) => pitch(v) === 'deeper') || l[0] || null; };
  const LANG = { 'en-US': 'American', 'en-GB': 'British', 'en-AU': 'Australian', 'en-CA': 'Canadian', 'en-IN': 'Indian', 'en-IE': 'Irish', 'en-NZ': 'New Zealand', 'en-ZA': 'South African' };
  const accent = (v) => LANG[String(v.lang).replace('_', '-')] || 'English';
  const voiceLabel = (v) => v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s+-\s+.*$/, '').replace(/\s*\(Natural\)/i, ' (natural)');
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { if (draft.ttsVoice === LOCAL) rerender('voice'); };

  // Barnaby's natural voices (src/tts.js VOICES, same order) and the computer's own voice (research/07_voice.md).
  const LOCAL = 'local';
  const NATURAL = [['en-US-Ethan:MAI-Voice-2', 'Ethan', 'Recommended. A calm, low voice.'], ['en-US-Grant:MAI-Voice-2', 'Grant', 'A man’s voice'],
    ['en-US-Jasper:MAI-Voice-2', 'Jasper', 'A man’s voice'], ['en-US-Harper:MAI-Voice-2', 'Harper', 'A softer voice, a woman’s']];
  // Speaking speed: Slower, Normal, Faster. The widget's speed buttons use the same three (test/setup.test.js checks).
  const SPEEDS = [0.8, 0.9, 1.0];
  const speedIdx = (r) => { r = +r || 0.9; return r < 0.85 ? 0 : r > 0.95 ? 2 : 1; }; // a rate set by voice (0.7, 1.1) shows as its nearest step
  const VOICE_CHOICES = NATURAL.concat([[LOCAL, 'This computer’s own voice', 'Works without the internet. Nothing leaves the computer.']]);
  const voiceTitle = (d) => (d.muted ? 'Only shows the words' : d.ttsVoice === LOCAL
    ? 'This computer’s own voice' + (d.voiceName ? ': ' + voiceLabel({ name: d.voiceName }) : '')
    : (VOICE_CHOICES.find((v) => v[0] === d.ttsVoice) || NATURAL[0])[1]);

  // The only place in the settings page that makes a sound, and only on this click. Main makes the natural voice
  // (the key stays there) and says "muted" when nothing may sound at all.
  function testVoice() {
    const note = $('#voice-note');
    if (h.isDemo) { note.textContent = 'This is a preview, so ' + NAME + ' stays quiet here. In the app this button plays the voice.'; return; }
    if (draft.muted) { note.textContent = 'Speaking is turned off above, so there is nothing to hear.'; return; }
    note.textContent = 'Getting the voice ready…';
    Promise.resolve(h.testVoice ? h.testVoice({ voice: draft.ttsVoice, speed: +draft.speechRate || 0.9 }) : { error: 'local' })
      .catch(() => ({ error: 'other' }))
      .then((r) => {
        if (r && r.error === 'muted') { note.textContent = 'Speaking is turned off, so there is nothing to hear.'; return; }
        if (r && r.chunks) return voiceLib().then((V) => { note.textContent = 'Playing the voice now.'; return V.play(r.chunks); });
        ownVoice();
        note.textContent = r && r.error === 'local' ? 'Playing the voice now.'
          : 'The internet voice did not answer, so this is the computer’s own voice. ' + NAME + ' does the same when the internet is off.';
      })
      .catch(() => { note.textContent = 'The voice did not play. Please try once more.'; });
  }
  function ownVoice() {
    const u = new SpeechSynthesisUtterance('Hello' + (draft.userName ? ' ' + draft.userName : '') + '. I am ' + NAME + '. I will help you, one step at a time.');
    const v = voices().find((x) => x.name === draft.voiceName) || autoVoice();
    if (v) u.voice = v;
    u.rate = +draft.speechRate || 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  // ui/voice.js (the widget's player) is loaded only when the natural voice is tested.
  function voiceLib() {
    if (window.Voice) return Promise.resolve(window.Voice);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'voice.js';
      s.onload = () => res(window.Voice);
      s.onerror = rej;
      document.head.append(s);
    });
  }

  // Scam Shield switch-off waits a day (04_safety 8.5); the line next to the switch says where it stands.
  function shieldNote() {
    const at = +draft.scamShieldOffAt || 0;
    if (draft.scamShield) return 'Turning it off takes a day: Scam Shield keeps watching for 24 hours first, and family gets a note if they chose alerts. Scammers often push people to switch protection off in a hurry.';
    if (at > Date.now()) {
      const day = new Date(at).toDateString() === new Date().toDateString() ? 'today' : 'tomorrow';
      return 'Scam Shield keeps watching until ' + day + ' at ' + clock(at) + ', then switches off. Choose On to cancel.';
    }
    return 'Scam Shield is off. Choose On to turn it back on.';
  }
  // Changing or clearing the family contact, the alert code, or choosing "Just me" waits a day too.
  function familyNote() {
    const p = (draft.pendingFamily || []).filter((x) => +x.at > Date.now());
    if (!p.length) return '';
    const at = Math.max.apply(null, p.map((x) => +x.at));
    const day = new Date(at).toDateString() === new Date().toDateString() ? 'today' : 'tomorrow';
    return 'Changes to the family contact and alerts wait a day, so nobody can rush them. They take effect ' + day + ' at ' +
      clock(at) + '. Until then alerts go where they went before. Change a field back to cancel.';
  }

  // ---------- Barnaby's brain (read-only for families) and the command line ----------
  const MODEL_NAMES = { 'deepseek/deepseek-v4.1-flash': 'DeepSeek V4.1 Flash' };
  const HOSTS = { phala: 'Phala (sealed, confidential computing)', fireworks: 'Fireworks', together: 'Together AI', baseten: 'Baseten', deepinfra: 'DeepInfra' };
  function hosts(p) { // settings.providers: the provider list, or OpenRouter's routing object {order, only, ...}
    const list = Array.isArray(p) ? p : p && typeof p === 'object' ? (p.order || p.only || []) : [];
    return list.map((x) => HOSTS[String(x).split('/')[0]] || String(x));
  }
  const dl = (rows) => '<dl class="summary">' + rows.map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>';
  function adminNote(r) {
    if (!r || r.elevated == null) return 'Not known right now.';
    return r.elevated ? 'Yes.' : 'No. Fixes that need an administrator will not work. Start ' + NAME + ' from its desktop icon and choose Yes when Windows asks.';
  }
  function loadAdmin() {
    const el = document.getElementById('admin-now');
    if (!el) return;
    if (!h.isElevated) { el.textContent = 'This is a preview, so it is not checked here.'; return; }
    h.isElevated().then((r) => { el.textContent = adminNote(r); }, () => { el.textContent = adminNote(null); });
  }

  // ---------- sections (shared by the wizard and the normal view; wizard:false = only on the full page) ----------
  const SECTIONS = [
    { id: 'name', icon: 'person', title: 'Name and town',
      intro: 'Let them answer this one. Use the name they like, for example "Rose" or "Mrs. Alvarez".',
      body: () => field('What should I call you?', 'userName', { attrs: ' autocomplete="off"' }) +
        field('Town or city, for the weather on the home screen', 'city', { hint: 'Leave it empty and ' + NAME + ' works it out from the internet connection.' }) },

    { id: 'text', icon: 'text', title: 'Text size',
      intro: 'Which one is easiest for them to read? If you can, let them choose.',
      body: () => {
        const cur = round1(+draft.textScale || 1);
        return '<div class="choices samples">' + [[1, 'Standard'], [1.2, 'Larger'], [1.4, 'Largest']].map((s) =>
          '<button type="button" class="choice sample" data-path="textScale" data-value="' + s[0] + '" aria-pressed="' + (cur === s[0]) + '">' +
            '<span class="choice-text"><span class="choice-label">' + s[1] + '</span>' +
            '<span class="sample-text" style="font-size:' + 24 * s[0] + 'px">Good morning' + (draft.userName ? ', ' + esc(draft.userName) : '') + '. You have 2 new emails.</span></span>' +
            '<span class="chosen">' + icon('check') + 'Chosen</span></button>').join('') + '</div>' +
          '<div class="stepper"><button type="button" data-scale-step="-1">Smaller</button>' +
          '<p id="scale-now"><strong>Text size now: ' + Math.round(cur * 100) + '%</strong><br><small>From 100% to 160%.</small></p>' +
          '<button type="button" data-scale-step="1">Bigger</button></div>';
      } },

    { id: 'voice', icon: 'speaker', title: 'Voice',
      intro: NAME + ' says every line out loud and also shows it in writing. A deeper voice is easier to hear for most people.',
      body: () => {
        const local = draft.ttsVoice === LOCAL, list = local ? voices() : [];
        return choices('muted', [[false, 'Speak out loud'], [true, 'Only show the words', 'No sound at all']], 'two-col') +
          '<h3>Which voice?</h3>' + choices('ttsVoice', VOICE_CHOICES, 'two-col') +
          '<p class="hint">' + (local ? 'Nothing is sent anywhere. It sounds more like a machine.'
            : 'Ethan, Grant, Jasper and Harper are made by Microsoft’s voice service over the internet. Each line ' + esc(NAME) +
              ' says goes there to be spoken, and it is not kept. For nothing to leave the computer, choose “This computer’s own voice”.') + '</p>' +
          (local ? '<h3>Which of this computer’s voices?</h3><div class="row">' +
            '<button type="button" data-voice-pick="deeper">A deeper voice</button><button type="button" data-voice-pick="higher">A higher voice</button></div>' +
            choices('voiceName', [['', 'Automatic', 'A deeper voice, picked by ' + NAME]].concat(list.map((v) => [v.name, esc(voiceLabel(v)), [accent(v), pitch(v)].filter(Boolean).join(' · ')])), 'two-col') +
            (list.length ? '' : '<p class="hint">The voices on this computer will show here once Windows has loaded them.</p>') : '') +
          '<h3>How fast?</h3>' + choices('speechRate', [[SPEEDS[0], 'Slower'], [SPEEDS[1], 'Normal', 'Recommended'], [SPEEDS[2], 'Faster']], 'three', SPEEDS[speedIdx(draft.speechRate)]) +
          '<div class="row"><button type="button" id="test-voice">' + icon('speaker') + '<span>Test the voice</span></button></div>' +
          '<p id="voice-note" class="hint" role="status"></p>';
      } },

    { id: 'email', icon: 'email', title: 'Email',
      intro: 'Which email do they use? ' + NAME + ' opens it when they press Email.',
      body: () => choices('email.provider', [['gmail', 'Gmail'], ['outlook', 'Outlook on the web', 'Outlook.com or Hotmail'],
        ['outlook-app', 'The Outlook program', 'Installed on this computer'], ['aol', 'AOL Mail'], ['yahoo', 'Yahoo Mail'],
        ['', 'Not sure', NAME + ' will ask them']], 'two-col') +
        field('Their email address (optional)', 'email.address', { type: 'email', attrs: ' autocomplete="off"' }) },

    { id: 'photos', icon: 'photos', title: 'Photos',
      intro: 'Where are their photos kept?',
      body: () => choices('photos.provider', [['icloud', 'iCloud Photos', 'Photos from an iPhone'], ['google', 'Google Photos'],
        ['windows', 'Photos on this computer', 'The Windows Photos program'], ['', 'Not sure', NAME + ' will ask them']], 'two-col') },

    { id: 'video', icon: 'video', title: 'Video calls',
      intro: 'Which program do they use to see family on video?',
      body: () => choices('video.provider', [['zoom', 'Zoom'], ['whatsapp', 'WhatsApp'], ['facebook', 'Facebook Messenger'],
        ['teams', 'Microsoft Teams'], ['', 'Not sure', NAME + ' will ask them']], 'two-col') },

    { id: 'contacts', icon: 'family', title: 'Contacts: family and friends',
      intro: NAME + ' knows these people by name. They can say \u201cemail Sarah\u201d or \u201ccall Anne Marie\u201d, and he uses the details here. ' +
        'They also appear under Family on the home screen, with "Send an email" and "Video call" buttons.',
      body: () => (removed ? '<p class="notice undo">Removed ' + esc(removed.c.name || 'a person') + '. <button type="button" data-undo-remove>' + icon('back') +
          '<span>Put ' + esc(removed.c.name || 'them') + ' back</span></button></p>' : '') + (draft.contacts || []).map((c, i) =>
        '<fieldset class="contact"><legend>Person ' + (i + 1) + (c.name ? ': ' + esc(c.name) : '') + '</legend>' +
          (c.added ? '<p class="hint">' + esc(NAME) + ' saved this person from what they told him. Please check the details.</p>' : '') + '<div class="grid2">' +
          field('Name', 'contacts.' + i + '.name', { attrs: ' autocomplete="off"' }) +
          field('How they are related', 'contacts.' + i + '.relation', { attrs: ' placeholder="Daughter, friend, neighbour" autocomplete="off"' }) +
          field('Email address', 'contacts.' + i + '.email', { type: 'email', attrs: ' autocomplete="off"' }) +
          field('Phone number', 'contacts.' + i + '.phone', { type: 'tel', attrs: ' autocomplete="off"' }) +
        '</div><button type="button" class="remove" data-remove="' + i + '">' + icon('trash') + '<span>Remove ' + esc(c.name || 'this person') + '</span></button></fieldset>').join('') +
        '<button type="button" data-add-contact>' + icon('plus') + '<span>Add a person</span></button>' },

    { id: 'family', icon: 'bell', title: 'Family helper and alerts',
      intro: 'Pick the one person who looks out for them, usually the family member setting this up. If ' + NAME +
        ' sees a scam on the screen, he warns them calmly. He can also alert this person, if they agree.',
      body: () =>
        '<p id="family-note" class="notice" role="status"' + (familyNote() ? '' : ' hidden') + '>' + esc(familyNote()) + '</p>' + helperPicker() +
        field('Family helper\u2019s name', 'family.name', { hint: NAME + ' uses it when they ask for family.', attrs: ' autocomplete="off"' }) +
        field('Family helper\u2019s phone number', 'family.phone', { type: 'tel', hint: NAME + ' reads it out if they ask. He never phones anyone.', attrs: ' autocomplete="off"' }) +
        field('Family helper\u2019s email (optional)', 'family.email', { type: 'email', attrs: ' autocomplete="off"' }) +
        '<h3>Ask them first</h3><p>Read this to them and let them choose. If ' + esc(NAME) + ' sees a scam, who should hear about it?</p>' +
        choices('family.alertConsent', [['just_me', 'Just me', 'Nothing goes to anyone.'],
          ['tell_family', 'Tell ' + famSpan() + ' if I might be in a scam', 'Only the kind of warning and the time. Never the screen, websites or amounts.']]) +
        '<div class="howto notice"><h3>Get alerts on your phone (free)</h3><ol>' +
          '<li>On your phone, install the free app <strong>ntfy</strong> from the App Store or Google Play.</li>' +
          '<li>Press <strong>Make a private alert code</strong> below.</li>' +
          '<li>In the ntfy app, press <strong>+</strong>, type the code exactly, and press <strong>Subscribe</strong>.</li>' +
          '<li>Press <strong>Send a test alert</strong>. It should arrive within a minute.</li></ol></div>' +
        field('Private alert code', 'family.ntfyTopic', { hint: 'Treat it like a password: anyone who has it can read the alerts. Leave it empty for no alerts.', attrs: ' class="code" autocomplete="off" spellcheck="false"' }) +
        '<div class="row"><button type="button" data-make-topic>Make a private alert code</button>' +
          '<button type="button" data-copy-topic>Copy the code</button>' +
          '<button type="button" data-test-alert>' + icon('bell') + '<span>Send a test alert</span></button></div>' +
        '<p id="alert-note" class="hint" role="status"></p>' +
        '<h3>Weekly note</h3><p>Once a week, numbers only. For example: "This week ' + esc(NAME) + ' helped Rose 9 times and showed 1 scam warning."</p>' +
        choices('family.weeklyNote', [[false, 'No weekly note'], [true, 'Send a weekly note', 'Only if they chose "Tell ' + famSpan() + '" above']], 'two-col') },

    { id: 'key', icon: 'key', title: NAME + ' connection key',
      intro: NAME + ' needs this key to think and talk.',
      body: () => (draft.hasApiKey
          ? '<p class="ok-line">' + icon('check') + '<span>A key is saved on this computer.</span></p>'
          : '<p class="notice">No key yet. ' + NAME + ' can\'t help until one is added.</p>') +
        '<div class="field"><label for="f-apiKey">' + esc(NAME) + ' connection key</label>' +
          '<p class="hint" id="f-apiKey-h">It comes in your welcome email. Paste it here.</p><div class="key-row">' +
          '<input id="f-apiKey" data-path="apiKey" type="password" value="' + esc(draft.apiKey || '') + '" autocomplete="off" spellcheck="false" aria-describedby="f-apiKey-h">' +
          '<button type="button" data-toggle-key>Show</button></div></div>' },

    { id: 'safety', icon: 'shield', title: 'Safety and start-up',
      body: () => '<h3>Scam Shield</h3><p>Watches the screen for scam pop-ups and fake warnings, and warns them calmly. Recommended.</p>' +
        choices('scamShield', [[true, 'On'], [false, 'Off', 'Keeps watching for one more day']], 'three') +
        '<p id="shield-note" class="hint" role="status">' + esc(shieldNote()) + '</p>' +
        '<h3>Start with Windows</h3><p>' + NAME + ' is ready as soon as the computer is turned on.</p>' +
        choices('startAtLogin', [[true, 'Yes'], [false, 'No']], 'three') +
        '<h3>Say \u201cHello, ' + NAME + '\u201d</h3><p>Start talking without touching anything. The computer itself listens for just those words; nothing goes over the internet until they speak to ' + NAME + '.</p>' +
        choices('wakeWord', [[true, 'On'], [false, 'Off']], 'three') },

    { id: 'mode', icon: 'talk', title: 'How ' + NAME + ' helps',
      intro: 'Who does the clicking? This can also be switched on the home screen, and ' + NAME + ' takes over by itself when they keep getting stuck.',
      body: () => choices('mode', [['teach', 'Show me how', 'Recommended. They do every click and all the typing; ' + NAME + ' rings exactly where to click, waits for them, and explains each step. ' +
          'Checks on the computer run by themselves in the background.'],
        ['do', 'Do it for me', NAME + ' does the clicks and typing itself. Passwords, card numbers and the final Send, Buy or Delete stay theirs.'],
        ['together', 'Do it together', NAME + ' does the routine clicks; they do the personal steps.']]) +
        '<h3>Open beside my programs</h3><p>When ' + esc(NAME) + ' opens, he takes the right third of the screen and the program they are using fills the rest. ' +
        'When he closes, the program fills the whole screen again.</p>' +
        choices('dockPanel', [[true, 'On', 'Recommended'], [false, 'Off', 'He opens as a smaller panel in a corner']], 'three') },

    { id: 'brain', icon: 'shield', title: NAME + '’s brain', wizard: false,
      intro: 'The part of ' + NAME + ' that thinks. You can read it here; there is nothing to change.',
      body: () => dl([['Thinking model', MODEL_NAMES[draft.brainModel] || draft.brainModel || 'Not set'],
          ['Privacy', 'Private hosting with zero data retention: nothing they say or show is kept, and nothing is used for training.'],
          ['Runs only on', hosts(draft.providers).join(', ') || 'The private hosts ' + NAME + ' comes with']]) +
        '<p class="hint">If the first host is busy, the next one on the list takes over. Phala runs it inside a sealed part of the computer chip, so even the host cannot look in.</p>' },

    { id: 'commands', icon: 'desktop', title: 'Command line', wizard: false,
      intro: NAME + ' can type commands into the computer’s command line to check and fix things. He runs as an administrator, so these safeguards are always on:',
      body: () => '<ul class="plain">' +
          '<li>Every command is checked against safety rules before it runs.</li>' +
          '<li>Commands that change something wait for a Yes on a big card first.</li>' +
          '<li>Commands that could delete their files, turn off protection or let someone else in are refused.</li>' +
          '<li>Every command is written in the Safety diary, with the time.</li></ul>' +
        '<p><strong>Running as administrator:</strong> <span id="admin-now" role="status">Checking…</span></p>' +
        '<h3>Let ' + esc(NAME) + ' use the command line</h3>' +
        choices('allowCommands', [[true, 'On', 'Recommended'], [false, 'Off', 'Only his built-in checks and fixes']], 'three') },

    { id: 'diary', icon: 'lessons', title: 'Safety diary', wizard: false,
      intro: 'Every scam warning, every "no" and every alert sent to family, with the time. Kept for 90 days. It never includes what was on the screen.',
      body: () => '<ol class="diary" id="diary-list" aria-live="polite"></ol>' },

    { id: 'privacy', icon: 'desktop', title: 'Your privacy', wizard: false,
      body: () => '<h3>What leaves this computer</h3><ul class="plain">' +
          '<li>A picture of the screen, only during a task they started, so ' + esc(NAME) + ' knows where to click. Passwords and card numbers are blacked out first. It is not kept.</li>' +
          '<li>Their voice, only while the Talk button is on, to turn it into words. It is thrown away right after.</li>' +
          '<li>What ' + esc(NAME) + ' says out loud, while one of his internet voices is on (Ethan, Grant, Jasper or Harper): each line goes to Microsoft’s voice service to be spoken. It is not kept. With “This computer’s own voice” nothing is sent.</li>' +
          '<li>The words on the screen are checked on this computer for scams. Only if something looks like a scam, up to 1,500 characters go out to double-check, with private numbers removed.</li>' +
          '<li>Scam alerts to family, only if they chose "Tell ' + famSpan() + '". Only the kind of warning and the time.</li></ul>' +
        '<h3>What stays on this computer</h3><p>Lessons, what ' + esc(NAME) + ' remembers, the safety diary (90 days) and a small technical log (14 days, no screen words and no conversations). Nobody can see the screen, the websites they visit, their emails or what they type.</p>' +
        '<h3>Delete everything</h3><p>This removes the lessons, what ' + esc(NAME) + ' remembers, the safety diary, the log and all settings. The connection key stays.</p>' +
        '<div id="delete-area"><button type="button" class="remove" data-delete-ask>' + icon('trash') + '<span>Delete everything ' + esc(NAME) + ' knows</span></button></div>' },

    { id: 'advanced', icon: 'settings', title: 'Advanced', wizard: false,
      intro: 'You can leave these as they are.',
      body: () => '<div class="grid2">' +
          field('Brain model', 'brainModel', { attrs: ' spellcheck="false"' }) + field('Fallback model', 'fallbackModel', { attrs: ' spellcheck="false"' }) +
          field('Speech model', 'sttModel', { attrs: ' spellcheck="false"' }) + field('Jev model (safety checks)', 'jevModel', { attrs: ' spellcheck="false"' }) +
          field('Spending limit per task, in dollars', 'taskCostCapUsd', { type: 'number', attrs: ' min="0.01" max="5" step="0.05"' }) +
          field('Step limit per task', 'maxSteps', { type: 'number', attrs: ' min="5" max="200" step="1"' }) +
        '</div>' },
  ];
  const byId = (id) => SECTIONS.find((s) => s.id === id);
  const WIZ = SECTIONS.filter((s) => s.wizard !== false);

  function sectionHTML(s) {
    return '<section class="s-card card" id="sec-' + s.id + '" aria-labelledby="h-' + s.id + '">' +
      '<h2 id="h-' + s.id + '" tabindex="-1">' + icon(s.icon) + '<span>' + esc(s.title) + '</span></h2>' +
      (s.intro ? '<p class="intro">' + esc(s.intro) + '</p>' : '') + s.body() + '</section>';
  }
  function rerender(id) {
    const el = document.getElementById('sec-' + id);
    if (el) el.outerHTML = sectionHTML(byId(id));
    if (id === 'diary') loadDiary();
    if (id === 'commands') loadAdmin();
  }

  // Safety diary lines: "Tuesday 3:42 PM — Barnaby warned about a fake virus pop-up."
  function loadDiary() {
    const list = document.getElementById('diary-list');
    if (!list) return;
    const show = (rows) => {
      list.innerHTML = rows.length ? rows.map((r) => '<li><strong>' + esc(r.when) + '</strong> — ' + esc(r.what) + '</li>').join('')
        : '<li class="empty">Nothing here yet. When ' + esc(NAME) + ' warns about a scam or says no to something unsafe, it shows here.</li>';
    };
    if (!h.safetyDiary) return show([]); // browser preview
    h.safetyDiary().then((rows) => show(Array.isArray(rows) ? rows : []), () => show([]));
  }

  // ---------- saving (every change, so closing the window never loses anything) ----------
  // Only what this page changed is sent, measured against `base` (the saved settings as main last told us), so
  // something Barnaby learned meanwhile (a contact, the email provider) is never overwritten by a stale copy.
  const J = JSON.stringify;
  let base = {};
  function patch(d) {
    d = d || draft;
    const cost = Math.min(5, Math.max(0.01, parseFloat(d.taskCostCapUsd) || 0.25));
    const steps = Math.min(200, Math.max(5, Math.round(+d.maxSteps) || 40));
    return {
      userName: String(d.userName || '').trim(), city: String(d.city || '').trim(),
      textScale: Math.min(1.6, Math.max(1, round1(+d.textScale || 1))),
      ttsVoice: d.ttsVoice || NATURAL[0][0], voiceName: d.voiceName || '', speechRate: +d.speechRate || 0.9, muted: !!d.muted, mode: d.mode || 'teach',
      email: { provider: d.email.provider || '', address: String(d.email.address || '').trim() },
      photos: { provider: d.photos.provider || '' }, video: { provider: d.video.provider || '' },
      // Other keys on a contact (added: 'voice' when Barnaby saved it) are kept, so a save here never erases them.
      contacts: (d.contacts || []).map((c) => Object.assign({}, c, { name: String(c.name || '').trim(), relation: String(c.relation || '').trim(),
        email: String(c.email || '').trim(), phone: String(c.phone || '').trim() })).filter((c) => c.name),
      family: { name: String(d.family.name || '').trim(), phone: String(d.family.phone || '').trim(), email: String(d.family.email || '').trim(),
        ntfyTopic: String(d.family.ntfyTopic || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64),
        alertConsent: d.family.alertConsent === 'tell_family' ? 'tell_family' : 'just_me', weeklyNote: !!d.family.weeklyNote },
      apiKey: String(d.apiKey || '').trim(), // '********' = unchanged (config.js ignores it)
      scamShield: !!d.scamShield, startAtLogin: !!d.startAtLogin, wakeWord: !!d.wakeWord, // main sets scamShieldOffAt itself
      brainModel: String(d.brainModel || '').trim(), fallbackModel: String(d.fallbackModel || '').trim(),
      sttModel: String(d.sttModel || '').trim(), jevModel: String(d.jevModel || '').trim(),
      taskCostCapUsd: cost, maxSteps: steps,
      dockPanel: d.dockPanel !== false, allowCommands: d.allowCommands !== false,
    };
  }
  function status(text) { $('#status').textContent = text; }
  // Main's own values: when the shield switches off, which family changes wait, whether a key is saved.
  function fromMain(pub) {
    if (!pub) return;
    base = patch(normalize(pub));
    if ('scamShieldOffAt' in pub) draft.scamShieldOffAt = pub.scamShieldOffAt;
    draft.pendingFamily = Array.isArray(pub.pendingFamily) ? pub.pendingFamily : [];
    const note = $('#shield-note'); if (note) note.textContent = shieldNote();
    const fam = $('#family-note'); if (fam) { fam.textContent = familyNote(); fam.hidden = !fam.textContent; }
  }
  function save(extra) {
    const all = Object.assign(patch(), extra || {}), p = {};
    for (const k of Object.keys(all)) if (J(all[k]) !== J(base[k])) p[k] = all[k];
    if (!Object.keys(p).length) return Promise.resolve(null);
    status('Saving…');
    return Promise.resolve(h.saveSettings(p)).then((pub) => {
      const hadKey = draft.hasApiKey;
      draft.hasApiKey = !!(pub && pub.hasApiKey);
      fromMain(pub);
      if (hadKey !== draft.hasApiKey) {
        const line = document.querySelector('#sec-key .ok-line, #sec-key > .notice');
        if (line) line.outerHTML = draft.hasApiKey ? '<p class="ok-line">' + icon('check') + '<span>A key is saved on this computer.</span></p>'
          : '<p class="notice">No key yet. ' + NAME + ' can\'t help until one is added.</p>';
      }
      status('All changes are saved (' + clock(Date.now()) + ').');
      return pub;
    }, () => status('That change did not save. Please try once more.'));
  }

  // ---------- family alerts: code, copy, test ----------
  function makeCode() { // 24 random base32 letters (120 bits): nobody can guess it
    const A = 'abcdefghijklmnopqrstuvwxyz234567';
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return String(P.name || NAME).toLowerCase().replace(/[^a-z0-9]+/g, '') + '-' + Array.from(bytes, (b) => A[b & 31]).join('');
  }
  const alertNote = (t) => { const n = $('#alert-note'); if (n) n.textContent = t; };
  function copyCode() {
    const code = String(draft.family.ntfyTopic || '').trim();
    if (!code) return alertNote('There is no code yet. Press "Make a private alert code" first.');
    const done = () => alertNote('Copied. Paste it into the ntfy app, or into an email to yourself.');
    const fallback = () => { const i = $('#f-family-ntfyTopic'); i.select(); document.execCommand('copy'); done(); };
    try { navigator.clipboard.writeText(code).then(done, fallback); } catch (_) { fallback(); }
  }
  function testAlert() {
    if (!h.testAlert) return alertNote('This is a preview, so no alert is sent from here.');
    alertNote('Sending a test alert…');
    return save().then(() => h.testAlert()).then((r) => {
      if (r && r.ok) alertNote('The test alert went out at ' + r.time + '. It should arrive on your phone within a minute.' +
        (draft.family.alertConsent === 'tell_family' ? '' : ' Real alerts only go out if they choose "Tell ' + (famName() || 'my family') + '" above.'));
      else if (r && r.why === 'no_code') alertNote('There is no code yet. Press "Make a private alert code" first.');
      else alertNote('The test alert did not go out. Please check the internet connection and try once more.');
    }, () => alertNote('The test alert did not go out. Please try once more.'));
  }

  // ---------- "Delete everything": a confirm card in place of the button (UX 11.3) ----------
  function askDelete() {
    $('#delete-area').innerHTML = '<div class="confirm-card" role="group" aria-labelledby="del-title">' +
      '<h3 id="del-title" tabindex="-1">Delete everything ' + esc(NAME) + ' knows?</h3>' +
      '<dl class="summary"><div><dt>What goes</dt><dd>Lessons, what ' + esc(NAME) + ' remembers, the safety diary, the log and all settings</dd></div>' +
      '<div><dt>What stays</dt><dd>The connection key</dd></div></dl>' +
      '<p>This can\'t be undone.</p>' +
      '<div class="wiz-nav"><button type="button" class="danger" data-delete-yes>Yes, delete everything</button>' +
      '<button type="button" data-delete-no>No, keep everything</button></div></div>';
    $('#del-title').focus();
  }
  function doDelete() {
    if (!h.deleteEverything) { $('#delete-area').innerHTML = '<p class="notice">This is a preview, so nothing is deleted here.</p>'; return; }
    $('#delete-area').innerHTML = '<p role="status">Deleting…</p>';
    h.deleteEverything().then((pub) => { load(pub); deleted = true; wizard = true; step = 0; render(); },
      () => { $('#delete-area').innerHTML = '<p class="notice">That did not work. Please close this window and try once more.</p>'; });
  }

  // ---------- views ----------
  const STEPS = ['welcome'].concat(WIZ.map((s) => s.id), ['done']);

  function renderWizard() {
    const id = STEPS[step], n = WIZ.length;
    let html;
    if (id === 'welcome') {
      html = '<section class="s-card card welcome"><img src="assets/avatar.svg" width="96" height="96" alt="">' +
        (deleted ? '<p class="notice">Everything is deleted. Only the connection key was kept.</p>' : '') +
        '<h2 tabindex="-1">Welcome. Let\'s set up ' + esc(NAME) + '.</h2>' +
        '<p>It takes about 10 minutes. You can change everything later with the <strong>Settings (for family)</strong> button on the home screen.</p>' +
        '<div class="trust-card">' + icon('shield') + '<div><strong>' + esc(P.trustLine || '') + '</strong>' +
        '<p>Please tell them this too: anyone who phones and says they are ' + esc(NAME) + ' is a scammer.</p></div></div>' +
        '<div class="wiz-nav"><button type="button" class="primary" data-go="next">Start setting up</button></div></section>';
    } else if (id === 'done') {
      html = '<section class="s-card card"><h2 tabindex="-1">' + icon('check') + '<span>Almost done</span></h2>' +
        '<p class="intro">Here is what you chose. Press <strong>Finish setting up</strong> to start ' + esc(NAME) + '.</p>' + summary() +
        '<div class="wiz-nav"><button type="button" data-go="back">Back</button>' +
        '<button type="button" class="primary" data-go="finish">Finish setting up</button></div></section>';
    } else {
      const next = STEPS[step + 1] === 'done' ? 'Last check' : byId(STEPS[step + 1]).title;
      html = '<p class="progress"><span><strong>Step ' + step + ' of ' + n + '</strong> · ' + esc(byId(id).title) + '</span>' +
        '<span class="bar" aria-hidden="true"><span style="width:' + Math.round(step / n * 100) + '%"></span></span></p>' +
        sectionHTML(byId(id)) +
        '<div class="wiz-nav"><button type="button" data-go="back">Back</button>' +
        '<button type="button" class="primary" data-go="next">Next: ' + esc(next) + '</button></div>';
    }
    $('#app').innerHTML = html;
    $('#app').className = 'wizard';
    const t = $('#app h2'); if (t) t.focus();
  }

  function summary() {
    const d = patch();
    const label = (sec, v) => { const b = document.createElement('div'); b.innerHTML = byId(sec).body(); const c = b.querySelector('.choice[aria-pressed="true"] .choice-label'); return c ? c.textContent : (v || 'Not set'); };
    const fam = d.family.name || 'family';
    const rows = [
      ['Name', d.userName || 'Not set'], ['Town', d.city || 'Worked out from the internet connection'], ['Text size', Math.round(d.textScale * 100) + '%'],
      ['Voice', voiceTitle(d)],
      ['Email', label('email')], ['Photos', label('photos')], ['Video calls', label('video')],
      ['Family and friends', d.contacts.length ? d.contacts.map((c) => c.name).join(', ') : 'Nobody yet'],
      ['Family helper', d.family.name ? [d.family.name, d.family.phone, d.family.email].filter(Boolean).join(', ') : 'Not chosen yet'],
      ['Scam alerts', d.family.alertConsent !== 'tell_family' ? 'Just me: no alerts go to anyone'
        : d.family.ntfyTopic ? 'Tell ' + fam + ' if I might be in a scam' : 'Tell ' + fam + ', but there is no alert code yet'],
      ['Weekly note', d.family.weeklyNote ? 'Yes, numbers only' : 'No'],
      ['Connection key', draft.hasApiKey || (d.apiKey && d.apiKey !== '********') ? 'Saved' : 'Missing: ' + NAME + ' can\'t help without it'],
      ['Scam Shield', d.scamShield ? 'On' : 'Off'], ['How ' + NAME + ' helps', label('mode')],
    ];
    return '<dl class="summary">' + rows.map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>';
  }

  function renderAll() {
    $('#app').className = 'all';
    $('#app').innerHTML =
      (draft.hasApiKey ? '' : '<p class="notice top-notice">' + esc(NAME) + ' needs a connection key before he can help. ' +
        '<button type="button" data-jump="key">Add the key</button></p>') +
      '<nav class="jump" aria-label="Sections">' + SECTIONS.map((s) =>
        '<button type="button" data-jump="' + s.id + '">' + icon(s.icon) + '<span>' + esc(s.title) + '</span></button>').join('') + '</nav>' +
      SECTIONS.map(sectionHTML).join('');
    loadDiary();
    loadAdmin();
  }

  function render() {
    $('#status-bar').hidden = wizard;
    return wizard ? renderWizard() : renderAll();
  }

  function jumpTo(id) {
    const s = document.getElementById('sec-' + id);
    if (!s) return;
    s.scrollIntoView();
    $('#h-' + id).focus({ preventScroll: true });
  }
  // settings.html#all shows every section; #family (any section id) opens the full page at that section.
  function fromHash() {
    const id = location.hash.slice(1);
    if (!id || (id !== 'all' && !byId(id))) return false;
    if (wizard) { wizard = false; render(); } else if (!document.getElementById('sec-' + id) && id !== 'all') render();
    if (id !== 'all') jumpTo(id); else window.scrollTo(0, 0);
    return true;
  }
  window.addEventListener('hashchange', fromHash);

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const path = b.getAttribute('data-path');
    if (path && b.classList.contains('choice')) {
      const v = JSON.parse(b.getAttribute('data-value'));
      set(draft, path, v);
      b.parentNode.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (path === 'textScale') { rerender('text'); document.querySelector('#sec-text .choice[aria-pressed="true"]').focus(); }
      if (path === 'ttsVoice') { rerender('voice'); document.querySelector('#sec-voice .choice[data-path="ttsVoice"][aria-pressed="true"]').focus(); }
      return save();
    }
    if (b.hasAttribute('data-scale-step')) {
      draft.textScale = Math.min(1.6, Math.max(1, round1((+draft.textScale || 1) + 0.1 * +b.getAttribute('data-scale-step'))));
      rerender('text'); document.querySelector('[data-scale-step="' + b.getAttribute('data-scale-step') + '"]').focus();
      return save();
    }
    if (b.hasAttribute('data-voice-pick')) {
      const want = b.getAttribute('data-voice-pick');
      const v = voices().find((x) => pitch(x) === want);
      const note = () => $('#voice-note');
      if (!v) { note().textContent = 'This computer has no ' + want + ' voice to pick. The list shows the ones it has.'; return; }
      draft.voiceName = v.name; rerender('voice'); note().textContent = 'Picked ' + voiceLabel(v) + '. Press "Test the voice" to hear it.';
      return save();
    }
    if (b.id === 'test-voice') return testVoice();
    if (b.hasAttribute('data-pick-helper')) {
      const c = draft.contacts[+b.getAttribute('data-pick-helper')] || {};
      Object.assign(draft.family, { name: String(c.name || '').trim(), phone: String(c.phone || '').trim(), email: String(c.email || '').trim() });
      rerender('family'); document.querySelector('#sec-family [data-pick-helper][aria-pressed="true"]').focus();
      return save();
    }
    if (b.hasAttribute('data-undo-remove') && removed) {
      draft.contacts.splice(Math.min(removed.i, draft.contacts.length), 0, removed.c);
      removed = null; rerender('contacts'); rerender('family'); $('#h-contacts').focus();
      return save();
    }
    if (b.hasAttribute('data-add-contact')) {
      draft.contacts = (draft.contacts || []).concat([{ name: '', relation: '', email: '', phone: '' }]);
      rerender('contacts');
      const inputs = document.querySelectorAll('#sec-contacts input[data-path$=".name"]');
      inputs[inputs.length - 1].focus();
      return;
    }
    if (b.hasAttribute('data-remove')) {
      const i = +b.getAttribute('data-remove');
      removed = { i, c: draft.contacts.splice(i, 1)[0] };
      rerender('contacts'); rerender('family'); $('#h-contacts').focus();
      return save();
    }
    if (b.hasAttribute('data-make-topic')) {
      draft.family.ntfyTopic = makeCode();
      const i = $('#f-family-ntfyTopic'); i.value = draft.family.ntfyTopic; i.focus(); i.select();
      alertNote('Here is your private code. Type it into the ntfy app on your phone, or press "Copy the code".');
      return save();
    }
    if (b.hasAttribute('data-copy-topic')) return copyCode();
    if (b.hasAttribute('data-test-alert')) return testAlert();
    if (b.hasAttribute('data-delete-ask')) return askDelete();
    if (b.hasAttribute('data-delete-no')) { rerender('privacy'); $('#h-privacy').focus(); return; }
    if (b.hasAttribute('data-delete-yes')) return doDelete();
    if (b.hasAttribute('data-toggle-key')) {
      const i = $('#f-apiKey'); const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
      return;
    }
    const jump = b.getAttribute('data-jump');
    if (jump) return jumpTo(jump);
    const go = b.getAttribute('data-go');
    if (go === 'next') { save(); step = Math.min(STEPS.length - 1, step + 1); return renderWizard(); }
    if (go === 'back') { step = Math.max(0, step - 1); return renderWizard(); }
    if (go === 'finish') {
      return save({ setupDone: true }).then(() => {
        deleted = false;
        $('#app').innerHTML = '<section class="s-card card welcome"><img src="assets/avatar.svg" width="96" height="96" alt="">' +
          '<h2 tabindex="-1">' + esc(NAME) + ' is ready.</h2><p>' + (draft.hasApiKey ? '' : 'Remember to add the connection key. ') +
          'You can close this window. The home screen is behind it.</p>' +
          '<div class="wiz-nav"><button type="button" data-go="all">See all settings</button>' +
          '<button type="button" class="primary" data-go="close">Close this window</button></div></section>';
        $('#app h2').focus();
      });
    }
    if (go === 'all') { wizard = false; return render(); }
    if (go === 'close') return window.close();
  });
  $('#rerun').addEventListener('click', () => { wizard = true; step = 1; render(); });

  document.addEventListener('input', (e) => {
    const p = e.target.getAttribute && e.target.getAttribute('data-path');
    if (p) set(draft, p, e.target.value);
  });
  document.addEventListener('change', (e) => {
    const p = e.target.getAttribute && e.target.getAttribute('data-path');
    if (!p) return;
    set(draft, p, e.target.value);
    if (/^contacts\.\d+\.name$/.test(p)) { // keep the legend and Remove label in step with the name
      const fs = e.target.closest('fieldset'), i = +p.split('.')[1] + 1, n = e.target.value.trim();
      fs.querySelector('legend').textContent = 'Person ' + i + (n ? ': ' + n : '');
      fs.querySelector('.remove span').textContent = 'Remove ' + (n || 'this person');
    }
    if (/^contacts\./.test(p)) rerender('family'); // the helper picker lists them (a no-op when not on screen)
    const cm = /^contacts\.(\d+)\./.exec(p); // a family edit of a contact saved by voice: now the family entered it (trusted)
    if (cm && draft.contacts[+cm[1]]) delete draft.contacts[+cm[1]].added;
    if (p === 'family.name') {
      document.querySelectorAll('[data-fam-name]').forEach((el) => { el.textContent = famName() || 'my family'; });
      document.querySelectorAll('[data-pick-helper]').forEach((x) => x.setAttribute('aria-pressed', String(x.querySelector('.choice-label').textContent.trim() === famName())));
    }
    save();
  });

  // ---------- changes made elsewhere (Barnaby learned a contact, another window) ----------
  const SECTION_OF = { userName: 'name', city: 'name', textScale: 'text', ttsVoice: 'voice', voiceName: 'voice', speechRate: 'voice', muted: 'voice',
    email: 'email', photos: 'photos', video: 'video', contacts: 'contacts', family: 'family', scamShield: 'safety', startAtLogin: 'safety', wakeWord: 'safety', mode: 'mode',
    dockPanel: 'mode', allowCommands: 'commands', brainModel: ['advanced', 'brain'] };
  function changedElsewhere(pub) {
    if (!pub) return;
    const was = base, now = patch(normalize(pub)), mine = patch();
    fromMain(pub);
    draft.hasApiKey = !!pub.hasApiKey;
    const redo = new Set();
    for (const k of Object.keys(now)) {
      if (k === 'apiKey' || J(now[k]) === J(was[k]) || J(now[k]) === J(mine[k])) continue; // unchanged, or our own save coming back
      draft[k] = JSON.parse(J(normalize(pub)[k]));
      [].concat(SECTION_OF[k] || 'advanced').forEach((x) => redo.add(x));
    }
    redo.forEach(rerender);
  }

  // ---------- start ----------
  function normalize(s) {
    const d = JSON.parse(JSON.stringify(s || {}));
    ['email', 'photos', 'video', 'family'].forEach((k) => { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; });
    if (!Array.isArray(d.contacts)) d.contacts = [];
    if (d.family.alertConsent !== 'tell_family') d.family.alertConsent = 'just_me';
    d.family.weeklyNote = !!d.family.weeklyNote;
    d.dockPanel = d.dockPanel !== false;
    d.allowCommands = d.allowCommands !== false;
    if (!VOICE_CHOICES.some((v) => v[0] === d.ttsVoice)) d.ttsVoice = NATURAL[0][0]; // not chosen yet: Ethan
    // A family change still waiting its day shows as asked (the note says when it takes effect).
    for (const x of Array.isArray(d.pendingFamily) ? d.pendingFamily : []) if (x && x.field) d.family[x.field] = x.value;
    return d;
  }
  function load(s) {
    draft = normalize(s);
    fromMain(draft);
  }
  if (h.on) h.on('settings-changed', changedElsewhere);
  $('#s-title').textContent = 'Settings for ' + NAME;
  document.title = NAME + ' settings';
  $('#rerun').innerHTML = icon('play') + '<span>Set up again, step by step</span>';
  h.getSettings().then((s) => {
    load(s);
    wizard = !draft.setupDone;
    if (h.isDemo) step = Math.min(STEPS.length - 1, +new URLSearchParams(location.search).get('step') || 0); // review a step: ?demo=firstrun&step=3
    status('Changes save by themselves.');
    if (!fromHash()) render();
  });
})();
