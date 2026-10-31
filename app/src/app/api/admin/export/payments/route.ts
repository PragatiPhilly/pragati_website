import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { listPayments } from "@/lib/ledger";
import { inLens, loadAttribution, paymentEventId } from "@/lib/seasons";
import { getConfig } from "@/lib/system-config";

/** Payments ledger as CSV — ?event=<id> for one event (spec/19), else everything. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const eventId = new URL(req.url).searchParams.get("event");
  const [ev] = eventId ? await db.select().from(schema.events).where(eq(schema.events.id, eventId)) : [];
  const activeSlug = await getConfig<string>("active_event_slug");
  const a = await loadAttribution(db);
  const events = new Map((await db.select().from(schema.events)).map((e) => [e.id, e.name]));
  const rows = (await listPayments())
    .filter((p) => !ev || inLens(paymentEventId(a, p), { event: ev, isCurrent: ev.slug === activeSlug }))
    .sort((x, y) => +x.createdAt - +y.createdAt);

  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = ["created_at", "event", "kind", "status", "method", "payer_name", "payer_email", "amount_usd", "fee_usd", "reference", "paid_at", "source", "custody", "note"].join(",");
  const lines = rows.map((p) =>
    [
      p.createdAt.toISOString(),
      events.get(paymentEventId(a, p) ?? "") ?? "(current event)",
      p.kind,
      p.status,
      p.method,
      p.payerName,
      p.payerEmail,
      (p.amountCents / 100).toFixed(2),
      (p.feeCents / 100).toFixed(2),
      p.reference,
      p.paidAt?.toISOString() ?? "",
      p.source,
      p.custody ?? "",
      p.note ?? "",
    ]
      .map(esc)
      .join(",")
  );
  await db.insert(schema.auditLog).values({ userId: session.userId, action: "export", entityType: "payments", entityId: ev?.id ?? null });
  return new NextResponse([header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="pragati-payments-${ev ? `${ev.slug}-` : ""}${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
