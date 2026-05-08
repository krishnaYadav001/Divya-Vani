# Phase 6.9.2 — Lighthouse baseline (mobile, throttled)

**Captured**: 2026-05-08, against `https://divyavani.co.in/*` on production deployment of `0a5d396` + `e480212`.
**Tool**: Lighthouse 12 CLI, default mobile profile (Moto G4 emulation, slow 4G throttle).
**Note**: `--preset=mobile` flag from earlier phases is invalid in Lighthouse 12 — mobile is the default; only `perf | experimental | desktop` are valid presets.

## Per-page numbers

| Page | Perf | LCP | TBT | CLS | FCP | SI | Total |
|---|---|---|---|---|---|---|---|
| `/`        | 55 | 4.7 s (4666 ms) | 1920 ms | 0 | 1.6 s | 2.3 s | 522 KiB |
| `/chat`    | 54 | 5.1 s (5050 ms) | 1170 ms | 0 | 2.1 s | 3.6 s | 567 KiB |
| `/privacy` | 53 | 4.9 s (4949 ms) | 1830 ms | 0 | 1.6 s | 3.1 s | 530 KiB |
| `/terms`   | 66 | 4.4 s (4428 ms) |  760 ms | 0 | 1.2 s | 2.9 s | 563 KiB |

## Findings

- **LCP across all pages is ~4.4–5.1 s** — well above the "good" threshold (2.5 s). Improving LCP is the headline goal.
- **TBT is the dominant problem on `/`, `/chat`, `/privacy`** (760–1920 ms). Caused by JS bootup time and main-thread work.
- **CLS is perfectly 0** on every page — no layout regressions to introduce.
- **First Load JS payload is 522–567 KiB** — Sentry SDK is a meaningful chunk of this; pruning default integrations should help.

## /chat LCP element

`div.relative > div.grid > div.overflow-hidden > p.mx-auto` — the **bilingual disclaimer paragraph** in the chat header. Not the peacock feather, not the lotus mandala. This is server-rendered text, so the bottleneck is TBT (script eval blocking the main thread before paint), not asset delivery.

## Main-thread breakdown (/chat)

| Group | Duration |
|---|---|
| Style & Layout | 2317 ms |
| Script Evaluation | 1939 ms |
| Other | 643 ms |
| Script Parse / Compile | 288 ms |
| **Total** | **5.3 s** |

## Bootup-time culprits (/chat)

| URL | Total | Scripting |
|---|---|---|
| `/chat` (HTML+inline) | 2515 ms | 14 ms |
| `/_next/static/chunks/0~z~rx__r4tj6.js` (~72 KB) | 1625 ms | 1529 ms |
| `/_next/static/chunks/03dnppruwfwjf.js` (~92 KB) | 297 ms | 140 ms |

The 72 KB chunk eats 1.5 s of scripting time — bundled React/Next/Sentry/Razorpay/Vercel Analytics. Sentry default-integration pruning targets this directly.

## Top byte-weight (`/chat`)

| Asset | Bytes |
|---|---|
| `e92fa6abd9c612ef-s.p.0z52yf238t5rz.woff2` | 121 KB |
| `03dnppruwfwjf.js` | 92 KB |
| `0~z~rx__r4tj6.js` | 72 KB |
| `01e4147cff8141ee-s.p.10ked.7w885.g.woff2` | 38 KB |

Fonts are the single largest asset class — 159 KB combined. Out of scope for this phase (touching font loading risks visual regressions).
