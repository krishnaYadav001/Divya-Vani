"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Message, SafetyCard } from "@/lib/messages";
import { findBannedWord } from "@/lib/badWordFilter";
import { detectLang } from "@/lib/detectLang";
import { getTiersInOrder } from "@/lib/seva";
import { clearSession, loadSession, saveSession } from "@/lib/chatStorage";
import { BRAND } from "@/lib/brand";

// Phase 6.9.1 — split-color brand spans derive their text from BRAND
// rather than hardcoding "Divya" / "Vani". The brand name is a 2-word
// string; if a future rename produces a different word count, the
// rest.join(" ") fallback still renders the full name (just with all
// non-first words sharing the second color).
const [BRAND_HEAD, ...BRAND_TAIL] = BRAND.name.en.split(" ");
import DiyaSevaPanel from "./DiyaSevaPanel";
import SevaPaywall from "./SevaPaywall";
import { VerseCardList } from "./VerseCard";
import Bansuri from "./motifs/Bansuri";
import DiyaIcon from "./motifs/DiyaIcon";
import LotusMandala from "./motifs/LotusMandala";
import PeacockFeather from "./motifs/PeacockFeather";

const ONBOARDING_OPTIONS = [
  "मन थोड़ा भारी है",
  "कुछ समझ नहीं आ रहा",
  "बस किसी से बात करनी है",
];

