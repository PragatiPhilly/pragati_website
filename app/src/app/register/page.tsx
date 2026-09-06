import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveEvent, getEventBySlug } from "@/lib/queries/events";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/system-config";
import RegisterFlow, { type FlowEvent, type FlowMemberContext } from "./RegisterFlow";
import Header from "@/components/site/Header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; mode?: string; concert?: string }>;
}) {
  const { event: slugParam, mode, concert } = await searchParams;

  // ── the day-of kiosk is no longer a public URL ──────────────────────────
  // It used to be this page with four steps hidden, reachable by anyone with
  // the link, taking counter-payable orders that nothing could attribute to a
  // volunteer. Walk-ins are now taken at the staffed desk behind a login.
  // Staff who follow an old link are sent there; everybody else just gets the
  // ordinary registration page, so no bookmarked link 404s on event day.
  if (mode === "dayof") {
    const staff = await getSession();
    if (staff && ["admin", "super_admin", "volunteer"].includes(staff.role)) redirect("/admin/desk");
  }

  const base = slugParam ? { slug: slugParam } : await getActiveEvent();
  if (!base) notFound();
  const full = await getEventBySlug(base.slug);
  if (!full || full.status !== "published") notFound();

  const session = await getSession();
  let memberCtx: FlowMemberContext | null = null;
  if (session?.memberId) {
    const db = getDb();
    const [member] = await db.select().from(schema.members).where(eq(schema.members.id, session.memberId));
    if (member) {
      const family = await db
        .select()
        .from(schema.familyMembers)
        .where(eq(schema.familyMembers.memberId, member.id));
      memberCtx = {
        isActiveMember: member.membershipStatus === "active",
        primaryName: `${member.primaryFirstName} ${member.primaryLastName}`,
        email: session.email,
        phone: member.phone ?? "",
        family: family.map((f) => ({
          firstName: f.firstName,
          lastName: f.lastName ?? "",
          relationship: f.relationship,
          dateOfBirth: f.dateOfBirth,
          foodPref: (f.foodPref ?? "non_veg") as "veg" | "non_veg" | "kid",
          isMember: f.isMember,
        })),
      };
    }
  }

  const discountMode = (await getConfig<string>("member_discount_mode")) as "per_adult" | "whole_family";
  const idleResetSeconds = await getConfig<number>("dayof_idle_reset_seconds");

  // Emergency kill-switches (Admin → Settings, no redeploy needed)
  const paused = (await getConfig<string>("registration_paused")) === "yes";
  const squareEnabled = (await getConfig<string>("payments_square_enabled")) !== "no";
  const zelleEnabled = (await getConfig<string>("payments_zelle_enabled")) === "yes";
  const membershipPriceCents = Number(await getConfig<number>("membership_annual_price_cents")) || 3500;
  const memberMode = ((await getConfig<string>("member_mode")) === "verify" ? "verify" : "honor") as "honor" | "verify";
  const { getDonationMode, DONATION_COPY } = await import("@/lib/donation-mode");
  const donateCopy = DONATION_COPY[await getDonationMode()];
  if (paused) {
    const pauseMessage = await getConfig<string>("registration_pause_message");
    return (
      <>
        <Header />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <p className="text-5xl mb-4">🪔</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-3">
            Registration is taking a short break
          </h1>
          <p className="leading-relaxed" style={{ color: "var(--ink-soft)" }}>{pauseMessage}</p>
        </div>
      </>
    );
  }

  const flowEvent: FlowEvent = {
    id: full.id,
    name: full.name,
    nameBengali: full.nameBengali,
    slug: full.slug,
    days: (full.days as { key: string; label: string; date: string }[] | null) ?? [],
    ticketTypes: full.ticketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      ageBand: t.ageBand,
      dayKeys: (t.dayKeys as string[] | null) ?? null,
      withFood: t.withFood,
      checkInStart: t.checkInStart ?? null,
      priceMemberCents: t.priceMemberCents,
      priceNonmemberCents: t.priceNonmemberCents,
    })),
  };

  return (
    <>
      <Header />
      <RegisterFlow
        event={flowEvent}
        member={memberCtx}
        // Always false now — the staffed desk replaced the public kiosk. The
        // prop stays because RegisterFlow's kiosk affordances are still the
        // right shape if a self-serve tablet is ever wanted again.
        dayOfMode={false}
        discountMode={discountMode}
        idleResetSeconds={idleResetSeconds}
        squareEnabled={squareEnabled}
        zelleEnabled={zelleEnabled}
        membershipPriceCents={membershipPriceCents}
        concertDay={concert ?? null}
        memberMode={memberMode}
        donateTitle={donateCopy.regTitle}
        donateIntro={donateCopy.regIntro}
        donateLineLabel={donateCopy.lineLabel}
        donateLineLabelLong={donateCopy.lineLabelLong}
      />
    </>
  );
}
