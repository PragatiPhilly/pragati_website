import Link from "next/link";
import { requireSectionAccess } from "@/lib/auth/access";
import { formatCents } from "@/lib/pricing";
import { listPayments } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const KIND_LABEL: Record<string, string> = {
  registration: "🎟️ Tickets",
  donation: "🎁 Donation",
  membership: "🪔 Membership",
};

const METHOD_LABEL: Record<string, string> = {
  square: "Card",
  zelle: "Zelle",
  offline: "Cash / cheque",
  comped: "Comped",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  paid: { bg: "rgba(92,138,58,0.15)", fg: "var(--leaf-deep)", label: "received" },
  pending_verification: { bg: "rgba(232,169,60,0.2)", fg: "var(--terracotta-deep)", label: "awaiting zelle" },
  pending: { bg: "var(--accent-soft)", fg: "var(--ink-soft)", label: "awaiting payment" },
  cancelled: { bg: "rgba(0,0,0,0.07)", fg: "var(--ink-soft)", label: "cancelled" },
  refunded: { bg: "rgba(0,0,0,0.07)", fg: "var(--ink-soft)", label: "refunded" },
};

function Chip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span
      className="text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

const FILTERS: [string, string][] = [
  ["", "All"],
  ["paid", "Received"],
  ["pending_verification", "Awaiting Zelle"],
  ["pending", "Awaiting payment"],
  ["cancelled", "Cancelled"],
];

const KIND_FILTERS: [string, string][] = [
  ["", "Every kind"],
  ["registration", "Tickets"],
  ["donation", "Donations"],
  ["membership", "Memberships"],
];

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  await requireSectionAccess("payments");
  const { status = "", kind = "" } = await searchParams;
  const all = (await listPayments())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 500);
  const rows = all.filter((p) => (!status || p.status === status) && (!kind || p.kind === kind));

  // Totals reflect the whole ledger, not the current filter — the point of this
  // page is that these numbers reconcile with the dashboard.
  const sum = (k: string, s: string) =>
    all.filter((p) => p.kind === k && p.status === s).reduce((t, p) => t + p.amountCents, 0);
  const collected = { registration: sum("registration", "paid"), donation: sum("donation", "paid"), membership: sum("membership", "paid") };
  const totalCollected = collected.registration + collected.donation + collected.membership;
  const outstanding = all
    .filter((p) => p.status === "pending" || p.status === "pending_verification")
    .reduce((t, p) => t + p.amountCents, 0);
  const fees = all.filter((p) => p.status === "paid").reduce((t, p) => t + p.feeCents, 0);

  const qs = (next: { status?: string; kind?: string }) => {
    const p = new URLSearchParams();
    const s = next.status ?? status;
    const k = next.kind ?? kind;
    if (s) p.set("status", s);
    if (k) p.set("kind", k);
    const q = p.toString();
    return q ? `/admin/payments?${q}` : "/admin/payments";
  };

  const href = (p: (typeof all)[number]) =>
    p.kind === "membership" ? "/admin/members" : p.kind === "donation" ? "/admin/donations" : "/admin/registrations";

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Payments</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Every movement of money — tickets, donations and membership dues — in one place. One checkout can appear as
        several rows if it included a donation or dues, so each stream totals on its own.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="festive-card p-4" style={{ borderColor: "var(--leaf-deep)" }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Total received</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-black">{formatCents(totalCollected)}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {formatCents(collected.registration)} tickets · {formatCents(collected.donation)} donations ·{" "}
            {formatCents(collected.membership)} dues
          </p>
        </div>
        <div className="festive-card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Outstanding</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-black">{formatCents(outstanding)}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>not received yet</p>
        </div>
        <div className="festive-card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Card fees collected</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-black">{formatCents(fees)}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>surcharge on top of the totals</p>
        </div>
        <div className="festive-card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Entries</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-black">{all.length}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>most recent 500</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map(([v, label]) => (
          <Link
            key={v || "all"}
            href={qs({ status: v })}
            className="text-xs rounded-full px-4 py-2 hairline"
            style={status === v ? { background: "var(--sindoor)", color: "white" } : { color: "var(--ink-soft)" }}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {KIND_FILTERS.map(([v, label]) => (
          <Link
            key={v || "any"}
            href={qs({ kind: v })}
            className="text-xs rounded-full px-4 py-2 hairline"
            style={kind === v ? { background: "var(--ink)", color: "white" } : { color: "var(--ink-soft)" }}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link href={href(p)} className="hover:underline">{KIND_LABEL[p.kind] ?? p.kind}</Link>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{p.payerName}</div>
                  <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{p.payerEmail}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                  {formatCents(p.amountCents)}
                  {p.feeCents > 0 && (
                    <div className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>
                      +{formatCents(p.feeCents)} fee
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{METHOD_LABEL[p.method] ?? p.method}</td>
                <td className="px-4 py-3"><Chip status={p.status} /></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                  {p.reference ?? "—"}
                  {p.source === "backfill" && (
                    <span className="ml-1 rounded px-1.5 py-0.5" style={{ background: "var(--accent-soft)" }}>
                      estimated
                    </span>
                  )}
                  {p.note && <div className="mt-0.5">{p.note}</div>}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>
                  {new Date(p.paidAt ?? p.createdAt).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--ink-soft)" }}>
                  Nothing matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
