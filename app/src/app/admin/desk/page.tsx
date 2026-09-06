import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import "./desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { currentShift } from "@/lib/desk/shifts";
import { cashTakenInShift, custodyGroups } from "@/lib/desk/tenders";
import { countOpenFollowups } from "@/lib/desk/followups";
import { openOrders } from "@/lib/desk/orders";
import { sectionsForRole } from "@/lib/auth/access";
import DeskSearch from "./DeskSearch";
import ShiftBanner from "./ShiftBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Walk-in desk" };

const money = (c: number) => formatCents(c);

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
          No active event is set, so there is nothing to sell. Set one in <Link href="/admin/events">Events</Link>.
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
  const canSeeTreasury = session.role === "super_admin" || allowed.includes("desk_money");

  // Today's takings, from the ledger — the same rows the Payments page reads.
  let takenToday = 0;
  try {
    const rows = await db
      .select({ amount: schema.payments.amountCents })
      .from(schema.payments)
      .where(and(eq(schema.payments.source, "desk"), inArray(schema.payments.status, ["paid"])));
    takenToday = rows.reduce((s, r) => s + r.amount, 0);
  } catch {
    /* a card is not worth a 500 */
  }

  const owed = openList.filter((o) => o.balanceCents > 0);

  return (
    <div className="desk-shell max-w-4xl">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Walk-in desk</h1>
        <p className="desk-note">
          {event.name} · staff only. Search first — the family in front of you may already have an order, in which
          case this becomes an amendment rather than a second unrelated registration.
        </p>
      </div>

      <ShiftBanner
        shift={
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
        canClose={session.role !== "volunteer"}
      />

      <DeskSearch />

      <div className="desk-actions">
        <Link href="/admin/desk/new" className="desk-tile">
          <span className="t">New walk-in</span>
          <span className="v">Start</span>
          <span className="s">Nobody found — build the party and take payment</span>
        </Link>
        <Link href="/admin/desk/followups" className="desk-tile">
          <span className="t">Follow-ups</span>
          <span className="v">{openFollowups}</span>
          <span className="s">Missing emails, uncleared cheques, balances owed</span>
        </Link>
        {canSeeTreasury && (
          <Link href="/admin/desk/treasury" className="desk-tile">
            <span className="t">Not in the org account</span>
            <span className="v">{money(custodyTotal)}</span>
            <span className="s">
              {custody.length === 0 ? "Everything is banked" : `${custody.length} holder${custody.length === 1 ? "" : "s"} to chase`}
            </span>
          </Link>
        )}
        <Link href="/admin/desk/shifts" className="desk-tile">
          <span className="t">Desk takings</span>
          <span className="v">{money(takenToday)}</span>
          <span className="s">Across every till · close-out and variances</span>
        </Link>
      </div>

      {owed.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">
            Owing right now ({owed.length})
          </h2>
          <div className="festive-card overflow-hidden">
            {owed.map((o) => (
              <Link key={o.id} href={`/admin/desk/o/${o.id}`} className="desk-row">
                <span className="grow">
                  <strong>{o.buyerName}</strong>{" "}
                  <span className="conf text-xs opacity-60">{o.conf}</span>
                </span>
                <span className="desk-chip chip-stop">owes {money(o.balanceCents)}</span>
                <span className="money">{money(o.totalCents)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {openList.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Open at this desk</h2>
          <div className="festive-card overflow-hidden">
            {openList.slice(0, 20).map((o) => (
              <Link key={o.id} href={`/admin/desk/o/${o.id}`} className="desk-row">
                <span className="grow">
                  <strong>{o.buyerName}</strong> <span className="text-xs opacity-60">{o.conf}</span>
                </span>
                <span className="desk-chip chip-mute">
                  {o.passes} pass{o.passes === 1 ? "" : "es"}
                </span>
                {o.balanceCents > 0 ? (
                  <span className="desk-chip chip-stop">owes {money(o.balanceCents)}</span>
                ) : (
                  <span className="desk-chip chip-ok">settled</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
