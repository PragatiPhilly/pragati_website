"use client";

/**
 * Last-resort error screen (covers failures in the root layout itself,
 * where error.tsx can't render). Must include its own <html>/<body>.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf5ec", color: "#2a2438", margin: 0 }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "96px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 48, margin: "0 0 16px" }}>🪔</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 12px" }}>We hit a snag — one moment</h1>
          <p style={{ lineHeight: 1.6, color: "#6b5d55", margin: "0 0 8px" }}>
            The site had trouble loading. It's usually temporary — please try again in a minute.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6b5d55", margin: "0 0 28px" }}>
            Already registered? Your tickets are safe — the QR passes in your confirmation email work at
            the gate. Need help? Write to{" "}
            <a href="mailto:pragati.management@gmail.com" style={{ color: "#c8102e", fontWeight: 600 }}>
              pragati.management@gmail.com
            </a>
            .
          </p>
          <button
            onClick={reset}
            style={{ background: "#c8102e", color: "#fff", border: 0, borderRadius: 999, padding: "12px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
