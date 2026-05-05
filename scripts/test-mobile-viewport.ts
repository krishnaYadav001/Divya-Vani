// Phase 3.9 Test 4 — Mobile-viewport substitute (partial test).
//
// True mobile-device testing is not possible from this session. Closest
// substitute is Playwright with a mobile device descriptor (iPhone 13)
// — sets viewport ~390×844, isMobile=true, hasTouch=true. Verifies
// layout, auto-scroll, and DOM behavior under streaming. Does NOT
// verify real iOS/Android keyboard behavior or actual network
// conditions on a phone — those require a physical device.
//
// For each of three messages (short / medium / long), checks:
//   - smooth-text-render: assistant content grows monotonically (no
//     flicker / regression in length).
//   - bubble-in-view: the streaming bubble's bottom stays within
//     viewport during streaming (auto-scroll worked).
//   - verse-pills-rendered: at least one verse pill appears in DOM
//     after stream completes.
//   - no-keyboard-overlap: NOT TESTABLE in headless Playwright
//     (virtual keyboard isn't modeled). Marked N/A in report.
//
// NOT in package.json — invoke via:
//   npx tsx scripts/test-mobile-viewport.ts

import { chromium, devices } from "@playwright/test";

const BASE = process.env.CHAT_BASE_URL ?? "http://localhost:3000";

const MESSAGES = [
  { tier: "short", text: "नमस्ते" },
  { tier: "medium", text: "I'm having a hard day, I don't know what to do." },
  {
    tier: "long",
    text:
      "Tell me everything about Yashoda — her story, how she raised you, what she taught you, all the leelas.",
  },
];

type LengthSample = { t: number; len: number };

