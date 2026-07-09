import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import { getActiveEvent } from "@/lib/queries/events";
import StatusBadge from "@/components/admin/StatusBadge";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireSectionAccess("dashboard");
  const db = getDb();
  const { sweepExpiredReservations } = await import("@/lib/sweeper");
  await sweepExpiredReservations(); // opportunistic cleanup of expired holds
  const active = await getActiveEvent();

  const [members] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.members)
    .where(eq(schema.members.membershipStatus, "active"));
  const [pendingMembers] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.members)
    .where(eq(schema.members.membershipStatus, "pending_payment"));
  const [paidRegs] = await db
    .select({ n: sql<number>`count(*)`, revenue: sql<number>`coalesce(sum(total_cents),0)` })
    .from(schema.registrations)
    .where(eq(schema.registrations.status, "paid"));
  const [pendingZelle] = await db
    .select({ n: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(total_cents),0)` })
    .from(schema.registrations)
    .where(eq(schema.registrations.status, "pending_zelle_verification"));
  const [tickets] = await db.select({ n: sql<number>`count(*)` }).from(schema.tickets);
  const [donations] = await db
    .select({ n: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(amount_cents),0)` })
    .from(schema.donations)
    .where(eq(schema.donations.status, "paid"));

  const recent = await db
    .select()
    .from(schema.registrations)
    .orderBy(desc(schema.registrations.createdAt))
    .limit(8);

  // ── system health (fail-safe visibility) ──────────────────────
  const { getConfig } = await import("@/lib/system-config");
  const paused = (await getConfig<string>("registration_paused")) === "yes";
  const squareOff = (await getConfig<string>("payments_square_enabled")) === "no";
  const zelleOff = (await getConfig<string>("payments_zelle_enabled")) === "no";
  const emailLive =
    (process.env.EMAIL_PROVIDER ?? "console") !== "console" &&
    (!!process.env.BREVO_API_KEY || !!process.env.RESEND_API_KEY);
  const paymentsMode = process.env.PAYMENTS_MODE ?? "test";
  const [lastBackup] = await db
    .select()
    .from(schema.emailLog)
    .where(eq(schema.emailLog.template, "registration_backup"))
    .orderBy(desc(schema.emailLog.createdAt))
    .limit(1);
  const [failedMail] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.emailLog)
    .where(eq(schema.emailLog.status, "failed"));
  const { ensureScanTables } = await import("@/lib/scans/ensure");
  await ensureScanTables();
  const [queuedMail] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.emailOutbox)
    .where(eq(schema.emailOutbox.status, "queued"));
  const [deadMail] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.emailOutbox)
    .where(eq(schema.emailOutbox.status, "failed"));
  const { sentToday } = await import("@/lib/email");
  const emailsUsed = await sentToday();
  const healthWarnings = [
    paused && "⏸ Registration is PAUSED (re-enable in Settings)",
    squareOff && "💳 Card payments disabled (Settings)",
    zelleOff && "🏦 Zelle disabled (Settings)",
    !emailLive && "📧 Email in console mode — no real emails send (set EMAIL_PROVIDER=live plus a BREVO_API_KEY or RESEND_API_KEY)",
    paymentsMode !== "live" && "🧪 Payments in TEST mode — no real money moves",
    lastBackup?.status === "failed" && "🛟 Last backup email FAILED — check Email log",
    !lastBackup && "🛟 No backup email sent yet — try “Email backup now” on Registrations",
    Number(failedMail?.n ?? 0) > 0 && `✉ ${failedMail.n} failed email send(s) — being retried automatically; see Email log`,
    Number(queuedMail?.n ?? 0) > 5 && `📬 ${queuedMail.n} emails queued (digests/deferred) — sending via the 15-min drain`,
    Number(deadMail?.n ?? 0) > 0 && `📪 ${deadMail.n} email(s) gave up after 10 retries — investigate Email log`,
  ].filter(Boolean) as string[];

  const stat = (label: string, value: string, sub?: string, href?: string, alert?: boolean) => {
    const inner = (
      <div className="festive-card p-5 h-full" style={alert ? { borderColor: "var(--sindoor)" } : undefined}>
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--ink-soft)" }}>{label}</p>
        <p className="font-[family-name:var(--font-display)] text-3xl font-black" style={alert ? { color: "var(--sindoor)" } : undefined}>
          {value}
        </p>
        {sub && <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>{sub}</p>}
      </div>
    );
    return href ? (
      <Link key={label} href={href} className="hover:-translate-y-0.5 transition-transform block">{inner}</Link>
    ) : (
      <div key={label}>{inner}</div>
    );
  };

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Dashboard</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--ink-soft)" }}>
        Active event: <strong>{active?.name ?? "none"}</strong>
      </p>

      {/* ── system health ── */}
      <div className="festive-card p-4 mb-6" style={healthWarnings.length > 0 ? { borderColor: "var(--marigold)" } : undefined}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-bold">
            {healthWarnings.length === 0 ? "🟢 All systems normal" : `🟡 System health — ${healthWarnings.length} thing${healthWarnings.length > 1 ? "s" : ""} to know`}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            emails: {emailsUsed} sent / 24h
            {Number(queuedMail?.n ?? 0) > 0 && ` · ${queuedMail.n} queued`} · last backup:{" "}
            {lastBackup ? `${lastBackup.status} · ${lastBackup.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "never"}
          </p>
        </div>
        {healthWarnings.length > 0 && (
          <ul className="mt-2 grid gap-1">
            {healthWarnings.map((w) => (
              <li key={w} className="text-xs font-medium" style={{ color: "var(--terracotta-deep)" }}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stat("Pending Zelle", String(pendingZelle.n), `${formatCents(Number(pendingZelle.amount))} awaiting verification`, "/admin/payments/pending-zelle", Number(pendingZelle.n) > 0)}
        {stat("Paid registrations", String(paidRegs.n), `${formatCents(Number(paidRegs.revenue))} collected`, "/admin/registrations")}
        {stat("Tickets issued", String(tickets.n), undefined, "/admin/registrations")}
        {stat("Active members", String(members.n), `${pendingMembers.n} pending dues`, "/admin/members")}
        {stat("Donations", String(donations.n), `${formatCents(Number(donations.amount))} received`, "/admin/donations")}
        {stat("Check-in", "Open", "scan & verify at the door", "/admin/checkin")}
        {stat("Day-of kiosk", "Launch", "walk-in registration station for the venue", "/register?mode=dayof")}
      </div>

      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold mt-10 mb-4">Recent registrations</h2>
      <div className="festive-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Conf #</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-3 font-mono text-xs">{r.confirmationNumber}</td>
                <td className="px-4 py-3">{r.buyerName}</td>
                <td className="px-4 py-3 font-semibold">{formatCents(r.totalCents)}</td>
                <td className="px-4 py-3">{r.paymentMethod}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>
                  {r.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center" colSpan={6} style={{ color: "var(--ink-soft)" }}>
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
