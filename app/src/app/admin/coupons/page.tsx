/**
 * Coupon desk — which printed food coupons each family is owed, for everyone
 * who registered (or paid) since a chosen moment, and a shared "coupons given"
 * mark so every volunteer sees the same list. Replaces the hand-made
 * "Durga Puja Coupon Desk" HTML files: it reads the live registrations, so a
 * family who books online today shows up here on the next refresh.
 */
import { getActiveEvent, type EventDay } from "@/lib/queries/events";
import { requireSectionAccess } from "@/lib/auth/access";
import { loadCouponDesk } from "@/lib/coupons/store";
import { COUPON_LEGEND, mealsFor } from "@/lib/coupons/rules";
import CouponDesk from "./CouponDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupon desk" };

const TZ = "America/New_York";

/** "2026-10-09T00:00" read as New York wall-clock time → a real instant. */
function nyLocalToDate(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtc = new Date(`${local}:00Z`);
  if (isNaN(asUtc.getTime())) return null;
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(asUtc)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-4"
  const m = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return new Date(asUtc.getTime() - offsetMin * 60_000);
}

/** Today's date in New York, "YYYY-MM-DD". */
function nyToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function CouponDeskPage({ searchParams }: { searchParams: Promise<{ since?: string }> }) {
  await requireSectionAccess("coupons");
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;

  const { since: sinceParam } = await searchParams;
  const todayLocal = `${nyToday()}T00:00`;
  const sinceLocal = sinceParam && nyLocalToDate(sinceParam) ? sinceParam : todayLocal;
  const since = nyLocalToDate(sinceLocal)!;

  const days = (event.days as EventDay[] | null) ?? [];
  const dayKeys = days.map((d) => d.key);
  const families = await loadCouponDesk(event.id, dayKeys, since);

  const presets = [
    { label: "Today", value: todayLocal },
    { label: "Since yesterday", value: `${nyToday(-1)}T00:00` },
  ];
  const mealsLine = days.map((d) => `${d.label.split(",")[0]}: ${mealsFor(d.key).join(" + ").toLowerCase()}`).join(" · ");

  return (
    <CouponDesk
      eventName={event.name}
      days={days.map((d) => ({ key: d.key, label: d.label.split(",")[0] }))}
      legend={COUPON_LEGEND}
      families={families}
      sinceLocal={sinceLocal}
      sinceLabel={since.toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      presets={presets}
      mealsLine={mealsLine}
      loadedAt={new Date().toISOString()}
    />
  );
}
