"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { sendTicketsEmail } from "@/lib/checkout";
import { getConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";

export async function resendTicketsAction(registrationId: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const sent = await sendTicketsEmail(registrationId, { resend: true });
  if (!sent) return { ok: false, message: "Only paid registrations have tickets to resend." };

  const db = getDb();
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "resend_tickets",
    entityType: "registrations",
    entityId: registrationId,
  });
  return { ok: true, message: "Tickets email resent ✓" };
}

/** Walk-in paid cash/card at the counter → mark paid, tickets email goes out. */
export async function markPaidCashAction(registrationId: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) return { ok: false, message: "Not found." };
  if (reg.status === "paid") return { ok: false, message: "Already paid." };

  const { markRegistrationPaid } = await import("@/lib/checkout");
  await markRegistrationPaid(registrationId, { method: "offline", adminUserId: admin.userId });
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "mark_paid_cash",
    entityType: "registrations",
    entityId: registrationId,
  });
  revalidatePath("/admin/registrations");
  revalidatePath("/admin");
  return { ok: true, message: "Marked paid — tickets emailed ✓" };
}

/** Fix a mistyped buyer email, then resend so the tickets finally arrive. */
export async function updateBuyerEmailAction(registrationId: string, newEmail: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const email = newEmail.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) return { ok: false, message: "That doesn't look like an email." };

  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) return { ok: false, message: "Not found." };

  await db.update(schema.registrations).set({ buyerEmail: email, updatedAt: new Date() }).where(eq(schema.registrations.id, registrationId));
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update_buyer_email",
    entityType: "registrations",
    entityId: registrationId,
    changes: { from: reg.buyerEmail, to: email },
  });
  if (reg.status === "paid") await sendTicketsEmail(registrationId, { resend: true });
  revalidatePath("/admin/registrations");
  return { ok: true, message: reg.status === "paid" ? `Email fixed — tickets resent to ${email} ✓` : `Email fixed ✓` };
}

export async function deleteRegistrationAction(registrationId: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const db = getDb();

  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) return { ok: false, message: "Registration not found." };
  const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));

  // full snapshot — preserved in the audit log forever
  const snapshot = {
    confirmationNumber: reg.confirmationNumber,
    event: event?.name,
    buyerName: reg.buyerName,
    buyerEmail: reg.buyerEmail,
    buyerPhone: reg.buyerPhone,
    status: reg.status,
    paymentMethod: reg.paymentMethod,
    totalCents: reg.totalCents,
    createdAt: reg.createdAt.toISOString(),
    tickets: tix.map((t) => ({
      attendee: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(),
      day: t.dayKey,
      food: t.foodPref,
      priceCents: t.priceCents,
      qrCode: t.qrCode,
      checkedInAt: t.checkedInAt?.toISOString() ?? null,
    })),
  };

  // release held capacity, then delete
  for (const t of tix) {
    await db
      .update(schema.ticketTypes)
      .set({ soldCount: sql`${schema.ticketTypes.soldCount} - 1` })
      .where(eq(schema.ticketTypes.id, t.ticketTypeId));
  }
  await db.delete(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
  await db.delete(schema.registrations).where(eq(schema.registrations.id, registrationId));

  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "delete_registration",
    entityType: "registrations",
    entityId: registrationId,
    changes: snapshot,
  });

  // alert email with the full snapshot
  const alertTo = await getConfig<string>("admin_alert_email");
  const ticketLines = snapshot.tickets
    .map((t) => `  • ${t.attendee} — ${t.day === "all" ? "all days" : t.day} — ${formatCents(t.priceCents)}${t.checkedInAt ? " — WAS CHECKED IN" : ""}`)
    .join("\n");
  await sendMail({
    to: alertTo,
    subject: `⚠️ Registration DELETED: ${reg.confirmationNumber} (${formatCents(reg.totalCents)})`,
    text: `An admin deleted a registration. Full snapshot for your records:

Deleted by: ${admin.email}
When: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}

Confirmation: ${snapshot.confirmationNumber}
Event: ${snapshot.event}
Buyer: ${snapshot.buyerName} · ${snapshot.buyerEmail}${snapshot.buyerPhone ? ` · ${snapshot.buyerPhone}` : ""}
Status at deletion: ${snapshot.status} · paid via ${snapshot.paymentMethod}
Total: ${formatCents(snapshot.totalCents)}
Originally created: ${snapshot.createdAt}

Passes:
${ticketLines}

This snapshot is also preserved permanently in the admin audit log.`,
    template: "registration_deleted_alert",
  });

  revalidatePath("/admin/registrations");
  revalidatePath("/admin");
  return { ok: true, message: `Deleted ${reg.confirmationNumber} — alert sent.` };
}
