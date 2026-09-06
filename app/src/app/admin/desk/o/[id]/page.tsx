import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import "../../desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess, sectionsForRole } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { checkInvariant, deskOrderSummary } from "@/lib/desk/summary";
import { currentShift } from "@/lib/desk/shifts";
import { listOrderEvents } from "@/lib/desk/events";
import { followupsForOrder } from "@/lib/desk/followups";
import { CUSTODY_LABEL, FOLLOWUP_LABEL, type Custody, type FollowupKind } from "@/lib/desk/constants";
import TenderPanel from "./TenderPanel";
import TenderList, { type TenderView } from "./TenderList";
import OrderControls from "./OrderControls";

export const dynamic = "force-dynamic";

const money = (c: number) => formatCents(c);

export default async function DeskOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSectionAccess("desk");
  await ensureDeskSchema();
  const { id } = await params;
  const s = await deskOrderSummary(id);
  if (!s) notFound();

  const db = getDb();
  const isAdmin = session.role === "admin" || session.role === "super_admin";
  const allowed = await sectionsForRole(session.role);
  const isTreasurer = session.role === "super_admin" || allowed.includes("desk_money");
  const shift = await currentShift(s.reg.eventId);
  const events = await listOrderEvents(id);
  const followups = await followupsForOrder(id);
  const invariant = checkInvariant(s);
  const cardFeeDefault = (await getConfig<string>("desk_card_fee_default")) !== "no";

  // Names for the "who took this / who is holding it" columns.
  const userIds = [
    ...new Set([...s.tenders.map((t) => t.collectedBy), s.reg.createdByUserId].filter(Boolean) as string[]),
  ];
  const users = userIds.length
    ? await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, userIds))
    : [];
  const emailOf = (uid: string | null) => users.find((u) => u.id === uid)?.email ?? null;

  const staff = await db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(inArray(schema.users.role, ["admin", "super_admin", "volunteer"]));

  const ticketTypes = await db
    .select()
    .from(schema.ticketTypes)
    .where(eq(schema.ticketTypes.eventId, s.reg.eventId));
  const typeName = (tid: string) => ticketTypes.find((t) => t.id === tid)?.name ?? "Pass";

  // Guardian names, including guardians that live on another registration.
  const guardianIds = [...new Set(s.tickets.map((t) => t.guardianTicketId).filter(Boolean) as string[])];
  const guardians = guardianIds.length
    ? await db.select().from(schema.tickets).where(inArray(schema.tickets.id, guardianIds))
    : [];

  let parent: { conf: string; id: string } | null = null;
  if (s.reg.parentRegistrationId) {
    const [p] = await db
      .select({ id: schema.registrations.id, conf: schema.registrations.confirmationNumber })
      .from(schema.registrations)
      .where(eq(schema.registrations.id, s.reg.parentRegistrationId));
    if (p) parent = p;
  }
  const children = await db
    .select({ id: schema.registrations.id, conf: schema.registrations.confirmationNumber })
    .from(schema.registrations)
    .where(eq(schema.registrations.parentRegistrationId, id));

  const tenderViews: TenderView[] = s.tenders.map((t) => {
    const inst = (t.instrument ?? {}) as Record<string, unknown>;
    let detail = "";
    if (t.method === "check") detail = `no. ${inst.checkNumber ?? "?"}${inst.bank ? ` · ${inst.bank}` : ""}`;
    else if (t.method === "zelle")
      detail =
        typeof inst.sentTo === "object"
          ? `sent to ${(inst.sentTo as { displayName: string }).displayName}`
          : "sent to the org account";
    else if (t.method === "cash")
      detail = Number(inst.changeGivenCents) > 0 ? `change ${money(Number(inst.changeGivenCents))}` : "counted in";
    else if (t.method === "square") detail = t.squarePaymentId ? "confirmed by Square" : "link shown to the guest";
    return {
      id: t.id,
      method: t.method,
      amountCents: t.amountCents,
      feeCents: t.feeCents ?? 0,
      status: t.status,
      custody: (t.custody ?? null) as Custody | null,
      seq: t.tenderSeq,
      collectedByEmail: emailOf(t.collectedBy),
      createdAt: t.createdAt.toISOString(),
      reversedAt: t.reversedAt ? t.reversedAt.toISOString() : null,
      reversalReason: t.reversalReason,
      depositRef: t.depositRef,
      detail,
      payUrl: typeof inst.payUrl === "string" ? inst.payUrl : null,
    };
  });

  const voided = s.reg.deskState === "voided";
  const isDesk = s.reg.source === "desk" || !!s.reg.deskState;

  return (
    <div className="desk-shell max-w-4xl">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href="/admin/desk" className="text-xs underline underline-offset-4">
          ← Desk
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">{s.reg.buyerName}</h1>
        <span className="font-mono text-sm opacity-60">{s.reg.confirmationNumber}</span>
        {voided && <span className="desk-chip chip-stop">voided</span>}
        {s.reg.deskState === "closed" && <span className="desk-chip chip-ok">closed</span>}
        {!isDesk && <span className="desk-chip chip-mute">bought online</span>}
        {s.reg.admittedUnsettledAt && <span className="desk-chip chip-warn">admitted owing</span>}
      </div>

      {!isDesk && (
        <p className="desk-note">
          This order was bought online, so it is settled through the normal rails. You can still{" "}
          <Link href={`/admin/desk/new?parent=${s.reg.id}`}>add people to it</Link> — the addition becomes its own desk
          order linked to this one.
        </p>
      )}

      {!invariant.ok && (
        <p className="desk-error">
          The arithmetic on this order does not add up ({invariant.why}). Do not take another payment — show this to an
          admin.
        </p>
      )}

      {/* ── the balance ────────────────────────────────────────────────── */}
      <div className={`desk-balance ${s.balanceCents > 0 ? "desk-balance--owed" : ""}`}>
        <span>
          <span className="lbl">{s.balanceCents > 0 ? "Balance owed" : "Settled"}</span>
          <br />
          <span className="amount">{money(Math.max(0, s.balanceCents))}</span>
        </span>
        <span className="desk-note">
          {money(s.listPriceCents)} passes
          {s.donationCents > 0 ? ` · ${money(s.donationCents)} donation` : ""}
          {s.adjustedCents !== 0 ? ` · ${money(Math.abs(s.adjustedCents))} ${s.adjustedCents > 0 ? "off" : "extra"}` : ""}
          {" · "}
          {money(s.collectedCents)} collected
          {s.pendingCents > 0 ? ` · ${money(s.pendingCents)} waiting on Square` : ""}
        </span>
        {s.custodyOpenCents > 0 && (
          <span className="desk-chip chip-warn">{money(s.custodyOpenCents)} not in the org account yet</span>
        )}
      </div>

      {followups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {followups.map((f) => (
            <span key={f.id} className="desk-chip chip-warn" title={f.detail ?? undefined}>
              {FOLLOWUP_LABEL[f.kind as FollowupKind] ?? f.kind}
            </span>
          ))}
        </div>
      )}

      <OrderControls
        registrationId={s.reg.id}
        balanceCents={s.balanceCents}
        deskState={s.reg.deskState}
        buyerEmail={s.reg.buyerEmail ?? ""}
        buyerPhone={s.reg.buyerPhone ?? ""}
        buyerName={s.reg.buyerName}
        isAdmin={isAdmin}
        hasEmail={!!s.reg.buyerEmail}
      />

      {/* ── people ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">
          Passes ({s.tickets.length})
        </h2>
        <div className="festive-card overflow-hidden">
          {s.tickets.map((t) => {
            const g = guardians.find((x) => x.id === t.guardianTicketId);
            return (
              <div key={t.id} className="desk-row">
                <span className="grow">
                  <strong>
                    {t.attendeeFirstName} {t.attendeeLastName ?? ""}
                  </strong>
                  <span className="desk-note">
                    {" "}
                    · {typeName(t.ticketTypeId)} · {t.dayKey === "all" ? "all days" : t.dayKey}
                    {t.foodPref && t.foodPref !== "none" ? ` · ${t.foodPref.replace("_", "-")}` : " · no meal"}
                    {t.attendeeAge !== null && t.attendeeAge !== undefined ? ` · age ${t.attendeeAge}` : ""}
                  </span>
                  {g && (
                    <span className="desk-note">
                      {" "}
                      · with <strong>{g.attendeeFirstName}</strong>
                      {g.checkedInAt ? " (checked in)" : " (not yet in)"}
                    </span>
                  )}
                </span>
                {t.checkedInAt && <span className="desk-chip chip-ok">checked in</span>}
                <span className="money">{money(t.priceCents)}</span>
                <a className="text-xs underline underline-offset-4" href={`/t/${t.qrCode}`} target="_blank" rel="noreferrer">
                  pass
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── take a payment ─────────────────────────────────────────────── */}
      {!voided && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Take a payment</h2>
          <TenderPanel
            registrationId={s.reg.id}
            balanceCents={Math.max(0, s.balanceCents)}
            shiftId={shift?.id ?? null}
            staff={staff.map((u) => ({ userId: u.id, label: u.email }))}
            cardFeeDefault={cardFeeDefault}
            disabled={!shift}
            disabledWhy="No till is open. Open one on the desk home before taking money — every payment is stamped with the drawer it belongs to."
          />
        </div>
      )}

      {/* ── payments taken ─────────────────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Payments</h2>
        <div className="festive-card overflow-hidden">
          <TenderList
            tenders={tenderViews}
            registrationId={s.reg.id}
            currentShiftId={shift?.id ?? null}
            canReverse={isTreasurer || isAdmin}
          />
        </div>
      </div>

      {s.adjustments.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Comps &amp; discounts</h2>
          <div className="festive-card overflow-hidden">
            {s.adjustments.map((a) => (
              <div key={a.id} className="desk-row">
                <span className="money">{money(Math.abs(a.amountCents))}</span>
                <span className="grow">
                  <strong className="capitalize">{a.kind}</strong> · {a.reasonCode.replaceAll("_", " ")}
                  {a.note ? ` — ${a.note}` : ""}
                </span>
                {a.voidedAt && <span className="desk-chip chip-mute">undone</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(parent || children.length > 0) && (
        <p className="desk-note">
          {parent && (
            <>
              Added to <Link href={`/admin/desk/o/${parent.id}`}>{parent.conf}</Link>.{" "}
            </>
          )}
          {children.length > 0 && (
            <>
              Additions:{" "}
              {children.map((c) => (
                <Link key={c.id} href={`/admin/desk/o/${c.id}`} className="mr-2">
                  {c.conf}
                </Link>
              ))}
            </>
          )}
        </p>
      )}

      {/* ── timeline ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">What happened</h2>
        <div className="festive-card overflow-hidden">
          {events.map((e) => (
            <div key={e.id} className="desk-row">
              <span className="desk-note" style={{ minWidth: 130 }}>
                {e.createdAt.toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span className="grow">{e.summary}</span>
              <span className="desk-note">{e.actorEmail ?? "system"}</span>
            </div>
          ))}
          {events.length === 0 && <p className="desk-row desk-note">Nothing recorded yet.</p>}
        </div>
      </div>

      {s.custodyOpenCents > 0 && (
        <p className="desk-note">
          {s.custodyBreakdown.map((c) => `${money(c.amountCents)} ${CUSTODY_LABEL[c.custody].toLowerCase()}`).join(" · ")}.
          The treasurer clears these on the <Link href="/admin/desk/treasury">Treasury</Link> page.
        </p>
      )}
    </div>
  );
}
