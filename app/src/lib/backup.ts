/**
 * Registration backup + restore.
 *
 * Backup: a restore-grade CSV snapshot of EVERY registration and ticket
 * (one row per ticket; ticketless registrations get one row with blank
 * ticket columns), emailed daily to the configured backup address. If the
 * database is ever lost, the newest email attachment IS the dataset.
 *
 * Restore: super-admin uploads that CSV back; missing events / ticket types
 * are recreated as stubs, existing rows (same confirmation number / QR code)
 * are left untouched — safe to run repeatedly.
 */
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { sendMail } from "@/lib/email";
import { getConfig } from "@/lib/system-config";

// ── CSV building ────────────────────────────────────────────────

const REG_COLS = [
  "reg_id", "confirmation_number", "event_slug", "event_name", "buyer_name", "buyer_email",
  "buyer_phone", "member_id", "is_member_purchase", "source", "subtotal_cents", "discount_cents",
  "total_cents", "payment_method", "status", "square_order_id", "square_payment_id",
  "paid_at", "reg_created_at", "reg_notes",
] as const;

const TKT_COLS = [
  "ticket_id", "ticket_type_name", "attendee_first_name", "attendee_last_name", "attendee_age",
  "attendee_is_member", "food_pref", "dietary_notes", "day_key", "price_cents", "qr_code",
  "checked_in_at", "ticket_created_at",
] as const;

