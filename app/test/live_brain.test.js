// Live check of the brain model through the pinned private providers (costs well under $0.01).
//   LIVE=1 OPENROUTER_API_KEY=... node --test test/live_brain.test.js
// Proves: DeepSeek answers with a tool call about an IMAGE, through a pinned zero-retention provider, and the
// whole assistant message (reasoning_details included) goes back in the tool loop without an error.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const llm = require('../src/llm');
const { DEFAULTS } = require('../src/config');

const LIVE = process.env.LIVE === '1' && !!process.env.OPENROUTER_API_KEY;
const PINNED = new Set(DEFAULTS.providers.map((p) => p.split('/')[0].toLowerCase()));

test('LIVE: brain model sees an image, calls a tool, and keeps its reasoning across the tool loop', { skip: !LIVE && 'set LIVE=1 and OPENROUTER_API_KEY' }, async () => {
  const png = fs.readFileSync(path.join(__dirname, 'fixtures', 'newtab.png')).toString('base64');
  const say = { type: 'function', function: { name: 'say', description: 'Say something to the person.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } };
  const done = { type: 'function', function: { name: 'done', description: 'Finish.', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } };
  const base = { apiKey: process.env.OPENROUTER_API_KEY, model: DEFAULTS.brainModel, providers: DEFAULTS.providers, tools: [say, done], maxTokens: 3000 };
  const messages = [
    { role: 'system', content: 'You are a helper. Always answer by calling a tool.' },
    { role: 'user', content: [{ type: 'text', text: 'Which shortcut names are shown under the search box? Call say with them, nothing else.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png } }] },
  ];
  const r1 = await llm.chat({ ...base, messages, reasoningEffort: 'high' });
  const call = (r1.message.tool_calls || [])[0];
  const info = (r) => ({ provider: r.provider, model: r.model, cost: r.cost, reasoningTokens: r.usage && r.usage.completion_tokens_details && r.usage.completion_tokens_details.reasoning_tokens,
    reasoningDetails: Array.isArray(r.message.reasoning_details) ? r.message.reasoning_details.map((d) => d.type) : null, finish: r.finish });
  process.stdout.write('call 1 (high): ' + JSON.stringify(info(r1)) + '\n');
  assert.ok(call && call.function.name === 'say', JSON.stringify(r1.message).slice(0, 300));
  assert.match(call.function.arguments, /gmail/i);
  assert.match(call.function.arguments, /youtube/i);
  assert.ok(r1.provider && PINNED.has(String(r1.provider).toLowerCase().replace(/\s+/g, '')), 'served by a pinned provider: ' + r1.provider);

  // The whole assistant message goes back, as agent.js does.
  messages.push(r1.message, { role: 'tool', tool_call_id: call.id, content: 'Said.' }, { role: 'user', content: 'Now finish.' });
  const r2 = await llm.chat({ ...base, messages, reasoningEffort: 'low' });
  process.stdout.write('call 2 (low, history with reasoning): ' + JSON.stringify(info(r2)) + '\n');
  assert.ok((r2.message.tool_calls || []).some((c) => c.function.name === 'done'), JSON.stringify(r2.message).slice(0, 300));
  process.stdout.write('llm.stats: ' + JSON.stringify(llm.stats()) + '\n');
});
