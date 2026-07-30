import { getConfig } from "@/lib/system-config";
import { memberPortalEnabled } from "@/lib/member-mode";
import { formatCents } from "@/lib/pricing";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join Pragati" };

export default async function SignupPage() {
  const price = await getConfig<number>("membership_annual_price_cents");
  const portalEnabled = await memberPortalEnabled();
  return <SignupForm priceLabel={formatCents(price)} portalEnabled={portalEnabled} />;
}
