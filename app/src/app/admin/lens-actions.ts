"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { LENS_COOKIE } from "@/lib/seasons";

/** Pick which event the admin tabs show (null = back to the current event). */
export async function setLensAction(eventId: string | null) {
  const s = await getSession();
  if (!s || !["admin", "super_admin", "volunteer"].includes(s.role)) throw new Error("UNAUTHORIZED");
  const jar = await cookies();
  if (eventId) jar.set(LENS_COOKIE, eventId, { path: "/admin", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  else jar.delete({ name: LENS_COOKIE, path: "/admin" });
  revalidatePath("/admin", "layout");
}
