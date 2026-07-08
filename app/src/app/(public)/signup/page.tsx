import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join Pragati" };

export default async function SignupPage() {
  const price = await getConfig<number>("membership_annual_price_cents");
  return <SignupForm priceLabel={formatCents(price)} />;
}
