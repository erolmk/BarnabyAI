// Intent routing of one utterance: keyword fast path for stop/home, else one Jev choice,
// low confidence -> optional LLM fallback, Jev failure -> keyword heuristic.
const jevDefault = require('./jev');

const INTENTS = ['task', 'support', 'chat', 'teach', 'scam_check', 'family', 'stop', 'home'];

const STOP_RX = /^(?:ok(?:ay)?,? |oh,? )?(?:please )?(?:stop(?: it| that| now| talking| please)*|cancel(?: it| that| please)*|never ?mind|forget (?:it|that)|quit(?: it| that)?|that(?:'?s| is) enough|enough|be quiet|hush|shh+)(?: please| now| thanks?(?: you)?)*$/;
// Closing Barnaby himself (main.js asks first). Needs him or "yourself" named: a bare "close it" is about a page.
const QUIT_RX = /^(?:ok(?:ay)?,? )?(?:please )?(?:(?:close|quit|exit|shut down|turn off|switch off) (?:barnaby|yourself)|(?:turn|switch|shut) (?:barnaby|yourself) (?:off|down))(?: please| now| for (?:now|today))*$/;
const HOME_RX = /^(?:please )?(?:(?:go|take me|bring me|get me|go back|back)(?: back)? (?:to )?(?:the |my )?(?:home(?: screen)?|main screen|start screen|beginning)|home(?: screen)?|(?:show me )?(?:the |my )?home screen)(?: please)?$/;

const INSTRUCTIONS = 'An older adult said this to the helper on their computer (spoken, may contain speech-to-text mistakes). What kind of help do they want?';
const CRITERIA = {
  task: {
    what: 'Wants the helper to do or open something on the computer: email, send photos or files, open a website or app, find, print, play, buy, book, write a letter.',
    not_for: 'Asking to be shown how (teach), reporting that something is broken (support), a suspicious message or call (scam_check), or only calling a relative (family).',
    examples: ['I want to send photos to Anne Marie', 'open my email', 'print this page', 'put on some music', 'find my pictures from Christmas', 'make the letters bigger', 'write an email to my doctor'],
  },
  support: {
    what: 'The computer, internet, sound, printer, screen, mouse or a program is broken, slow, frozen or not working right.',
    not_for: 'Scary pop-ups, calls or messages that may be a scam (scam_check).',
    examples: ['my computer is so slow', 'the internet is not working', 'I cannot hear anything', 'the printer will not print', 'the screen went black', 'my email will not open', 'everything is frozen'],
  },
  chat: {
    what: 'A question or conversation that needs nothing done on the screen: what a computer word or thing is or means, weather, facts, news, health or general advice, jokes, small talk, feelings.',
    examples: ['what is a browser', 'what does Wi-Fi mean', 'what is the weather like', 'tell me a joke', 'what day is it', 'who won the ball game last night', 'I feel lonely today', 'how many ounces in a cup'],
  },
  teach: {
    what: 'Wants to learn or be shown how to do something on the computer so they can do it themselves.',
    not_for: 'Only asking what a word or thing is or means, with nothing to do on the screen (chat).',
    examples: ['show me how to attach a file', 'how do I make the letters bigger', 'teach me to make a video call', 'what does this button do', 'how do I copy a picture'],
  },
  scam_check: {
    what: 'Worried a call, email, text, letter, pop-up or website is a trick, or someone asks for money, gift cards, passwords, codes or control of the computer.',
    examples: ['a man called saying he is from Microsoft', 'is this email real', 'a pop-up says I have a virus and to call a number', 'someone wants me to buy gift cards', 'my grandson says he is in jail and needs money', 'the bank texted me a link'],
  },
  family: {
    what: 'Wants to call, video call or reach a family member or friend, with nothing else to do.',
    not_for: 'Sending photos, files or a written email to someone (task).',
    examples: ['call my daughter', 'I want to see my grandson on video', 'get Susan on the phone', 'can I talk to my son'],
  },
  stop: {
    what: 'Wants the helper to stop, cancel, be quiet or leave it for now.',
    examples: ['stop', 'never mind', 'that is enough, thank you', 'forget it', 'be quiet'],
  },
  home: {
    what: 'Wants to go back to the home screen or start over.',
    examples: ['go home', 'back to the start', 'take me to the main screen', 'show me my home screen'],
  },
};

function clean(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[.!?,;:"]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const HEURISTIC = [
  ['scam_check', /\b(scam|fraud|trick|is (?:this|it) real|suspicious|gift cards?|bitcoin|pop-?up|virus|hacked|called (?:me )?(?:saying|from)|claims? to be|from microsoft|irs|warrant|arrest|won a|lottery)\b/],
  ['teach', /\b(show me how|teach me|how do i|how can i|how to|what does .* do|learn)\b/],
  ['family', /^(?:please )?(?:call|phone|ring|video ?call|facetime|talk to|see)\b.*\b(daughter|son|grand\w*|wife|husband|sister|brother|niece|nephew|mom|dad|family|kids)\b/],
  ['support', /\b(slow|frozen|freez\w*|not working|isn'?t working|won'?t|can'?t hear|no sound|broken|crash\w*|stuck|internet|wi-?fi|printer|error|black screen|keeps)\b/],
  ['chat', /^(?:what|who|when|where|why|tell me|is it|will it|do you|are you|how (?:is|are|many|much|old|far|long))\b/],
];

// The LLM fallback's reply -> an intent, or '' when it names none. Thinking (<think>...</think>) is dropped first;
// the LAST intent word wins ("not task, it is support", "...so the answer is: scam check").
const INTENT_WORD = /\b(task|support|chat|teach|scam[\s_-]?check|family|stop|home)\b/g;
function parseIntent(text) {
  const t = String(text == null ? '' : text).replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ' ').toLowerCase();
  const all = t.match(INTENT_WORD);
  return all ? all[all.length - 1].replace(/^scam[\s_-]?check$/, 'scam_check') : '';
}

function heuristic(u) {
  for (const [intent, rx] of HEURISTIC) if (rx.test(u)) return intent;
  return 'task';
}

async function route(utterance, { apiKey, jevModel, llmFallback, jev = jevDefault } = {}) {
  const u = clean(utterance);
  if (!u) return { intent: 'chat', confidence: 0, source: 'empty' };
  if (QUIT_RX.test(u)) return { intent: 'quit', confidence: 1, source: 'keyword' };
  if (STOP_RX.test(u)) return { intent: 'stop', confidence: 1, source: 'keyword' };
  if (HOME_RX.test(u)) return { intent: 'home', confidence: 1, source: 'keyword' };
  let ans;
  try {
    const r = await jev.ask({ utterance: String(utterance).slice(0, 500) }, {
      intent: { type: 'choice', instructions: INSTRUCTIONS, criteria: CRITERIA },
    }, { apiKey, model: jevModel || '~typesafe/jev-latest' });
    ans = r.answers.intent;
    if (!INTENTS.includes(ans.choice)) throw new Error('jev: unknown intent ' + ans.choice);
  } catch (_) {
    return { intent: heuristic(u), confidence: 0.3, source: 'heuristic' };
  }
  if (ans.confidence < 0.5 && typeof llmFallback === 'function') {
    try {
      const alt = parseIntent(await llmFallback(utterance));
      if (alt) return { intent: alt, confidence: ans.confidence, source: 'llm' };
    } catch (_) { /* keep Jev's answer */ }
  }
  return { intent: ans.choice, confidence: ans.confidence, source: 'jev' };
}

// Said while a task runs, but not a request (the owner: a stray "Erol" and "Thank you so much, Barnaby" each got
// "I'm still working on the last thing"). -> 'thanks' (only thanks and kind words), 'filler' ("um", "hey Barnaby"),
// 'short' (one other word: a stray name, or the end of a sentence cut by a pause), or null for a real request.
const FILLER = new Set('um umm uh uhm er erm ah ahh hmm hm mm mhm oh hey hi hello ok okay yes yeah yep so well right alright barnaby'.split(' '));
const KIND_WORDS = new Set("thank thanks thankyou cheers you so much very a lot again dear that's thats that is it was great wonderful lovely perfect good nice really kind of i appreciate".split(' '));
function smallTalk(utterance) {
  const w = clean(utterance).split(' ').filter(Boolean);
  if (!w.length || w.every((x) => FILLER.has(x))) return 'filler';
  if (w.some((x) => /^(?:thank|thanks|thankyou|cheers)$/.test(x)) && w.every((x) => FILLER.has(x) || KIND_WORDS.has(x))) return 'thanks';
  return w.filter((x) => !FILLER.has(x)).length === 1 ? 'short' : null;
}

module.exports = { route, INTENTS, heuristic, parseIntent, CRITERIA, smallTalk };
