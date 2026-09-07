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
import HelpPanel from "../../HelpPanel";

export const dynamic = "force-dynamic";

const money = (c: number) => formatCents(c);

/* One vocabulary across the whole desk. The website's ticket-type names came
   from a different pen and say "Youth (5–18)" where the desk's own buttons say
   "Child 5–18" — a volunteer reading both on one screen has to work out that
   they are the same thing. Translate at the edge; the website's names are not
   ours to change. */
const DESK_WORDS: Record<string, string> = {
  "Youth (5–18)": "Child 5–18",
  "Little one (under 5)": "Under 5",
};
const DAY_WORDS: Record<string, string> = { fri: "Friday", sat: "Saturday", sun: "Sunday" };
const FOOD_WORDS: Record<string, string> = {
  veg: "veg meal",
  non_veg: "non-veg meal",
  kid: "kid's meal",
  none: "no meal",
};

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
  const defaultStation = (await getConfig<string>("desk_station_default")) || "desk-1";

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
  // Ticket type names are written for the website and already carry the whole
  // story: "Adult · All 3 days · with food". Printing that AND the day AND the
  // meal gave lines like "Adult · All 3 days · with food · all days · non-veg".
  // Take only the first segment — who this person is — and let the desk say the
  // rest in its own words, so one vocabulary runs through the whole screen.
  const typeName = (tid: string) => {
    const raw = ticketTypes.find((t) => t.id === tid)?.name ?? "Pass";
    const who = raw.split("·")[0].trim();
    return DESK_WORDS[who] ?? who;
  };

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
      detail =
        Number(inst.changeGivenCents) > 0
          ? `${money(Number(inst.changeGivenCents))} change given`
          : "exact money";
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
        {voided && <span className="desk-chip chip-stop">cancelled</span>}
        {s.reg.deskState === "closed" && <span className="desk-chip chip-ok">finished</span>}
        {!isDesk && <span className="desk-chip chip-mute">bought online</span>}
        {/* Only while there is still something to collect. Once they have paid,
            a standing "collecting later" badge beside "PAID IN FULL" reads as a
            contradiction; the fact that they were let in early stays on the
            timeline, which is where history belongs. */}
        {s.reg.admittedUnsettledAt && s.balanceCents > 0 && (
          <span className="desk-chip chip-warn">let in, collecting later</span>
        )}
      </div>

      {!isDesk && (
        <p className="desk-note">
          This family booked online, so their payment is already handled by the website. You can still{" "}
          <Link href={`/admin/desk/new?parent=${s.reg.id}`}>add more people</Link> — that becomes its own booking,
          linked to this one.
        </p>
      )}

      {/* Where this booking sits in the family. It used to be a small note at
          the very bottom, under the adjustments — which is no use to someone
          holding a $30 booking wondering who the child belongs to. It is
          context for everything below it, so it goes above everything below
          it. */}
      {(parent || children.length > 0) && (
        <p className="desk-note desk-kin">
          {parent && (
            <>
              👪 This is an addition to <Link href={`/admin/desk/o/${parent.id}`}>{parent.conf}</Link> — the rest of
              this family is on that booking.{" "}
            </>
          )}
          {children.length > 0 && (
            <>
              👪 People were added to this booking later:{" "}
              {children.map((c) => (
                <Link key={c.id} href={`/admin/desk/o/${c.id}`} className="mr-2">
                  {c.conf}
                </Link>
              ))}
            </>
          )}
        </p>
      )}

      {!invariant.ok && (
        <p className="desk-error">
          Something doesn’t add up on this booking ({invariant.why}). Don’t take another payment — show this
          to an admin.
        </p>
      )}

      {/* ── the balance ─────────────────────────────────────────────────
          THREE states, not two. The balance is due − collected − pending, so a
          card that has been started but not yet confirmed by Square drives it
          to zero — and this banner used to shout "PAID IN FULL ✓" over a
          payment that had not gone through. A volunteer reads the big green
          tick and waves the family in; if the card then declines, the money is
          simply gone. Waiting is its own state and it is amber, not green. */}
      <div
        className={`desk-balance ${
          s.balanceCents > 0 ? "desk-balance--owed" : s.pendingCents > 0 ? "desk-balance--waiting" : ""
        }`}
      >
        <span>
          <span className="lbl">
            {s.balanceCents > 0
              ? "Still to pay"
              : s.pendingCents > 0
                ? "Waiting on the card"
                : s.collectedCents === 0
                  ? // Comped, or a party of under-5s: nothing was owed and
                    // nothing changed hands. "Paid in full" over a free pass
                    // reads as money received, which it is not.
                    "Nothing to pay"
                  : "Paid in full"}
          </span>
          <br />
          <span className="amount">
            {s.balanceCents > 0 ? money(s.balanceCents) : s.pendingCents > 0 ? money(s.pendingCents) : "✓"}
          </span>
        </span>
        <span className="desk-note">
          {money(s.listPriceCents)} for {s.tickets.length} {s.tickets.length === 1 ? "pass" : "passes"}
          {s.donationCents > 0 ? ` · ${money(s.donationCents)} donation` : ""}
          {s.adjustedCents !== 0
            ? ` · ${money(Math.abs(s.adjustedCents))} ${s.adjustedCents > 0 ? "taken off" : "added"}`
            : ""}
          {s.collectedCents > 0 ? ` · ${money(s.collectedCents)} paid` : ""}
          {s.pendingCents > 0 ? " · the card has not gone through yet — check it before they walk off" : ""}
        </span>
      </div>

      <HelpPanel variant="order" />

      {followups.length > 0 && (
        <p className="desk-note">
          Still to sort out:{" "}
          {followups.map((f, i) => (
            <span key={f.id}>
              {i > 0 ? " · " : ""}
              <strong>{FOLLOWUP_LABEL[f.kind as FollowupKind] ?? f.kind}</strong>
            </span>
          ))}
          . Nothing here stops them coming in.
        </p>
      )}



      {/* ── take a payment ─────────────────────────────────────────────── */}
      {/* Once nothing is owed this collapses. Leaving a live "Take $145.00"
          button on a fully-paid booking is how a family gets charged twice. */}
      {!voided && s.balanceCents > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Take a payment</h2>
          <TenderPanel
            registrationId={s.reg.id}
            balanceCents={Math.max(0, s.balanceCents)}
            shiftId={shift?.id ?? null}
            staff={staff.map((u) => ({ userId: u.id, label: u.email }))}
            cardFeeDefault={cardFeeDefault}
            noCashBox={!shift}
            defaultStation={defaultStation}
          />
        </div>
      )}

      {!voided && s.balanceCents <= 0 && (
        <details className="more-actions">
          <summary>
            {s.pendingCents > 0
              ? "The card covers it but hasn’t gone through — take a different payment instead?"
              : "They’ve paid in full — take another payment anyway?"}
          </summary>
          <div style={{ marginTop: 10 }}>
            <TenderPanel
              registrationId={s.reg.id}
              balanceCents={0}
              shiftId={shift?.id ?? null}
              staff={staff.map((u) => ({ userId: u.id, label: u.email }))}
              cardFeeDefault={cardFeeDefault}
              noCashBox={!shift}
              defaultStation={defaultStation}
            />
          </div>
        </details>
      )}

      <OrderControls
        registrationId={s.reg.id}
        balanceCents={s.balanceCents}
        pendingCents={s.pendingCents}
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
          Who’s coming ({s.tickets.length})
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
                    · {typeName(t.ticketTypeId)}
                    {t.attendeeAge !== null && t.attendeeAge !== undefined ? ` (${t.attendeeAge})` : ""} ·{" "}
                    {t.dayKey === "all" ? "all 3 days" : (DAY_WORDS[t.dayKey ?? ""] ?? t.dayKey ?? "")} ·{" "}
                    {FOOD_WORDS[t.foodPref ?? "none"] ?? "no meal"}
                  </span>
                  {g && (
                    <span className="desk-note">
                      {" "}
                      · with <strong>{g.attendeeFirstName}</strong>
                      {/* Before the doors open NOBODY is checked in, so "(not yet
                          in)" was on every child on every screen — noise that
                          teaches a volunteer to stop reading the line. Say it
                          only when it is news. */}
                      {g.checkedInAt ? " (already in)" : ""}
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


      {/* ── payments taken ─────────────────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Money taken</h2>
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
          Where this money is right now:{" "}
          {s.custodyBreakdown.map((c) => `${money(c.amountCents)} — ${CUSTODY_LABEL[c.custody].toLowerCase()}`).join(" · ")}.
          The treasurer ticks these off on the <Link href="/admin/desk/treasury">money to bank</Link> page.
        </p>
      )}
    </div>
  );
}
