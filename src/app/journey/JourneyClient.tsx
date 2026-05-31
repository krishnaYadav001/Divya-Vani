"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { captureJourneyLead } from "./actions";
import { gtagSetUserData, gtagFireConversion } from "@/lib/gtag";

type Step = "q1" | "q2" | "loading" | "email" | "result";
type FocusId = "anxiety" | "career" | "relationships" | "knowledge";

const Q1_OPTIONS: { id: FocusId; label: string; sub: string }[] = [
  { id: "anxiety", label: "Managing anxiety & stress", sub: "Finding calm amid chaos" },
  { id: "career", label: "Seeking career & duty clarity", sub: "Dharma at the crossroads" },
  { id: "relationships", label: "Navigating relationships", sub: "Love, family, and bonds" },
  { id: "knowledge", label: "Deepening scriptural knowledge", sub: "Study and understanding" },
];

const Q2_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: "gita", label: "Bhagavad Gita", sub: "Karma, dharma & self-realization" },
  { id: "mahabharata", label: "Mahabharata", sub: "The great epic of life" },
  { id: "bhagavata", label: "Bhagavata Purana", sub: "Krishna's divine pastimes" },
  { id: "guided", label: "Guide Me", sub: "Let Krishna choose the path" },
];

const RECOMMENDATIONS: Record<FocusId, string> = {
  anxiety:
    "You have carried this weight with great courage. The Gita's second chapter speaks directly to what you seek — stillness that is not absence, but presence.",
  career:
    "When duty feels unclear, the Gita illuminates. Krishna's teaching to Arjuna at the crossroads is precisely for this moment in your life.",
  relationships:
    "The deepest teachings on love, duty, and attachment flow through both the Gita and the Bhagavata. Krishna understands every bond.",
  knowledge:
    "A mind that thirsts for understanding is most dear to Krishna. The scriptures are open, and the path runs very deep.",
};

