/**
 * Adjustments — every cent that was NOT collected, and why.
 *
 * A comp is not "price = 0". The list price stays exactly what it was, and the
 * waiver sits beside it with a reason code and the name of whoever approved it.
 * That way "we gave away $1,840 of passes, $1,100 of it to volunteers" is a
 * query, not an archaeology project — and a pass is still issued, so comped
 * people appear in the headcount and the kitchen's numbers.
 *
 * Sign convention, enforced here and asserted by the invariant test:
 * `amountCents` is always the amount taken OFF what the guest owes. A surcharge
 * is therefore stored negative.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { DeskError, type DeskActor } from "@/lib/desk/guards";
import { ADJUSTMENT_REASONS, type AdjustmentKind } from "@/lib/desk/constants";
import { deskOrderSummary } from "@/lib/desk/summary";
import { recordOrderEvent } from "@/lib/desk/events";
import { recomputeOrder } from "@/lib/desk/orders";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function addAdjustment(
  input: {
    registrationId: string;
    kind: AdjustmentKind;
    /** Positive dollars off. For a full comp, pass the remaining balance. */
    amountCents: number;
    reasonCode: string;
    note?: string;
  },
  actor: DeskActor
): Promise<void> {
  // Comps and write-offs are money the organisation decides not to collect.
  // A volunteer taking cash all evening is not the person who gets to make
  // that call — the screen asks for an admin, and so does the server.
  if (!actor.isAdmin) throw new DeskError("Making something free or giving a discount needs an admin. Ask one to approve it here.");
  await ensureDeskSchema();

  const reason = ADJUSTMENT_REASONS.find((r) => r.code === input.reasonCode);
  if (!reason) throw new DeskError("Pick a reason.");
  if (!reason.kinds.includes(input.kind)) throw new DeskError(`"${reason.label}" doesn't fit that choice.`);
  if (input.reasonCode === "other" && !input.note?.trim()) throw new DeskError("Say what the reason is.");
  if (input.amountCents === 0) throw new DeskError("Type an amount.");

  const s = await deskOrderSummary(input.registrationId);
  if (!s) throw new DeskError("That booking no longer exists.");
  if (s.reg.deskState === "voided") throw new DeskError("This booking was cancelled.");

  const signed = input.kind === "surcharge" ? -Math.abs(input.amountCents) : Math.abs(input.amountCents);
  if (signed > 0 && signed > s.balanceCents + s.collectedCents)
    throw new DeskError(`That's more than the booking is worth (${fmt(s.dueCents)}).`);

  const db = getDb();
  await db.insert(schema.deskAdjustments).values({
    registrationId: input.registrationId,
    kind: input.kind,
    amountCents: signed,
    reasonCode: input.reasonCode,
    note: input.note?.trim() || null,
    requestedBy: actor.userId,
    approvedBy: actor.userId,
  });

  await recordOrderEvent({
    registrationId: input.registrationId,
    type: "adjustment_added",
    summary: `${labelFor(input.kind)} ${fmt(Math.abs(signed))} — ${reason.label}${input.note ? `: ${input.note.trim()}` : ""}`,
    actor,
    payload: { kind: input.kind, amountCents: signed, reasonCode: input.reasonCode },
  });
  await recomputeOrder(input.registrationId, actor);
}

function labelFor(kind: AdjustmentKind): string {
  return kind === "comp" ? "Comped" : kind === "discount" ? "Discount" : kind === "writeoff" ? "Written off" : "Surcharge";
}

export async function voidAdjustment(id: string, why: string, actor: DeskActor): Promise<void> {
  if (!actor.isAdmin) throw new DeskError("Only an admin can undo this.");
  if (!why.trim()) throw new DeskError("Say why.");
  const db = getDb();
  const [row] = await db.select().from(schema.deskAdjustments).where(eq(schema.deskAdjustments.id, id));
  if (!row) throw new DeskError("That's no longer there.");
  if (row.voidedAt) return;
  await db
    .update(schema.deskAdjustments)
    .set({ voidedAt: new Date(), voidedBy: actor.userId, note: [row.note, `Undone: ${why.trim()}`].filter(Boolean).join(" · ") })
    .where(eq(schema.deskAdjustments.id, id));
  await recordOrderEvent({
    registrationId: row.registrationId,
    type: "adjustment_voided",
    summary: `Undid ${labelFor(row.kind as AdjustmentKind)} ${fmt(Math.abs(row.amountCents))} — ${why.trim()}`,
    actor,
    payload: { adjustmentId: id },
  });
  await recomputeOrder(row.registrationId, actor);
}

/** What was given away, for the post-event report. */
export async function adjustmentTotals(): Promise<{ reasonCode: string; kind: string; amountCents: number; n: number }[]> {
  await ensureDeskSchema();
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(schema.deskAdjustments)
      .where(and(eq(schema.deskAdjustments.kind, schema.deskAdjustments.kind)));
    const map = new Map<string, { reasonCode: string; kind: string; amountCents: number; n: number }>();
    for (const r of rows) {
      if (r.voidedAt) continue;
      const key = `${r.kind}:${r.reasonCode}`;
      const cur = map.get(key) ?? { reasonCode: r.reasonCode, kind: r.kind, amountCents: 0, n: 0 };
      cur.amountCents += r.amountCents;
      cur.n += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.amountCents - a.amountCents);
  } catch {
    return [];
  }
}
