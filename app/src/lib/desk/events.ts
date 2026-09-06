/**
 * The order timeline.
 *
 * Append-only, one row per thing a person did. Two audiences:
 *
 *  - the volunteer, who needs to see what just happened to the order in front
 *    of them ("Rina took $200 cash · 6:14pm"), and
 *  - whoever asks about this order three weeks later in a committee meeting.
 *
 * Money-affecting actions ALSO write to `audit_log`, which is the existing
 * organisation-wide record. The timeline is per-order and readable; the audit
 * log is complete and boring. Neither is a substitute for the other.
 */
import { getDb, schema } from "@/db/client";
import type { OrderEventType } from "@/lib/desk/constants";
import type { DeskActor } from "@/lib/desk/guards";

/** Event types that move money and therefore also belong in audit_log. */
const AUDITED: OrderEventType[] = [
  "tender_added",
  "tender_confirmed",
  "tender_failed",
  "tender_voided",
  "tender_reversed",
  "custody_cleared",
  "adjustment_added",
  "adjustment_voided",
  "admitted_with_balance",
  "order_voided",
  "order_reopened",
  "order_settled",
];

export async function recordOrderEvent(input: {
  registrationId: string;
  type: OrderEventType;
  summary: string;
  actor?: Pick<DeskActor, "userId" | "email"> | null;
  shiftId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  try {
    await db.insert(schema.deskOrderEvents).values({
      registrationId: input.registrationId,
      type: input.type,
      summary: input.summary,
      actorUserId: input.actor?.userId ?? null,
      actorEmail: input.actor?.email ?? null,
      shiftId: input.shiftId ?? null,
      payload: (input.payload ?? null) as unknown as Record<string, unknown>,
    });
  } catch {
    /* a timeline row is never worth failing the action that produced it */
  }

  if (!AUDITED.includes(input.type)) return;
  try {
    await db.insert(schema.auditLog).values({
      userId: input.actor?.userId ?? null,
      action: `desk_${input.type}`,
      entityType: "registrations",
      entityId: input.registrationId,
      changes: { summary: input.summary, ...(input.payload ?? {}) } as unknown as Record<string, unknown>,
    });
  } catch {
    /* ditto */
  }
}

export async function listOrderEvents(registrationId: string) {
  const db = getDb();
  try {
    const { eq, asc } = await import("drizzle-orm");
    return await db
      .select()
      .from(schema.deskOrderEvents)
      .where(eq(schema.deskOrderEvents.registrationId, registrationId))
      .orderBy(asc(schema.deskOrderEvents.createdAt));
  } catch {
    return [];
  }
}
