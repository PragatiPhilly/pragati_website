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

type Ticket = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>["ticketTypes"][number];

/** Human label for the days a pass covers, derived from its dayKeys. */
function coverageLabel(dayKeys: unknown, days: EventDay[]): string {
  const keys = Array.isArray(dayKeys) ? (dayKeys as string[]) : [];
  if (keys.length === 0) return "Any one day";
  if (keys.length >= days.length) return `All ${days.length} days`;
  return keys.map((k) => days.find((d) => d.key === k)?.label.split(",")[0] ?? k).join(" + ");
}

function soldOut(t: Ticket): boolean {
  return t.capacity !== null && t.soldCount >= t.capacity;
}

function fmtTime(hhmm: string | null): string | null {
  if (!hhmm) return null;
  return new Date(`2000-01-01T${hhmm}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Both prices, each explicitly labelled so nobody wonders why there are two. */
function PriceCell({ t }: { t: Ticket }) {
  if (t.priceNonmemberCents === 0 && t.priceMemberCents === 0)
    return <span className="font-[family-name:var(--font-display)] font-bold text-lg">Free</span>;
  const membersOnly = t.priceNonmemberCents < 0;
  const save = !membersOnly && t.priceNonmemberCents > t.priceMemberCents ? t.priceNonmemberCents - t.priceMemberCents : 0;
  // Same price for everyone → one clean number (no confusing duplicate lines).
  if (!membersOnly && t.priceNonmemberCents === t.priceMemberCents)
    return (
      <span className="whitespace-nowrap">
        <span className="font-[family-name:var(--font-display)] font-bold">{formatCents(t.priceMemberCents)}</span>{" "}
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>· guest &amp; member</span>
      </span>
    );
  return (
    <div className="leading-tight whitespace-nowrap">
      {!membersOnly && (
        <div className="flex items-baseline gap-1.5">
          <span className="w-16 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Guest</span>
          <span className="font-[family-name:var(--font-display)] font-bold">{formatCents(t.priceNonmemberCents)}</span>
        </div>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="w-16 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--leaf-deep)" }}>Member</span>
        <span className="font-[family-name:var(--font-display)] font-bold" style={{ color: "var(--leaf-deep)" }}>{formatCents(t.priceMemberCents)}</span>
      </div>
      {save > 0 && (
        <p className="text-[10px] font-semibold pl-[4.25rem]" style={{ color: "var(--leaf-deep)" }}>save {formatCents(save)}</p>
      )}
    </div>
  );
}

function SoldOutTag() {
  return <span className="ml-1.5 text-[10px] font-bold uppercase" style={{ color: "var(--sindoor)" }}>sold out</span>;
}

function TicketGroup({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-2 mb-2.5">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-black">{title}</h3>
        {sub && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>· {sub}</span>}
      </div>
      {children}
    </div>
  );
}

/** Adult / student day-coverage card: a small Guest | Member table per day-combo. */
function CoverageCard({ label, passes }: { label: string; passes: Ticket[] }) {
  const sorted = [...passes].sort((a, b) => Number(b.withFood) - Number(a.withFood));
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--line)", background: "var(--card)" }}>
      <p className="font-bold text-sm mb-2.5">{label}</p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 items-baseline text-sm">
        <span />
        <span className="text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--ink-soft)" }}>Guest</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--leaf-deep)" }}>Member ★</span>
        {sorted.flatMap((t) => [
          <span key={`${t.id}-l`} style={{ color: "var(--ink-soft)" }}>
            {t.withFood ? "🍛 With food" : "No food"}
            {soldOut(t) && <SoldOutTag />}
          </span>,
          <span key={`${t.id}-g`} className="font-[family-name:var(--font-display)] font-bold text-right">
            {t.priceNonmemberCents < 0 ? "—" : formatCents(t.priceNonmemberCents)}
          </span>,
          <span key={`${t.id}-m`} className="font-[family-name:var(--font-display)] font-bold text-right" style={{ color: "var(--leaf-deep)" }}>
            {formatCents(t.priceMemberCents)}
          </span>,
        ])}
      </div>
    </div>
  );
}

function SimpleRows({ passes }: { passes: Ticket[] }) {
  return (
    <div className="festive-card divide-y" style={{ borderColor: "var(--line)" }}>
      {passes.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
          <span className="font-medium text-sm">
            {t.name}
            {soldOut(t) && <SoldOutTag />}
          </span>
          <PriceCell t={t} />
        </div>
      ))}
    </div>
  );
}

function ConcertCard({ t, days }: { t: Ticket; days: EventDay[] }) {
  const time = fmtTime(t.checkInStart);
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--line)", background: "var(--card)" }}>
      <p className="font-bold text-sm">🎶 {t.name}</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
        {coverageLabel(t.dayKeys, days)}
        {time ? ` · doors ${time}` : ""} · no meal{soldOut(t) && <SoldOutTag />}
      </p>
      <div className="mt-2">
        <PriceCell t={t} />
      </div>
    </div>
  );
}

function AddonCard({ t, days }: { t: Ticket; days: EventDay[] }) {
  const time = fmtTime(t.checkInStart);
  const keys = Array.isArray(t.dayKeys) ? (t.dayKeys as string[]) : [];
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--line)", background: "var(--card)" }}>
      <p className="font-bold text-sm">🎫 {t.name}</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
        {keys.length > 0 && keys.length < days.length ? `${coverageLabel(t.dayKeys, days)} · ` : ""}
        {time ? `${time} · ` : ""}
        {t.withFood ? "includes food" : "no meal"}
        {soldOut(t) && <SoldOutTag />}
      </p>
      <div className="mt-2">
        <PriceCell t={t} />
      </div>
    </div>
  );
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status !== "published") notFound();
  const days = (event.days as EventDay[] | null) ?? [];
  const eventImage = await getEventImage(slug);
  const borderColor = THEME_BORDER[event.theme] ?? THEME_BORDER.none;

  // Group ticket types so a long flat list becomes scannable.
  const adult = event.ticketTypes.filter((t) => t.ageBand === "adult");
  const youth = event.ticketTypes.filter((t) => t.ageBand === "child_5_18" || t.ageBand === "child_5_12");
  const under = event.ticketTypes.filter((t) => t.ageBand === "child_under_5");
  const student = event.ticketTypes.filter((t) => t.ageBand === "student");
  const concert = event.ticketTypes.filter((t) => t.ageBand === "concert");
  const addon = event.ticketTypes.filter((t) => t.ageBand === "addon");
  const known = new Set(["adult", "child_5_18", "child_5_12", "child_under_5", "student", "concert", "addon"]);
  const other = event.ticketTypes.filter((t) => !known.has(t.ageBand));
  const groupByCoverage = (items: typeof adult) => {
    const m = new Map<string, typeof adult>();
    for (const t of items) {
      const label = coverageLabel(t.dayKeys, days);
      m.set(label, [...(m.get(label) ?? []), t]);
    }
    return [...m.entries()];
  };
  const adultGroups = groupByCoverage(adult);
  const studentGroups = groupByCoverage(student);

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
        <div className="mt-14">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold mb-3">Tickets</h2>
          <div
            className="rounded-2xl px-4 py-3.5 mb-6 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap"
            style={{ background: "var(--accent-soft)" }}
          >
            <p className="text-sm leading-relaxed">
              <span className="font-bold">Guest</span> and the lower{" "}
              <span className="font-bold" style={{ color: "var(--leaf-deep)" }}>Member ★</span> price. Pragati members save
              on every pass, all year.
            </p>
            <Link href="/signup" className="btn-secondary !py-1.5 !px-4 text-xs whitespace-nowrap shrink-0">
              Become a member →
            </Link>
          </div>

          {adultGroups.length > 0 && (
            <TicketGroup title="Adults" sub="18 & over">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {adultGroups.map(([label, passes]) => (
                  <CoverageCard key={label} label={label} passes={passes} />
                ))}
              </div>
            </TicketGroup>
          )}

          {youth.length > 0 && (
            <TicketGroup title="Youth" sub="5–18 · kid meal included">
              <SimpleRows passes={youth} />
            </TicketGroup>
          )}

          {studentGroups.length > 0 && (
            <TicketGroup title="Students" sub="🎓 valid student ID required at entry">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {studentGroups.map(([label, passes]) => (
                  <CoverageCard key={label} label={label} passes={passes} />
                ))}
              </div>
            </TicketGroup>
          )}

          {under.length > 0 && (
            <TicketGroup title="Little ones" sub="under 5">
              <SimpleRows passes={under} />
            </TicketGroup>
          )}

          {concert.length > 0 && (
            <TicketGroup title="Concert nights" sub="one show, one QR — no meal">
              <div className="grid sm:grid-cols-2 gap-3">
                {concert.map((t) => (
                  <ConcertCard key={t.id} t={t} days={days} />
                ))}
              </div>
            </TicketGroup>
          )}

          {addon.length > 0 && (
            <TicketGroup title="Extras" sub="add-ons — lunch, dinner & more">
              <div className="grid sm:grid-cols-2 gap-3">
                {addon.map((t) => (
                  <AddonCard key={t.id} t={t} days={days} />
                ))}
              </div>
            </TicketGroup>
          )}

          {other.length > 0 && (
            <TicketGroup title="Other passes">
              <SimpleRows passes={other} />
            </TicketGroup>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.3}>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href={`/register?event=${event.slug}`} className="btn-primary text-lg !px-10 !py-4">
            Register — it takes 2 minutes →
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