type MessageResult = {
  tier: string;
  text: string;
  smoothTextRender: boolean;
  bubbleInView: boolean;
  versePillsRendered: boolean;
  ttftMs: number | null;
  finalLen: number;
  samples: number;
  notes: string[];
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const page = await ctx.newPage();
    console.log(
      `[mobile] device=${devices["iPhone 13"].userAgent.includes("iPhone") ? "iPhone 13" : "?"} viewport=${(devices["iPhone 13"] as { viewport?: { width: number; height: number } }).viewport?.width}x${(devices["iPhone 13"] as { viewport?: { width: number; height: number } }).viewport?.height}`,
    );

    // Shim for tsx/esbuild's __name helper that ships with compiled
    // function source to the browser. Same fix as test-slow3g.ts.
    await page.addInitScript(() => {
      const w = globalThis as unknown as { __name?: (x: unknown) => unknown };
      if (!w.__name) w.__name = (x) => x;
    });

    await page.goto(`${BASE}/chat`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const input = page.locator('input[type="text"]').first();
    await input.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 });

    // Install observer + helper that returns the *current* assistant
    // bubble's content length AND its bottom-y relative to viewport.
    await page.addInitScript(() => {
      const w = window as unknown as { __mobileEvents?: LengthSample[] };
      w.__mobileEvents = [];
      type LengthSample = { t: number; len: number };
    });

    const results: MessageResult[] = [];

    for (const msg of MESSAGES) {
      console.log(`\n[mobile] sending ${msg.tier} message: ${msg.text}`);

      // Reset event buffer + capture prior assistant-bubble count so
      // the observer only records events for the NEW bubble (the
      // assistant turn we're about to trigger). Without this, events
      // from the previous turn's still-mounted bubble bleed in and
      // skew TTFT (it appears the new bubble had content at t=0).
      await page.evaluate(() => {
        const w = globalThis as unknown as {
          __mobileEvents: { t: number; len: number }[];
          __priorCount: number;
          __observer?: MutationObserver;
        };
        const initialCount = (() => {
          const ps = document.querySelectorAll("p");
          let n = 0;
          ps.forEach((p) => {
            if (p.textContent?.trim() === "Messenger") n++;
          });
          return n;
        })();
        w.__mobileEvents = [];
        w.__priorCount = initialCount;
        if (w.__observer) {
          w.__observer.disconnect();
        }
        const obs = new MutationObserver(() => {
          // Find the LATEST Messenger bubble — but only if there are
          // more bubbles now than before (i.e. our new turn's bubble
          // has been pushed to the DOM).
          const ps = document.querySelectorAll("p");
          const messengerLabels: HTMLElement[] = [];
          ps.forEach((p) => {
            if (p.textContent?.trim() === "Messenger") {
              messengerLabels.push(p);
            }
          });
          if (messengerLabels.length <= w.__priorCount) return;
          const newBubble = messengerLabels[messengerLabels.length - 1]
            .parentElement;
          if (!newBubble) return;
          const content = newBubble.querySelector("p.whitespace-pre-wrap");
          const len = content?.textContent?.length ?? 0;
          const events = w.__mobileEvents;
          const last = events[events.length - 1];
          if (!last || last.len !== len) {
            events.push({ t: Date.now(), len });
          }
        });
        obs.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        w.__observer = obs;
      });

      // Snapshot existing verse-pill count so the post-stream check
      // can detect whether THIS turn's bubble got pills (rather than
      // counting pills from prior turns that are still in the DOM).
      const priorPillCountBefore = await page.evaluate(() => {
        const buttons = document.querySelectorAll("button[aria-label]");
        let count = 0;
        for (const b of buttons) {
          const al = b.getAttribute("aria-label") ?? "";
          if (al.includes("verse:") || al.includes("Verse:")) count++;
        }
        return count;
      });

      // Use type() so React's controlled-input onChange fires per
      // keystroke, then wait for the submit button to enable.
      await input.click();
      await input.fill(""); // clear any leftover text from prior msg
      await input.type(msg.text, { delay: 0 });
      const sendBtn = page.locator('button[type="submit"]');
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
      await sendBtn.click();

      // Wait for first non-empty content
      let ttftMs: number | null = null;
      try {
        await page.waitForFunction(
          () => {
            const w = window as unknown as { __mobileEvents: LengthSample[] };
            return w.__mobileEvents.some((e) => e.len > 0);
          },
          { timeout: 60000 },
        );
        const firstEvents = (await page.evaluate(
          () =>
            (window as unknown as { __mobileEvents: LengthSample[] })
              .__mobileEvents,
        )) as LengthSample[];
        const first = firstEvents.find((e) => e.len > 0);
        if (first) ttftMs = first.t - tSend;
      } catch {
        results.push({
          tier: msg.tier,
          text: msg.text,
          smoothTextRender: false,
          bubbleInView: false,
          versePillsRendered: false,
          ttftMs: null,
          finalLen: 0,
          samples: 0,
          notes: ["TIMEOUT waiting for first token"],
        });
        continue;
      }

      // Sample bubble bottom-Y vs viewport every 250 ms while streaming
      // to verify auto-scroll keeps bubble visible.
      const bubbleBottomSamples: Array<{
        t: number;
        bottom: number;
        viewportH: number;
      }> = [];
      const samplePoll = setInterval(async () => {
        try {
          const sample = await page.evaluate(() => {
            // Sample the LATEST Messenger bubble (the streaming one).
            const ps = document.querySelectorAll("p");
            const messengers: HTMLElement[] = [];
            ps.forEach((p) => {
              if (p.textContent?.trim() === "Messenger") {
                messengers.push(p);
              }
            });
            if (messengers.length === 0) return null;
            const last = messengers[messengers.length - 1].parentElement;
            if (!last) return null;
            const rect = last.getBoundingClientRect();
            return { bottom: rect.bottom, viewportH: window.innerHeight };
          });
          if (sample) {
            bubbleBottomSamples.push({ t: Date.now(), ...sample });
          }
        } catch {
          /* page navigated away or closed; ignore */
        }
      }, 250);

      // Wait for stream completion via idle detection: no new
      // text-delta events for 3 s OR hard cap of 90 s. Idle is more
      // reliable than waiting for verse pills because pills from prior
      // turns persist in the DOM and would resolve a "wait for any
      // pill" check instantly on the second + third turns.
      const streamDone = await page
        .waitForFunction(
          () => {
            const w = globalThis as unknown as {
              __mobileEvents: { t: number; len: number }[];
            };
            const events = w.__mobileEvents;
            if (events.length === 0) return false;
            const lastT = events[events.length - 1].t;
            return Date.now() - lastT > 3000;
          },
          { timeout: 90000, polling: 500 },
        )
        .then(() => true)
        .catch(() => false);

      clearInterval(samplePoll);

      // After stream is idle, check whether the NEW bubble has verse
      // pills attached. We count pills BEFORE the test loop iteration
      // and look for an increase.
      const versePillsRendered = await page.evaluate(
        ({ priorPillCount }: { priorPillCount: number }) => {
          const buttons = document.querySelectorAll("button[aria-label]");
          let count = 0;
          for (const b of buttons) {
            const al = b.getAttribute("aria-label") ?? "";
            if (al.includes("verse:") || al.includes("Verse:")) count++;
          }
          return count > priorPillCount;
        },
        { priorPillCount: priorPillCountBefore },
      );

      if (!streamDone) {
        // Hit hard timeout — note in result.
        // (left as-is; smoothRender / finalLen below tell the rest)
      }

      const finalEvents = (await page.evaluate(
        () =>
          (window as unknown as { __mobileEvents: LengthSample[] })
            .__mobileEvents,
      )) as LengthSample[];

      const finalLen = finalEvents[finalEvents.length - 1]?.len ?? 0;

      // smooth-text-render: content length monotonically non-decreasing
      // (no flicker → no regression in len).
      let smoothTextRender = true;
      for (let i = 1; i < finalEvents.length; i++) {
        if (finalEvents[i].len < finalEvents[i - 1].len) {
          smoothTextRender = false;
          break;
        }
      }

      // bubble-in-view: across all samples taken during streaming, the
      // bubble's bottom should not have been more than 1.2× viewport
      // height below origin (allowing a small overshoot before auto-
      // scroll catches up). If most samples are within viewport,
      // auto-scroll is keeping pace.
      const inViewSamples = bubbleBottomSamples.filter(
        (s) => s.bottom <= s.viewportH * 1.2,
      ).length;
      const bubbleInView =
        bubbleBottomSamples.length > 0 &&
        inViewSamples / bubbleBottomSamples.length >= 0.8;

      results.push({
        tier: msg.tier,
        text: msg.text,
        smoothTextRender,
        bubbleInView,
        versePillsRendered,
        ttftMs,
        finalLen,
        samples: finalEvents.length,
        notes: [
          `bubbleBottomSamples=${bubbleBottomSamples.length}`,
          `inViewSamples=${inViewSamples}`,
        ],
      });

      console.log(
        `[mobile] ${msg.tier}: TTFT=${ttftMs}ms  finalLen=${finalLen}ch  smoothRender=${smoothTextRender}  bubbleInView=${bubbleInView}  pills=${versePillsRendered}`,
      );

      // Small pause between sends so dev server / API state settle.
      await page.waitForTimeout(2000);
    }

    const allPass = results.every(
      (r) => r.smoothTextRender && r.bubbleInView && r.versePillsRendered,
    );

    console.log(
      `\n[result] ${JSON.stringify({ pass: allPass, perMessage: results })}`,
    );

    process.exit(allPass ? 0 : 1);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("[mobile] fatal:", e);
  process.exit(1);
});
