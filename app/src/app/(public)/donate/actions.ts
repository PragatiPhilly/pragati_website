"use server";

import { redirect } from "next/navigation";
import { createDonation } from "@/lib/donations";
import { getSession } from "@/lib/auth/session";

export type DonateState = { error?: string } | undefined;

export async function donateAction(_prev: DonateState, formData: FormData): Promise<DonateState> {
  const amountRaw = String(formData.get("amount") ?? "");
  const custom = String(formData.get("customAmount") ?? "");
  const dollars = amountRaw === "custom" ? parseFloat(custom) : parseFloat(amountRaw);
  if (!dollars || dollars < 1) return { error: "Please choose a donation amount." };

  const donorName = String(formData.get("donorName") ?? "").trim();
  const donorEmail = String(formData.get("donorEmail") ?? "").trim().toLowerCase();
  if (!donorName || !donorEmail.includes("@")) return { error: "Please add your name and a valid email." };

  const inHonorOrMemory = String(formData.get("inHonorOrMemory") ?? "none") as "none" | "in_honor_of" | "in_memory_of";
  const honoreeName = String(formData.get("honoreeName") ?? "").trim();
  if (inHonorOrMemory !== "none" && !honoreeName) return { error: "Please tell us the honoree's name." };

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
    donorPhone: String(formData.get("donorPhone") ?? "").trim() || undefined,
    amountCents: Math.round(dollars * 100),
    inHonorOrMemory,
    honoreeName: honoreeName || undefined,
    honoreeNotifyEmail: String(formData.get("honoreeNotifyEmail") ?? "").trim() || undefined,
    message: String(formData.get("message") ?? "").trim() || undefined,
    isAnonymous: formData.get("isAnonymous") === "on",
    paymentMethod: method,
    memberId: session?.memberId,
  });

  if (result.kind === "square_redirect") redirect(result.url);
  redirect(`/checkout/zelle/${result.confirmationNumber}?kind=donation`);
}
