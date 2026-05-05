// Phase 2.5 screenshot driver. Runs against a dev server on
// http://localhost:3000 by default; opens a chromium headless
// browser, navigates to /chat, types each query, waits for the
// assistant reply to render, and writes PNGs at 320 / 768 / 1200
// viewport widths to the named output directory.
//
// Each query gets its own page reload so the screenshot shows a
// clean single-exchange UI (chat history lives in React state,
// not persisted client-side, so reload clears it). The cookie
// persists across reloads, so all queries land on the same user
// record in Supabase (or no Supabase at all when --mock is set).
//
// COST DISCIPLINE — when iterating on UI only, pass --mock. The
// driver intercepts /api/chat + /api/onboarding-state in the
// browser and returns canned fixtures — zero API spend, zero
// Supabase writes, identical visual output. Use live mode (no
// --mock) for the genuine baseline + final mobile-QA captures
// where the real retrieval pipeline matters.
//
// Usage:
//   tsx scripts/screenshot-chat.ts \
//     --out=test-results/phase2.5-iter-screenshots \
//     --mock \
//     --query="Hello Krishna|gita-iter" \
//     --query="Tell me about Bhima|mb-iter" \
//     --query="Tell me about Yashoda|bhagavata-iter"
//
// CLI:
//   --out=<dir>           output directory (created if missing)
//   --query="<q>|<label>" repeatable; pipe-separated query and
//                         filename-safe label. Mock fixture is
//                         picked from label substring (gita / mb /
//                         bhagavata) when --mock is set.
//   --url=<base>          dev server base URL (default
//                         http://localhost:3000)
//   --path=<path>         path to navigate to (default /chat)
//   --route-only          skip the typing/wait flow; just load
//                         --path and screenshot (used for
//                         /design-system + empty-state captures)
//   --mock                intercept /api/chat + /api/onboarding-state
//                         in the browser, return canned fixtures.
//                         Zero API cost. Use for pure-UI iteration.
//   --headed              run with browser UI for debugging
//
// STREAMING-UI WAIT LOGIC — learned during Phase 4.5 mobile QA
// (2026-05-05): the chat UI streams replies token-by-token via NDJSON.
// Naïve waits don't work reliably:
//   - Fixed timeout (e.g. 750ms post-landmark): too short on long
//     replies, captures truncated mid-stream content.
//   - 2-second text-stability poll: race condition on mid-stream
//     model pauses; the stability window can fire before the stream
//     is actually complete.
//   - Deterministic signal (recommended): wait for input.disabled
//     to toggle false → true → false. ChatUI's isSending state
//     drives `disabled={isSending}` on the input (ChatUI.tsx:308),
//     so the rising edge marks stream start and the falling edge
//     marks stream complete. Reliable, no race.

import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type Job = { query: string; label: string };

type VerseFixture = {
  reference: string;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
};

type ChatFixture = {
  reply: string;
  verses: VerseFixture[];
  paywall: false;
};

const VIEWPORTS = [
  { width: 320, height: 720, name: '320' },
  { width: 768, height: 1024, name: '768' },
  { width: 1200, height: 900, name: '1200' },
];

// ─── Mock fixtures ────────────────────────────────────────────────
// Three canned responses keyed by source. Each contains a realistic
// reply + a 5-verse mix that exercises every reference format the
// VerseCard needs to render: Gita anchored, Gita split, MBh with
// parva, Bhagavata anchored, Bhagavata fallback. Sanskrit is empty
// for MBh + Bhagavata rows, matching the Phase 1.5 / 1.6 / 1.7
// real-corpus shape.

