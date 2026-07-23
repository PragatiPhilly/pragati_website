"use server";

import { createCheckout, type CheckoutAttendee } from "@/lib/checkout";
import { getSession } from "@/lib/auth/session";

export type SubmitRegistrationInput = {
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  paymentMethod: "square" | "zelle" | "offline";
  promoCode?: string;
  source: "web" | "day_of_kiosk";
  wantsMembership?: boolean;
  attendees: CheckoutAttendee[];
};

export type SubmitRegistrationResult =
  | { ok: true; kind: "square_redirect"; url: string; conf: string }
  | { ok: true; kind: "zelle"; conf: string }
  | { ok: true; kind: "offline"; conf: string; totalCents: number }
  | { ok: false; error: string };

export type PromoCheck =
  | { valid: true; discountCents: number; description: string }
  | { valid: false; message: string };

export async function validatePromoAction(eventId: string, code: string, subtotalCents: number): Promise<PromoCheck> {
  const { getDb, schema } = await import("@/db/client");
  const { and, eq } = await import("drizzle-orm");
  const db = getDb();
  const [p] = await db
    .select()
    .from(schema.promoCodes)
    .where(and(eq(schema.promoCodes.code, code.trim().toUpperCase()), eq(schema.promoCodes.eventId, eventId)));
  if (!p) return { valid: false, message: "That code doesn't exist for this event." };
  const now = new Date();
  if (p.validFrom && p.validFrom > now) return { valid: false, message: "That code isn't active yet." };
  if (p.validUntil && p.validUntil < now) return { valid: false, message: "That code has expired." };
  if (p.maxUsesTotal !== null && p.currentUses >= p.maxUsesTotal) return { valid: false, message: "That code has been fully used." };
  const discountCents =
    p.discountType === "percent"
      ? Math.round((subtotalCents * p.discountValue) / 100)
      : Math.min(p.discountValue, subtotalCents);
  return {
    valid: true,
    discountCents,
    description: p.discountType === "percent" ? `${p.discountValue}% off` : `$${(p.discountValue / 100).toFixed(2)} off`,
  };
}

export async function submitRegistration(input: SubmitRegistrationInput): Promise<SubmitRegistrationResult> {
  try {
    if (!input.buyerName.trim()) return { ok: false, error: "Please tell us your name." };
    if (!input.buyerEmail.includes("@")) return { ok: false, error: "We need a valid email for your tickets." };
    if (input.attendees.length === 0) return { ok: false, error: "Add at least one person." };
    for (const a of input.attendees) {
      if (a.days.length === 0) return { ok: false, error: `Pick at least one day for ${a.firstName}.` };
    }

    // Emergency kill-switches (Admin → Settings) — enforced server-side so a
    // stale open browser tab can't slip through after admins flip them.
    const { getConfig } = await import("@/lib/system-config");
    if ((await getConfig<string>("registration_paused")) === "yes") {
      return { ok: false, error: await getConfig<string>("registration_pause_message") };
    }
    if (input.paymentMethod === "square" && (await getConfig<string>("payments_square_enabled")) === "no") {
      return { ok: false, error: "Card payments are temporarily unavailable — please choose Zelle." };
    }
    if (input.paymentMethod === "zelle" && (await getConfig<string>("payments_zelle_enabled")) === "no") {
      return { ok: false, error: "Zelle is temporarily unavailable — please pay by card." };
    }

    const session = await getSession();
    const result = await createCheckout({
      eventId: input.eventId,
      buyerName: input.buyerName.trim(),
      buyerEmail: input.buyerEmail.trim().toLowerCase(),
      buyerPhone: input.buyerPhone?.trim(),
      memberId: session?.memberId,
      isMemberPurchase: !!session?.memberId,
      wantsMembership: input.wantsMembership,
      source: input.source,
      paymentMethod: input.paymentMethod,
      promoCode: input.promoCode,
      attendees: input.attendees,
    });

    if (result.kind === "square_redirect")
      return { ok: true, kind: "square_redirect", url: result.url, conf: result.confirmationNumber };
    if (result.kind === "zelle_instructions") return { ok: true, kind: "zelle", conf: result.confirmationNumber };
    return { ok: true, kind: "offline", conf: result.confirmationNumber, totalCents: result.totalCents };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
