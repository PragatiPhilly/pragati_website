/**
 * PRINTABLE DOOR LIST — the paper fail-safe for one event day.
 *
 * Everyone who may come in on that day (paid, or a walk-in a staff member let
 * in), alphabetical, with booking number, family, pass and food. Print it each
 * morning; if the Wi-Fi or the database goes down, the gate ticks names with a
 * pen. Lives outside /admin so it prints without the admin menu, but is still
 * staff-only.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { coveredDays, inTodayMap, regAdmits, todayOf, type EventDayLite } from "@/lib/checkin/daily";
import { whoIs } from "@/lib/coupons/rules";
import PrintButton from "./PrintButton";
import { voidedTicketIds } from "@/lib/refunds";

export const dynamic = "force-dynamic";
export const metadata = { title: "Door list" };

const FOOD: Record<string, string> = { veg: "Veg", non_veg: "Non-veg", kid: "Kid meal", none: "No food" };

export default async function DoorListPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireSectionAccess("checkin");
  const event = await getActiveEvent();
  if (!event) return <p className="p-8">No active event.</p>;
  const days = (event.days as EventDayLite[] | null) ?? [];
  const today = todayOf(days);
  const { day: dayParam } = await searchParams;
  const day = days.find((d) => d.key === dayParam) ?? today ?? days[0];
  if (!day) return <p className="p-8">This event has no days set.</p>;

  const db = getDb();
  const regs = (await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, event.id))).filter(regAdmits);
  const regById = new Map(regs.map((r) => [r.id, r]));
  const rows = await db
    .select({ t: schema.tickets, tt: schema.ticketTypes })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.ticketTypes.eventId, event.id));
  const voided = await voidedTicketIds();
  const list = rows.filter(
    (x) =>
      regById.has(x.t.registrationId) &&
      !voided.has(x.t.id) &&
      x.tt.ageBand !== "addon" &&
      coveredDays(x.t.dayKey, x.tt.dayKeys, days).includes(day.key)
  );
  const inMap = today && today.key === day.key ? await inTodayMap(list.map((x) => x.t), day) : new Map<string, Date>();

  const people = list
    .map(({ t, tt }) => {
      const r = regById.get(t.registrationId)!;
      return {
        id: t.id,
        name: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(),
        kid: whoIs({ ageBand: tt.ageBand, foodPref: t.foodPref, age: t.attendeeAge }) === "Kid",
        family: r.buyerName,
        phone: r.buyerPhone ?? "",
        conf: r.confirmationNumber,
        pass: tt.name,
        food: tt.ageBand === "concert" ? `Concert${tt.checkInStart ? ` from ${tt.checkInStart}` : ""}` : !tt.withFood ? "No food" : (FOOD[t.foodPref ?? "none"] ?? "—"),
        owes: r.status !== "paid",
        walkIn: r.source === "desk",
        inAt: inMap.get(t.id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const printed = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 door-list">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .door-list { max-width: none; padding: 0; }
          .door-list table { font-size: 10.5px; }
          .door-list tr { break-inside: avoid; }
          @page { margin: 12mm; }
        }
        .door-list th, .door-list td { padding: 5px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
        .door-list th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
        .door-list .box { width: 16px; height: 16px; border: 1.5px solid #333; display: inline-block; border-radius: 3px; }
      `}</style>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-black">
            Door list — {event.name} · {day.label ?? day.key}
          </h1>
          <p className="text-sm" style={{ color: "#555" }}>
            {people.length} people with a pass for this day · printed {printed} ET. Anyone who books after this time is not on the
            list — check their confirmation email or send them to the walk-in desk.
          </p>
        </div>
        <div className="no-print flex items-center gap-2 flex-wrap">
          {days.map((d) => (
            <a
              key={d.key}
              href={`?day=${d.key}`}
              className="choice-chip !py-1.5 !px-3 text-xs"
              data-selected={d.key === day.key}
            >
              {(d.label ?? d.key).split(",")[0]}
            </a>
          ))}
          <PrintButton />
          <a href="/admin/checkin" className="text-xs underline">
            ← Scan desk
          </a>
        </div>
      </div>

      <table className="w-full mt-4 border-collapse text-sm">
        <thead>
          <tr>
            <th aria-label="Ticked in"></th>
            <th>Name</th>
            <th>Family / booking</th>
            <th>Pass</th>
            <th>Food</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>{p.inAt ? "✓" : <span className="box" />}</td>
              <td>
                <strong>{p.name}</strong>
                {p.kid ? " (kid)" : ""}
                {p.owes && <span style={{ color: "#b00020", fontWeight: 700 }}> · OWES — desk</span>}
              </td>
              <td>
                {p.family} · <span style={{ fontFamily: "monospace" }}>{p.conf}</span>
                {p.walkIn ? " · walk-in" : ""}
              </td>
              <td>{p.pass}</td>
              <td>{p.food}</td>
              <td>{p.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {people.length === 0 && <p className="mt-6 text-sm">Nobody has a pass for this day yet.</p>}
    </div>
  );
}
