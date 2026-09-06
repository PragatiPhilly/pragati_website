import { eq } from "drizzle-orm";
import Link from "next/link";
import "../desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import PartyBuilder, { type BuilderEvent } from "./PartyBuilder";
import type { PersonKind } from "@/lib/desk/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "New walk-in" };

export default async function NewWalkInPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; parent?: string }>;
}) {
  await requireSectionAccess("desk");
  await ensureDeskSchema();
  const { name, parent } = await searchParams;
  const db = getDb();
  const active = await getActiveEvent();
  if (!active) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-2">New walk-in</h1>
        <p className="desk-note">
          No active event is set. <Link href="/admin/events">Set one</Link> before taking walk-ins.
        </p>
      </div>
    );
  }

  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, active.id));
  const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, active.id));
  const live = types.filter((t) => !t.archivedAt);

  // Which kinds of person this event can actually sell a pass to. Showing a
  // "Student" button for an event with no student pass is how a volunteer ends
  // up stuck mid-queue.
  const has = (bands: string[]) => live.some((t) => bands.includes(t.ageBand));
  const kinds: Record<PersonKind, boolean> = {
    adult: has(["adult", "all"]),
    youth: has(["child_5_18", "child_5_12", "all"]),
    under5: has(["child_under_5"]) || has(["child_5_18", "child_5_12", "all"]),
    student: has(["student"]),
    concert: has(["concert"]),
  };

  const adultTypes = live.filter((t) => t.ageBand === "adult" || t.ageBand === "all");
  const foodIsAChoice = adultTypes.some((t) => t.withFood) && adultTypes.some((t) => !t.withFood);

  let parentLabel: string | null = null;
  if (parent) {
    const [p] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, parent));
    if (p) parentLabel = `${p.buyerName} · ${p.confirmationNumber}`;
  }

  const builderEvent: BuilderEvent = {
    id: active.id,
    name: event?.name ?? active.slug,
    days: ((event?.days as { key: string; label: string }[] | null) ?? []).map((d) => ({ key: d.key, label: d.label })),
    kinds,
    foodIsAChoice,
  };

  return (
    <PartyBuilder
      event={builderEvent}
      presetName={name ?? ""}
      parentRegistrationId={parent ?? null}
      parentLabel={parentLabel}
    />
  );
}
