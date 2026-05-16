// Phase 8 cinematic-dark redesign — atmospheric Krishna vignette.
//
// Renders the founder-supplied Krishna image (public/krishna.jpg) as a
// vignetted background masked into a soft elliptical pool that fades to
// pure black at the edges, plus an outer vignette, a warm tone wash,
// and faint film grain. `mode` picks the crop + intensity per surface
// so each page feels distinct without changing the asset.
//
// Purely presentational — aria-hidden + pointer-events-none — so it
// never interferes with the chat/disclaimer/identity layers stacked
// above it (Locked Decision #1: the disclaimer must stay legible over
// this; callers keep the disclaimer on an opaque/blurred surface).

type Mode = "hero" | "chat" | "corner" | "deep" | "mobile" | "distant";

const CONFIGS: Record<
  Mode,
  { pos: string; scale: number; opacity: number; blur: number }
> = {
  hero: { pos: "72% 50%", scale: 1.05, opacity: 0.85, blur: 0 },
  chat: { pos: "50% 35%", scale: 1.4, opacity: 0.32, blur: 2 },
  corner: { pos: "92% 8%", scale: 0.95, opacity: 0.55, blur: 0 },
  deep: { pos: "50% 50%", scale: 1.6, opacity: 0.18, blur: 6 },
  mobile: { pos: "50% 30%", scale: 1.8, opacity: 0.28, blur: 3 },
  distant: { pos: "85% 60%", scale: 0.7, opacity: 0.45, blur: 0 },
};

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.8 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

export default function Atmosphere({
  mode = "hero",
  intensity = 1,
  vignette = 1,
}: {
  mode?: Mode;
  intensity?: number;
  vignette?: number;
}) {
  const c = CONFIGS[mode] ?? CONFIGS.hero;
  const op = Math.max(0, Math.min(1, c.opacity * intensity));
  const mask = `radial-gradient(ellipse 60% 70% at ${c.pos}, black 0%, black 30%, rgba(0,0,0,0.4) 60%, transparent 85%)`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden bg-ink0"
    >
      {/* Krishna image — masked into a soft elliptical pool */}
      <div
        className="absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: "url(/krishna.jpg)",
          backgroundSize: `${c.scale * 100}% auto`,
          backgroundPosition: c.pos,
          opacity: op,
          filter: c.blur ? `blur(${c.blur}px)` : "none",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      {/* Outer vignette — heavy black at the corners */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 75% 90% at center, transparent 0%, transparent 35%, rgba(0,0,0,${
            0.55 * vignette
          }) 70%, rgba(0,0,0,${0.95 * vignette}) 100%)`,
        }}
      />
      {/* Warm tone wash rising from the base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 100%, rgba(122,40,32,0.06), transparent 50%)",
          mixBlendMode: "screen",
        }}
      />
      {/* Faint film grain */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.04,
          mixBlendMode: "overlay",
          backgroundImage: GRAIN,
        }}
      />
    </div>
  );
}
