import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import ResendButton from "./ResendButton";

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  const db = getDb();
  const emails = await db.select().from(schema.emailLog).orderBy(desc(schema.emailLog.createdAt)).limit(100);
  const isTest = (process.env.APP_ENV ?? "test") === "test";

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Email log</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Every email the system has sent.{" "}
        {isTest && (
          <strong>
            Test mode: all mail is redirected to {process.env.TEST_EMAIL_OVERRIDE} — the original recipient is shown
            in the subject prefix.
          </strong>
        )}
      </p>
      <div className="grid gap-3">
        {emails.map((e) => (
          <details key={e.id} className="festive-card">
            <summary className="p-4 cursor-pointer flex items-center justify-between gap-3 flex-wrap list-none">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{e.subject}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                  to {e.originalToEmail ?? e.toEmail} · {e.template} ·{" "}
                  {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <span
                className="text-[11px] font-bold uppercase rounded-full px-2.5 py-1"
                style={{
                  background: e.status === "sent" ? "rgba(92,138,58,0.15)" : "var(--accent-soft)",
                  color: e.status === "sent" ? "var(--leaf-deep)" : "var(--sindoor)",
                }}
              >
                {e.status}
              </span>
            </summary>
            <pre className="px-5 pb-3 text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {e.bodyText}
            </pre>
            {e.error && <p className="px-5 pb-3 text-xs" style={{ color: "var(--sindoor)" }}>{e.error}</p>}
            <div className="px-5 pb-4">
              <ResendButton emailLogId={e.id} />
            </div>
          </details>
        ))}
        {emails.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No emails sent yet.</p>}
      </div>
    </div>
  );
}
