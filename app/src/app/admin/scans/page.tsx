/**
 * Admin → Scan setup.
 * Configure which QR-scan windows the active event uses (entry check-in is
 * always on; breakfast / lunch / dinner are opt-in per event day), open and
 * close windows live on event day, watch counts, and set the food color codes
 * shown at the serving line.
 */
import { isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { getScanState } from "./actions";
import ScanSetup from "./ScanSetup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan setup" };

export default async function ScansPage() {
  const session = await getSession();
  const isAdmin = session && ["admin", "super_admin"].includes(session.role);
  if (!isAdmin) return <p style={{ color: "var(--ink-soft)" }}>Admin access required.</p>;

  const state = await getScanState();
  if (!state) return <p style={{ color: "var(--ink-soft)" }}>No active event — set one in Settings.</p>;

  const db = getDb();
  const [total] = await db.select({ n: sql<number>`count(*)` }).from(schema.tickets);
  const [checked] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.tickets)
    .where(isNotNull(schema.tickets.checkedInAt));

  return (
    <div className="max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Scan setup</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        {state.event.name} — decide which scans run, open a window when serving starts, close it when done.
        Each pass works <strong>once per window</strong>; repeats are flagged at the scan desk.
      </p>
      <ScanSetup
        state={state}
        entryStats={{ checked: Number(checked.n), total: Number(total.n) }}
      />
    </div>
  );
}
