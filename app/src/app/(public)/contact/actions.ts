"use server";

import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { ensureMediaTables } from "@/lib/media/ensure";
import { sendMail } from "@/lib/email";
import { site } from "@/config/site";

const schemaIn = z.object({
  name: z.string().trim().min(1, "Please tell us your name.").max(120),
  email: z.string().trim().email("Please enter a valid email."),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
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
    await sendMail({
      to: site.contactEmail,
      subject: `New contact message — ${topicLabel} — ${name}`,
      template: "contact_form",
      text: `A new message was submitted through the Pragati website.

Topic:   ${topicLabel}
Name:    ${name}
Email:   ${email}
Phone:   ${phone || "—"}

Message:
${message}

— Reply directly to ${email} to respond.`,
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
