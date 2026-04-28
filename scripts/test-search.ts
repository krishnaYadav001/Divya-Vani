import { searchVerses } from '../src/lib/verses';

const QUERIES: string[] = [
  "I'm so angry I want to hurt someone",
  "What if I fail at this and everyone sees me weak?",
  "I keep doubting myself, going back and forth on every decision",
  "I feel completely alone, like nobody understands me",
  "I lost someone I loved and the grief will not leave me",
  "Someone I trusted deeply betrayed me",
  "I feel jealous when my friend succeeds",
  "I have to make a decision but I am paralyzed by fear",
  "My family is fighting and I am caught in the middle",
  "I got what I wanted but now I feel guilty about it",
];

function truncate(s: string, n: number): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…';
}

async function main() {
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    console.log(`\n=========== Query ${i + 1}/${QUERIES.length} ===========`);
    console.log(`Q: "${q}"`);
    const hits = await searchVerses(q, 3);
    if (hits.length === 0) {
      console.log('  (no results)');
      continue;
    }
    for (let j = 0; j < hits.length; j++) {
      const h = hits[j];
      console.log(`\n  ${j + 1}. [${h.reference}]  similarity=${h.similarity.toFixed(4)}`);
      console.log(`     EN: ${truncate(h.english, 220)}`);
      console.log(`     HI: ${truncate(h.hindi, 220)}`);
    }
  }
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
