"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, SafetyCard } from "@/lib/messages";
import { findBannedWord } from "@/lib/badWordFilter";
import { detectLang } from "@/lib/detectLang";
import SevaPaywall from "./SevaPaywall";
import { VerseCardList } from "./VerseCard";
import Bansuri from "./motifs/Bansuri";
import LotusMandala from "./motifs/LotusMandala";
import PeacockFeather from "./motifs/PeacockFeather";

const ONBOARDING_OPTIONS = [
  "मन थोड़ा भारी है",
  "कुछ समझ नहीं आ रहा",
  "बस किसी से बात करनी है",
];

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  useEffect(() => {
    fetch("/api/onboarding-state")
      .then((r) => r.json())
      .then((d) => setIsFirstTime(d.isFirstTime === true))
      .catch(() => setIsFirstTime(false));
  }, []);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || isSending) return;
    if (findBannedWord(text)) return; // defense in depth — submit is also disabled in UI

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    if (isFirstTime) setIsFirstTime(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const reply: string = data.reply ?? "Something went quiet. Try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          paywall: data.paywall === true,
          tiers: Array.isArray(data.tiers) ? data.tiers : undefined,
          verses: Array.isArray(data.verses) ? data.verses : undefined,
          safety_card:
            data.safety_card && typeof data.safety_card === "object"
              ? (data.safety_card as SafetyCard)
              : undefined,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I couldn't reach the guide. Please try again.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handlePaywallSuccess(messageId: string) {
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === messageId ? { ...m, paywall: false, tiers: undefined } : m,
      ),
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "तुम्हारी सेवा स्वीकार है, मित्र।\nजब मन में जो उठे, फिर से कहो — मैं यहीं हूँ।",
      },
    ]);
  }

  const isEmpty = messages.length === 0 && !isSending;
  const bannedWord = findBannedWord(input);

  return (
    <main className="relative flex h-full flex-1 flex-col">
      {/* Step 2.5.6 atmosphere — single low-opacity lotus mandala
          centered behind content. pointer-events-none so it never
          intercepts clicks; aria-hidden so screen readers skip it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <LotusMandala className="h-[80vh] max-h-[720px] w-auto text-krishna opacity-[0.06]" />
      </div>

      <header className="relative z-10 border-b border-brass/30 bg-parchment/70 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
        <div className="mx-auto flex max-w-[600px] items-center justify-center gap-3">
          <PeacockFeather
            className="h-12 w-auto shrink-0"
            width={48}
            height={48}
            priority
          />
          <div className="text-center">
            <h1 className="font-serif text-2xl font-medium leading-none tracking-tight sm:text-3xl">
              <span className="text-peacock">Krishna</span>
              <span className="text-sacred"> AI</span>
            </h1>
            <p className="mt-1 font-devanagari text-xs leading-snug text-krishna/70 sm:text-sm">
              एक शांत जगह, जहाँ आप अपनी बात कह सकते हैं
            </p>
          </div>
        </div>
      </header>

      {/* Step 2.5.7 disclaimer — bumped to text-sm (was text-[10px]/[11px]),
          colored text-brass-dark for AA contrast on parchment, sits
          directly under the header without scrolling. */}
      <div className="relative z-10 border-b border-brass/30 bg-parchment/40 px-4 py-2.5 text-center backdrop-blur">
        <p className="mx-auto max-w-[600px] text-sm leading-snug text-brass-dark">
          <span className="font-devanagari">
            यह AI शास्त्र-आधारित कृष्ण रूप का अभिनय कर रहा है, दैवीय मार्गदर्शन नहीं।
          </span>
          <span aria-hidden className="mx-1.5 text-brass">·</span>
          <span className="font-serif italic">
            This is an AI roleplaying Krishna based on scripture, not divine guidance.
          </span>
        </p>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
          {isEmpty && (
            <div className="fade-up flex flex-col items-center gap-4 pt-6 sm:pt-10">
              <p className="text-center font-devanagari text-base italic leading-relaxed text-krishna/70 sm:text-lg">
                आज मन कैसा लग रहा है…
              </p>
              {isFirstTime === true && (
                <div className="mt-2 flex w-full flex-col gap-2">
                  {ONBOARDING_OPTIONS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => sendMessage(text)}
                      className="rounded-2xl border border-brass/30 bg-parchment px-4 py-3 text-left font-devanagari text-sm leading-relaxed text-krishna shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:bg-devotional/10 hover:ring-2 hover:ring-devotional/30"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <MessageCard
              key={m.id}
              message={m}
              userLang={resolveUserLang(messages, i)}
              onPaywallSuccess={() => handlePaywallSuccess(m.id)}
            />
          ))}
          {isSending && (
            <p className="fade-up text-center font-devanagari text-sm italic text-krishna/60">
              सोच रहा हूँ...
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="relative z-10 border-t border-brass/30 bg-parchment/70 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto w-full max-w-[600px]">
          {bannedWord && (
            <p
              role="status"
              className="mb-2 text-center text-xs text-sacred"
            >
              कृपया उचित भाषा का प्रयोग करें · Please use respectful language
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <Bansuri
              aria-hidden
              className="hidden h-5 w-auto shrink-0 text-brass-dark sm:block"
            />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="मन में जो है, कहो…"
              disabled={isSending}
              aria-invalid={bannedWord !== null}
              className="flex-1 rounded-full border border-brass/40 bg-parchment px-5 py-3 font-devanagari text-sm text-krishna shadow-[0_1px_3px_rgba(0,0,0,0.04)] placeholder:text-krishna/40 focus:border-devotional focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-sacred"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim() || bannedWord !== null}
              className="rounded-full bg-krishna px-5 py-3 font-serif text-sm font-medium text-parchment shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-colors hover:bg-krishna/90 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

// Walk back from index `i` to the most recent user message and
// detect its language. Used to label verse cards in the language
// the user wrote in (locked decision #12 — Krishna replies match
// user's input language, so the verse cards should too).
function resolveUserLang(
  messages: Message[],
  i: number,
): "hi" | "en" {
  for (let j = i; j >= 0; j--) {
    if (messages[j].role === "user") {
      return detectLang(messages[j].content);
    }
  }
  return "hi"; // default before any user message exists
}

function MessageCard({
  message,
  userLang,
  onPaywallSuccess,
}: {
  message: Message;
  userLang: "hi" | "en";
  onPaywallSuccess: () => void;
}) {
  const isUser = message.role === "user";
  const hasVerses =
    !isUser && Array.isArray(message.verses) && message.verses.length > 0;
  const showPaywall =
    !isUser &&
    message.paywall === true &&
    Array.isArray(message.tiers) &&
    message.tiers.length > 0;
  // Pick font from this message's OWN content language. Krishna's
  // first-time greeting is always Hindi even when the user wrote
  // English, so userLang (used for verse-card labels) is the wrong
  // signal for the body font.
  const contentLang = detectLang(message.content);
  return (
    <div
      className={
        "fade-up rounded-2xl border px-4 py-3 text-sm leading-relaxed text-krishna shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] " +
        (isUser
          ? "border-brass/20 bg-parchment/95"
          : "border-brass/40 bg-parchment")
      }
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-brass-dark">
        {isUser ? "You" : "Messenger"}
      </p>
      <p
        className={
          "whitespace-pre-wrap leading-relaxed " +
          (contentLang === "hi" ? "font-devanagari" : "font-serif")
        }
      >
        {message.content}
      </p>
      {hasVerses && <VerseCardList verses={message.verses!} lang={userLang} />}
      {!isUser && message.safety_card && (
        <SafetyCardView card={message.safety_card} />
      )}
      {showPaywall && (
        <SevaPaywall tiers={message.tiers!} onSuccess={onPaywallSuccess} />
      )}
    </div>
  );
}

function SafetyCardView({ card }: { card: SafetyCard }) {
  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 leading-relaxed text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Support · सहारा
      </p>
      <p className="mb-2 text-sm font-medium text-zinc-900">{card.title}</p>
      <p className="mb-3 text-sm text-zinc-700">{card.body}</p>
      <div className="flex flex-wrap gap-2">
        {card.helplines.map((h) => (
          <a
            key={h.number}
            href={`tel:${h.number.replace(/[^0-9+]/g, "")}`}
            className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all hover:bg-stone-100 hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)]"
          >
            <span aria-hidden className="text-lg leading-none">📞</span>
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {h.label}
              </span>
              <span className="text-base font-semibold text-zinc-900">
                {h.number}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

