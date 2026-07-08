import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] grid place-items-center px-5 text-center">
      <div>
        <p className="font-[family-name:var(--font-bangla)] text-5xl mb-4" style={{ color: "var(--sindoor)" }}>
          দুঃখিত!
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">This page wandered off</h1>
        <p className="mb-8" style={{ color: "var(--ink-soft)" }}>
          Maybe it's off getting bhog. Let's take you somewhere warm.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-primary">Back home</Link>
          <Link href="/events" className="btn-secondary">See events</Link>
        </div>
      </div>
    </div>
  );
}
