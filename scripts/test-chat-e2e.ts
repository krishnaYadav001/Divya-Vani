const PROMPTS: string[] = [
  "मैं डर रहा हूँ अपनी नौकरी के बारे में",
  "I feel I have lost my way",
  "मेरे पिता से झगड़ा हुआ है",
];

const BASE = process.env.CHAT_BASE_URL ?? "http://localhost:3000";

function shorten(s: string | undefined, n: number): string {
  const oneLine = (s ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + "…";
}

type ApiVerse = {
  reference: string;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
};

type ApiResponse = {
  reply?: string;
  paywall?: boolean;
  verses?: ApiVerse[];
};

async function main() {
  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    console.log(`\n=========================================================`);
    console.log(`#${i + 1}  USER: ${prompt}`);
    console.log(`=========================================================`);

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
    } catch (e) {
      console.error(`  network error: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (!res.ok) {
      console.error(`  HTTP ${res.status}: ${await res.text()}`);
      continue;
    }

    const data = (await res.json()) as ApiResponse;
    console.log(`\nKRISHNA REPLY:\n${data.reply ?? "(no reply)"}`);

    if (Array.isArray(data.verses) && data.verses.length > 0) {
      console.log(`\nVERSES RETURNED (${data.verses.length}):`);
      for (const v of data.verses) {
        console.log(`  • [${v.reference}]`);
        console.log(`      Sanskrit: ${shorten(v.sanskrit, 90)}`);
        console.log(`      Hindi:    ${shorten(v.hindi, 90)}`);
        console.log(`      English:  ${shorten(v.english, 90)}`);
      }
    } else {
      console.log("\n(no verses returned)");
    }

    if (data.paywall) console.log("\n⚠ paywall=true");
  }
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
