/**
 * The card processing fee passed on to the buyer — a SETTING, not a constant.
 *
 * Admin → Settings → "Payments — methods":
 *   card_fee_enabled  "yes" | "no"   (default "no" — the EC took it off for Kali
 *                                     Pujo 2026 while Zelle is not accepted)
 *   card_fee_percent  number         (default 3)
 *
 * Every place that charges or shows the fee reads this one rate: online
 * registration, donations, online membership, and the walk-in desk (tickets and
 * dues). Turning it back on needs no code change. Server-only (reads config);
 * client components receive the rate as a prop.
 */
import { getConfig } from "@/lib/system-config";

export async function cardFeeRate(): Promise<number> {
  if ((await getConfig<string>("card_fee_enabled")) !== "yes") return 0;
  const pct = Number(await getConfig<number>("card_fee_percent"));
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(pct, 10) / 100; // a typo like "30" must never charge 30%
}
