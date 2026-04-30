// Phase 1.5 corpus driver — runs the parser across all 10 needed volumes,
// filters to the curated 23-range list, emits a single data/mahabharata.json.
//
// Skips Vol 09 (Santi Part II — sections 174-301, none in our curation) and
// Vol 11 (Anushasana — not in curation).
//
// Usage:
//   tsx scripts/run-mahabharata-corpus.ts
//   tsx scripts/run-mahabharata-corpus.ts --out=data/mahabharata.json

import fs from "node:fs";
import path from "node:path";
import { parseVolume, chunkProse, type Chunk } from "./parse-mahabharata";

// The 23-range curation, mapped to source volumes.
// Sections is an inclusive list of section numbers.
type Curation = {
  vol: string;        // "01"..."12"
  parva: string;      // 'adi', 'sabha', etc.
  sections: number[];
  defaultParva?: string; // for single-parva volumes where the title-page parva isn't in the body
};

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

// 23-range curation. Order matches plan file's Task 3 table.
const CURATION: Curation[] = [
  { vol: "01", parva: "adi",          sections: range(218, 225) },
  { vol: "02", parva: "sabha",        sections: range(30, 42) },
  { vol: "02", parva: "sabha",        sections: range(60, 68) },
  // Vana 12-22 spans Vol 02 (Sabha + Vana Part I) and Vol 03 (Vana continued).
  // Run on both volumes; dedupe by reference at merge time.
  { vol: "02", parva: "vana",         sections: range(12, 22) },
  // (Vol 03 starts at Vana CXIV/114; sections 12-22 are entirely in Vol 02.)
  { vol: "04", parva: "udyoga",       sections: range(71, 148) },
  { vol: "05", parva: "bhishma",      sections: range(1, 24),    defaultParva: "bhishma" },
  { vol: "05", parva: "bhishma",      sections: range(102, 122), defaultParva: "bhishma" },
  { vol: "06", parva: "drona",        sections: range(32, 46),   defaultParva: "drona" },
  { vol: "06", parva: "drona",        sections: range(70, 72),   defaultParva: "drona" },
  { vol: "06", parva: "drona",        sections: range(144, 150), defaultParva: "drona" },
  { vol: "06", parva: "drona",        sections: range(153, 165), defaultParva: "drona" },
  { vol: "06", parva: "drona",        sections: range(190, 194), defaultParva: "drona" },
  { vol: "07", parva: "karna",        sections: range(31, 33) },
  { vol: "07", parva: "karna",        sections: range(45, 72) },
  { vol: "07", parva: "karna",        sections: range(80, 84) },
  { vol: "07", parva: "karna",        sections: range(90, 91) },
  { vol: "07", parva: "shalya",       sections: range(55, 65) },
  { vol: "07", parva: "sauptika",     sections: range(13, 18) },
  { vol: "07", parva: "stri",         sections: range(24, 25) },
  { vol: "08", parva: "shanti",       sections: range(46, 55),   defaultParva: "shanti" },
  { vol: "10", parva: "shanti",       sections: range(332, 339) },
  // Vol 12 has 5 parvas back-to-back (Ashvamedhika → Asramavasika → Mausala
  // → Mahaprasthanika → Svargarohana). Aswamedha + Mausala lack standalone
  // headers — only running page headers. Set defaultParva='ashvamedhika' so
  // sections starting at I are attributed correctly; Asramavasika header
  // (line 9393) and Mausala header ("I1AUSALA") and Mahaprasthanika (line
  // 13623) all transition currentParva mid-stream via PARVA_NAME_PATTERNS.
  { vol: "12", parva: "ashvamedhika", sections: range(16, 50), defaultParva: "ashvamedhika" },
  { vol: "12", parva: "mausala",      sections: range(1, 9),   defaultParva: "ashvamedhika" },
];

const GANGULI_DIR = "data/mahabharata-raw/ganguli";

