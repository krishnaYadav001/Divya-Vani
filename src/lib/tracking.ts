// Plausible custom-event helper. Plausible queues events fired before the
// script loads (via the window.plausible shim in layout.tsx), so calling
// track() early is safe. No-ops on the server (SSR) and when the shim is
// absent (dev without Plausible loaded).

declare global {
  interface Window {
    plausible?: (
      eventName: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

export function track(
  eventName: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  window.plausible?.(eventName, props ? { props } : undefined);
}
