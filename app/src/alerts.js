// Family alerts and the other safety wording main.js needs (04_safety 7-9, website safety.html):
// - consent: alerts only when the person chose "Tell <family> if I might be in a scam" and a code exists;
// - an alert says only the kind of warning and the time, never page text, web addresses or amounts (W17);
// - Scam Shield off and family-contact changes = "delay, not deny": they wait 24 hours and family is told;
// - the optional weekly note carries counts only.
// Pure functions; main.js does the sending, the diary and the stats file.
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const EPISODE = 60 * 60 * 1000; // one scam alert per scam episode (04_safety 5.2)

const KIND = {
  tech_support: 'fake virus pop-up', remote_access: 'remote-control program', government: 'fake government notice',
  bank: 'fake bank message', invoice: 'fake bill or renewal', prize: 'fake prize', romance: 'online friend asking for money',
  family_emergency: 'fake family emergency', gift_card: 'request to buy gift cards', crypto: 'request for Bitcoin',
  money_move: 'request to move money', delivery: 'fake delivery or toll message', other: 'suspicious screen',
};
// Guardian refusals the agent reports (rule id -> plain words). 'final' is not a refusal: the person presses it.
const REFUSAL = {
  R1: 'opening a remote-control program', R2: 'typing a private number or password', R3: 'paying with gift cards',
  R4: 'Bitcoin or crypto', R5: 'sending or moving money', R6: 'calling a number from the screen',
  R7: 'turning off virus protection', R8: 'changing email forwarding or account recovery',
  R11: 'saving a program from an unknown place', R14: 'deleting something forever',
  R16: 'working while a remote-control program was connected', console: 'opening a command window',
};
// Refusals that also alert family (04_safety 8.3): remote tools and the money exits.
const REFUSAL_ALERT = { R1: 'remote_access', R16: 'remote_access', R3: 'gift_card', R4: 'crypto', R5: 'money_move' };

const kindLabel = (k) => KIND[k] || (Object.values(KIND).includes(k) ? k : KIND.other);
const withArticle = (s) => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const person = (s) => String((s && s.userName) || '').trim();
const familyName = (s) => String(((s && s.family) || {}).name || '').trim();

function canAlert(s) {
  const f = (s && s.family) || {};
  return f.alertConsent === 'tell_family' && !!String(f.ntfyTopic || '').trim();
}
const scamAlertAllowed = (s, lastScamAlertAt, now) => canAlert(s) && now - (lastScamAlertAt || 0) >= EPISODE;

function scamAlertText(s, kind, now) {
  const who = person(s);
  return (who ? who + "'s" : 'Your family member\'s') + ' computer helper showed a scam warning at ' + clock(now) + ': ' +
    kindLabel(kind) + '. They were told it\'s a scam and not to call or pay. A kind call from you would help.';
}
const toldFamilyLine = (s) => "I've let " + (familyName(s) || 'your family') + ' know, like you asked me to.';
const warningLine = (assistant, kind) => assistant + ' warned about ' + withArticle(kindLabel(kind)) + '.';
function refusalLine(assistant, rule) {
  if (!rule || rule === 'final') return null;
  return assistant + ' said no to ' + (REFUSAL[rule] || 'something that was not safe') + '.';
}

// Scam Shield switch. -> {offAt} to store, or null for no change. Turning it on cancels a pending switch-off.
function shieldChange(before, patch, now) {
  if (!patch || typeof patch.scamShield !== 'boolean') return null;
  if (patch.scamShield) return before && before.scamShieldOffAt ? { offAt: 0 } : null;
  if (before && before.scamShield) return { offAt: now + DAY };
  return null;
}
const shieldOn = (s, now) => !!(s && s.scamShield) || (+(s && s.scamShieldOffAt) || 0) > now;