function volumePath(vol: string): string {
  return path.join(GANGULI_DIR, `roy-vol${vol}.txt`);
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = args.find(a => a.startsWith("--out="))?.split("=")[1];
  const outPath = outArg || "data/mahabharata.json";

  // Cache parseVolume results — same volume parsed once, reused across multiple
  // curation entries.
  const volumeCache = new Map<string, ReturnType<typeof parseVolume>>();
  const parseOnce = (vol: string, defaultParva: string | null = null) => {
    const key = `${vol}:${defaultParva ?? ""}`;
    if (!volumeCache.has(key)) {
      const fp = volumePath(vol);
      console.error(`\n[corpus] Parsing ${fp}${defaultParva ? ` (default-parva=${defaultParva})` : ""}`);
      volumeCache.set(key, parseVolume(fp, defaultParva));
    }
    return volumeCache.get(key)!;
  };

  type CurationStat = {
    vol: string;
    parva: string;
    rangeLabel: string;
    sectionsRequested: number;
    sectionsFound: number;
    chunksProduced: number;
    chunkRefs: string[];
  };
  const stats: CurationStat[] = [];
  const allChunks: Chunk[] = [];
  const seenRefs = new Set<string>();

  for (const cur of CURATION) {
    const sectionsAll = parseOnce(cur.vol, cur.defaultParva ?? null);
    const sectionsForRange = sectionsAll.filter(
      s => s.parva === cur.parva && cur.sections.includes(s.section),
    );
    const rangeLabel = `${cur.sections[0]}-${cur.sections[cur.sections.length - 1]}`;
    const stat: CurationStat = {
      vol: cur.vol,
      parva: cur.parva,
      rangeLabel,
      sectionsRequested: cur.sections.length,
      sectionsFound: sectionsForRange.length,
      chunksProduced: 0,
      chunkRefs: [],
    };

    for (const sec of sectionsForRange) {
      const chunks = chunkProse(sec, 300);
      for (const c of chunks) {
        if (seenRefs.has(c.reference)) continue;
        seenRefs.add(c.reference);
        allChunks.push(c);
        stat.chunkRefs.push(c.reference);
      }
    }
    stat.chunksProduced = stat.chunkRefs.length;
    stats.push(stat);
  }

  // Write output
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(allChunks, null, 2), "utf8");

  // ====== Report ======
  console.log("\n=== Phase 1.5 corpus parse report ===");
  console.log(`Output: ${outPath}`);
  console.log(`Total chunks: ${allChunks.length}`);
  console.log();

  // Per-curation breakdown
  console.log("Per-curation-range chunk counts:");
  console.log("vol  parva           range          req  found  chunks");
  console.log("---  --------------  -------------  ---  -----  ------");
  for (const s of stats) {
    const flag = s.chunksProduced === 0 ? " <-- ZERO!" : "";
    console.log(
      `${s.vol.padEnd(3)} ${s.parva.padEnd(14)} ${s.rangeLabel.padEnd(13)} ${String(s.sectionsRequested).padStart(3)}  ${String(s.sectionsFound).padStart(5)}  ${String(s.chunksProduced).padStart(6)}${flag}`,
    );
  }

  // Per-parva totals
  const byParva: Record<string, number> = {};
  for (const c of allChunks) {
    byParva[c.parva] = (byParva[c.parva] || 0) + 1;
  }
  console.log("\nPer-parva chunk distribution:");
  for (const [parva, n] of Object.entries(byParva).sort((a, b) => b[1] - a[1])) {
    const pct = ((100 * n) / allChunks.length).toFixed(1);
    console.log(`  ${parva.padEnd(14)} ${String(n).padStart(5)} chunks (${pct}%)`);
  }

  // Volumes with zero chunks
  const zeroVols = stats.filter(s => s.chunksProduced === 0);
  if (zeroVols.length > 0) {
    console.log("\n[!] Curation ranges that produced 0 chunks:");
    for (const z of zeroVols) {
      console.log(`    Vol ${z.vol} / ${z.parva} ${z.rangeLabel}`);
    }
  }

  // Warning summary
  const warningCounts: Record<string, number> = {};
  for (const c of allChunks) {
    for (const w of c.warnings) warningCounts[w] = (warningCounts[w] || 0) + 1;
  }
  if (Object.keys(warningCounts).length > 0) {
    console.log("\nWarning counts (informational):");
    for (const [w, n] of Object.entries(warningCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${w.padEnd(30)} ${n}`);
    }
  }

  // Word-count distribution
  const wcs = allChunks.map(c => c.wordCount).sort((a, b) => a - b);
  if (wcs.length > 0) {
    const median = wcs[Math.floor(wcs.length / 2)];
    const min = wcs[0];
    const max = wcs[wcs.length - 1];
    const avg = Math.round(wcs.reduce((a, b) => a + b, 0) / wcs.length);
    console.log(`\nChunk word-count: min=${min} median=${median} avg=${avg} max=${max}`);
  }

  // 3 random sample chunks: 1 from Udyoga (verse-aligned-style mid-dialogue),
  // 1 from Drona (prose-only battle narrative), 1 from Anugita (Ashvamedhika 16-50).
  const pickRandom = (filter: (c: Chunk) => boolean): Chunk | null => {
    const candidates = allChunks.filter(filter);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const samples = {
    udyoga: pickRandom(c => c.parva === "udyoga" && c.wordCount >= 200 && c.wordCount <= 320),
    drona:  pickRandom(c => c.parva === "drona"  && c.wordCount >= 200 && c.wordCount <= 320),
    anugita: pickRandom(c => c.parva === "ashvamedhika" && c.wordCount >= 200 && c.wordCount <= 320),
  };

  console.log("\n=== 3 RANDOM SAMPLE CHUNKS for advisor review ===\n");
  for (const [label, chunk] of Object.entries(samples)) {
    console.log(`--- ${label.toUpperCase()} sample ---`);
    if (!chunk) {
      console.log("(no chunk found matching criteria)");
      continue;
    }
    console.log(`Reference: ${chunk.reference}`);
    console.log(`Words: ${chunk.wordCount}  Warnings: ${chunk.warnings.join(", ") || "(none)"}`);
    console.log(`Text:\n${chunk.english}\n`);
  }
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
