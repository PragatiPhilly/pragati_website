/**
 * Reading and writing scenarios. Server-only.
 *
 * Every write is guarded by the caller (app/admin/projections/actions.ts holds
 * the super-admin check). Nothing here touches money — see actuals.ts.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureProjectionsSchema } from "./ensure";
import { seedScenarios2024 } from "./seed-2024";
import type { ProjectionModel } from "./types";

export type ScenarioRow = {
  id: string;
  year: number;
  name: string;
  description: string | null;
  kind: string;
  isBaseline: boolean;
  seededFrom: string | null;
  model: ProjectionModel;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByEmail: string | null;
};

function toRow(r: typeof schema.projectionScenarios.$inferSelect): ScenarioRow {
  return {
    id: r.id,
    year: r.year,
    name: r.name,
    description: r.description,
    kind: r.kind,
    isBaseline: r.isBaseline,
    seededFrom: r.seededFrom,
    model: r.model as ProjectionModel,
    lockedAt: r.lockedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdByEmail: r.createdByEmail,
  };
}

/**
 * Plant the 2024 workbook the first time anyone opens the section, so the page
 * is never an empty state — you arrive and the five plans the committee argued
 * about in 2024 are already there to poke at.
 *
 * Idempotent: keyed on "any 2024 row exists". Two instances cold-starting at
 * once can race, and the worst case is a duplicate set, which the unique
 * baseline index prevents for the one row that matters.
 */
export async function seedIfEmpty(): Promise<void> {
  await ensureProjectionsSchema();
  const db = getDb();
  try {
    const existing = await db
      .select({ id: schema.projectionScenarios.id })
      .from(schema.projectionScenarios)
      .limit(1);
    if (existing.length > 0) return;

    for (const s of seedScenarios2024()) {
      await db
        .insert(schema.projectionScenarios)
        .values({
          year: 2024,
          name: s.name,
          description: s.description,
          kind: s.isBaseline ? "baseline" : "scenario",
          isBaseline: !!s.isBaseline,
          model: s.model,
          lockedAt: s.isBaseline ? new Date() : null,
          createdByEmail: "seed (2024 workbook)",
        })
        .onConflictDoNothing();
    }
  } catch {
    /* a seed that fails is not worth a 500 — the page renders empty and
       "New scenario" still works */
  }
}

export async function listScenarios(): Promise<ScenarioRow[]> {
  await ensureProjectionsSchema();
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(schema.projectionScenarios)
      .where(isNull(schema.projectionScenarios.archivedAt))
      .orderBy(desc(schema.projectionScenarios.year), asc(schema.projectionScenarios.createdAt));
    return rows.map(toRow);
  } catch {
    return [];
  }
}

export async function getScenario(id: string): Promise<ScenarioRow | null> {
  await ensureProjectionsSchema();
  const db = getDb();
  try {
    const [row] = await db
      .select()
      .from(schema.projectionScenarios)
      .where(eq(schema.projectionScenarios.id, id));
    return row ? toRow(row) : null;
  } catch {
    return null;
  }
}

export async function getBaseline(year: number): Promise<ScenarioRow | null> {
  await ensureProjectionsSchema();
  const db = getDb();
  try {
    const [row] = await db
      .select()
      .from(schema.projectionScenarios)
      .where(
        and(
          eq(schema.projectionScenarios.year, year),
          eq(schema.projectionScenarios.isBaseline, true),
          isNull(schema.projectionScenarios.archivedAt)
        )
      );
    return row ? toRow(row) : null;
  } catch {
    return null;
  }
}

export async function createScenario(input: {
  year: number;
  name: string;
  description?: string | null;
  model: ProjectionModel;
  seededFrom?: string | null;
  isBaseline?: boolean;
  userId?: string | null;
  email?: string | null;
}): Promise<string> {
  await ensureProjectionsSchema();
  const db = getDb();
  const [row] = await db
    .insert(schema.projectionScenarios)
    .values({
      year: input.year,
      name: input.name,
      description: input.description ?? null,
      kind: input.isBaseline ? "baseline" : "scenario",
      isBaseline: !!input.isBaseline,
      seededFrom: input.seededFrom ?? null,
      model: input.model,
      lockedAt: input.isBaseline ? new Date() : null,
      createdBy: input.userId ?? null,
      createdByEmail: input.email ?? null,
      updatedBy: input.userId ?? null,
    })
    .returning({ id: schema.projectionScenarios.id });
  return row.id;
}

