// Launcher (home screen), UX 11.1. Talk / tiles / Family + Lessons views / settings + desktop row.
(function () {
  const h = window.helper;
  const P = h.product || {};
  const NAME = P.assistantName || 'Barnaby';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let settings = {};
  let view = 'home';

  // A second click on the same button within 600 ms is ignored (UX 4.2: habitual double-clickers).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const now = Date.now();
    if (now - (b._last || 0) < 600) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b._last = now;
  }, true);

  const TILES = {
    email: ['Email', 'Read and write your email'],
    photos: ['Photos', 'Look at your pictures'],
    video: ['Video call', 'See and talk to your family'],
    internet: ['Internet', 'Look things up'],
    family: ['Family', 'Email or call someone'],
    lessons: ['My lessons', 'Steps saved for you'],
    scam: ['Is this a scam?', 'Check a message or a call'],
    support: ['My computer is acting up', 'Slow, stuck, or no sound'],
    games: ['Games', 'A game of cards'],
  };

  // ---------- static labels (the name only ever comes from helper.product) ----------
  document.title = P.name || NAME;
  document.querySelector('.brand').alt = P.name || NAME;
  $('talk-label').textContent = 'Talk to ' + NAME;
  document.querySelector('.talk-icon').innerHTML = icon('talk');
  $('settings-btn').innerHTML = icon('settings') + '<span>Settings (for family)</span>';
  $('desktop-btn').innerHTML = icon('desktop') + '<span>Go to the desktop</span>';
  $('trust').innerHTML = icon('shield') + '<span>' + esc(P.trustLine || '') + '</span>';
  document.querySelector('#family-view .back').innerHTML = icon('home') + '<span>Back to home</span>';

  // ---------- clock, date, greeting ----------
  function tick() {
    const now = new Date();
    const hr = now.getHours();
    const part = hr >= 5 && hr < 12 ? 'Good morning' : hr >= 12 && hr < 17 ? 'Good afternoon' : 'Good evening';
    const name = (settings.userName || '').trim();
    $('greeting').textContent = part + (name ? ', ' + name : '');
    $('clock').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    $('date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  async function weather() {
    let w = null;
    try { w = await h.getWeather(); } catch (_) { w = null; }
    const el = $('weather');
    if (!w || w.tempF == null || isNaN(+w.tempF)) { el.hidden = true; return; }
    const desc = String(w.desc || '').trim().toLowerCase();
    el.innerHTML = icon('sun') + '<span>' + Math.round(+w.tempF) + '°F' + (desc ? ' and ' + esc(desc) : '') + (w.city ? ' in ' + esc(w.city) : '') + '</span>';
    el.hidden = false;
  }

  // ---------- tiles (order is the family's, never reordered) ----------
  function renderTiles() {
    const ids = (Array.isArray(settings.tiles) ? settings.tiles : Object.keys(TILES)).filter((id) => TILES[id]).slice(0, 9);
    $('tiles').innerHTML = ids.map((id) =>
      '<button type="button" class="tile" data-tile="' + id + '">' +
        '<span class="tile-icon">' + icon(id) + '</span>' +
        '<span class="tile-text"><span class="tile-label">' + esc(TILES[id][0]) + '</span>' +
        '<span class="tile-hint">' + esc(TILES[id][1]) + '</span></span></button>').join('');
  }

  // ---------- family ----------
  function initials(n) {
    const w = String(n || '?').trim().split(/\s+/);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  function renderFamily() {
    const people = Array.isArray(settings.contacts) ? settings.contacts.filter((c) => c && c.name) : [];
    $('family-list').innerHTML = people.length ? people.map((c) =>
      '<div class="person card">' +
        '<span class="initials" aria-hidden="true">' + esc(initials(c.name)) + '</span>' +
        '<div><h3>' + esc(c.name) + '</h3>' + (c.relation ? '<p class="relation">' + esc(c.relation) + '</p>' : '') + '</div>' +
        '<div class="person-actions">' +
          '<button type="button" class="primary" data-person="' + esc(c.name) + '" data-action="email">' + icon('email') + '<span>Send an email</span></button>' +
          '<button type="button" class="primary" data-person="' + esc(c.name) + '" data-action="video">' + icon('video') + '<span>Video call</span></button>' +
        '</div></div>').join('')
      : '<div class="card"><h3>No family added yet.</h3><p>Someone in your family can add names and email addresses in Settings.</p>' +
        '<button type="button" data-go="settings">' + icon('settings') + '<span>Open Settings (for family)</span></button></div>';
  }

  // ---------- views: the top and the Talk row never move; only the middle changes ----------
  function show(name) {
    view = name;
    $('home-view').hidden = name !== 'home';
    $('family-view').hidden = name !== 'family';
    $('lessons-view').hidden = name !== 'lessons';
    $('main').scrollTop = 0;
    const done = name === 'lessons' ? window.LessonsView.show() : Promise.resolve();
    if (name === 'family') renderFamily();
    return done.then(() => {
      const f = name === 'home' ? document.querySelector('.tile') : document.querySelector('#' + name + '-view h2');
      if (f) f.focus();
      updateMore();
    });
  }
  window.LessonsView.mount($('lessons-root'), { onHome: () => show('home') });

  // ---------- "More" when the middle is taller than the window (big text sizes) ----------
  const main = $('main'), more = $('more');
  function updateMore() {
    // Judge by the space More would give back, so showing it can't keep itself showing.
    const room = more.hidden ? 0 : more.offsetHeight + parseFloat(getComputedStyle(more).marginTop || 0);
    const over = main.scrollHeight > main.clientHeight + room + 1;
    more.hidden = !over;
    if (!over) return;
    const atEnd = main.scrollTop + main.clientHeight >= main.scrollHeight - 8;
    more.dataset.end = atEnd ? '1' : '';
    more.innerHTML = atEnd ? icon('up') + '<span>Back to the top</span>' : icon('more') + '<span>More</span>';
  }
  more.addEventListener('click', () => {
    main.scrollTo({ top: more.dataset.end ? 0 : main.scrollTop + main.clientHeight * 0.8 });
    updateMore();
  });
  main.addEventListener('scroll', updateMore, { passive: true });
  if (document.fonts) document.fonts.ready.then(updateMore);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => updateMore());
    [main, $('home-view'), $('family-view'), $('lessons-view')].forEach((el) => ro.observe(el));
  }

  // ---------- clicks ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const tile = b.getAttribute('data-tile');
    if (tile === 'family' || tile === 'lessons') return show(tile);
    if (tile) return h.openTile(tile);
    const person = b.getAttribute('data-person');
    if (person) return h.openTile('family', { action: b.getAttribute('data-action'), name: person });
    const go = b.getAttribute('data-go');
    if (go === 'home') return show('home');
    if (go === 'settings') return h.openSettings();
  });
  $('talk').addEventListener('click', () => h.openTile('talk'));
  $('settings-btn').addEventListener('click', () => h.openSettings());
  $('desktop-btn').addEventListener('click', () => h.minimizeLauncher());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view !== 'home') {
      if (view === 'lessons' && window.LessonsView.back()) return;
      show('home');
    }
    // In Electron F9 is a global shortcut owned by main.js; the browser demo needs it here.
    if (e.key === 'F9' && h.isDemo) { e.preventDefault(); $('talk').click(); }
  });

  // ---------- live state from main ----------
  function applySettings(s) {
    settings = s || {};
    document.documentElement.style.setProperty('--ui-scale', Math.min(1.6, Math.max(1, +settings.textScale || 1)));
    renderTalk();
    tick();
    renderTiles();
    if (view === 'family') renderFamily();
    requestAnimationFrame(updateMore);
  }
  function talkHint() { return settings.wakeWord ? 'or say “Hello, ' + NAME + '”' : 'or press F9'; }
  h.on('settings-changed', applySettings);
  h.on('lesson-saved', () => { if (view === 'lessons') window.LessonsView.refresh(); });
  // The Talk button shows what Barnaby is doing, in the same words as the widget and the pill (ui/status.js):
  // listening like the widget's (hearing rule 5), and "Barnaby is thinking…", "Your turn…" under the label.
  let status = { state: 'idle' };
  function renderTalk() {
    const v = window.BarnabyStatus.view(status, NAME);
    const on = v.state === 'listening';
    $('talk').classList.toggle('listening', on);
    $('talk').classList.toggle('busy', v.busy);
    $('talk-label').textContent = on ? "I'm listening…" : 'Talk to ' + NAME;
    $('talk-sub').textContent = on ? 'Press to stop' : v.launcherSub || talkHint();
  }
  h.on('status', (st) => { status = st || { state: 'idle' }; renderTalk(); });

  h.getSettings().then(applySettings, () => applySettings({})).then(() => {
    // launcher.html#family, #lessons or #lessons/<id> opens that view (demo review)
    const [start, id] = location.hash.slice(1).split('/');
    if (start === 'family' || start === 'lessons') show(start).then(() => id && window.LessonsView.open(decodeURIComponent(id)));
  });
  weather();
  setInterval(tick, 10 * 1000);
  setInterval(weather, 30 * 60 * 1000);
})();
