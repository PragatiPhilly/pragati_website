/**
 * Membership ↔ registration coupling mode (the "backdoor").
 *
 *   honor  — this event. We trust "I'm a member" claims at registration; no
 *            sign-in and no account needed (old members have no credentials).
 *   verify — future. Real accounts + DB matching at registration time.
 *
 * The member PORTAL is a separate question from the registration mode. Anyone
 * who actually holds an account — signed up at /signup, or paid dues during
 * registration — can sign in and use /m, even while registration runs on the
 * honor system. Only honor-system claims (members created with
 * source='self_declared') have no portal: they never set a password, so there
 * is nothing for them to sign in to.
 */
import { getConfig } from "@/lib/system-config";

export async function getMemberMode(): Promise<"honor" | "verify"> {
  return (await getConfig<string>("member_mode")) === "verify" ? "verify" : "honor";
}

/**
 * Can this member use the /m portal? True for real account-holders, false for
 * honor-system (self-declared) members and for anyone without a member record.
 */
export async function canUseMemberPortal(memberId?: string | null): Promise<boolean> {
  if (!memberId) return false;
  try {
    const { ensureExtraColumns } = await import("@/lib/schema-ensure");
    await ensureExtraColumns(); // members.source may predate this feature
    const { getDb, schema } = await import("@/db/client");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [m] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
    return !!m && m.source !== "self_declared";
  } catch {
    return false;
  }
}
