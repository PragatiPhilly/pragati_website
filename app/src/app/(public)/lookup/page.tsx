import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import PujoPass from "@/components/site/PujoPass";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find my tickets" };

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; conf?: string }>;
}) {
  const { email, conf } = await searchParams;
  let result: { reg: typeof schema.registrations.$inferSelect; tix: (typeof schema.tickets.$inferSelect)[]; eventName: string; eventBengali: string | null } | null = null;
  let notFoundMsg = false;

  if (email && conf) {
    const db = getDb();
    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.buyerEmail, email.trim().toLowerCase()),
          eq(schema.registrations.confirmationNumber, conf.trim().toUpperCase())
        )
      );
    if (reg) {
      const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
      const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));
      result = { reg, tix, eventName: event?.name ?? "", eventBengali: event?.nameBengali ?? null };
    } else {
      notFoundMsg = true;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-2">Find my tickets</h1>
      <p className="mb-8" style={{ color: "var(--ink-soft)" }}>
        Enter the email you used and your confirmation number (e.g. PRG-2026-0042).
      </p>
      <form className="festive-card p-6 grid sm:grid-cols-[1fr_1fr_auto] gap-3">
        <input name="email" type="email" required defaultValue={email} placeholder="you@example.com" className="input" />
        <input name="conf" required defaultValue={conf} placeholder="PRG-2026-0042" className="input uppercase" />
        <button className="btn-primary !py-3">Look up</button>
      </form>

      {notFoundMsg && (
        <p className="mt-6 rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
          No registration found for that combination — double-check both fields.
        </p>
      )}

      {result && result.reg.status === "paid" && (
        <div className="mt-8">
          <PujoPass
            eventName={result.eventName}
            eventBengali={result.eventBengali}
            buyerName={result.reg.buyerName}
            conf={result.reg.confirmationNumber}
            daysLabel={`${result.tix.length} ${result.tix.length === 1 ? "pass" : "passes"} · paid ${formatCents(result.reg.totalCents)}`}
            attendees={result.tix.map((t) => ({
              name: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(),
              qr: t.qrCode,
              detail: `${t.dayKey === "all" ? "All days" : t.dayKey?.toUpperCase()} · food: ${t.foodPref ?? "—"}`,
            }))}
            printHref={`/tickets/${result.reg.confirmationNumber}/print?email=${encodeURIComponent(result.reg.buyerEmail)}`}
          />
        </div>
      )}

      {result && result.reg.status !== "paid" && (
        <div className="festive-card mt-8 p-7">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">{result.eventName}</h2>
            <span
              className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
              style={{
                background: result.reg.status === "paid" ? "rgba(92,138,58,0.15)" : "var(--accent-soft)",
                color: result.reg.status === "paid" ? "var(--leaf-deep)" : "var(--sindoor)",
              }}
            >
              {result.reg.status === "paid" ? "Confirmed" : result.reg.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            {result.reg.confirmationNumber} · {result.reg.buyerName} · total {formatCents(result.reg.totalCents)}
          </p>
          {result.reg.status === "paid" && (
            <a
              href={`/tickets/${result.reg.confirmationNumber}/print?email=${encodeURIComponent(result.reg.buyerEmail)}`}
              className="btn-secondary !py-2 !px-5 text-sm mt-5 inline-flex"
            >
              🖨 Print all tickets
            </a>
          )}
          <div className="mt-6 grid gap-4">
            {result.tix.map((t) => (
              <div key={t.id} className="flex items-center gap-4 rounded-2xl p-4 hairline">
                {result.reg!.status === "paid" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/qr/${t.qrCode}?v=2`} alt={`QR for ${t.attendeeFirstName}`} className="w-24 h-24 shrink-0 rounded-lg bg-white p-1" />
                ) : (
                  <div className="w-24 h-24 shrink-0 rounded-lg grid place-items-center text-3xl" style={{ background: "var(--accent-soft)" }}>
                    ⏳
                  </div>
                )}
                <div>
                  <p className="font-semibold">
                    {t.attendeeFirstName} {t.attendeeLastName}
                  </p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t.dayKey === "all" ? "All days" : t.dayKey?.toUpperCase()} · food: {t.foodPref ?? "—"} · {formatCents(t.priceCents)}
                  </p>
                  <p className="text-xs mt-1 font-mono break-all" style={{ color: "var(--ink-soft)" }}>
                    {t.qrCode}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {result.reg.status === "pending_zelle_verification" && (
            <p className="mt-6 text-sm rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)" }}>
              Your Zelle payment is being verified by our treasurer. Tickets activate as soon as it's confirmed —
              usually within 24 hours.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
