/** Server side of the homepage box (spec/20) — reads config + events. */
import { desc, lt, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getAllConfig, getConfig, setConfig } from "@/lib/system-config";
import { cleanHomeBox, eventDatesLabel, homeBoxKey, parseHomeBox, suggestedHomeBox, type HomeBox } from "@/lib/home-box";

export async function getHomeBox(eventId: string): Promise<HomeBox> {
  try {
    return parseHomeBox(await getConfig<unknown>(homeBoxKey(eventId)));
  } catch {
    return parseHomeBox(null); // never let the box take the homepage down
  }
}

export async function saveHomeBox(eventId: string, box: HomeBox, by?: string) {
  await setConfig(homeBoxKey(eventId), cleanHomeBox(box), by);
}

/**
 * Values the form offers when "numbers" is picked: the thank-you card's numbers
 * and the latest event that finished before this one starts.
 */
export async function suggestHomeBoxFor(event: { id?: string; startsAt?: Date } | null): Promise<HomeBox> {
  const db = getDb();
  const before = event?.startsAt ?? new Date();
  const rows = await db
    .select()
    .from(schema.events)
    .where(event?.id ? ne(schema.events.id, event.id) : lt(schema.events.endsAt, before))
    .orderBy(desc(schema.events.endsAt));
  const past = rows.find((e) => e.endsAt <= before && e.status !== "cancelled") ?? null;
  return suggestedHomeBox(
    await getAllConfig(),
    past ? { name: past.name, nameBengali: past.nameBengali, dates: eventDatesLabel(past), venueName: past.venueName } : null,
  );
}
