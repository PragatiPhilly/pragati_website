/**
 * Email templates — every one returns { subject, text, html }.
 *
 * `text` is the plain-text fallback (and what shows in the email log / console
 * provider). `html` is the branded version built from the kit in layout.ts.
 *
 * Content rules that matter operationally:
 *  · Timed passes (concert) MUST state the check-in time as a hard statement —
 *    people turn up early and get turned away otherwise.
 *  · Student passes MUST state that a student ID is checked at the gate.
 */
import { formatCents } from "@/lib/pricing";
import {
  shell,
  systemShell,
  para,
  small,
  alertBlock,
  confBox,
  ticketCard,
  summaryTable,
  button,
  buttonRow,
  divider,
  sectionLabel,
  dataRows,
  statRow,
  fileList,
  quote,
  esc,
  C,
} from "./layout";

const sig = (orgName: string) => `\n\nWarm regards,\n${orgName}`;

// ── Zelle acknowledgement ───────────────────────────────────────

export function zelleAckEmail(p: {
  buyerName: string;
  conf: string;
  totalCents: number;
  zelleEmail: string;
  slaHours: number;
  orgName: string;
}) {
  const subject = `We've noted your Zelle payment — ${p.conf}`;
  return {
    subject,
    text: `Namaskar ${p.buyerName},

Thank you! We've recorded your Zelle payment intent of ${formatCents(p.totalCents)} sent to ${p.zelleEmail}.

Confirmation number: ${p.conf}

Our treasurer will verify the deposit — usually within ${p.slaHours} hours — and your tickets will arrive by email right after. Your reservation is held until then.

If you haven't sent the Zelle yet, please do so now and include "${p.conf}" in the memo field.${sig(p.orgName)}`,
    html: shell({
      orgName: p.orgName,
      preheader: `We're holding your seats — verification usually takes ${p.slaHours} hours.`,
      eyebrow: "Payment pending",
      title: `Thank you, ${p.buyerName} — we've noted it.`,
      body:
        para(`We've recorded your Zelle payment of <strong>${formatCents(p.totalCents)}</strong> sent to <strong>${esc(p.zelleEmail)}</strong>.`) +
        confBox(p.conf) +
        alertBlock({
          tone: "warn",
          icon: "⏳",
          title: "Your seats are held — but not confirmed yet",
          body: `Our treasurer verifies the deposit by hand, usually within <strong>${p.slaHours} hours</strong>. Your tickets arrive by email the moment it clears.`,
        }) +
        alertBlock({
          tone: "info",
          icon: "📝",
          title: "Haven't sent it yet?",
          body: `Please send it now and put <strong>${esc(p.conf)}</strong> in the memo field — that's how we match your payment.`,
        }),
    }),
  };
}

// ── Tickets ─────────────────────────────────────────────────────

export type TicketLine = {
  name: string;
  type: string;
  price: number;
  passUrl: string;
  /** timed check-in sentence for this pass */
  note?: string;
  /** day / food summary */
  meta?: string;
  /** e.g. "CONCERT" or "STUDENT" */
  badge?: string;
};

