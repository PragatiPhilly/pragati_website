/**
 * RIGHT NOW — the Pujo day at a glance, for the EC: who's in vs expected,
 * walk-ins, money in today by method, where desk money is, coupons handed out,
 * plates for today and tomorrow, and what is still open. Refreshes every
 * minute. The same numbers go out in the nightly summary email.
 */
import Link from "next/link";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { buildDaySummary } from "@/lib/reports/day-summary";
import { formatCents } from "@/lib/pricing";
import type { EventDayLite } from "@/lib/checkin/daily";
import AutoRefresh from "@/components/admin/AutoRefresh";
import EmailNow from "./EmailNow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Right now" };

function Tile({ value, label, href, tone }: { value: string | number; label: string; href?: string; tone?: "warn" | "ok" }) {
  const inner = (
    <div className="festive-card p-4 h-full">
      <p
        className="font-[family-name:var(--font-display)] text-3xl font-black leading-none"
        style={{ color: tone === "warn" ? "#8a5a00" : tone === "ok" ? "var(--leaf-deep)" : "var(--ink)" }}
      >
        {value}
      </p>
      <p className="text-xs uppercase tracking-wider mt-2" style={{ color: "var(--ink-soft)" }}>
        {label}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default async function LivePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireSectionAccess("live");
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;
  const { day } = await searchParams;
  const s = await buildDaySummary(event, day);
  if (!s) return <p style={{ color: "var(--ink-soft)" }}>This event has no days set.</p>;
  const days = (event.days as EventDayLite[] | null) ?? [];
  const dayName = (s.day.label ?? s.day.key).split(",")[0];
  const mealBlock = (d: typeof s.plates.today, title: string) =>
    d && (
      <div className="festive-card p-4">
        <p className="text-sm font-bold mb-2">{title}</p>
        {d.meals.map((m) => (
          <p key={m.meal} className="text-sm">
            <strong>{m.meal}: {m.total}</strong>{" "}
            <span style={{ color: "var(--ink-soft)" }}>
              ({m.adultNonVeg} non-veg · {m.adultVeg} veg · {m.kid} kid)
            </span>
          </p>
        ))}
      </div>
    );

  return (
    <div className="max-w-5xl">
      <AutoRefresh seconds={60} />
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Right now — {dayName}</h1>
        <EmailNow dayKey={s.day.key} />
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
        {event.name} · {s.isToday ? "today, live" : s.day.label} · updates every minute · last{" "}
        {new Date(s.generatedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}. The same
        numbers go to the EC by email after 11 PM each Pujo night.
      </p>
      <div className="flex gap-2 flex-wrap mb-5">
        {days.map((d) => (
          <a key={d.key} href={`?day=${d.key}`} className="choice-chip !py-1.5 !px-3 text-xs" data-selected={d.key === s.day.key}>
            {(d.label ?? d.key).split(",")[0]}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile value={`${s.attendance.inside} / ${s.attendance.expected}`} label="checked in / with a pass" href="/admin/checkin" />
        <Tile value={s.walkIns.bookings} label={`walk-in bookings (${s.walkIns.passes} passes)`} href="/admin/desk" />
        <Tile
          value={formatCents(s.money.totalCents)}
          label={s.money.refundedCents ? `money in this day · ${formatCents(s.money.refundedCents)} refunded` : "money in this day"}
          href="/admin/payments"
          tone="ok"
        />
        <Tile value={s.couponsGivenFamilies} label="families given coupons" href="/admin/coupons" />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div className="festive-card p-4">
          <p className="text-sm font-bold mb-2">Money that came in — {dayName}</p>
          {s.money.rows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Nothing yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
                  <th className="text-left font-semibold py-1">How</th>
                  <th className="text-right font-semibold py-1">Online</th>
                  <th className="text-right font-semibold py-1">At the desk</th>
                </tr>
              </thead>
              <tbody>
                {s.money.rows.map((r) => (
                  <tr key={r.label} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="py-1.5">{r.label}</td>
                    <td className="text-right tabular-nums">{formatCents(r.onlineCents)}</td>
                    <td className="text-right tabular-nums">{formatCents(r.deskCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="festive-card p-4">
          <p className="text-sm font-bold mb-2">
            Not yet in Pragati&apos;s account{" "}
            <Link href="/admin/desk/treasury" className="text-xs font-normal underline">
              Money to bank →
            </Link>
          </p>
          {s.custody.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Nothing outstanding.
            </p>
          ) : (
            s.custody.map((c) => (
              <p key={c.label} className="text-sm flex justify-between border-t py-1.5" style={{ borderColor: "var(--line)" }}>
                <span>{c.label}</span>
                <strong className="tabular-nums">{formatCents(c.amountCents)}</strong>
              </p>
            ))
          )}
        </div>
        {mealBlock(s.plates.today, `Plates — ${dayName}`)}
        {mealBlock(s.plates.next, `Plates — ${((s.plates.next?.label ?? "") as string).split(",")[0]} (next day)`)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        <Tile value={s.open.unpaidOnline} label="unpaid online bookings" href="/admin/registrations" tone={s.open.unpaidOnline ? "warn" : undefined} />
        <Tile value={s.open.zelleToVerify} label="Zelle to verify" href="/admin/payments/pending-zelle" tone={s.open.zelleToVerify ? "warn" : undefined} />
        <Tile value={s.open.deskFollowups} label="desk follow-ups open" href="/admin/desk/followups" tone={s.open.deskFollowups ? "warn" : undefined} />
      </div>
    </div>
  );
}
