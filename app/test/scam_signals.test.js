// Contract check for src/scam_signals.json (shape, sizes, regexes). Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/scam_signals.json');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hits = (list, text) => list.filter((k) => new RegExp('\\b' + esc(k) + '\\b').test(text));
const rx = (name, flags = 'g') => new RegExp(S.sensitive_regex[name], flags);

test('shape and sizes', () => {
  for (const k of ['keywords', 'strong_phrases', 'remote_access_processes', 'remote_access_domains', 'payment_red_flags']) {
    const list = S[k];
    assert.ok(Array.isArray(list) && list.length, k);
    assert.strictEqual(new Set(list).size, list.length, k + ' has duplicates');
    for (const v of list) assert.strictEqual(v, v.toLowerCase().trim(), k + ': ' + v);
  }
  assert.ok(S.keywords.length >= 60 && S.keywords.length <= 150, 'keywords ' + S.keywords.length);
  assert.ok(S.strong_phrases.length >= 20 && S.strong_phrases.length <= 60, 'strong ' + S.strong_phrases.length);
  assert.ok(S.remote_access_processes.every((p) => !p.endsWith('.exe')));
  for (const k of ['card', 'ssn', 'routing']) assert.strictEqual(typeof S.sensitive_regex[k], 'string');
});

test('word-boundary matching, no substring false hits', () => {
  assert.deepStrictEqual(hits(S.keywords, 'first we climbed the stairs'), []);
  const popup = 'windows defender security alert: your computer has been locked. do not restart. call microsoft support toll-free 1-888-555-0199';
  assert.ok(hits(S.strong_phrases, popup).length >= 2);
  assert.ok(hits(S.keywords, popup).length >= 4);
  assert.ok(new RegExp(S.phone_regex.tollfree).test(popup));
  assert.ok(hits(S.payment_red_flags, 'go to walgreens and buy apple gift card, then scratch off the back').length >= 2);
});

test('sensitive regexes', () => {
  assert.ok(rx('card').test('card 4111 1111 1111 1111 exp'));
  assert.ok(rx('ssn').test('ssn 123-45-6789'));
  assert.ok(!rx('ssn').test('123-45 6789'), 'mixed separators');
  assert.ok(!rx('ssn').test('000-12-3456'), 'invalid area');
  assert.ok(rx('routing').test('routing 021000021'));
  assert.ok(rx('mbi', 'gi').test('medicare 1EG4-TE5-MK73'));
  assert.ok(rx('otp', 'gi').test('Your verification code is 482913'));
  assert.ok(!rx('card').test('call 555-0199'));
});