export function ticketsEmail(p: {
  buyerName: string;
  conf: string;
  eventName: string;
  lines: TicketLine[];
  subtotalCents: number;
  discountCents: number;
  membershipCents: number;
  donationCents?: number;
  feeCents: number;
  totalPaidCents: number;
  studentReminder?: boolean;
  lookupUrl: string;
  printUrl: string;
  orgName: string;
  resend?: boolean;
  donationLabel?: string;
  donationNoun?: string;
  /** venue line shown under the title, if known */
  venue?: string;
}) {
  const donation = p.donationCents ?? 0;
  const donationLabel = p.donationLabel ?? "Donation";
  const donationNoun = p.donationNoun ?? "donation";
  const timed = p.lines.filter((l) => l.note);

  // ── plain text ──
  const lineText = p.lines
    .map(
      (l) =>
        `  🎟 ${l.name} — ${l.type}${l.meta ? ` — ${l.meta}` : ""} — ${formatCents(l.price)}\n     Pass: ${l.passUrl}` +
        (l.note ? `\n     ⏰ ${l.note}` : "")
    )
    .join("\n\n");
  const summaryRows: [string, string, boolean?][] = [
    ["Subtotal", formatCents(p.subtotalCents)],
    ...(p.discountCents > 0 ? ([["Discount", `−${formatCents(p.discountCents)}`]] as [string, string][]) : []),
    ...(p.membershipCents > 0 ? ([["Membership (1 yr)", formatCents(p.membershipCents)]] as [string, string][]) : []),
    ...(donation > 0 ? ([[donationLabel, formatCents(donation)]] as [string, string][]) : []),
    ...(p.feeCents > 0 ? ([["Card processing fee", formatCents(p.feeCents)]] as [string, string][]) : []),
    ["Total paid", formatCents(p.totalPaidCents), true],
  ];
  const summaryText = summaryRows.map(([l, v]) => `${`${l}:`.padEnd(22)}${v}`).join("\n");
  const timedText = timed.length
    ? `\n\n⏰ IMPORTANT — TIMED ENTRY\n${timed.map((l) => `   ${l.name}: ${l.note}`).join("\n")}\n   These passes will NOT scan before that time.`
    : "";
  const studentText = p.studentReminder
    ? `\n\n🎓 IMPORTANT — BRING YOUR STUDENT ID\nStudent passes are verified at the gate. Please carry a valid student ID; without it you may be asked to pay the difference.`
    : "";
  const donationThanks =
    donation > 0 ? `\n\n🙏 Thank you for your ${formatCents(donation)} ${donationNoun} — it directly supports ${p.orgName}.` : "";

  // ── html ──
  const html = shell({
    orgName: p.orgName,
    preheader: `${p.lines.length} pass${p.lines.length === 1 ? "" : "es"} for ${p.eventName} · ${p.conf}`,
    eyebrow: p.resend ? "Your tickets (resent)" : "You're in",
    title: p.resend ? `Here are your passes again, ${p.buyerName}.` : `See you at ${p.eventName}, ${p.buyerName}! 🪔`,
    body:
      para(
        p.resend
          ? "As requested, here are your passes. Nothing has changed — the QR codes below are the same ones."
          : `Your payment is confirmed and your passes are ready.${p.venue ? ` We'll see you at <strong>${esc(p.venue)}</strong>.` : ""}`
      ) +
      confBox(p.conf) +
      // the two statements people must not miss
      (timed.length
        ? alertBlock({
            tone: "warn",
            icon: "⏰",
            title: "Timed entry — please note the time",
            body:
              timed.map((l) => `<strong>${esc(l.name)}</strong> — ${esc(l.note!)}`).join("<br>") +
              `<br><span style="color:${C.sindoorDeep};font-weight:700;">These passes will not scan before that time.</span>`,
          })
        : "") +
      (p.studentReminder
        ? alertBlock({
            tone: "warn",
            icon: "🎓",
            title: "Bring your student ID",
            body: "Student passes are verified at the gate. Please carry a valid student ID — without it, you may be asked to pay the difference at entry.",
          })
        : "") +
      sectionLabel(`Your pass${p.lines.length === 1 ? "" : "es"}`) +
      p.lines
        .map((l) =>
          ticketCard({
            name: l.name,
            type: l.type,
            meta: l.meta,
            price: formatCents(l.price),
            passUrl: l.passUrl,
            note: l.note,
            badge: l.badge,
          })
        )
        .join("") +
      buttonRow([button("All passes on one page", p.lookupUrl), button("Print them", p.printUrl, "ghost")]) +
      small("At the gate, show any pass link or the printed QR — each one admits a single person.") +
      divider() +
      sectionLabel("Payment summary") +
      summaryTable(summaryRows) +
      (donation > 0
        ? alertBlock({
            tone: "good",
            icon: "🙏",
            title: `Thank you for your ${donationNoun}`,
            body: `Your ${formatCents(donation)} goes directly to ${esc(p.orgName)}.`,
          })
        : "") +
      small("Lost this email? Any organizer at the desk can resend it in seconds."),
  });

  return {
    subject: `${p.resend ? "(Resent) " : ""}Your tickets for ${p.eventName} 🎟 ${p.conf}`,
    text: `Namaskar ${p.buyerName},

${p.resend ? "Here are your tickets again, as requested. " : "Your payment is confirmed! "}Your passes for ${p.eventName}:

${lineText}${timedText}${studentText}

── Payment summary ────────────────────────
${summaryText}
Confirmation number: ${p.conf}${donationThanks}

── Your Pujo Pass ─────────────────────────
See all QR codes on one page (save this link!):
${p.lookupUrl}

Print-friendly version:
${p.printUrl}

At the gate: show any pass link or the printed QR — each admits one person.
Lost this email? Any organizer at the desk can resend it in seconds.

See you there! 🪔${sig(p.orgName)}`,
    html,
  };
}

