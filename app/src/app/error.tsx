"use client";

/**
 * Friendly failure screen — shows instead of a stack trace when a page
 * throws (most likely cause: database unreachable). Gives visitors a path
 * forward and reassures ticket-holders that their passes still exist.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <p className="text-5xl mb-4">🪔</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-3">
        We hit a snag — one moment
      </h1>
      <p className="leading-relaxed mb-2" style={{ color: "var(--ink-soft)" }}>
        Something went wrong loading this page. It's usually temporary — please try again in a minute.
      </p>
      <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--ink-soft)" }}>
        Already registered? Don't worry — your tickets are safe, and the confirmation email with your
        QR passes works at the gate. Need help right now? Write to{" "}
        <a href="mailto:pragati.management@gmail.com" className="underline underline-offset-4 font-semibold">
          pragati.management@gmail.com
        </a>
        .
      </p>
      <button className="btn-primary !px-8" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