// Family contact and alert changes that weaken protection wait a day too: changing or clearing the family
// name, phone, email or alert code, or "Just me" after "Tell <family>". A first value, "Tell <family>", or changing
// a field back (which cancels its wait) is immediate. -> {family to save now, pendingFamily, added}
const LOCKED = ['name', 'phone', 'email', 'ntfyTopic', 'alertConsent'];
const str = (v) => String(v == null ? '' : v).trim();
function familyLock(before, patch, now) {
  const f = patch && patch.family;
  if (!f || typeof f !== 'object') return null;
  // First-run setup: nothing to protect yet, so picking person A then B applies at once. `=== false`, not
  // !setupDone: DEFAULTS always holds a boolean, so a settings object without it keeps the lock (fail closed).
  if (before && before.setupDone === false) return { family: { ...f }, pendingFamily: [], added: [] };
  const was = (before && before.family) || {}, old = (before && before.pendingFamily) || [];
  const family = { ...f }, added = [];
  const pendingFamily = old.filter((x) => !(x.field in family)); // fields not in this patch keep waiting
  for (const k of LOCKED) {
    if (!(k in family) || str(family[k]) === str(was[k])) continue;
    if (!(k === 'alertConsent' ? was[k] === 'tell_family' : str(was[k]))) continue; // not weaker: right away
    let x = old.find((o) => o.field === k && str(o.value) === str(family[k]));
    if (!x) { x = { field: k, value: family[k], at: now + DAY }; added.push(x); }
    pendingFamily.push(x);
    family[k] = was[k];
  }
  return { family, pendingFamily, added };
}
// Waits that are over. -> {family, pendingFamily} to save, or null
function dueFamily(s, now) {
  const list = (s && s.pendingFamily) || [];
  const due = list.filter((x) => x.at <= now);
  if (!due.length) return null;
  const family = {};
  for (const x of due) family[x.field] = x.value;
  return { family, pendingFamily: list.filter((x) => x.at > now) };
}
// "Delay, not deny" (04_safety 8.5) for a settings patch from a window: only main sets the switch-off time and
// the waiting changes, and a Scam Shield value that is not true (0, null) is "off", which waits a day.
// -> {patch to save, shield: shieldChange result, familyAdded: new waits}
function safetyPatch(before, patch, now) {
  const p = { ...(patch || {}) };
  delete p.scamShieldOffAt;
  delete p.pendingFamily;
  if ('scamShield' in p) p.scamShield = p.scamShield === true;
  const shield = shieldChange(before, p, now);
  if (shield) p.scamShieldOffAt = shield.offAt;
  const fam = familyLock(before, p, now);
  if (fam) { p.family = fam.family; p.pendingFamily = fam.pendingFamily; }
  return { patch: p, shield, familyAdded: fam ? fam.added : [] };
}
const familyChangeLine = (at) => 'The family contact or alert settings were changed. The change takes effect tomorrow at ' + clock(at) + '.';
function familyChangeText(s, at) {
  const who = person(s);
  return (who ? who + "'s computer helper: " : '') + familyChangeLine(at) + ' It can be undone in Settings.';
}
function helperDownText(s) {
  const who = person(s);
  return (who ? who + "'s computer helper" : 'The computer helper') +
    ' cannot see the screen right now, so Scam Shield is paused. Restarting the computer usually fixes it.';
}
// The connection key was refused or its credit ran out (llm error kind auth | credit): only family can fix that.
function connectionText(s, kind) {
  const who = person(s);
  return (who ? who + "'s computer helper" : 'The computer helper') + ' cannot connect: ' +
    (kind === 'credit' ? 'the connection has run out of credit' : 'the connection key was not accepted') + '. Please check it in Settings.';
}
function shieldOffText(s, offAt) {
  const who = person(s);
  return (who ? who + "'s computer helper: " : '') + 'Scam Shield will switch off tomorrow at ' + clock(offAt) +
    '. It can be turned back on any time.';
}

// Weekly note: due once 7 days have passed since the last one (the clock starts when it is switched on).
const weeklyDue = (s, stats, now) => !!(s && s.family && s.family.weeklyNote) && canAlert(s) &&
  !!(stats && stats.weeklyAt) && now - stats.weeklyAt >= WEEK;
function weeklyNoteText(s, helped, warnings, assistant) {
  return 'This week ' + assistant + ' helped ' + (person(s) || 'your family member') + ' ' + helped + (helped === 1 ? ' time' : ' times') +
    ' and showed ' + warnings + (warnings === 1 ? ' scam warning.' : ' scam warnings.');
}

// A command line Barnaby ran (or was stopped from running) as one safety-diary line: shortened to 80 characters,
// private numbers hidden by the guardian's redact(), passwords, keys and tokens hidden here.
const SECRET_FLAG = /((?:^|\s)[-/](?:p|pw|pwd|pass|passwd|password|key|apikey|token|secret|credential)\b[:=\s]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const SECRET_SET = /\b(password|passwd|pwd|token|secret|api_?key|access_?key)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const SECRET_POS = /\b(net(?:\.exe)?\s+user\s+\S+\s+|ConvertTo-SecureString\s+(?:-String\s+)?)(?![/-])("[^"]*"|'[^']*'|\S+)/gi;
const TOKEN = /\b(?:sk|pk|rk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{8,}|\b[A-Za-z0-9+/_-]{32,}={0,2}/g;
function commandText(cmd, redact = (t) => t) {
  const t = String(redact(String(cmd == null ? '' : cmd))).replace(/\s+/g, ' ').trim()
    .replace(SECRET_FLAG, '$1[hidden]').replace(SECRET_SET, '$1$2[hidden]').replace(SECRET_POS, '$1[hidden]').replace(TOKEN, '[hidden]');
  return t.length > 80 ? t.slice(0, 79) + '…' : t;
}
function commandLine(assistant, c, redact) {
  if (!c || !String(c.cmd || '').trim()) return null;
  const q = '“' + commandText(c.cmd, redact) + '”';
  if (c.verdict === 'refuse') return assistant + ' said no to a command: ' + q + '.';
  if (!c.ok) return assistant + ' tried a command, but it did not work: ' + q + '.';
  return assistant + ' ran a command' + (c.verdict === 'confirm' ? ' after a yes on the card' : '') + ': ' + q + '.';
}

// Scam Shield warns once per page or opened email a session, and about one kind of trick at most once in 5 minutes
// (the owner heard the same gift-card warning four times in 16 minutes). A count in the title ("Inbox (5,703)") is
// not a new page. Records the warning and returns true when it should be shown.
const REPEAT_MS = 5 * 60 * 1000;
function warnOnce(warned, kinds, hwnd, title, kind, now) {
  const key = hwnd + '|' + String(title || '').replace(/\s*\(\d[\d,.]*\)/g, '');
  if (warned.has(key) || now - (kinds.get(kind) || -Infinity) < REPEAT_MS) return false;
  warned.set(key, now);
  kinds.set(kind, now);
  return true;
}

module.exports = {
  commandText, commandLine, warnOnce,
  DAY, WEEK, EPISODE, KIND, REFUSAL, REFUSAL_ALERT, kindLabel, withArticle, clock, canAlert, scamAlertAllowed,
  scamAlertText, toldFamilyLine, warningLine, refusalLine, shieldChange, shieldOn, shieldOffText, weeklyDue, weeklyNoteText,
  familyLock, dueFamily, safetyPatch, familyChangeLine, familyChangeText, helperDownText, connectionText,
};