// Phase 5.4 — static tier list for the diya seva panel. TIER_CONFIG is a
// frozen const so this is computed once at module load (avoids handing
// the panel a fresh array on every render and triggering useless work).
const TIERS = getTiersInOrder();

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  // Phase 5.4 — diya seva panel visibility + counter state. counterState
  // seeds from /api/me on mount and updates from each chat response's
  // message_count + seva_balance fields (both streaming meta frames and
  // plain-JSON paths). The panel reads these as props.
  const [isDiyaOpen, setIsDiyaOpen] = useState(false);
  const [counterState, setCounterState] = useState<{
    message_count: number;
    seva_balance: number;
  }>({ message_count: 0, seva_balance: 0 });
  // Phase 6.x — disclaimer starts expanded on mount, auto-collapses to a
  // chip after 5s. Re-arms whenever the user re-expands by tapping the
  // chip, so each expansion gets its own 5s read window before collapsing.
  // Locked decision #1 ("permanent visible disclaimer bar near avatar")
  // is satisfied by the chip — the disclaimer surface stays present, just
  // compacted; tap surfaces the full text in the same position.
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(true);
  // Phase 6.8 — userId comes from /api/me on mount and scopes the
  // localStorage chat-history key. The god_messenger_uid cookie itself
  // is HttpOnly so the value has to round-trip through the server to
  // become readable here. priorUserIdRef catches the rare case of cookie
  // rotation (different identity returned on a later /api/me call) so
  // the previous identity's history doesn't bleed into the new session.
  // sentryReportedRef ensures we capture localStorage write failures
  // at most once per session — the persistence effect runs frequently
  // and we don't want to spam Sentry on a quota-bound device.
  const [userId, setUserId] = useState<string | null>(null);
  const priorUserIdRef = useRef<string | null>(null);
  const sentryReportedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Phase 5.5 — auto-grow the chat textarea up to ~6 lines, then scroll
  // internally past that. height: auto on every change resets layout so
  // scrollHeight reflects content size; we then clamp + toggle overflow.
  // Caps at 144px (~6 × 24px line-height for text-base + leading-normal).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 144;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  // Phase 6.x — re-arm the auto-collapse timer every time disclaimerExpanded
  // flips back to true. Mount fires once with true → 5s → false. Tapping the
  // chip flips back to true → another 5s → false. Cleanup clears the pending
  // timer if state changes (or component unmounts) before it fires.
  useEffect(() => {
    if (!disclaimerExpanded) return;
    const t = setTimeout(() => setDisclaimerExpanded(false), 5000);
    return () => clearTimeout(t);
  }, [disclaimerExpanded]);

  useEffect(() => {
    fetch("/api/onboarding-state")
      .then((r) => r.json())
      .then((d) => setIsFirstTime(d.isFirstTime === true))
      .catch(() => setIsFirstTime(false));
  }, []);

  // Phase 5.4 — seed the counter on mount so the diya panel shows the
  // right number before any chat turn lands. /api/me silent-fails to
  // {0, 0, 10} for fresh visitors, so this is safe even pre-cookie.
  //
  // Phase 6.8 — also captures user_id (added to /api/me response) and
  // hydrates the message list from localStorage scoped to that id.
  // Hydration only fires once on mount; persistence is handled by a
  // separate effect below that listens to [messages, isSending, userId].
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (
          typeof d.message_count === "number" &&
          typeof d.seva_balance === "number"
        ) {
          setCounterState({
            message_count: d.message_count,
            seva_balance: d.seva_balance,
          });
        }
        const incomingId: string | null =
          typeof d.user_id === "string" ? d.user_id : null;
        if (incomingId) {
          // Cookie rotation guard: if a different identity comes back,
          // wipe the previous identity's persisted history before the
          // new hydrate. Practically never fires — cookie is 1y with
          // no rotation logic — but cheap insurance.
          if (
            priorUserIdRef.current &&
            priorUserIdRef.current !== incomingId
          ) {
            clearSession(priorUserIdRef.current);
          }
          priorUserIdRef.current = incomingId;
          setUserId(incomingId);
          const restored = loadSession(incomingId);
          if (restored && restored.length > 0) {
            setMessages(restored);
          }
        }
      })
      .catch(() => {
        /* silent — counter stays at 0/0 until first chat response */
      });
  }, []);

  // Phase 6.8 — persist messages to localStorage on turn boundaries.
  // The isSending guard skips writes during streaming (a 100-delta turn
  // would otherwise produce 100 stringify+write cycles); we only persist
  // once a turn fully lands. saveSession itself silent-fails on quota /
  // private-browsing / security-policy errors; we capture once per session
  // via Sentry if it throws (sentryReportedRef avoids spamming).
  useEffect(() => {
    if (!userId) return;
    if (isSending) return;
    if (messages.length === 0) return;
    try {
      saveSession(userId, messages);
    } catch (e) {
      if (!sentryReportedRef.current) {
        sentryReportedRef.current = true;
        import("@sentry/nextjs")
          .then((Sentry) => Sentry.captureException(e))
          .catch(() => {
            /* swallow — Sentry import failure shouldn't surface */
          });
      }
    }
  }, [messages, isSending, userId]);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || isSending) return;
    if (findBannedWord(text)) return; // defense in depth — submit is also disabled in UI

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    // assistantId is allocated up-front so error/abort handlers can
    // check whether a placeholder was already pushed (by reading
    // prev.find(m=>m.id===assistantId) inside a setMessages updater)
    // and append, rather than orphaning a partial reply with a fresh id.
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    if (isFirstTime) setIsFirstTime(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Negotiates the NDJSON streaming response shape from
          // /api/chat. Server falls back to plain JSON for any
          // caller that does not send this header (test scripts,
          // playwright mock). See DUAL-MODE RESPONSE CONTRACT block
          // at the top of src/app/api/chat/route.ts.
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      const isStream =
        contentType.includes("application/x-ndjson") && res.body !== null;

      if (isStream) {
        // ── Streaming branch ──────────────────────────────────────
        // Read response.body as NDJSON. Three frame types:
        //   {type:"text",delta} — append to assistant content
        //   {type:"meta",verses,paywall,safety_card} — final metadata
        //   {type:"error",message} — mid-stream failure; render
        //                            partial reply + inline affordance
        //
        // All state changes go through setMessages((prev) => ...)
        // updaters that derive next-state from prev. No `let`
        // mutations across closure boundaries — keeps the React-19
        // / Next-16 immutability lint rule happy and avoids stale
        // captures in the streaming loop.
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Split on \n; the final element may be a partial line
          // (no trailing newline yet) — keep it in the buffer for
          // the next read.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let frame: Record<string, unknown>;
            try {
              frame = JSON.parse(line) as Record<string, unknown>;
            } catch {
              // Malformed line — skip rather than crash the stream.
              continue;
            }
            // Phase 5.4 — surface message_count + seva_balance from
            // meta frames into counterState in lockstep with the message
            // list update below. Kept here (not inside applyFrameToMessages)
            // so the module-scope helper stays single-purpose.
            if (frame.type === "meta") {
              const mc = frame.message_count;
              const sb = frame.seva_balance;
              if (typeof mc === "number" && typeof sb === "number") {
                setCounterState({ message_count: mc, seva_balance: sb });
              }
            }
            applyFrameToMessages(setMessages, assistantId, frame);
          }
        }
      } else {
        // ── Plain-JSON branch ────────────────────────────────────
        // Hit when server returned application/json — e.g. paywall
        // (no AI call), screenshot mock, or any non-streaming path.
        // Same shape as pre-Phase-3.9.
        const data = await res.json();
        // Phase 5.4 — counter update mirrors the streaming meta-frame
        // path so the diya panel stays in sync regardless of mode.
        if (
          typeof data.message_count === "number" &&
          typeof data.seva_balance === "number"
        ) {
          setCounterState({
            message_count: data.message_count,
            seva_balance: data.seva_balance,
          });
        }
        const reply: string = data.reply ?? "Something went quiet. Try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
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
      }
    } catch {
      // Network failure or non-2xx response. Read whether a partial
      // reply already exists in state (placeholder pushed mid-stream)
      // and either append a "connection dropped" affordance to it,
      // or render a fresh generic error reply.
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        const errLine =
          "_connection dropped — please send your message again._";
        if (idx >= 0) {
          const next = [...prev];
          const cur = next[idx].content;
          next[idx] = {
            ...next[idx],
            content: cur ? `${cur}\n\n${errLine}` : errLine,
          };
          return next;
        }
        return [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "I couldn't reach the guide. Please try again.",
          },
        ];
      });
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

      <header className="relative z-20 border-b border-brass/30 bg-parchment/70 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
        <div className="mx-auto flex max-w-[600px] items-center justify-center gap-3">
          <PeacockFeather
            className="h-12 w-auto shrink-0"
            width={48}
            height={48}
            priority
          />
          <div className="text-center">
            <h1 className="font-serif text-2xl font-medium leading-none tracking-tight sm:text-3xl">
              <span className="text-peacock">{BRAND_HEAD}</span>
              <span className="text-sacred"> {BRAND_TAIL.join(" ")}</span>
            </h1>
            <p className="mt-1 font-devanagari text-xs leading-snug text-krishna/70 sm:text-sm">
              एक शांत जगह, जहाँ आप अपनी बात कह सकते हैं
            </p>
          </div>
        </div>
        {/* Phase 5.4 — diya seva trigger + panel. Wrapper is absolute
            inside the relative header (top-right corner). The panel is
            in turn absolute relative to this wrapper via right-0 top-full,
            so it slides down directly under the icon. */}
        <div className="absolute right-3 top-3 sm:right-5 sm:top-4">
          <button
            type="button"
            aria-label="Seva · सेवा"
            aria-expanded={isDiyaOpen}
            onClick={() => setIsDiyaOpen((prev) => !prev)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-devotional transition-colors hover:bg-devotional/10 focus:outline-none focus:ring-2 focus:ring-devotional/40"
          >
            <DiyaIcon className="h-6 w-6" />
          </button>
          <DiyaSevaPanel
            isOpen={isDiyaOpen}
            onClose={() => setIsDiyaOpen(false)}
            messageCount={counterState.message_count}
            sevaBalance={counterState.seva_balance}
            tiers={TIERS}
            onPurchaseSuccess={(newBalance) => {
              setCounterState((prev) => ({ ...prev, seva_balance: newBalance }));
            }}
          />
        </div>
      </header>

      {/* Phase 6.x disclaimer — collapse-to-chip. Two stacked grid blocks
          cross-fade via grid-template-rows (1fr ↔ 0fr) so height animates
          smoothly without a fixed magic-number max-height. Full bilingual
          bar shows on mount for 5s, then morphs into a centered "ⓘ
          अस्वीकरण · disclaimer" chip; tapping the chip re-expands. Locked
          decision #1 stays satisfied — the chip is permanent and sits in
          the same row directly under the avatar header. */}
      <div className="relative z-10 border-b border-brass/30 bg-parchment/40 px-4 backdrop-blur">
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out ${
            disclaimerExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <p className="mx-auto max-w-[600px] py-2.5 text-center text-sm leading-snug text-brass-dark">
              <span className="font-devanagari">
                यह AI शास्त्र-आधारित कृष्ण रूप का अभिनय कर रहा है, दैवीय मार्गदर्शन नहीं।
              </span>
              <span aria-hidden className="mx-1.5 text-brass">·</span>
              <span className="font-serif italic">
                This is an AI roleplaying Krishna based on scripture, not divine guidance.
              </span>
            </p>
          </div>
        </div>
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out ${
            disclaimerExpanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="flex justify-center overflow-hidden">
            <button
              type="button"
              onClick={() => setDisclaimerExpanded(true)}
              aria-label="Show disclaimer · अस्वीकरण देखें"
              className="my-1 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brass/30 bg-parchment/60 px-3.5 text-xs text-brass-dark transition-colors hover:border-brass/50 hover:bg-parchment/80 focus:outline-none focus:ring-2 focus:ring-brass/40"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                fill="currentColor"
                aria-hidden
              >
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 0 11zM8 6.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 6.5zm0-2a.875.875 0 1 0 0 1.75A.875.875 0 0 0 8 4.5z" />
              </svg>
              <span className="font-devanagari">अस्वीकरण</span>
              <span aria-hidden className="text-brass">·</span>
              <span className="font-serif italic">disclaimer</span>
            </button>
          </div>
        </div>
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
          {isSending && messages[messages.length - 1]?.role === "user" && (
            // Spinner shows from submit until the assistant placeholder
            // is pushed (first text delta in streaming mode, or full
            // response in plain-JSON mode). Once Krishna's bubble appears
            // the bubble itself becomes the "thinking" indicator as it
            // grows token-by-token.
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
            <Bansuri className="hidden h-16 w-auto shrink-0 sm:block" />
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter submits, Shift+Enter inserts newline. Mirrors
                // the ChatGPT/Slack/WhatsApp pattern. Mobile virtual
                // keyboards send the same keydown so the Send button
                // remains the secondary path.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="मन में जो है, कहो…"
              disabled={isSending}
              aria-invalid={bannedWord !== null}
              className="flex-1 resize-none overflow-hidden rounded-3xl border border-brass/40 bg-parchment px-5 py-3 font-devanagari text-base leading-normal text-krishna shadow-[0_1px_3px_rgba(0,0,0,0.04)] placeholder:text-krishna/40 focus:border-devotional focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-sacred"
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
//
// Phase 5.5 — sticky-language: if the most recent user message is
// short/ambiguous (single English word like a name), inherit the
// previous user message's language rather than flipping. detectLang's
// new priorLang arg encodes the threshold.
function resolveUserLang(
  messages: Message[],
  i: number,
): "hi" | "en" {
  let mostRecent = -1;
  for (let j = i; j >= 0; j--) {
    if (messages[j].role === "user") {
      mostRecent = j;
      break;
    }
  }
  if (mostRecent === -1) return "hi"; // no user messages yet

  let priorLang: "hi" | "en" | undefined;
  for (let k = mostRecent - 1; k >= 0; k--) {
    if (messages[k].role === "user") {
      priorLang = detectLang(messages[k].content);
      break;
    }
  }
  return detectLang(messages[mostRecent].content, priorLang);
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
        "fade-up rounded-2xl border px-4 py-3 text-lg leading-relaxed text-krishna shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] " +
        (isUser
          ? "border-brass/20 bg-parchment/95"
          : "border-brass/40 bg-parchment")
      }
    >
      {/* Phase 5.5 — flute icon on Krishna's bubbles ties each reply to
          the persona, parallel to the peacock-feather + bansuri header
          motifs. User bubbles keep the "You" text label. In-flow rather
          than absolute-positioned to dodge clip risk from the chat
          scroll's overflow-y-auto ancestor. */}
      <div className="mb-1 flex items-center">
        {isUser ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-brass-dark">
            You
          </span>
        ) : (
          <Bansuri className="h-5 w-auto" />
        )}
      </div>
      <p
        className={
          "whitespace-pre-wrap leading-relaxed " +
          (contentLang === "hi"
            ? "font-medium font-devanagari"
            : "font-semibold font-serif")
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

// Phase 3.9 streaming-frame dispatcher. Called per NDJSON line during
// the streaming branch of sendMessage. Module-scope helper so React
// doesn't re-allocate it on every render and the immutability lint
// rule sees a clean pure-function shape — every state mutation flows
// through setMessages((prev) => next) updaters that derive next from
// prev, never from a captured `let` variable.
function applyFrameToMessages(
  setMessages: Dispatch<SetStateAction<Message[]>>,
  assistantId: string,
  frame: Record<string, unknown>,
): void {
  const type = frame.type;

  if (type === "text" && typeof frame.delta === "string") {
    const delta = frame.delta;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          content: next[idx].content + delta,
        };
        return next;
      }
      // First delta — push the assistant bubble. The "सोच रहा हूँ..."
      // spinner stops as soon as this lands (it gates on last
      // message.role === "user").
      return [
        ...prev,
        { id: assistantId, role: "assistant", content: delta },
      ];
    });
    return;
  }

  if (type === "meta") {
    setMessages((prev) => {
      const updates: Partial<Message> = {
        paywall: frame.paywall === true,
        verses: Array.isArray(frame.verses)
          ? (frame.verses as Message["verses"])
          : undefined,
        safety_card:
          frame.safety_card && typeof frame.safety_card === "object"
            ? (frame.safety_card as SafetyCard)
            : undefined,
      };
      const idx = prev.findIndex((m) => m.id === assistantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updates };
        return next;
      }
      // Edge case: meta arrived without any preceding text (model
      // produced no text content). Push a placeholder anyway so
      // verses/safety_card still render.
      return [
        ...prev,
        { id: assistantId, role: "assistant", content: "", ...updates },
      ];
    });
    return;
  }

  if (type === "error") {
    const errMsg =
      typeof frame.message === "string"
        ? frame.message
        : "connection dropped — please send your message again.";
    const errLine = `_${errMsg}_`;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantId);
      if (idx >= 0) {
        const next = [...prev];
        const cur = next[idx].content;
        next[idx] = {
          ...next[idx],
          content: cur ? `${cur}\n\n${errLine}` : errLine,
        };
        return next;
      }
      return [
        ...prev,
        { id: assistantId, role: "assistant", content: errLine },
      ];
    });
    return;
  }

  // Unknown frame type — silently skip (forward compat: future frame
  // types added server-side won't crash old clients).
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

