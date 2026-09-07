/**
 * Who may do what at the desk.
 *
 * Two layers, matching the pattern already in lib/auth/access.ts: the section
 * matrix decides which PAGES a role can open, and every destructive or
 * money-moving action carries its own check on top. A volunteer can take cash
 * all evening; a volunteer cannot comp a ticket, void someone else's tender, or
 * decide that money held in a personal account has reached the organisation.
 *
 * Every function here THROWS on refusal. The desk's server actions catch and
 * return the message, so a hand-crafted request gets the same "no" the button
 * would have given.
 */
import { getSession, type SessionUser } from "@/lib/auth/session";
import { sectionsForRole } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";

export class DeskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeskError";
  }
}

export type DeskActor = SessionUser & { isAdmin: boolean; isTreasurer: boolean; isSuper: boolean };

async function actorFrom(session: SessionUser | null, section: "desk" | "desk_money"): Promise<DeskActor> {
  if (!session) throw new DeskError("Please sign in.");
  const isSuper = session.role === "super_admin";
  const allowed = isSuper ? null : await sectionsForRole(session.role);
  if (!isSuper && !allowed?.includes(section)) {
    throw new DeskError(
      section === "desk_money"
        ? "Only the treasurer can mark money as reaching Pragati's account."
        : "You don't have access to the walk-in desk. Ask an admin to add you."
    );
  }
  return {
    ...session,
    isSuper,
    isAdmin: isSuper || session.role === "admin",
    // "Treasurer" is a GRANT, not a fourth role: an admin holding the
    // desk_money section. Adding a role type would touch auth everywhere.
    isTreasurer: isSuper || (await sectionsForRole(session.role)).includes("desk_money"),
  };
}

/** Anyone who may work the desk: volunteer, admin, super admin. */
export async function requireDesk(): Promise<DeskActor> {
  return actorFrom(await getSession(), "desk");
}

/** Treasury actions: clearing custody, recording deposits, closing a shift. */
export async function requireDeskMoney(): Promise<DeskActor> {
  return actorFrom(await getSession(), "desk_money");
}

/** Actions only an admin may take: comps, voiding a closed order, overrides. */
export async function requireDeskAdmin(what: string): Promise<DeskActor> {
  const actor = await requireDesk();
  if (!actor.isAdmin) throw new DeskError(`${what} needs an admin. Ask one to sign in on this tablet.`);
  return actor;
}

/**
 * A desk order is one an admin must not settle from the Registrations page and
 * the webhook must not push through markRegistrationPaid. One predicate, used
 * by every guard so they can never disagree.
 */
export function isDeskOrder(reg: { source?: string | null; deskState?: string | null } | null | undefined): boolean {
  if (!reg) return false;
  return reg.source === "desk" || !!reg.deskState;
}

/** How long a volunteer may undo their own tender. After this, an admin. */
export const SELF_VOID_WINDOW_MS = 15 * 60_000;

export function canVoidTender(
  actor: DeskActor,
  tender: { collectedBy?: string | null; createdAt?: Date | null; shiftId?: string | null },
  currentShiftId: string | null
): { ok: true } | { ok: false; why: string } {
  if (actor.isAdmin) return { ok: true };
  if (tender.collectedBy !== actor.userId)
    return { ok: false, why: "Only the person who took this payment can undo it. Otherwise ask an admin." };
  if (tender.shiftId && currentShiftId && tender.shiftId !== currentShiftId)
    return { ok: false, why: "That payment is from a cash box that's already been counted. An admin has to undo it." };
  const age = tender.createdAt ? Date.now() - new Date(tender.createdAt).getTime() : Infinity;
  if (age > SELF_VOID_WINDOW_MS)
    return { ok: false, why: "That payment is more than 15 minutes old. An admin has to undo it." };
  return { ok: true };
}

/**
 * Letting someone in who still owes money is a decision, not an accident: it is
 * always attributed. A volunteer may do it up to a configured amount; above
 * that it is an admin's call.
 */
export async function assertMayAdmitWithBalance(actor: DeskActor, balanceCents: number): Promise<void> {
  if (actor.isAdmin) return;
  const cap = Number(await getConfig<number>("desk_volunteer_balance_cap_cents")) || 0;
  if (balanceCents > cap) {
    const dollars = (cap / 100).toFixed(0);
    throw new DeskError(
      `Letting someone in who still owes more than $${dollars} needs an admin. Ask one to approve it here.`
    );
  }
}
