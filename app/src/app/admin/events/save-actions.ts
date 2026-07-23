"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { buildEventDays } from "@/lib/event-days";
import { ensureExtraColumns } from "@/lib/schema-ensure";

export type TicketTypeInput = {
  id?: string;
  name: string;
  ageBand: string;
  dayKeys: string[]; // event day-keys this pass covers ([] = every day)
  checkInStart: string | null; // "HH:MM" concert-style check-in gate, or null for any time
  withFood: boolean;
  priceMember: number; // dollars
  priceNonmember: number; // dollars, -1 = members only
  capacity: number | null;
};

export type PromoInput = {
  id?: string;
  code: string;
  discountType: "percent" | "fixed_amount_cents";
  discountValue: number; // percent or dollars
  maxUsesTotal: number | null;
  validUntil: string | null;
};

export type EventInput = {
  id?: string;
  name: string;
  nameBengali: string;
  slug: string;
  theme: string;
  description: string;
  startsAt: string; // yyyy-mm-ddThh:mm
  endsAt: string;
  venueName: string;
  venueAddress: string;
  venueMapUrl: string;
  status: "draft" | "published" | "archived";
  ticketTypes: TicketTypeInput[];
  promoCodes: PromoInput[];
};

export async function saveEventAction(input: EventInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const admin = await requireAdmin();
  const db = getDb();
  await ensureExtraColumns();

  if (!input.name.trim() || !input.slug.trim()) return { ok: false, error: "Name and slug are required." };
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(startsAt < endsAt)) return { ok: false, error: "End must be after start." };
  if (input.ticketTypes.length === 0) return { ok: false, error: "Add at least one ticket type." };

  const days = buildEventDays(input.startsAt, input.endsAt);
  const dayKeys = days.map((d) => d.key);
  const validKeys = new Set(dayKeys);

  const values = {
    name: input.name.trim(),
    nameBengali: input.nameBengali.trim() || null,
    slug: input.slug.trim(),
    theme: input.theme,
    description: input.description,
    startsAt,
    endsAt,
    venueName: input.venueName.trim() || null,
    venueAddress: input.venueAddress.trim() || null,
    venueMapUrl: input.venueMapUrl.trim() || null,
    status: input.status,
    days,
    updatedAt: new Date(),
  };

  let eventId = input.id;
  if (eventId) {
    await db.update(schema.events).set(values).where(eq(schema.events.id, eventId));
  } else {
    const dup = await db.select().from(schema.events).where(eq(schema.events.slug, values.slug));
    if (dup.length > 0) return { ok: false, error: `Slug "${values.slug}" is already taken.` };
    const [ev] = await db.insert(schema.events).values({ ...values, createdBy: admin.userId }).returning();
    eventId = ev.id;
  }

  // ── ticket types: update / insert / remove ──
  // Only reconcile against LIVE (non-archived) rows; archived ones stay hidden.
  const existing = await db
    .select()
    .from(schema.ticketTypes)
    .where(and(eq(schema.ticketTypes.eventId, eventId), isNull(schema.ticketTypes.archivedAt)));
  const keptIds = new Set<string>();
  for (let i = 0; i < input.ticketTypes.length; i++) {
    const t = input.ticketTypes[i];
    // Drop any stale day-keys that no longer belong to this event's date range
    // (e.g. a "thu" left over from an earlier Thu–Sun draft). An empty result
    // means "every day", matching the whole event.
    const ticketDays = (t.dayKeys ?? []).filter((k) => validKeys.has(k));
    const row = {
      eventId,
      name: t.name.trim(),
      ageBand: t.ageBand,
      dayKeys: ticketDays.length ? ticketDays : dayKeys,
      checkInStart: t.checkInStart || null,
      withFood: t.withFood,
      priceMemberCents: Math.round(t.priceMember * 100),
      priceNonmemberCents: t.priceNonmember < 0 ? -1 : Math.round(t.priceNonmember * 100),
      capacity: t.capacity,
      requiresFoodSelection: t.withFood,
      displayOrder: i + 1,
      updatedAt: new Date(),
    };
    if (t.id && existing.some((e) => e.id === t.id)) {
      await db.update(schema.ticketTypes).set(row).where(eq(schema.ticketTypes.id, t.id));
      keptIds.add(t.id);
    } else {
      const [nt] = await db.insert(schema.ticketTypes).values(row).returning();
      keptIds.add(nt.id);
    }
  }
  // Removed rows: hard-delete if nothing was ever sold; otherwise archive
  // (tickets reference ticket_types, so a sold row can't be deleted — archiving
  // hides it from every list + registration while preserving history).
  for (const e of existing) {
    if (keptIds.has(e.id)) continue;
    if (e.soldCount > 0) {
      await db.update(schema.ticketTypes).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(schema.ticketTypes.id, e.id));
    } else {
      await db.delete(schema.ticketTypes).where(eq(schema.ticketTypes.id, e.id));
    }
  }

  // ── promo codes ──
  const existingPromos = await db
    .select()
    .from(schema.promoCodes)
    .where(and(eq(schema.promoCodes.eventId, eventId), isNull(schema.promoCodes.archivedAt)));
  const keptPromos = new Set<string>();
  for (const p of input.promoCodes) {
    if (!p.code.trim()) continue;
    const row = {
      eventId,
      code: p.code.trim().toUpperCase(),
      discountType: p.discountType,
      discountValue: p.discountType === "fixed_amount_cents" ? Math.round(p.discountValue * 100) : Math.round(p.discountValue),
      maxUsesTotal: p.maxUsesTotal,
      validUntil: p.validUntil ? new Date(p.validUntil) : null,
    };
    if (p.id && existingPromos.some((e) => e.id === p.id)) {
      await db.update(schema.promoCodes).set(row).where(eq(schema.promoCodes.id, p.id));
      keptPromos.add(p.id);
    } else {
      const [np] = await db.insert(schema.promoCodes).values({ ...row, createdBy: admin.userId }).returning();
      keptPromos.add(np.id);
    }
  }
  for (const e of existingPromos) {
    if (keptPromos.has(e.id)) continue;
    if (e.currentUses > 0) {
      await db.update(schema.promoCodes).set({ archivedAt: new Date() }).where(eq(schema.promoCodes.id, e.id));
    } else {
      await db.delete(schema.promoCodes).where(eq(schema.promoCodes.id, e.id));
    }
  }

  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: input.id ? "update" : "create",
    entityType: "events",
    entityId: eventId,
    changes: { name: input.name, status: input.status },
  });

  revalidatePath("/admin/events");
  revalidatePath("/");
  revalidatePath("/events");
  return { ok: true, id: eventId };
}
