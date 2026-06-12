"use client";

import { useEffect } from "react";

export default function VisitTracker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    void fetch("/api/visits", {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      // Best effort only: analytics must never block the app experience.
    });
  }, []);

  return null;
}
