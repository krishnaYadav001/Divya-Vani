// Phase 2.5 — referenceParser unit tests. Run via:
//   npm test
// (which is `tsx --test src/lib/__tests__/*.test.ts`).
//
// Coverage targets the 5 documented reference shapes plus invalid
// inputs. The Bhagavata anchored vs fallback distinction is the
// Phase 1.6/1.7 dual-format requirement that this whole phase
// exists to handle.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatReferenceLabel,
  parseReference,
  tryParseReference,
} from '../referenceParser';

test('Gita simple verse: gita_2.47', () => {
  const r = parseReference('gita_2.47');
  assert.equal(r.source, 'gita');
  assert.equal(r.chapter, 2);
  assert.equal(r.verseStart, 47);
  assert.equal(r.verseEnd, undefined);
  assert.equal(r.isFallback, false);
  assert.equal(r.canto, undefined);
  assert.equal(r.parva, undefined);
  assert.equal(r.fallbackN, undefined);
  assert.equal(r.raw, 'gita_2.47');
});

test('Gita split-verse range: gita_18.78_79', () => {
  const r = parseReference('gita_18.78_79');
  assert.equal(r.source, 'gita');
  assert.equal(r.chapter, 18);
  assert.equal(r.verseStart, 78);
  assert.equal(r.verseEnd, 79);
  assert.equal(r.isFallback, false);
  assert.equal(r.raw, 'gita_18.78_79');
});

test('Gita single-digit chapter: gita_1.1', () => {
  const r = parseReference('gita_1.1');
  assert.equal(r.source, 'gita');
  assert.equal(r.chapter, 1);
  assert.equal(r.verseStart, 1);
});

test('Mahabharata basic chunk: mb_drona_38_1', () => {
  const r = parseReference('mb_drona_38_1');
  assert.equal(r.source, 'mahabharata');
  assert.equal(r.parva, 'drona');
  assert.equal(r.chapter, 38);
  assert.equal(r.verseStart, 1);
  assert.equal(r.isFallback, false);
  assert.equal(r.canto, undefined);
  assert.equal(r.raw, 'mb_drona_38_1');
});

test('Mahabharata sub-letter chunk: mb_drona_38_1a (suffix stripped from verseStart, preserved in raw)', () => {
  const r = parseReference('mb_drona_38_1a');
  assert.equal(r.source, 'mahabharata');
  assert.equal(r.parva, 'drona');
  assert.equal(r.chapter, 38);
  assert.equal(r.verseStart, 1);
  assert.equal(r.raw, 'mb_drona_38_1a');
});

test('Mahabharata udyoga upstream-anomaly chunk: mb_udyoga_92_3b', () => {
  const r = parseReference('mb_udyoga_92_3b');
  assert.equal(r.source, 'mahabharata');
  assert.equal(r.parva, 'udyoga');
  assert.equal(r.chapter, 92);
  assert.equal(r.verseStart, 3);
});

test('Mahabharata multi-syllable parva: mb_ashvamedhika_16_2', () => {
  const r = parseReference('mb_ashvamedhika_16_2');
  assert.equal(r.parva, 'ashvamedhika');
  assert.equal(r.chapter, 16);
  assert.equal(r.verseStart, 2);
});

test('Bhagavata anchored Canto 10: bhagavata_10.29.7', () => {
  const r = parseReference('bhagavata_10.29.7');
  assert.equal(r.source, 'bhagavata');
  assert.equal(r.canto, 10);
  assert.equal(r.chapter, 29);
  assert.equal(r.verseStart, 7);
  assert.equal(r.isFallback, false);
  assert.equal(r.fallbackN, undefined);
  assert.equal(r.parva, undefined);
});

test('Bhagavata anchored Canto 11 (Uddhava-Gita): bhagavata_11.6.4', () => {
  const r = parseReference('bhagavata_11.6.4');
  assert.equal(r.canto, 11);
  assert.equal(r.chapter, 6);
  assert.equal(r.verseStart, 4);
  assert.equal(r.isFallback, false);
});

test('Bhagavata fallback Canto 10: bhagavata_10.55_3', () => {
  const r = parseReference('bhagavata_10.55_3');
  assert.equal(r.source, 'bhagavata');
  assert.equal(r.canto, 10);
  assert.equal(r.chapter, 55);
  assert.equal(r.verseStart, 3);
  assert.equal(r.isFallback, true);
  assert.equal(r.fallbackN, 3);
});

test('Bhagavata fallback Canto 11: bhagavata_11.8_1', () => {
  const r = parseReference('bhagavata_11.8_1');
  assert.equal(r.canto, 11);
  assert.equal(r.chapter, 8);
  assert.equal(r.fallbackN, 1);
  assert.equal(r.isFallback, true);
});

test('Whitespace-padded reference is trimmed and parsed', () => {
  const r = parseReference('  gita_2.47  ');
  assert.equal(r.source, 'gita');
  assert.equal(r.chapter, 2);
  assert.equal(r.verseStart, 47);
  assert.equal(r.raw, 'gita_2.47'); // trimmed
});

test('Reference with case difference is rejected (case-sensitive)', () => {
  assert.throws(() => parseReference('Gita_2.47'), /unrecognized/);
  assert.throws(() => parseReference('MB_drona_38_1'), /unrecognized/);
});

