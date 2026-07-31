import { requireSectionAccess } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";
import { buildSampleEmails } from "@/lib/email/samples";
import PreviewClient from "./PreviewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email previews" };

export default async function EmailPreviewPage() {
  const session = await requireSectionAccess("email_preview");
  const samples = await buildSampleEmails();
  const replyTo = await getConfig<string>("system_email_reply_to");
  const isTest = (process.env.APP_ENV ?? "test") === "test";

  return (
    <PreviewClient
      samples={samples.map((s) => ({
        key: s.key,
        label: s.label,
        description: s.description,
        subject: s.subject,
        text: s.text,
        html: s.html ?? "",
      }))}
      defaultEmail={session.email}
      replyTo={replyTo}
      isTest={isTest}
      testOverride={process.env.TEST_EMAIL_OVERRIDE ?? ""}
    />
  );
}
