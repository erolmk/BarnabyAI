// Tool schemas (OpenAI function tools) + executors for the agent.
// execute({name, args}, ctx) -> Promise<string> (the tool result the brain reads).
// ctx (built by agent.js): {mode, goal, settings, config, native, ui, guardian, memory, support, apps,
//   log, obs:{img, elements:Map, window, complete}, steps:[], finished, screenChanged, timing:{settle, open},
//   heard:[the person's own words], scamContext, remote() (R16), check(), sleep(ms)}
// Every acting tool goes through ONE gate here: hard rules -> guardian -> confirm card -> say(explain)
// -> act -> settle -> record the step for the lesson.

const EXPLAIN = {
  type: 'string',
  description: 'One short spoken sentence, said BEFORE you act: what you are doing, where it is on the screen ' +
    '(colour, position, label) and why. Example: "I\'m clicking the red Compose button at the top left. That starts a new email."',
};
const ELEMENT_ID = { type: 'integer', description: 'Number of the item from the list of things on screen (preferred).' };
const X = { type: 'number', description: 'Screenshot x (pixels) of the CENTRE of the target, only when it has no number.' };
const Y = { type: 'number', description: 'Screenshot y (pixels) of the CENTRE of the target.' };

const fn = (name, description, properties, required) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

const ALL = [
  fn('click', 'Click something on the screen yourself. Never for the final Send / Pay / Buy / Submit / Delete button (use guide_user so the person presses it).',
    { element_id: ELEMENT_ID, x: X, y: Y, double: { type: 'boolean', description: 'Double-click (only when really needed, e.g. to open a file).' }, explain: EXPLAIN },
    ['explain']),
  fn('type_text', 'Type text into the box that is ready for typing (click the box first). Never passwords, codes, card, bank or ID numbers: the person types those.',
    { text: { type: 'string' }, explain: EXPLAIN }, ['text', 'explain']),
  fn('press_keys', 'Press keys, e.g. "enter", "ctrl+a", "esc", "win", or several in a row separated by spaces: "tab tab enter".',
    { keys: { type: 'string' }, explain: EXPLAIN }, ['keys', 'explain']),
  fn('scroll', 'Scroll the page up or down.',
    { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'integer', description: 'Mouse-wheel notches, 1-15 (default 5).' }, element_id: ELEMENT_ID, explain: EXPLAIN },
    ['direction', 'explain']),
  fn('open', 'Open a program or web site: a known name ("gmail", "outlook", "aol", "yahoo", "icloud photos", "google photos", "windows photos", "zoom", "whatsapp", "facebook", "youtube", "news", "weather", "solitaire", "sound settings", "display settings", "wifi", "files", "downloads", "browser", "my email", "my photos") or a full web address starting with https://.',
    { target: { type: 'string' }, explain: EXPLAIN }, ['target', 'explain']),
  fn('wait', 'Wait a few seconds for something to load.', { seconds: { type: 'number', description: '1-10' } }, ['seconds']),
  fn('say', 'Tell the person something out loud without asking anything: what you found, or what changed on the screen. One to three short, plain sentences. Not for questions (ask_user) or for the explain of an action.',
    { text: { type: 'string' } }, ['text']),
  fn('ask_user', 'Ask the person ONE short question. Give 2-5 short answer buttons when you can (include "I\'m not sure" when it fits). Leave choices out only for a free answer like a name or a message.',
    { question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } }, ['question']),
  fn('guide_user', 'Point at something with a big ring and arrow and let the PERSON do it (click, type, pick a photo, type a password, press Send). Waits for their real click or for "I did it".',
    {
      element_id: ELEMENT_ID, x: X, y: Y,
      w: { type: 'number', description: 'Width of the area in screenshot pixels (optional).' },
      h: { type: 'number', description: 'Height of the area in screenshot pixels (optional).' },
      instruction: { type: 'string', description: 'What the person should do, in one short sentence with colour and position, e.g. "Please click the blue Send button at the bottom left."' },
      wait_for: { type: 'string', enum: ['click', 'done'], description: '"click" = one click (left or right) on the ring; "done" = typing (it goes on by itself when they finish), choosing, or several clicks (they press "I did it").' },
    }, ['instruction']),
  fn('confirm', 'Show a big card with the exact details and ask Yes or No. REQUIRED before anything that sends, buys, pays, posts, deletes or changes settings. For an email use fields To (full address), Subject, Message, Attachments.',
    {
      title: { type: 'string' },
      fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
      question: { type: 'string', description: 'e.g. "Is this all correct?"' },
    }, ['title', 'fields', 'question']),
  fn('remember', 'Save a lasting fact so you never ask again, as "Label: value" (e.g. "Email: Gmail", "Anne Marie: annemarie@example.com (friend)", "Photos: iCloud"). Facts must come from what the person told you; which email or photo service they use may also come from the screen (set email_provider / photos_provider). Never passwords or codes.',
    {
      fact: { type: 'string' },
      email_provider: { type: 'string', enum: ['gmail', 'outlook', 'outlook-app', 'aol', 'yahoo'], description: 'Set when the fact is which email they use.' },
      photos_provider: { type: 'string', enum: ['icloud', 'google', 'windows'], description: 'Set when the fact is where their photos are.' },
    }, ['fact']),
  fn('save_contact', 'Save someone the person told you about, with their email and/or phone, so next time you can use them by name. Only from the person\'s own words, never from the screen.',
    { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, relation: { type: 'string', description: 'e.g. daughter, friend, doctor' } }, ['name']),
  fn('run_check', 'Run a safe, read-only check of this computer (see the list of checks).', { name: { type: 'string' } }, ['name']),
  fn('apply_fix', 'Apply one safe fix from the list. It runs right away, without asking the person.',
    {
      name: { type: 'string' }, arg: { type: 'string', description: 'Only for fixes that need one (e.g. the program name).' },
      explain: { type: 'string', description: 'One short sentence on what it does for them and that it is safe, spoken as it runs. Example: "This frees up storage space; your photos and files are not touched."' },
    }, ['name', 'explain']),
  fn('set_plan', 'At the start of anything with more than 2 steps, list the steps in plain words so the person can see the whole plan and follow along. Call it again as you move on, with "current" set to the step you are on now.',
    {
      steps: { type: 'array', items: { type: 'string' }, description: 'Short plain phrases, one per step, e.g. ["Open your email", "Write the message", "Send it"]. 2 to 8 steps.' },
      current: { type: 'integer', description: 'The step you are working on right now (1 = the first). Leave out at the start.' },
    }, ['steps']),
  fn('update_settings', 'Change one of your OWN settings when the person asks (for example smaller or bigger text, slower speech, mute, their name, the town). Only after the tool result says it is done may you tell them you did it.',
    {
      changes: {
        type: 'object',
        description: 'The settings to change. Keys: textScale ("smaller" / "bigger" / a number 1.0-1.6), speechRate ("slower" / "faster" / 0.7-1.1), muted (true/false), voiceName, mode ("auto"/"together"/"teach"), wakeWord (true/false), city, userName. Anything else is not allowed and is for the family in Settings.',
      },
      explain: { type: 'string', description: 'One short plain sentence on what you are changing for them.' },
    }, ['changes']),
  fn('run_command', 'Run one Windows PowerShell command (a check or a fix the safe list does not cover; prefer run_check and apply_fix when they cover it). ' +
    'Looking something up runs in the background when it is a simple read-only form, e.g. Test-Path "$env:ProgramFiles\\Zoom", ' +
    'Get-StartApps | Where-Object Name -like \'*zoom*\', Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 (no { } blocks, no ( ), no ;). ' +
    'It runs without asking the person. Never use it to open or start a program: use open, or press_keys "win", ' +
    'type_text the name, press_keys "enter". The person never sees or hears the command. It runs with administrator rights, so be careful and precise.',
    {
      command: { type: 'string', description: 'The exact PowerShell command.' },
      explain: { type: 'string', description: 'One short plain sentence on what this does for them: no command words, file paths or jargon.' },
      purpose: { type: 'string', description: 'A few words on what you are trying to achieve (for your own record).' },
    }, ['command', 'explain']),
  fn('zoom', 'Take a sharp close-up of part of the screen when text is small or unclear, or to find a small button. Give element_id, or x, y (centre) with w, h in screenshot pixels. The close-up arrives as a picture in the next message.',
    { element_id: ELEMENT_ID, x: X, y: Y, w: { type: 'number' }, h: { type: 'number' } }, []),
  fn('done', 'The task is finished (or the person wants to stop).',
    { summary: { type: 'string', description: 'One or two warm sentences: what you did together.' }, lesson_title: { type: 'string', description: 'Short title in the person\'s own words, e.g. "Send photos to Anne Marie".' } },
    ['summary']),
];

