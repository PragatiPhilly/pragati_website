import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug, type EventDay } from "@/lib/queries/events";
import { getEventImage } from "@/lib/media/queries";
import { formatCents } from "@/lib/pricing";
import Reveal from "@/components/site/Reveal";
import MediaImg from "@/components/site/MediaImg";

export const dynamic = "force-dynamic";

const THEME_BORDER: Record<string, string> = {
  durga: "#c8102e",
  kali: "#e8a93c",
  saraswati: "#3b5876",
  none: "#e85f2c",
};

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status !== "published") notFound();
  const days = (event.days as EventDay[] | null) ?? [];
  const eventImage = await getEventImage(slug);
  const borderColor = THEME_BORDER[event.theme] ?? THEME_BORDER.none;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: "var(--accent)" }}>
          {new Date(event.startsAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" })} –{" "}
          {new Date(event.endsAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" })}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-6xl font-black">
          {event.name}
          {event.nameBengali && (
            <span className="font-[family-name:var(--font-bangla)] block text-2xl md:text-3xl mt-3 font-normal" style={{ color: "var(--ink-soft)" }}>
              {event.nameBengali}
            </span>
          )}
        </h1>
      </Reveal>

      {eventImage && (
        <Reveal delay={0.08}>
          <div className="mt-9 flex justify-center">
            <div
              className="relative w-full max-w-3xl rounded-[26px] overflow-hidden"
              style={{
                aspectRatio: eventImage.height > eventImage.width ? "4 / 5" : "16 / 10",
                border: `5px solid ${borderColor}`,
                boxShadow: `0 22px 55px ${borderColor}33`,
              }}
            >
              <MediaImg
                photo={{
                  fileBase: eventImage.fileBase,
                  width: eventImage.width,
                  height: eventImage.height,
                  variants: eventImage.variants,
                  blurDataUrl: eventImage.blurDataUrl,
                }}
                fit="blurfill"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
                alt={event.name}
              />
            </div>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.1}>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {event.description}
        </p>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="festive-card mt-8 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold">{event.venueName}</p>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{event.venueAddress}</p>
          </div>
          {event.venueMapUrl && (
            <a href={event.venueMapUrl} target="_blank" rel="noreferrer" className="btn-secondary !py-2 !px-5 text-sm w-fit">
              Open in Maps
            </a>
          )}
        </div>
      </Reveal>

      {days.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          {days.map((d, i) => (
            <Reveal key={d.key} delay={0.18 + i * 0.06}>
              <div className="festive-card p-5">
                <p className="font-[family-name:var(--font-display)] font-semibold">{d.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <Reveal delay={0.25}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold mt-14 mb-5">Tickets</h2>
        <div className="festive-card divide-y" style={{ borderColor: "var(--line)" }}>
          {event.ticketTypes.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 p-5" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="font-semibold">{t.name}</p>
                {t.capacity !== null && t.soldCount >= t.capacity && (
                  <p className="text-xs font-bold uppercase mt-1" style={{ color: "var(--sindoor)" }}>Sold out</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-[family-name:var(--font-display)] text-lg font-bold">
                  {t.priceNonmemberCents === 0 ? "Free" : formatCents(t.priceNonmemberCents)}
                </p>
                {t.priceNonmemberCents > 0 && (
                  <p className="text-xs" style={{ color: "var(--leaf-deep)" }}>
                    members {formatCents(t.priceMemberCents)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.3}>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href={`/register?event=${event.slug}`} className="btn-primary text-lg !px-10 !py-4">
            Register — it takes 2 minutes →
          </Link>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            No account needed · members get up to 30% off ·{" "}
            <Link href="/login" className="underline underline-offset-4">sign in</Link> for member pricing
          </p>
        </div>
      </Reveal>
    </div>
  );
}
