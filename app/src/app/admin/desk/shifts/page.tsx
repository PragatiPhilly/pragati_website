import Link from "next/link";
import "../desk.css";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { formatCents } from "@/lib/pricing";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { listShifts, shiftCloseView } from "@/lib/desk/shifts";
import CloseOutPanel from "./CloseOutPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash boxes" };

export default async function ShiftsPage() {
  const session = await requireSectionAccess("desk");
  await ensureDeskSchema();
  const event = await getActiveEvent();
  if (!event)
    return (
      <div className="max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-2">Cash boxes</h1>
        <p className="desk-note">No event is switched on yet.</p>
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
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Cash boxes</h1>
        <p className="desk-note">
          A cash box is the money in front of one desk: what it started with, what went into it, and what was counted
          at the end. Every payment remembers which box it went into, so two desks running at once still add up
          separately — and a shortfall belongs to a shift, not to a person.
        </p>
        <p className="desk-note mt-2">
          Spreadsheets for the treasurer:{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=tenders">
            every payment
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=orders">
            bookings &amp; what’s owed
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=adjustments">
            free passes &amp; discounts
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/api/admin/export/desk?view=shifts">
            cash boxes
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
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">All cash boxes</h2>
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
              <span className="desk-note">started with {formatCents(s.openingFloatCents)}</span>
              {s.dropsCents > 0 && (
                <span className="desk-note">{formatCents(s.dropsCents)} handed over</span>
              )}
              {s.status === "open" ? (
                <span className="desk-chip chip-warn">still open</span>
              ) : (
                <>
                  <span className="desk-note">counted {formatCents(s.countedCashCents ?? 0)}</span>
                  <span className={`desk-chip ${(s.varianceCents ?? 0) === 0 ? "chip-ok" : "chip-stop"}`}>
                    {(s.varianceCents ?? 0) === 0
                      ? "matched"
                      : `${(s.varianceCents ?? 0) > 0 ? "extra" : "missing"} ${formatCents(Math.abs(s.varianceCents ?? 0))}`}
                  </span>
                </>
              )}
              {s.varianceNote && <span className="desk-note">{s.varianceNote}</span>}
            </div>
          ))}
          {shifts.length === 0 && (
            <p className="desk-row desk-note">
              No cash box has been started yet. One gets started from the desk when the first payment is taken.
            </p>
          )}
        </div>
      </div>

      {shifts.some((s) => s.status === "closed") && (
        <p className="desk-note">
          Counted across finished cash boxes: <strong>{formatCents(takings)}</strong>
          {variance !== 0 && (
            <>
              {" "}
              · <strong>{formatCents(Math.abs(variance))}</strong> {variance > 0 ? "more" : "less"} than expected
              overall
            </>
          )}
        </p>
      )}
    </div>
  );
}
