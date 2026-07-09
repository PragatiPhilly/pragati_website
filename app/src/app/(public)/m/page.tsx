import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { getActiveEvent } from "@/lib/queries/events";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import StatusBadge from "@/components/admin/StatusBadge";

export const dynamic = "force-dynamic";

export default async function MemberDashboard() {
  const session = await getSession();
  if (!session?.memberId) redirect("/login?next=/m");
  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, session.memberId));
  if (!member) redirect("/login?next=/m"); // stale session (account removed / db reset)
  const family = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.memberId, session.memberId));
  const regs = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.memberId, session.memberId))
    .orderBy(desc(schema.registrations.createdAt))
    .limit(5);
  const active = await getActiveEvent();

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-2">
        Namaskar, {member.primaryFirstName}! 🙏
      </h1>
      <p className="mb-8 flex items-center gap-3" style={{ color: "var(--ink-soft)" }}>
        {member.familyName} · <StatusBadge status={member.membershipStatus} />
      </p>

      {member.membershipStatus === "pending_payment" && (
        <div className="festive-card p-6 mb-8" style={{ borderColor: "var(--marigold)" }}>
          <p className="font-semibold mb-1">Your membership dues are pending</p>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            Send your {formatCents(await getConfig<number>("membership_annual_price_cents"))} annual dues via
            Zelle and the treasurer will activate your family's membership.
          </p>
          <Link href="/signup/membership" className="btn-primary !py-2 !px-5 text-sm">
            See payment instructions →
          </Link>
        </div>
      )}

      {active && (
        <div
          className="rounded-3xl p-8 mb-8"
          style={{ background: "linear-gradient(135deg, var(--sindoor) 0%, var(--terracotta) 100%)", color: "var(--cream)" }}
        >
          <p className="text-xs uppercase tracking-[0.2em] mb-1 opacity-85">Coming up</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-black">{active.name}</p>
          <p className="text-sm mt-1 opacity-90">
            {active.startsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" })} · {active.venueName}
          </p>
          <Link href="/register" className="inline-block mt-5 rounded-full px-6 py-2.5 font-semibold text-sm" style={{ background: "var(--cream)", color: "var(--sindoor)" }}>
            Register your family →
          </Link>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="festive-card p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Your family</h2>
            <Link href="/m/family" className="text-sm underline underline-offset-4">Manage</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full px-4 py-2 text-sm font-medium" style={{ background: "var(--accent-soft)" }}>
              🧑 {member.primaryFirstName} (you)
            </span>
            {family.map((f) => (
              <span key={f.id} className="rounded-full px-4 py-2 text-sm font-medium" style={{ background: "var(--accent-soft)" }}>
                {f.relationship === "child" ? "🧒" : "🧑"} {f.firstName}
              </span>
            ))}
          </div>
        </div>
        <div className="festive-card p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Recent tickets</h2>
            <Link href="/m/tickets" className="text-sm underline underline-offset-4">All tickets</Link>
          </div>
          {regs.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No registrations yet.</p>
          ) : (
            <div className="grid gap-2">
              {regs.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{r.confirmationNumber}</span>
                  <span className="font-semibold">{formatCents(r.totalCents)}</span>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