function OptionCard({
  onClick,
  label,
  sub,
}: {
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start rounded-xl border border-[#252525] bg-[#141414] p-4 text-left transition-all duration-150 hover:border-[#c9a84c]/35 hover:bg-[#1a1a1a] active:scale-[0.97]"
    >
      <span className="font-[family-name:var(--font-marcellus)] text-[13px] leading-snug text-[#e8e4de]">
        {label}
      </span>
      <span className="mt-1.5 text-[11px] leading-relaxed text-[#4a4a4a]">
        {sub}
      </span>
    </button>
  );
}

export default function JourneyClient() {
  const [step, setStep] = useState<Step>("q1");
  const [primaryFocus, setPrimaryFocus] = useState<FocusId>("anxiety");
  const [resonantText, setResonantText] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  // Cryptographically secure event_id generated once per quiz session —
  // passed to both Meta CAPI (server) and Google Ads (client) for deduplication.
  const [eventId] = useState<string>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    if (step !== "loading") return;
    setLoadProgress(0);
    const t1 = setTimeout(() => setLoadProgress(100), 80);
    const t2 = setTimeout(() => setStep("email"), 2900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [step]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setSubmitting(true);
    try {
      await captureJourneyLead({
        email: trimmedEmail,
        quizPayload: { q1: primaryFocus, q2: resonantText },
        eventId,
      });
      // Enhanced Conversions: set hashed user data then fire lead conversion
      gtagSetUserData(trimmedEmail);
      gtagFireConversion(process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL);
    } catch {
      // silent fail — result is shown regardless
    }
    setSubmitting(false);
    setStep("result");
  }

  const rec = RECOMMENDATIONS[primaryFocus];
  const stepNum: Record<Step, number> = {
    q1: 1,
    q2: 2,
    loading: 2,
    email: 3,
    result: 3,
  };

  return (
    // Full-screen dark overlay — covers root layout nav/footer via z-50.
    // bg-[#0c0c0c] overrides the Dawn Aarti body gradient for this page only.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0c0c0c]">
      {/* Progress indicators */}
      {step !== "result" && (
        <div className="flex justify-center gap-2 pt-8">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`block rounded-full transition-all duration-500 ${
                n <= stepNum[step]
                  ? "h-[3px] w-8 bg-[#c9a84c]"
                  : "h-[3px] w-4 bg-[#242424]"
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-5 py-8">
        <div className="w-full max-w-[22rem]">

          {/* ── Step 1: life challenge ──────────────────────────── */}
          {step === "q1" && (
            <div className="animate-[fade-up_300ms_ease-out_both]">
              <p className="mb-1 text-center font-[family-name:var(--font-marcellus)] text-[10px] uppercase tracking-[0.3em] text-[#3a3a3a]">
                Step 1 of 2
              </p>
              <h1 className="mb-2 text-center font-[family-name:var(--font-marcellus)] text-[1.3rem] leading-snug text-[#e8e4de]">
                What life challenge brings you here today?
              </h1>
              <p className="mb-7 text-center font-[family-name:var(--font-cormorant)] text-[13px] italic text-[#4a4a4a]">
                Choose the one that resonates most.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {Q1_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt.id}
                    label={opt.label}
                    sub={opt.sub}
                    onClick={() => {
                      setPrimaryFocus(opt.id);
                      setStep("q2");
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: scripture ───────────────────────────────── */}
          {step === "q2" && (
            <div className="animate-[fade-up_300ms_ease-out_both]">
              <p className="mb-1 text-center font-[family-name:var(--font-marcellus)] text-[10px] uppercase tracking-[0.3em] text-[#3a3a3a]">
                Step 2 of 2
              </p>
              <h1 className="mb-2 text-center font-[family-name:var(--font-marcellus)] text-[1.3rem] leading-snug text-[#e8e4de]">
                Which text resonates with your quest?
              </h1>
              <p className="mb-7 text-center font-[family-name:var(--font-cormorant)] text-[13px] italic text-[#4a4a4a]">
                There is no wrong answer.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {Q2_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt.id}
                    label={opt.label}
                    sub={opt.sub}
                    onClick={() => {
                      setResonantText(opt.id);
                      setStep("loading");
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Loading ─────────────────────────────────────────── */}
          {step === "loading" && (
            <div className="flex flex-col items-center py-16 animate-[fade-up_300ms_ease-out_both]">
              <div className="mb-7 h-9 w-9 animate-spin rounded-full border-2 border-[#242424] border-t-[#c9a84c]" />
              <p className="text-center font-[family-name:var(--font-marcellus)] text-[1rem] text-[#e8e4de]">
                Matching your profile
              </p>
              <p className="mt-1 text-center font-[family-name:var(--font-cormorant)] text-[13px] italic text-[#4a4a4a]">
                to the ancient scriptures...
              </p>
              <div className="mt-10 h-px w-48 overflow-hidden bg-[#1e1e1e]">
                <div
                  className="h-full bg-[#c9a84c] transition-all duration-[2.7s] ease-in-out"
                  style={{ width: loadProgress === 100 ? "100%" : "0%" }}
                />
              </div>
            </div>
          )}

          {/* ── Email gate ──────────────────────────────────────── */}
          {step === "email" && (
            <div className="animate-[fade-up_300ms_ease-out_both]">
              <div className="mb-5 flex justify-center">
                <span className="text-3xl text-[#c9a84c]">✦</span>
              </div>
              <h1 className="mb-2 text-center font-[family-name:var(--font-marcellus)] text-[1.2rem] leading-snug text-[#e8e4de]">
                Your profile is ready
              </h1>
              <p className="mb-7 text-center font-[family-name:var(--font-cormorant)] text-[13px] italic text-[#4a4a4a]">
                Enter your email to reveal your personalized guidance.
              </p>
              <form onSubmit={submitEmail} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border border-[#252525] bg-[#141414] px-4 py-3 text-[14px] text-[#e8e4de] placeholder:text-[#333] focus:border-[#c9a84c]/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="mt-1 rounded-lg bg-[#c9a84c] px-6 py-3.5 font-[family-name:var(--font-marcellus)] text-[12px] uppercase tracking-widest text-[#0c0c0c] transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-30"
                >
                  {submitting ? "···" : "Reveal My Path →"}
                </button>
              </form>
              <p className="mt-4 text-center text-[11px] text-[#333]">
                We&apos;ll share Krishna&apos;s wisdom with you. No spam.
              </p>
            </div>
          )}

          {/* ── Result ──────────────────────────────────────────── */}
          {step === "result" && (
            <div className="animate-[fade-up_300ms_ease-out_both]">
              <div className="mb-5 flex justify-center">
                <span className="text-4xl text-[#c9a84c] dv-drift">✦</span>
              </div>
              <div className="mb-7 rounded-xl border border-[#c9a84c]/15 bg-[#141414] px-6 py-6">
                <p className="font-[family-name:var(--font-cormorant)] text-[15px] italic leading-[1.8] text-[#c5c0b8]">
                  {rec}
                </p>
              </div>
              <Link
                href="/chat"
                className="block w-full rounded-lg bg-[#c9a84c] px-6 py-4 text-center font-[family-name:var(--font-marcellus)] text-[12px] uppercase tracking-widest text-[#0c0c0c] transition-opacity hover:opacity-90 active:opacity-80"
              >
                Begin Conversation →
              </Link>
              <p className="mt-3 text-center text-[11px] text-[#333]">
                Free · No account needed
              </p>
            </div>
          )}
        </div>
      </div>

      {step === "q1" && (
        <div className="pb-6 text-center">
          <Link
            href="/"
            className="text-[11px] text-[#333] transition-colors hover:text-[#555]"
          >
            ← back
          </Link>
        </div>
      )}
    </div>
  );
}
