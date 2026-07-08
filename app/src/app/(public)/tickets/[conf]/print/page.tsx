import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print tickets" };

export default async function PrintTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ conf: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { conf } = await params;
  const { email } = await searchParams;
  if (!email) notFound();
  const db = getDb();
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(
      and(
        eq(schema.registrations.confirmationNumber, conf.toUpperCase()),
        eq(schema.registrations.buyerEmail, email.toLowerCase())
      )
    );
  if (!reg || reg.status !== "paid") notFound();
  const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));
  const orgName = await getConfig<string>("org_name");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 print:p-0" style={{ background: "#fff", color: "#1a1a1a", minHeight: "100vh" }}>
      <div className="flex items-center justify-between mb-8 print:hidden">
        <p className="text-sm text-neutral-500">Print this page or save as PDF — one pass per attendee.</p>
        <button className="rounded-full bg-black text-white text-sm font-semibold px-5 py-2" onClick={undefined} id="printBtn">
          Print
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `document.getElementById('printBtn').onclick=()=>window.print()` }} />

      <div className="grid gap-6">
        {tix.map((t) => (
          <div key={t.id} className="border-2 border-neutral-800 rounded-2xl p-6 flex gap-6 items-center break-inside-avoid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr/${t.qrCode}?v=2`} alt="Ticket QR" className="w-36 h-36" />
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">{orgName}</p>
              <p className="text-2xl font-bold mt-1">{event?.name}</p>
              <p className="text-lg mt-2 font-semibold">
                {t.attendeeFirstName} {t.attendeeLastName}
              </p>
              <p className="text-sm text-neutral-600">
                {t.dayKey === "all" ? "All days" : `Day: ${t.dayKey?.toUpperCase()}`} · Food: {t.foodPref ?? "—"}
              </p>
              <p className="text-xs mt-3 font-mono text-neutral-500">
                {reg.confirmationNumber} · {t.qrCode}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-400 mt-8">
        Present the QR code at the entrance. Each code admits one person and is scanned once per day.
      </p>
    </div>
  );
}
