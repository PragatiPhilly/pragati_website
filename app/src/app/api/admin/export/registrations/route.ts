import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const regs = await db.select().from(schema.registrations).orderBy(desc(schema.registrations.createdAt));
  const tickets = await db.select().from(schema.tickets);

  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = [
    "confirmation", "buyer_name", "buyer_email", "buyer_phone", "status", "payment_method",
    "source", "is_member", "subtotal_usd", "discount_usd", "total_usd", "attendees", "created_at",
  ].join(",");
  const rows = regs.map((r) => {
    const att = tickets
      .filter((t) => t.registrationId === r.id)
      .map((t) => `${t.attendeeFirstName} ${t.attendeeLastName ?? ""} (${t.dayKey}/${t.foodPref})`)
      .join("; ");
    return [
      r.confirmationNumber, r.buyerName, r.buyerEmail, r.buyerPhone, r.status, r.paymentMethod,
      r.source, r.isMemberPurchase, (r.subtotalCents / 100).toFixed(2), (r.discountCents / 100).toFixed(2),
      (r.totalCents / 100).toFixed(2), att, r.createdAt.toISOString(),
    ].map(esc).join(",");
  });

  await db.insert(schema.auditLog).values({
    userId: session.userId,
    action: "export",
    entityType: "registrations",
  });

  return new NextResponse([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="pragati-registrations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
