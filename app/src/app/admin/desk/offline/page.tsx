/**
 * Offline walk-in notebook — see lib/desk/offline.ts. Open this page while the
 * Wi-Fi works; if it drops, keep the tab open and keep writing families down.
 * They sync into the walk-in desk when the connection is back.
 */
import "../desk.css";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import OfflineNotebook from "./OfflineNotebook";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offline notebook" };

export default async function OfflinePage() {
  const s = await requireSectionAccess("desk");
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;
  const types = await getDb()
    .select()
    .from(schema.ticketTypes)
    .where(and(eq(schema.ticketTypes.eventId, event.id), isNull(schema.ticketTypes.archivedAt)));
  // Students need their school details — take them at the desk proper.
  const passes = types
    .filter((t) => t.ageBand !== "addon" && t.ageBand !== "student")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((t) => ({
      id: t.id,
      name: t.name,
      band: t.ageBand,
      withFood: t.withFood,
      priceCents: t.priceNonmemberCents >= 0 ? t.priceNonmemberCents : t.priceMemberCents,
    }));
  return <OfflineNotebook passes={passes} takenBy={s.email} eventName={event.name} />;
}