const TEACH_OFF = new Set(['click', 'type_text', 'press_keys', 'scroll']);
const SUPPORT_ON = new Set(['run_check', 'apply_fix', 'run_command', 'say', 'ask_user', 'open', 'set_plan', 'done']); // no zoom: no screen here
// The chat path has tools too (the bug: it used to have none and claimed changes it could not make).
const CHAT_ON = new Set(['update_settings', 'remember', 'save_contact', 'ask_user', 'open', 'run_check', 'run_command', 'say', 'done']);

function schemas(mode) {
  if (mode === 'support') return ALL.filter((t) => SUPPORT_ON.has(t.function.name));
  if (mode === 'chat') return ALL.filter((t) => CHAT_ON.has(t.function.name));
  if (mode === 'teach') return ALL.filter((t) => !TEACH_OFF.has(t.function.name));
  return ALL.slice();
}

// ---------- coordinates: image px (what the model sees) <-> physical px (native helper) ----------
function toPhysical(img, x, y) {
  return { x: Math.round(img.originX + x * img.factor), y: Math.round(img.originY + y * img.factor) };
}
function toImage(img, x, y) {
  return { x: Math.round((x - img.originX) / img.factor), y: Math.round((y - img.originY) / img.factor) };
}
function toImageRect(img, rect) {
  const p = toImage(img, rect[0], rect[1]);
  return [p.x, p.y, Math.round(rect[2] / img.factor), Math.round(rect[3] / img.factor)];
}
function imageRectToPhysical(img, rect) {
  const p = toPhysical(img, rect[0], rect[1]);
  return [p.x, p.y, Math.round(rect[2] * img.factor), Math.round(rect[3] * img.factor)];
}
const center = (r) => ({ x: Math.round(r[0] + r[2] / 2), y: Math.round(r[1] + r[3] / 2) });

// ---------- helpers ----------
// Final, irreversible buttons: the person always presses these (backs up the guardian).
const FINAL = /^(send|send now|send email|pay|pay now|place (your )?order|buy|buy now|purchase|complete (purchase|order)|confirm (purchase|payment|order)|submit|submit payment|delete|delete forever|delete account|post|transfer|checkout|check out)$/i;
// A guide_user instruction that chains actions (the owner's session: "type a subject ..., then click into the message
// area and write"). "Click the box and type X", "click X, then type Y", "type Y, then press Enter" and "type Y, then
// stop" are one step (the typing watch ends on Enter); typing and THEN clicking somewhere, or "then" anything else, is two.
const CHAINED = /\b(type|write)\b.*\b(click|tap)\b|\b(then|after that|afterwards)\b(?!\s+(type|write|press (the )?enter|hit enter|stop|wait|give it a (moment|second)|hold on)\b)/i; // "..., then wait a moment" is one action
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const safe = (f) => { try { return f(); } catch (_) { return null; } };
const POSITIONAL = new Set(['click', 'scroll', 'guide_user']);
const RING_MS = 2500; // how long the yellow ring shows where Barnaby is about to click (the owner: 1.2 s was too short)
const ACTS = new Set(['click', 'type_text', 'press_keys', 'scroll', 'open', 'apply_fix']); // tools that go through act()
const CHANGES_SCREEN = new Set(['click', 'type_text', 'press_keys', 'scroll', 'open', 'guide_user', 'apply_fix']);

function elById(ctx, id) {
  const els = ctx.obs && ctx.obs.elements;
  return (els && els.get(Number(id))) || null;
}
// Smallest element containing a physical point (to name x,y clicks and catch Send buttons).
function elementAt(ctx, x, y) {
  const els = ctx.obs && ctx.obs.elements;
  if (!els) return null;
  let best = null;
  for (const e of els.values()) {
    const r = e.rect;
    if (!r || x < r[0] || y < r[1] || x > r[0] + r[2] || y > r[1] + r[3]) continue;
    if (!best || r[2] * r[3] < best.rect[2] * best.rect[3]) best = e;
  }
  return best;
}
// A picture point snaps to the listed item it means (the owner's 2026-09-28 session: x,y 40 px low ringed the Subject
// line instead of the To box). Only clickable/typable items on the picture: the item the words name (within ~40 picture
// px), else one under the point (editable first, smallest); a nearby ordinary button is not the one meant. null: keep
// the point. ring (guide_user): a repeated list row (an inbox row behind the Compose window, 2026-09-28b) only when the
// words name its text and it is no typing step: "the To box" was never "unread, Amazon Prime ...".
const INTERACTIVE = /^(Button|Hyperlink|Edit|ComboBox|ListItem|MenuItem|TabItem|CheckBox|RadioButton|TreeItem|DataItem|SplitButton|Slider|Spinner)$/;
const EDITABLE = /^(Edit|ComboBox|Spinner)$/;
const LIST_ROW = /^(ListItem|DataItem|TreeItem|Row)$/;
const rowNamed = (words, name) => !TYPING.test(words || '') &&
  String(name || '').split(/\s*,\s*/).some((f) => f.length >= 4 && String(words).toLowerCase().includes(f.toLowerCase()));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function named(words, name) {
  const n = String(name || '').trim();
  if (!words || !n) return false;
  if (n.length >= 3 && new RegExp('\\b' + esc(n) + '\\b', 'i').test(words)) return true;
  const w = n.split(/\s+/)[0]; // "To recipients" is named by "the box next to To"
  return /^[A-Z]\w/.test(w) && new RegExp('\\b' + esc(w) + '\\b').test(words);
}
function snapEl(ctx, p, words, ring) {
  const els = ctx.obs && ctx.obs.elements, img = ctx.obs && ctx.obs.img;
  if (!els || !img) return null;
  const pad = 40 * img.factor;
  let best = null, bestKey = null;
  for (const e of els.values()) {
    const r = e.rect;
    if (!r || !INTERACTIVE.test(e.role || '') || e.enabled === false) continue;
    const c = toImage(img, r[0] + r[2] / 2, r[1] + r[3] / 2);
    if (c.x < 0 || c.y < 0 || c.x > img.width || c.y > img.height) continue; // not on the picture (the taskbar)
    if (p.x < r[0] - pad || p.x > r[0] + r[2] + pad) continue;
    const dy = p.y < r[1] ? r[1] - p.y : p.y > r[1] + r[3] ? p.y - r[1] - r[3] : 0;
    const inside = dy === 0 && p.x >= r[0] && p.x <= r[0] + r[2];
    if (!inside && dy > pad) continue;
    const row = ring && LIST_ROW.test(e.role);
    const nm = row ? rowNamed(words, e.name) : named(words, e.name);
    if (row ? !nm : !inside && !nm) continue;
    const key = [nm ? 0 : 1, inside ? 0 : 1, EDITABLE.test(e.role) ? 0 : 1, dy, r[2] * r[3]];
    if (!bestKey || less(key, bestKey)) { best = e; bestKey = key; }
  }
  return best;
}
const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const snapNote = (ctx, e) => { ctx.snapNote = 'I used the listed item [' + e.id + '] "' + elName(e) + '" at its exact place instead of x,y; next time use element_id ' + e.id + '.'; };
function focused(ctx) {
  const els = ctx.obs && ctx.obs.elements;
  if (els) for (const e of els.values()) if (e.focused) return e;
  return null;
}
const elName = (e) => (e ? clip((e.name || '').trim() || e.role || '', 60) : '');

// Time spent waiting on the person does not count toward the task's wall-clock limit.
async function waiting(ctx, promise) {
  const t0 = Date.now();
  try { return await promise; } finally { ctx.waitedMs = (ctx.waitedMs || 0) + (Date.now() - t0); }
}