export async function updateScenario(
  id: string,
  patch: { name?: string; description?: string | null; model?: ProjectionModel },
  userId?: string | null
): Promise<void> {
  await ensureProjectionsSchema();
  const db = getDb();
  const existing = await getScenario(id);
  if (!existing) throw new Error("Scenario not found");
  // A captured baseline is the record of a finished year. Duplicating it is the
  // supported way to change it; editing it in place is not.
  if (existing.lockedAt) throw new Error("This baseline is locked. Duplicate it to make changes.");

  await db
    .update(schema.projectionScenarios)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      updatedBy: userId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.projectionScenarios.id, id));
}

export async function archiveScenario(id: string): Promise<void> {
  await ensureProjectionsSchema();
  const db = getDb();
  const existing = await getScenario(id);
  if (!existing) return;
  if (existing.lockedAt) throw new Error("A locked baseline cannot be deleted.");
  await db
    .update(schema.projectionScenarios)
    .set({ archivedAt: new Date(), isBaseline: false })
    .where(eq(schema.projectionScenarios.id, id));
}

/**
 * Promote a scenario to its year's baseline: locked, and the one that "seed
 * from baseline" will offer next year. Any previous baseline for that year
 * steps down first, so the partial unique index is never violated.
 */
export async function promoteToBaseline(id: string, userId?: string | null): Promise<void> {
  await ensureProjectionsSchema();
  const db = getDb();
  const target = await getScenario(id);
  if (!target) throw new Error("Scenario not found");

  await db
    .update(schema.projectionScenarios)
    .set({ isBaseline: false, kind: "scenario", lockedAt: null })
    .where(
      and(
        eq(schema.projectionScenarios.year, target.year),
        eq(schema.projectionScenarios.isBaseline, true)
      )
    );

  await db
    .update(schema.projectionScenarios)
    .set({ isBaseline: true, kind: "baseline", lockedAt: new Date(), updatedBy: userId ?? null })
    .where(eq(schema.projectionScenarios.id, id));
}

export async function unlockScenario(id: string, userId?: string | null): Promise<void> {
  await ensureProjectionsSchema();
  const db = getDb();
  await db
    .update(schema.projectionScenarios)
    .set({ lockedAt: null, updatedBy: userId ?? null })
    .where(eq(schema.projectionScenarios.id, id));
}

// ── snapshots ───────────────────────────────────────────────────

export type SnapshotRow = {
  id: string;
  scenarioId: string;
  label: string | null;
  takenAt: Date;
  daysOut: number | null;
  totals: Record<string, number> | null;
  actuals: Record<string, unknown> | null;
};

export async function listSnapshots(scenarioId: string): Promise<SnapshotRow[]> {
  await ensureProjectionsSchema();
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(schema.projectionSnapshots)
      .where(eq(schema.projectionSnapshots.scenarioId, scenarioId))
      .orderBy(asc(schema.projectionSnapshots.takenAt));
    return rows.map((r) => ({
      id: r.id,
      scenarioId: r.scenarioId,
      label: r.label,
      takenAt: r.takenAt,
      daysOut: r.daysOut,
      totals: r.totals as Record<string, number> | null,
      actuals: r.actuals as Record<string, unknown> | null,
    }));
  } catch {
    return [];
  }
}

export async function takeSnapshot(input: {
  scenarioId: string;
  label?: string | null;
  daysOut?: number | null;
  totals: Record<string, number>;
  actuals: Record<string, unknown>;
  userId?: string | null;
}): Promise<void> {
  await ensureProjectionsSchema();
  const db = getDb();
  await db.insert(schema.projectionSnapshots).values({
    scenarioId: input.scenarioId,
    label: input.label ?? null,
    daysOut: input.daysOut ?? null,
    totals: input.totals,
    actuals: input.actuals,
    createdBy: input.userId ?? null,
  });
}


/** Every snapshot, grouped by scenario — one query instead of one per chip. */
export async function listAllSnapshots(): Promise<Record<string, SnapshotRow[]>> {
  await ensureProjectionsSchema();
  const db = getDb();
  const out: Record<string, SnapshotRow[]> = {};
  try {
    const rows = await db
      .select()
      .from(schema.projectionSnapshots)
      .orderBy(asc(schema.projectionSnapshots.takenAt));
    for (const r of rows) {
      (out[r.scenarioId] ??= []).push({
        id: r.id,
        scenarioId: r.scenarioId,
        label: r.label,
        takenAt: r.takenAt,
        daysOut: r.daysOut,
        totals: r.totals as Record<string, number> | null,
        actuals: r.actuals as Record<string, unknown> | null,
      });
    }
  } catch {
    /* no snapshots yet */
  }
  return out;
}
