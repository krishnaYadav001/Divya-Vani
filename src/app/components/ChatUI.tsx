"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, VerseCitation, SafetyCard } from "@/lib/messages";
import { findBannedWord } from "@/lib/badWordFilter";
import SevaPaywall from "./SevaPaywall";

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
    <div className="flex h-full flex-1 flex-col">
      <header className="border-b border-black/5 bg-white/50 px-6 py-4 backdrop-blur sm:py-5">
        <div className="mx-auto max-w-[600px] text-center">
          <h1 className="text-lg font-medium tracking-tight text-zinc-900 sm:text-xl">
            Krishna AI
          </h1>
          <p className="mt-1 text-xs text-zinc-600 sm:text-sm">
            एक शांत जगह, जहाँ आप अपनी बात कह सकते हैं
          </p>
        </div>
      </header>

      <div className="border-b border-black/5 bg-white/30 px-4 py-2 text-center text-[10px] leading-snug text-zinc-600 backdrop-blur sm:text-[11px]">
        <p className="mx-auto max-w-[600px]">
          यह AI है जो शास्त्रों के आधार पर श्रीकृष्ण की भूमिका निभा रहा है। यह दिव्य मार्गदर्शन नहीं है।
          <span className="mx-1.5 text-zinc-400">·</span>
          This is an AI roleplaying Krishna based on scripture, not divine guidance.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
          {isEmpty && (
            <div className="fade-up flex flex-col items-center gap-4 pt-6 sm:pt-10">
              <p className="text-center text-base italic text-zinc-600 sm:text-lg">
                आज मन कैसा लग रहा है…
              </p>
              {isFirstTime === true && (
                <div className="mt-2 flex w-full flex-col gap-2">
                  {ONBOARDING_OPTIONS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => sendMessage(text)}
                      className="rounded-2xl bg-white px-4 py-3 text-left text-sm text-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:bg-amber-50"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              onPaywallSuccess={() => handlePaywallSuccess(m.id)}
            />
          ))}
          {isSending && (
            <p className="fade-up text-center text-sm italic text-zinc-500">
              सोच रहा हूँ...
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-black/5 bg-white/60 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto w-full max-w-[600px]">
          {bannedWord && (
            <p
              role="status"
              className="mb-2 text-center text-xs text-amber-700"
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
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="जो मन में है… यहाँ लिख सकते हैं"
              disabled={isSending}
              aria-invalid={bannedWord !== null}
              className="flex-1 rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-amber-300"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim() || bannedWord !== null}
              className="rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageCard({
  message,
  onPaywallSuccess,
}: {
  message: Message;
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
  return (
    <div
      className={
        "fade-up rounded-2xl px-4 py-3 text-sm leading-relaxed text-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] " +
        (isUser ? "bg-white" : "bg-amber-50/60")
      }
    >
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {isUser ? "You" : "Messenger"}
      </p>
      <p className="whitespace-pre-wrap">{message.content}</p>
      {hasVerses && <VerseCardList verses={message.verses!} />}
      {!isUser && message.safety_card && (
        <SafetyCardView card={message.safety_card} />
      )}
      {showPaywall && (
        <SevaPaywall tiers={message.tiers!} onSuccess={onPaywallSuccess} />
      )}
    </div>
  );
}

function formatRef(ref: string): string {
  const m = ref.match(/^gita_(\d+)\.(\d+)(?:_(\d+))?$/);
  if (!m) return ref;
  const [, ch, v, range] = m;
  return range
    ? `भगवद् गीता ${ch}.${v}–${range}`
    : `भगवद् गीता ${ch}.${v}`;
}

function VerseCardList({ verses }: { verses: VerseCitation[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {verses.map((v) => (
        <VerseCard key={v.reference} verse={v} />
      ))}
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

function VerseCard({ verse }: { verse: VerseCitation }) {
  const [expanded, setExpanded] = useState(false);
  const label = formatRef(verse.reference);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-amber-50"
      >
        <span aria-hidden>📖</span>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="mt-1 w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-700">📖 {label}</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
          aria-label="Close verse"
          className="text-xs text-zinc-400 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 space-y-2 leading-relaxed">
        <p className="whitespace-pre-wrap text-base text-zinc-900">
          {verse.sanskrit}
        </p>
        {verse.transliteration && (
          <p className="whitespace-pre-wrap text-xs italic text-zinc-500">
            {verse.transliteration}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm text-zinc-800">
          {verse.hindi}
        </p>
        <p className="whitespace-pre-wrap text-sm text-zinc-700">
          {verse.english}
        </p>
      </div>
    </div>
  );
}