async function ask(ctx, opts) {
  try {
    const a = await waiting(ctx, Promise.resolve().then(() => ctx.ui.ask(opts)));
    ctx.check();
    const ans = String(a == null ? '' : a).trim();
    if (ans && ctx.heard) ctx.heard.push(ans); // the person's own words (R18)
    return ans;
  } catch (_) {
    ctx.check(); // stopped -> abort the task; otherwise the question was just closed
    return null;
  }
}

function record(ctx, text, action, target) {
  if (text) ctx.steps.push({ text: clip(text, 300), action, target: clip(target || '', 120) });
}

function refused(ctx, g) {
  const reason = (g && g.reason) || 'That is not safe for me to do.';
  if (g && g.redirect === 'guide_user') {
    return 'REFUSED: ' + reason + ' The person must press this themselves: use guide_user to point at it.';
  }
  // Safety diary (main.js): rule id only, never page text.
  if (g && g.rule && g.rule !== 'final' && ctx.emit) safe(() => ctx.emit('refused', { rule: g.rule }));
  return ctx.ui.say(reason).then(() => { ctx.check(); return 'REFUSED: ' + reason; });
}

// What the guardian knows about this moment (04_safety context). The element keeps the native secret-field flags.
function gctxOf(ctx, element) {
  const w = (ctx.obs && ctx.obs.window) || {};
  return {
    goal: ctx.goal, mode: ctx.mode, window: { title: w.title || '', process: w.process || '' },
    element: element ? { name: element.name || '', role: element.role || '', password: !!(element.password || element.isPassword), private: !!element.private } : { name: '' },
    scamContext: !!ctx.scamContext, // R17: a scam episode is on, so nothing is routine
    remoteSession: !!(ctx.remote && ctx.remote()), // R16
    heard: ctx.heard || [ctx.goal],
    typedAddrs: ctx.typedAddrs || [], // the Send exception needs every one of them known (guardian.addressKnown)
  };
}

