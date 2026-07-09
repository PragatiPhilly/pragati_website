import { isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { getScanState } from "../scans/actions";
import CheckinForm from "./CheckinForm";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  await requireSectionAccess("checkin");
  const db = getDb();
  const [total] = await db.select({ n: sql<number>`count(*)` }).from(schema.tickets);
  const [checked] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.tickets)
    .where(isNotNull(schema.tickets.checkedInAt));

  const session = await getSession();
  const isAdmin = !!session && ["admin", "super_admin"].includes(session.role);

  const state = await getScanState();
  const openSessions = (state?.sessions ?? []).filter((s) => s.status === "open");
  const colors = state?.colors ?? { veg: "#3E7C3A", non_veg: "#B3402A", kid: "#2B6CB0" };

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Scan desk</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Scan a ticket QR or look up by name / confirmation number. Pick what you&apos;re scanning for at the
        top — entry, or an open food window. Walk-ins without tickets? Send them to the{" "}
        <a href="/register?mode=dayof" className="underline underline-offset-4 font-semibold">
          day-of kiosk
        </a>
        .
      </p>
      <div className="festive-card p-5 mb-6 flex items-center gap-6 flex-wrap">
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-black" style={{ color: "var(--sindoor)" }}>
            {String(checked.n)}
          </p>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>checked in</p>
        </div>
        <div className="text-2xl font-light" style={{ color: "var(--ink-soft)" }}>/</div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-black">{String(total.n)}</p>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>tickets issued</p>
        </div>
        <a
          href="/api/admin/export/gate-sheet"
          className="ml-auto text-xs underline underline-offset-4 opacity-70 hover:opacity-100"
          title="Self-contained attendee list that works with no internet — download fresh each event morning"
        >
          🛟 Download offline gate sheet
        </a>
      </div>
      <CheckinForm openSessions={openSessions} colors={colors} isAdmin={isAdmin} />
    </div>
  );
}
