/**
 * Follow-ups — the queue that replaces the Post-it.
 *
 * The desk's second principle: incomplete information is a STATE, not an error.
 * A guest with no email address still gets a pass and still walks in; what we
 * do NOT do is write `noemail@example.com` into the roster forever. The gap
 * becomes a typed, assignable row with an owner and a resolution.
 *
 * Deduped the same way reconciliation_findings are: a partial unique index on
 * `dedupe_key WHERE status = 'open'`, so raising the same gap twice is a no-op
 * rather than two identical rows nobody wants to read.
 *
 * There are exactly two exits — resolved (someone supplied the thing) and
 * waived (a named person decided it never will be, with a note). Nothing
 * expires on its own.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { DeskError, type DeskActor } from "@/lib/desk/guards";
import { FOLLOWUP_LABEL, type FollowupKind } from "@/lib/desk/constants";
import { recordOrderEvent } from "@/lib/desk/events";

export type Followup = typeof schema.deskFollowups.$inferSelect;

export async function raiseFollowup(input: {
  kind: FollowupKind;
  registrationId?: string | null;
  paymentId?: string | null;
  detail?: string;
  assignedTo?: string | null;
  createdBy?: string | null;
  dueAt?: Date | null;
}): Promise<void> {
  await ensureDeskSchema();
  const db = getDb();
  const dedupeKey = `${input.kind}:${input.paymentId ?? input.registrationId ?? "none"}`;
  try {
    await db
      .insert(schema.deskFollowups)
      .values({
        kind: input.kind,
        registrationId: input.registrationId ?? null,
        paymentId: input.paymentId ?? null,
        detail: input.detail ?? null,
        assignedTo: input.assignedTo ?? null,
        createdBy: input.createdBy ?? null,
        dueAt: input.dueAt ?? null,
        dedupeKey,
      })
      .onConflictDoNothing();
  } catch {
    /* the unique index rejected a duplicate — exactly what it is for */
  }
  if (input.registrationId) {
    await recordOrderEvent({
      registrationId: input.registrationId,
      type: "followup_raised",
      summary: FOLLOWUP_LABEL[input.kind] + (input.detail ? ` — ${input.detail}` : ""),
      payload: { kind: input.kind },
    });
  }
}

/** Close every open follow-up of a kind for a record (used when the gap is filled). */
export async function clearFollowups(
  kind: FollowupKind,
  ref: { registrationId?: string; paymentId?: string },
  actor: DeskActor | null,
  note: string
): Promise<void> {
  await ensureDeskSchema();
  const db = getDb();
  const where = ref.paymentId
    ? and(eq(schema.deskFollowups.kind, kind), eq(schema.deskFollowups.paymentId, ref.paymentId))
    : and(eq(schema.deskFollowups.kind, kind), eq(schema.deskFollowups.registrationId, ref.registrationId ?? ""));
  try {
    await db
      .update(schema.deskFollowups)
      .set({
        status: "resolved",
        resolvedBy: actor?.userId ?? null,
        resolvedAt: new Date(),
        resolutionNote: note,
        // Free the dedupe key so a genuinely new gap of the same kind can be
        // raised later (the same trick the reconciliation queue uses).
        dedupeKey: null,
      })
      .where(and(where, eq(schema.deskFollowups.status, "open")));
  } catch {
    /* best effort */
  }
}

export async function resolveFollowup(id: string, actor: DeskActor, note: string, waive = false): Promise<void> {
  await ensureDeskSchema();
  const db = getDb();
  const [row] = await db.select().from(schema.deskFollowups).where(eq(schema.deskFollowups.id, id));
  if (!row) throw new DeskError("That item is no longer there.");
  if (row.status !== "open") throw new DeskError("That item has already been dealt with.");
  if (waive && !note.trim()) throw new DeskError("Say why you're dropping this — it stays on the record.");

  await db
    .update(schema.deskFollowups)
    .set({
      status: waive ? "waived" : "resolved",
      resolvedBy: actor.userId,
      resolvedAt: new Date(),
      resolutionNote: note.trim() || null,
      dedupeKey: null,
    })
    .where(eq(schema.deskFollowups.id, id));

  if (row.registrationId) {
    await recordOrderEvent({
      registrationId: row.registrationId,
      type: "followup_resolved",
      summary: `${FOLLOWUP_LABEL[row.kind as FollowupKind] ?? row.kind} — ${waive ? "waived" : "resolved"}${note ? `: ${note}` : ""}`,
      actor,
      payload: { kind: row.kind, waived: waive },
    });
  }
}

