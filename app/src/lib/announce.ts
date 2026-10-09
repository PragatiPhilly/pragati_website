/**
 * Email everyone coming on a Pujo day (Admin → Email attendees) — for things
 * like "parking lot B is full, use C" or "the concert starts 30 min late".
 *
 * Who: the BUYER of every booking that lets someone in on that day (paid, or a
 * walk-in let in owing), one email per address. Walk-ins with no email are
 * skipped and counted. Mail is queued in the outbox and sent in batches within
 * the daily budget; tickets and receipts always go first.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { coveredDays, regAdmits, type EventDayLite } from "@/lib/checkin/daily";
import { isEmail } from "@/lib/validation";
import { shell, para, esc } from "@/lib/email/layout";

export type Audience = { emails: { email: string; name: string; conf: string }[]; noEmail: number };

export async function audienceFor(event: { id: string; days: unknown }, dayKey: string | "all"): Promise<Audience> {
  const days = (event.days as EventDayLite[] | null) ?? [];
  const db = getDb();
  const regs = (await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, event.id))).filter(regAdmits);
  const rows = await db
    .select({ t: schema.tickets, dayKeys: schema.ticketTypes.dayKeys, band: schema.ticketTypes.ageBand })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.ticketTypes.eventId, event.id));
  const coming = new Set(
    rows
      .filter((x) => x.band !== "addon" && (dayKey === "all" || coveredDays(x.t.dayKey, x.dayKeys, days).includes(dayKey)))
      .map((x) => x.t.registrationId)
  );
  const seen = new Map<string, { email: string; name: string; conf: string }>();
  let noEmail = 0;
  for (const r of regs) {
    if (!coming.has(r.id)) continue;
    const email = r.buyerEmail.trim().toLowerCase();
    if (!isEmail(email)) {
      noEmail++;
      continue;
    }
    if (!seen.has(email)) seen.set(email, { email, name: r.buyerName, conf: r.confirmationNumber });
  }
  return { emails: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)), noEmail };
}

export async function renderAnnouncement(subject: string, message: string): Promise<{ text: string; html: string }> {
  const { getConfig } = await import("@/lib/system-config");
  const orgName = (await getConfig<string>("org_name")) || "Pragati";
  const paragraphs = message
    .trim()
    .split(/\n{2,}/)
    .map((p) => para(esc(p).replace(/\n/g, "<br>")))
    .join("");
  const html = shell({ orgName, preheader: message.trim().slice(0, 120), eyebrow: "Durga Pujo update", title: subject, body: paragraphs });
  return { text: `${message.trim()}\n\n— ${orgName}`, html };
}
