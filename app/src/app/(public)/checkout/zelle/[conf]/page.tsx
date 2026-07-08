import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getZelleInstructions } from "@/lib/payments/zelle";
import { formatCents } from "@/lib/pricing";
import CopyButton from "@/components/site/CopyButton";
import ZelleSentButton from "./ZelleSentButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay with Zelle" };

export default async function ZelleInstructionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ conf: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { conf } = await params;
  const { kind } = await searchParams;
  const db = getDb();

  let amountCents = 0;
  let alreadyClicked = false;
  if (kind === "donation") {
    const [don] = await db.select().from(schema.donations).where(eq(schema.donations.confirmationNumber, conf));
    if (!don) notFound();
    amountCents = don.amountCents;
  } else {
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, conf));
    if (!reg) notFound();
    amountCents = reg.totalCents;
    alreadyClicked = !!reg.zelleSentClickedAt;
  }

  const zelle = await getZelleInstructions(conf, amountCents);

  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black mb-3">
        Send your Zelle payment 🏦
      </h1>
      <p className="mb-8" style={{ color: "var(--ink-soft)" }}>
        Your {kind === "donation" ? "donation" : "seats are reserved"}. Complete the Zelle transfer from your
        bank app, then tap the button below.
      </p>

      <div className="festive-card p-7">
        <div className="grid gap-4">
          {[
            ["Amount", formatCents(zelle.amountCents)],
            ["Send to (Zelle)", zelle.recipientEmail],
            ["Shows up as", zelle.recipientDisplayName],
            ["Memo — required!", zelle.memo],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 hairline rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>{label}</p>
                <p className="font-semibold break-all">{value}</p>
              </div>
              <CopyButton text={String(value)} />
            </div>
          ))}
        </div>

        <div className="mt-6 text-sm rounded-xl px-4 py-3 leading-relaxed" style={{ background: "var(--accent-soft)" }}>
          ⚠️ <strong>Include the memo "{zelle.memo}"</strong> — it's how our treasurer matches your payment.
          Without it, your {kind === "donation" ? "receipt" : "tickets"} will be delayed.
        </div>

        <ol className="mt-6 grid gap-2 text-sm list-decimal list-inside" style={{ color: "var(--ink-soft)" }}>
          <li>Open your bank's app and choose Zelle</li>
          <li>Send {formatCents(zelle.amountCents)} to <strong>{zelle.recipientEmail}</strong></li>
          <li>Put <strong>{zelle.memo}</strong> in the memo/note field</li>
          <li>Come back and tap below</li>
        </ol>

        <ZelleSentButton conf={conf} kind={kind === "donation" ? "donation" : "registration"} already={alreadyClicked} />

        <p className="mt-5 text-xs text-center" style={{ color: "var(--ink-soft)" }}>
          {kind === "donation" ? "Your receipt arrives" : "Tickets arrive"} by email once the treasurer verifies the
          deposit — usually within {zelle.slaHours} hours.
        </p>
      </div>
    </div>
  );
}
