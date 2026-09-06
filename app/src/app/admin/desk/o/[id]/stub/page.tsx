import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import "../../../desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import { siteUrl } from "@/lib/site-url";
import { deskOrderSummary } from "@/lib/desk/summary";
import { followupsForOrder } from "@/lib/desk/followups";
import { FOLLOWUP_LABEL, type FollowupKind } from "@/lib/desk/constants";

export const dynamic = "force-dynamic";

/**
 * Paper, for the people who don't have email.
 *
 * The whole reason the desk never invents an address: a guest with no email
 * still needs something in their hand with a scannable pass on it. Prints on A4
 * or an 80mm thermal roll, and says plainly what we still owe them and what
 * they still owe us.
 */
export default async function StubPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSectionAccess("desk");
  const { id } = await params;
  const s = await deskOrderSummary(id);
  if (!s) notFound();

  const db = getDb();
  const orgName = await getConfig<string>("org_name");
  const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, s.reg.eventId));
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, s.reg.eventId));
  const gaps = await followupsForOrder(id);
  const base = siteUrl();
  const typeName = (tid: string) => types.find((t) => t.id === tid)?.name ?? "Pass";

  return (
    <div>
      <div className="no-print mb-4 flex gap-3">
        <a className="btn-secondary" href={`/admin/desk/o/${id}`}>
          ← Back to the order
        </a>
        <span className="desk-note self-center">
          Use your browser&apos;s print (⌘P). Reprinting is fine — it is recorded on the timeline.
        </span>
      </div>

      <div className="stub">
        <h1>{orgName}</h1>
        <div>{event?.name}</div>
        <div className="rule" />
        <div>
          <strong>{s.reg.confirmationNumber}</strong>
        </div>
        <div>{s.reg.buyerName}</div>
        {s.reg.buyerPhone && <div>{s.reg.buyerPhone}</div>}
        <div className="rule" />

        {s.tickets.map((t) => (
          <div key={t.id} style={{ marginBottom: 10 }}>
            <div>
              <strong>
                {t.attendeeFirstName} {t.attendeeLastName ?? ""}
              </strong>
            </div>
            <div>
              {typeName(t.ticketTypeId)} · {t.dayKey === "all" ? "all days" : t.dayKey} ·{" "}
              {t.foodPref && t.foodPref !== "none" ? t.foodPref.replace("_", "-") : "no meal"}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr" alt={`Pass for ${t.attendeeFirstName}`} src={`${base}/api/qr/${t.qrCode}`} />
            <div style={{ textAlign: "center", fontSize: 10 }}>{t.qrCode.slice(-12)}</div>
          </div>
        ))}

        <div className="rule" />
        <div>Passes: {formatCents(s.listPriceCents)}</div>
        {s.donationCents > 0 && <div>Donation: {formatCents(s.donationCents)}</div>}
        {s.adjustedCents !== 0 && <div>Adjustment: −{formatCents(s.adjustedCents)}</div>}
        <div>
          <strong>Paid: {formatCents(s.collectedCents)}</strong>
        </div>
        {s.balanceCents > 0 && (
          <div>
            <strong>STILL OWED: {formatCents(s.balanceCents)}</strong>
          </div>
        )}
        {s.tenders
          .filter((t) => t.status === "paid")
          .map((t) => (
            <div key={t.id} style={{ fontSize: 11 }}>
              {t.method} {formatCents(t.amountCents)}
            </div>
          ))}

        {gaps.length > 0 && (
          <>
            <div className="rule" />
            <div style={{ fontSize: 11 }}>We still need from you:</div>
            {gaps
              .filter((g) => ["missing_email", "missing_phone", "missing_age"].includes(g.kind))
              .map((g) => (
                <div key={g.id} style={{ fontSize: 11 }}>
                  · {FOLLOWUP_LABEL[g.kind as FollowupKind]}
                </div>
              ))}
          </>
        )}

        <div className="rule" />
        <div style={{ fontSize: 10 }}>
          Keep this to enter. Look up your tickets any time at {base.replace(/^https?:\/\//, "")}/lookup
        </div>
      </div>
    </div>
  );
}
