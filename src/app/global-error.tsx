"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#faf7f2", display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", textAlign: "center", fontFamily: "serif" }}>
        <p style={{ fontSize: "1.5rem", color: "#3d2c1e" }}>
          A critical error occurred
        </p>
        <p style={{ fontSize: "0.875rem", color: "#8b7355", fontStyle: "italic" }}>
          Please reload the page.
        </p>
        <button
          onClick={reset}
          style={{ padding: "0.5rem 1.5rem", borderRadius: "9999px", border: "1px solid #c9a84c", background: "transparent", cursor: "pointer", color: "#3d2c1e", fontSize: "0.875rem" }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
