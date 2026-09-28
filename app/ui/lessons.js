// "My lessons" view (UX 10.5): list -> big-print lesson card -> walk through / print / delete (with a confirm card).
// Used inside the launcher (LessonsView.mount) and on its own by lessons.html.
(function () {
  const h = window.helper;
  const NAME = (h.product && h.product.assistantName) || 'Barnaby';
  const PAGE = 6; // max items per view, then "Show more" (UX 3.8)
  let root = null, onHome = null, shown = PAGE, current = null, confirming = false, note = '';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); // exact on-screen words come in **bold**
  const day = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const o = { weekday: 'long', month: 'long', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('en-US', o);
  };
  const who = (s) => {
    const by = String(s.by || s.who || '').toLowerCase();
    if (by) return by === 'you' || by === 'person' || by === 'user';
    if (typeof s.level === 'number') return s.level >= 1;
    if (typeof s.doneByPerson === 'number') return s.doneByPerson > 0;
    return null; // unknown: say nothing
  };
  const btn = (cls, iconName, label, attrs) =>
    '<button type="button" class="' + cls + '" ' + (attrs || '') + '>' + window.icon(iconName) + '<span>' + label + '</span></button>';

  async function showList() {
    current = null; confirming = false;
    let list = [];
    try { list = (await h.listLessons()) || []; } catch (_) { list = []; }
    const items = list.slice(0, shown).map((l) =>
      '<li>' + btn('lesson-item', 'lessons', '<b>' + esc(l.title) + '</b><small>Saved on ' + esc(day(l.created)) + '</small>', 'data-open="' + esc(l.id) + '"') + '</li>').join('');
    root.innerHTML =
      '<div class="view-bar">' + btn('back', 'home', 'Back to home', 'data-act="home"') + '<h2 id="lessons-title" tabindex="-1">My lessons</h2></div>' +
      (note ? '<p class="notice status-line" role="status">' + esc(note) + '</p>' : '') +
      '<div class="lesson-list-wrap">' +
      (list.length
        ? '<p class="status-line">Steps ' + esc(NAME) + ' saved for you. Open one to read it, print it, or try it again.</p><ul class="lesson-list">' + items + '</ul>' +
          (list.length > shown ? btn('show-more', 'more', 'Show more lessons', 'data-act="more"') : '')
        : '<div class="card"><h3>No lessons yet.</h3><p>When ' + esc(NAME) + ' helps you with something, he saves the steps here so you can do it again.</p></div>') +
      '</div>';
    note = '';
  }

  async function showLesson(id) {
    let l = null;
    try { l = await h.getLesson(id); } catch (_) { l = null; }
    if (!l) { note = 'That lesson is not here any more.'; return showList(); }
    current = l; confirming = false;
    const steps = (l.steps || []).map((s, i) => {
      s = typeof s === 'string' ? { text: s } : (s || {});
      const w = who(s);
      return '<li class="step"><span class="tick" aria-hidden="true"></span><span class="step-num" aria-hidden="true">' + (i + 1) + '</span><div>' +
        '<p class="step-text"><span class="sr-only">Step ' + (i + 1) + '. </span>' + rich(s.text) + '</p>' +
        (s.see ? '<p class="step-see">You\'ll see: ' + rich(s.see) + '</p>' : '') +
        (w === true ? '<span class="who you">' + window.icon('person') + 'You did this step</span>' : '') +
        (w === false ? '<span class="who"><img src="assets/avatar.svg" alt="">' + esc(NAME) + ' did this step</span>' : '') +
        '</div></li>';
    }).join('');
    const needs = Array.isArray(l.needs) ? l.needs.join(' · ') : l.needs;
    const made = day(l.created);
    root.innerHTML =
      '<div class="view-bar">' + btn('back', 'back', 'Back to my lessons', 'data-act="list"') +
        '<h2 id="lesson-title" tabindex="-1">' + esc(l.title) + '</h2></div>' +
      '<article class="lesson-card card" aria-labelledby="lesson-title">' +
        '<p class="print-title" aria-hidden="true">' + esc(l.title) + '</p>' +
        '<p class="lesson-meta">Saved on ' + esc(made) + ' · ' + (l.steps || []).length + ' steps</p>' +
        (needs ? '<p class="needs"><strong>You\'ll need:</strong> ' + esc(needs) + '</p>' : '') +
        // actions first, so nobody has to scroll past the steps to use them
        '<div class="lesson-actions">' +
          btn('primary', 'play', 'Walk me through it', 'data-act="replay"') +
          btn('', 'print', 'Print these steps', 'data-act="print"') +
          btn('delete', 'trash', 'Delete this lesson', 'data-act="delete"') +
        '</div>' +
        '<div class="confirm-slot"></div>' +
        '<ol class="steps">' + steps + '</ol>' +
        (l.alsoFor ? '<p class="also"><strong>Also works for:</strong> ' + rich(l.alsoFor) + '</p>' : '') +
        '<p class="print-footer">Made by ' + esc(NAME) + ' on ' + esc(made) + '</p>' +
      '</article>';
  }

  function showConfirm() {
    confirming = true;
    root.querySelector('.lesson-actions').hidden = true;
    root.querySelector('.confirm-slot').innerHTML =
      '<div class="confirm-card card" role="group" aria-labelledby="confirm-title">' +
        '<h3 id="confirm-title" tabindex="-1">Delete the lesson "' + esc(current.title) + '"?</h3>' +
        '<p>It will be gone from this computer. It can\'t be brought back.</p>' +
        '<div class="confirm-actions">' +
          btn('danger', 'trash', 'Yes, delete this lesson', 'data-act="delete-yes"') +
          btn('', 'check', 'No, keep it', 'data-act="delete-no"') +
        '</div></div>';
    root.querySelector('#confirm-title').focus(); // focus the question, not "Yes" (UX 11.3)
  }

  function hideConfirm() {
    confirming = false;
    root.querySelector('.confirm-slot').innerHTML = '';
    const a = root.querySelector('.lesson-actions');
    a.hidden = false;
    a.querySelector('[data-act="delete"]').focus();
  }

  async function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    const open = b.getAttribute('data-open');
    if (open) { await showLesson(open); return focusTitle(); }
    switch (b.getAttribute('data-act')) {
      case 'home': return onHome && onHome();
      case 'list': await showList(); return focusTitle();
      case 'more': shown += PAGE; await showList(); return;
      case 'replay': return h.replayLesson(current.id);
      case 'print': return window.print();
      case 'delete': return showConfirm();
      case 'delete-no': return hideConfirm();
      case 'delete-yes': {
        const title = current.title;
        await h.deleteLesson(current.id);
        note = 'The lesson "' + title + '" was deleted.';
        await showList();
        return focusTitle();
      }
    }
  }

  function focusTitle() { const t = root.querySelector('h2'); if (t) t.focus(); }

  window.LessonsView = {
    mount(el, opts) {
      root = el; onHome = (opts && opts.onHome) || null;
      root.addEventListener('click', onClick);
    },
    show() { shown = PAGE; return showList(); },
    open(id) { return showLesson(id).then(focusTitle); },
    // lesson-saved: refresh the list if it is showing (never yank the person out of an open lesson)
    refresh() { if (root && !current) return showList(); },
    // Esc: close the confirm card, then the lesson; returns false when there is nothing left to close here.
    back() {
      if (confirming) { hideConfirm(); return true; }
      if (current) { showList().then(focusTitle); return true; }
      return false;
    },
  };

  // Standalone page (lessons.html).
  if (document.body.dataset.page !== 'lessons') return;
  document.addEventListener('click', (e) => { // 600 ms double-activation guard (UX 4.2)
    const b = e.target.closest('button'); if (!b) return;
    const now = Date.now();
    if (now - (b._last || 0) < 600) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b._last = now;
  }, true);
  const scale = (s) => document.documentElement.style.setProperty('--ui-scale', Math.min(1.6, Math.max(1, +s.textScale || 1)));
  h.getSettings().then(scale);
  h.on('settings-changed', scale);
  h.on('lesson-saved', () => window.LessonsView.refresh());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.LessonsView.back(); });
  window.LessonsView.mount(document.getElementById('lessons-root'), {
    onHome: () => (h.isDemo ? (location.href = 'launcher.html') : h.goHome()),
  });
  window.LessonsView.show();
})();
