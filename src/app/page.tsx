import type { Metadata } from "next";
import LandingClient from "./components/LandingClient";

// Server shell: holds page metadata (a server-only export). The hero itself
// lives in LandingClient ("use client") so its CTAs / prose / disclaimer can
// follow the EN/हिन्दी language toggle. Layout + design are unchanged from the
// Dawn Aarti "Landing C · Vrindavan Window" mock.

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Landing() {
  return <LandingClient />;
}