export type FollowupFilter = { status?: "open" | "resolved" | "waived" | "all"; kind?: FollowupKind };

export async function listFollowups(filter: FollowupFilter = {}): Promise<
  (Followup & { conf: string | null; buyerName: string | null; buyerEmail: string | null; buyerPhone: string | null })[]
> {
  await ensureDeskSchema();
  const db = getDb();
  try {
    const conds = [];
    if (!filter.status || filter.status === "open") conds.push(eq(schema.deskFollowups.status, "open"));
    else if (filter.status !== "all") conds.push(eq(schema.deskFollowups.status, filter.status));
    if (filter.kind) conds.push(eq(schema.deskFollowups.kind, filter.kind));

    const rows = await db
      .select({
        f: schema.deskFollowups,
        conf: schema.registrations.confirmationNumber,
        buyerName: schema.registrations.buyerName,
        buyerEmail: schema.registrations.buyerEmail,
        buyerPhone: schema.registrations.buyerPhone,
      })
      .from(schema.deskFollowups)
      .leftJoin(schema.registrations, eq(schema.deskFollowups.registrationId, schema.registrations.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.deskFollowups.createdAt))
      .limit(500);
    return rows.map((r) => ({ ...r.f, conf: r.conf, buyerName: r.buyerName, buyerEmail: r.buyerEmail, buyerPhone: r.buyerPhone }));
  } catch {
    return [];
  }
}

export async function countOpenFollowups(): Promise<number> {
  try {
    await ensureDeskSchema();
    const db = getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.deskFollowups)
      .where(eq(schema.deskFollowups.status, "open"));
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

/** Open follow-ups attached to one order, for the order screen. */
export async function followupsForOrder(registrationId: string): Promise<Followup[]> {
  try {
    await ensureDeskSchema();
    const db = getDb();
    return await db
      .select()
      .from(schema.deskFollowups)
      .where(
        and(
          eq(schema.deskFollowups.registrationId, registrationId),
          or(eq(schema.deskFollowups.status, "open"), isNull(schema.deskFollowups.status))
        )
      )
      .orderBy(desc(schema.deskFollowups.createdAt));
  } catch {
    return [];
  }
}

/**
 * The gaps a new order has, derived from what was actually typed. Called once
 * at creation; each one becomes a chip on the order screen and a row in the
 * queue. Nothing here blocks anybody from walking in.
 */
export function gapsFor(input: {
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  people: { firstName: string; age?: number; kind: string }[];
}): { kind: FollowupKind; detail: string }[] {
  const gaps: { kind: FollowupKind; detail: string }[] = [];
  if (!input.buyerEmail) gaps.push({ kind: "missing_email", detail: "No email taken — tickets could not be sent." });
  if (!input.buyerPhone) gaps.push({ kind: "missing_phone", detail: "No phone number taken." });
  const noAge = input.people.filter((p) => (p.kind === "youth" || p.kind === "under5") && p.age === undefined);
  if (noAge.length)
    gaps.push({ kind: "missing_age", detail: `Age not given for ${noAge.map((p) => p.firstName).join(", ")}.` });
  return gaps;
}

export async function bulkResolve(ids: string[], actor: DeskActor, note: string): Promise<number> {
  if (ids.length === 0) return 0;
  await ensureDeskSchema();
  const db = getDb();
  const res = await db
    .update(schema.deskFollowups)
    .set({ status: "resolved", resolvedBy: actor.userId, resolvedAt: new Date(), resolutionNote: note, dedupeKey: null })
    .where(and(inArray(schema.deskFollowups.id, ids), eq(schema.deskFollowups.status, "open")))
    .returning({ id: schema.deskFollowups.id });
  return res.length;
}
