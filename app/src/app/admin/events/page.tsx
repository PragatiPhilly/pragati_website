import Link from "next/link";
import { asc, desc, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import { getConfig } from "@/lib/system-config";
import SetActiveButton from "./SetActiveButton";
import { EventOnlineShortcuts, PassOnlineSwitch } from "./OnlineSwitch";
import { ensureExtraColumns } from "@/lib/schema-ensure";
import { requireSectionAccess } from "@/lib/auth/access";
import CloseOutPanel from "./CloseOutPanel";
import ArchiveCard from "./ArchiveCard";
import { computeEventSummary, listArchives } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  await requireSectionAccess("events");
  await ensureExtraColumns(); // ticket_types.online_closed_at
  const db = getDb();
  const events = await db.select().from(schema.events).orderBy(desc(schema.events.startsAt));
  const allTypes = await db
    .select()
    .from(schema.ticketTypes)
    .where(isNull(schema.ticketTypes.archivedAt))
    .orderBy(asc(schema.ticketTypes.displayOrder));
  const activeSlug = await getConfig<string>("active_event_slug");

  // Seasons (spec/19): closed events keep a frozen summary; the next event
  // waiting to start gets the one "close & start" button.
  const archives = new Map((await listArchives()).map((a) => [a.eventId, a]));
  const now = new Date();
  const active = events.find((e) => e.slug === activeSlug) ?? null;
  const next = events
    .filter((e) => e.slug !== activeSlug && e.endsAt > now && !archives.has(e.id))
    .sort((a, b) => +a.startsAt - +b.startsAt)[0];
  const activeSummary = next && active ? await computeEventSummary(active.id, { isCurrent: true }) : null;
  const fmtWhen = (e: (typeof events)[number]) => {
    const d = (x: Date, o: Intl.DateTimeFormatOptions) => x.toLocaleDateString("en-US", { timeZone: "America/New_York", ...o });
    const t = (x: Date) => x.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
    return d(e.startsAt, { year: "numeric", month: "numeric", day: "numeric" }) === d(e.endsAt, { year: "numeric", month: "numeric", day: "numeric" })
      ? `${d(e.startsAt, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}, ${t(e.startsAt)}–${t(e.endsAt)}`
      : `${d(e.startsAt, { month: "short", day: "numeric" })}–${d(e.endsAt, { month: "short", day: "numeric", year: "numeric" })}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Events</h1>
        <Link href="/admin/events/new" className="btn-primary !py-2 !px-5 text-sm">
          + New event
        </Link>
      </div>
      {done && (
        <p className="festive-card p-4 mb-6 text-sm font-semibold" style={{ borderColor: "var(--leaf-deep)", color: "var(--leaf-deep)" }} role="status">
          ✅ Done. {done.slice(0, 600)}
        </p>
      )}
      {next && (
        <CloseOutPanel
          current={
            active && activeSummary
              ? { name: active.name, regs: activeSummary.registrations.paid, collected: formatCents(activeSummary.money.collected) }
              : null
          }
          next={{
            id: next.id,
            name: next.name,
            when: `${fmtWhen(next)} · ${next.venueName ?? "venue not set"}`,
            published: next.status === "published",
            passes: allTypes.filter((t) => t.eventId === next.id).length,
          }}
        />
      )}
      <div className="grid gap-5">
        {events.map((e) => {
          const archive = archives.get(e.id);
          const types = allTypes.filter((t) => t.eventId === e.id);
          return (
            <div key={e.id} className="festive-card p-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-xl font-bold">
                    {e.name}{" "}
                    {activeSlug === e.slug && (
                      <span className="text-xs align-middle font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ml-1" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
                        active · drives site theme
                      </span>
                    )}
                    {archive && activeSlug !== e.slug && (
                      <span className="text-xs align-middle font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ml-1" style={{ background: "#FFF1CC", color: "#7a5200" }}>
                        past · archived
                      </span>
                    )}
                    {e.status !== "published" && (
                      <span className="text-xs align-middle font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ml-1" style={{ background: "rgba(0,0,0,0.07)", color: "var(--ink-soft)" }}>
                        {e.status}
                      </span>
                    )}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                    /{e.slug} · theme: {e.theme} · {fmtWhen(e)} · {e.venueName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/events/${e.id}/edit`} className="btn-secondary !py-2 !px-4 text-xs">
                    Edit
                  </Link>
                  {activeSlug !== e.slug && e.id !== next?.id && !archive && <SetActiveButton slug={e.slug} />}
                </div>
              </div>
              {archive && activeSlug !== e.slug && (
                <ArchiveCard eventId={e.id} summary={archive.summary} closedAt={archive.closedAt.toISOString()} closedBy={archive.closedByName} />
              )}
              {types.length > 0 && !(archive && activeSlug !== e.slug) && (
                <EventOnlineShortcuts eventId={e.id} openCount={types.filter((t) => !t.onlineClosedAt).length} total={types.length} />
              )}
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {types.map((t) => (
                  <div
                    key={t.id}
                    className="hairline rounded-xl px-3.5 py-2.5 text-sm"
                    style={t.onlineClosedAt ? { background: "rgba(200,16,46,0.04)" } : undefined}
                  >
                    <p className="font-medium leading-tight">{t.name}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                      {t.priceNonmemberCents < 0 ? "members only" : formatCents(t.priceNonmemberCents)} / member {formatCents(t.priceMemberCents)} · sold {t.soldCount}
                      {t.capacity !== null && ` / ${t.capacity}`}
                    </p>
                    <PassOnlineSwitch id={t.id} name={t.name} open={!t.onlineClosedAt} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {events.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No events yet — create the first one.</p>}
      </div>
    </div>
  );
}