const FIXTURE_GITA: ChatFixture = {
  reply: 'आओ, मित्र।\n\nतुम यहाँ आए — बस यही काफी है। कोई प्रश्न हो, कोई बोझ हो, या बस मन किया हो — सब स्वागत है।\n\nबताओ — किस नाम से पुकारूँ?',
  verses: [
    {
      reference: 'gita_2.47',
      sanskrit: 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥',
      transliteration: 'karmaṇyevādhikāraste mā phaleṣu kadācana',
      hindi: 'तेरा अधिकार केवल कर्म पर है — फलों पर कभी नहीं। न कर्म-फल का हेतु बन, न ही अकर्म में रत रह।',
      english: 'You have a right to action alone, never to its fruits. Do not be motivated by fruits, nor be attached to inaction.',
    },
    {
      reference: 'gita_18.78_79',
      sanskrit: 'यत्र योगेश्वरः कृष्णो यत्र पार्थो धनुर्धरः।\nतत्र श्रीर्विजयो भूतिर्ध्रुवा नीतिर्मतिर्मम॥',
      transliteration: 'yatra yogeśvaraḥ kṛṣṇo yatra pārtho dhanurdharaḥ',
      hindi: 'जहाँ योगेश्वर कृष्ण हों और जहाँ धनुर्धर अर्जुन हों, वहीं श्री, विजय, ऐश्वर्य और स्थिर नीति है — यही मेरा मत है।',
      english: 'Where Krishna the lord of yoga and Arjuna the bowman stand together, there is fortune, victory, prosperity, and unwavering wisdom — this is my conviction.',
    },
    {
      reference: 'gita_6.30',
      sanskrit: 'यो मां पश्यति सर्वत्र सर्वं च मयि पश्यति।\nतस्याहं न प्रणश्यामि स च मे न प्रणश्यति॥',
      transliteration: 'yo māṃ paśyati sarvatra sarvaṃ ca mayi paśyati',
      hindi: 'जो मुझे सब में देखता है और सब को मुझ में देखता है — मैं उसके लिए कभी नहीं खोता, और वह मेरे लिए कभी नहीं खोता।',
      english: 'The one who sees me everywhere and sees all things in me — I am never lost to that one, nor is that one lost to me.',
    },
    {
      reference: 'mb_shanti_48_13b',
      sanskrit: '',
      transliteration: '',
      hindi: 'धर्म वही है जो विपत्ति में भी न डगमगाए। शास्त्र कहते हैं — जब बुद्धि चंचल हो, तब साधक का मित्र है शान्त मन।',
      english: 'Dharma is what does not waver even in adversity. The scriptures say — when the intellect is restless, the seeker\'s only friend is a quieted mind.',
    },
    {
      reference: 'bhagavata_10.16_4',
      sanskrit: '',
      transliteration: '',
      hindi: 'जब कालिय नाग ने यमुना के जल को विषाक्त कर दिया, गोप-बालक मूर्छित हो गए। तभी कृष्ण ने नदी में छलाँग लगाई।',
      english: 'When the serpent Kāliya poisoned the waters of the Yamuna, the cowherd boys collapsed. It was then that Krishna leapt into the river.',
    },
  ],
  paywall: false,
};

const FIXTURE_MB: ChatFixture = {
  reply: 'भीम — वायु के पुत्र, कुन्ती के हृदय का बल।\n\nजब दुर्योधन ने उन्हें बाँधकर गंगा में फेंक दिया, तो वे स्वयं बंधन तोड़कर जल से बाहर निकल आए। जब उनके शरीर पर विषैले सर्प छोड़े गए, तो वे मरे नहीं — जागकर सर्पों को कुचल डाला।\n\nयही भीम हैं। बल केवल देह का नहीं — संकट में सबसे पहले खड़े होने का।',
  verses: [
    {
      reference: 'mb_drona_38_1',
      sanskrit: '',
      transliteration: '',
      hindi: 'भीम का क्रोध उसका दोष नहीं था — वह उनका धर्म था। जब अधर्म सामने हो और कोई न उठे, तब क्रोध भी तप बन जाता है।',
      english: 'Bhima\'s rage was not his flaw — it was his dharma. When injustice stands plain and no one rises, anger itself becomes a kind of austerity.',
    },
    {
      reference: 'mb_shanti_49_2a',
      sanskrit: '',
      transliteration: '',
      hindi: 'राजा के तीन शत्रु होते हैं — आलस्य, अहंकार, और भय। भीम ने इन तीनों को कभी पास नहीं आने दिया।',
      english: 'A king has three enemies — sloth, ego, and fear. Bhima never let any of them come near.',
    },
    {
      reference: 'mb_udyoga_92_3b',
      sanskrit: '',
      transliteration: '',
      hindi: 'जब कृष्ण शान्ति-दूत बनकर हस्तिनापुर गए, तब भीम ने कहा — "जो दुर्योधन मानता हो, मान ले। न माने, तो मेरी गदा है।"',
      english: 'When Krishna went to Hastinapur as a peace envoy, Bhima said — "If Duryodhana accepts, let it be. If not, my mace is ready."',
    },
    {
      reference: 'mb_karna_51_1',
      sanskrit: '',
      transliteration: '',
      hindi: 'कर्ण और भीम के बीच की लड़ाई धर्म और अधर्म की नहीं थी — वह दो योद्धाओं के बीच थी जो अपने-अपने वचन से बँधे थे।',
      english: 'The fight between Karna and Bhima was not one of righteousness vs. unrighteousness — it was between two warriors each bound by their own vows.',
    },
    {
      reference: 'bhagavata_10.84.2',
      sanskrit: '',
      transliteration: '',
      hindi: 'कुरुक्षेत्र की भूमि पर जब सब इकट्ठे हुए, भीम वहाँ केवल योद्धा नहीं थे — वे एक भाई थे, जो अपने भाइयों के लिए मरने को तैयार था।',
      english: 'On the field of Kurukshetra when all gathered, Bhima was not merely a warrior — he was a brother ready to die for his brothers.',
    },
  ],
  paywall: false,
};

