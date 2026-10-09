/** Cancel passes on a paid online booking and record the refund — see lib/refunds.ts. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "@/lib/auth/access";
import { refundView, REFUND_METHOD_LABEL, type RefundMethod } from "@/lib/refunds";
import RefundForm from "./RefundForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cancel & refund" };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function RefundPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSectionAccess("registrations");
  const isAdmin = s.role === "admin" || s.role === "super_admin";
  const { id } = await params;
  const v = await refundView(id);
  if (!v) notFound();
  const room = Math.max(0, v.paidCents - v.refundedCents);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/registrations" className="text-xs underline underline-offset-4">
        ← Registrations
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mt-2 mb-1">
        Cancel &amp; refund — {v.reg.confirmationNumber}
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
        {v.reg.buyerName} · {v.reg.buyerEmail || "no email"} · paid {money(v.paidCents)}
        {v.refundedCents > 0 && ` · already refunded ${money(v.refundedCents)}`}. Cancelled passes stop working at the gate and drop out of
        the kitchen, coupon and door counts. Nothing here moves money — it records what you did.
      </p>

      {v.isDesk ? (
        <p className="desk-error">This is a walk-in desk booking. Cancel it on its walk-in desk page — the desk records the refund owed there.</p>
      ) : v.reg.status !== "paid" ? (
        <p className="text-sm">This booking isn&apos;t paid, so there&apos;s nothing to refund. An unpaid booking never admits anyone.</p>
      ) : !isAdmin ? (
        <p className="text-sm">Recording a refund needs an admin.</p>
      ) : (
        <RefundForm
          registrationId={v.reg.id}
          roomCents={room}
          tickets={v.tickets.map((t) => ({ id: t.id, name: t.name, pass: t.pass, dayKey: t.dayKey, priceCents: t.priceCents, used: t.used, voided: !!t.voided }))}
        />
      )}

      {v.refunds.length > 0 && (
        <div className="festive-card p-4 mt-5 text-sm">
          <p className="font-bold mb-2">Refunds recorded</p>
          {v.refunds.map((r) => (
            <p key={r.id} className="border-t py-1.5" style={{ borderColor: "var(--line)" }}>
              {money(r.amountCents)} · {REFUND_METHOD_LABEL[r.method as RefundMethod] ?? r.method} ·{" "}
              {new Date(r.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {r.note ? ` · ${r.note}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
