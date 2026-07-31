import { getConfig } from "@/lib/system-config";
import { getDonationMode, DONATION_COPY, PUJO_DESIGNATIONS } from "@/lib/donation-mode";
import DonateForm from "./DonateForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donate" };

export default async function DonatePage() {
  const squareEnabled = (await getConfig<string>("payments_square_enabled")) !== "no";
  const zelleEnabled = (await getConfig<string>("payments_zelle_enabled")) === "yes";
  const mode = await getDonationMode();
  return (
    <DonateForm
      squareEnabled={squareEnabled}
      zelleEnabled={zelleEnabled}
      mode={mode}
      copy={DONATION_COPY[mode]}
      designations={PUJO_DESIGNATIONS}
    />
  );
}
