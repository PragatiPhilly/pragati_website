/**
 * One event day at a glance — the "right now" dashboard and the nightly
 * summary email to the EC are both built from this, so they always agree.
 *
 * Read-only: nothing here changes a booking, a payment or a ticket.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { coveredDays, inTodayMap, nyYmd, regAdmits, todayOf, type EventDayLite } from "@/lib/checkin/daily";
import { mealReport, type DayReport } from "@/lib/reports/meals";
import { formatCents } from "@/lib/pricing";
import { siteUrl } from "@/lib/site-url";

export type DaySummary = {
  eventName: string;
  day: EventDayLite;
  isToday: boolean;
  generatedAt: string;
  attendance: { expected: number; inside: number };
  walkIns: { bookings: number; passes: number };
  money: { rows: { label: string; onlineCents: number; deskCents: number }[]; totalCents: number };
  custody: { label: string; amountCents: number }[];
  couponsGivenFamilies: number;
  plates: { today: DayReport | null; next: DayReport | null };
  open: { unpaidOnline: number; zelleToVerify: number; deskFollowups: number };
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  check: "Cheque",
  zelle: "Zelle",
  square: "Card",
  offline: "Marked paid by an admin",
  comped: "Free / comped",
};

export async function buildDaySummary(event: { id: string; name: string; days: unknown }, dayKey?: string): Promise<DaySummary | null> {
  const days = (event.days as EventDayLite[] | null) ?? [];
  const today = todayOf(days);
  const day = days.find((d) => d.key === dayKey) ?? today ?? days[0];
  if (!day) return null;
  const db = getDb();

  const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, event.id));
  const admitted = regs.filter(regAdmits);
  const admittedIds = new Set(admitted.map((r) => r.id));
  const rows = await db
    .select({ t: schema.tickets, dayKeys: schema.ticketTypes.dayKeys, band: schema.ticketTypes.ageBand })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.ticketTypes.eventId, event.id));

  // Attendance for the day
  const forDay = rows
    .filter((x) => admittedIds.has(x.t.registrationId) && x.band !== "addon" && coveredDays(x.t.dayKey, x.dayKeys, days).includes(day.key))
    .map((x) => x.t);
  const inMap = await inTodayMap(forDay, day);

  // Walk-ins created that day
  const deskRegs = regs.filter((r) => (r.source === "desk" || r.deskState) && r.deskState !== "voided" && nyYmd(r.createdAt) === day.date);
  const deskIds = new Set(deskRegs.map((r) => r.id));
  const deskPasses = rows.filter((x) => deskIds.has(x.t.registrationId) && x.band !== "addon").length;

  // Money that came in that day, for this event's bookings
  const regIds = regs.map((r) => r.id);
  const pays = regIds.length
    ? (await db.select().from(schema.payments).where(and(inArray(schema.payments.entityId, regIds), eq(schema.payments.status, "paid")))).filter(
        (p) => p.paidAt && nyYmd(p.paidAt) === day.date && !p.reversedAt
      )
    : [];
  const byMethod = new Map<string, { onlineCents: number; deskCents: number }>();
  for (const p of pays) {
    const k = METHOD_LABEL[p.method] ?? p.method;
    const cur = byMethod.get(k) ?? { onlineCents: 0, deskCents: 0 };
    if (p.source === "desk" || p.collectedBy) cur.deskCents += p.amountCents;
    else cur.onlineCents += p.amountCents;
    byMethod.set(k, cur);
  }
  const moneyRows = [...byMethod.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.onlineCents + b.deskCents - (a.onlineCents + a.deskCents));

  // Where desk money is right now (not yet in Pragati's account)
  let custody: DaySummary["custody"] = [];
  try {
    const { custodyGroups } = await import("@/lib/desk/tenders");
    custody = (await custodyGroups()).map((g) => ({ label: g.label, amountCents: g.amountCents }));
  } catch {
    /* the desk tables may not exist yet */
  }

  // Coupons handed over that day
  let couponsGivenFamilies = 0;
  try {
    const { ensureCouponSchema } = await import("@/lib/coupons/store");
    await ensureCouponSchema();
    const given = await db.select().from(schema.couponHandouts);
    couponsGivenFamilies = given.filter((g) => nyYmd(g.givenAt) === day.date && regIds.includes(g.registrationId)).length;
  } catch {
    /* ignore */
  }

  const meals = await mealReport(event.id, days.map((d) => ({ key: d.key, label: d.label ?? d.key })));
  const idx = days.findIndex((d) => d.key === day.key);

  let deskFollowups = 0;
  try {
    const { countOpenFollowups } = await import("@/lib/desk/followups");
    deskFollowups = await countOpenFollowups();
  } catch {
    /* ignore */
  }

  return {
    eventName: event.name,
    day,
    isToday: today?.key === day.key,
    generatedAt: new Date().toISOString(),
    attendance: { expected: forDay.length, inside: forDay.filter((t) => inMap.has(t.id)).length },
    walkIns: { bookings: deskRegs.length, passes: deskPasses },
    money: { rows: moneyRows, totalCents: pays.reduce((n, p) => n + p.amountCents, 0) },
    custody,
    couponsGivenFamilies,
    plates: { today: meals.find((m) => m.key === day.key) ?? null, next: idx >= 0 ? (meals[idx + 1] ?? null) : null },
    open: {
      unpaidOnline: regs.filter((r) => r.source !== "desk" && !r.deskState && (r.status === "pending_payment" || r.status === "pending_zelle_verification")).length,
      zelleToVerify: regs.filter((r) => r.status === "pending_zelle_verification").length,
      deskFollowups,
    },
  };
}

