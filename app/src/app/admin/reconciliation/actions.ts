"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { reconcileWithSquare, applySquareTruth } from "@/lib/payments/reconcile";
import { lookupSquarePaymentSafe } from "@/lib/payments/square";
import { alertFindingApproved } from "@/lib/payments/alerts";

export type ActionResult = { ok: boolean; message: string };

/**
 * Run the check now. Reads Square, compares, and files anything that disagrees
 * into this queue. Changes no payment record — that only ever happens when
 * somebody presses Approve below.
 */
export async function scanNow(days = 30): Promise<ActionResult> {
  await requireSectionAccess("reconciliation");
  try {
    const r = await reconcileWithSquare({ days });
    const open = r.falseNegatives.length + r.falsePositives.length + r.amountMismatches.length + r.orphans.length;
    revalidatePath("/admin/reconciliation");
    if (open === 0) {
      return { ok: true, message: `Checked ${r.squarePayments} Square payment(s) from the last ${days} days. Everything agrees.` };
    }
    return {
      ok: true,
      message:
        `Checked ${r.squarePayments} Square payment(s) from the last ${days} days. ` +
        `${open} disagree${open === 1 ? "s" : ""} with our records` +
        (r.newFindings > 0 ? `, ${r.newFindings} newly added below.` : " — all already listed below.") +
        " Nothing has been changed.",
    };
  } catch (e) {
    return { ok: false, message: `Could not reach Square: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Approve a correction. Only meaningful for a "Square paid, we didn't record it"
 * finding — the one case where there is a correct answer and the system knows
 * how to apply it.
 *
 * Square is re-checked HERE, at the moment of approval, rather than trusting the
 * finding. A queue item may be days old; the payment may since have been
 * refunded, or already settled by a retried webhook. We act on what Square says
 * now, or we act on nothing.
 */
export async function approveFinding(id: string, note?: string): Promise<ActionResult> {
  const admin = await requireSectionAccess("reconciliation");
  const db = getDb();
  const [f] = await db
    .select()
    .from(schema.reconciliationFindings)
    .where(eq(schema.reconciliationFindings.id, id));
  if (!f) return { ok: false, message: "That item is no longer in the queue." };
  if (f.status !== "open") return { ok: false, message: `Already ${f.status} — nothing to do.` };

  if (f.kind !== "false_negative") {
    return {
      ok: false,
      message:
        "There is no correction this can safely apply on its own. Check it in the Square dashboard and " +
        "either fix the record by hand from the Payments page, or dismiss this with a note explaining what you found.",
    };
  }
  if (!f.entityKind || !f.entityId) return { ok: false, message: "This item has no record attached to it." };

  const check = await lookupSquarePaymentSafe(f.squareOrderId);
  if (!check.ok) {
    return { ok: false, message: "Square could not be reached just now. Nothing was changed — please try again shortly." };
  }
  if (!check.payment) {
    return {
      ok: false,
      message:
        "Square no longer shows a completed payment for this order — it may have been refunded or voided since " +
        "this was flagged. Nothing was changed. Dismiss this item with a note.",
    };
  }

  // The correction can legitimately refuse — a walk-in desk booking whose card
  // tender can't be matched up, for one. That is an answer, not a crash: leave
  // the item open and say what to do about it.
  try {
    await applySquareTruth(
      { kind: f.entityKind as "registration" | "donation" | "membership", id: f.entityId },
      check.payment
    );
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "That correction could not be applied. Nothing was changed — dismiss this with a note.",
    };
  }

  const now = new Date();
  await db
    .update(schema.reconciliationFindings)
    .set({
      status: "approved",
      resolvedAt: now,
      resolvedBy: admin.userId,
      resolutionNote: note?.trim() || null,
      dedupeKey: null, // free the unique key so a genuinely new issue can be raised later
    })
    .where(eq(schema.reconciliationFindings.id, id));

  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "approve_reconciliation",
    entityType: "reconciliation_findings",
    entityId: id,
    changes: {
      reference: f.reference,
      kind: f.kind,
      squarePaymentId: check.payment.paymentId,
      squareAmountCents: check.payment.amountCents,
      appliedTo: { kind: f.entityKind, id: f.entityId },
      note: note ?? null,
    },
  });

  await alertFindingApproved({
    reference: f.reference,
    by: admin.email ?? admin.userId,
    amountCents: check.payment.amountCents,
    detail: f.detail ?? "",
  });

  revalidatePath("/admin/reconciliation");
  revalidatePath("/admin/payments");
  return { ok: true, message: `${f.reference ?? "The record"} has been brought in line with Square and the buyer has been emailed.` };
}

/** Dismiss an item. Changes no payment record — it records that a person looked. */
export async function dismissFinding(id: string, note?: string): Promise<ActionResult> {
  const admin = await requireSectionAccess("reconciliation");
  const db = getDb();
  const [f] = await db
    .select()
    .from(schema.reconciliationFindings)
    .where(eq(schema.reconciliationFindings.id, id));
  if (!f) return { ok: false, message: "That item is no longer in the queue." };
  if (f.status !== "open") return { ok: false, message: `Already ${f.status} — nothing to do.` };

  const now = new Date();
  await db
    .update(schema.reconciliationFindings)
    .set({
      status: "dismissed",
      resolvedAt: now,
      resolvedBy: admin.userId,
      resolutionNote: note?.trim() || null,
      dedupeKey: null,
    })
    .where(eq(schema.reconciliationFindings.id, id));

  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "dismiss_reconciliation",
    entityType: "reconciliation_findings",
    entityId: id,
    changes: { reference: f.reference, kind: f.kind, detail: f.detail, note: note ?? null },
  });

  revalidatePath("/admin/reconciliation");
  return { ok: true, message: "Dismissed. Recorded against your name in the audit log." };
}

/** The queue, plus the settled history underneath it. */
export async function listFindings() {
  const db = getDb();
  const rows = await db.select().from(schema.reconciliationFindings);
  const users = await db.select().from(schema.users);
  const emailFor = (id: string | null) => (id ? (users.find((u) => u.id === id)?.email ?? null) : null);
  const sorted = rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    open: sorted.filter((r) => r.status === "open"),
    settled: sorted.filter((r) => r.status !== "open").slice(0, 50).map((r) => ({ ...r, resolvedByEmail: emailFor(r.resolvedBy) })),
  };
}

export async function findingsCount(): Promise<number> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.reconciliationFindings)
      .where(and(eq(schema.reconciliationFindings.status, "open")));
    return rows.length;
  } catch {
    return 0;
  }
}
