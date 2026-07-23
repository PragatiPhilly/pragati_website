import Link from "next/link";
import { listPublishedEvents, getEventBySlug, type EventDay } from "@/lib/queries/events";
import { formatCents } from "@/lib/pricing";
import Reveal from "@/components/site/Reveal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: "America/New_York", ...opts });

/** Compact card for secondary / past events. */
function MiniCard({ e, now, i }: { e: Awaited<ReturnType<typeof listPublishedEvents>>[number]; now: Date; i: number }) {
  return (
    <Reveal key={e.id} delay={i * 0.05}>
      <Link href={`/events/${e.slug}`} className="festive-card flex items-center gap-4 p-5 hover:-translate-y-0.5 transition-transform">
        <div className="shrink-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <span className="text-[10px] font-bold uppercase">{fmt(e.startsAt, { month: "short" })}</span>
          <span className="font-[family-name:var(--font-display)] text-xl font-black leading-none">{new Date(e.startsAt).getDate()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-[family-name:var(--font-display)] text-lg font-bold truncate">{e.name}</p>
          <p className="text-sm mt-0.5 truncate" style={{ color: "var(--ink-soft)" }}>
            {e.venueName} · {fmt(e.startsAt, { month: "long", day: "numeric" })}
          </p>
        </div>
        <span className="btn-secondary !py-2 !px-5 text-sm w-fit shrink-0">{e.endsAt > now ? "Buy tickets" : "See details"}</span>
      </Link>
    </Reveal>
  );
}

export default async function EventsPage() {
  const events = await listPublishedEvents();
  const now = new Date();
  const upcoming = events.filter((e) => e.endsAt > now);
  const past = events.filter((e) => e.endsAt <= now).reverse();

  const featured = upcoming[0];
  const featuredFull = featured ? await getEventBySlug(featured.slug) : null;
  const days = ((featured?.days as EventDay[] | null) ?? []).map((d) => d.label);
  const paidPrices = (featuredFull?.ticketTypes ?? []).map((t) => t.priceNonmemberCents).filter((c) => c > 0);
  const priceFrom = paidPrices.length ? Math.min(...paidPrices) : null;
  const hasConcert = (featuredFull?.ticketTypes ?? []).some((t) => t.ageBand === "concert");

  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black mb-3">Events</h1>
      <p className="mb-10 text-lg" style={{ color: "var(--ink-soft)" }}>
        Pujos, concerts, picnics — everything Pragati brings to the Greater Philadelphia Bengali community.
      </p>

      {!featured && past.length === 0 && (
        <div className="festive-card p-10 text-center">
          <p className="text-5xl mb-3">🪔</p>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold">Nothing on the calendar just yet</p>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>Check back soon — our next celebration is being planned.</p>
        </div>
      )}

      {featured && (
        <Reveal>
          <div className="festive-card overflow-hidden">
            <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, var(--marigold) 0%, var(--sindoor) 50%, var(--terracotta) 100%)" }} />
            <div className="p-7 md:p-10">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
                  Next up
                </span>
                {hasConcert && (
                  <span className="text-xs font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1" style={{ background: "var(--accent-soft)", color: "var(--terracotta)" }}>
                    🎶 Concert nights
                  </span>
                )}
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black leading-tight">{featured.name}</h2>
              {featured.nameBengali && (
                <p className="font-[family-name:var(--font-bangla)] text-xl mt-1.5 font-normal" style={{ color: "var(--ink-soft)" }}>
                  {featured.nameBengali}
                </p>
              )}
              <p className="mt-2 font-semibold" style={{ color: "var(--terracotta)" }}>
                {fmt(featured.startsAt, { month: "long", day: "numeric" })} – {fmt(featured.endsAt, { month: "long", day: "numeric", year: "numeric" })}
              </p>
              {featured.description && (
                <p className="mt-4 max-w-2xl leading-relaxed" style={{ color: "var(--ink-soft)" }}>{featured.description}</p>
              )}

              {days.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-6">
                  {days.map((label) => (
                    <span key={label} className="text-sm font-semibold rounded-full px-3.5 py-1.5" style={{ background: "var(--bg-soft)", border: "1px solid var(--line)" }}>
                      {label}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-sm" style={{ color: "var(--ink-soft)" }}>
                {featured.venueName && <span>📍 {featured.venueName}</span>}
                {priceFrom !== null && (
                  <span>🎟 Tickets from <strong style={{ color: "var(--ink)" }}>{formatCents(priceFrom)}</strong></span>
                )}
                <span>🪔 Members save up to 30%</span>
              </div>

              <div className="flex flex-wrap gap-3 mt-8">
                <Link href={`/register?event=${featured.slug}`} className="btn-primary !px-8 !py-3.5 text-base">
                  Buy tickets →
                </Link>
                <Link href={`/events/${featured.slug}`} className="btn-secondary !px-8 !py-3.5 text-base">
                  See full details
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {upcoming.length > 1 && (
        <div className="flex flex-col gap-4 mt-6">
          {upcoming.slice(1).map((e, i) => (
            <MiniCard key={e.id} e={e} now={now} i={i} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold mt-16 mb-6" style={{ color: "var(--ink-soft)" }}>
            Past events
          </h2>
          <div className="flex flex-col gap-4 opacity-75">
            {past.map((e, i) => (
              <MiniCard key={e.id} e={e} now={now} i={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