// ── Donation / sponsorship receipt ──────────────────────────────

export function donationReceiptEmail(p: {
  donorName: string;
  conf: string;
  amountCents: number;
  honoree?: string;
  honorType?: string;
  orgName: string;
  orgAddress: string;
  noun?: string;
  designation?: string;
}) {
  const noun = p.noun ?? "donation";
  const honorLine =
    p.honoree && p.honorType && p.honorType !== "none"
      ? `\nThis ${noun} was made ${p.honorType === "in_memory_of" ? "in memory of" : "in honor of"} ${p.honoree}.\n`
      : "";
  const designationLine = p.designation ? `\nSupporting: ${p.designation}\n` : "";
  return {
    subject: `Thank you for your ${noun} — ${p.conf}`,
    text: `Dear ${p.donorName},

Thank you for your generous ${noun} of ${formatCents(p.amountCents)} to ${p.orgName}.
${honorLine}${designationLine}
Confirmation number: ${p.conf}

${p.orgName} is a 501(c)(3) nonprofit organization. No goods or services were provided in exchange for this contribution. Please retain this email for your tax records.

${p.orgAddress}${sig(p.orgName)}`,
    html: shell({
      orgName: p.orgName,
      preheader: `Your tax receipt for ${formatCents(p.amountCents)} — keep this email.`,
      eyebrow: "Tax receipt",
      title: `Thank you, ${p.donorName}. 🙏`,
      body:
        para(`Your generous ${esc(noun)} of <strong>${formatCents(p.amountCents)}</strong> to ${esc(p.orgName)} has been received.`) +
        confBox(p.conf, "Receipt number") +
        summaryTable([
          ["Amount", formatCents(p.amountCents)],
          ...(p.designation ? ([["Supporting", p.designation]] as [string, string][]) : []),
          ...(p.honoree && p.honorType && p.honorType !== "none"
            ? ([[p.honorType === "in_memory_of" ? "In memory of" : "In honor of", p.honoree]] as [string, string][])
            : []),
        ]) +
        alertBlock({
          tone: "info",
          icon: "🧾",
          title: "Keep this for your tax records",
          body: `${esc(p.orgName)} is a 501(c)(3) nonprofit organization. No goods or services were provided in exchange for this contribution.`,
        }) +
        small(esc(p.orgAddress)),
    }),
  };
}

// ── Membership welcome ──────────────────────────────────────────

export function welcomeEmail(p: {
  firstName: string;
  familyName: string;
  orgName: string;
  memberNumber?: string;
  validUntil?: string;
  loginUrl?: string;
}) {
  const idLine = p.memberNumber ? `\nYour member ID: ${p.memberNumber}` : "";
  const validLine = p.validUntil
    ? `\nYour membership is active through ${p.validUntil} — one full year. We'll remind you to renew before it lapses so your member discounts keep going.`
    : "";
  const loginLine = p.loginUrl
    ? `\n\nSet your password to sign in and see your membership, family, and tickets anytime:\n${p.loginUrl}\n(If this link expires, just use "Forgot password" with this email.)`
    : `\n\nSign in anytime to manage your family and tickets.`;
  return {
    subject: `Welcome to Pragati, ${p.firstName}! 🪔`,
    text: `Namaskar ${p.firstName},

Welcome to the Pragati family! Your membership for the ${p.familyName} is now active.${idLine}${validLine}

As a member you enjoy discounted tickets for all our events — Durga Pujo, Kali Pujo, Saraswati Pujo, picnics and more — and you're helping keep Bengali culture thriving in Greater Philadelphia.${loginLine}${sig(p.orgName)}`,
    html: shell({
      orgName: p.orgName,
      preheader: `Your membership is active${p.validUntil ? ` through ${p.validUntil}` : ""}.`,
      eyebrow: "Membership active",
      title: `Welcome to the family, ${p.firstName}! 🪔`,
      body:
        para(`Your membership for the <strong>${esc(p.familyName)}</strong> is now active.`) +
        (p.memberNumber ? confBox(p.memberNumber, "Your member ID") : "") +
        (p.validUntil
          ? alertBlock({
              tone: "good",
              icon: "✅",
              title: `Active through ${esc(p.validUntil)}`,
              body: "That's one full year. We'll remind you before it lapses so your member pricing never lapses with it.",
            })
          : "") +
        para(
          "As a member you get discounted tickets to every event — Durga Pujo, Kali Pujo, Saraswati Pujo, picnics and more — and you're helping keep Bengali culture thriving in Greater Philadelphia."
        ) +
        (p.loginUrl
          ? buttonRow([button("Set your password", p.loginUrl)]) +
            small('If that link expires, just use "Forgot password" with this email address.')
          : small("Sign in anytime to manage your family and tickets.")),
    }),
  };
}

