/**
 * Kitchen report — what the caterer actually asks for:
 * "How many veg / non-veg / kid plates, per day?"
 * Counts come from PAID tickets only; checked-in counts show live consumption.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveEvent, type EventDay } from "@/lib/queries/events";

export const dynamic = "force-dynamic";

const FOODS = [
  { key: "non_veg", label: "🐟 Non-veg", bn: "আমিষ" },
  { key: "veg", label: "🥬 Veg", bn: "নিরামিষ" },
  { key: "kid", label: "🍚 Kid's meal", bn: "ছোটদের" },
] as const;

export default async function KitchenPage() {
  const db = getDb();
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;

  const days = ((event.days as EventDay[] | null) ?? []).map((d) => d.key);
  const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, event.id));
  const paidRegIds = new Set(regs.filter((r) => r.status === "paid").map((r) => r.id));
  const tickets = (await db.select().from(schema.tickets)).filter((t) => paidRegIds.has(t.registrationId));

  // a ticket covers a day if dayKey === that day, or dayKey === 'all'
  const covers = (t: (typeof tickets)[number], day: string) => t.dayKey === "all" || t.dayKey === day;

  const cell = (day: string, food: string) => {
    const covered = tickets.filter((t) => covers(t, day) && (t.foodPref ?? "none") === food);
    return { total: covered.length, eaten: covered.filter((t) => t.checkedInAt).length };
  };
  const noFood = (day: string) => tickets.filter((t) => covers(t, day) && (t.foodPref === "none" || t.foodPref === null)).length;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Kitchen report</h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        {event.name} · paid tickets only · &ldquo;in&rdquo; = that person has checked in (live plate count).
      </p>

      <div className="grid md:grid-cols-3 gap-5">
        {days.map((day) => (
          <div key={day} className="festive-card overflow-hidden">
            <div className="px-5 py-3 font-bold uppercase tracking-wider text-sm" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
              {((event.days as EventDay[]) ?? []).find((d) => d.key === day)?.label ?? day}
            </div>
            <div className="p-5 grid gap-3">
              {FOODS.map((f) => {
                const c = cell(day, f.key);
                return (
                  <div key={f.key} className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {f.label} <span className="font-[family-name:var(--font-bangla)]" style={{ color: "var(--terracotta)" }}>{f.bn}</span>
                    </span>
                    <span className="font-[family-name:var(--font-display)] text-2xl font-black">
                      {c.total}
                      <span className="text-xs font-semibold ml-1.5" style={{ color: "var(--leaf-deep)" }}>
                        {c.eaten} in
                      </span>
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                <span className="text-sm" style={{ color: "var(--ink-soft)" }}>🚫 No food</span>
                <span className="font-semibold">{noFood(day)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="festive-card mt-6 p-5">
        <p className="text-sm font-semibold mb-2">Whole weekend totals</p>
        <div className="flex gap-8 flex-wrap">
          {FOODS.map((f) => {
            const total = tickets.filter((t) => (t.foodPref ?? "none") === f.key).length;
            return (
              <p key={f.key} className="text-sm">
                {f.label}: <strong className="text-lg">{total}</strong>
              </p>
            );
          })}
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            (a 3-day pass counts once here, but appears under each day above)
          </p>
        </div>
      </div>
    </div>
  );
}
