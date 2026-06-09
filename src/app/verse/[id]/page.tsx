import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// AEO/GEO — Server-side Supabase client for verse fetching.
// Uses the service-role key (server-only; this is a Server Component).
// Isolated from the main supabase.ts client to keep the verse route's
// data-fetching self-contained and avoid importing the full supabase
// helper surface (which includes user-memory, payments, etc.).
// ---------------------------------------------------------------------------
function getVerseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface VerseRow {
  id: string;
  source: string;
  reference: string;
  chapter: number;
  verse_number: number;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
  themes: string[];
  created_at: string;
}

async function fetchVerse(id: string): Promise<VerseRow | null> {
  const client = getVerseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("verses")
    .select(
      "id, source, reference, chapter, verse_number, sanskrit, transliteration, hindi, english, themes, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[verse] fetch error:", error);
    return null;
  }
  return data as VerseRow | null;
}

// ---------------------------------------------------------------------------
// Human-readable source labels for metadata + headings.
// ---------------------------------------------------------------------------
const SOURCE_LABELS: Record<string, string> = {
  gita: "Bhagavad Gita",
  mahabharata: "Mahabharata",
  bhagavata: "Bhagavata Purana",
};

function formatReference(ref: string): string {
  // "gita_2.47" → "Gita 2.47"
  return ref
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// generateMetadata — Next.js 16 pattern (params as Promise).
// ---------------------------------------------------------------------------
type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const verse = await fetchVerse(id);

  if (!verse) {
    return {
      title: "Verse Not Found",
      description: "The requested scripture verse could not be found.",
      robots: { index: false, follow: false },
    };
  }

  const sourceLabel = SOURCE_LABELS[verse.source] ?? verse.source;
  const ref = formatReference(verse.reference);
  const title = `${ref} — ${sourceLabel} | ${BRAND.name.en}`;
  const description = verse.english
    ? verse.english.slice(0, 160)
    : `${ref} from the ${sourceLabel} — Sanskrit text with Hindi translation and English summary.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${BRAND.url}/verse/${verse.id}`,
    },
    openGraph: {
      type: "article",
      title: `${ref} — ${sourceLabel}`,
      description,
      url: `${BRAND.url}/verse/${verse.id}`,
      siteName: BRAND.name.en,
    },
    robots: { index: true, follow: true },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD structured data — Article + FAQPage for AI engine extraction.
