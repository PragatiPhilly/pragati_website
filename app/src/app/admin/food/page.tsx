/**
 * Admin → Food line (spec/18).
 *
 * The live picture of one meal window: plates booked, given and left by plate
 * type; families still owed plates; plates given without a pass; the last
 * plates given (with undo). Admins open/close windows and change the food
 * settings here — on the day, with no code change.
 */
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent, type EventDay } from "@/lib/queries/events";
import { getConfig } from "@/lib/system-config";
import { ensureFoodlineSchema, windowStats } from "@/lib/foodline/party";
import { nyYmd } from "@/lib/checkin/daily";
import AutoRefresh from "@/components/admin/AutoRefresh";
import FoodDashboard from "./FoodDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Food line" };

const KIND_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const user = await requireSectionAccess("foodline");
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const { w } = await searchParams;
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;
  await ensureFoodlineSchema();

  const days = ((event.days as EventDay[] | null) ?? []) as EventDay[];
  const dayIdx = new Map(days.map((d, i) => [d.key, i]));
  const windows = (await getDb().select().from(schema.scanSessions).where(eq(schema.scanSessions.eventId, event.id))).sort(
    (a, b) => (dayIdx.get(a.dayKey) ?? 99) - (dayIdx.get(b.dayKey) ?? 99) || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
  );

  if (windows.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-2">Food line</h1>
        <div className="festive-card p-6">
          <p className="font-bold">No meal windows set up for {event.name} yet.</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Add the meals you serve (e.g. Saturday · Dinner) in{" "}
            <Link href="/admin/scans" className="underline underline-offset-4 font-semibold">
              Scan setup
            </Link>
            . They appear here, and on the Scan desk as soon as they are opened.
          </p>
        </div>
      </div>
    );
  }

  // Default: the window that is open now → one on today's date → the first.
  const todayKey = days.find((d) => d.date === nyYmd())?.key;
  const selected =
    windows.find((x) => x.id === w) ??
    windows.find((x) => x.status === "open") ??
    windows.find((x) => x.dayKey === todayKey) ??
    windows[0];
  const stats = await windowStats(selected.id);
  const colors = {
    veg: await getConfig<string>("food_color_veg"),
    non_veg: await getConfig<string>("food_color_non_veg"),
    kid: await getConfig<string>("food_color_kid"),
    kid_veg: (await getConfig<string>("food_color_kid_veg")) || "#7B4FA8",
  };
  const settings = {
    adultMealMinAge: Number(await getConfig<number>("adult_meal_min_age")) || 12,
    requireGate: (await getConfig<string>("food_require_gate_checkin")) === "yes",
  };

  return (
    <div className="max-w-4xl">
      <AutoRefresh seconds={15} />
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Food line</h1>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        {event.name} · live plates for each meal — refreshes every 15 seconds. Volunteers serve from the{" "}
        <Link href={`/admin/checkin?w=${selected.id}`} className="underline underline-offset-4 font-semibold">
          Scan desk
        </Link>
        .
      </p>

      <div className="flex gap-2 flex-wrap mb-5">
        {windows.map((x) => (
          <Link
            key={x.id}
            href={`/admin/food?w=${x.id}`}
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={
              x.id === selected.id
                ? { background: "var(--sindoor)", color: "var(--cream)" }
                : { background: "var(--accent-soft)", color: "var(--ink)" }
            }
          >
            {x.status === "open" ? "● " : ""}
            {x.label}
          </Link>
        ))}
      </div>

      {stats && <FoodDashboard stats={stats} colors={colors} isAdmin={isAdmin} settings={settings} />}
    </div>
  );
}
