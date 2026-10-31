"use server";

/**
 * Food line actions (spec/18) — thin wrappers over lib/foodline/party.ts.
 * Staff = admins + volunteers, the same people who can scan at the gate.
 * Every failure comes back as a plain sentence for the screen, never a crash:
 * a volunteer with a queue in front of them needs to know what to DO.
 */
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import type { Plate } from "@/lib/food";
import {
  addExtras,
  changePlate,
  foodLookup,
  FoodError,
  giveFood,
  giveOne,
  loadFoodParty,
  removeExtra,
  undoGive,
  windowStats,
  type FoodLookup,
  type FoodParty,
  type GiveResult,
  type WindowStats,
} from "@/lib/foodline/party";

async function staff() {
  const s = await getSession();
  if (!s || !["admin", "super_admin", "volunteer"].includes(s.role)) throw new Error("UNAUTHORIZED");
  return { userId: s.userId, role: s.role, name: s.name ?? s.email.split("@")[0] };
}

type Out<T> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof FoodError) return { ok: false, error: e.message };
    if (e instanceof Error && e.message === "UNAUTHORIZED") return { ok: false, error: "You're signed out — sign in again." };
    console.error("[foodline]", e);
    return { ok: false, error: "Something went wrong — try again. If it keeps happening, use the lookup list." };
  }
}

export async function foodLookupAction(sessionId: string, query: string): Promise<Out<FoodLookup>> {
  return wrap(async () => {
    await staff();
    return foodLookup(sessionId, query);
  });
}

export async function foodPartyAction(sessionId: string, registrationId: string): Promise<Out<FoodParty | null>> {
  return wrap(async () => {
    await staff();
    return loadFoodParty(sessionId, registrationId);
  });
}

export async function giveFoodAction(sessionId: string, registrationId: string, want: Partial<Record<Plate, number>>): Promise<Out<GiveResult>> {
  return wrap(async () => giveFood(sessionId, registrationId, want, await staff()));
}

export async function giveOneAction(sessionId: string, ticketId: string): Promise<Out<FoodParty>> {
  return wrap(async () => giveOne(sessionId, ticketId, await staff()));
}

export async function undoGiveAction(sessionId: string, ticketId: string): Promise<Out<FoodParty | null>> {
  const r = await wrap(async () => undoGive(sessionId, ticketId, await staff()));
  revalidatePath("/admin/food");
  return r;
}

export async function changePlateAction(sessionId: string, ticketId: string, plate: Plate): Promise<Out<FoodParty | null>> {
  return wrap(async () => changePlate(sessionId, ticketId, plate, await staff()));
}

export async function addExtrasAction(sessionId: string, plate: Plate, qty: number, reason: string, note: string): Promise<Out<true>> {
  const r = await wrap(async () => {
    await addExtras(sessionId, plate, qty, reason, note, await staff());
    return true as const;
  });
  revalidatePath("/admin/food");
  return r;
}

export async function removeExtraAction(id: string): Promise<Out<true>> {
  const r = await wrap(async () => {
    await removeExtra(id, await staff());
    return true as const;
  });
  revalidatePath("/admin/food");
  return r;
}

export async function windowStatsAction(sessionId: string): Promise<Out<WindowStats | null>> {
  return wrap(async () => {
    await staff();
    return windowStats(sessionId);
  });
}
