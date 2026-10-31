/**
 * Admin → Scan setup.
 * Configure which QR-scan windows the active event uses (entry check-in is
 * always on; breakfast / lunch / dinner are opt-in per event day), open and
 * close windows live on event day, watch counts, and set the food color codes
 * shown at the serving line.
 */
import { eventCounts } from "@/lib/checkin/daily";
import { getScanState } from "./actions";
import ScanSetup from "./ScanSetup";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan setup" };

export default async function ScansPage() {
  await requireSectionAccess("scans"); // matrix decides who opens this page
  const state = await getScanState();
  if (!state) return <p style={{ color: "var(--ink-soft)" }}>No active event — set one in Settings.</p>;

  // this event's passes only (Durga Pujo's 700+ used to show here)
  const counts = await eventCounts(state.event.id);

  return (
    <div className="max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Scan setup</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        {state.event.name} — decide which scans run, open a window when serving starts, close it when done.
        Each pass works <strong>once per window</strong>; repeats are flagged at the scan desk.
      </p>
      <ScanSetup
        state={state}
        entryStats={{ checked: counts.inside, total: counts.expected }}
      />
    </div>
  );
}
