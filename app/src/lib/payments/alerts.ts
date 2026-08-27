/**
 * Money alerts. Anything that touches the ledger outside the happy path has to
 * be *seen* by a human — the whole class of bug behind PRG-2026-0025 is
 * "something unusual happened and nobody found out for ten days".
 *
 * Every function here is best-effort: alerting must never fail a payment path.
 */
import { siteUrl } from "@/lib/site-url";

async function notifyTreasurer(subject: string, lines: string[], priority: 1 | 2 | 3 = 1): Promise<void> {
  await notify("treasurer_notification_email", subject, lines, priority);
}

async function notify(
  configKey: "treasurer_notification_email" | "backup_email" | "admin_alert_email",
  subject: string,
  lines: string[],
  priority: 1 | 2 | 3 = 1
): Promise<void> {
  try {
    const { sendMail } = await import("@/lib/email");
    const { getConfig } = await import("@/lib/system-config");
    const to = await getConfig<string>(configKey);
    if (!to) return;
    await sendMail({
      to,
      subject,
      text: `${lines.join("\n")}\n\nPayments log: ${siteUrl("/admin/payments")}`,
      html: `<p>${lines.join("<br>")}</p><p><a href="${siteUrl("/admin/payments")}">Open the Payments log</a></p>`,
      template: "admin_alert",
      priority,
    });
  } catch {
    /* alerting is best-effort */
  }
}

/** A buyer paid a checkout we had already written off. Someone should look. */
export async function alertLatePaymentRecovered(conf: string, buyer: string, totalCents: number): Promise<void> {
  await notifyTreasurer(`✅ Late payment recovered — ${conf}`, [
    `<strong>${buyer}</strong> paid <strong>$${(totalCents / 100).toFixed(2)}</strong> for ${conf} after the reservation had already been swept.`,
    "The registration has been restored to paid, the seats retaken, the ledger settled and the tickets email sent.",
    "Nothing to do unless the event is at capacity — in which case check the headcount.",
  ]);
}

/** Square reported a completed payment we cannot attribute to anything. */
export async function alertOrphanPayment(p: {
  paymentId?: string | null;
  orderId?: string | null;
  referenceId?: string | null;
  amountCents?: number | null;
}): Promise<void> {
  await notifyTreasurer("⚠️ Unmatched Square payment needs reconciling", [
    "Square reported a <strong>COMPLETED</strong> payment we could not attribute to any registration, donation or member.",
    `Payment id: ${p.paymentId ?? "—"}`,
    `Order id: ${p.orderId ?? "—"}`,
    `Reference: ${p.referenceId ?? "—"}`,
    `Amount: ${p.amountCents != null ? `$${(p.amountCents / 100).toFixed(2)}` : "unknown"}`,
    "It is sitting in the Payments log as an unattributed entry.",
  ]);
}

/** A webhook could not be processed. Square will retry, but we want to know now. */
export async function alertWebhookFailure(eventId: string, attempts: number, error: string): Promise<void> {
  // Only shout once it has failed more than once — a single transient blip
  // that Square's own retry fixes is not worth an email.
  if (attempts < 2) return;
  await notifyTreasurer(`🚨 Square webhook failing (${attempts} attempts) — ${eventId}`, [
    `Square event <code>${eventId}</code> has failed to process ${attempts} times.`,
    `Last error: ${error}`,
    "A payment may be sitting in Square that our books do not know about. The reconciler will catch it, but check the Payments log.",
  ]);
}

/** Square charged an amount we did not expect. Never settle these silently. */
export async function alertAmountMismatch(p: {
  reference?: string | null;
  paymentId?: string | null;
  expectedCents: number;
  squareCents: number;
}): Promise<void> {
  await notifyTreasurer(`🚨 Square amount does not match — ${p.reference ?? p.paymentId ?? "unknown"}`, [
    `We expected <strong>$${(p.expectedCents / 100).toFixed(2)}</strong> but Square reports <strong>$${(p.squareCents / 100).toFixed(2)}</strong>.`,
    `Payment id: ${p.paymentId ?? "—"}`,
    "Nothing has been marked paid. Reconcile this by hand before issuing tickets.",
  ]);
}

/**
 * The nightly Square-vs-ledger audit found something. Goes to the management
 * address (the same inbox the daily backups land in), because this is a
 * bookkeeping question for whoever holds the books — not a developer alert.
 *
 * The email deliberately does not say what was fixed, because nothing was.
 * It says what needs deciding, and links to the queue where a person decides it.
 */
export async function alertReconciliationDrift(summary: {
  falseNegatives: number;
  falsePositives: number;
  amountMismatches: number;
  orphans: number;
  newFindings: number;
}): Promise<void> {
  if (summary.newFindings === 0) return;
  const n = summary.newFindings;
  const rows: string[] = [];
  if (summary.falseNegatives > 0)
    rows.push(`<strong>${summary.falseNegatives}</strong> — Square took a payment our website has not recorded as received`);
  if (summary.falsePositives > 0)
    rows.push(`<strong>${summary.falsePositives}</strong> — our website records a card payment Square has no matching record for`);
  if (summary.amountMismatches > 0)
    rows.push(`<strong>${summary.amountMismatches}</strong> — the amount on our side and Square's side do not agree`);
  if (summary.orphans > 0)
    rows.push(`<strong>${summary.orphans}</strong> — Square took money against an order we cannot identify`);

  const body = [
    `The nightly check between Square and the payments recorded on our website found <strong>${n} new item${n === 1 ? "" : "s"}</strong> that need a person to look at them.`,
    "",
    ...rows,
    "",
    "<strong>Nothing has been changed.</strong> Every item is waiting for someone to review it and either approve the correction or dismiss it, and whichever you choose is recorded with your name and the reason.",
    "",
    `Open the review queue: <a href="${siteUrl("/admin/reconciliation")}">${siteUrl("/admin/reconciliation")}</a>`,
  ];

  await notify(
    "backup_email",
    `Payment reconciliation: ${n} item${n === 1 ? "" : "s"} to review`,
    body,
    1
  );
}

/** A person approved a correction. Recorded so the change is never anonymous. */
export async function alertFindingApproved(p: {
  reference: string | null;
  by: string;
  amountCents: number | null;
  detail: string;
}): Promise<void> {
  await notify("backup_email", `Payment correction approved — ${p.reference ?? "unidentified"}`, [
    `<strong>${p.by}</strong> approved a correction in the reconciliation queue.`,
    p.detail,
    p.amountCents != null ? `Amount: <strong>$${(p.amountCents / 100).toFixed(2)}</strong>` : "",
    "The record has been brought in line with Square, and the buyer's tickets or receipt have been issued.",
  ].filter(Boolean));
}
