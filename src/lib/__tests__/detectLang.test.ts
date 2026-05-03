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

test('Empty string defaults to hi', () => {
  assert.equal(detectLang(''), 'hi');
});

test('Whitespace-only string defaults to hi', () => {
  assert.equal(detectLang('   \n\t '), 'hi');
});

test('Single Devanagari character → hi', () => {
  assert.equal(detectLang('क'), 'hi');
});

test('Sanskrit-style Devanagari → hi', () => {
  assert.equal(detectLang('कर्मण्येवाधिकारस्ते'), 'hi');
});
