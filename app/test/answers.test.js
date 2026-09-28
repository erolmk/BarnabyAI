// How a spoken or typed reply is mapped onto the open question (src/answers.js, used by main.js resolveAsk).
const test = require('node:test');
const assert = require('node:assert');
const { normalizeAnswer } = require('../src/answers');

const confirm = (v) => normalizeAnswer({ kind: 'confirm' }, v);
const choice = (choices, v) => normalizeAnswer({ kind: 'choice', choices }, v);

test('confirm: only a plain yes is consent; "yes, but..." and hesitations are not', () => {
  for (const v of ['yes', 'Yes.', 'Yeah, go ahead', 'Okay', 'Sure, please do', 'Yes, that’s right', 'Correct', 'Right', 'Yes please send it', 'Yes, I’m sure'])
    assert.strictEqual(confirm(v), 'yes', v);
  for (const v of ['no', 'No thanks', 'Wait', 'Not yet', 'Don’t do that', 'Hold on', 'cancel'])
    assert.strictEqual(confirm(v), 'no', v);
  for (const v of ['Okay, wait', 'Okay, wait, let me save first', 'It is not correct, the address is wrong', 'Yes but change the subject',
    'Sure, after I save my work', 'right, hold on', 'Okay but not yet', 'It is', 'Yes, Barnaby, the other one'])
    assert.strictEqual(confirm(v), v, v + ' comes back as the person’s own words');
});

test('choice: buttons and clear answers map; stop-words and "I’m not sure" never pick a choice', () => {
  const trouble = ['It is slow', 'No sound', 'The internet is not working', 'The printer', 'Something else'];
  assert.strictEqual(choice(trouble, 'The printer'), 'The printer', 'button press');
  assert.strictEqual(choice(trouble, 'I’m not sure'), 'I’m not sure', 'the widget’s own button');
  assert.strictEqual(choice(trouble, 'the screen is frozen'), 'the screen is frozen', 'shared "the" is not a match');
  assert.strictEqual(choice(trouble, 'the printer is broken'), 'The printer');
  assert.strictEqual(choice(trouble, 'it’s really slow today'), 'It is slow');
  assert.strictEqual(choice(trouble, 'no'), 'no', '"no" is not "No sound"');
  assert.strictEqual(choice(trouble, 'the wifi, the internet'), 'The internet is not working');
  const guide = ['I did it', 'Please do it for me', 'I need help'];
  assert.strictEqual(choice(guide, 'I do not see it, please help'), 'I need help');
  assert.strictEqual(choice(guide, 'yes I did'), 'I did it');
  assert.strictEqual(choice(['Gmail', 'Outlook', 'AOL', 'Yahoo'], 'I use gmail.'), 'Gmail');
  assert.strictEqual(choice(['Yes, close it', 'No, leave it'], 'yes please'), 'Yes, close it');
  assert.strictEqual(choice(['Yes, close it', 'No, leave it'], 'no thank you'), 'No, leave it');
  assert.strictEqual(choice(['Send it now', 'Send it later'], 'send it'), 'send it', 'a tie is not a choice');
  assert.strictEqual(normalizeAnswer({ kind: 'text' }, '  my own words '), 'my own words');
});
