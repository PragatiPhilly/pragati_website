import Link from "next/link";
import { listPublishedEvents } from "@/lib/queries/events";
import Reveal from "@/components/site/Reveal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function EventsPage() {
  const events = await listPublishedEvents();
  const now = new Date();
  const upcoming = events.filter((e) => e.endsAt > now);
  const past = events.filter((e) => e.endsAt <= now).reverse();

  const card = (e: (typeof events)[number], i: number) => (
    <Reveal key={e.id} delay={i * 0.05}>
      <Link href={`/events/${e.slug}`} className="festive-card flex flex-col md:flex-row md:items-center gap-4 p-6 hover:-translate-y-0.5 transition-transform">
        <div
          className="shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <span className="text-xs font-bold uppercase">
            {new Date(e.startsAt).toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span className="font-[family-name:var(--font-display)] text-2xl font-black leading-none">
            {new Date(e.startsAt).getDate()}
          </span>
        </div>
        <div className="flex-1">
          <p className="font-[family-name:var(--font-display)] text-xl font-bold">{e.name}</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            {e.venueName} · {new Date(e.startsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}–
            {new Date(e.endsAt).toLocaleDateString("en-US", { day: "numeric", year: "numeric" })}
          </p>
        </div>
        <span className="btn-secondary !py-2 !px-5 text-sm w-fit">
          {e.endsAt > now ? "Buy tickets" : "See details"}
        </span>
      </Link>
    </Reveal>
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black mb-10">Events</h1>
      <div className="flex flex-col gap-4">{upcoming.map(card)}</div>
      {past.length > 0 && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold mt-16 mb-6" style={{ color: "var(--ink-soft)" }}>
            Past events
          </h2>
          <div className="flex flex-col gap-4 opacity-70">{past.map(card)}</div>
        </>
      )}
    </div>
  );
}
