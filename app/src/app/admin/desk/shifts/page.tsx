import Link from "next/link";
import "../desk.css";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { formatCents } from "@/lib/pricing";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { listShifts, shiftCloseView } from "@/lib/desk/shifts";
import CloseOutPanel from "./CloseOutPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Desk tills" };

export default async function ShiftsPage() {
  const session = await requireSectionAccess("desk");
  await ensureDeskSchema();
  const event = await getActiveEvent();
  if (!event)
    return (
      <div className="max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-2">Tills</h1>
        <p className="desk-note">No active event.</p>
      </div>
    );

  const shifts = await listShifts(event.id);
  const canClose = session.role !== "volunteer";
  const openViews = await Promise.all(shifts.filter((s) => s.status === "open").map((s) => shiftCloseView(s.id)));

  const takings = shifts.reduce((sum, s) => sum + (s.countedCashCents ?? 0), 0);
  const variance = shifts.reduce((sum, s) => sum + (s.varianceCents ?? 0), 0);

  return (
    <div className="desk-shell max-w-4xl">
      <div>
        <Link href="/admin/desk" className="text-xs underline underline-offset-4">
          ← Desk
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Tills</h1>
        <p className="desk-note">
          Every payment carries the till it was taken on, so two stations running at once still reconcile separately.
        </p>
        <p className="desk-note mt-2">
          For the treasurer:{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=tenders">
            every payment
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=orders">
            orders &amp; balances
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=adjustments">
            comps &amp; discounts
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=shifts">
            tills
          </a>{" "}
          (CSV)
        </p>
      </div>

      {canClose &&
        openViews.map(
          (v) =>
            v && (
              <CloseOutPanel
                key={v.shift.id}
                shiftId={v.shift.id}
                station={v.shift.station}
                expectedCashCents={v.expectedCashCents}
                openOrders={v.openOrders}
              />
            )
        )}

      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">All tills</h2>
        <div className="festive-card overflow-hidden">
          {shifts.map((s) => (
            <div key={s.id} className="desk-row">
              <span className="grow">
                <strong>{s.station}</strong>
                <span className="desk-note">
                  {" "}
                  · {s.openedByEmail ?? "—"} ·{" "}
                  {s.openedAt.toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              <span className="desk-note">float {formatCents(s.openingFloatCents)}</span>
              {s.dropsCents > 0 && <span className="desk-note">drops {formatCents(s.dropsCents)}</span>}
              {s.status === "open" ? (
                <span className="desk-chip chip-warn">open</span>
              ) : (
                <>
                  <span className="desk-note">counted {formatCents(s.countedCashCents ?? 0)}</span>
                  <span className={`desk-chip ${(s.varianceCents ?? 0) === 0 ? "chip-ok" : "chip-stop"}`}>
                    {(s.varianceCents ?? 0) === 0
                      ? "balanced"
                      : `${(s.varianceCents ?? 0) > 0 ? "over" : "short"} ${formatCents(Math.abs(s.varianceCents ?? 0))}`}
                  </span>
                </>
              )}
              {s.varianceNote && <span className="desk-note">{s.varianceNote}</span>}
            </div>
          ))}
          {shifts.length === 0 && <p className="desk-row desk-note">No tills opened yet.</p>}
        </div>
      </div>

      {shifts.some((s) => s.status === "closed") && (
        <p className="desk-note">
          Counted across closed tills: <strong>{formatCents(takings)}</strong>
          {variance !== 0 && (
            <>
              {" "}
              · net variance <strong>{formatCents(variance)}</strong>
            </>
          )}
        </p>
      )}
    </div>
  );
}
