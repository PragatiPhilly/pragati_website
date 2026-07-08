"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";

export type TicketTypeInput = {
  id?: string;
  name: string;
  ageBand: string;
  fullPass: boolean;
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

function buildDays(startsAt: Date, endsAt: Date) {
  const days: { key: string; label: string; date: string }[] = [];
  const d = new Date(startsAt);
  d.setHours(0, 0, 0, 0);
  const end = new Date(endsAt);
  const seen = new Set<string>();
  while (d <= end && days.length < 7) {
    let key = d.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
    while (seen.has(key)) key = `${key}2`;
    seen.add(key);
    days.push({
      key,
      label: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
      date: d.toISOString().slice(0, 10),
    });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export async function saveEventAction(input: EventInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const admin = await requireAdmin();
  const db = getDb();

  if (!input.name.trim() || !input.slug.trim()) return { ok: false, error: "Name and slug are required." };
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(startsAt < endsAt)) return { ok: false, error: "End must be after start." };
  if (input.ticketTypes.length === 0) return { ok: false, error: "Add at least one ticket type." };

  const days = buildDays(startsAt, endsAt);
  const dayKeys = days.map((d) => d.key);

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

  // ── ticket types: update / insert / remove-if-unsold ──
  const existing = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, eventId));
  const keptIds = new Set<string>();
  for (let i = 0; i < input.ticketTypes.length; i++) {
    const t = input.ticketTypes[i];
    const row = {
      eventId,
      name: t.name.trim(),
      ageBand: t.ageBand,
      dayKeys: t.fullPass ? dayKeys : null,
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
  for (const e of existing) {
    if (!keptIds.has(e.id) && e.soldCount === 0) {
      await db.delete(schema.ticketTypes).where(eq(schema.ticketTypes.id, e.id));
    }
  }

  // ── promo codes ──
  const existingPromos = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.eventId, eventId));
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
    if (!keptPromos.has(e.id) && e.currentUses === 0) {
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
