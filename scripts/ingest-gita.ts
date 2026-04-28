import fs from 'node:fs';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const GITA_PATH = 'data/gita.json';
const SOURCE_NAME = 'gita';
// gemini-embedding-001 (GA) replaced text-embedding-004. Native dim is 3072;
// we truncate to 768 via outputDimensionality to match the verses.embedding
// vector(768) column. Matryoshka design keeps truncated vectors useful.
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;
const DRY_RUN_LIMIT = 5;
const PROGRESS_EVERY = 50;

type Verse = {
  reference: string;
  chapter: number;
  verse_number: number;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
  themes: string[];
};

async function main() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing in .env.local');
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing in .env.local');
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing in .env.local');

  const verses: Verse[] = JSON.parse(fs.readFileSync(GITA_PATH, 'utf8'));
  const work = DRY_RUN ? verses.slice(0, DRY_RUN_LIMIT) : verses;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const embedModel = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const tag = DRY_RUN ? '[DRY-RUN] ' : '';
  console.log(`${tag}Ingesting ${work.length} verse(s) using ${EMBED_MODEL}...`);
  if (DRY_RUN) console.log('[DRY-RUN] No Supabase writes will be performed.\n');

  let okCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < work.length; i++) {
    const v = work[i];
    // Embedding text: english + hindi. Themes will be appended in a later phase
    // once we have them. Sanskrit is intentionally excluded — the multilingual
    // embedding model is weaker on Devanagari Sanskrit than on Hindi/English,
    // and including it dilutes the semantic signal for retrieval.
    const text = `${v.english}\n\n${v.hindi}`.trim();

    try {
      // SDK v0.24 types don't include outputDimensionality on EmbedContentRequest,
      // but the v1beta API accepts it. Cast bypasses the stale type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await embedModel.embedContent({
        content: { role: 'user', parts: [{ text }] },
        taskType: TaskType.RETRIEVAL_DOCUMENT,
        outputDimensionality: EMBED_DIM,
      } as any);
      const embedding = r.embedding.values;
      if (embedding.length !== EMBED_DIM) {
        throw new Error(`Embedding dim ${embedding.length} != expected ${EMBED_DIM}`);
      }

      if (DRY_RUN) {
        const preview = embedding.slice(0, 3).map((n) => n.toFixed(4)).join(', ');
        console.log(
          `  [${v.reference}] embed dim=${embedding.length}  first3=[${preview}]  text_len=${text.length}`,
        );
      } else {
        const { error } = await supabase
          .from('verses')
          .upsert(
            {
              source: SOURCE_NAME,
              reference: v.reference,
              chapter: v.chapter,
              verse_number: v.verse_number,
              sanskrit: v.sanskrit,
              transliteration: v.transliteration,
              hindi: v.hindi,
              english: v.english,
              themes: v.themes,
              embedding,
            },
            { onConflict: 'reference' },
          );
        if (error) throw new Error(`Supabase upsert: ${error.message}`);
      }
      okCount++;
    } catch (e) {
      failCount++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [${v.reference}] FAILED: ${msg}`);
    }

    if (!DRY_RUN && (i + 1) % PROGRESS_EVERY === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Progress: ${i + 1}/${work.length}  (${elapsed}s elapsed, ok=${okCount} fail=${failCount})`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${tag}Done. ok=${okCount}  fail=${failCount}  time=${totalTime}s`);
  if (DRY_RUN) {
    console.log('No DB writes performed. Re-run without --dry-run to ingest for real.');
  }

  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
