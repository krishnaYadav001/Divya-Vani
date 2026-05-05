// Phase 3.9 Test 3 — Slow 3G UX harness.
//
// Drives a real Chromium instance against http://localhost:3000/chat
// with Chrome DevTools "Slow 3G" network throttling applied via CDP
// (400 Kbps down / 400 Kbps up / 400 ms RTT — matches Lighthouse's
// Slow-3G profile and the founder's realistic-target framing).
//
// Measures:
//   - TTFT (time to first assistant token visible in DOM)
//   - max-gap between successive DOM updates while stream is active
//   - total stream duration
//
// Pass criteria (per Phase 3.9 brief):
//   - TTFT < 5000 ms (5 s realistic target on Slow 3G)
//   - no mid-stream stall lasting > 5 s
//   - full reply renders without error
//
// NOT in package.json — invoke via:
//   npx tsx scripts/test-slow3g.ts

import { chromium } from "@playwright/test";

const BASE = process.env.CHAT_BASE_URL ?? "http://localhost:3000";
const QUERY =
  "I'm terrified that my career is over. I lost my job last week and I can't sleep.";

type StreamEvent = { t: number; len: number };

async function main() {
  // Headed run per founder spec — headless can skew rendering timing.
  const browser = await chromium.launch({ headless: false });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    await client.send("Network.enable");

    // tsx/esbuild compiles this file and adds __name() helper calls
    // around named functions; Playwright ships the compiled function
    // source to the browser, where __name is undefined → ReferenceError.
    // Shim it as identity globally before any evaluate() runs.
    await page.addInitScript(() => {
      const w = globalThis as unknown as { __name?: (x: unknown) => unknown };
      if (!w.__name) w.__name = (x) => x;
    });

    // Page-load happens on a normal (un-throttled) connection — what
    // we're measuring is streaming-response TTFT under Slow 3G, NOT
    // initial app shell time. This matches the real user scenario
    // (user has the chat open already, types a message, that's when
    // the network speed of the API stream matters).
    console.log("[slow3g] navigating to /chat (un-throttled load)…");
    await page.goto(`${BASE}/chat`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for input field to mount + React to hydrate (signal: button
    // becomes interactable).
    const input = page.locator('input[type="text"]').first();
    await input.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 });

    // NOW apply Slow 3G throttling for the API streaming call:
    //   download 400 Kbps, upload 400 Kbps, 400 ms RTT
    // (Chrome DevTools / Lighthouse Slow 3G profile).
    console.log("[slow3g] applying Slow 3G throttle (400 Kbps / 400 ms RTT)");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });

    // Install a MutationObserver that tracks assistant-bubble content
    // length over time. Each unique-length sample becomes an event.
    await page.evaluate(() => {
      const w = window as unknown as { __events: StreamEvent[] };
      w.__events = [];
      const findAssistantBubble = (): HTMLElement | null => {
        const ps = document.querySelectorAll("p");
        let last: HTMLElement | null = null;
        ps.forEach((p) => {
          if (p.textContent?.trim() === "Messenger") {
            last = p.parentElement;
          }
        });
        return last;
      };
      const observer = new MutationObserver(() => {
        const bubble = findAssistantBubble();
        if (!bubble) return;
        const content = bubble.querySelector("p.whitespace-pre-wrap");
        const len = content?.textContent?.length ?? 0;
        const events = w.__events;
        const last = events[events.length - 1];
        if (!last || last.len !== len) {
          events.push({ t: Date.now(), len });
        }
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      type StreamEvent = { t: number; len: number };
    });

    // Send the query. Mark tSend at the click. Use type() instead of
    // fill() so React's onChange fires per-keystroke (more reliable
    // under Slow 3G, where the controlled input's state propagation
    // can lag the synthetic input event from fill()). Then wait for
    // the submit button to actually enable before clicking.
    await input.click();
    await input.type(QUERY, { delay: 0 });
    const sendBtn = page.locator('button[type="submit"]');
    await sendBtn.waitFor({ state: "visible", timeout: 30000 });
    // Poll until enabled (i.e. !isSending && input.trim()).
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null;
        return btn != null && !btn.disabled;
      },
      { timeout: 30000 },
    );
    const tSend = Date.now();
    console.log(`[slow3g] click Send at t=${tSend}`);
    await sendBtn.click();

    // Wait for first non-empty assistant-content event.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __events: StreamEvent[] };
        return w.__events.some((e) => e.len > 0);
      },
      { timeout: 60000 },
    );

    const firstEvents = (await page.evaluate(
      () => (window as unknown as { __events: StreamEvent[] }).__events,
    )) as StreamEvent[];
    const firstNonEmpty = firstEvents.find((e) => e.len > 0);
    if (!firstNonEmpty) throw new Error("no first-token event captured");
    const ttftMs = firstNonEmpty.t - tSend;
    console.log(`[slow3g] TTFT: ${ttftMs} ms`);

    // Wait for verse pills to land (signals end-of-stream + meta frame
    // received). Failing this within 90 s is treated as "stream did not
    // complete" rather than as a stall.
    let pillsLanded = false;
    try {
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            'button[aria-label^="Verse"], button[aria-label^="भगवद्"], button[aria-label^="महाभारत"], button[aria-label^="भागवत"]',
          ).length > 0,
        { timeout: 90000 },
      );
      pillsLanded = true;
    } catch {
      // No verse pills — could be an empty-verses turn. Wait a bit
      // for the stream to settle in case meta has no verses.
      await page.waitForTimeout(8000);
    }

    const finalEvents = (await page.evaluate(
      () => (window as unknown as { __events: StreamEvent[] }).__events,
    )) as StreamEvent[];

    const endTime = finalEvents[finalEvents.length - 1]?.t ?? Date.now();
    const totalMs = endTime - tSend;
    const finalLen = finalEvents[finalEvents.length - 1]?.len ?? 0;

    // Compute max gap between successive content-length updates AFTER
    // first non-empty (i.e. while stream is delivering tokens).
    const postFirst = finalEvents.filter((e) => e.t >= firstNonEmpty.t);
    let maxGap = 0;
    for (let i = 1; i < postFirst.length; i++) {
      const gap = postFirst[i].t - postFirst[i - 1].t;
      if (gap > maxGap) maxGap = gap;
    }
    const stalled = maxGap > 5000;

    const ttftPass = ttftMs < 5000;
    const stallPass = !stalled;
    const renderPass = finalLen > 0;
    const pass = ttftPass && stallPass && renderPass;

    console.log(
      `[slow3g] DONE  TTFT=${ttftMs}ms  total=${totalMs}ms  maxGap=${maxGap}ms  events=${finalEvents.length}  finalLen=${finalLen}ch  pillsLanded=${pillsLanded}`,
    );
    console.log(
      `[result] ${JSON.stringify({
        pass,
        ttftMs,
        ttftPass,
        totalMs,
        maxGapMs: maxGap,
        stallPass,
        events: finalEvents.length,
        finalLen,
        pillsLanded,
        renderPass,
      })}`,
    );

    process.exit(pass ? 0 : 1);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("[slow3g] fatal:", e);
  process.exit(1);
});
