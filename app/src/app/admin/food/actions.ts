"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { setConfig } from "@/lib/system-config";

/**
 * Food line settings (spec/18) — changeable on the day, no code change.
 *   adult_meal_min_age        a youth this age or older may pick an adult plate
 *   food_require_gate_checkin "yes" = only people checked in at the gate today get a plate
 */
export async function saveFoodSettingsAction(input: { adultMealMinAge: number; requireGate: boolean }): Promise<{ ok: boolean; error?: string }> {
  const s = await requireAdmin();
  const age = Math.floor(Number(input.adultMealMinAge));
  if (!(age >= 5 && age <= 18)) return { ok: false, error: "The adult-meal age must be between 5 and 18." };
  await setConfig("adult_meal_min_age", age, s.userId);
  await setConfig("food_require_gate_checkin", input.requireGate ? "yes" : "no", s.userId);
  await getDb().insert(schema.auditLog).values({
    userId: s.userId,
    action: "update",
    entityType: "system_config",
    entityId: "food_line",
    changes: { adult_meal_min_age: age, food_require_gate_checkin: input.requireGate ? "yes" : "no" },
  });
  revalidatePath("/admin/food");
  revalidatePath("/register");
  return { ok: true };
}
