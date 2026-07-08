import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db/client";
import EventForm from "../../EventForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit event" };

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) notFound();
  const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, id)).orderBy(asc(schema.ticketTypes.displayOrder));
  const promos = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.eventId, id));
  const dayCount = Array.isArray(ev.days) ? (ev.days as unknown[]).length : 1;

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
            ageBand: t.ageBand,
            fullPass: Array.isArray(t.dayKeys) && (t.dayKeys as string[]).length >= dayCount,
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
