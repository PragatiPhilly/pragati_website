import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { ensureMediaTables } from "@/lib/media/ensure";
import { toggleHandledAction, deleteMessageAction } from "./actions";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

const TOPIC_LABELS: Record<string, string> = {
  general: "General",
  membership: "Membership",
  events: "Events",
  sponsorship: "Sponsorship",
  volunteer: "Volunteering",
  donation: "Donations",
};

export default async function AdminMessagesPage() {
  await requireSectionAccess("messages");
  const session = await getSession();
  const isAdmin = session && (session.role === "admin" || session.role === "super_admin");
  if (!isAdmin) {
    return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Only admins can view messages.</p>;
  }

  await ensureMediaTables();
  const db = getDb();
  const messages = await db
    .select()
    .from(schema.contactMessages)
    .orderBy(desc(schema.contactMessages.createdAt));

  const open = messages.filter((m) => !m.handledAt);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Messages</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
          Submissions from the website contact form. {open.length} open · {messages.length} total.
        </p>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No messages yet.</p>
      ) : (
        <div className="grid gap-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl p-5"
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                opacity: m.handledAt ? 0.6 : 1,
              }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{m.name}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    >
                      {TOPIC_LABELS[m.topic] ?? m.topic}
                    </span>
                    {m.handledAt && (
                      <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5" style={{ background: "var(--bg-soft)", color: "var(--leaf-deep)" }}>
                        ✓ handled
                      </span>
                    )}
                  </div>
                  <div className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                    <a href={`mailto:${m.email}`} className="underline underline-offset-2">{m.email}</a>
                    {m.phone && <> · {m.phone}</>}
                  </div>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--ink-soft)" }}>
                  {new Date(m.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>

              <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{m.message}</p>

              <div className="mt-4 flex items-center gap-3">
                <a href={`mailto:${m.email}?subject=Re: your message to Pragati`} className="btn-secondary !py-1.5 !px-4 text-xs">
                  Reply
                </a>
                <form action={toggleHandledAction.bind(null, m.id, !m.handledAt)}>
                  <button className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">
                    {m.handledAt ? "Mark unhandled" : "Mark handled"}
                  </button>
                </form>
                <form action={deleteMessageAction.bind(null, m.id)} className="ml-auto">
                  <button className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100" style={{ color: "var(--sindoor)" }}>
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
