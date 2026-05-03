// Phase 2.5 design-system reference page. NOT linked from the
// public app; routable at /design-system for founder review and
// future regression checks. Renders all 6 color tokens with WCAG
// ratings, typography samples (Hindi + English serif + UI sans +
// Sanskrit inline), the 3 SVG motifs, and mock verse-card previews
// using the sanctioned SOURCE_BADGE_CLASSES.
//
// This page intentionally overrides the layout's body gradient
// with bg-parchment so the new palette shows in isolation, the
// way it will read once Step 2.5.6 swaps the layout gradient.

import Bansuri from '@/app/components/motifs/Bansuri';
import LotusMandala from '@/app/components/motifs/LotusMandala';
import PeacockFeather from '@/app/components/motifs/PeacockFeather';
import {
  COLOR_TOKENS,
  MOTIFS,
  SOURCE_BADGE_CLASSES,
  SOURCE_BADGE_LABEL,
} from '@/lib/designTokens';

export default function DesignSystemPage() {
  return (
    <main className="min-h-dvh w-full overflow-y-auto bg-parchment py-10 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <Header />
        <Section title="Color tokens" subtitle="6 semantic tokens. Single shades; combine with Tailwind v4 opacity modifiers (bg-devotional/10 etc.). Contrast ratings are computed against the parchment background.">
          <ColorSwatches />
        </Section>
        <Section title="Typography" subtitle="Noto Sans Devanagari (self-hosted via next/font) for Hindi, Cormorant Garamond for scriptural English, Geist sans for UI.">
          <TypographySamples />
        </Section>
        <Section title="Krishna-presence motifs" subtitle="Inline SVG. currentColor flows from text-* utilities; aria-hidden by default.">
          <MotifSamples />
        </Section>
        <Section title="Verse card preview" subtitle="Mock cards using SOURCE_BADGE_CLASSES from designTokens.ts. AA-contrast hand-checked on parchment.">
          <VerseCardPreview />
        </Section>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="mb-10 flex items-center gap-4 border-b border-brass/30 pb-6">
      <PeacockFeather className="h-16 w-auto text-peacock" />
      <div>
        <h1 className="font-serif text-3xl font-medium text-sacred sm:text-4xl">
          Krishna AI · Design System
        </h1>
        <p className="mt-1 font-devanagari text-sm text-krishna/80">
          फेज 2.5 — मंदिर-दर्शन सौंदर्य
        </p>
        <p className="mt-1 text-xs text-krishna/60">
          Phase 2.5 — temple-darshan visual identity. This page is
          for founder review only; not linked from the public app.
        </p>
      </div>
    </header>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="font-serif text-2xl text-sacred">{title}</h2>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-krishna/70">{subtitle}</p>
      {children}
    </section>
  );
}

function ColorSwatches() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.values(COLOR_TOKENS).map((t) => {
        const passes = t.contrastOnParchment >= 4.5;
        const border = t.safeAsBorderOnParchment;
        return (
          <div
            key={t.name}
            className="flex items-stretch overflow-hidden rounded-2xl border border-brass/30 bg-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <div
              className="h-auto w-20 shrink-0"
              style={{ backgroundColor: t.hex }}
              aria-hidden
            />
            <div className="flex flex-1 flex-col p-3 text-xs">
              <span className="font-serif text-base text-sacred">
                {t.name}
              </span>
              <span className="font-mono text-[11px] text-krishna/70">
                {t.hex}
              </span>
              <p className="mt-1 text-[11px] leading-snug text-krishna/80">
                {t.role}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <ContrastChip
                  label={`${t.contrastOnParchment.toFixed(1)}:1 vs parchment`}
                  pass={passes}
                />
                <ContrastChip
                  label={border ? 'border ✓' : 'border ✗'}
                  pass={border}
                />
                <ContrastChip
                  label={t.safeAsTextOnParchment ? 'text ✓' : 'text ✗'}
                  pass={t.safeAsTextOnParchment}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContrastChip({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      className={
        'rounded-full border px-2 py-0.5 ' +
        (pass
          ? 'border-peacock/40 bg-peacock/10 text-peacock'
          : 'border-sacred/40 bg-sacred/10 text-sacred')
      }
    >
      {label}
    </span>
  );
}

function TypographySamples() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <SampleBlock label="Hindi · Noto Sans Devanagari · 16px / leading-relaxed">
        <p className="font-devanagari text-base leading-relaxed text-krishna">
          श्री कृष्ण अर्जुन से बोले — हे पाण्डुपुत्र, जब चित्त संयम से स्थिर हो जाए, तब मनुष्य अपने भीतर ही उस आनंद को पाता है जो किसी बाहरी वस्तु पर निर्भर नहीं होता। द्रोण और कुन्ती दोनों के जीवन में यही सत्य प्रकट हुआ है।
        </p>
      </SampleBlock>
      <SampleBlock label="English serif · Cormorant Garamond · 16px / leading-relaxed">
        <p className="font-serif text-base leading-relaxed text-krishna">
          Krishna spoke to Arjuna: when the mind is steadied through quiet discipline, a person discovers within themselves the joy that needs no outside thing to lean on. The same truth shaped the lives of Drona and Kunti.
        </p>
      </SampleBlock>
      <SampleBlock label="UI sans · Geist · 14px">
        <p className="font-sans text-sm text-krishna">
          Send · Cancel · Continue · पंजीकरण करें — system stack
          for buttons, labels, microcopy.
        </p>
      </SampleBlock>
      <SampleBlock label="Sanskrit inline · Cormorant italic · letter-spacing 0.02em">
        <p className="font-serif text-base leading-relaxed text-krishna">
          The verse opens with{' '}
          <em className="not-italic font-serif italic tracking-[0.02em] text-sacred">
            yoga-sthaḥ kuru karmāṇi
          </em>{' '}
          — established in yoga, perform action — Krishna's
          summary of the entire chapter.
        </p>
      </SampleBlock>
    </div>
  );
}

function SampleBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-brass/30 bg-white/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-krishna/60">
        {label}
      </p>
      {children}
    </div>
  );
}

