/**
 * The offline walk-in notebook (Admin → Walk-in desk → Offline notebook).
 *
 * When the venue Wi-Fi drops, volunteers keep writing walk-ins into a page
 * that saves them ON THE TABLET. When the connection is back, each entry is
 * turned into a normal walk-in desk booking — through createDeskOrder and
 * addTender, the same calls the desk itself makes — so prices, passes, seats,
 * the cash box and "Money to bank" all behave exactly as for a desk sale.
 *
 * Safe to sync twice: the entry's id is the order's idempotency key, and a
 * payment is only added while the order still shows a balance.
 */
import { getDb, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { createDeskOrder, closeOrder, admitWithBalance } from "./orders";
import { addTender } from "./tenders";
import { deskOrderSummary } from "./summary";
import { currentShift } from "./shifts";
import { DeskError, type DeskActor } from "./guards";
import type { DeskPerson } from "./party";
import type { PersonKind } from "./constants";

export type OfflineEntry = {
  id: string; // client uuid → idempotency key
  createdAt: string; // ISO, when it was written down
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  people: { name: string; ticketTypeId: string; age?: number; foodPref: "veg" | "non_veg" | "kid" | "none" }[];
  payment: "cash" | "zelle_org" | "unpaid";
  amountCents: number; // what was actually handed over
  note?: string;
};

export type OfflineSyncResult = { conf: string; registrationId: string; notes: string[] };

const KIND_BY_BAND: Record<string, PersonKind> = {
  adult: "adult",
  all: "adult",
  student: "student",
  child_5_18: "youth",
  child_5_12: "youth",
  child_under_5: "under5",
  concert: "concert",
};

export async function importOfflineEntry(entry: OfflineEntry, actor: DeskActor): Promise<OfflineSyncResult> {
  if (!entry?.id || !/^[A-Za-z0-9-]{8,64}$/.test(entry.id)) throw new DeskError("This entry is damaged — re-enter it at the desk.");
  if (!entry.buyerName?.trim()) throw new DeskError("No family name on this entry.");
  if (!entry.people?.length) throw new DeskError("No people on this entry.");
  const db = getDb();
  const { getActiveEvent } = await import("@/lib/queries/events");
  const event = await getActiveEvent();
  if (!event) throw new DeskError("No active event.");
  const eventDays = ((event.days as { key: string }[] | null) ?? []).map((d) => d.key);
  const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, event.id));

  const people: DeskPerson[] = entry.people.map((p, i) => {
    const tt = types.find((t) => t.id === p.ticketTypeId);
    if (!tt) throw new DeskError(`The pass picked for ${p.name || "someone"} no longer exists — enter this family at the desk.`);
    const kind = KIND_BY_BAND[tt.ageBand] ?? "adult";
    const [first, ...rest] = (p.name || "Guest").trim().split(/\s+/);
    const days = Array.isArray(tt.dayKeys) && (tt.dayKeys as string[]).length ? (tt.dayKeys as string[]) : eventDays;
    const foodPref = !tt.withFood || kind === "concert" ? "none" : kind === "youth" || kind === "under5" ? "kid" : p.foodPref === "veg" ? "veg" : "non_veg";
    return { ref: `p${i}`, firstName: first, lastName: rest.join(" ") || undefined, kind, age: p.age, days, withFood: tt.withFood && kind !== "concert", foodPref };
  });
  // A child goes with the first adult in the same family.
  const adult = people.find((p) => p.kind === "adult" || p.kind === "student");
  for (const p of people) if ((p.kind === "youth" || p.kind === "under5") && adult) p.guardianRef = adult.ref;

  const shift = await currentShift(event.id);
  const when = new Date(entry.createdAt);
  const order = await createDeskOrder(
    {
      eventId: event.id,
      idempotencyKey: `offline:${entry.id}`,
      buyerName: entry.buyerName.trim(),
      buyerEmail: entry.buyerEmail?.trim() || undefined,
      buyerPhone: entry.buyerPhone?.trim() || undefined,
      people,
      note: `Taken offline ${isNaN(+when) ? "" : when.toLocaleString("en-US", { timeZone: "America/New_York" })}${entry.note ? ` — ${entry.note}` : ""}`,
      shiftId: shift?.id ?? null,
    },
    actor
  );

  const notes: string[] = [];
  const s = await deskOrderSummary(order.registrationId);
  if (s && s.balanceCents > 0 && entry.amountCents > 0 && entry.payment !== "unpaid") {
    const amount = Math.min(entry.amountCents, s.balanceCents);
    if (entry.payment === "cash") {
      if (!shift) notes.push("Cash NOT recorded — no cash box is open. Open one, then take the cash on this booking.");
      else
        await addTender(
          { registrationId: order.registrationId, method: "cash", amountCents: amount, shiftId: shift.id, cash: { cashTenderedCents: entry.amountCents } },
          actor
        );
    } else {
      await addTender(
        { registrationId: order.registrationId, method: "zelle", amountCents: amount, shiftId: shift?.id ?? null, zelle: { sentTo: "org", confirmationSeen: true } },
        actor
      );
    }
    if (entry.amountCents > s.balanceCents) notes.push(`They handed over more than the price — check the change / donation on the booking.`);
  }
  const after = await deskOrderSummary(order.registrationId);
  if (after && after.balanceCents <= 0 && after.pendingCents <= 0) {
    await closeOrder(order.registrationId, actor).catch(() => notes.push("Paid — finish the booking at the desk."));
  } else if (after && after.balanceCents > 0) {
    notes.push(`Still owes $${(after.balanceCents / 100).toFixed(2)} (the website price may differ from what was written down).`);
    // They are already inside — they were let in while the Wi-Fi was down.
    await admitWithBalance(order.registrationId, actor).catch((e) => notes.push(e instanceof Error ? e.message : "Let them in at the desk."));
  }
  if (order.reused) notes.unshift("Already synced earlier — nothing added twice.");
  return { conf: order.confirmationNumber, registrationId: order.registrationId, notes };
}
