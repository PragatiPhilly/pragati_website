import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import CopyButton from "@/components/site/CopyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership dues" };

export default async function MembershipPaymentPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/signup/membership");

  const [price, zelleEmail, zelleName, orgName] = await Promise.all([
    getConfig<number>("membership_annual_price_cents"),
    getConfig<string>("zelle_recipient_email"),
    getConfig<string>("zelle_recipient_display_name"),
    getConfig<string>("org_name"),
  ]);
  const memo = `MEM ${session.name ?? session.email}`;

  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">One last step 🪔</h1>
      <p className="mb-8" style={{ color: "var(--ink-soft)" }}>
        Your account is created. Send your annual dues of <strong>{formatCents(price)}</strong> via Zelle and
        our treasurer will activate your membership — you'll get a welcome email when it's done.
      </p>
      <div className="festive-card p-7">
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
          ⚠️ Please include the memo so we can match your payment to your account.
        </p>
        <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
          Prefer card or paying at an event? Reply to any email from {orgName} and we'll sort it out.
        </p>
      </div>
    </div>
  );
}
