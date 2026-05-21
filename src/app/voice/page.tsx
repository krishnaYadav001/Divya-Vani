import type { Metadata } from "next";
import Atmosphere from "../components/Atmosphere";
import VoiceClient from "./VoiceClient";

// Phase 10.5 — /voice route. A voice-only, orb-centred conversation with
// Krishna (Sarvam STT → Sonnet → ElevenLabs TTS, all existing endpoints).
// This server shell only lays the z-0 Atmosphere ground (mode="deep" — denser,
// immersive) and mounts the client orchestrator; everything interactive
// (orb, session lifecycle, paywall, helpline, transcript) lives in
// VoiceClient. The always-visible bilingual identity disclaimer (Locked
// Decision #1) is rendered by VoiceClient's top identity strip — never
// conditionally hidden.

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
        <Atmosphere mode="deep" intensity={1} vignette={0.7} />
      </div>
      <VoiceClient />
    </main>
  );
}
