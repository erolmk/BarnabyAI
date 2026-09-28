// OpenRouter chat completions (OpenAI-shaped) with tools, fallback models and cost tracking.
const product = require('./product');

const URL = 'https://openrouter.ai/api/v1/chat/completions';
const RETRY = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);
// Errors carry e.kind so the helper can say the real cause: offline | auth | credit | rate | timeout | nokey | other.
const KIND = { 401: 'auth', 403: 'auth', 402: 'credit', 429: 'rate', 408: 'timeout' };
// 04_safety decision 7 / T10: screenshots and voice go only to endpoints that keep nothing and never train.
const PRIVACY = { zdr: true, data_collection: 'deny' };
// Never route the brain to first-party or China-hosted endpoints, whatever a settings file says.
const DENY = /^(?:deepseek|alibaba|siliconflow|streamlake|baidu|tencent|volcengine|byteplus|bytedance|z-ai|zhipu|moonshotai|minimax)(?:\/|$)/i;

let totalCost = 0;
const privacyFallback = new Set(); // models with no ZDR endpoint: sent with data_collection 'deny' only (privacy page)
const served = {}; // provider name -> calls (privacy page / diagnostics)

function tag(e, status) {
  const cause = String((e && e.message) || '') + ' ' + String((e && e.cause && e.cause.code) || '');
  e.kind = KIND[status] || (e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timeout'
    : e.name === 'TypeError' || /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENETUNREACH|fetch failed/i.test(cause) ? 'offline' : 'other');
  return e;
}

// Pinned providers: only these endpoints, in this order (fallback stays inside the list), ZDR, no training,
// and only endpoints that support every parameter we send (tools, images, reasoning).
function providerFor(providers) {
  const list = (Array.isArray(providers) ? providers : []).map((p) => String(p || '').trim()).filter((p) => p && !DENY.test(p));
  if (!list.length) return { ...PRIVACY };
  return { order: list, only: list, allow_fallbacks: true, ...PRIVACY, require_parameters: true };
}

// zdrOnly: never drop zdr on a 404 (speech-to-text: the person's voice only goes to endpoints that keep nothing).
async function chat({ apiKey, model, fallbackModel, providers, messages, tools, toolChoice, maxTokens = 1500,
  temperature = 0.2, reasoningEffort = 'low', timeoutMs = 90000, retries = 2, zdrOnly = false, fetchImpl = fetch }) {
  if (!apiKey) throw Object.assign(new Error('no API key'), { kind: 'nokey' });
  const provider = providerFor(providers);
  const pinned = !!provider.only || zdrOnly;
  const body = { messages, max_tokens: maxTokens, usage: { include: true }, provider };
  // Gemini 3 should stay at its default temperature (lower values can make it loop).
  if (!/^google\/gemini-3/.test(model)) body.temperature = temperature;
  // OpenRouter native fallback routing: tries each model in order.
  if (fallbackModel && fallbackModel !== model) body.models = [model, fallbackModel];
  else body.model = model;
  if (tools && tools.length) { body.tools = tools; body.tool_choice = toolChoice || 'auto'; }
  // Reasoning is returned (not excluded) so the whole assistant message, reasoning_details included, can go
  // back in the tool loop: DeepSeek and Gemini both need their own reasoning handed back between tool calls.
  if (reasoningEffort) body.reasoning = { effort: reasoningEffort };
  if (!pinned && privacyFallback.has(model)) delete body.provider.zdr;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': product.website,
          'X-Title': product.name,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = tag(new Error('LLM HTTP ' + res.status + ' ' + text.slice(0, 300)), res.status);
        // No ZDR endpoint for this model: keep "never train on it", drop "keep nothing" (04_safety 7.1), once.
        // Never with pinned providers: a 404 there means none of OUR endpoints can serve it, and widening the
        // search would reach a provider nobody chose.
        if (res.status === 404 && body.provider.zdr && !pinned) { delete body.provider.zdr; privacyFallback.add(model); continue; }
        if (!RETRY.has(res.status)) break;
        const ra = Number(res.headers.get('retry-after'));
        if (ra > 0 && ra <= 20) await new Promise((r) => setTimeout(r, ra * 1000));
      } else {
        const data = JSON.parse(text);
        if (data.error) throw tag(new Error('LLM error ' + JSON.stringify(data.error).slice(0, 300)), Number(data.error.code));
        const choice = data.choices && data.choices[0];
        if (!choice) throw new Error('LLM: empty response');
        const cost = (data.usage && data.usage.cost) || 0;
        totalCost += cost;
        if (data.provider) served[data.provider] = (served[data.provider] || 0) + 1;
        return { message: choice.message, finish: choice.finish_reason, usage: data.usage, cost, model: data.model, provider: data.provider };
      }
    } catch (e) {
      lastErr = e.kind ? e : tag(e);
      if (lastErr.kind === 'timeout' && attempt >= 1) break; // a hung service: one retry, not minutes of "Thinking…"
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastErr;
}

// Speech-to-text through an audio-capable chat model. wavBase64 = 16 kHz mono PCM WAV.
// Zero retention only (04_safety 7.1): google/gemini-3.1-flash-lite's ZDR endpoints are Google Vertex (AI Studio
// is not ZDR, so it is never used); if Google is down, Mistral's Voxtral (ZDR endpoints, EU company) takes over.
const STT_FALLBACK = 'mistralai/voxtral-small-24b-2507';
async function transcribe({ apiKey, model, wavBase64, fetchImpl, hints = [], fallbackModel = STT_FALLBACK }) {
  const r = await chat({
    apiKey, model, fallbackModel, zdrOnly: true, fetchImpl, maxTokens: 400, temperature: 0, reasoningEffort: null,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Transcribe this recording of a person talking to their computer helper. Reply with only the exact words spoken, nothing else. If no words are spoken, reply with nothing.' + (hints.length ? ' Names they may say: ' + hints.slice(0, 30).join(', ') + '.' : '') },
        { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
      ],
    }],
  });
  const text = (typeof r.message.content === 'string' ? r.message.content : '').trim();
  return { text: text.replace(/^["']|["']$/g, ''), cost: r.cost };
}

module.exports = { chat, transcribe, providerFor, tag, RETRY, STT_FALLBACK, stats:() => ({ totalCost, privacyFallback: [...privacyFallback], served: { ...served } }) };
