/**
 * Kitchen report — what the caterer actually asks for:
 * "How many veg / non-veg / kid plates, for each meal?"
 *
 * Uses the same rules as the printed food coupons (lib/reports/meals.ts), so
 * the plate count and the coupon count always agree. Counts paid bookings plus
 * walk-ins let in before they had fully paid; unpaid online bookings are shown
 * as "could still come", never mixed in.
 */
import { getActiveEvent, type EventDay } from "@/lib/queries/events";
import { requireSectionAccess } from "@/lib/auth/access";
import { mealReport } from "@/lib/reports/meals";
import { todayCounts, type EventDayLite } from "@/lib/checkin/daily";
import AutoRefresh from "@/components/admin/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  await requireSectionAccess("kitchen");
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;

  const evDays = (event.days as EventDay[] | null) ?? [];
  const report = await mealReport(
    event.id,
    evDays.map((d) => ({ key: d.key, label: d.label }))
  );
  const today = await todayCounts(event.id, evDays as EventDayLite[]);
  const grand = report.reduce((n, d) => n + d.meals.reduce((m, r) => m + r.total, 0), 0);

  return (
    <div>
      <AutoRefresh seconds={60} />
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Kitchen report</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        {event.name} · plates per meal for everyone who has paid, plus walk-ins let in before fully paying. Same rules as the food
        coupons: Friday dinner only; Saturday and Sunday lunch + dinner; concert-only kids get dinner, concert-only adults and no-food
        passes don&apos;t. Updates every minute.
      </p>

      {today && (
        <div className="festive-card p-5 mb-6 flex items-center gap-6 flex-wrap">
          <div>
            <p className="font-[family-name:var(--font-display)] text-4xl font-black" style={{ color: "var(--sindoor)" }}>
              {today.inside}
            </p>
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              inside today
            </p>
          </div>
          <div className="text-2xl font-light" style={{ color: "var(--ink-soft)" }}>
            /
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-4xl font-black">{today.expected}</p>
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              expected today ({today.today.label?.split(",")[0]})
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {report.map((d) => (
          <div key={d.key} className="festive-card overflow-hidden" style={today?.today.key === d.key ? { outline: "2px solid var(--sindoor)" } : undefined}>
            <div className="px-5 py-3 font-bold uppercase tracking-wider text-sm" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
              {d.label}
              {today?.today.key === d.key && " · today"}
            </div>
            <div className="p-5 grid gap-4">
              {d.meals.map((m) => (
                <div key={m.meal}>
                  <div className="flex items-baseline justify-between">
                    <p className="font-bold">{m.meal}</p>
                    <p className="font-[family-name:var(--font-display)] text-3xl font-black">
                      {m.total}
                      <span className="text-xs font-semibold ml-1.5" style={{ color: "var(--ink-soft)" }}>
                        plates
                      </span>
                    </p>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg py-1.5" style={{ background: "rgba(179,64,42,0.08)" }}>
                      <p className="text-lg font-black">{m.adultNonVeg}</p>🐟 non-veg
                    </div>
                    <div className="rounded-lg py-1.5" style={{ background: "rgba(62,124,58,0.10)" }}>
                      <p className="text-lg font-black">{m.adultVeg}</p>🥬 veg
                    </div>
                    <div className="rounded-lg py-1.5" style={{ background: "rgba(43,108,176,0.10)" }}>
                      <p className="text-lg font-black">{m.kid}</p>🍚 kid
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t text-xs grid gap-1" style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>
                <p>
                  <strong style={{ color: "var(--ink)" }}>{d.people}</strong> people with a pass ({d.adults} adults · {d.kids} kids)
                </p>
                {d.concertOnly > 0 && <p>🎶 {d.concertOnly} concert-only (adults: no meal)</p>}
                {d.noFood > 0 && <p>🚫 {d.noFood} on a no-food pass</p>}
                {d.under5 > 0 && <p>👶 {d.under5} under 5</p>}
                {d.pendingPlates > 0 && (
                  <p style={{ color: "#8a5a00" }}>⏳ up to {d.pendingPlates} more plates if unpaid bookings pay</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="festive-card mt-6 p-5 text-sm">
        <strong>Whole event: {grand} plates</strong>{" "}
        <span style={{ color: "var(--ink-soft)" }}>
          — every meal added up (a 3-day pass counts once per meal it covers). Walk-ins added at the desk appear here as soon as they are
          paid or let in.
        </span>
      </div>
    </div>
  );
}
