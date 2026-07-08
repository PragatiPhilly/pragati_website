/**
 * Zelle rail — no API exists; this module produces the instruction payload
 * shown to buyers. Recipient email/display name come from system_config
 * (currently the test address; change in Admin → Settings, no deploy).
 */
import { getConfig } from "@/lib/system-config";

export type ZelleInstructions = {
  recipientEmail: string;
  recipientDisplayName: string;
  amountCents: number;
  memo: string; // MUST be the confirmation number
  slaHours: number;
};

export async function getZelleInstructions(
  confirmationNumber: string,
  amountCents: number
): Promise<ZelleInstructions> {
  return {
    recipientEmail: await getConfig<string>("zelle_recipient_email"),
    recipientDisplayName: await getConfig<string>("zelle_recipient_display_name"),
    amountCents,
    memo: confirmationNumber,
    slaHours: await getConfig<number>("zelle_verification_sla_hours"),
  };
}
