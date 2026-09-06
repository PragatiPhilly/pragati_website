import "./recon.css";
import { requireSectionAccess } from "@/lib/auth/access";
import { lastReconciliation } from "@/lib/payments/reconcile";
import { listFindings } from "./actions";
import FindingRow from "./FindingRow";
import ScanButton from "./ScanButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliation" };

const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

const KIND_SHORT: Record<string, string> = {
  false_negative: "Square paid, we hadn't recorded it",
  false_positive: "We recorded it, Square has no record",
  amount_mismatch: "Amounts disagreed",
  orphan: "Unidentified Square payment",
  custody_overdue: "Desk money not yet banked",
};

/**
 * The review queue.
 *
 * Deliberately the only place in the site where a payment record can be changed
 * on the strength of what Square says — and only when a person presses the
 * button. The nightly check writes questions here; it never answers them.
 */
export default async function ReconciliationPage() {
  await requireSectionAccess("reconciliation");
  const [{ open, settled }, lastRun] = await Promise.all([listFindings(), lastReconciliation()]);

  return (
    <div className="recon">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Reconciliation</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Every night we ask Square what it actually took and compare it with what this website recorded.
        Anything that disagrees is listed here for a person to decide on.{" "}
        <strong>Nothing on this page changes by itself.</strong>
      </p>

      <div className={`status ${open.length === 0 ? "clean" : "attention"}`}>
        <div>
          <p className="eyebrow">Status</p>
          <p className="headline">
            {open.length === 0
              ? "✅ Our records agree with Square"
              : `⚠️ ${open.length} item${open.length === 1 ? "" : "s"} waiting for review`}
          </p>
          <p className="sub">
            {lastRun?.finishedAt
              ? `Last checked ${new Date(lastRun.finishedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} · ${lastRun.squarePayments} Square payment(s) compared`
              : "Not checked yet"}
          </p>
        </div>
        <ScanButton />
      </div>

      {open.length > 0 && (
        <ul className="findings">
          {open.map((f) => (
            <FindingRow
              key={f.id}
              f={{
                id: f.id,
                kind: f.kind,
                reference: f.reference,
                entityKind: f.entityKind,
                detail: f.detail,
                squarePaymentId: f.squarePaymentId,
                squareOrderId: f.squareOrderId,
                squareAmountCents: f.squareAmountCents,
                ledgerAmountCents: f.ledgerAmountCents,
                createdAt: new Date(f.createdAt).toISOString(),
              }}
            />
          ))}
        </ul>
      )}

      {settled.length > 0 && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-black mt-10 mb-3">Already decided</h2>
          <div className="festive-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">What it was</th>
                  <th className="px-4 py-3">Square</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((f) => (
                  <tr key={f.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="px-4 py-3 font-mono text-xs">{f.reference ?? "—"}</td>
                    <td className="px-4 py-3">{KIND_SHORT[f.kind] ?? f.kind}</td>
                    <td className="px-4 py-3 font-mono text-xs">{money(f.squareAmountCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`pill ${f.status}`}>{f.status === "approved" ? "corrected" : "dismissed"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">{f.resolvedByEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>{f.resolutionNote ?? "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                      {f.resolvedAt
                        ? new Date(f.resolvedAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
            Every decision here is also written to the Audit log, with the full before-and-after.
          </p>
        </>
      )}

      {open.length === 0 && settled.length === 0 && (
        <p className="mt-8 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
          Nothing has ever disagreed. The first nightly check will fill this in.
        </p>
      )}
    </div>
  );
}
