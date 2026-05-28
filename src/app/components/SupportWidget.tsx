"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();

  // On /chat and /voice the bottom of the screen is occupied by the
  // input bar / orb controls, so push the widget higher to avoid overlap.
  const isImmersive = pathname === "/chat" || pathname === "/voice";
  const btnBottom = isImmersive ? "bottom-24" : "bottom-6";
  const panelBottom = isImmersive ? "bottom-40" : "bottom-20";

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && messages.length === 0) {
      textareaRef.current?.focus();
    }
  }, [open, messages.length]);

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
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-10),
        }),
      });

      if (!res.ok) throw new Error("network");
      const data: { reply?: string; error?: string } = await res.json();
      if (!data.reply) throw new Error("empty");

      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setError(
        "Something went wrong. Please email grievance@divyavani.co.in for help."
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

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className={`fixed z-50 ${btnBottom} right-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95`}
        style={{ background: "oklch(52% 0.13 205)", color: "#fff" }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M3 3l12 12M15 3L3 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 2C5.58 2 2 5.36 2 9.5c0 1.92.75 3.67 1.98 4.99L3 17l2.7-.86A8.1 8.1 0 0010 17c4.42 0 8-3.36 8-7.5S14.42 2 10 2z"
              fill="currentColor"
            />
            <circle cx="7" cy="9.5" r="1" fill="white" />
            <circle cx="10" cy="9.5" r="1" fill="white" />
            <circle cx="13" cy="9.5" r="1" fill="white" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Divya Vani support chat"
          className={`fixed z-40 ${panelBottom} right-4 flex flex-col rounded-2xl shadow-xl overflow-hidden`}
          style={{
            width: "min(320px, calc(100vw - 2rem))",
            maxHeight: "440px",
            background: "oklch(98.5% 0.006 70)",
            border: "1px solid oklch(80% 0.015 30)",
            animation: "fade-up 0.2s ease both",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
            style={{ background: "oklch(52% 0.13 205)", color: "#fff" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              DV
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-medium leading-tight"
                style={{ fontFamily: "var(--font-marcellus)" }}
              >
                Divya Vani Support
              </p>
              <p className="text-xs opacity-75 leading-tight">
                Usually replies instantly
              </p>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            style={{ minHeight: "160px" }}
          >
            {/* Empty state — quick-action pills */}
            {messages.length === 0 && (
              <div>
                <p
                  className="text-xs mb-3 leading-relaxed"
                  style={{
                    color: "oklch(45% 0.025 30)",
                    fontFamily: "var(--font-cormorant)",
                    fontStyle: "italic",
                  }}
                >
                  नमस्ते! How can I help you today?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((label) => (
                    <button
                      key={label}
                      onClick={() => send(label)}
                      className="text-xs px-2.5 py-1.5 rounded-full border transition-colors hover:opacity-80"
                      style={{
                        background: "oklch(93% 0.018 50)",
                        borderColor: "oklch(80% 0.015 30)",
                        color: "oklch(28% 0.035 30)",
                        fontFamily: "var(--font-geist-sans)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation messages */}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] text-xs px-3 py-2 rounded-xl leading-relaxed whitespace-pre-wrap"
                  style={
                    m.role === "user"
                      ? {
                          background: "oklch(52% 0.13 205)",
                          color: "#fff",
                          fontFamily: "var(--font-geist-sans)",
                        }
                      : {
                          background: "oklch(93% 0.018 50)",
                          color: "oklch(28% 0.035 30)",
                          fontFamily: "var(--font-geist-sans)",
                        }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="text-xs px-3 py-2 rounded-xl"
                  style={{
                    background: "oklch(93% 0.018 50)",
                    color: "oklch(62% 0.02 30)",
                    fontFamily: "var(--font-geist-sans)",
                  }}
                >
                  Typing…
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div
                className="text-xs px-3 py-2 rounded-xl"
                style={{
                  background: "oklch(95% 0.03 28)",
                  color: "oklch(53% 0.19 28)",
                  fontFamily: "var(--font-geist-sans)",
                }}
              >
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div
            className="px-3 pb-3 pt-2 flex gap-2 items-end shrink-0"
            style={{ borderTop: "1px solid oklch(80% 0.015 30)" }}
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
              className="flex-1 resize-none text-xs rounded-lg px-3 py-2 outline-none"
              style={{
                background: "oklch(96.5% 0.012 60)",
                border: "1px solid oklch(80% 0.015 30)",
                color: "oklch(28% 0.035 30)",
                fontFamily: "var(--font-geist-sans)",
                lineHeight: "1.5",
                maxHeight: "80px",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              aria-label="Send"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-40 shrink-0"
              style={{ background: "oklch(52% 0.13 205)", color: "#fff" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
              >
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
    </>
  );
}
