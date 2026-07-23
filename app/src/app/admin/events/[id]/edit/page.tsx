import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db/client";
import EventForm from "../../EventForm";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit event" };

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSectionAccess("events");
  const { id } = await params;
  const db = getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) notFound();
  const types = await db.select().from(schema.ticketTypes).where(and(eq(schema.ticketTypes.eventId, id), isNull(schema.ticketTypes.archivedAt))).orderBy(asc(schema.ticketTypes.displayOrder));
  const promos = await db.select().from(schema.promoCodes).where(and(eq(schema.promoCodes.eventId, id), isNull(schema.promoCodes.archivedAt)));

  // The event's authoritative day-keys, derived from its current date range.
  // We filter each ticket's stored dayKeys to this set so a stale key from an
  // earlier date range (e.g. a dropped "thu") can't linger in the form / UI.
  const eventDayKeys = new Set(Array.isArray(ev.days) ? (ev.days as { key: string }[]).map((d) => d.key) : []);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-8">Edit: {ev.name}</h1>
      <EventForm
        initial={{
          id: ev.id,
          name: ev.name,
          nameBengali: ev.nameBengali ?? "",
          slug: ev.slug,
          theme: ev.theme,
          description: ev.description ?? "",
          startsAt: toLocalInput(ev.startsAt),
          endsAt: toLocalInput(ev.endsAt),
          venueName: ev.venueName ?? "",
          venueAddress: ev.venueAddress ?? "",
          venueMapUrl: ev.venueMapUrl ?? "",
          status: ev.status as "draft" | "published" | "archived",
          ticketTypes: types.map((t) => ({
            id: t.id,
            name: t.name,
            ageBand: t.ageBand === "child_5_12" ? "child_5_18" : t.ageBand, // legacy youth → new value

            dayKeys: (Array.isArray(t.dayKeys) ? (t.dayKeys as string[]) : [...eventDayKeys]).filter(
              (k) => eventDayKeys.size === 0 || eventDayKeys.has(k),
            ),
            checkInStart: t.checkInStart ?? null,
            withFood: t.withFood,
            priceMember: t.priceMemberCents / 100,
            priceNonmember: t.priceNonmemberCents < 0 ? -1 : t.priceNonmemberCents / 100,
            capacity: t.capacity,
          })),
          promoCodes: promos.map((p) => ({
            id: p.id,
            code: p.code,
            discountType: p.discountType as "percent" | "fixed_amount_cents",
            discountValue: p.discountType === "fixed_amount_cents" ? p.discountValue / 100 : p.discountValue,
            maxUsesTotal: p.maxUsesTotal,
            validUntil: p.validUntil ? p.validUntil.toISOString().slice(0, 10) : null,
          })),
        }}
      />
    </div>
  );
}
