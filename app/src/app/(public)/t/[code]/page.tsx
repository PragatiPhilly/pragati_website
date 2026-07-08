/**
 * Live ticket page — what a phone camera opens when it scans a ticket QR.
 * Everyone sees the ticket's live status (valid / checked in / not paid).
 * Signed-in admins additionally get one-tap check-in right here.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { ensureScanTables } from "@/lib/scans/ensure";
import { getConfig } from "@/lib/system-config";
import ScanCheckInButton from "./ScanCheckInButton";
import ServeMealButtons from "./ServeMealButtons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getDb();
  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.qrCode, code));
  if (!ticket) notFound();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, ticket.registrationId));
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));
  const [type] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticket.ticketTypeId));

  const session = await getSession();
  const isAdmin = session && ["admin", "super_admin", "volunteer"].includes(session.role);
  const paid = reg.status === "paid";
  const checkedIn = !!ticket.checkedInAt;

  // Open food windows for this event (staff serve straight from this page —
  // the fallback path for phones without an in-page scanner).
  let openMealSessions: { id: string; label: string; servedAt: string | null }[] = [];
  let foodColors = { veg: "#3E7C3A", non_veg: "#B3402A", kid: "#2B6CB0" };
  if (isAdmin && paid) {
    await ensureScanTables();
    const open = await db
      .select()
      .from(schema.scanSessions)
      .where(and(eq(schema.scanSessions.eventId, reg.eventId), eq(schema.scanSessions.status, "open")));
    if (open.length > 0) {
      const scans = await db
        .select()
        .from(schema.ticketScans)
        .where(
          and(
            eq(schema.ticketScans.ticketId, ticket.id),
            inArray(
              schema.ticketScans.sessionId,
              open.map((s) => s.id)
            )
          )
        );
      const scanBySession = new Map(scans.map((sc) => [sc.sessionId, sc]));
      openMealSessions = open
        .filter((s) => s.dayKey === "all" || ticket.dayKey === "all" || ticket.dayKey === s.dayKey)
        .map((s) => ({
          id: s.id,
          label: s.label,
          servedAt:
            scanBySession
              .get(s.id)
              ?.scannedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? null,
        }));
      foodColors = {
        veg: await getConfig<string>("food_color_veg"),
        non_veg: await getConfig<string>("food_color_non_veg"),
        kid: await getConfig<string>("food_color_kid"),
      };
    }
  }

  const status = !paid
    ? { label: "NOT VALID — payment pending", bg: "rgba(200,16,46,0.12)", fg: "var(--sindoor)", icon: "⛔" }
    : checkedIn
      ? { label: `Already checked in · ${ticket.checkedInAt!.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, bg: "rgba(232,169,60,0.2)", fg: "var(--terracotta-deep)", icon: "🔁" }
      : { label: "VALID — ready to check in", bg: "rgba(92,138,58,0.15)", fg: "var(--leaf-deep)", icon: "✅" };

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      {/* status banner — the first thing the gate volunteer sees */}
      <div className="rounded-2xl px-5 py-4 mb-6 flex items-center gap-3 text-lg font-bold" style={{ background: status.bg, color: status.fg }}>
        <span className="text-2xl">{status.icon}</span> {status.label}
      </div>

      <div className="festive-card overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, var(--marigold), var(--sindoor), var(--terracotta))" }} />
        <div className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1" style={{ color: "var(--terracotta)" }}>
            {event?.name}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">
            {ticket.attendeeFirstName} {ticket.attendeeLastName}
          </h1>
          <div className="mt-4 grid gap-2 text-sm">
            <p>
              <span style={{ color: "var(--ink-soft)" }}>Pass:</span> <strong>{type?.name}</strong>
            </p>
            <p>
              <span style={{ color: "var(--ink-soft)" }}>Day:</span> <strong>{ticket.dayKey === "all" ? "All days" : ticket.dayKey?.toUpperCase()}</strong>
              <span className="mx-2" style={{ color: "var(--line)" }}>|</span>
              <span style={{ color: "var(--ink-soft)" }}>Food:</span> <strong>{ticket.foodPref ?? "—"}</strong>
            </p>
            <p>
              <span style={{ color: "var(--ink-soft)" }}>Booked by:</span> {reg.buyerName} ·{" "}
              <span className="font-mono text-xs">{reg.confirmationNumber}</span>
            </p>
          </div>

          {/* The pass QR — what the attendee shows at the gate. The gate
              volunteer scans it, which opens this same page on their (signed-in)
              phone with the one-tap check-in button below. */}
          {paid && (
            <div className="mt-6 flex flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr/${code}?v=2`}
                alt={`Entry QR for ${ticket.attendeeFirstName} ${ticket.attendeeLastName ?? ""}`}
                width={224}
                height={224}
                className="w-56 h-56 rounded-2xl bg-white p-3"
                style={{ boxShadow: "var(--shadow)", opacity: checkedIn ? 0.45 : 1 }}
              />
              <p className="mt-3 text-sm font-semibold" style={{ color: checkedIn ? "var(--ink-soft)" : "var(--leaf-deep)" }}>
                {checkedIn ? "This pass has already been used" : "Show this QR at the gate — admits one person"}
              </p>
              <p className="mt-1 font-mono text-[11px] break-all" style={{ color: "var(--ink-soft)" }}>
                {code}
              </p>
            </div>
          )}

          {isAdmin && paid && !checkedIn && <ScanCheckInButton ticketId={ticket.id} />}

          {isAdmin && paid && openMealSessions.length > 0 && (
            <ServeMealButtons ticketId={ticket.id} sessions={openMealSessions} colors={foodColors} />
          )}

          {isAdmin && checkedIn && (
            <p className="mt-6 text-sm rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)" }}>
              This pass was already used{ticket.checkedInAt && ` at ${ticket.checkedInAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}. If the person in front of you hasn&apos;t entered yet, someone else scanned their ticket — check a photo ID against the booking name.
            </p>
          )}

          {!isAdmin && (
            <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "var(--line)" }}>
              <Link
                href={`/lookup?email=${encodeURIComponent(reg.buyerEmail)}&conf=${encodeURIComponent(reg.confirmationNumber)}`}
                className="btn-secondary !py-2 !px-5 text-sm inline-flex"
              >
                See all passes for {reg.confirmationNumber} →
              </Link>
              <p className="mt-4 text-xs" style={{ color: "var(--ink-soft)" }}>
                Gate volunteers: <Link href={`/login?next=/t/${code}`} className="underline underline-offset-4 font-semibold">sign in</Link> to check this pass in.
              </p>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <Link href="/admin/checkin" className="btn-secondary w-full justify-center mt-5 text-sm">
          ← Back to check-in desk
        </Link>
      )}
    </div>
  );
}
