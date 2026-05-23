import type { Metadata } from "next";
import Atmosphere from "../components/Atmosphere";
import AgentVoiceClient from "./AgentVoiceClient";

// Phase 11.3 — /voice route, now on the ElevenAgents React SDK (replaces the
// Phase-10.5 Sarvam→Sonnet→TTS loop; the old VoiceClient + voiceSession.ts are
// retired in Phase 11.6). This server shell only lays the z-0 Atmosphere ground
// (mode="chat" — light petals + sparkles) and mounts the client. Everything
// interactive (orb, SDK session lifecycle, identity bootstrap, paywall,
// helpline overlay, transcript) lives in AgentVoiceClient. The always-visible
// bilingual identity disclaimer (Locked Decision #1) is rendered by its Zone-2
// identity strip — never conditionally hidden.
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
    <main className="relative flex h-full flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Atmosphere mode="chat" intensity={1} vignette={0.7} />
      </div>
      <AgentVoiceClient />
    </main>
  );
}