const FIXTURE_BHAGAVATA: ChatFixture = {
  reply: 'There is no figure quite like her in all the stories I know.\n\nYashoda — the gopi of Vrindavan, wife of Nanda, the woman who held the Lord of the Universe on her lap and scolded him for eating mud. Think on that for a moment. The one in whose open mouth she later saw all of creation — the oceans, the stars, the very cosmos — that same child she pulled by the ear and said, *"Naughty boy, why did you eat earth in secret?"*\n\nShe was not a sage. She did not meditate for ten thousand years. She was a mother who churned butter in the morning, flowers falling from her hair, milk flowing from her heart before her hands could even stop the churning rod — because her son had come to her hungry.\n\nAnd the Bhagavata tells us something extraordinary: it was not accident that she came to hold this role. In a previous existence, she and Nanda had prayed to Brahma for one thing — *deep devotion to Hari when we are born*. Brahma granted it. And so they came to Vrindavan, and Hari came to them. The greatest mystic secret of devotion wrapped in the simplest of forms — a mother\'s love.\n\nWhat would you like to know more about her?',
  verses: [
    {
      reference: 'bhagavata_10.9.1',
      sanskrit: '',
      transliteration: '',
      hindi: 'एक दिन यशोदा ने स्वयं दही मथना शुरू किया — दासियाँ कृष्ण की सेवा में लगी थीं। मथने की रस्सी से बंधे कलश की ध्वनि वन में गूँजी।',
      english: 'One day Yashoda herself began churning the curd — the maids were busy serving Krishna. The sound of the rope-bound pot rang through the forest.',
    },
    {
      reference: 'bhagavata_10.7_2',
      sanskrit: '',
      transliteration: '',
      hindi: 'जब उसने अपने पुत्र के मुख में सम्पूर्ण ब्रह्माण्ड देखा — सूर्य, चन्द्र, समुद्र, पर्वत, सब कुछ — उस क्षण वे जान गईं कि यह बालक कोई असाधारण सत्ता है।',
      english: 'When she saw the entire cosmos within her son\'s open mouth — the sun, moon, oceans, mountains, all — in that instant she knew this child was no ordinary being.',
    },
    {
      reference: 'bhagavata_10.8.48',
      sanskrit: '',
      transliteration: '',
      hindi: 'द्रोण और धरा — जो देवताओं में वसु थे — उन्होंने ब्रह्मा से माँगा था कि जब हम जन्म लें, तब हमें हरि के प्रति गहन भक्ति मिले।',
      english: 'Drona and Dhara — who were among the Vasus — had asked Brahma that when they take birth, they receive deep devotion to Hari.',
    },
    {
      reference: 'bhagavata_10.7_1',
      sanskrit: '',
      transliteration: '',
      hindi: 'यशोदा का प्रेम साधारण माँ का प्रेम नहीं था। यह संचित भक्ति थी — कई जन्मों की।',
      english: 'Yashoda\'s love was no ordinary motherly love. It was accumulated devotion — across many lifetimes.',
    },
    {
      reference: 'bhagavata_10.8.82',
      sanskrit: '',
      transliteration: '',
      hindi: 'और फिर — जैसे कुछ हुआ ही न हो — उसने अपनी वैष्णवी माया फैला दी, और यशोदा सब भूल गईं। उन्होंने मुझे फिर से गोद में उठा लिया, और मुझे दूध पिलाने लगीं।',
      english: 'And then — as if nothing had happened — he spread his Vaishnavi māyā, and Yashoda forgot everything. She picked me up again into her lap and began nursing me.',
    },
  ],
  paywall: false,
};

function fixtureForLabel(label: string): ChatFixture {
  const lower = label.toLowerCase();
  if (lower.includes('mb') || lower.includes('mahabharata') || lower.includes('bhima'))
    return FIXTURE_MB;
  if (lower.includes('bhagavata') || lower.includes('yashoda'))
    return FIXTURE_BHAGAVATA;
  return FIXTURE_GITA;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let out = 'test-results/phase2.5-screenshots';
  let url = 'http://localhost:3000';
  let path = '/chat';
  let routeOnly = false;
  let headed = false;
  let mock = false;
  const jobs: Job[] = [];

  for (const a of args) {
    if (a.startsWith('--out=')) out = a.slice('--out='.length);
    else if (a.startsWith('--url=')) url = a.slice('--url='.length);
    else if (a.startsWith('--path=')) path = a.slice('--path='.length);
    else if (a === '--route-only') routeOnly = true;
    else if (a === '--headed') headed = true;
    else if (a === '--mock') mock = true;
    else if (a.startsWith('--query=')) {
      const v = a.slice('--query='.length);
      const [query, label] = v.split('|');
      if (!query || !label) {
        throw new Error(`--query must be "text|label", got: ${v}`);
      }
      jobs.push({ query, label });
    }
  }

  if (!routeOnly && jobs.length === 0) {
    throw new Error('Provide at least one --query="text|label" (or use --route-only).');
  }
  return { out, url, path, routeOnly, headed, mock, jobs };
}