function MotifSamples() {
  const sizes: Array<{ label: string; cls: string }> = [
    { label: 'small (16px)', cls: 'h-4 w-auto' },
    { label: 'medium (40px)', cls: 'h-10 w-auto' },
    { label: 'large (96px)', cls: 'h-24 w-auto' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {MOTIFS.map((m) => (
        <div
          key={m.name}
          className="rounded-2xl border border-brass/30 bg-white/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <p className="font-serif text-sm font-medium text-sacred">{m.name}</p>
          <p className="mb-3 text-[11px] leading-snug text-krishna/70">
            {m.role}
          </p>
          <div className="flex items-end gap-4">
            {sizes.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                {m.name === 'PeacockFeather' && (
                  <PeacockFeather className={`${s.cls} text-peacock`} />
                )}
                {m.name === 'Bansuri' && (
                  <Bansuri className={`${s.cls} text-sacred`} />
                )}
                {m.name === 'LotusMandala' && (
                  <LotusMandala className={`${s.cls} text-krishna`} />
                )}
                <span className="text-[10px] text-krishna/60">{s.label}</span>
              </div>
            ))}
          </div>
          {m.name === 'LotusMandala' && (
            <div className="mt-4 rounded-xl bg-parchment p-4">
              <p className="text-[11px] text-krishna/60">
                As background watermark (8% opacity):
              </p>
              <div className="relative mt-2 h-32 overflow-hidden rounded-xl bg-parchment">
                <LotusMandala className="absolute inset-0 m-auto h-32 w-32 text-krishna opacity-[0.08]" />
                <p className="relative z-10 p-3 font-devanagari text-sm text-krishna">
                  शास्त्र के शब्द यहाँ बहते हैं
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function VerseCardPreview() {
  const samples: Array<{
    source: 'gita' | 'mahabharata' | 'bhagavata';
    refLabel: string;
    sanskrit: string;
    hindi: string;
    english: string;
    showFooter: boolean;
  }> = [
    {
      source: 'gita',
      refLabel: 'भगवद्गीता 2.47',
      sanskrit: 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।',
      hindi: 'तेरा अधिकार केवल कर्म पर है, फलों पर कभी नहीं।',
      english: 'You have a right to action alone, never to its fruits.',
      showFooter: false,
    },
    {
      source: 'mahabharata',
      refLabel: 'महाभारत द्रोण पर्व 38',
      sanskrit: '',
      hindi: 'धर्म वही है जो विपत्ति में भी न डगमगाए।',
      english: 'Dharma is what does not waver even in adversity.',
      showFooter: true,
    },
    {
      source: 'bhagavata',
      refLabel: 'श्रीमद्भागवत 10.29.7',
      sanskrit: '',
      hindi: 'जब बाँसुरी का स्वर वन में गूँजा, गोपियाँ सब कुछ छोड़कर दौड़ पड़ीं।',
      english:
        'When the flute rang through the forest, the gopis left everything and ran.',
      showFooter: true,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {samples.map((s) => (
        <article
          key={s.source}
          className="rounded-2xl border border-brass/40 bg-parchment px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className={
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
                SOURCE_BADGE_CLASSES[s.source]
              }
              aria-label={SOURCE_BADGE_LABEL[s.source].aria}
            >
              {SOURCE_BADGE_LABEL[s.source].short.hi}
            </span>
            <span className="font-serif text-xs text-krishna/80">
              {s.refLabel}
            </span>
          </div>
          {s.sanskrit && (
            <p className="font-serif text-base leading-relaxed text-krishna">
              {s.sanskrit}
            </p>
          )}
          <p className="mt-1.5 font-devanagari text-sm leading-relaxed text-krishna">
            {s.hindi}
          </p>
          <p className="mt-1 font-serif text-sm leading-relaxed text-krishna/80">
            {s.english}
          </p>
          {s.showFooter && (
            <p className="mt-3 border-t border-brass/30 pt-2 font-serif text-[11px] italic text-sacred/70">
              Sanskrit alignment: Phase 9+ audit pending
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
