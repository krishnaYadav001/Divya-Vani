import type { Metadata } from "next";
import StarField from "./StarField";
import AgentVoiceClient from "./AgentVoiceClient";

// Phase 11.3 — /voice route, on the ElevenAgents React SDK (replaces the
// Phase-10.5 Sarvam→Sonnet→TTS loop; the old VoiceClient + voiceSession.ts are
// retired in Phase 11.6). NIGHT mode (Dawn Aarti handoff, 2026-05-24): the
// voice page is the night counterpart of the Dawn pastel system, so this
// server shell lays a deep midnight ground (.bg-night) + the z-0 starfield and
// mounts the client. Everything interactive (orb, SDK session lifecycle,
// identity bootstrap, the Krishna-flute backdrop, paywall, helpline overlay,
// transcript) lives in AgentVoiceClient. The always-visible bilingual identity
// disclaimer (Locked Decision #1) is rendered by its Zone-2 identity strip —
// never conditionally hidden.
//
// Identity/cookie: minted + persisted by /api/voice/bootstrap (a Route Handler),
// not here — Next 16 server components cannot set cookies.

export const metadata: Metadata = {
  title: "Voice · Divya Vani",
  description:
    "Talk with Krishna in voice — speak your question and hear a reply grounded in scripture. An AI roleplaying Krishna.",
  alternates: { canonical: "/voice" },
};

export default function VoicePage() {
  return (
    <main className="bg-night relative flex h-full flex-1 flex-col overflow-hidden">
      <StarField className="z-0" count={70} />
      <AgentVoiceClient />
    </main>
  );
}