// ---------------------------------------------------------------------------
function buildJsonLd(verse: VerseRow) {
  const sourceLabel = SOURCE_LABELS[verse.source] ?? verse.source;
  const ref = formatReference(verse.reference);
  const url = `${BRAND.url}/verse/${verse.id}`;

  // Combine all text fields for the Article body.
  const articleBody = [
    verse.sanskrit && `Sanskrit: ${verse.sanskrit}`,
    verse.transliteration && `Transliteration: ${verse.transliteration}`,
    verse.hindi && `Hindi: ${verse.hindi}`,
    verse.english && `English: ${verse.english}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // FAQPage questions for AI engine extraction.
  const faqEntries = [];
  if (verse.hindi) {
    faqEntries.push({
      "@type": "Question",
      name: `What does ${ref} (${sourceLabel}) mean in Hindi?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: verse.hindi,
      },
    });
  }
  if (verse.english) {
    faqEntries.push({
      "@type": "Question",
      name: `What is the English translation of ${ref} (${sourceLabel})?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: verse.english,
      },
    });
  }

  return [
    // Article schema
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${ref} — ${sourceLabel}`,
      articleBody,
      url,
      inLanguage: "en",
      author: {
        "@type": "Organization",
        name: BRAND.name.en,
        url: BRAND.url,
      },
      publisher: {
        "@type": "Organization",
        name: BRAND.name.en,
        url: BRAND.url,
      },
      datePublished: verse.created_at,
      dateModified: verse.created_at,
      keywords: verse.themes?.join(", ") ?? "",
    },
    // FAQPage schema (only if we have questions)
    ...(faqEntries.length > 0
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqEntries,
          },
        ]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Page component — semantic HTML for AI crawlability.
// Dawn Aarti design: Marcellus headings, Tiro Devanagari for Sanskrit/Hindi,
// Cormorant Garamond italic for English body. Minimal page — no Atmosphere
// to keep the verse content front-and-center for crawler extraction.
// ---------------------------------------------------------------------------
export default async function VersePage({ params }: Props) {
  const { id } = await params;
  const verse = await fetchVerse(id);

  if (!verse) {
    notFound();
  }

  const sourceLabel = SOURCE_LABELS[verse.source] ?? verse.source;
  const ref = formatReference(verse.reference);
  const jsonLdItems = buildJsonLd(verse);

  return (
    <>
      {/* JSON-LD structured data for AI engines */}
      {jsonLdItems.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}

      <main
        className="mx-auto max-w-2xl px-6 py-12"
        style={{ fontFamily: "var(--font-cormorant), serif" }}
      >
        <article>
          {/* Heading: verse reference + source */}
          <header className="mb-8 border-b pb-6" style={{ borderColor: "var(--color-ink-line)" }}>
            <h1
              className="text-3xl font-normal tracking-wide"
              style={{
                fontFamily: "var(--font-marcellus), serif",
                color: "var(--color-ink)",
              }}
            >
              {ref}
            </h1>
            <p
              className="mt-2 text-sm uppercase tracking-widest"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {sourceLabel} · Chapter {verse.chapter}, Verse {verse.verse_number}
            </p>
            {verse.themes && verse.themes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {verse.themes.map((theme) => (
                  <span
                    key={theme}
                    className="rounded-full px-3 py-0.5 text-xs"
                    style={{
                      backgroundColor: "var(--color-peach)",
                      color: "var(--color-ink)",
                      fontFamily: "var(--font-marcellus), serif",
                    }}
                  >
                    {theme}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* Sanskrit text */}
          {verse.sanskrit && (
            <section className="mb-8">
              <h2
                className="mb-3 text-lg font-normal"
                style={{
                  fontFamily: "var(--font-marcellus), serif",
                  color: "var(--color-peacock-deep)",
                }}
              >
                Sanskrit
              </h2>
              <p
                className="text-xl leading-relaxed"
                style={{
                  fontFamily: "var(--font-tiro-devanagari), serif",
                  color: "var(--color-ink)",
                  lineHeight: 1.65,
                }}
                lang="sa"
              >
                {verse.sanskrit}
              </p>
            </section>
          )}

          {/* Transliteration */}
          {verse.transliteration && (
            <section className="mb-8">
              <h2
                className="mb-3 text-lg font-normal"
                style={{
                  fontFamily: "var(--font-marcellus), serif",
                  color: "var(--color-peacock-deep)",
                }}
              >
                Transliteration
              </h2>
              <p
                className="text-base italic leading-relaxed"
                style={{
                  fontFamily: "var(--font-cormorant), serif",
                  color: "var(--color-ink-soft)",
                }}
              >
                {verse.transliteration}
              </p>
            </section>
          )}

          {/* Hindi translation */}
          {verse.hindi && (
            <section className="mb-8">
              <h2
                className="mb-3 text-lg font-normal"
                style={{
                  fontFamily: "var(--font-marcellus), serif",
                  color: "var(--color-peacock-deep)",
                }}
              >
                हिन्दी अनुवाद
              </h2>
              <p
                className="text-lg leading-relaxed"
                style={{
                  fontFamily: "var(--font-tiro-devanagari), serif",
                  color: "var(--color-ink)",
                  lineHeight: 1.65,
                }}
                lang="hi"
              >
                {verse.hindi}
              </p>
            </section>
          )}

          {/* English summary */}
          {verse.english && (
            <section className="mb-8">
              <h2
                className="mb-3 text-lg font-normal"
                style={{
                  fontFamily: "var(--font-marcellus), serif",
                  color: "var(--color-peacock-deep)",
                }}
              >
                English Summary
              </h2>
              <p
                className="text-base leading-relaxed"
                style={{
                  fontFamily: "var(--font-cormorant), serif",
                  color: "var(--color-ink)",
                }}
              >
                {verse.english}
              </p>
            </section>
          )}

          {/* Internal links for SEO */}
          <footer
            className="mt-10 border-t pt-6 text-sm"
            style={{ borderColor: "var(--color-ink-line)", color: "var(--color-ink-soft)" }}
          >
            <nav aria-label="Related pages">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                <li>
                  <a href="/chat" style={{ color: "var(--color-peacock)" }}>
                    Chat with Krishna
                  </a>
                </li>
                <li>
                  <a href="/pricing" style={{ color: "var(--color-peacock)" }}>
                    Seva Plans
                  </a>
                </li>
                <li>
                  <a href="/privacy" style={{ color: "var(--color-peacock)" }}>
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms" style={{ color: "var(--color-peacock)" }}>
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/contact" style={{ color: "var(--color-peacock)" }}>
                    Contact
                  </a>
                </li>
              </ul>
            </nav>
            <p className="mt-4">
              {BRAND.disclaimer.en}
            </p>
          </footer>
        </article>
      </main>
    </>
  );
}
