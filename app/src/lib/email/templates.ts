/**
 * Plain-text email templates. Spec: 06-emails-and-notifications.md.
 * (React Email / HTML templates are a v1.5 upgrade — content first.)
 */
import { formatCents } from "@/lib/pricing";

const sig = (orgName: string) => `\n\nWarm regards,\n${orgName}`;

export function zelleAckEmail(p: {
  buyerName: string;
  conf: string;
  totalCents: number;
  zelleEmail: string;
  slaHours: number;
  orgName: string;
}) {
  return {
    subject: `We've noted your Zelle payment — ${p.conf}`,
    text: `Namaskar ${p.buyerName},

Thank you! We've recorded your Zelle payment intent of ${formatCents(p.totalCents)} sent to ${p.zelleEmail}.

Confirmation number: ${p.conf}

Our treasurer will verify the deposit — usually within ${p.slaHours} hours — and your tickets will arrive by email right after. Your reservation is held until then.

If you haven't sent the Zelle yet, please do so now and include "${p.conf}" in the memo field.${sig(p.orgName)}`,
  };
}

export function ticketsEmail(p: {
  buyerName: string;
  conf: string;
  eventName: string;
  lines: { name: string; type: string; price: number; passUrl: string; note?: string }[];
  subtotalCents: number;
  discountCents: number;
  membershipCents: number;
  feeCents: number;
  totalPaidCents: number;
  lookupUrl: string;
  printUrl: string;
  orgName: string;
  resend?: boolean;
}) {
  const lineText = p.lines
    .map(
      (l) =>
        `  🎟 ${l.name} — ${l.type} — ${formatCents(l.price)}\n     Personal pass: ${l.passUrl}` +
        (l.note ? `\n     ⏰ ${l.note}` : "")
    )
    .join("\n\n");
  const summary = [
    `Subtotal:            ${formatCents(p.subtotalCents)}`,
    p.discountCents > 0 ? `Discount:           −${formatCents(p.discountCents)}` : null,
    p.membershipCents > 0 ? `Membership (1 yr):   ${formatCents(p.membershipCents)}` : null,
    p.feeCents > 0 ? `Card processing fee: ${formatCents(p.feeCents)}` : null,
    `Total paid:          ${formatCents(p.totalPaidCents)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    subject: `${p.resend ? "(Resent) " : ""}Your tickets for ${p.eventName} 🎟 ${p.conf}`,
    text: `Namaskar ${p.buyerName},

${p.resend ? `Here are your tickets again, as requested. ` : `Your payment is confirmed! `}Your passes for ${p.eventName}:

${lineText}

── Payment summary ────────────────────────
${summary}
Confirmation number: ${p.conf}

── Your Pujo Pass ─────────────────────────
See all QR codes on one page (save this link!):
${p.lookupUrl}

Print-friendly version:
${p.printUrl}

At the gate: show any pass link or the printed QR — each admits one person.
Lost this email? Any organizer at the desk can resend it in seconds.

See you there! 🪔${sig(p.orgName)}`,
  };
}

export function donationReceiptEmail(p: {
  donorName: string;
  conf: string;
  amountCents: number;
  honoree?: string;
  honorType?: string;
  orgName: string;
  orgAddress: string;
}) {
  const honorLine =
    p.honoree && p.honorType && p.honorType !== "none"
      ? `\nThis donation was made ${p.honorType === "in_memory_of" ? "in memory of" : "in honor of"} ${p.honoree}.\n`
      : "";
  return {
    subject: `Thank you for your donation — ${p.conf}`,
    text: `Dear ${p.donorName},

Thank you for your generous donation of ${formatCents(p.amountCents)} to ${p.orgName}.
${honorLine}
Confirmation number: ${p.conf}

${p.orgName} is a 501(c)(3) nonprofit organization. No goods or services were provided in exchange for this contribution. Please retain this email for your tax records.

${p.orgAddress}${sig(p.orgName)}`,
  };
}

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
  };
}

export function resetPasswordEmail(p: { name: string; resetUrl: string; orgName: string }) {
  return {
    subject: "Reset your Pragati password",
    text: `Namaskar ${p.name},

Someone (hopefully you) asked to reset the password for this account.
Set a new one here — the link works once and expires in 1 hour:

${p.resetUrl}

If you didn't ask for this, you can safely ignore this email — your password is unchanged.${sig(p.orgName)}`,
  };
}

export function inviteEmail(p: { email: string; role: string; invitedBy: string; setupUrl: string; orgName: string }) {
  const roleLabel =
    p.role === "super_admin" ? "Super Admin" : p.role === "admin" ? "Admin" : p.role === "volunteer" ? "Gate Volunteer" : "Member";
  return {
    subject: `You've been invited to Pragati as ${roleLabel} 🪔`,
    text: `Namaskar,

${p.invitedBy} has invited you (${p.email}) to join the Pragati team as ${roleLabel}.

Set your password to get started — this link works once and expires in 7 days:

${p.setupUrl}

${p.role === "volunteer" ? "As a gate volunteer you'll use the check-in desk to scan passes at the event." : "Once you're in, sign in and the admin area will be waiting."}${sig(p.orgName)}`,
  };
}

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
  };
}
