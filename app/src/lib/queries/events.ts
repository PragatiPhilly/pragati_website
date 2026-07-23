import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";

export type EventDay = { key: string; label: string; date: string };

export async function getActiveEvent() {
  const db = getDb();
  const slug = await getConfig<string>("active_event_slug");
  if (!slug) return null;
  const [event] = await db.select().from(schema.events).where(eq(schema.events.slug, slug));
  return event ?? null;
}

export async function listPublishedEvents() {
  const db = getDb();
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.status, "published"))
    .orderBy(asc(schema.events.startsAt));
}

export async function getEventBySlug(slug: string) {
  const db = getDb();
  const [event] = await db.select().from(schema.events).where(eq(schema.events.slug, slug));
  if (!event) return null;
  const ticketTypes = await db
    .select()
    .from(schema.ticketTypes)
    .where(and(eq(schema.ticketTypes.eventId, event.id), isNull(schema.ticketTypes.archivedAt)))
    .orderBy(asc(schema.ticketTypes.displayOrder));
  return { ...event, ticketTypes };
}