// ── Password reset ──────────────────────────────────────────────

export function resetPasswordEmail(p: { name: string; resetUrl: string; orgName: string }) {
  return {
    subject: "Reset your Pragati password",
    text: `Namaskar ${p.name},

Someone (hopefully you) asked to reset the password for this account.
Set a new one here — the link works once and expires in 1 hour:

${p.resetUrl}

If you didn't ask for this, you can safely ignore this email — your password is unchanged.${sig(p.orgName)}`,
    html: shell({
      orgName: p.orgName,
      preheader: "Your password reset link — valid for 1 hour.",
      eyebrow: "Account security",
      title: "Reset your password",
      body:
        para(`Namaskar ${esc(p.name)} — someone (hopefully you) asked to reset the password for this account.`) +
        buttonRow([button("Choose a new password", p.resetUrl)]) +
        alertBlock({
          tone: "info",
          icon: "🔒",
          title: "This link expires in 1 hour",
          body: "It can only be used once. If you didn't request this, you can safely ignore this email — your password is unchanged.",
        }),
    }),
  };
}

// ── Team invite ─────────────────────────────────────────────────

export function inviteEmail(p: { email: string; role: string; invitedBy: string; setupUrl: string; orgName: string }) {
  const roleLabel =
    p.role === "super_admin" ? "Super Admin" : p.role === "admin" ? "Admin" : p.role === "volunteer" ? "Gate Volunteer" : "Member";
  const roleNote =
    p.role === "volunteer"
      ? "As a gate volunteer you'll use the check-in desk to scan passes at the event."
      : "Once you're in, sign in and the admin area will be waiting.";
  return {
    subject: `You've been invited to Pragati as ${roleLabel} 🪔`,
    text: `Namaskar,

${p.invitedBy} has invited you (${p.email}) to join the Pragati team as ${roleLabel}.

Set your password to get started — this link works once and expires in 7 days:

${p.setupUrl}

${roleNote}${sig(p.orgName)}`,
    html: shell({
      orgName: p.orgName,
      preheader: `${p.invitedBy} invited you to join as ${roleLabel}.`,
      eyebrow: "Team invitation",
      title: `You're invited as ${roleLabel}`,
      body:
        para(`<strong>${esc(p.invitedBy)}</strong> has invited you (${esc(p.email)}) to join the Pragati team.`) +
        buttonRow([button("Set your password", p.setupUrl)]) +
        para(esc(roleNote)) +
        small("This link works once and expires in 7 days."),
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Internal / operational mail — slate "system" styling, not festive
// ═══════════════════════════════════════════════════════════════

/** Nightly data backup with the CSVs attached. */
export function backupEmail(p: {
  trigger: "cron" | "manual";
  date: string;
  regCount: number;
  ticketCount: number;
  memberCount: number;
  donationCount: number;
  settingsCount: number;
  files: { name: string; note: string }[];
  snapshotIso: string;
  restoreUrl?: string;
}) {
  const how = p.trigger === "cron" ? "scheduled" : "sent manually from admin";
  return {
    subject: `Pragati daily backup — ${p.date} (${p.regCount} registrations, ${p.memberCount} members)`,
    text: [
      `Daily data backup (${how}).`,
      ``,
      `Registrations: ${p.regCount} (${p.ticketCount} tickets/attendees)`,
      `Member families: ${p.memberCount}`,
      `Donations: ${p.donationCount}`,
      `Settings keys: ${p.settingsCount}`,
      `Snapshot taken: ${p.snapshotIso}`,
      ``,
      `Attached:`,
      ...p.files.map((f) => `· ${f.name} — ${f.note}`),
      ``,
      `Keep these emails — the newest one is always the freshest backup.`,
    ].join("\n"),
    html: systemShell({
      preheader: `${p.regCount} registrations · ${p.memberCount} members · ${p.donationCount} donations captured.`,
      eyebrow: "Daily backup",
      title: `Backup for ${p.date}`,
      body:
        para(`<span style="color:#6B7784;font-size:13px;">Snapshot ${how} — here's what it captured.</span>`) +
        statRow([
          { label: "Registrations", value: p.regCount },
          { label: "Attendees", value: p.ticketCount },
          { label: "Members", value: p.memberCount },
          { label: "Donations", value: p.donationCount },
        ]) +
        (p.regCount === 0
          ? alertBlock({
              tone: "warn",
              icon: "⚠️",
              title: "No registrations in this snapshot",
              body: "That's expected before sales open — but if sales are live, check the database connection.",
            })
          : "") +
        sectionLabel("Attached files") +
        fileList(p.files) +
        dataRows([
          ["Snapshot taken", p.snapshotIso],
          ["Trigger", how],
          ["Settings keys", String(p.settingsCount)],
        ]) +
        (p.restoreUrl ? buttonRow([button("Open restore tool", p.restoreUrl, "ghost")]) : "") +
        small("Keep these emails — the newest one is always the freshest backup. To rebuild after data loss, a super admin restores the registrations CSV from Admin → Registrations."),
    }),
  };
}

/** Someone used the website contact form. */
export function contactFormEmail(p: {
  name: string;
  email: string;
  phone?: string;
  topicLabel: string;
  message: string;
  adminUrl?: string;
}) {
  return {
    subject: `New contact message — ${p.topicLabel} — ${p.name}`,
    text: `A new message was submitted through the Pragati website.

Topic:   ${p.topicLabel}
Name:    ${p.name}
Email:   ${p.email}
Phone:   ${p.phone || "—"}

Message:
${p.message}`,
    html: systemShell({
      preheader: `${p.topicLabel} — from ${p.name}`,
      eyebrow: "Contact form",
      title: `${p.topicLabel} — ${p.name}`,
      body:
        dataRows([
          ["Topic", p.topicLabel],
          ["Name", p.name],
          ["Email", p.email],
          ["Phone", p.phone || "—"],
        ]) +
        sectionLabel("Message") +
        quote(p.message) +
        buttonRow([
          button("Reply by email", `mailto:${p.email}`),
          ...(p.adminUrl ? [button("Open in admin", p.adminUrl, "ghost")] : []),
        ]),
    }),
  };
}

/** Super-admin role granted or revoked — the keys to the kingdom. */
export function roleChangeAlertEmail(p: {
  actorEmail: string;
  targetEmail: string;
  fromRole: string;
  toRole: string;
  auditUrl?: string;
}) {
  return {
    subject: `🔑 Role change: ${p.targetEmail} → ${p.toRole}`,
    text: `${p.actorEmail} changed ${p.targetEmail} from "${p.fromRole}" to "${p.toRole}".\n\nIf this wasn't expected, review the audit log immediately.`,
    html: systemShell({
      tone: "alert",
      preheader: `${p.actorEmail} changed ${p.targetEmail} to ${p.toRole}.`,
      eyebrow: "Security alert",
      title: "A super-admin role was changed",
      body:
        dataRows([
          ["Changed by", p.actorEmail],
          ["Account", p.targetEmail],
          ["From", p.fromRole],
          ["To", p.toRole],
        ]) +
        alertBlock({
          tone: "warn",
          icon: "🔑",
          title: "If this wasn't expected, act now",
          body: "Super admins can change payments, delete registrations, and grant access. Review the audit log and revoke immediately if this is unfamiliar.",
        }) +
        (p.auditUrl ? buttonRow([button("Review audit log", p.auditUrl)]) : ""),
    }),
  };
}

/** A registration was deleted — permanent snapshot for the record. */
export function registrationDeletedEmail(p: {
  adminEmail: string;
  whenLocal: string;
  conf: string;
  event: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  status: string;
  paymentMethod: string;
  totalLabel: string;
  createdAt: string;
  ticketLines: string;
}) {
  return {
    subject: `⚠️ Registration DELETED: ${p.conf} (${p.totalLabel})`,
    text: `An admin deleted a registration. Full snapshot for your records:

Deleted by: ${p.adminEmail}
When: ${p.whenLocal}

Confirmation: ${p.conf}
Event: ${p.event}
Buyer: ${p.buyerName} · ${p.buyerEmail}${p.buyerPhone ? ` · ${p.buyerPhone}` : ""}
Status at deletion: ${p.status} · paid via ${p.paymentMethod}
Total: ${p.totalLabel}
Originally created: ${p.createdAt}

Passes:
${p.ticketLines}

This snapshot is also preserved permanently in the admin audit log.`,
    html: systemShell({
      tone: "alert",
      preheader: `${p.conf} · ${p.totalLabel} · deleted by ${p.adminEmail}`,
      eyebrow: "Deletion alert",
      title: `Registration ${p.conf} was deleted`,
      body:
        dataRows([
          ["Deleted by", p.adminEmail],
          ["When", p.whenLocal],
          ["Confirmation", p.conf],
          ["Event", p.event],
          ["Buyer", `${p.buyerName} · ${p.buyerEmail}${p.buyerPhone ? ` · ${p.buyerPhone}` : ""}`],
          ["Status at deletion", `${p.status} · ${p.paymentMethod}`],
          ["Total", p.totalLabel],
          ["Originally created", p.createdAt],
        ]) +
        sectionLabel("Passes on this registration") +
        quote(p.ticketLines) +
        small("This snapshot is preserved permanently in the admin audit log."),
    }),
  };
}

/** Tell someone a gift was made in their honour / in memory of someone. */
export function honoreeNotifyEmail(p: {
  honoreeName: string;
  donorName: string;
  isAnonymous: boolean;
  honorType: string;
  message?: string;
  orgName: string;
  noun?: string;
}) {
  const noun = p.noun ?? "donation";
  const inWhat = p.honorType === "in_memory_of" ? "in memory of" : "in honor of";
  const who = p.isAnonymous ? "Someone" : p.donorName;
  return {
    subject: `A ${noun} was made ${inWhat} ${p.honoreeName}`,
    text: `Namaskar,

${who} has made a ${noun} to ${p.orgName} ${inWhat} ${p.honoreeName}.

${p.message ? `Their message: "${p.message}"\n\n` : ""}With warmth,
${p.orgName}`,
    html: shell({
      orgName: p.orgName,
      preheader: `${who} gave ${inWhat} ${p.honoreeName}.`,
      eyebrow: "A gift in your name",
      title: `A ${noun} was made ${inWhat} ${p.honoreeName} 🪔`,
      body:
        para(`<strong>${esc(who)}</strong> has made a ${esc(noun)} to ${esc(p.orgName)} ${esc(inWhat)} <strong>${esc(p.honoreeName)}</strong>.`) +
        (p.message
          ? alertBlock({ tone: "info", icon: "💌", title: "Their message", body: esc(p.message) })
          : "") +
        para("Gifts like this keep our pujo, our culture, and our community thriving. Thank you for being part of it."),
    }),
  };
}

// ── Treasurer alert (internal) ──────────────────────────────────

export function treasurerAlertEmail(p: {
  conf: string;
  buyerName: string;
  totalCents: number;
  kind: "registration" | "donation";
  adminUrl: string;
}) {
  return {
    subject: `⏳ Zelle pending: ${p.conf} — ${formatCents(p.totalCents)}`,
    text: `A new Zelle ${p.kind} is awaiting verification.

Confirmation: ${p.conf}
Buyer: ${p.buyerName}
Amount: ${formatCents(p.totalCents)}

Verify it here: ${p.adminUrl}`,
    html: shell({
      orgName: "Pragati",
      preheader: `${p.buyerName} · ${formatCents(p.totalCents)} awaiting verification.`,
      eyebrow: "Action needed",
      title: `Zelle ${p.kind} awaiting verification`,
      body:
        summaryTable([
          ["Confirmation", p.conf],
          ["Buyer", p.buyerName],
          ["Amount", formatCents(p.totalCents), true],
        ]) +
        buttonRow([button("Verify in admin", p.adminUrl)]) +
        small("Seats stay held until this is verified or the hold expires."),
    }),
  };
}
