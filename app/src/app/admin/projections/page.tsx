/**
 * Projections — the yearly budget model. Super admins only.
 *
 * The section key lives in LOCKED_SECTIONS, so `requireSectionAccess` sends
 * anyone else back to their own first section; this page never renders for a
 * non-super-admin. Everything below is read-only against the rest of the app.
 *
 * Spec: spec/14-projections.md
 */
import "./projections.css";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActuals, EMPTY_ACTUALS, type HeadActuals } from "@/lib/projections/actuals";
import { listAllSnapshots, listScenarios, seedIfEmpty } from "@/lib/projections/store";
import ProjectionsClient from "./ProjectionsClient";

export const dynamic = "force-dynamic";

export default async function ProjectionsPage() {
  await requireSectionAccess("projections");

  // First visit plants the 2024 workbook, so nobody meets an empty screen.
  await seedIfEmpty();

  const [scenarios, snapshots] = await Promise.all([listScenarios(), listAllSnapshots()]);

  // Live figures are a bonus, never a dependency: a ledger hiccup must not stop
  // someone modelling next year's budget.
  let actuals: HeadActuals = EMPTY_ACTUALS;
  try {
    actuals = await getActuals();
  } catch {
    /* keep the empty shape */
  }

  return (
    <ProjectionsClient
      scenarios={scenarios.map((s) => ({
        id: s.id,
        year: s.year,
        name: s.name,
        description: s.description,
        isBaseline: s.isBaseline,
        locked: !!s.lockedAt,
        model: s.model,
        updatedAt: s.updatedAt.toISOString(),
      }))}
      snapshots={Object.fromEntries(
        Object.entries(snapshots).map(([k, list]) => [
          k,
          list.map((s) => ({
            id: s.id,
            takenAt: s.takenAt.toISOString(),
            daysOut: s.daysOut,
            heads: Number((s.actuals as { totalHeads?: number } | null)?.totalHeads ?? 0),
            revenueCents: Number((s.actuals as { registrationCents?: number } | null)?.registrationCents ?? 0),
          })),
        ])
      )}
      actuals={actuals}
    />
  );
}
