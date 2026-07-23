import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";
import { formatCents, cardProcessingFeeCents } from "@/lib/pricing";
import CopyButton from "@/components/site/CopyButton";
import MembershipPayButtons from "./MembershipPayButtons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership dues" };

export default async function MembershipPaymentPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/signup/membership");

  const db = getDb();
  const member = session.memberId
    ? (await db.select().from(schema.members).where(eq(schema.members.id, session.memberId)))[0]
    : undefined;

  const [price, zelleEmail, zelleName, orgName, squareCfg, zelleCfg] = await Promise.all([
    getConfig<number>("membership_annual_price_cents"),
    getConfig<string>("zelle_recipient_email"),
    getConfig<string>("zelle_recipient_display_name"),
    getConfig<string>("org_name"),
    getConfig<string>("payments_square_enabled"),
    getConfig<string>("payments_zelle_enabled"),
  ]);
  const squareEnabled = squareCfg !== "no";
  const zelleEnabled = zelleCfg === "yes";
  const memo = `MEM ${session.name ?? session.email}`;

  // Already paid — show a warm confirmation instead of the payment options.
  if (member?.membershipStatus === "active") {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <p className="text-6xl mb-5">🎉</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">You&apos;re a member!</h1>
        <p style={{ color: "var(--ink-soft)" }}>
          Your Pragati membership is active and a welcome email is on its way. Namaskar, and welcome to the family. 🪔
        </p>
        <Link href="/m" className="btn-primary mt-8 inline-flex">
          Go to My Pragati →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">One last step 🪔</h1>
      <p className="mb-8" style={{ color: "var(--ink-soft)" }}>
        Your account is created. Pay your annual dues of <strong>{formatCents(price)}</strong> to activate your
        membership — you&apos;ll get a welcome email as soon as it&apos;s done.
      </p>

      {squareEnabled && (
        <div className="festive-card p-7 mb-6">
          <p className="font-semibold mb-1">Pay by card</p>
          <p className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
            Secure checkout via Square — your membership activates instantly.
          </p>
          <p className="text-sm mb-4">
            Processing fee <strong style={{ color: "var(--sindoor)" }}>{formatCents(cardProcessingFeeCents(price))}</strong> · Total{" "}
            <strong>{formatCents(price + cardProcessingFeeCents(price))}</strong>
          </p>
          <MembershipPayButtons />
        </div>
      )}

      {zelleEnabled && (
        <div className="festive-card p-7">
          <p className="font-semibold mb-3">Pay by Zelle</p>
          <div className="grid gap-4">
            {[
              ["Amount", formatCents(price)],
              ["Zelle recipient", zelleEmail],
              ["Shows up as", zelleName],
              ["Memo (required)", memo],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 hairline rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
                <CopyButton text={String(value)} />
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)" }}>
            ⚠️ Include the memo so we can match your payment — our treasurer activates your membership once it arrives.
          </p>
        </div>
      )}

      {!squareEnabled && !zelleEnabled && (
        <div className="festive-card p-7">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Online payments are paused right now. Please reply to any email from {orgName} and we&apos;ll help you pay
            your dues.
          </p>
        </div>
      )}
    </div>
  );
}
