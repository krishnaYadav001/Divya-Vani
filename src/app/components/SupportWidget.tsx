"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SupportMessage = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS = [
  "Payment not credited",
  "Mic not working",
  "Refund request",
  "About plans",
];

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Draggable position — right/bottom offset from viewport edges.
  // Default sits above the chat input bar on all routes.
  const [pos, setPos] = useState({ right: 16, bottom: 88 });
  const dragRef = useRef<{
    startPX: number;
    startPY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open && messages.length === 0) textareaRef.current?.focus();
  }, [open, messages.length]);

  // Drag handlers — pointer capture ensures move/up fire even off the button.
  // Click (open/close) is handled in onPointerUp when the pointer hasn't moved.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || open) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startPX: e.clientX,
        startPY: e.clientY,
        startRight: pos.right,
        startBottom: pos.bottom,
        moved: false,
      };
    },
    [open, pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startPX;
      const dy = e.clientY - d.startPY;
      if (!d.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      d.moved = true;
      setPos({
        right: Math.max(8, Math.min(window.innerWidth - 56, d.startRight - dx)),
        bottom: Math.max(8, Math.min(window.innerHeight - 56, d.startBottom - dy)),
      });
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) setOpen((v) => !v);
  }, []);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const userMsg: SupportMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: messages.slice(-10) }),
      });
      if (!res.ok) throw new Error("network");
      const data: { reply?: string; error?: string } = await res.json();
      if (!data.reply) throw new Error("empty");
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setError(
        "Something went wrong. Please email grievance@divyavani.co.in for help.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // Panel width never overflows the left edge of the viewport.
  const panelWidth = `min(320px, calc(100vw - ${pos.right}px - 1rem))`;

  return (
    <div
      className="fixed z-50"
      style={{ right: pos.right, bottom: pos.bottom }}
    >
      {/* Chat panel — opens above the trigger button */}
      {open && (
        <div
          role="dialog"
          aria-label="Divya Vani support chat"
          className="absolute bottom-14 right-0 flex flex-col overflow-hidden rounded-2xl"
          style={{
            width: panelWidth,
            maxHeight: "440px",
            background: "var(--color-mist)",
            border: "1px solid oklch(76% 0.12 80 / 0.4)",
            boxShadow:
              "0 12px 48px -12px oklch(40% 0.08 30 / 0.35), 0 2px 8px -2px oklch(40% 0.08 30 / 0.12)",
            animation: "fade-up 0.2s ease both",
          }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center gap-2.5 px-4 py-2.5"
            style={{
              background:
                "linear-gradient(180deg, var(--color-buttermilk) 0%, var(--color-peach) 100%)",
              borderBottom: "1px solid oklch(76% 0.12 80 / 0.25)",
            }}
          >
            <span aria-hidden className="shrink-0 text-base leading-none">
              🪷
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium leading-tight"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--color-ink)",
                }}
              >
                Divya Vani Support
              </p>
              <p
                className="text-xs leading-tight"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  color: "var(--color-ink-soft)",
                }}
              >
                Usually replies instantly
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-gold-leaf/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf/40"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M1 1l10 10M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div
            className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
            style={{ minHeight: "160px" }}
          >
            {/* Empty state — quick-action pills */}
            {messages.length === 0 && (
              <div>
                <p
                  className="mb-3 text-xs leading-relaxed"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    color: "var(--color-ink-soft)",
                  }}
                >
                  नमस्ते! How can I help you today?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((label) => (
                    <button
                      key={label}
                      onClick={() => send(label)}
                      className="rounded-full border px-2.5 py-1.5 text-xs transition-colors hover:opacity-80"
                      style={{
                        background: "var(--color-buttermilk)",
                        borderColor: "oklch(76% 0.12 80 / 0.35)",
                        color: "var(--color-ink)",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation */}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed"
                  style={
                    m.role === "user"
                      ? {
                          background: "var(--color-peacock)",
                          color: "#fff",
                          fontFamily: "var(--font-sans)",
                        }
                      : {
                          background: "var(--color-mist-3)",
                          color: "var(--color-ink)",
                          fontFamily: "var(--font-sans)",
                        }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-xl px-3 py-2 text-xs"
                  style={{
                    background: "var(--color-mist-3)",
                    color: "var(--color-ink-faint)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Typing…
                </div>
              </div>
            )}

            {error && (
              <div
                className="rounded-xl px-3 py-2 text-xs"
                style={{
                  background: "oklch(95% 0.03 28)",
                  color: "var(--color-vermillion)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div
            className="flex shrink-0 items-end gap-2 px-3 pb-3 pt-2"
            style={{ borderTop: "1px solid oklch(76% 0.12 80 / 0.2)" }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type your question…"
              rows={1}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-xs outline-none"
              style={{
                background: "var(--color-mist-2)",
                border: "1px solid var(--color-ink-line)",
                color: "var(--color-ink)",
                fontFamily: "var(--font-sans)",
                lineHeight: "1.5",
                maxHeight: "80px",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-peacock)", color: "#fff" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M1 7h12M8 3l5 4-5 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating trigger button — draggable when panel is closed */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="relative flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_20px_-4px_oklch(40%_0.08_30_/_0.4)] transition-transform hover:scale-105 active:scale-95"
        style={{
          cursor: open ? "pointer" : "grab",
          background:
            "linear-gradient(180deg, var(--color-buttermilk) 0%, var(--color-peach) 100%)",
          border: "1px solid oklch(76% 0.12 80 / 0.5)",
        }}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="var(--color-ink)"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 2C5.58 2 2 5.36 2 9.5c0 1.92.75 3.67 1.98 4.99L3 17l2.7-.86A8.1 8.1 0 0010 17c4.42 0 8-3.36 8-7.5S14.42 2 10 2z"
              fill="var(--color-peacock)"
            />
            <circle cx="7" cy="9.5" r="1" fill="white" />
            <circle cx="10" cy="9.5" r="1" fill="white" />
            <circle cx="13" cy="9.5" r="1" fill="white" />
          </svg>
        )}
        {/* Gold-leaf accent dot */}
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
          style={{
            background: "var(--color-gold-leaf)",
            boxShadow: "0 0 6px oklch(76% 0.12 80 / 0.55)",
          }}
        />
      </button>
    </div>
  );
}
