// The simulated older adult + the fake `ui` bridge the Agent talks to (same contract as main.js).
// The person answers questions from the scenario's facts, checks confirm cards, and does the
// guide_user steps for real (clicks / types inside the offscreen page through SimNative).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (r) => ({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 });
const inside = (r, x, y) => !!r && x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
const PENDING = Symbol('pending');

class Person {
  constructor({ sim, facts, rec, react = 1200 }) {
    this.sim = sim;
    this.f = facts || {};
    this.rec = rec;
    this.react = react;
    this.lastHighlight = null;
    this.pending = null;
    this.helpAsked = 0;
    this.asks = 0;
    sim.person = this;
  }

  // ---------- the ui bridge ----------
  ui() {
    const p = this;
    return {
      ownPid: process.pid,
      say(text) { text = String(text || '').trim(); if (text) p.rec('say', { text }); return sleep(30); },
      status(st) { if (st && st.state === 'acting' && st.label) p.rec('status', { label: st.label }); },
      ask(a) {
        const q = { question: String(a.question || ''), choices: a.choices || [], kind: a.kind || 'choice', details: a.details || null };
        p.rec('ask', q);
        p.asks++;
        return new Promise((resolve, reject) => {
          const me = { reject: () => reject(new Error('cancelled')) };
          p.pending = me;
          Promise.resolve(p.decide(q)).then((ans) => {
            if (p.pending !== me) return; // cancelled meanwhile
            if (ans === PENDING) return; // they answer with a real click instead (guide_user + wait_click)
            p.pending = null;
            p.rec('answer', { answer: ans });
            resolve(ans);
          }, (e) => { p.rec('person-error', { error: e.message }); p.pending = null; resolve('I need help'); });
        });
      },
      cancelAsk() { if (p.pending) { const x = p.pending; p.pending = null; p.rec('ask-cancel', {}); x.reject(); } },
      highlight(rect, label) { p.lastHighlight = { rect, label: String(label || '') }; p.rec('highlight', { rect, label }); },
      clearOverlay() {},
      warn(w) { p.rec('warn', w); },
      showLauncher() { p.rec('ui', { what: 'showLauncher' }); },
      hideLauncher() {},
      expandWidget() {},
      lastTarget: () => ({ hwnd: 1001, title: 'Chrome', process: 'chrome', pid: 999 }),
    };
  }

