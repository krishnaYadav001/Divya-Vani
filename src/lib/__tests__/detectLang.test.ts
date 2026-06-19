import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectLang } from '../detectLang';

test('Pure Hindi → hi', () => {
  assert.equal(detectLang('मैं अकेला हूँ'), 'hi');
});

test('Pure English → en', () => {
  assert.equal(detectLang('I miss someone deeply'), 'en');
});

test('Hello Krishna (English with romanized name) → en', () => {
  assert.equal(detectLang('Hello Krishna'), 'en');
});

test('Tell me about Yashoda → en', () => {
  assert.equal(detectLang('Tell me about Yashoda'), 'en');
});

test('Hindi with one English noun crossing 30% threshold (mostly Hindi) → hi', () => {
  // 4 devanagari chars / 8 stripped chars = 50%
  assert.equal(detectLang('मेरा name'), 'hi');
});

test('Mostly English with one Hindi word below 30% → en', () => {
  // "okay so मन" → 2 devanagari / 9 stripped = ~22% → en
  assert.equal(detectLang('okay so मन'), 'en');
});

// Founder decision 2026-06-19 — when the language is unknown/ambiguous,
// default to English, not Hindi. An empty message carries no signal.
test('Empty string with no prior language defaults to en', () => {
  assert.equal(detectLang(''), 'en');
});

test('Whitespace-only string with no prior language defaults to en', () => {
  assert.equal(detectLang('   \n\t '), 'en');
});

// Established-conversation continuity still wins for a no-signal message.
test('Empty string inherits priorLang=hi', () => {
  assert.equal(detectLang('', 'hi'), 'hi');
});

test('Single Devanagari character → hi', () => {
  assert.equal(detectLang('क'), 'hi');
});

test('Sanskrit-style Devanagari → hi', () => {
  assert.equal(detectLang('कर्मण्येवाधिकारस्ते'), 'hi');
});

// Phase 5.5 sticky priorLang regression coverage.
test('Sticky: 1-word "Krishna" with priorLang=hi → hi', () => {
  assert.equal(detectLang('Krishna', 'hi'), 'hi');
});

test('Sticky: 1-word "ok" with priorLang=hi → hi', () => {
  assert.equal(detectLang('ok', 'hi'), 'hi');
});

test('Sticky: 1-word "yes" with priorLang=hi → hi', () => {
  assert.equal(detectLang('yes', 'hi'), 'hi');
});

test('Sticky: 1-word "Krishna" with priorLang=en → en', () => {
  assert.equal(detectLang('Krishna', 'en'), 'en');
});

test('Sticky: 1-word "Krishna" with no priorLang → en', () => {
  assert.equal(detectLang('Krishna'), 'en');
});

// Phase 6.X Hinglish layer — Latin-script Hindi → 'hi'.
test('Hinglish: "main bahut khush hu" → hi', () => {
  assert.equal(detectLang('main bahut khush hu'), 'hi');
});

test('Hinglish: "aaj kaam kiya" → hi', () => {
  assert.equal(detectLang('aaj kaam kiya'), 'hi');
});

test('Hinglish: "kya karu samajh nahi aata" → hi', () => {
  assert.equal(detectLang('kya karu samajh nahi aata'), 'hi');
});

test('Hinglish: founder case — long mixed-case sentence → hi', () => {
  assert.equal(
    detectLang(
      'Aaj ban bahut khush hai, kyunki aaj maine bahut mehnat ka lagan se apna kaam kiya hai',
    ),
    'hi',
  );
});

test('Hinglish: "Krishna ji aap kaise hain" → hi', () => {
  assert.equal(detectLang('Krishna ji aap kaise hain'), 'hi');
});

test('Hinglish: "Bhai kya kar rahe ho" → hi', () => {
  assert.equal(detectLang('Bhai kya kar rahe ho'), 'hi');
});

test('Hinglish: "main udaas hu kyunki kuch samajh nahi aa raha" → hi', () => {
  assert.equal(
    detectLang('main udaas hu kyunki kuch samajh nahi aa raha'),
    'hi',
  );
});

// Phase 6.X negative cases — pure English must remain 'en'.
test('English: "I am very happy today" → en', () => {
  assert.equal(detectLang('I am very happy today'), 'en');
});

test('English: "Bhagavad Gita is a beautiful book" → en (proper nouns do not trip vocab)', () => {
  assert.equal(detectLang('Bhagavad Gita is a beautiful book'), 'en');
});

test('English: "What is the meaning of life" → en', () => {
  assert.equal(detectLang('What is the meaning of life'), 'en');
});