export const BACKUP_HEADER = [...REG_COLS, ...TKT_COLS].join(",");

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function buildBackupCsv(): Promise<{ csv: string; regCount: number; ticketCount: number }> {
  const db = getDb();
  const [regs, tickets, events, types] = await Promise.all([
    db.select().from(schema.registrations).orderBy(asc(schema.registrations.createdAt)),
    db.select().from(schema.tickets),
    db.select().from(schema.events),
    db.select().from(schema.ticketTypes),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const ticketsByReg = new Map<string, (typeof tickets)[number][]>();
  for (const t of tickets) {
    const arr = ticketsByReg.get(t.registrationId) ?? [];
    arr.push(t);
    ticketsByReg.set(t.registrationId, arr);
  }

  const lines = [BACKUP_HEADER];
  for (const r of regs) {
    const ev = eventById.get(r.eventId);
    const regPart = [
      r.id, r.confirmationNumber, ev?.slug ?? "", ev?.name ?? "", r.buyerName, r.buyerEmail,
      r.buyerPhone, r.memberId, r.isMemberPurchase, r.source, r.subtotalCents, r.discountCents,
      r.totalCents, r.paymentMethod, r.status, r.squareOrderId, r.squarePaymentId,
      r.paidAt?.toISOString() ?? "", r.createdAt.toISOString(), r.notes,
    ];
    const tix = ticketsByReg.get(r.id) ?? [];
    if (tix.length === 0) {
      lines.push([...regPart, ...TKT_COLS.map(() => "")].map(esc).join(","));
      continue;
    }
    for (const t of tix) {
      const ticketPart = [
        t.id, typeById.get(t.ticketTypeId)?.name ?? "", t.attendeeFirstName, t.attendeeLastName,
        t.attendeeAge, t.attendeeIsMember, t.foodPref, t.dietaryNotes, t.dayKey, t.priceCents,
        t.qrCode, t.checkedInAt?.toISOString() ?? "", t.createdAt.toISOString(),
      ];
      lines.push([...regPart, ...ticketPart].map(esc).join(","));
    }
  }
  return { csv: lines.join("\r\n"), regCount: regs.length, ticketCount: tickets.length };
}

// ── companion snapshots (members, donations, settings) ─────────
// Secondary datasets on the same nightly email. Registrations are the
// crown jewels (restorable via the admin UI); these cover everything else
// an org would hate to lose. Password hashes are deliberately excluded —
// members can reset passwords by email, and backups shouldn't leak secrets.

export async function buildMembersCsv(): Promise<{ csv: string; count: number }> {
  const db = getDb();
  const [members, families, users] = await Promise.all([
    db.select().from(schema.members),
    db.select().from(schema.familyMembers),
    db.select().from(schema.users),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const famByMember = new Map<string, (typeof families)[number][]>();
  for (const f of families) {
    const arr = famByMember.get(f.memberId) ?? [];
    arr.push(f);
    famByMember.set(f.memberId, arr);
  }
  const header = [
    "member_id", "family_name", "primary_first_name", "primary_last_name", "email", "role",
    "phone", "address_line1", "address_line2", "city", "state", "zip",
    "membership_status", "membership_started_at", "family_members", "notes", "created_at",
  ].join(",");
  const lines = [header];
  for (const m of members) {
    const u = userById.get(m.userId);
    const fam = (famByMember.get(m.id) ?? [])
      .map((f) => `${f.firstName} ${f.lastName ?? ""} (${f.relationship}/${f.foodPref ?? "-"})`.trim())
      .join("; ");
    lines.push(
      [
        m.id, m.familyName, m.primaryFirstName, m.primaryLastName, u?.email, u?.role,
        m.phone, m.addressLine1, m.addressLine2, m.city, m.state, m.zip,
        m.membershipStatus, m.membershipStartedAt, fam, m.notes, m.createdAt.toISOString(),
      ].map(esc).join(",")
    );
  }
  return { csv: lines.join("\r\n"), count: members.length };
}

export async function buildDonationsCsv(): Promise<{ csv: string; count: number }> {
  const db = getDb();
  const donations = await db.select().from(schema.donations);
  const header = [
    "donation_id", "confirmation_number", "donor_name", "donor_email", "donor_phone",
    "amount_cents", "in_honor_or_memory", "honoree_name", "message", "is_anonymous",
    "payment_method", "status", "paid_at", "created_at",
  ].join(",");
  const lines = [header];
  for (const d of donations) {
    lines.push(
      [
        d.id, d.confirmationNumber, d.donorName, d.donorEmail, d.donorPhone,
        d.amountCents, d.inHonorOrMemory, d.honoreeName, d.message, d.isAnonymous,
        d.paymentMethod, d.status, d.paidAt?.toISOString() ?? "", d.createdAt.toISOString(),
      ].map(esc).join(",")
    );
  }
  return { csv: lines.join("\r\n"), count: donations.length };
}

export async function buildSettingsCsv(): Promise<{ csv: string; count: number }> {
  const db = getDb();
  const rows = await db.select().from(schema.systemConfig);
  const lines = ["key,value,updated_at"];
  for (const r of rows) {
    lines.push([r.key, JSON.stringify(r.value), r.updatedAt.toISOString()].map(esc).join(","));
  }
  return { csv: lines.join("\r\n"), count: rows.length };
}

// ── daily backup email ──────────────────────────────────────────

export async function sendBackupEmail(trigger: "cron" | "manual"): Promise<{
  ok: boolean;
  to: string;
  regCount: number;
  ticketCount: number;
  memberCount: number;
  donationCount: number;
}> {
  const to = await getConfig<string>("backup_email");
  const [{ csv, regCount, ticketCount }, membersCsv, donationsCsv, settingsCsv] = await Promise.all([
    buildBackupCsv(),
    buildMembersCsv(),
    buildDonationsCsv(),
    buildSettingsCsv(),
  ]);
  const date = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const stamp = new Date().toISOString().slice(0, 10);

  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

  await sendMail({
    to,
    template: "registration_backup",
    subject: `Pragati daily backup — ${date} (${regCount} registrations, ${membersCsv.count} members)`,
    text: [
      `Daily data backup (${trigger === "cron" ? "scheduled" : "sent manually from admin"}).`,
      ``,
      `Registrations: ${regCount} (${ticketCount} tickets/attendees)`,
      `Member families: ${membersCsv.count}`,
      `Donations: ${donationsCsv.count}`,
      `Settings keys: ${settingsCsv.count}`,
      `Snapshot taken: ${new Date().toISOString()}`,
      ``,
      `Attached:`,
      `· registrations CSV — the critical one. If the database is ever lost, a`,
      `  super admin restores it from Admin → Registrations → "Restore from`,
      `  backup CSV" using this exact file.`,
      `· members CSV — families, contact info, membership status (no passwords;`,
      `  members reset by email after a rebuild).`,
      `· donations CSV — full donation history for the treasurer's records.`,
      `· settings CSV — Admin → Settings values, to re-enter after a rebuild.`,
      ``,
      `Keep these emails — the newest one is always the freshest backup.`,
    ].join("\n"),
    attachments: [
      { filename: `pragati-registrations-backup-${stamp}.csv`, content: b64(csv) },
      { filename: `pragati-members-backup-${stamp}.csv`, content: b64(membersCsv.csv) },
      { filename: `pragati-donations-backup-${stamp}.csv`, content: b64(donationsCsv.csv) },
      { filename: `pragati-settings-backup-${stamp}.csv`, content: b64(settingsCsv.csv) },
    ],
  });

  return {
    ok: true,
    to,
    regCount,
    ticketCount,
    memberCount: membersCsv.count,
    donationCount: donationsCsv.count,
  };
}

// ── restore ─────────────────────────────────────────────────────

/** Tiny RFC-4180 CSV parser (quotes, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

export type RestoreResult = {
  regsInserted: number;
  regsSkipped: number;
  ticketsInserted: number;
  ticketsSkipped: number;
  eventsCreated: string[];
  errors: string[];
};

export async function restoreFromCsv(text: string, restoredBy: string): Promise<RestoreResult> {
  const db = getDb();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV is empty.");

  const header = rows[0].map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);
  // sanity: this must be OUR backup format
  for (const required of ["confirmation_number", "event_slug", "buyer_email", "qr_code"]) {
    if (idx(required) === -1) {
      throw new Error(
        `This doesn't look like a Pragati backup CSV — missing the "${required}" column. ` +
          `Use the file attached to a backup email (not the human-readable export).`
      );
    }
  }
  const get = (row: string[], col: string) => row[idx(col)] ?? "";
  const num = (v: string) => (v === "" ? 0 : parseInt(v, 10) || 0);
  const bool = (v: string) => v === "true";
  const dateOrNull = (v: string) => (v ? new Date(v) : null);

  const result: RestoreResult = {
    regsInserted: 0, regsSkipped: 0, ticketsInserted: 0, ticketsSkipped: 0,
    eventsCreated: [], errors: [],
  };

  // current DB state
  const [events, types, regs, tickets] = await Promise.all([
    db.select().from(schema.events),
    db.select().from(schema.ticketTypes),
    db.select().from(schema.registrations),
    db.select().from(schema.tickets),
  ]);
  const eventBySlug = new Map(events.map((e) => [e.slug, e]));
  const typeByKey = new Map(types.map((t) => [`${t.eventId}:${t.name}`, t]));
  const regByConf = new Map(regs.map((r) => [r.confirmationNumber, r]));
  const knownQr = new Set(tickets.map((t) => t.qrCode));

  // group data rows by confirmation number (a reg spans multiple ticket rows)
  const byConf = new Map<string, string[][]>();
  for (const row of rows.slice(1)) {
    const conf = get(row, "confirmation_number");
    if (!conf) continue;
    const arr = byConf.get(conf) ?? [];
    arr.push(row);
    byConf.set(conf, arr);
  }

  for (const [conf, regRows] of byConf) {
    try {
      const first = regRows[0];

      // 1. event — match by slug, else create an archived stub
      const slug = get(first, "event_slug") || "restored-event";
      let event = eventBySlug.get(slug);
      if (!event) {
        const [created] = await db
          .insert(schema.events)
          .values({
            slug,
            name: get(first, "event_name") || slug,
            status: "archived", // restored stub — not publicly visible
            startsAt: new Date(),
            endsAt: new Date(),
            createdBy: restoredBy,
          })
          .returning();
        event = created;
        eventBySlug.set(slug, created);
        result.eventsCreated.push(slug);
      }

      // 2. registration — skip if the confirmation number already exists
      let reg = regByConf.get(conf);
      if (reg) {
        result.regsSkipped++;
      } else {
        const [created] = await db
          .insert(schema.registrations)
          .values({
            id: get(first, "reg_id") || undefined,
            confirmationNumber: conf,
            eventId: event.id,
            memberId: null, // member links may not exist in a fresh DB — keep as guest
            buyerEmail: get(first, "buyer_email"),
            buyerName: get(first, "buyer_name"),
            buyerPhone: get(first, "buyer_phone") || null,
            isMemberPurchase: bool(get(first, "is_member_purchase")),
            source: get(first, "source") || "web",
            subtotalCents: num(get(first, "subtotal_cents")),
            discountCents: num(get(first, "discount_cents")),
            totalCents: num(get(first, "total_cents")),
            paymentMethod: get(first, "payment_method") || "offline",
            status: get(first, "status") || "paid",
            squareOrderId: get(first, "square_order_id") || null,
            squarePaymentId: get(first, "square_payment_id") || null,
            paidAt: dateOrNull(get(first, "paid_at")),
            createdAt: dateOrNull(get(first, "reg_created_at")) ?? new Date(),
            notes: get(first, "reg_notes") || `Restored from backup CSV`,
          })
          .returning();
        reg = created;
        regByConf.set(conf, created);
        result.regsInserted++;
      }

      // 3. tickets — skip rows whose QR already exists (or blank ticket rows)
      for (const row of regRows) {
        const qr = get(row, "qr_code");
        if (!qr) continue;
        if (knownQr.has(qr)) {
          result.ticketsSkipped++;
          continue;
        }
        const typeName = get(row, "ticket_type_name") || "Restored ticket";
        const typeKey = `${event.id}:${typeName}`;
        let type = typeByKey.get(typeKey);
        if (!type) {
          const [created] = await db
            .insert(schema.ticketTypes)
            .values({
              eventId: event.id,
              name: typeName,
              priceMemberCents: 0,
              priceNonmemberCents: 0,
            })
            .returning();
          type = created;
          typeByKey.set(typeKey, created);
        }
        await db.insert(schema.tickets).values({
          id: get(row, "ticket_id") || undefined,
          registrationId: reg.id,
          ticketTypeId: type.id,
          attendeeFirstName: get(row, "attendee_first_name") || "Guest",
          attendeeLastName: get(row, "attendee_last_name") || null,
          attendeeAge: get(row, "attendee_age") ? num(get(row, "attendee_age")) : null,
          attendeeIsMember: bool(get(row, "attendee_is_member")),
          foodPref: get(row, "food_pref") || null,
          dietaryNotes: get(row, "dietary_notes") || null,
          dayKey: get(row, "day_key") || "all",
          priceCents: num(get(row, "price_cents")),
          qrCode: qr,
          checkedInAt: dateOrNull(get(row, "checked_in_at")),
          createdAt: dateOrNull(get(row, "ticket_created_at")) ?? new Date(),
        });
        knownQr.add(qr);
        result.ticketsInserted++;
      }
    } catch (e) {
      result.errors.push(`${conf}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await db.insert(schema.auditLog).values({
    userId: restoredBy,
    action: "restore_from_backup",
    entityType: "registrations",
    changes: {
      regsInserted: result.regsInserted,
      regsSkipped: result.regsSkipped,
      ticketsInserted: result.ticketsInserted,
      ticketsSkipped: result.ticketsSkipped,
      eventsCreated: result.eventsCreated,
      errors: result.errors.length,
    },
  });

  return result;
}
