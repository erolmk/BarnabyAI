// Maps a spoken/typed reply onto the open question (confirm -> yes/no, choice -> the one choice it clearly names).
// Anything unclear comes back as the person's own words, so the brain asks again instead of guessing.
const clean = (s) => String(s == null ? '' : s).toLowerCase().replace(/[‘’]/g, "'")
  .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

const NO = /^(?:no|nope|nah|wait|stop|don't|dont|do not|not yet|cancel|wrong|hold on|hang on)\b/;
// Any of these anywhere means "yes, but..." or "not yet": never consent, even after a yes.
const HEDGE = /\b(?:no|not|nope|nah|wait|hold|hang|stop|don't|dont|cancel|wrong|but|change|after|later|first|before|until|instead|except|however|if|unless|maybe|actually)\b/;
const YES = /^(?:yes|yeah|yep|yup|ok|okay|sure|correct|right|alright|absolutely|of course|go ahead|please do|do it|send it|looks good)\b/;
// A yes counts only when every other word is one of these ("Yes, that's right, go ahead please").
const FILLER = new Set(("yes yeah yep yup ok okay sure correct right alright all that that's thats it is it's its go ahead please " +
  'do send looks good fine great perfect everything thank thanks you very much i i\'m im am of course absolutely now on and for to me').split(' '));
// Words too common to tell two choices apart ("The internet is NOT working" vs "I'm NOT sure").
const STOP = new Set(("the and but not you your for with this that please can could would will just are was have has its it's " +
  "what how some any all from about there they them then our very really also too i'm don't dont").split(' '));
const words = (s) => clean(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const pad = (s) => ' ' + s + ' ';

// -> 'yes' | 'no' | null (not a plain yes or no)
function confirmAnswer(value) {
  const c = clean(value);
  if (c === 'yes' || c === 'no') return c;
  if (NO.test(c)) return 'no';
  if (HEDGE.test(c)) return null;
  if (YES.test(c) && c.split(' ').every((w) => FILLER.has(w))) return 'yes';
  return null;
}

// -> the one choice the answer names, or null
function choiceAnswer(choices, value) {
  const lv = clean(value);
  if (!lv) return null;
  const exact = choices.find((c) => clean(c) === lv);
  if (exact) return exact;
  if (/\b(?:not sure|don'?t know|no idea)\b/.test(lv)) return choices.find((c) => /not sure/i.test(c)) || null;
  const yn = confirmAnswer(value); // "yes please" -> "Yes, close it" (only a choice that is a plain yes or no)
  if (yn) {
    const m = choices.filter((c) => new RegExp('^' + yn + '\\s*(?:[,.!]|$)', 'i').test(c.trim()));
    if (m.length === 1) return m[0];
  }
  const named = choices.filter((c) => pad(lv).includes(pad(clean(c))) || (words(lv).length && pad(clean(c)).includes(pad(lv))));
  if (named.length === 1) return named[0];
  const ws = new Set(words(lv));
  let best = null, bestN = 0, tie = false;
  for (const c of choices) {
    const n = new Set(words(c).filter((w) => ws.has(w))).size;
    if (n > bestN) { best = c; bestN = n; tie = false; } else if (n && n === bestN) tie = true;
  }
  return best && !tie ? best : null;
}

function normalizeAnswer(p, value) {
  const v = String(value == null ? '' : value).trim();
  if (p.kind === 'confirm') return confirmAnswer(v) || v;
  if (p.kind === 'choice' && p.choices && p.choices.length) return choiceAnswer(p.choices, v) || v;
  return v;
}

module.exports = { normalizeAnswer, confirmAnswer, choiceAnswer };
