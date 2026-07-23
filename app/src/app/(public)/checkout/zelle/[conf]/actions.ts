"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { zelleSentClicked } from "@/lib/checkout";
import { getConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import * as T from "@/lib/email/templates";
import { siteUrl } from "@/lib/site-url";

export async function zelleSentAction(conf: string, kind: "registration" | "donation") {
  if (kind === "registration") {
    await zelleSentClicked(conf);
    return;
  }
  // donation: ack + treasurer alert
  const db = getDb();
  const [don] = await db.select().from(schema.donations).where(eq(schema.donations.confirmationNumber, conf));
  if (!don || don.status !== "pending_zelle_verification") return;
  const [orgName, zelleEmail, sla, treasurerEmail] = await Promise.all([
    getConfig<string>("org_name"),
    getConfig<string>("zelle_recipient_email"),
    getConfig<number>("zelle_verification_sla_hours"),
    getConfig<string>("treasurer_notification_email"),
  ]);
  const ack = T.zelleAckEmail({
    buyerName: don.donorName,
    conf,
    totalCents: don.amountCents,
    zelleEmail,
    slaHours: sla,
    orgName,
  });
  await sendMail({ to: don.donorEmail, ...ack, template: "zelle_ack", priority: 1 });
  const alert = T.treasurerAlertEmail({
    conf,
    buyerName: don.donorName,
    totalCents: don.amountCents,
    kind: "donation",
    adminUrl: siteUrl("/admin/payments/pending-zelle"),
  });
  await sendMail({ to: treasurerEmail, ...alert, template: "admin_alert", priority: 3, digestKey: "zelle-alerts" });
}
