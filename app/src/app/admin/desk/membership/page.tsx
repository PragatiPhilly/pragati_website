import Link from "next/link";
import "../desk.css";
import { requireSectionAccess } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";
import { membershipPrice } from "@/lib/desk/membership";
import MembershipDesk from "./MembershipDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership — walk-in desk" };

/**
 * Join, renew or extend a membership at the door. Anyone can: an existing
 * member, a family who registered online, or someone brand new.
 */
export default async function DeskMembershipPage() {
  await requireSectionAccess("desk");
  const { priceCents, cardFeeCents } = await membershipPrice();
  const zelleTo = (await getConfig<string>("zelle_recipient_email")) || "";
  const zelleName = (await getConfig<string>("zelle_recipient_display_name")) || "Pragati";
  return (
    <div className="desk-shell max-w-3xl">
      <div>
        <Link href="/admin/desk" className="desk-note">
          ← Walk-in desk
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1 mt-1">Membership</h1>
        <p className="desk-note">
          Join, renew or extend for one year · {`$${(priceCents / 100).toFixed(2)}`} · card (they type it on Square’s
          page) or Zelle
        </p>
      </div>
      <MembershipDesk priceCents={priceCents} cardFeeCents={cardFeeCents} zelleTo={zelleTo} zelleName={zelleName} />
    </div>
  );
}
