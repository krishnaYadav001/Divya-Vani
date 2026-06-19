"use client";

// Perf wrapper around <SupportWidget>. The support widget is a heavy
// client component (drag logic, its own chat panel + fetch) that is just
// a floating button until tapped, yet it was mounted eagerly on EVERY
// route via the root layout — putting its JS on the critical path of the
// landing LCP and the chat first paint.
//
// This wrapper does two things:
//   1. next/dynamic(ssr:false) splits SupportWidget into its own chunk
//      (the root layout is a Server Component, so dynamic({ssr:false})
//      must live in a "use client" wrapper — same pattern as
//      LotusBackground.tsx).
//   2. The mount is deferred to browser idle, so neither the chunk nor
//      the component competes with initial hydration / LCP. The button
//      appears a beat after the page is interactive — fine for support.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const SupportWidget = dynamic(() => import("./SupportWidget"), { ssr: false });

type IdleHandle = number;
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function SupportWidgetLazy() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const w = window as IdleWindow;
    let handle: IdleHandle;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (typeof w.requestIdleCallback === "function") {
      handle = w.requestIdleCallback(() => setShow(true), { timeout: 3000 });
    } else {
      // Safari < 17 fallback.
      timer = setTimeout(() => setShow(true), 1500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      else if (typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(handle);
      }
    };
  }, []);

  return show ? <SupportWidget /> : null;
}