// The single gate every acting tool passes through.
async function act(ctx, tool, args, { what, target, element, perform, alwaysConfirm, ring, question, waitSay }) {
  const action = { tool, args };
  // Every address typed or opened (mailto:) this task, even a refused one: a Send without the card needs them all known.
  for (const m of [args.text, args.target, args.url].join(' ').match(/[^\s@<>,;:"'()]+@[^\s@<>,;"'()]+\.[a-z]{2,}/gi) || []) (ctx.typedAddrs ||= []).push(m.toLowerCase());
  // A yes on the helper's own confirm card, for the very next action only (execute() clears it otherwise);
  // the guardian lets it soften only a model "confirm", never a rule's.
  const gctx = { ...gctxOf(ctx, element), confirmed: !!ctx.saidYes };
  ctx.saidYes = false;
  let g = null;
  try {
    g = await ctx.guardian.gateAction(action, gctx);
  } catch (e) {
    // Guardian broke: the hard rules still apply (refusals and their own questions); a routine step goes ahead.
    if (ctx.log) ctx.log('gateAction failed, asking the person instead', e.message);
    // A rule's own question (R3b, R5, R6, R11, R14b...) still asks; the Send the person told us to press shows the card.
    const hard = safe(() => ctx.guardian.hardCheck(action, gctx));
    // Nothing checked it at all: fail closed, the person says yes (rule 'noguard' makes act ask).
    g = hard && (hard.verdict === 'refuse' || hard.verdict === 'confirm') ? hard
      : hard && hard.rule === 'sendAsked' ? { verdict: 'confirm', rule: 'sendAsked', reason: '' } : { verdict: 'confirm', rule: 'noguard', reason: '' };
  }
  ctx.check();
  if (!g || !g.verdict) g = { verdict: 'confirm', rule: 'noguard', reason: '' };
  if (g.verdict === 'refuse') return refused(ctx, g);
  const explain = String(args.explain || '').trim();
  // The owner (2026-09-28): "only ask permission for a big step like sending an email". A hard rule's own question
  // (R3b, R5, R6, R11...) and anything during a scam episode still ask; the model gate's doubtful "confirm" on a routine
  // click, key or typing no longer interrupts (the hard rules above still refuse what is never allowed).
  // A catalog fix (rule 'fix') runs without a question too (the owner: "apply_fix runs without asking").
  // g.risky: the gate thinks it sends, pays, buys, deletes or posts, though no name rule caught it (a final button).
  const bigAsk = g.verdict === 'confirm' && ((!!g.rule && g.rule !== 'fix') || !!g.risky || !!ctx.scamContext);
  if (bigAsk || alwaysConfirm) {
    // Ask BEFORE doing it: never "I'm clicking ... Shall I go ahead?". A rule that words its own question wins.
    const q = question || (g.reason && /\?\s*$/.test(g.reason) ? g.reason : 'Shall I ' + what.charAt(0).toLowerCase() + what.slice(1) + '?');
    const ans = await ask(ctx, {
      question: q,
      kind: 'confirm',
      details: { title: 'Is this okay?', fields: [{ label: 'What I will do', value: what }].concat(explain ? [{ label: 'Why', value: explain }] : []) },
    });
    if (ans === null) return 'The question was closed, so I did not do it.';
    if (ans !== 'yes') return ans === 'no' ? 'The person said no, so I did not do it. Ask what they would like instead.' : 'I did not do it. The person said: "' + ans + '"';
  } else if (explain) {
    // UX 10/14: ring the target while explaining, >= 1.2 s, so the person sees WHERE before it happens.
    // The caption and the ring show first; the voice runs on while acting (the owner asked for faster use), so the
    // action waits at most the ring time, not the whole spoken sentence. A plain timer: run.sleep rejects on Stop.
    const t0 = Date.now();
    if (ring) safe(() => ctx.ui.highlight(ring, explain, { dim: false })); // own click: no spotlight dimming
    // A Send without the card waits for the whole sentence: the person hears who it goes to before it goes.
    let cap;
    const spoken = Promise.resolve().then(() => ctx.ui.say(explain)).catch(() => {});
    await (waitSay ? spoken : Promise.race([spoken, new Promise((r) => { cap = setTimeout(r, ring ? RING_MS : 600); })]));
    clearTimeout(cap);
    ctx.check();
    if (ring) {
      const left = RING_MS - (Date.now() - t0);
      if (left > 0) await ctx.sleep(left);
      safe(() => ctx.ui.clearOverlay());
      ctx.check();
    }
  }
  ctx.status({ state: 'acting', step: ctx.steps.length + 1, totalSteps: ctx.totalSteps, label: explain || what });
  const res = await perform();
  ctx.check();
  record(ctx, explain || what, tool, target || what);
  await ctx.sleep(tool === 'open' ? ctx.timing.open : ctx.timing.settle);
  return res;
}

// ---------- executors ----------
function resolvePoint(ctx, args) {
  if (args.element_id != null) {
    const el = elById(ctx, args.element_id);
    if (!el) return { error: 'ERROR: there is no item [' + args.element_id + '] on the current screen. Look at the list again.' };
    return { el, p: center(el.rect) };
  }
  if (num(args.x) && num(args.y)) {
    const img = ctx.obs && ctx.obs.img;
    if (!img) return { error: 'ERROR: there is no screenshot to measure from. Use an item number.' };
    const p = toPhysical(img, args.x, args.y);
    const s = snapEl(ctx, p, args.explain);
    if (s) { snapNote(ctx, s); return { el: s, p: center(s.rect) }; }
    return { el: elementAt(ctx, p.x, p.y), p };
  }
  return { error: 'ERROR: give element_id, or x and y.' };
}

async function click(ctx, args) {
  const r = resolvePoint(ctx, args);
  if (r.error) return r.error;
  const name = elName(r.el);
  const bare = String((r.el && r.el.name) || '').trim();
  // The person's own request said to send it: the plain Send button goes on to the guardian, which decides (window, name).
  if (r.el && FINAL.test(bare) && !(ctx.sendAsked && !ctx.scamContext && /^send$/i.test(bare))) {
    return refused(ctx, { verdict: 'refuse', redirect: 'guide_user', reason: 'The "' + name + '" button is for the person to press.' });
  }
  const double = !!args.double;
  return act(ctx, 'click', args, {
    what: 'Click ' + (name ? '"' + name + '"' : 'here'),
    target: name, element: r.el, waitSay: !!ctx.sendAsked && /^send\b/i.test(bare),
    // A point with no item under it, when the item list was cut short: it could be an unlisted Send button.
    // Safety rail (the person presses the final Send/Pay/Buy): a blind point is not skipped in or out of a scam episode.
    alwaysConfirm: !r.el && !(ctx.obs && ctx.obs.complete),
    ring: r.el && r.el.rect ? r.el.rect : [r.p.x - 24, r.p.y - 24, 48, 48],
    perform: async () => {
      if (args.element_id != null) {
        try {
          await ctx.native.call('click_element', { id: Number(args.element_id), double }, 8000);
          return 'Clicked [' + args.element_id + '] ' + name + '.';
        } catch (_) { /* element went stale: click its centre instead */ }
      }
      await ctx.native.call('click', { x: r.p.x, y: r.p.y, button: 'left', double }, 8000);
      return 'Clicked ' + (name ? '"' + name + '"' : 'at ' + args.x + ',' + args.y) + '.';
    },
  });
}

async function typeText(ctx, args) {
  // A trailing newline is typed as the Enter key, which sends in chat apps: Enter is press_keys' job.
  const text = String(args.text == null ? '' : args.text).replace(/[\r\n\t]+$/, '');
  if (!text) return 'ERROR: text is empty.';
  args = { ...args, text };
  return act(ctx, 'type_text', args, {
    what: 'Type: ' + clip(text, 200), target: clip(text, 80), element: focused(ctx),
    perform: async () => {
      if (ctx.focusTarget) await ctx.focusTarget();
      await ctx.native.call('type', { text }, 60000);
      return 'Typed the text.';
    },
  });
}

async function pressKeys(ctx, args) {
  const combos = String(args.keys || '').toLowerCase().split(/[\s,]+/).filter(Boolean).slice(0, 12);
  if (!combos.length || combos.some((c) => !/^[a-z0-9+]+$/.test(c))) return 'ERROR: keys should look like "enter", "ctrl+a" or "tab tab enter".';
  const explain = String(args.explain || '').trim();
  return act(ctx, 'press_keys', args, {
    what: 'Press ' + combos.join(', then '), target: combos.join(' '), element: focused(ctx), // Enter on a focused Send
    // "Shall I press esc, then ctrl+w?" means nothing to most people; the explain says what it does.
    question: explain ? explain.replace(/[.!]?\s*$/, '.') + ' Is that all right?' : '',
    perform: async () => {
      if (ctx.focusTarget) await ctx.focusTarget();
      for (const combo of combos) {
        await ctx.native.call('key', { combo }, 5000);
        if (combos.length > 1) await ctx.sleep(120);
      }
      return 'Pressed ' + combos.join(' ') + '.';
    },
  });
}

async function scroll(ctx, args) {
  const down = args.direction !== 'up';
  const amount = Math.max(1, Math.min(15, Math.round(num(args.amount) ? args.amount : 5)));
  let p;
  if (args.element_id != null) {
    const el = elById(ctx, args.element_id);
    if (!el) return 'ERROR: there is no item [' + args.element_id + '] on the current screen.';
    p = center(el.rect);
  } else if (ctx.obs && ctx.obs.window && Array.isArray(ctx.obs.window.rect)) {
    p = center(ctx.obs.window.rect);
  } else if (ctx.obs && ctx.obs.img) {
    p = toPhysical(ctx.obs.img, ctx.obs.img.width / 2, ctx.obs.img.height / 2);
  } else return 'ERROR: I cannot tell where to scroll.';
  return act(ctx, 'scroll', args, {
    what: 'Scroll ' + (down ? 'down' : 'up'), target: '',
    perform: async () => { await ctx.native.call('scroll', { x: p.x, y: p.y, amount: down ? -amount : amount }, 5000); return 'Scrolled ' + (down ? 'down.' : 'up.'); },
  });
}

const REMOTE_MSG = 'I won\'t open that one. Programs that let someone else control your computer are how many scams start. ' +
  'If someone on the phone asked you to install it, it is safest to hang up.';

async function open(ctx, args) {
  const target = String(args.target || '').trim();
  if (!target) return 'ERROR: target is empty.';
  const isRemote = (s) => !!safe(() => ctx.guardian.isRemoteAccess(s));
  // Through refused(): the safety diary and the family alert (R1) must hear about the most common attempt.
  const remoteNo = () => refused(ctx, { verdict: 'refuse', rule: 'R1', reason: REMOTE_MSG })
    .then(() => 'REFUSED: remote-access tools are never opened. Tell the person calmly why, and do not try another way.');
  if (isRemote(target)) return remoteNo();
  const r = ctx.apps.resolve(target, ctx.settings);
  if (!r && /mail|photo|picture|video/i.test(target)) {
    return 'ERROR: I do not know which one they use yet. Ask with ask_user (for example Gmail, Outlook, AOL, Yahoo, I\'m not sure), remember the answer, then open it by name.';
  }
  if (!r) {
    return 'ERROR: I do not know how to open "' + target + '". Use a full web address (https://...), or the Start menu: ' +
      'press_keys "win", type_text the program name, press_keys "enter".';
  }
  if (isRemote(r.value)) return remoteNo();
  if (ctx.mode === 'support' && !/^ms-settings:/.test(r.value)) return 'ERROR: here you can only open settings pages (for example "sound settings" or "wifi").';
  return act(ctx, 'open', { ...args, resolved: r.value }, {
    what: 'Open ' + r.label, target: r.label,
    perform: async () => {
      safe(() => ctx.ui.hideLauncher());
      try {
        await ctx.native.call('open', r.args ? { target: r.value, args: r.args } : { target: r.value }, 15000);
      } catch (e) {
        if (!r.fallback) throw e;
        await ctx.native.call('open', { target: r.fallback }, 15000);
      }
      return 'Opened ' + r.label + '. Look at the new screen before the next step.';
    },
  });
}

async function wait(ctx, args) {
  const s = Math.max(0, Math.min(10, num(args.seconds) ? args.seconds : 2));
  ctx.status({ state: 'waiting', label: 'Waiting a moment…' });
  await ctx.sleep(s * 1000);
  return 'Waited ' + s + ' seconds.';
}

async function sayIt(ctx, args) {
  let text = String(args.text || '').replace(/[*#`_>]+/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return 'ERROR: text is empty.';
  if (ctx.noVouch) text = ctx.noVouch(text); // R15: chat / scam-context replies never vouch for a page or caller
  if (!text) return 'Said.';
  if (ctx.said) ctx.said.push(text);
  await ctx.ui.say(text);
  ctx.check();
  return 'Said.';
}

async function askUser(ctx, args) {
  const question = String(args.question || '').trim();
  if (!question) return 'ERROR: question is empty.';
  const choices = Array.isArray(args.choices) ? args.choices.map((c) => clip(String(c).trim(), 60)).filter(Boolean).slice(0, 5) : [];
  ctx.status({ state: 'waiting', label: question });
  const ans = await ask(ctx, { question, choices, kind: choices.length ? 'choice' : 'text' });
  if (ans === null) return 'The question was closed without an answer.';
  return 'The person answered: "' + ans + '"';
}

// The ring's first answer: the widget shows it as a big green button the overlay never dims. It counts as "I did it".
const GREEN = 'I did it, but Barnaby didn\'t notice';
const DID_IT = /^i did it\b/i;
const TYPING = /\b(type|write|fill in)\b|\benter (your|the|a|an)\b/i;
const RIGHT_CLICK = /\bright[- ]?click/i;
const SECRET_WORDS = /pass(word|code)|\bpin\b|\bcode\b|card|security|social security|account number|routing/i;
const TYPED_PAUSE_MS = 2500; // typed, then this long without a key: the typing step is done (or Enter)
const never = () => new Promise(() => {});

// A typing step, in the background: once they click inside the ring the label goes (the ring stays, thin, no dimming) so
// it does not cover what they type; then the keyboard is watched (native counts keys, never which) and the step ends on
// its own after Enter, or a pause once the box's text changed. Never resolves otherwise: "I did it" stays the fallback.
// A private box (password, code, card) is never read.
async function watchTyping(ctx, rect, typing, secret, over) {
  let c = null;
  for (let i = 0; i < 5 && !over() && !(c && c.inRect); i++) {
    c = await ctx.native.call('wait_click', { timeoutMs: 180000, rect }, 190000).catch(() => null);
    if (!c || !c.clicked) return never();
  }
  if (over() || !(c && c.inRect)) return never();
  safe(() => ctx.ui.highlight(rect, '', { dim: false }));
  if (!typing) return never(); // choosing or several clicks: they say when they are done
  const look = () => (secret ? Promise.resolve({ secret: true })
    : Promise.resolve().then(() => ctx.native.call('focus_value', {}, 3000)).then((f) => f || {}, () => ({})));
  const before = await look();
  while (!over()) {
    const k = await ctx.native.call('wait_typing', { timeoutMs: 180000, idleMs: TYPED_PAUSE_MS }, 190000).catch(() => null);
    if (over() || !k || !k.typed) return never();
    const now = await look();
    const hidden = !!(now.secret || now.password || before.secret);
    // Unreadable (no value, a private box) counts as changed; a readable box must really hold new text.
    if (k.enter || hidden || now.value == null || now.value !== before.value) {
      return { typed: { enter: !!k.enter, secret: hidden, value: hidden ? '' : String(now.value || '').trim() } };
    }
  }
  return never();
}

// After the person's click or typing: wait until the front window and the window list stop changing (~600 ms, at most
// 2.5 s), so the next look sees the menu, the Save As window or the new page (the owner: right-click, then Save image as).
// -> the last screen signature (null: cannot tell).
async function settleScreen(ctx, quietMs = 600, maxMs = 2500) {
  const t0 = Date.now();
  let last = null, since = t0;
  while (Date.now() - t0 < maxMs) {
    const sig = await screenSig(ctx);
    if (!sig) return last; // cannot tell: go on
    if (sig !== last) { last = sig; since = Date.now(); } else if (Date.now() - since >= quietMs) return last;
    await ctx.sleep(150);
  }
  return last;
}
async function screenSig(ctx) {
  const s = await Promise.all([ctx.native.call('foreground', {}, 2000), ctx.native.call('windows', {}, 3000)]).catch(() => null);
  if (!s || !s[0]) return null;
  return JSON.stringify([s[0].hwnd, s[0].title, ((s[1] && s[1].windows) || []).map((w) => [w.hwnd, w.title, !!w.minimized])]);
}

// A click on Barnaby's docked panel or any of his own windows (the floating widget, a card).
async function onOwnWindow(ctx, c) {
  if (!num(c.x) || !num(c.y)) return false;
  const r = safe(() => ctx.ui.dockedPanel && ctx.ui.dockedPanel());
  if (r && c.x >= r[0] && c.y >= r[1] && c.x < r[0] + r[2] && c.y < r[1] + r[3]) return true;
  if (ctx.ui.ownPid == null) return false;
  const w = await Promise.resolve().then(() => ctx.native.call('window_at', { x: c.x, y: c.y }, 2000)).catch(() => null);
  // The click-through ring overlay covers a whole screen and should never be hit; if Windows ever returned it, a real
  // miss must still count, so a window of ours as big as the screen is not the panel.
  const m = ctx.obs && ctx.obs.monitor;
  return !!w && w.pid === ctx.ui.ownPid && !(Array.isArray(w.rect) && Array.isArray(m) && w.rect[2] >= m[2] && w.rect[3] >= m[3]);
}

async function guideUser(ctx, args) {
  const instruction = String(args.instruction || '').trim();
  if (!instruction) return 'ERROR: instruction is empty.';
  if (CHAINED.test(instruction)) {
    return 'ERROR: one thing per step. This instruction asks for more than one action. Split it: guide_user for the first thing only; ' +
      'after it is done and you have looked at the new screen, the next one.';
  }
  let rect = null, el = null;
  if (args.element_id != null) {
    el = elById(ctx, args.element_id);
    if (!el) return 'ERROR: there is no item [' + args.element_id + '] on the current screen.';
    rect = el.rect;
  } else if (num(args.x) && num(args.y) && ctx.obs && ctx.obs.img) {
    const w = num(args.w) && args.w > 4 ? args.w : 90, h = num(args.h) && args.h > 4 ? args.h : 60;
    rect = imageRectToPhysical(ctx.obs.img, [args.x - w / 2, args.y - h / 2, w, h]);
    el = snapEl(ctx, toPhysical(ctx.obs.img, args.x, args.y), instruction, true);
    if (el) { snapNote(ctx, el); rect = el.rect; } else {
      ctx.snapNote = 'That thing is not in the item list; if the ring looks wrong, zoom there first.';
      el = elementAt(ctx, rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
      if (el && LIST_ROW.test(el.role || '')) el = null; // the inbox row behind it is not what the ring means
    }
  }
  // The person does it, but the helper's ring and voice must never lead them to a remote tool, a gift card,
  // a money exit or a security switch (6.1 #1, R6): the never-rules apply to guided steps too.
  const g = safe(() => ctx.guardian.hardCheck({ tool: 'guide_user', args: { ...args, instruction } }, gctxOf(ctx, el)));
  if (g && g.verdict === 'refuse') return refused(ctx, g);
  const rightAsked = RIGHT_CLICK.test(instruction);
  const typing = !!rect && !rightAsked && (TYPING.test(instruction) || (args.wait_for === 'done' && !!el && EDITABLE.test(el.role || '')));
  // A right-click is one click, whatever wait_for says (the owner's right-click on a picture was never noticed).
  const waitClick = !!rect && !typing && (args.wait_for !== 'done' || rightAsked);
  record(ctx, instruction, 'guide_user', elName(el));
  if (rect) ctx.ui.highlight(rect, instruction);
  ctx.status({ state: 'waiting', step: ctx.steps.length, totalSteps: ctx.totalSteps, label: instruction });
  const choices = waitClick ? [GREEN, 'Please do it for me', 'I need help'] : [GREEN, 'I need help'];
  const askW = Promise.resolve().then(() => ctx.ui.ask({ question: instruction, choices, kind: 'choice', green: GREEN }))
    .then((a) => ({ answer: String(a == null ? '' : a).trim() }), () => ({ closed: true }));
  let out;
  // The screen before their click: a click outside the ring that changed it (a new window) is not a miss.
  const sig0 = waitClick ? screenSig(ctx).catch(() => null) : null;
  if (waitClick) {
    for (;;) {
      const clickW = ctx.native.call('wait_click', { timeoutMs: 180000, rect }, 190000)
        .then((c) => ({ click: c || {} }), () => ({ clickFailed: true }));
      out = await waiting(ctx, Promise.race([clickW, askW]));
      if (out.clickFailed) out = await waiting(ctx, askW); // cannot watch the mouse: wait for their answer
      if (!(out.click && out.click.clicked && !out.click.inRect)) break;
      // A tap on our own panel ("I need help") reaches the mouse hook first: give its answer a moment.
      const late = await Promise.race([askW, new Promise((r) => setTimeout(() => r(null), 600))]);
      if (late) { out = late; break; }
      // A click in Barnaby's own panel (x=1620 on a 1280-wide work area, 2026-09-28b) is no miss: keep waiting.
      if (!(await onOwnWindow(ctx, out.click))) break;
    }
    if (out.click) safe(() => ctx.ui.cancelAsk());
    // Answered in words: the mouse hook must not outlive the step (up to 3 minutes otherwise).
    else await Promise.resolve().then(() => ctx.native.call('cancel_wait', {}, 3000)).catch(() => {});
  } else {
    // A typing (or choosing) step: watched in the background, the question stays the fallback. The hooks end with the step.
    let answered = false;
    const secret = !!(el && (el.password || el.isPassword || el.private || el.secret)) || SECRET_WORDS.test(instruction);
    const typedW = rect ? watchTyping(ctx, rect, typing, secret, () => answered) : never();
    out = await waiting(ctx, Promise.race([askW, typedW]));
    answered = true;
    if (out.typed) safe(() => ctx.ui.cancelAsk());
    if (rect) await Promise.resolve().then(() => ctx.native.call('cancel_wait', {}, 3000)).catch(() => {});
  }
  safe(() => ctx.ui.clearOverlay());
  ctx.check();
  let settled = null;
  if ((out.click && out.click.clicked) || out.typed) { settled = await settleScreen(ctx); ctx.check(); }
  if (out.typed) {
    ctx.stuck = 0;
    const v = out.typed.value;
    return 'The person typed in the box' + (v ? ': "' + clip(v, 120) + '"' : out.typed.secret ? ' (a private box, so I did not read it)' : '') +
      (out.typed.enter ? ' and pressed Enter' : '') + '. Look at the new screen to check it, then show the next step.';
  }
  if (out.click) {
    const c = out.click;
    if (!c.clicked) { ctx.stuck = 2; return 'The person did not click within 3 minutes. Ask gently whether they need help.'; }
    const btn = c.button && c.button !== 'left' ? ' with the ' + c.button + ' mouse button' : '';
    if (c.inRect) {
      ctx.stuck = 0;
      if (rightAsked && c.button === 'left') {
        return 'The person clicked inside the highlighted area, but with the LEFT mouse button, and this step was a right-click. ' +
          'Look at the new screen: if the menu did not open, ask them kindly to click it with the RIGHT mouse button.';
      }
      return 'The person clicked inside the highlighted area' + btn + '. Look at the new screen to check it worked, then show the next step.';
    }
    // Not automatically a miss: it may have opened the menu or window the step was for. Nothing changed: a miss (two
    // in a row and Barnaby does it, agent.js).
    const before = await sig0;
    if (!before || !settled || before === settled) ctx.stuck = (ctx.stuck || 0) + 1;
    const hit = elementAt(ctx, c.x, c.y);
    const p = ctx.obs && ctx.obs.img && num(c.x) ? toImage(ctx.obs.img, c.x, c.y) : null;
    return 'The person clicked outside the highlighted area' + btn + (hit ? ', on [' + hit.id + '] "' + elName(hit) + '"' : '') +
      (p ? ' at x=' + p.x + ', y=' + p.y + ' (screenshot pixels)' : '') + '. Look at the new screen first: if that already did the step ' +
      'or opened what it needed, go on; only if the step still needs doing, guide again kindly.';
  }
  if (out.closed) return 'The question was closed without an answer.';
  const a = out.answer;
  if (DID_IT.test(a)) { ctx.stuck = 0; return 'The person said they did it. Check the new screen.'; }
  if (/^please do it for me$/i.test(a)) ctx.stuck = 2; // they asked: Barnaby does the rest of this task (agent.js)
  if (/^please do it for me$/i.test(a) && rect) {
    const p = center(rect);
    const img = ctx.obs && ctx.obs.img;
    const n = ctx.steps.length;
    const res = await click(ctx, el && args.element_id != null
      ? { element_id: args.element_id, explain: 'Okay, I\'ll do this one for you.' }
      : img ? { ...toImage(img, p.x, p.y), explain: 'Okay, I\'ll do this one for you.' } : { explain: '' });
    ctx.steps.length = n; // the lesson keeps the instruction, not "I'll do it for you"
    return 'The person said: "Please do it for me". ' + res;
  }
  if (/^i need help$/i.test(a)) ctx.stuck = (ctx.stuck || 0) + 1;
  if (/^i need help$/i.test(a)) return 'The person said: "I need help". Explain more simply where it is and what it looks like, then guide again.';
  return 'The person said: "' + a + '"';
}

async function confirm(ctx, args) {
  const title = String(args.title || 'Please check').trim();
  const fields = (Array.isArray(args.fields) ? args.fields : [])
    .filter((f) => f && f.label).map((f) => ({ label: clip(String(f.label), 40), value: clip(String(f.value == null ? '' : f.value), 2000) }));
  const question = String(args.question || 'Is this all correct?').trim();
  ctx.status({ state: 'waiting', label: title });
  const ans = await ask(ctx, { question, kind: 'confirm', details: { title, fields } });
  record(ctx, 'Check the details: ' + title, 'confirm', title);
  if (ans === null) return 'The question was closed without an answer. Do not go ahead.';
  ctx.saidYes = ans === 'yes';
  if (ans === 'yes') return 'The person said yes, the details are correct.';
  if (ans === 'no') return 'The person said no. Do not go ahead. Ask what they would like to change.';
  return 'The person did not say yes. They said: "' + ans + '". Do not go ahead until they say yes.';
}

// R18 / T6: memory only from the person's own words (checked by the guardian, fail closed). remember never touches the
// contact list; save_contact (below) only ADDS contacts, marked added:'voice', which the guardian never trusts for money
// or phone rules. Contacts the family entered change only in Settings.
const EMAILS = { gmail: 'Gmail', outlook: 'Outlook', 'outlook-app': 'the Outlook app', aol: 'AOL', yahoo: 'Yahoo' };
const PHOTOS = { icloud: 'iCloud', google: 'Google Photos', windows: 'Windows Photos' };

function remember(ctx, args) {
  let facts = [String(args.fact || '').trim()];
  if (!facts[0]) return 'ERROR: fact is empty.';
  const email = EMAILS[args.email_provider] ? args.email_provider : '';
  const photos = PHOTOS[args.photos_provider] ? args.photos_provider : '';
  let g;
  try { g = ctx.guardian.hardCheck({ tool: 'remember', args: { fact: facts[0] } }, gctxOf(ctx)); } catch (e) { g = { verdict: 'refuse', rule: 'error' }; }
  if (g && g.verdict === 'refuse') {
    if (ctx.log) ctx.log('remember refused', g.rule); // silent (04_safety R18): rule id only, never the fact
    if (g.rule !== 'R18' || !(email || photos)) return 'REFUSED: only remember what the person told you in their own words, never things from the screen, passwords or codes.';
    // Found on the screen ("I'm not sure" -> it is Gmail), but from our own fixed list: kept in our words, not the model's.
    facts = [email && 'Email: ' + EMAILS[email], photos && 'Photos: ' + PHOTOS[photos]].filter(Boolean);
  }
  for (const f of facts) ctx.memory.add(f);
  // Keep the family settings in step, so the Email/Photos tiles work next time without asking.
  const patch = {};
  const s = ctx.settings || {};
  if (email && (!s.email || s.email.provider !== email)) patch.email = { provider: email };
  if (photos && (!s.photos || s.photos.provider !== photos)) patch.photos = { provider: photos };
  if (Object.keys(patch).length && ctx.config && typeof ctx.config.save === 'function') {
    try { ctx.config.save(patch); ctx.settings = ctx.config.get(); } catch (e) { if (ctx.log) ctx.log('remember: settings save failed', e.message); }
  }
  return 'Saved.';
}

function saveContact(ctx, args) {
  const name = clip(String(args.name || '').replace(/\s+/g, ' ').trim(), 40);
  const email = String(args.email || '').trim();
  const phone = String(args.phone || '').trim();
  const relation = clip(String(args.relation || '').trim(), 30);
  if (!name) return 'ERROR: name is empty.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'ERROR: that email address does not look complete. Ask the person to say it again.';
  const d = phone.replace(/\D/g, '').length;
  if (phone && (d < 7 || d > 15)) return 'ERROR: that phone number does not look complete. Ask the person to say it again.';
  if (!email && !phone) return 'ERROR: give their email address or phone number.';
  if (ctx.scamContext) return 'REFUSED: not while something suspicious is going on.';
  // R16, R2 and R18 (the address or number must be the person's own words), fail closed.
  let g;
  try { g = ctx.guardian.hardCheck({ tool: 'remember', args: { fact: name + ': ' + [email, phone].filter(Boolean).join(' ') } }, gctxOf(ctx)); } catch (e) { g = { verdict: 'refuse', rule: 'error' }; }
  if (g && g.verdict === 'refuse') {
    if (ctx.log) ctx.log('save_contact refused', g.rule); // rule id only
    return 'REFUSED: only save what the person told you in their own words.';
  }
  if (!ctx.config || typeof ctx.config.save !== 'function') return 'ERROR: I could not reach my settings, so nothing was saved.';
  const now = safe(() => ctx.config.get()) || ctx.settings || {}; // fresh: a family edit in Settings meanwhile is kept
  const list = (Array.isArray(now.contacts) ? now.contacts : []).filter(Boolean).map((c) => ({ ...c }));
  const i = list.findIndex((c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase());
  if (i >= 0 && !list[i].added) return 'NOT SAVED: ' + list[i].name + ' is in the contacts your family keeps in Settings; a family member can change it there.';
  const c = { ...(i >= 0 ? list[i] : {}), name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(relation ? { relation } : {}), added: 'voice' };
  if (i >= 0) list[i] = c; else list.push(c);
  try { ctx.config.save({ contacts: list }); ctx.settings = ctx.config.get(); } catch (e) { if (ctx.log) ctx.log('save_contact failed', e.message); return 'ERROR: I could not save that, so nothing was saved.'; }
  return 'Saved ' + name + '. Next time you can use them by name.';
}

async function runCheck(ctx, args) {
  const name = String(args.name || '').trim();
  if (!name) return 'ERROR: name is empty.';
  ctx.status({ state: 'acting', label: 'Checking your computer…' });
  let r;
  try { r = await ctx.support.runCheck(name); } catch (e) { ctx.check(); return 'ERROR: the check "' + name + '" failed: ' + e.message; }
  ctx.check();
  if (!r) return 'ERROR: no result.';
  return (r.title || name) + (r.ok === false ? ' (could not finish)' : '') + ':\n' + clip(r.text || '', 3000);
}

// support.catalog() -> [{name, title, kind:'check'|'fix', needsArg, description}] (or {checks, fixes}).
function catalogOf(support) {
  const cat = safe(() => support.catalog());
  const norm = (list) => (Array.isArray(list) ? list : []).filter(Boolean).map((x) => (typeof x === 'string' ? { name: x } : x));
  if (Array.isArray(cat)) return { checks: norm(cat.filter((x) => x && x.kind !== 'fix')), fixes: norm(cat.filter((x) => x && x.kind === 'fix')) };
  if (cat && (cat.checks || cat.fixes)) return { checks: norm(cat.checks), fixes: norm(cat.fixes) };
  return null;
}

async function applyFix(ctx, args) {
  const name = String(args.name || '').trim();
  if (!name) return 'ERROR: name is empty.';
  const cat = catalogOf(ctx.support);
  const fix = cat && cat.fixes.find((f) => f.name === name);
  if (cat && !fix) return 'ERROR: there is no fix called "' + name + '". Use one from the list.';
  if (fix && fix.needsArg && !String(args.arg || '').trim()) return 'ERROR: the fix "' + name + '" needs arg.';
  const title = (fix && fix.title) || name.replace(/_/g, ' ');
  const explain = String(args.explain || '').trim();
  return act(ctx, 'apply_fix', args, {
    what: title + (args.arg ? ': ' + args.arg : ''), target: name,
    // Runs without a card (the owner, 2026-09-28); during a scam episode act() still asks, with this question.
    question: 'Shall I ' + title.charAt(0).toLowerCase() + title.slice(1) + (args.arg && args.arg !== 'confirmed' ? ' (' + args.arg + ')' : '') + '?' + (explain ? ' ' + explain : ''),
    perform: async () => {
      let r;
      try { r = await ctx.support.applyFix(name, args.arg); } catch (e) { return 'ERROR: the fix failed: ' + e.message; }
      return (r && r.ok === false ? 'The fix did not work: ' : 'Done: ') + clip((r && r.text) || '', 1500);
    },
  });
}

// A sharp close-up for the brain (the shrunk screenshot blurs small text). Physical pixels, passwords still blacked out.
async function zoom(ctx, args) {
  const img = ctx.obs && ctx.obs.img;
  let rect = null, label = 'the screen';
  if (args.element_id != null) {
    const el = elById(ctx, args.element_id);
    if (!el) return 'ERROR: there is no item [' + args.element_id + '] on the current screen.';
    const pad = 120;
    rect = [el.rect[0] - pad, el.rect[1] - pad, el.rect[2] + 2 * pad, el.rect[3] + 2 * pad];
    label = '"' + elName(el) + '"';
  } else if (num(args.x) && num(args.y) && img) {
    const w = num(args.w) && args.w > 20 ? args.w : 400, h = num(args.h) && args.h > 20 ? args.h : 260;
    // Never snapped: a close-up reads an area (2026-09-28b: snapping moved it onto an inbox row, off the Compose window).
    rect = imageRectToPhysical(img, [args.x - w / 2, args.y - h / 2, w, h]);
    label = 'the area around x=' + Math.round(args.x) + ', y=' + Math.round(args.y);
  } else return 'ERROR: give element_id, or x and y.';
  // Clamp to the observed monitor (a screen left of or above the main one has negative coordinates). Its corner, not
  // the picture's: the picture is only the work area, and a taskbar item on the top or left lies outside it.
  const mon = ctx.obs && ctx.obs.monitor;
  const L = mon ? mon[0] : img ? img.originX : 0, T = mon ? mon[1] : img ? img.originY : 0;
  rect = [Math.max(L, Math.round(rect[0])), Math.max(T, Math.round(rect[1])), Math.max(200, Math.round(rect[2])), Math.max(120, Math.round(rect[3]))];
  // hwnd: the secret fields of the OBSERVED window are blacked out (not whatever is in front now).
  const hwnd = ctx.obs && ctx.obs.window && ctx.obs.window.hwnd;
  let shot;
  try { shot = await ctx.native.call('screenshot', { x: rect[0], y: rect[1], width: rect[2], height: rect[3], maxWidth: 1280, ...(hwnd ? { hwnd } : {}) }, 10000); } catch (e) { return 'ERROR: the close-up did not work: ' + e.message; }
  ctx.check();
  if (!shot || !shot.png) return 'ERROR: the close-up did not work.';
  (ctx.zooms ||= []).push({ png: shot.png, label });
  return 'Here is the close-up of ' + label + ' (next message). Use the numbered list for clicking; the close-up is only for reading.';
}

function done(ctx, args) {
  ctx.finished = { summary: String(args.summary || '').trim(), lesson_title: String(args.lesson_title || '').trim() };
  return 'Finished.';
}

// ---------- set_plan: the numbered plan the widget shows, current step highlighted ----------
function setPlan(ctx, args) {
  const steps = (Array.isArray(args.steps) ? args.steps : []).map((s) => clip(String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), 80)).filter(Boolean).slice(0, 8);
  if (!steps.length) return 'ERROR: give the steps as short phrases.';
  ctx.plan = steps;
  ctx.planCurrent = Math.max(1, Math.min(steps.length, num(args.current) ? Math.round(args.current) : 1));
  ctx.status({ state: 'thinking', label: steps[ctx.planCurrent - 1], step: ctx.planCurrent, totalSteps: steps.length });
  return 'The plan is on the screen (' + steps.length + ' steps), the person can see it. Now do step ' + ctx.planCurrent + '.';
}

// ---------- update_settings: Barnaby changes its OWN settings, allowed keys and bounds only ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
// key -> normalise(value, current) -> {value} | {error} | {atLimit}
const SETTING_KEYS = {
  textScale(v, cur) {
    cur = round1(+cur || 1);
    let next = cur;
    if (/^small/i.test(v)) next = round1(cur - 0.2);
    else if (/^big|^larg/i.test(v)) next = round1(cur + 0.2);
    else if (Number.isFinite(+v)) next = round1(+v);
    else return { error: 'say "smaller", "bigger" or a size from 1.0 to 1.6' };
    const clamped = clamp(next, 1.0, 1.6);
    if (clamped === cur) return { atLimit: cur <= 1.0 ? 'smallest' : 'largest' };
    return { value: clamped };
  },
  speechRate(v, cur) {
    cur = +cur || 1.0; // Normal (config.js)
    let next = cur;
    if (/^slow/i.test(v)) next = round1(cur - 0.1);
    else if (/^fast|^quick/i.test(v)) next = round1(cur + 0.1);
    else if (Number.isFinite(+v)) next = round1(+v);
    else return { error: 'say "slower", "faster" or a number from 0.7 to 1.1' };
    const clamped = clamp(next, 0.7, 1.1);
    if (clamped === cur) return { atLimit: cur <= 0.7 ? 'slowest' : 'fastest' };
    return { value: clamped };
  },
  muted: (v) => ({ value: v === true || /^(true|yes|on|mute)/i.test(String(v)) }),
  voiceName: (v) => ({ value: clip(String(v == null ? '' : v), 80) }),
  mode: (v) => { const m = String(v).toLowerCase().replace(/^auto$/, 'do'); return /^(together|teach|do)$/.test(m) ? { value: m } : { error: 'the mode can be auto, together or teach' }; },
  wakeWord: (v) => ({ value: v === true || /^(true|yes|on)/i.test(String(v)) }),
  city: (v) => ({ value: clip(String(v == null ? '' : v), 60) }),
  userName: (v) => ({ value: clip(String(v == null ? '' : v), 40) }),
};
const FORBIDDEN_SETTING = /^(apiKey|hasApiKey|brainModel|fallbackModel|models?|providers?|sttModel|jevModel|scamShield|scamShieldOffAt|family|alertConsent|contacts|allowCommands|startAtLogin|tiles|dockPanel|thinking|maxSteps|taskCostCapUsd|setupDone|pendingFamily)$/i;
const FAMILY_MSG = 'Some settings, like your family contacts and the scam protection, are kept for your family to change in Settings, so nobody can talk you into turning them off.';

function updateSettings(ctx, args) {
  const changes = (args && typeof args.changes === 'object' && !Array.isArray(args.changes)) ? args.changes : null;
  if (!changes || !Object.keys(changes).length) return 'ERROR: say which setting to change, for example smaller text.';
  const s = ctx.settings || {};
  const patch = {}, done = [], atLimit = [], refused = [], errors = [];
  for (const [k, v] of Object.entries(changes)) {
    if (FORBIDDEN_SETTING.test(k) || !SETTING_KEYS[k]) { refused.push(k); continue; }
    const r = SETTING_KEYS[k](v, s[k]);
    if (r.error) { errors.push(k + ': ' + r.error); continue; }
    if (r.atLimit) { atLimit.push(k + ' is already the ' + r.atLimit); continue; }
    patch[k] = r.value;
    done.push(k + ': ' + JSON.stringify(s[k] == null ? '' : s[k]) + ' -> ' + JSON.stringify(r.value));
  }
  if (Object.keys(patch).length) {
    try {
      if (ctx.config && typeof ctx.config.save === 'function') { ctx.config.save(patch); ctx.settings = ctx.config.get(); }
      else return 'ERROR: I could not reach my settings just now, so nothing changed. Tell the person it did not work.';
    } catch (e) { if (ctx.log) ctx.log('update_settings save failed', e.message); return 'ERROR: I could not save that, so nothing changed. Tell the person it did not work.'; }
  }
  const parts = [];
  if (done.length) parts.push('CHANGED (now say it is done): ' + done.join('; '));
  if (atLimit.length) parts.push('NOT CHANGED (' + atLimit.join('; ') + '), so tell the person it is already as far as it goes.');
  if (refused.length) parts.push('NOT ALLOWED: ' + refused.join(', ') + '. ' + FAMILY_MSG);
  if (errors.length) parts.push('COULD NOT: ' + errors.join('; '));
  return parts.join('\n') || 'Nothing to change.';
}

// ---------- run_command: guarded PowerShell, the app's own (administrator) rights ----------
const CMD_OUT_MAX = 4000;
async function runCommand(ctx, args) {
  const command = String(args.command == null ? '' : args.command).trim();
  const explain = String(args.explain || '').trim();
  if (!command) return 'ERROR: there was no command.';
  if (ctx.settings && ctx.settings.allowCommands === false) return 'REFUSED: running commands is switched off in Settings.';
  let g;
  // A command the guardian could not check never runs (nothing asks any more, so this is the only fail-safe).
  try { g = ctx.guardian.commandCheck(command, gctxOf(ctx)); } catch (e) { g = { verdict: 'refuse', rule: 'error', reason: 'I could not check that command, so I did not run it.' }; }
  const changes = !(g && g.rule === 'read');
  if (g && g.verdict === 'refuse') {
    if (ctx.emit) safe(() => ctx.emit('command', { cmd: command, verdict: 'refuse', ok: false, rule: g.rule }));
    return refused(ctx, { verdict: 'refuse', rule: g.rule, reason: g.reason });
  }
  if (changes && (ctx.commandCount || 0) >= 5) return 'REFUSED: that is more than five changing commands for one job, so I will stop here. Ask again if you still need it.';
  // Deleting (rule R14b) is a big step and keeps its question; every other change runs.
  if (g && g.verdict === 'confirm' && g.rule && g.rule !== 'run') {
    const ans = await ask(ctx, { question: (explain || 'This deletes something on your computer.') + ' Shall I go ahead?', kind: 'confirm',
      details: { title: 'This deletes something', fields: [{ label: 'For family: the exact command', value: clip(command, 2000) }] } });
    if (ans !== 'yes') return 'The person did not say yes, so I did not run it.';
  }
  // The owner (2026-09-28): never ask permission to run a command. What the guardian refuses stays refused; everything
  // else runs in the background, and the safety diary (the 'command' event below) records it.
  // A lookup runs quietly in the background: no voice, no card, not a lesson step.
  if (changes) ctx.commandCount = (ctx.commandCount || 0) + 1;
  ctx.status({ state: 'running', step: ctx.steps.length + 1, totalSteps: ctx.totalSteps, label: changes ? 'Making the change…' : 'Checking your computer…' });
  let out, ok = true;
  try {
    out = await ctx.support.ps(command, 60000);
  } catch (e) { ok = false; out = String((e && e.message) || 'it did not work').split('\n')[0]; }
  ctx.check();
  if (ctx.emit) safe(() => ctx.emit('command', { cmd: command, verdict: changes ? 'confirm' : 'auto', ok, rule: g && g.rule }));
  if (changes) record(ctx, explain || 'Change a setting on the computer', 'run_command', '');
  const body = clip(String(out == null ? '' : out).trim() || '(no output)', CMD_OUT_MAX);
  return (ok ? 'The command ran. Result:\n' : 'The command did not work: ') + body +
    '\nTell the person only what this means for them, in plain words, and only if it matters; never the command, a file path or the raw output.';
}

const EXEC = {
  click, type_text: typeText, press_keys: pressKeys, scroll, open, wait, say: sayIt, ask_user: askUser,
  guide_user: guideUser, confirm, remember, save_contact: saveContact, zoom, run_check: runCheck, apply_fix: applyFix,
  set_plan: setPlan, update_settings: updateSettings, run_command: runCommand, done,
};

async function execute(call, ctx) {
  const name = call && call.name;
  const args = (call && call.args) || {};
  const allowed = schemas(ctx.mode).some((t) => t.function.name === name);
  if (!EXEC[name] || !allowed) return 'ERROR: the tool "' + name + '" is not available here.';
  const positional = POSITIONAL.has(name) && (args.element_id != null || num(args.x));
  if (!ACTS.has(name) || (positional && ctx.screenChanged)) ctx.saidYes = false; // a confirm-card yes is for the very next action only
  if (positional && ctx.screenChanged) return 'SKIPPED: the screen may have changed after the last action. Look at the new screen first.';
  ctx.snapNote = null;
  let res = await EXEC[name](ctx, args);
  if (CHANGES_SCREEN.has(name)) ctx.screenChanged = true;
  if (ctx.snapNote && typeof res === 'string') res = ctx.snapNote + ' ' + res; // x,y snapped to a listed item (snapEl)
  ctx.snapNote = null;
  return res;
}

module.exports = { schemas, execute, catalogOf, toPhysical, toImage, toImageRect, imageRectToPhysical, FINAL };
