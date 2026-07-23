import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment successful" };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ conf?: string; membership?: string }>;
}) {
  const { conf, membership } = await searchParams;

  if (membership === "1") {
    const session = await getSession();
    const db0 = getDb();
    const member = session?.memberId
      ? (await db0.select().from(schema.members).where(eq(schema.members.id, session.memberId)))[0]
      : undefined;
    const active = member?.membershipStatus === "active";
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        {!active && <meta httpEquiv="refresh" content="4" />}
        <p className="text-6xl mb-5">{active ? "🎉" : "⏳"}</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">
          {active ? "Welcome to Pragati!" : "Confirming your payment…"}
        </h1>
        {conf && (
          <div className="rounded-2xl py-6 px-4 my-8 mx-auto max-w-sm" style={{ background: "var(--accent-soft)" }}>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>Confirmation</p>
            <p className="font-[family-name:var(--font-display)] text-3xl font-black" style={{ color: "var(--sindoor)" }}>{conf}</p>
          </div>
        )}
        <p style={{ color: "var(--ink-soft)" }}>
          {active
            ? "Your dues are paid and your membership is now active. A welcome email is on its way. 🪔"
            : "Your payment went through — we're finalizing your membership now. This page refreshes on its own; it usually takes a few seconds."}
        </p>
        <Link href="/m" className="btn-primary mt-8 inline-flex">
          Go to My Pragati →
        </Link>
      </div>
    );
  }

  const db = getDb();
  let reg: typeof schema.registrations.$inferSelect | undefined;
  let don: typeof schema.donations.$inferSelect | undefined;
  if (conf) {
    [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, conf));
    if (!reg) [don] = await db.select().from(schema.donations).where(eq(schema.donations.confirmationNumber, conf));
  }
  const paid = reg?.status === "paid" || don?.status === "paid";
  const email = reg?.buyerEmail ?? don?.donorEmail;
  const total = reg?.totalCents ?? don?.amountCents ?? 0;

  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      {!paid && <meta httpEquiv="refresh" content="2" />}
      <p className="text-6xl mb-5">{paid ? "🎉" : "⏳"}</p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">
        {paid ? "Payment confirmed!" : "Confirming your payment…"}
      </h1>
      {conf && (
        <div className="rounded-2xl py-6 px-4 my-8 mx-auto max-w-sm" style={{ background: "var(--accent-soft)" }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>Confirmation</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-black" style={{ color: "var(--sindoor)" }}>{conf}</p>
          {total > 0 && <p className="mt-2 font-semibold">{formatCents(total)}</p>}
        </div>
      )}
      <p style={{ color: "var(--ink-soft)" }}>
        {paid
          ? `${don ? "Your receipt" : "Your tickets"} ${email ? `are on their way to ${email}` : "are on their way"}. `
          : "This page refreshes automatically — usually takes a few seconds."}
      </p>
      {paid && reg && (
        <Link
          href={`/lookup?email=${encodeURIComponent(reg.buyerEmail)}&conf=${reg.confirmationNumber}`}
          className="btn-primary mt-8 inline-flex"
        >
          View your Pujo Pass →
        </Link>
      )}
    </div>
  );
}
