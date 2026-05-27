// Phase 2.5 Step 2.5.9.4 — CLS check at Slow 3G.
//
// Founder spec: load /chat with DevTools "Slow 3G" throttling +
// verify peacock feather PNG load doesn't cause Cumulative Layout
// Shift. Explicit width/height on next/image SHOULD prevent CLS
// regardless of network speed; this is the smoke test that proves
// it under realistic Indian-mobile-network conditions.
//
// Slow 3G profile (Chrome DevTools defaults):
//   download: 50 kbps
//   upload:   32 kbps
//   latency:  400 ms RTT
//
// Reports the page's accumulated CLS via the standard browser
// PerformanceObserver layout-shift API. CLS < 0.1 is the Core
// Web Vitals "good" threshold; we expect 0.

import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:3000/chat';

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (50 * 1024) / 8, // 50 kbps → bytes/sec
      uploadThroughput: (32 * 1024) / 8,
      latency: 400,
    });
    // 4× CPU slowdown matches the Lighthouse mobile profile, which
    // is roughly the Moto G5 reference device the founder named.
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // Install the layout-shift observer BEFORE navigating, so it
    // catches every shift from page-mount onward.
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEntry[] & { value?: number; hadRecentInput?: boolean }[]) {
          // Layout-shift entries with hadRecentInput=true are
          // user-initiated (scroll, click) and excluded from CLS
          // by the Web Vitals spec. We mirror that.
           
          const e = entry as any;
          if (!e.hadRecentInput) {
            (window as unknown as { __cls: number }).__cls += e.value ?? 0;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    console.log(`[cls] navigating to ${URL} under Slow 3G + 4× CPU…`);
    const t0 = Date.now();
    await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
    // Give late-arriving images time to resolve and trigger any
    // layout shifts they're going to cause.
    await page.waitForTimeout(8000);
    const elapsedMs = Date.now() - t0;

    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls,
    );
    const peacockLoaded = await page.evaluate(() => {
      const img = document.querySelector(
        'img[src*="krishna-peacock-feather"]',
      ) as HTMLImageElement | null;
      return img
        ? {
            present: true,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            renderedWidth: img.clientWidth,
            renderedHeight: img.clientHeight,
          }
        : { present: false };
    });

    console.log('---');
    console.log(`[cls] elapsed: ${elapsedMs} ms (Slow 3G load time)`);
    console.log(`[cls] CLS:     ${cls.toFixed(4)}`);
    console.log(`[cls] target:  < 0.1 (Core Web Vitals "good")`);
    console.log(`[cls] result:  ${cls < 0.1 ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log('---');
    console.log(`[cls] peacock feather:`, peacockLoaded);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[cls] failed:', e);
  process.exit(1);
});
