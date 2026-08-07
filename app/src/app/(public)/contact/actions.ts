"use server";

import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { ensureMediaTables } from "@/lib/media/ensure";
import { sendMail } from "@/lib/email";
import { site } from "@/config/site";
import { isPhone } from "@/lib/validation";

const schemaIn = z.object({
  name: z.string().trim().min(1, "Please tell us your name.").max(120),
  email: z.string().trim().email("Please enter a valid email (name@example.com)."),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => isPhone(v, true), "Please add a mobile number so we can get back to you."),
  topic: z.string().trim().max(60).default("general"),
  message: z.string().trim().min(5, "Please add a little more detail.").max(4000),
});

const TOPIC_LABELS: Record<string, string> = {
  general: "General enquiry",
  membership: "Membership",
  events: "Events & tickets",
  sponsorship: "Sponsorship",
  volunteer: "Volunteering",
  donation: "Donations",
};

export async function submitContactAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = schemaIn.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid submission." };
  }
  const { name, email, phone, topic, message } = parsed.data;

  try {
    await ensureMediaTables();
    const db = getDb();
    await db.insert(schema.contactMessages).values({
      name,
      email,
      phone: phone || null,
      topic,
      message,
    });

    const topicLabel = TOPIC_LABELS[topic] ?? topic;
    const { contactFormEmail } = await import("@/lib/email/templates");
    const { siteUrl } = await import("@/lib/site-url");
    const mail = contactFormEmail({
      name,
      email,
      phone: phone || undefined,
      topicLabel,
      message,
      adminUrl: siteUrl("/admin/messages"),
    });
    await sendMail({ to: site.contactEmail, ...mail, template: "contact_form" });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
