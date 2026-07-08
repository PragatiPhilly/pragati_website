import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/pricing";
import StatusBadge from "@/components/admin/StatusBadge";

export const dynamic = "force-dynamic";
export const metadata = { title: "My tickets" };

export default async function MemberTicketsPage() {
  const session = await getSession();
  if (!session?.memberId) redirect("/login?next=/m/tickets");
  const db = getDb();
  const regs = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.memberId, session.memberId))
    .orderBy(desc(schema.registrations.createdAt));
  const events = await db.select().from(schema.events);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-8">My tickets</h1>
      <div className="grid gap-4">
        {regs.map((r) => {
          const ev = events.find((e) => e.id === r.eventId);
          return (
            <div key={r.id} className="festive-card p-6 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg font-bold">{ev?.name}</p>
                <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                  <span className="font-mono text-xs">{r.confirmationNumber}</span> · {formatCents(r.totalCents)} · {r.paymentMethod}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                {r.status === "paid" && (
                  <Link
                    href={`/lookup?email=${encodeURIComponent(r.buyerEmail)}&conf=${r.confirmationNumber}`}
                    className="btn-secondary !py-2 !px-4 text-xs"
                  >
                    View QR codes
                  </Link>
                )}
                {r.status === "pending_zelle_verification" && (
                  <Link href={`/checkout/zelle/${r.confirmationNumber}`} className="btn-secondary !py-2 !px-4 text-xs">
                    Zelle instructions
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        {regs.length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>
            Nothing yet — <Link href="/register" className="underline underline-offset-4">register for the next event</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
