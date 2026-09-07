"use server";

/**
 * Projections mutations. Super-admin only, audit-logged, and none of them touch
 * money: this module writes to `projection_scenarios` and
 * `projection_snapshots` and nothing else.
 */
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { calculate } from "@/lib/projections/engine";
import { getActuals } from "@/lib/projections/actuals";
import {
  archiveScenario,
  createScenario,
  getScenario,
  promoteToBaseline,
  takeSnapshot,
  unlockScenario,
  updateScenario,
} from "@/lib/projections/store";
import type { ProjectionModel } from "@/lib/projections/types";

async function requireSuper() {
  const s = await getSession();
  if (!s || s.role !== "super_admin") throw new Error("Super-admin required");
  return s;
}

async function audit(userId: string, action: string, entityId: string, changes?: unknown) {
  try {
    const db = getDb();
    await db.insert(schema.auditLog).values({
      userId,
      action,
      entityType: "projection_scenario",
      entityId,
      changes: changes === undefined ? null : changes,
    });
  } catch {
    /* an audit row that fails must not lose the user's work */
  }
}

export type Result = { ok: boolean; message: string; id?: string };

export async function saveScenarioAction(id: string, model: ProjectionModel, name?: string): Promise<Result> {
  try {
    const me = await requireSuper();
    await updateScenario(id, { model, ...(name ? { name } : {}) }, me.userId);
    await audit(me.userId, "projection_saved", id, { year: model.year, name });
    revalidatePath("/admin/projections");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function createScenarioAction(input: {
  name: string;
  description?: string;
  year: number;
  model: ProjectionModel;
  seededFrom?: string;
}): Promise<Result> {
  try {
    const me = await requireSuper();
    const id = await createScenario({
      year: input.year,
      name: input.name,
      description: input.description ?? null,
      model: { ...input.model, year: input.year },
      seededFrom: input.seededFrom ?? null,
      userId: me.userId,
      email: me.email,
    });
    await audit(me.userId, "projection_created", id, { name: input.name, year: input.year });
    revalidatePath("/admin/projections");
    return { ok: true, message: `Created “${input.name}”.`, id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not create." };
  }
}

export async function deleteScenarioAction(id: string): Promise<Result> {
  try {
    const me = await requireSuper();
    await archiveScenario(id);
    await audit(me.userId, "projection_archived", id);
    revalidatePath("/admin/projections");
    return { ok: true, message: "Deleted." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete." };
  }
}

/**
 * Capture a scenario as its year's baseline: locked, and the thing next year's
 * "seed from baseline" will offer. Actuals already typed into a line replace
 * the projected amount, so the baseline records what HAPPENED, not what was
 * hoped for — which is the entire point of keeping one.
 */
export async function captureBaselineAction(id: string, name: string): Promise<Result> {
  try {
    const me = await requireSuper();
    const row = await getScenario(id);
    if (!row) return { ok: false, message: "Scenario not found." };

    const promoteActuals = (lines: ProjectionModel["costLines"]) =>
      lines.map((l) =>
        l.actualCents !== null && l.actualCents !== undefined
          ? { ...l, amountCents: l.actualCents, confidence: "confirmed" as const }
          : l
      );

    const sealed: ProjectionModel = {
      ...row.model,
      costLines: promoteActuals(row.model.costLines),
      revenueLines: promoteActuals(row.model.revenueLines),
    };

    const newId = await createScenario({
      year: row.year,
      name,
      description: `Captured from “${row.name}” on ${new Date().toLocaleDateString("en-US")}. Actuals promoted over projections; locked.`,
      model: sealed,
      seededFrom: id,
      userId: me.userId,
      email: me.email,
    });
    await promoteToBaseline(newId, me.userId);
    await audit(me.userId, "projection_baseline_captured", newId, { from: id, year: row.year });
    revalidatePath("/admin/projections");
    return { ok: true, message: `“${name}” is now the ${row.year} baseline.`, id: newId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not capture the baseline." };
  }
}

export async function unlockScenarioAction(id: string): Promise<Result> {
  try {
    const me = await requireSuper();
    await unlockScenario(id, me.userId);
    await audit(me.userId, "projection_unlocked", id);
    revalidatePath("/admin/projections");
    return { ok: true, message: "Unlocked — edit with care." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not unlock." };
  }
}

/**
 * Record where this year stands right now. Two of these and the booking-curve
 * forecast starts working; by the fifth it is describing this year rather than
 * last year's shape.
 */
export async function takeSnapshotAction(id: string, label?: string): Promise<Result> {
  try {
    const me = await requireSuper();
    const row = await getScenario(id);
    if (!row) return { ok: false, message: "Scenario not found." };

    const actuals = await getActuals();
    const totals = calculate(row.model);
    await takeSnapshot({
      scenarioId: id,
      label: label ?? null,
      daysOut: actuals.daysOut,
      totals: {
        totalRevenueCents: totals.totalRevenueCents,
        totalExpenseCents: totals.totalExpenseCents,
        profitCents: totals.profitCents,
        plannedHeads: totals.totalHeads,
      },
      actuals: { ...actuals },
      userId: me.userId,
    });
    await audit(me.userId, "projection_snapshot", id, { daysOut: actuals.daysOut, heads: actuals.totalHeads });
    revalidatePath("/admin/projections");
    return { ok: true, message: `Snapshot taken — ${actuals.totalHeads} guests booked.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not take a snapshot." };
  }
}

