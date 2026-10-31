"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLensAction } from "../lens-actions";
import type { EventSummary } from "@/lib/seasons";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A closed event's frozen final numbers + one click to load it everywhere (spec/19). */
export default function ArchiveCard({ eventId, summary, closedAt, closedBy }: { eventId: string; summary: EventSummary; closedAt: string; closedBy: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const open = (href: string) =>
    start(async () => {
      await setLensAction(eventId);
      router.push(href);
    });
  const cell = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-soft, rgba(0,0,0,0.03))" }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>{label}</p>
      <p className="font-[family-name:var(--font-display)] text-xl font-black">{value}</p>
      {sub && <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{sub}</p>}
    </div>
  );
  return (
    <div className="mt-4 rounded-2xl p-4" style={{ border: "1px dashed var(--line)" }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--ink-soft)" }}>
        📦 Final numbers — frozen {new Date(closedAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" })}
        {closedBy ? ` by ${closedBy}` : ""}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cell("Registrations", String(summary.registrations.paid), `${summary.registrations.online} online · ${summary.registrations.walkIn} walk-in`)}
        {cell("People", String(summary.people.total), `${summary.people.adults} adults · ${summary.people.children} kids · ${summary.people.under5} under 5`)}
        {cell("Collected", usd(summary.money.collected), `tickets ${usd(summary.money.tickets)}`)}
        {cell("Donations", usd(summary.money.donations), `${summary.donations.count} gifts`)}
        {cell("Membership dues", usd(summary.money.memberships))}
        {cell("Checked in", String(summary.checkedIn), "passes scanned")}
        {cell("Refunded", usd(summary.money.refunded), summary.money.outstanding ? `${usd(summary.money.outstanding)} still unpaid` : undefined)}
        {summary.plates ? cell("Plates", String(summary.plates.given + summary.plates.offList), `${summary.plates.offList} off-list`) : cell("Card fees", usd(summary.money.fees))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-primary !py-2 !px-4 text-xs" disabled={pending} onClick={() => open("/admin")}>
          {pending ? "Loading…" : "📂 Load this event in admin"}
        </button>
        <button className="btn-secondary !py-2 !px-4 text-xs" disabled={pending} onClick={() => open("/admin/registrations")}>
          Registrations
        </button>
        <button className="btn-secondary !py-2 !px-4 text-xs" disabled={pending} onClick={() => open("/admin/payments")}>
          Payments
        </button>
        <a className="btn-secondary !py-2 !px-4 text-xs" href={`/api/admin/export/registrations?event=${eventId}`}>
          ⬇ Registrations CSV
        </a>
        <a className="btn-secondary !py-2 !px-4 text-xs" href={`/api/admin/export/payments?event=${eventId}`}>
          ⬇ Payments CSV
        </a>
      </div>
    </div>
  );
}
