/**
 * Realistic sample emails for the admin preview / test-send page.
 *
 * These are built from the LIVE site data wherever possible — the active
 * event's name and venue, its real ticket-type names and prices, the configured
 * org name and address, the current donation mode — so what you preview is what
 * a real buyer receives. Nothing here writes to the database; it only renders
 * templates with representative inputs.
 */
import { getConfig } from "@/lib/system-config";
import { siteUrl } from "@/lib/site-url";
import { getActiveEvent, getEventBySlug } from "@/lib/queries/events";
import { getDonationMode, DONATION_COPY, PUJO_DESIGNATIONS } from "@/lib/donation-mode";
import * as T from "./templates";

export type SampleEmail = {
  key: string;
  label: string;
  description: string;
  subject: string;
  text: string;
  html?: string;
};

export async function buildSampleEmails(): Promise<SampleEmail[]> {
  const [orgName, orgAddress, membershipPrice, zelleEmail, slaHours] = await Promise.all([
    getConfig<string>("org_name"),
    getConfig<string>("org_address"),
    getConfig<number>("membership_annual_price_cents"),
    getConfig<string>("zelle_recipient_email"),
    getConfig<number>("zelle_verification_sla_hours"),
  ]);
  const dCopy = DONATION_COPY[await getDonationMode()];

  // Pull the real active event + its real passes so names/prices look genuine.
  const base = await getActiveEvent();
  const full = base ? await getEventBySlug(base.slug) : null;
  const eventName = full?.name ?? "Durga Pujo 2026";
  const venue = full?.venueName ?? undefined;
  const days = (full?.days as { key: string; label: string; date: string }[] | null) ?? [];
  const dayLabel = days[0]?.label ?? "Saturday";
  const types = (full?.ticketTypes ?? []).filter((t) => t.ageBand !== "addon");
  const priceOf = (t: (typeof types)[number]) =>
    t.priceNonmemberCents >= 0 ? t.priceNonmemberCents : t.priceMemberCents;

  const adultType = types.find((t) => t.ageBand === "adult") ?? types[0];
  const concertType = types.find((t) => t.ageBand === "concert");
  const studentType = types.find((t) => t.ageBand === "student");
  const youthType = types.find((t) => t.ageBand === "child_5_18" || t.ageBand === "child_5_12");

  const conf = "PRG-2026-0042";
  const lookupUrl = siteUrl(`/lookup?email=sample%40example.com&conf=${conf}`);
  const printUrl = siteUrl(`/tickets/${conf}/print?email=sample%40example.com`);
  const passUrl = (n: number) => siteUrl(`/t/PRAGATI-TKT-SAMPLE${n}`);

  const niceTime = concertType?.checkInStart
    ? new Date(`2000-01-01T${concertType.checkInStart}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "7:00 PM";

  // ── the full-house ticket email: adult + youth + student + concert ──
  const lines: T.TicketLine[] = [
    {
      name: "Sayantan Kundu",
      type: adultType?.name ?? "Adult — all days (with food)",
      meta: `All days · Non-veg`,
      price: adultType ? priceOf(adultType) : 17000,
      passUrl: passUrl(1),
    },
    ...(youthType
      ? [
          {
            name: "Ria Kundu",
            type: youthType.name,
            meta: `All days · Veg`,
            price: priceOf(youthType),
            passUrl: passUrl(2),
          },
        ]
      : []),
    ...(studentType
      ? [
          {
            name: "Ankit Sen",
            type: studentType.name,
            meta: `All days · Veg`,
            price: priceOf(studentType),
            passUrl: passUrl(3),
            badge: "STUDENT · ID REQUIRED",
          },
        ]
      : []),
    ...(concertType
      ? [
          {
            name: "Sayantan Kundu",
            type: concertType.name,
            meta: `${dayLabel} · No meal`,
            price: priceOf(concertType),
            passUrl: passUrl(4),
            badge: "CONCERT · TIMED ENTRY",
            note: `Check-in opens at ${niceTime} on ${dayLabel} — this pass won't scan before then.`,
          },
        ]
      : []),
  ];
  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  const donationCents = 2500;
  const feeCents = Math.round((subtotal + donationCents) * 0.029) + 30;

  const ticketsFull = T.ticketsEmail({
    buyerName: "Sayantan Kundu",
    conf,
    eventName,
    lines,
    subtotalCents: subtotal,
    discountCents: 0,
    membershipCents: 0,
    donationCents,
    feeCents,
    totalPaidCents: subtotal + donationCents + feeCents,
    studentReminder: !!studentType,
    lookupUrl,
    printUrl,
    orgName,
    donationLabel: dCopy.lineLabel,
    donationNoun: dCopy.receiptNoun,
    venue,
  });

  // ── a simple single-pass purchase, no extras ──
  const simpleLines: T.TicketLine[] = [
    {
      name: "Anjali Das",
      type: adultType?.name ?? "Adult — all days (with food)",
      meta: "All days · Veg",
      price: adultType ? priceOf(adultType) : 17000,
      passUrl: passUrl(5),
    },
  ];
  const simpleSubtotal = simpleLines[0].price;
  const ticketsSimple = T.ticketsEmail({
    buyerName: "Anjali Das",
    conf: "PRG-2026-0043",
    eventName,
    lines: simpleLines,
    subtotalCents: simpleSubtotal,
    discountCents: 1500,
    membershipCents: membershipPrice,
    feeCents: Math.round((simpleSubtotal + membershipPrice) * 0.029) + 30,
    totalPaidCents: simpleSubtotal - 1500 + membershipPrice + Math.round((simpleSubtotal + membershipPrice) * 0.029) + 30,
    lookupUrl,
    printUrl,
    orgName,
    donationLabel: dCopy.lineLabel,
    donationNoun: dCopy.receiptNoun,
    venue,
  });

  // ── concert-only buyer (the timed-entry statement on its own) ──
  const concertOnly = T.ticketsEmail({
    buyerName: "Rahul Bose",
    conf: "PRG-2026-0044",
    eventName,
    lines: [
      {
        name: "Rahul Bose",
        type: concertType?.name ?? "Concert night",
        meta: `${dayLabel} · No meal`,
        price: concertType ? priceOf(concertType) : 5000,
        passUrl: passUrl(6),
        badge: "CONCERT · TIMED ENTRY",
        note: `Check-in opens at ${niceTime} on ${dayLabel} — this pass won't scan before then.`,
      },
    ],
    subtotalCents: concertType ? priceOf(concertType) : 5000,
    discountCents: 0,
    membershipCents: 0,
    feeCents: 175,
    totalPaidCents: (concertType ? priceOf(concertType) : 5000) + 175,
    lookupUrl,
    printUrl,
    orgName,
    venue,
  });

  const resent = T.ticketsEmail({
    ...{
      buyerName: "Sayantan Kundu",
      conf,
      eventName,
      lines: lines.slice(0, 2),
      subtotalCents: subtotal,
      discountCents: 0,
      membershipCents: 0,
      feeCents,
      totalPaidCents: subtotal + feeCents,
      lookupUrl,
      printUrl,
      orgName,
      venue,
    },
    resend: true,
  });

  const samples: SampleEmail[] = [
    {
      key: "tickets_full",
      label: "Tickets — full house",
      description: "Adult + youth + student + concert, with a sponsorship. Shows both the timed-entry and student-ID statements.",
      ...ticketsFull,
    },
    {
      key: "tickets_simple",
      label: "Tickets — one adult + membership",
      description: "A single pass with a promo discount and a membership signup folded in.",
      ...ticketsSimple,
    },
    {
      key: "tickets_concert",
      label: "Tickets — concert only",
      description: "The timed-entry statement standing on its own.",
      ...concertOnly,
    },
    {
      key: "tickets_resend",
      label: "Tickets — resent by an organizer",
      description: "What someone gets when the desk resends their tickets.",
      ...resent,
    },
    {
      key: "zelle_ack",
      label: "Zelle — payment noted",
      description: "Sent when a buyer says they've sent the Zelle. Seats held, not yet confirmed.",
      ...T.zelleAckEmail({
        buyerName: "Anjali Das",
        conf: "PRG-2026-0043",
        totalCents: simpleSubtotal,
        zelleEmail,
        slaHours,
        orgName,
      }),
    },
    {
      key: "donation_receipt",
      label: `${dCopy.navLabel} — tax receipt`,
      description: "The receipt a donor keeps for taxes. Follows the current donation mode.",
      ...T.donationReceiptEmail({
        donorName: "Meera Chatterjee",
        conf: "DON-2026-0007",
        amountCents: 10000,
        orgName,
        orgAddress,
        noun: dCopy.receiptNoun,
        designation: PUJO_DESIGNATIONS[1]?.label,
      }),
    },
    {
      key: "welcome",
      label: "Membership — welcome",
      description: "New member, with member ID, expiry and a set-password link.",
      ...T.welcomeEmail({
        firstName: "Anjali",
        familyName: "Das family",
        orgName,
        memberNumber: "PGM-4F2A9C11",
        validUntil: new Date(Date.now() + 365 * 86400000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        loginUrl: siteUrl("/reset-password?token=sample-token"),
      }),
    },
    {
      key: "reset_password",
      label: "Account — password reset",
      description: "The reset link, valid for one hour.",
      ...T.resetPasswordEmail({ name: "Anjali", resetUrl: siteUrl("/reset-password?token=sample-token"), orgName }),
    },
    {
      key: "invite_volunteer",
      label: "Team — gate volunteer invite",
      description: "Inviting a volunteer to the scan desk.",
      ...T.inviteEmail({
        email: "volunteer@example.com",
        role: "volunteer",
        invitedBy: "Sayantan Kundu",
        setupUrl: siteUrl("/reset-password?token=sample-invite"),
        orgName,
      }),
    },
    {
      key: "invite_admin",
      label: "Team — admin invite",
      description: "Inviting a fellow organizer to the admin area.",
      ...T.inviteEmail({
        email: "organizer@example.com",
        role: "admin",
        invitedBy: "Sayantan Kundu",
        setupUrl: siteUrl("/reset-password?token=sample-invite"),
        orgName,
      }),
    },
    {
      key: "treasurer_alert",
      label: "Internal — treasurer Zelle alert",
      description: "What the treasurer receives when a Zelle payment needs verifying.",
      ...T.treasurerAlertEmail({
        conf: "PRG-2026-0043",
        buyerName: "Anjali Das",
        totalCents: simpleSubtotal,
        kind: "registration",
        adminUrl: siteUrl("/admin/payments/pending-zelle"),
      }),
    },
  ];

  return samples;
}
