import Link from "next/link";
import { inArray } from "drizzle-orm";
import "../desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { listFollowups } from "@/lib/desk/followups";
import { FOLLOWUP_LABEL, type FollowupKind } from "@/lib/desk/constants";
import FollowupList, { type FollowupRow } from "./FollowupList";

export const dynamic = "force-dynamic";
export const metadata = { title: "To chase up" };

export default async function FollowupsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  await requireSectionAccess("desk");
  await ensureDeskSchema();
  const { kind, status } = await searchParams;
  const db = getDb();

  const rows = await listFollowups({
    kind: (kind as FollowupKind) || undefined,
    status: (status as "open" | "resolved" | "waived" | "all") || "open",
  });

  const assignees = [...new Set(rows.map((r) => r.assignedTo).filter(Boolean) as string[])];
  const users = assignees.length
    ? await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, assignees))
    : [];

  const view: FollowupRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as FollowupKind,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
    registrationId: r.registrationId,
    conf: r.conf,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    assignedToEmail: users.find((u) => u.id === r.assignedTo)?.email ?? null,
    status: r.status,
  }));

  const counts = new Map<string, number>();
  for (const r of view) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);

  return (
    <div className="desk-shell max-w-4xl">
      <div>
        <Link href="/admin/desk" className="text-xs underline underline-offset-4">
          ← Desk
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">To chase up</h1>
        <p className="desk-note">
          Everything the desk couldn’t finish on the night — a missing email, a cheque still to bank, money
          someone still owes. Nothing disappears on its own: an item goes away when someone deals with it, or drops it
          with a note saying why.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/desk/followups" className={`kind-btn ${!kind ? "" : ""}`} aria-pressed={!kind}>
          All ({view.length})
        </Link>
        {[...counts.entries()].map(([k, n]) => (
          <Link key={k} href={`/admin/desk/followups?kind=${k}`} className="kind-btn" aria-pressed={kind === k}>
            {FOLLOWUP_LABEL[k as FollowupKind] ?? k} ({n})
          </Link>
        ))}
        <Link
          href={`/admin/desk/followups?status=${status === "all" ? "open" : "all"}`}
          className="text-xs underline underline-offset-4 self-center ml-2"
        >
          {status === "all" ? "show open only" : "show closed too"}
        </Link>
      </div>

      <FollowupList rows={view} />
    </div>
  );
}
