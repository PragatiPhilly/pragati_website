import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import { getConfig } from "@/lib/system-config";
import SetActiveButton from "./SetActiveButton";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const db = getDb();
  const events = await db.select().from(schema.events).orderBy(desc(schema.events.startsAt));
  const allTypes = await db.select().from(schema.ticketTypes);
  const activeSlug = await getConfig<string>("active_event_slug");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Events</h1>
        <Link href="/admin/events/new" className="btn-primary !py-2 !px-5 text-sm">
          + New event
        </Link>
      </div>
      <div className="grid gap-5">
        {events.map((e) => {
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
                    {e.status !== "published" && (
                      <span className="text-xs align-middle font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ml-1" style={{ background: "rgba(0,0,0,0.07)", color: "var(--ink-soft)" }}>
                        {e.status}
                      </span>
                    )}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                    /{e.slug} · theme: {e.theme} ·{" "}
                    {e.startsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })}–
                    {e.endsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", day: "numeric", year: "numeric" })} · {e.venueName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/events/${e.id}/edit`} className="btn-secondary !py-2 !px-4 text-xs">
                    Edit
                  </Link>
                  {activeSlug !== e.slug && <SetActiveButton slug={e.slug} />}
                </div>
              </div>
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {types.map((t) => (
                  <div key={t.id} className="hairline rounded-xl px-3.5 py-2.5 text-sm">
                    <p className="font-medium leading-tight">{t.name}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                      {t.priceNonmemberCents < 0 ? "members only" : formatCents(t.priceNonmemberCents)} / member {formatCents(t.priceMemberCents)} · sold {t.soldCount}
                      {t.capacity !== null && ` / ${t.capacity}`}
                    </p>
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
