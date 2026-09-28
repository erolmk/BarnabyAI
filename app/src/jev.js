// TypeSafe Jev (System One decisions model) via OpenRouter's decisions endpoint.
// Request:  {model, state, questions:{id:{type:"choice"|"noul"|"score", instructions, criteria}}}
// Answers:  choice -> {choice, probabilities, confidence}; noul -> {noul: p(yes)}; score -> {score, probabilities, confidence}
const URL = 'https://openrouter.ai/api/alpha/decisions';
const RETRY = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);
// Circuit breaker: after a failed call, fail fast for a minute (every caller has an instant rules-only
// fallback), then let the next call through as a probe.
const COOL_MS = 60000;
// 04_safety 7.1: never train on it, keep nothing. Checked live 2026-09-26: the decisions endpoint parses and honours
// `provider` (a bad data_collection value is a 400; `only` is enforced), and OpenRouter's ZDR list
// (/api/v1/endpoints/zdr) includes the TypeSafe endpoint of typesafe/jev-1.13, so zdr:true is served. If that ever
// stops, calls fail (404), the circuit opens and every caller uses its rules-only fallback: privacy is never relaxed.
const PROVIDER = { zdr: true, data_collection: 'deny' };

let totalCost = 0;
let calls = 0;
let openUntil = 0;

async function ask(state, questions, { apiKey, model = '~typesafe/jev-latest', timeoutMs = 4000, retries = 1, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('no API key');
  if (Date.now() < openUntil) throw new Error('jev: circuit open');
  const body = JSON.stringify({ model, state, questions, provider: PROVIDER });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastErr = new Error('jev HTTP ' + res.status + ' ' + text.slice(0, 200));
        if (!RETRY.has(res.status)) break;
      } else {
        const data = await res.json();
        calls++;
        const cost = (data.usage && data.usage.cost) || 0;
        totalCost += cost;
        if (!data.answers) throw new Error('jev: no answers');
        openUntil = 0;
        return { answers: data.answers, cost, ms: Date.now() - t0, model: data.model };
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  openUntil = Date.now() + COOL_MS;
  throw lastErr;
}

// One choice question. criteria: {key: description}. -> {choice, probabilities, confidence}
async function choice(state, instructions, criteria, opts) {
  const r = await ask(state, { q: { type: 'choice', instructions, criteria } }, opts);
  return r.answers.q;
}

// One yes/no question -> probability of yes (0..1).
async function noul(state, instructions, opts, criteria) {
  const q = { type: 'noul', instructions };
  if (criteria) q.criteria = criteria;
  const r = await ask(state, { q }, opts);
  return r.answers.q.noul;
}

module.exports = { ask, choice, noul, stats: () => ({ calls, totalCost, circuitOpen: Date.now() < openUntil }), reset: () => { openUntil = 0; } };