// ── the nightly email ─────────────────────────────────────────────────────

export function summaryEmail(s: DaySummary): { subject: string; text: string; html: string } {
  const dayName = (s.day.label ?? s.day.key).split(",")[0];
  const subject = `Pujo ${dayName} summary — ${s.attendance.inside} in, ${formatCents(s.money.totalCents)} taken`;
  const plateLine = (d: DayReport | null) =>
    d ? d.meals.map((m) => `${m.meal}: ${m.total} (${m.adultNonVeg} non-veg · ${m.adultVeg} veg · ${m.kid} kid)`).join("; ") : "—";
  const lines = [
    `${s.eventName} — ${s.day.label ?? s.day.key}`,
    ``,
    `People: ${s.attendance.inside} checked in of ${s.attendance.expected} with a pass for the day`,
    `Walk-ins: ${s.walkIns.bookings} bookings at the desk (${s.walkIns.passes} passes)`,
    `Coupons handed over: ${s.couponsGivenFamilies} families`,
    ``,
    `Money that came in (${formatCents(s.money.totalCents)}):`,
    ...(s.money.rows.length
      ? s.money.rows.map((r) => `  ${r.label}: ${formatCents(r.onlineCents + r.deskCents)} (online ${formatCents(r.onlineCents)} · desk ${formatCents(r.deskCents)})`)
      : ["  none"]),
    ``,
    `Not yet in Pragati's account:`,
    ...(s.custody.length ? s.custody.map((c) => `  ${c.label}: ${formatCents(c.amountCents)}`) : ["  nothing outstanding"]),
    ``,
    `Plates ${dayName}: ${plateLine(s.plates.today)}`,
    s.plates.next ? `Plates ${(s.plates.next.label ?? s.plates.next.key).split(",")[0]}: ${plateLine(s.plates.next)}` : "",
    ``,
    `Still open: ${s.open.unpaidOnline} unpaid online bookings · ${s.open.zelleToVerify} Zelle to verify · ${s.open.deskFollowups} desk follow-ups`,
    ``,
    `Live view: ${siteUrl("/admin/live")}`,
  ].filter((l) => l !== undefined);
  const text = lines.join("\n");
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><body style="margin:0;background:#EEF1F4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 12px;">
<div style="background:#3B4654;color:#fff;border-radius:12px 12px 0 0;padding:14px 22px;font:700 12px ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase;">Pragati · Pujo day summary</div>
<div style="background:#fff;border:1px solid #D9DFE6;border-top:0;border-radius:0 0 12px 12px;padding:22px;">
<h1 style="margin:0 0 14px;font-size:20px;color:#1B2430;">${esc(subject)}</h1>
<pre style="white-space:pre-wrap;font:13px/1.55 ui-monospace,Menlo,monospace;color:#1B2430;margin:0;">${esc(text)}</pre>
</div></div></body></html>`;
  return { subject, text, html };
}

async function summaryRecipients(): Promise<string[]> {
  const { getConfig } = await import("@/lib/system-config");
  const raw = (await getConfig<string>("ec_summary_emails")) || (await getConfig<string>("backup_email")) || "";
  return raw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.includes("@"));
}

export async function sendDaySummary(event: { id: string; name: string; days: unknown }, dayKey?: string): Promise<{ sentTo: string[] }> {
  const s = await buildDaySummary(event, dayKey);
  if (!s) return { sentTo: [] };
  const mail = summaryEmail(s);
  const to = await summaryRecipients();
  const { sendMail } = await import("@/lib/email");
  for (const addr of to) await sendMail({ to: addr, subject: mail.subject, text: mail.text, html: mail.html, template: "ec_day_summary", priority: 1 });
  return { sentTo: to };
}

/**
 * Called by the 15-minute sweep. On an event day, once it's past 11 PM in New
 * York, send that day's summary — exactly once per day (remembered in config).
 * Never throws: a summary is never worth failing the sweep.
 */
export async function maybeSendNightlySummary(now: Date = new Date()): Promise<string | null> {
  try {
    const { getActiveEvent } = await import("@/lib/queries/events");
    const { getConfig, setConfig } = await import("@/lib/system-config");
    if ((await getConfig<string>("ec_summary_enabled")) === "no") return null;
    const event = await getActiveEvent();
    if (!event) return null;
    const today = todayOf((event.days as EventDayLite[] | null) ?? [], now);
    if (!today) return null;
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(now));
    if (hour < 23) return null;
    if ((await getConfig<string>("ec_summary_last_sent")) === today.date) return null;
    await setConfig("ec_summary_last_sent", today.date);
    const r = await sendDaySummary(event, today.key);
    return `sent ${today.key} to ${r.sentTo.length}`;
  } catch (e) {
    console.error("[nightly-summary]", e);
    return null;
  }
}
