"use server";

/**
 * Desk membership actions — join, renew or extend for one year.
 * Same shape as the other desk actions: the role check is in requireDesk(),
 * guards throw, we hand the message back.
 */
import { revalidatePath } from "next/cache";
import { DeskError, requireDesk, type DeskActor } from "@/lib/desk/guards";
import {
  cancelDeskDuesCard,
  checkDeskDuesCard,
  findOrCreateDeskMember,
  memberCard,
  searchForMembership,
  takeMembershipDues,
  type DeskGuestHit,
  type DeskMemberHit,
  type DuesResult,
} from "@/lib/desk/membership";

export type MResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function run<T>(fn: (actor: DeskActor) => Promise<{ data?: T; message?: string }>): Promise<MResult<T>> {
  try {
    const actor = await requireDesk();
    const out = await fn(actor);
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof DeskError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    console.error("[desk-membership]", msg);
    return { ok: false, error: msg };
  }
}

export async function membershipSearchAction(q: string): Promise<MResult<{ members: DeskMemberHit[]; guests: DeskGuestHit[] }>> {
  return run(async () => ({ data: await searchForMembership(q) }));
}

export async function newMemberAction(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<MResult<{ member: DeskMemberHit; existed: boolean }>> {
  return run(async (actor) => {
    const { memberId, existed } = await findOrCreateDeskMember(input, actor);
    const member = await memberCard(memberId);
    if (!member) throw new DeskError("Couldn't load that member — search again.");
    return { data: { member, existed } };
  });
}

export async function takeDuesAction(input: {
  memberId: string;
  method: "square" | "zelle";
  idem: string;
  withCardFee?: boolean;
  zelle?: { confirmationSeen: boolean; senderName?: string; senderLast4?: string };
}): Promise<MResult<DuesResult>> {
  return run(async (actor) => {
    const data = await takeMembershipDues(input, actor);
    revalidatePath("/admin/members");
    return { data };
  });
}

export async function checkDuesCardAction(paymentId: string): Promise<MResult<{ settled: boolean; message: string; result?: DuesResult }>> {
  return run(async () => {
    const data = await checkDeskDuesCard(paymentId);
    if (data.settled) revalidatePath("/admin/members");
    return { data };
  });
}

export async function cancelDuesCardAction(paymentId: string): Promise<MResult> {
  return run(async (actor) => {
    await cancelDeskDuesCard(paymentId, actor);
    return { message: "Card page cancelled." };
  });
}
