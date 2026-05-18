// Atmosphere — Dawn Aarti redesign (2026-05-18).
//
// The z-0 ground on every page: a soft watercolor wash, drifting
// petals + sparkle motes (the <Petals> layer), an optional masked
// fresco vignette (the founder's pastel Pichwai dawn painting — used
// on the landing hero only), and an optional paper-grain overlay.
// Supersedes the Phase 8 dark Krishna vignette.
//
// The `mode` / `intensity` / `vignette` prop API is preserved exactly
// so existing callers (ChatUI, settings, privacy, terms) keep
// working; `mode` is reinterpreted for Dawn (hero = fresco + dense
// petals, chat = light petals + sparkles, deep/mobile/distant =
// reduced density). New optional props (`density`, `fresco`, `grain`)
// override the per-mode defaults. Purely presentational —
// aria-hidden + pointer-events-none — so it never interferes with the
// content / disclaimer / identity layers above it (Locked Decision
// #1: callers keep the disclaimer on an opaque/blurred surface).
//
// Fresco fallback: if /dawn-fresco.jpg 404s the layer is simply
// transparent and the wash shows through — never a blank ground.

import Petals from "./motifs/Petals";

type Mode = "hero" | "chat" | "corner" | "deep" | "mobile" | "distant";

const CONFIGS: Record<
  Mode,
  { density: number; fresco: boolean; grain: boolean }
> = {
  hero: { density: 85, fresco: true, grain: true },
  chat: { density: 45, fresco: false, grain: false },
  corner: { density: 30, fresco: false, grain: false },
  deep: { density: 18, fresco: false, grain: false },
  mobile: { density: 25, fresco: false, grain: false },
  distant: { density: 22, fresco: false, grain: false },
};

export default function Atmosphere({
  mode = "hero",
  intensity = 1,
  vignette = 1,
  density,
  fresco,
  grain,
}: {
  mode?: Mode;
  intensity?: number;
  vignette?: number;
  /** Override the per-mode petal/sparkle density (0–100). */
  density?: number;
  /** Force the fresco vignette on/off (default: per mode). */
  fresco?: boolean;
  /** Force the paper grain on/off (default: per mode). */
  grain?: boolean;
}) {
  const c = CONFIGS[mode] ?? CONFIGS.hero;
  const resolvedDensity = Math.max(
    0,
    Math.min(100, (density ?? c.density) * intensity),
  );
  const showFresco = fresco ?? c.fresco;
  const showGrain = grain ?? c.grain;
  const edge = Math.max(0, Math.min(1, vignette));

  const frescoMask =
    "radial-gradient(ellipse 75% 80% at 50% 45%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0) 100%)";

  return (
    <div
      aria-hidden
      className={`dawn-wash-soft pointer-events-none absolute inset-0 overflow-hidden ${
        showGrain ? "dawn-grain" : ""
      }`}
    >
      {/* Fresco vignette — the founder's pastel dawn painting, masked
          to a soft pool. Background-image so a 404 just yields a
          transparent layer over the wash (never blank). */}
      {showFresco && (
        <>
          <div
            className="absolute inset-0 bg-cover"
            style={{
              backgroundImage: "url(/dawn-fresco.jpg)",
              backgroundPosition: "center",
              backgroundColor: "var(--color-mist-2)",
              opacity: 0.5,
              filter: "saturate(0.85) brightness(1.05) blur(0.5px)",
              maskImage: frescoMask,
              WebkitMaskImage: frescoMask,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, oklch(94% 0.04 50 / .35) 0%, transparent 40%, oklch(94% 0.04 280 / .35) 100%)",
            }}
          />
        </>
      )}

      {/* Drifting petals + sparkles (CSS-only; reduced-motion handled
          in globals.css). */}
      <Petals density={resolvedDensity} />

      {/* Soft cream edge vignette — the light-ground inverse of the
          old black vignette; keeps page edges calm without darkening
          the pastel ground. */}
      {edge > 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 80% 92% at center, transparent 0%, transparent 55%, oklch(98.5% 0.006 70 / ${
              0.4 * edge
            }) 82%, oklch(98.5% 0.006 70 / ${0.75 * edge}) 100%)`,
          }}
        />
      )}
    </div>
  );
}