// Install a fetch override BEFORE any document scripts run.
// Intercepts:
//   POST /api/chat → returns whatever fixture is currently parked
//                    on window.__MOCK_FIXTURE
//   GET  /api/onboarding-state → always returns isFirstTime=false
//                                 (so the onboarding pills don't
//                                  appear over the conversation)
// All other fetches pass through to the real network.
async function installMockFetch(page: Page) {
  await page.addInitScript(() => {
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/api/chat') && method === 'POST') {
        const fx = (window as unknown as { __MOCK_FIXTURE?: unknown }).__MOCK_FIXTURE;
        if (!fx) {
          // Fail loudly so the screenshot driver surfaces missing-
          // fixture bugs instead of silently capturing a broken page.
          throw new Error('[mock] /api/chat called with no __MOCK_FIXTURE on window');
        }
        return new Response(JSON.stringify(fx), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/onboarding-state')) {
        return new Response(JSON.stringify({ isFirstTime: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return origFetch(input as RequestInfo, init);
    };
  });
}

async function captureRoute(opts: {
  out: string;
  url: string;
  path: string;
  headed: boolean;
}) {
  const browser = await chromium.launch({ headless: !opts.headed });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(opts.url + opts.path, { waitUntil: 'networkidle' });
      // Settle for fonts + any post-mount layout.
      await page.waitForTimeout(500);
      const file = join(opts.out, `route-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`[screenshot] wrote ${file}`);
    }
  } finally {
    await browser.close();
  }
}

async function captureChat(opts: {
  out: string;
  url: string;
  path: string;
  headed: boolean;
  mock: boolean;
  jobs: Job[];
}) {
  const browser = await chromium.launch({ headless: !opts.headed });
  try {
    // One context across all jobs so the cookie (and Supabase
    // user_id) stays stable. Each job reloads the page so the
    // chat UI is clean for that query's screenshot.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    if (opts.mock) {
      await installMockFetch(page);
    }

    for (const job of opts.jobs) {
      // Start at default viewport for the type+wait flow; resize
      // afterward for each viewport's screenshot.
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.goto(opts.url + opts.path, { waitUntil: 'networkidle' });

      if (opts.mock) {
        // Park the fixture on window so the addInitScript fetch
        // override returns it. evaluate runs after navigation but
        // before the user types/submits, which is well before the
        // /api/chat fetch happens.
        const fx = fixtureForLabel(job.label);
        await page.evaluate((f) => {
          (window as unknown as { __MOCK_FIXTURE: unknown }).__MOCK_FIXTURE = f;
        }, fx);
      }

      // Type the query. Use pressSequentially so React sees real
      // input events and updates its controlled state — fill()
      // sets the DOM value without triggering onChange in React,
      // which leaves the Send button disabled (input.trim() === '').
      const input = page.locator('input[type="text"]');
      await input.waitFor({ state: 'visible', timeout: 15000 });
      await input.click();
      await input.pressSequentially(job.query, { delay: 5 });

      // Submit and wait for the assistant message to appear.
      // The chat appends a "Messenger" header label inside each
      // assistant bubble (see ChatUI MessageCard). Wait for one.
      const submit = page.locator('button[type="submit"]');
      await submit.waitFor({ state: 'visible', timeout: 5000 });
      // Sanity: the button should be enabled now that React has
      // received the input. If it's still disabled, fail loudly.
      const disabled = await submit.getAttribute('disabled');
      if (disabled !== null) {
        throw new Error(`Send button still disabled after typing "${job.query}"`);
      }
      await submit.click();
      await page
        .locator('text=Messenger')
        .first()
        .waitFor({ state: 'visible', timeout: 60000 });
      // Brief settle for verse-card render + any animation.
      await page.waitForTimeout(750);

      // Screenshot at each viewport.
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        // Allow flex/grid reflow at the new viewport.
        await page.waitForTimeout(250);
        const file = join(opts.out, `${job.label}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`[screenshot] wrote ${file}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const opts = parseArgs();
  await mkdir(opts.out, { recursive: true });
  console.log(`[screenshot] output dir: ${opts.out}`);
  console.log(`[screenshot] target: ${opts.url}${opts.path}`);
  console.log(`[screenshot] mode: ${opts.mock ? 'MOCK (zero API cost)' : 'LIVE (real /api/chat)'}`);
  if (opts.routeOnly) {
    await captureRoute(opts);
  } else {
    await captureChat(opts);
  }
  console.log('[screenshot] done');
}

main().catch((e) => {
  console.error('[screenshot] failed:', e);
  process.exit(1);
});
