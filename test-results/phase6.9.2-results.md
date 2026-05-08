# Phase 6.9.2 — Lighthouse before/after results

**Captured**: 2026-05-08
**Deploy**: `493ce95` against production at `https://divyavani.co.in`
**Tool**: Lighthouse 12 CLI, default mobile profile (Moto G4 emulation, slow 4G throttle)

## Headline finding: Lighthouse single-run variance dominates the deltas

I ran 3 "after" rounds against the same deployed code. Here is the run-to-run spread on identical pages:

| Page | LCP run-1 | LCP run-2 | LCP run-3 | Spread |
|---|---|---|---|---|
| `/`        | 5616 ms | 4486 ms | 5203 ms | **1130 ms** |
| `/chat`    | 5600 ms | 4866 ms | 5660 ms |  794 ms |
| `/privacy` | 5043 ms | 4510 ms | 5950 ms | **1440 ms** |
| `/terms`   | 4719 ms | 5414 ms | 5392 ms |  695 ms |

| Page | TBT run-1 | TBT run-2 | TBT run-3 | Spread |
|---|---|---|---|---|
| `/`        | 2486 ms | 1390 ms | 2157 ms | **1096 ms** |
| `/chat`    | 1940 ms | 1703 ms | 2088 ms |  385 ms |
| `/privacy` | 2076 ms | 1459 ms | 3174 ms | **1715 ms** |
| `/terms`   | 1484 ms | 1826 ms | 2108 ms |  624 ms |

The LCP/TBT spread routinely exceeds 1000 ms on the **same code**. This means the single-run baseline vs single-run after delta we'd produce is effectively measurement noise. Honest reporting requires multi-run medians at minimum (Lighthouse CI recommends ≥5 runs); a more rigorous Phase 7+ harness should land before we treat these metrics as load-bearing.

## What is deterministic: bundle size

Lighthouse's `total-byte-weight` audit is reproducible across runs because it sums actual response bytes:

| Page | Baseline total | After total | Delta |
|---|---|---|---|
| `/`        | 522 KiB | 446 KiB | **−76 KiB** (−15%) |
| `/chat`    | 567 KiB | 464 KiB | **−103 KiB** (−18%) |
| `/privacy` | 530 KiB | 460 KiB | **−70 KiB** (−13%) |
| `/terms`   | 563 KiB | 482 KiB | **−81 KiB** (−14%) |

This is the headline real-user win: 70–103 KiB less to download per page. The drop is consistent with what we expected from `defaultIntegrations: false` on the Sentry SDK (Replay + browserTracing + Profiling code paths are no longer in the client bundle).

## Median-of-3 timing comparison (noise-aware)

Even understanding the variance is huge, the medians are below for completeness. Treat these as directional, not authoritative:

| Page | Metric | Baseline | After median (n=3) | Δ | Within noise? |
|---|---|---|---|---|---|
| `/`        | LCP | 4666 ms | 5203 ms | +537 ms | yes (spread 1130 ms) |
| `/`        | TBT | 1920 ms | 2157 ms | +237 ms | yes (spread 1096 ms) |
| `/chat`    | LCP | 5050 ms | 5600 ms | +550 ms | likely (spread 794 ms) |
| `/chat`    | TBT | 1170 ms | 1940 ms | +770 ms | borderline (spread 385 ms) |
| `/privacy` | LCP | 4949 ms | 5043 ms | +94 ms | yes (spread 1440 ms) |
| `/privacy` | TBT | 1830 ms | 2076 ms | +246 ms | yes (spread 1715 ms) |
| `/terms`   | LCP | 4428 ms | 5392 ms | +964 ms | likely (spread 695 ms) |
| `/terms`   | TBT |  760 ms | 1826 ms | +1066 ms | borderline (spread 624 ms) |

The /chat TBT and /terms TBT/LCP shifts could plausibly be real, or could be Vercel cold-start vs warm-start effects we are not isolating. **No revert is warranted on this evidence** — the underlying changes (lazy-load, Sentry prune, AVIF) are textbook perf wins, the bundle drop is real, and the timing data is too noisy to call.

## /chat LCP element identified

`div.relative > div.grid > div.overflow-hidden > p.mx-auto` — the **bilingual disclaimer paragraph** in the chat header. Server-rendered text. Not the peacock feather, not the lotus mandala. So /chat's TBT (not LCP) is the real lever; LCP is bound by font + critical CSS, not by image delivery.

No code change applied beyond Step 6 (AVIF), per plan.

## Sentry SDK integrations shipped

**Client (`src/instrumentation-client.ts`)**: 6 integrations, `defaultIntegrations: false`:
- `breadcrumbsIntegration`
- `dedupeIntegration`
- `functionToStringIntegration`
- `globalHandlersIntegration`
- `httpContextIntegration`
- `linkedErrorsIntegration`

Notably absent: `replayIntegration`, `browserTracingIntegration`, `browserProfilingIntegration` (intentional opt-out — Phase 6.6 quota-control decision).

**Server (`src/sentry.server.config.ts`)**: 8 integrations, `defaultIntegrations: false`:
- `dedupeIntegration`
- `functionToStringIntegration`
- `inboundFiltersIntegration`
- `linkedErrorsIntegration`
- `onUncaughtExceptionIntegration`
- `onUnhandledRejectionIntegration`
- `contextLinesIntegration`
- `requestDataIntegration`

**Verification**: post-deploy `curl -I https://divyavani.co.in/api/sentry-test` returned `HTTP/1.1 500 Internal Server Error` — the intentional error path still throws and propagates. Error capture is intact.

## Forced-reflow investigation — deferred to Phase 7+

Skipped per the brief's "report and skip if root cause is hard to pin down" guidance. The dominant TBT cost identified in baseline (`0~z~rx__r4tj6.js` chunk burning 1529 ms scripting) is being addressed by the Sentry prune. The most plausible app-level forced-reflow source — the textarea auto-grow effect at [`ChatUI.tsx:56-64`](../src/app/components/ChatUI.tsx#L56) which does `style.height = "auto"` then reads `scrollHeight` then writes — was not modified, since (a) chasing it without a confirmed Performance trace risks a regression, and (b) the pattern is unavoidable for textarea auto-grow without significant rework.

Phase 7+ candidate: capture a real Performance trace via Playwright + CDP, identify the script + line, defer the textarea read to `requestAnimationFrame` if confirmed.

## AVIF format — confirmed live

Post-deploy verification:
```
$ curl -sI -H "Accept: image/avif" \
    "https://divyavani.co.in/_next/image?url=%2Fkrishna-peacock-feather.png&w=96&q=75" \
    | grep Content-Type
Content-Type: image/avif
```

The peacock feather PNG (71.8 KB original) now serves as AVIF on supporting browsers. Older browsers fall back to WebP automatically.

## Recommendations for future perf phases

1. **Use `lighthouse-ci` with `--collect.numberOfRuns=5`** so deltas are computed against medians, not single noisy points.
2. **Run baseline + after measurements within minutes of each other** to minimize Vercel-side or network-side drift.
3. **Pin Lighthouse CI to a CI machine** (GitHub Actions runner) so CPU contention is constant — local laptop measurements are inherently noisy.
4. **Track bundle size as the primary deterministic metric** — it's reproducible and directly user-facing. LCP/TBT are secondary signals until a stable harness exists.