test('Reference for an unknown source throws', () => {
  assert.throws(() => parseReference('kjv_john_3.16'), /unrecognized/);
});

test('Empty string throws', () => {
  assert.throws(() => parseReference(''), /empty/);
});

test('Whitespace-only string throws', () => {
  assert.throws(() => parseReference('   '), /empty/);
});

test('Malformed Gita (missing verse) throws', () => {
  assert.throws(() => parseReference('gita_2'), /unrecognized/);
});

test('Malformed Bhagavata (missing chunk) throws', () => {
  assert.throws(() => parseReference('bhagavata_10.55'), /unrecognized/);
});

test('Malformed Mahabharata (missing chunkN) throws', () => {
  assert.throws(() => parseReference('mb_drona_38'), /unrecognized/);
});

test('Non-string input throws', () => {
  // @ts-expect-error testing runtime guard
  assert.throws(() => parseReference(null), /expected string/);
  // @ts-expect-error testing runtime guard
  assert.throws(() => parseReference(123), /expected string/);
});

// ─── tryParseReference ────────────────────────────────────────────

test('tryParseReference returns parsed object on valid input', () => {
  const r = tryParseReference('gita_2.47');
  assert.ok(r);
  assert.equal(r.source, 'gita');
});

test('tryParseReference returns null on invalid input', () => {
  assert.equal(tryParseReference('garbage'), null);
  assert.equal(tryParseReference(''), null);
});

// ─── formatReferenceLabel — 8 documented combos + edge cases ──────

test('Gita anchored Hindi', () => {
  const label = formatReferenceLabel(parseReference('gita_2.47'), 'hi');
  assert.equal(label, 'भगवद्गीता 2.47');
});

test('Gita anchored English', () => {
  const label = formatReferenceLabel(parseReference('gita_2.47'), 'en');
  assert.equal(label, 'Bhagavad Gita 2.47');
});

test('Gita split-verse Hindi', () => {
  const label = formatReferenceLabel(parseReference('gita_18.78_79'), 'hi');
  assert.equal(label, 'भगवद्गीता 18.78-79');
});

test('Gita split-verse English', () => {
  const label = formatReferenceLabel(parseReference('gita_18.78_79'), 'en');
  assert.equal(label, 'Bhagavad Gita 18.78-79');
});

test('Mahabharata Hindi (parva mapped)', () => {
  const label = formatReferenceLabel(parseReference('mb_drona_38_1'), 'hi');
  assert.equal(label, 'महाभारत द्रोण पर्व 38');
});

test('Mahabharata English (parva mapped)', () => {
  const label = formatReferenceLabel(parseReference('mb_drona_38_1'), 'en');
  assert.equal(label, 'Mahabharata Drona Parva 38');
});

test('Mahabharata sub-letter chunk drops suffix in label (mb_drona_38_1a)', () => {
  const label = formatReferenceLabel(parseReference('mb_drona_38_1a'), 'hi');
  assert.equal(label, 'महाभारत द्रोण पर्व 38'); // chunk number not user-facing
});

test('Mahabharata multi-syllable parva (ashvamedhika)', () => {
  const hi = formatReferenceLabel(parseReference('mb_ashvamedhika_16_2'), 'hi');
  assert.equal(hi, 'महाभारत अश्वमेधिक पर्व 16');
  const en = formatReferenceLabel(parseReference('mb_ashvamedhika_16_2'), 'en');
  assert.equal(en, 'Mahabharata Ashvamedhika Parva 16');
});

test('Mahabharata unknown parva falls back to capitalized slug (no crash)', () => {
  const fake = parseReference('mb_anushasana_4_2');
  // anushasana isn't in the Phase 1.5 corpus and isn't in the maps.
  assert.equal(formatReferenceLabel(fake, 'hi'), 'महाभारत Anushasana पर्व 4');
  assert.equal(formatReferenceLabel(fake, 'en'), 'Mahabharata Anushasana Parva 4');
});

test('Bhagavata anchored Hindi', () => {
  const label = formatReferenceLabel(parseReference('bhagavata_10.29.7'), 'hi');
  assert.equal(label, 'श्रीमद्भागवत 10.29.7');
});

test('Bhagavata anchored English', () => {
  const label = formatReferenceLabel(parseReference('bhagavata_10.29.7'), 'en');
  assert.equal(label, 'Srimad Bhagavatam 10.29.7');
});

test('Bhagavata anchored Canto 11 (Uddhava-Gita) English', () => {
  const label = formatReferenceLabel(parseReference('bhagavata_11.6.4'), 'en');
  assert.equal(label, 'Srimad Bhagavatam 11.6.4');
});

test('Bhagavata fallback Hindi', () => {
  const label = formatReferenceLabel(parseReference('bhagavata_10.55_3'), 'hi');
  assert.equal(label, 'श्रीमद्भागवत 10.55 (अंश 3)');
});

test('Bhagavata fallback English', () => {
  const label = formatReferenceLabel(parseReference('bhagavata_10.55_3'), 'en');
  assert.equal(label, 'Srimad Bhagavatam 10.55 (passage 3)');
});

test('Bhagavata fallback Canto 11 Hindi', () => {
  const label = formatReferenceLabel(parseReference('bhagavata_11.8_1'), 'hi');
  assert.equal(label, 'श्रीमद्भागवत 11.8 (अंश 1)');
});
