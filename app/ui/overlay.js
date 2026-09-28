// Full-screen overlay window: teaching highlight (ring + arrow + label) and the calm warning card.
// Main makes the window click-through except while a warning shows. Browser review: ?demo=highlight|warning
// (&at=x,y,w,h to ring any rectangle).
(function () {
  'use strict';
  if (!window.helper) window.helper = pageStub();
  const H = window.helper;
  const DEMO = !!H.isDemo;
  const $ = (id) => document.getElementById(id);
  const P = H.product || {};
  const q = new URLSearchParams(location.search);
  const PAD = 12, BAND = 9, ARROW = 48, EDGE = 16;

  function applySettings(s) {
    s = s || {};
    const scale = Number(q.get('scale')) || Number(s.textScale) || 1;
    document.documentElement.style.setProperty('--ui-scale', String(Math.max(1, Math.min(1.6, scale))));
    if ((q.get('theme') || s.theme) === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
  }
  const settings = () => Promise.resolve().then(() => H.getSettings()).catch(() => ({})).then((s) => s || {});
  settings().then(applySettings);

  // 600 ms double-activation guard (UX 4.2)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const now = Date.now();
    if (now - (b._lastClick || 0) < 600) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b._lastClick = now;
  }, true);

  let seq = 0; // newest message wins (a warning waits for settings; a clear may arrive meanwhile)

  function clear() {
    $('hl').hidden = true;
    $('warning').hidden = true;
    $('wActions').textContent = '';
  }

  function box(el, x, y, w, h) {
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (w != null) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
  }

  function highlight(m) {
    $('warning').hidden = true;
    const [x, y, w, h] = (Array.isArray(m.rect) ? m.rect : []).map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return clear();
    const r = { x: x - PAD, y: y - PAD, w: w + 2 * PAD, h: h + 2 * PAD };
    const hl = $('hl'), ring = $('ring'), arrow = $('arrow'), bubble = $('bubble');
    box($('spot'), r.x, r.y, r.w, r.h);
    box(ring, r.x, r.y, r.w, r.h);
    hl.classList.toggle('no-dim', m.dim === false); // main may pass dim:false when the helper clicks itself
    const label = String(m.label || '').trim();
    bubble.textContent = label;
    bubble.hidden = !label;
    arrow.style.display = m.arrow === false ? 'none' : '';
    hl.hidden = false; // visible before measuring the bubble

    // Label on the side with the most room; the arrow sits between it and the ring (clear of the 6% pulse).
    const o = { l: r.x - BAND, t: r.y - BAND, r: r.x + r.w + BAND, b: r.y + r.h + BAND };
    // Our docked panel (main passes its rect as avoid): the free screen ends where the panel starts.
    const av = Array.isArray(m.avoid) && m.avoid.length === 4 ? m.avoid.map(Number) : null;
    const W = av && av.every(Number.isFinite) && av[0] > r.x + r.w ? Math.min(window.innerWidth, av[0]) : window.innerWidth;
    const Hh = window.innerHeight;
    const room = { bottom: Hh - o.b, top: o.t, right: W - o.r, left: o.l };
    const side = Object.keys(room).reduce((a, k) => (room[k] > room[a] ? k : a), 'bottom');
    const gapV = 8 + Math.ceil(0.03 * r.h), gapH = 8 + Math.ceil(0.03 * r.w);
    const cx = (o.l + o.r) / 2, cy = (o.t + o.b) / 2;
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const cX = (v) => Math.max(EDGE, Math.min(v, W - bw - EDGE));
    const cY = (v) => Math.max(EDGE, Math.min(v, Hh - bh - EDGE));
    let ax, ay, rot, bx, by;
    if (side === 'bottom') { ax = cx - 24; ay = o.b + gapV; rot = 0; bx = cX(cx - bw / 2); by = ay + ARROW + 6; }
    else if (side === 'top') { ax = cx - 24; ay = o.t - gapV - ARROW; rot = 180; bx = cX(cx - bw / 2); by = ay - 6 - bh; }
    else if (side === 'right') { ax = o.r + gapH; ay = cy - 24; rot = -90; bx = ax + ARROW + 6; by = cY(cy - bh / 2); }
    else { ax = o.l - gapH - ARROW; ay = cy - 24; rot = 90; bx = ax - 6 - bw; by = cY(cy - bh / 2); }
    box(arrow, Math.round(ax), Math.round(ay));
    arrow.style.transform = 'rotate(' + rot + 'deg)';
    box(bubble, Math.round(cX(bx)), Math.round(cY(by)));
  }

  function button(label, cls, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', () => { clear(); H.overlayDismiss(action); });
    return b;
  }

  async function warning(m, my) {
    $('hl').hidden = true;
    const s = await settings(); // fetched fresh: main does not send settings-changed to the overlay
    if (my !== seq) return;
    applySettings(s);
    const scam = m.level === 'scam';
    $('wTitle').textContent = m.title || (scam ? 'This looks like a scam.' : 'Please read this.');
    $('wBody').textContent = m.body || '';
    $('markScam').style.display = scam ? '' : 'none';
    $('markInfo').style.display = scam ? 'none' : '';
    const acts = $('wActions');
    acts.textContent = '';
    if (scam) {
      acts.append(button('Close this page for me', 'primary', 'close_page'));
      const fam = s.family || {};
      if (fam.phone) acts.append(button(fam.name ? 'Call ' + fam.name : 'Call my family', '', 'call_family'));
      acts.append(button('It’s something else', '', null));
    } else {
      acts.append(button('Close this message', 'primary', null));
    }
    $('wTrust').textContent = P.trustLine || '';
    $('wTrust').hidden = !scam || !P.trustLine;
    $('warning').hidden = false;
    $('wTitle').focus(); // focus the headline, not a button, so a stray Enter does nothing
  }

  let last = null; // the showing highlight, re-placed on resize
  function onOverlay(m) {
    const my = ++seq;
    last = m && m.type === 'highlight' ? m : null;
    if (!m || m.type === 'clear') return clear();
    if (m.type === 'highlight') return highlight(m);
    if (m.type === 'warning') return warning(m, my);
  }

  try { H.on('overlay', onOverlay); } catch (_) {}
  window.addEventListener('resize', () => { if (last) highlight(last); });

  // ---------- browser demo ----------
  if (DEMO) {
    document.body.classList.add('demo');
    const which = q.get('demo') || 'highlight';
    // demo-stub.js auto-runs its own script of the same name at load + 600 ms; ours runs after it.
    const clash = H._demo && Array.isArray(H._demo.scripts) && H._demo.scripts.includes(which);
    if (clash) window.addEventListener('load', () => setTimeout(() => runDemo(which), 700));
    else runDemo(which);
  }

  function runDemo(which) {
    if (!['highlight', 'warning', 'scam'].includes(which)) return; // stub-only scenario
    const app = document.createElement('div');
    if (which !== 'highlight') {
      app.className = 'demo-app scam';
      app.textContent = 'Your computer has a virus! Call 1-800-555-0199 now to fix it.';
      document.body.prepend(app);
      onOverlay({ type: 'warning', level: q.get('level') || 'scam', title: 'This looks like a scam.',
        body: 'This page says your computer has a virus and shows a phone number. Microsoft never does that. Your computer is fine — don’t call the number.' });
    } else {
      app.className = 'demo-app';
      app.innerHTML = '<div class="bar"><span class="new" id="demoNew">New mail</span><span>Reply</span><span>Delete</span><span>Archive</span></div>' +
        '<div class="list">Anne Marie Kowalski — Garden party on Sunday<br>Pharmacy — Your order is ready<br>Library — Book club news</div>';
      document.body.prepend(app);
      const at = (q.get('at') || '').split(',').map(Number);
      let rect;
      if (at.length === 4 && at.every(Number.isFinite)) rect = at;
      else { const b = $('demoNew').getBoundingClientRect(); rect = [b.left, b.top, b.width, b.height]; }
      onOverlay({ type: 'highlight', rect, label: 'Click “New mail” — it starts a new email.', arrow: true });
    }
  }

  function pageStub() {
    return {
      isDemo: true,
      product: {}, // the name and trust line live only in src/product.js; demo-stub.js supplies them
      getSettings: () => Promise.resolve({ textScale: 1, family: { name: 'Anna', phone: '5550142' } }),
      overlayDismiss: (a) => console.info('[demo] helper.overlayDismiss', a),
      on: () => () => {},
    };
  }
})();
