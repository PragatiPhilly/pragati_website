import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import "./desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess, sectionsForRole } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { currentShift } from "@/lib/desk/shifts";
import { cashTakenInShift, custodyGroups } from "@/lib/desk/tenders";
import { countOpenFollowups } from "@/lib/desk/followups";
import { openOrders } from "@/lib/desk/orders";
import DeskSearch from "./DeskSearch";
import CashBoxStrip from "./CashBoxStrip";
import HelpPanel from "./HelpPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Walk-in desk" };

const money = (c: number) => formatCents(c);

/**
 * The desk's front screen.
 *
 * Written for the person most likely to be standing at it: a volunteer who has
 * never seen it before, with a family waiting. They have exactly two jobs —
 * find somebody, or add somebody — so those are the only two things that get
 * any visual weight. Money totals are a treasurer's question and live one tap
 * away, not in four tiles at eye level.
 */
export default async function DeskHome() {
  const session = await requireSectionAccess("desk");
  await ensureDeskSchema();
  const db = getDb();
  const event = await getActiveEvent();

  if (!event) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-2">Walk-in desk</h1>
        <p className="desk-note">
          No event is switched on yet, so there’s nothing to sell. An admin can set one in{" "}
          <Link href="/admin/events">Events</Link>.
        </p>
      </div>
    );
  }

  const defaultStation = (await getConfig<string>("desk_station_default")) || "desk-1";
  const shift = await currentShift(event.id);
  const cashTaken = shift ? await cashTakenInShift(shift.id) : 0;
  const openList = await openOrders(event.id);
  const openFollowups = await countOpenFollowups();
  const custody = await custodyGroups();
  const custodyTotal = custody.reduce((s, g) => s + g.amountCents, 0);
  const allowed = await sectionsForRole(session.role);
  const canSeeMoney = session.role === "super_admin" || allowed.includes("desk_money");
  const isVolunteer = session.role === "volunteer";

  let takenToday = 0;
  let familiesToday = 0;
  try {
    const rows = await db
      .select({ amount: schema.payments.amountCents })
      .from(schema.payments)
      .where(and(eq(schema.payments.source, "desk"), inArray(schema.payments.status, ["paid"])));
    takenToday = rows.reduce((s, r) => s + r.amount, 0);
    const regs = await db
      .select({ id: schema.registrations.id })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.eventId, event.id), eq(schema.registrations.source, "desk")));
    familiesToday = regs.length;
  } catch {
    /* a summary line is never worth a 500 */
  }

  const owing = openList.filter((o) => o.balanceCents > 0);
  const settledList = openList.filter((o) => o.balanceCents <= 0);

  return (
    <div className="desk-shell max-w-4xl">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Walk-in desk</h1>
        <p className="desk-note">{event.name} · for volunteers and admins at the door</p>
      </div>

      <HelpPanel />

      {/* ── the only two things this screen is for ─────────────────────── */}
      <div className="desk-hero">
        <h2>Who’s at the desk?</h2>
        <DeskSearch />
        <div className="desk-or">or</div>
        <Link href="/admin/desk/new" className="big-action">
          + Register a new family
        </Link>
        <p className="desk-note" style={{ textAlign: "center", margin: 0 }}>
          Always search first — plenty of families booked online back in the summer.
        </p>
      </div>

      <CashBoxStrip
        box={
          shift
            ? {
                id: shift.id,
                station: shift.station,
                openedByEmail: shift.openedByEmail,
                openingFloatCents: shift.openingFloatCents,
                dropsCents: shift.dropsCents,
                cashTakenCents: cashTaken,
              }
            : null
        }
        defaultStation={defaultStation}
        canCount={!isVolunteer}
      />

      {/* ── people who still owe: the only list worth interrupting for ── */}
      {owing.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">
            Still to pay ({owing.length})
          </h2>
          <div className="festive-card overflow-hidden">
            {owing.map((o) => (
              <Link key={o.id} href={`/admin/desk/o/${o.id}`} className="desk-row">
                <span className="grow">
                  <strong>{o.buyerName}</strong> <span className="text-xs opacity-60">{o.conf}</span>
                </span>
                <span className="desk-chip chip-stop">owes {money(o.balanceCents)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Everyone who still owes is already listed above, in red, under the
          heading that exists to make them impossible to miss. Repeating them
          here made the front screen twice as long and taught a volunteer that
          the same family appearing twice means nothing — so this list is
          everyone ELSE. */}
      {settledList.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">
            {owing.length > 0 ? "Everyone else registered here" : "Registered at this desk"} ({settledList.length})
          </h2>
          <div className="festive-card overflow-hidden">
            {settledList.slice(0, 15).map((o) => (
              <Link key={o.id} href={`/admin/desk/o/${o.id}`} className="desk-row">
                <span className="grow">
                  <strong>{o.buyerName}</strong> <span className="text-xs opacity-60">{o.conf}</span>
                </span>
                <span className="desk-chip chip-mute">
                  {o.passes} {o.passes === 1 ? "pass" : "passes"}
                </span>
                <span className="desk-chip chip-ok">paid</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {openList.length === 0 && (
        <p className="desk-note">
          Nobody has been registered at this desk yet. When you register a family they’ll appear here, so you can
          find them again in one tap.
        </p>
      )}

      {/* ── everything else: one quiet line, for whoever needs it ──────── */}
      <div className="desk-note" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
        <strong>{familiesToday}</strong> {familiesToday === 1 ? "family" : "families"} registered here ·{" "}
        <strong>{money(takenToday)}</strong> taken ·{" "}
        <Link href="/admin/desk/followups">
          {openFollowups} {openFollowups === 1 ? "thing" : "things"} to chase up
        </Link>
        {canSeeMoney && custodyTotal > 0 && (
          <>
            {" · "}
            <Link href="/admin/desk/treasury">{money(custodyTotal)} not banked yet</Link>
          </>
        )}
        {!isVolunteer && (
          <>
            {" · "}
            <Link href="/admin/desk/shifts">Cash boxes</Link>
          </>
        )}
      </div>
    </div>
  );
}
