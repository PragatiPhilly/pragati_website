/**
 * Membership ↔ registration coupling mode (the "backdoor").
 *
 *   honor  — this event. We trust "I'm a member" claims at registration; no
 *            sign-in, no account, no member portal. Members are collected on the
 *            honor system (see recordSelfDeclaredMember).
 *   verify — future. Real accounts + DB matching; the member portal (/m), member
 *            sign-in, and family self-service all light back up.
 *
 * When the portal is disabled we hide every member sign-in / portal surface so
 * people aren't sent to a login page they can't use. Admin sign-in is separate
 * (the /login page) and always available.
 */
import { getConfig } from "@/lib/system-config";

export async function getMemberMode(): Promise<"honor" | "verify"> {
  return (await getConfig<string>("member_mode")) === "verify" ? "verify" : "honor";
}

/** True when member accounts + the /m portal are active (verify mode). */
export async function memberPortalEnabled(): Promise<boolean> {
  return (await getMemberMode()) === "verify";
}