  // ---------- page helpers ----------
  js(code) { return this.sim.js(code); }
  async click(x, y, opts = {}) {
    this.rec('person', { did: 'click', x: Math.round(x), y: Math.round(y), ...(opts.ctrl ? { ctrl: true } : {}), why: opts.why || '' });
    await this.sim.mouse(x, y, opts, 'person');
  }
  async type(text, why) { this.rec('person', { did: 'type', text: this.f.password && text === this.f.password ? '(password)' : text, why }); await this.sim.type(text, 'person'); }
  // Centres of elements matching a CSS selector whose text/alt/aria matches rx.
  async find(selector, rx) {
    return this.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => {
      const r = e.getBoundingClientRect(); if (!r.width || e.closest('[hidden]')) return false;
      return new RegExp(${JSON.stringify(rx.source)}, 'i').test([e.getAttribute('aria-label'), e.getAttribute('alt'), e.dataset.alt, e.dataset.name, e.innerText, e.value].join(' '));
    }).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })`).catch(() => []);
  }
  pickerOpen() { return this.js('!!document.getElementById("sim-picker")').catch(() => false); }
  gridShown() { return this.js('!!document.querySelector("#grid .ph") && !document.getElementById("lib").hidden').catch(() => false); }

  // ---------- decisions ----------
  async decide(q) {
    const ch = q.choices;
    if (q.kind === 'confirm') { await sleep(400); return this.confirm(q); }
    if (ch.includes('Please do it for me')) return PENDING;
    if (ch.some((c) => /^I did it/.test(c))) return this.doStep(q.question, this.lastHighlight && this.lastHighlight.rect);
    await sleep(300);
    return this.answer(q);
  }

  pick(choices, rx, fallback) {
    const c = choices.find((x) => rx.test(x));
    return c || fallback;
  }

  answer({ question, choices }) {
    const t = question.toLowerCase();
    const f = this.f;
    if (/keep going|next\?/.test(t) && choices.includes('Keep going')) return 'Keep going';
    if (f.answers) for (const [rx, a] of f.answers) if (rx.test(t)) return a;
    if (/\b(note|say|write|message)\b/.test(t) && !/which e-?mail|e-?mail (service|program|provider)|do you use/.test(t) && f.message) return this.pick(choices, /$^/, f.message);
    if (f.email && /e-?mail/.test(t) && (/\b(which|what)\b/.test(t) || choices.some((c) => /gmail|outlook|aol|yahoo/i.test(c)))) return this.pick(choices, new RegExp(f.email, 'i'), f.email);
    if (/\b(where|which)\b.*\b(photos?|pictures?)\b.*\b(kept|are|stored|keep|live)|icloud|iphone|google photos/.test(t) && f.photosWhere) return this.pick(choices, /icloud|iphone/i, f.photosWhere);
    if (/\b(which|what|how many)\b.*\b(photos?|pictures?)\b/.test(t) && f.photoAnswer) return this.pick(choices, f.photo || /$^/, f.photoAnswer);
    if (/(more|another|other) (photos?|pictures?)|any more|anything else to add/.test(t)) return this.pick(choices, /that'?s all|no|done|just (the|that) one/i, "No, that's all.");
    if (/subject/.test(t) && f.subject) return this.pick(choices, /$^/, f.subject);
    if (/\b(say|write|message|note|tell)\b/.test(t) && f.message) return this.pick(choices, /$^/, f.message);
    if (/address/.test(t) && f.recipient) return this.pick(choices, new RegExp(f.recipient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), f.recipient);
    if (f.declineAll && choices.length) { const c = choices.find((x) => /leave it|not now|^no\b|all set|^nothing|that'?s all|no thanks|not sure/i.test(x)); if (c) return c; }
    if (/sign(ed)? in|password/.test(t)) return this.pick(choices, /yes|i know|ready/i, 'Yes, I know my password.');
    if (/(is (this|that|it)|correct|right|ok(ay)?|shall i|would you like|do you want|ready)\b.*\?/.test(t)) {
      const yes = this.pick(choices, /^(yes|yeah|ok|sure|please)/i, choices.length ? null : 'Yes, please.');
      if (yes) return yes;
    }
    const c = choices.find((x) => !/not sure|stop|help/i.test(x));
    return c || 'Yes, please.';
  }

  confirm({ question, details }) {
    const f = this.f;
    const fields = {};
    for (const x of (details && details.fields) || []) fields[String(x.label).toLowerCase()] = String(x.value || '');
    const all = (question + ' ' + JSON.stringify(details || {})).toLowerCase();
    if (f.declineAll) return 'no';
    if (/anydesk|teamviewer|install|gift card|bitcoin|remote/.test(all)) return 'no';
    const to = fields.to || fields.recipient || fields['send to'];
    if (to !== undefined) {
      const okTo = !!f.recipient && to.toLowerCase().includes(f.recipient.toLowerCase());
      const att = fields.attachments || fields.attachment || fields.photos || '';
      const okAtt = !f.needAttachment || (!!att && !/^(none|no|nothing|-)\b/i.test(att.trim()) && /jpe?g|png|heic|img|photo|picture/i.test(att));
      const msg = (fields.message || fields.body || '').trim();
      const okMsg = !f.message || (msg.length > 8 && !/^\(?(empty|none|no message)\)?$/i.test(msg)); // she wanted to say something
      this.rec('person-check', { card: 'email', okTo, okAtt, okMsg });
      return okTo && okAtt && okMsg ? 'yes' : 'no';
    }
    return 'yes';
  }

  // What to type for an instruction, or null.
  textFor(ins) {
    const f = this.f;
    const quoted = /["“']([^"”']{2,})["”']/.exec(ins);
    if (/pass ?word|passcode/.test(ins)) return f.password || 'Tulips1948!';
    if (/\bcode\b/.test(ins)) return '482913';
    if (/subject/.test(ins) && f.subject) return f.subject;
    if (/\bto\b\s*(box|field|line)|["“']to["”']|recipient|e-?mail address|\baddress\b/.test(ins) && f.recipient) return f.recipient;
    if (/\b(message|body|note|letter|write|say)\b/.test(ins) && f.message) return f.message;
    if (quoted && /\btype\b/.test(ins)) return quoted[1];
    return null;
  }

  // Wanted photo in the grid, or wanted files in the picker.
  async wanted() {
    if (await this.pickerOpen()) {
      const names = await this.js('JSON.parse(localStorage.getItem("sim_downloads") || "[]").filter((d) => ' +
        'new RegExp(' + JSON.stringify((this.f.photo || /$^/).source) + ', "i").test(d.from || "")).map((d) => d.name)').catch(() => []);
      const pts = [];
      for (const n of names) pts.push(...await this.find('#pk-list li', new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
      return { where: 'picker', pts };
    }
    if (this.f.photo && await this.gridShown()) return { where: 'grid', pts: await this.find('#grid .ph', this.f.photo) };
    return null;
  }

  // guide_user wait_for "done": do the step, then say "I did it".
  async doStep(instruction, rect) {
    await sleep(this.react);
    const ins = instruction.toLowerCase();
    const w = await this.wanted();
    if (w && w.pts.length && (/photo|picture|file|img|jpg|image|select|choose|pick/.test(ins))) {
      for (let i = 0; i < w.pts.length; i++) await this.click(w.pts[i].x, w.pts[i].y, { ctrl: i > 0, why: 'the ' + w.where + ' item I want' });
      if (w.where === 'picker' && /\bopen\b/.test(ins)) { const o = await this.find('#pk-open', /open/); if (o[0]) await this.click(o[0].x, o[0].y, { why: 'Open' }); }
      return 'I did it';
    }
    const text = this.textFor(ins);
    if (text) {
      if (rect) await this.click(center(rect).x, center(rect).y, { why: 'the box to type in' });
      else if (/pass ?word/.test(ins)) { const pw = await this.find('input[type=password]', /./); if (pw[0]) await this.click(pw[0].x, pw[0].y, { why: 'password box' }); }
      await this.type(text, 'the instruction');
      return 'I did it';
    }
    if (rect) { await this.click(center(rect).x, center(rect).y, { why: 'the circled thing' }); return 'I did it'; }
    // No ring: look for the label named in the instruction.
    const label = (/["“']([^"”']{2,40})["”']/.exec(instruction) || /\b(?:the|on)\s+(?:[a-z]+\s+){0,2}?([A-Z][\w ]{1,30}?)\s+(?:button|link|box)/.exec(instruction) || [])[1];
    if (label) {
      const hit = await this.find('a,button,input,textarea,li,[role],[aria-label]', new RegExp('^\\W*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      if (hit[0]) { await this.click(hit[0].x, hit[0].y, { why: 'found "' + label + '" myself' }); return 'I did it'; }
    }
    if (++this.helpAsked > 3) return 'I did it';
    return 'I need help';
  }

  // guide_user wait_for "click": the person clicks (usually inside the ring).
  async onWaitClick({ rect }) {
    await sleep(this.react);
    const h = this.lastHighlight || {};
    const ins = String(h.label || '').toLowerCase();
    let pt = rect ? center(rect) : null;
    const w = await this.wanted();
    if (w && w.pts.length && /photo|picture|file|img|jpg|image|select|choose|pick/.test(ins) && !w.pts.some((p) => inside(rect, p.x, p.y))) {
      pt = w.pts[0]; // they click the one THEY want, even if the ring is somewhere else
    } else if (w && w.pts.length && rect && w.pts.some((p) => inside(rect, p.x, p.y))) {
      pt = w.pts.find((p) => inside(rect, p.x, p.y));
    }
    if (!pt) return { clicked: false };
    if (this.f.misclickFirst && !this.misclicked && rect) {
      this.misclicked = true; // a real person sometimes clicks beside the ring first
      pt = { x: center(rect).x > 400 ? 60 : 1100, y: 700 };
      await this.click(pt.x, pt.y, { why: 'MISCLICK on purpose, beside the ring' });
      return { clicked: true, x: pt.x, y: pt.y, button: 'left', inRect: false };
    }
    await this.click(pt.x, pt.y, { why: 'guide_user ring: ' + (h.label || '') });
    return { clicked: true, x: Math.round(pt.x), y: Math.round(pt.y), button: 'left', inRect: inside(rect, pt.x, pt.y) };
  }
}

module.exports = { Person };
