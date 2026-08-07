"use server";

import { redirect } from "next/navigation";
import { createDonation } from "@/lib/donations";
import { getSession } from "@/lib/auth/session";
import { isEmail, isPhone } from "@/lib/validation";

export type DonateState = { error?: string } | undefined;

export async function donateAction(_prev: DonateState, formData: FormData): Promise<DonateState> {
  const amountRaw = String(formData.get("amount") ?? "");
  const custom = String(formData.get("customAmount") ?? "");
  const dollars = amountRaw === "custom" ? parseFloat(custom) : parseFloat(amountRaw);
  if (!Number.isFinite(dollars) || dollars < 1) return { error: "Please choose a donation amount of at least $1." };
  if (dollars > 100000) return { error: "For gifts over $100,000, please contact us directly — thank you!" };

  const donorName = String(formData.get("donorName") ?? "").trim();
  const donorEmail = String(formData.get("donorEmail") ?? "").trim().toLowerCase();
  if (!donorName) return { error: "Please add your name." };
  if (!isEmail(donorEmail)) return { error: "Please enter a valid email (name@example.com)." };

  // Phone is mandatory — we need a way to reach a donor about their receipt.
  const donorPhone = String(formData.get("donorPhone") ?? "").trim();
  if (!isPhone(donorPhone, true))
    return { error: "Please add a mobile number so we can reach you about this gift." };

  const honoreeNotifyEmail = String(formData.get("honoreeNotifyEmail") ?? "").trim();
  if (honoreeNotifyEmail && !isEmail(honoreeNotifyEmail)) return { error: "The honoree notification email isn't valid." };

  const inHonorOrMemory = String(formData.get("inHonorOrMemory") ?? "none") as "none" | "in_honor_of" | "in_memory_of";
  const honoreeName = String(formData.get("honoreeName") ?? "").trim();
  if (inHonorOrMemory !== "none" && !honoreeName) return { error: "Please tell us the honoree's name." };

  // Pujo mode: the gift can be earmarked (bhog, dakshina…) instead of honor/memory.
  const designation = String(formData.get("designation") ?? "").trim() || undefined;

  // Emergency kill-switches (Admin → Settings) — enforced server-side
  const method = String(formData.get("paymentMethod") ?? "square") as "square" | "zelle";
  const { getConfig } = await import("@/lib/system-config");
  if (method === "square" && (await getConfig<string>("payments_square_enabled")) === "no") {
    return { error: "Card payments are temporarily unavailable — please choose Zelle." };
  }
  if (method === "zelle" && (await getConfig<string>("payments_zelle_enabled")) === "no") {
    return { error: "Zelle is temporarily unavailable — please pay by card." };
  }

  const session = await getSession();
  const result = await createDonation({
    donorName,
    donorEmail,
    donorPhone: donorPhone || undefined,
    amountCents: Math.round(dollars * 100),
    inHonorOrMemory,
    designation,
    honoreeName: honoreeName || undefined,
    honoreeNotifyEmail: honoreeNotifyEmail || undefined,
    message: String(formData.get("message") ?? "").trim() || undefined,
    isAnonymous: formData.get("isAnonymous") === "on",
    paymentMethod: method,
    memberId: session?.memberId,
  });

  if (result.kind === "square_redirect") redirect(result.url);
  redirect(`/checkout/zelle/${result.confirmationNumber}?kind=donation`);
}
