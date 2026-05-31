import type { Metadata } from "next";
import JourneyClient from "./JourneyClient";

export const metadata: Metadata = {
  title: "Find Your Path — Divya Vani",
  description:
    "Receive Krishna's personalized guidance aligned to your life's journey. A 2-question quiz to find your path.",
  robots: { index: false, follow: false },
};

export default function JourneyPage() {
  return <JourneyClient />;
}
