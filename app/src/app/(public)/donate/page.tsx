import { getConfig } from "@/lib/system-config";
import DonateForm from "./DonateForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donate" };

export default async function DonatePage() {
  const squareEnabled = (await getConfig<string>("payments_square_enabled")) !== "no";
  const zelleEnabled = (await getConfig<string>("payments_zelle_enabled")) === "yes";
  return <DonateForm squareEnabled={squareEnabled} zelleEnabled={zelleEnabled} />;
}
