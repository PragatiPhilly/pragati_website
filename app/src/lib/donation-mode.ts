/**
 * Donation framing (the "generic" ↔ "pujo" switch).
 *
 *   generic — year-round giving to Pragati; supports "in honor of / in memory of".
 *   pujo    — festival framing: "Pujo Sponsorship". Instead of honor/memory the
 *             donor picks what their gift supports (bhog, dakshina, alpona…).
 *
 * Controlled by the `donation_mode` config (Admin → Settings). Flip back to
 * "generic" after the festival and the honor/memory flow + copy return.
 */
import { getConfig } from "@/lib/system-config";

export type DonationMode = "generic" | "pujo";

export async function getDonationMode(): Promise<DonationMode> {
  return (await getConfig<string>("donation_mode")) === "pujo" ? "pujo" : "generic";
}

export const DONATION_COPY: Record<
  DonationMode,
  {
    navLabel: string;
    pageBengali: string;
    pageTitle: string;
    pageIntro: string;
    regTitle: string;
    regIntro: string;
  }
> = {
  generic: {
    navLabel: "Donate",
    pageBengali: "আপনার আশীর্বাদে",
    pageTitle: "Donate to Pragati",
    pageIntro:
      "Pragati is a 501(c)(3) nonprofit — donations are tax-deductible and go straight to pujo, prasad, and programs.",
    regTitle: "Add a little extra? 🙏",
    regIntro:
      "Pragati is a volunteer-run 501(c)(3) nonprofit. A small donation on top of your tickets helps keep the pujo, the bhog, and the culture thriving — and it's tax-deductible. Totally optional.",
  },
  pujo: {
    navLabel: "Pujo Sponsorship",
    pageBengali: "পূজার সহযোগিতায়",
    pageTitle: "Pujo Sponsorship",
    pageIntro:
      "Sponsor this year's Durga Pujo. Your gift — toward the bhog, dakshina for our purohit, flowers and alpona, or wherever it's needed most — is tax-deductible and keeps every ritual and every plate of prasad flowing.",
    regTitle: "Sponsor the Pujo? 🙏",
    regIntro:
      "Add a Pujo sponsorship on top of your tickets — toward the bhog, the dakshina for our purohit, the flowers and alpona, and the rituals that make the pujo. Tax-deductible and completely optional.",
  },
};

/** What a Pujo-mode gift can be earmarked for (donation page only). */
export const PUJO_DESIGNATIONS: { value: string; label: string }[] = [
  { value: "where_needed", label: "🪔 Where it's needed most" },
  { value: "bhog", label: "🍲 Bhog & prasad" },
  { value: "dakshina", label: "🙏 Dakshina for the purohit" },
  { value: "alpona", label: "🎨 Alpona & decorations" },
  { value: "pushpanjali", label: "🌸 Pushpanjali flowers" },
];

export function pujoDesignationLabel(value?: string | null): string | undefined {
  if (!value) return undefined;
  return PUJO_DESIGNATIONS.find((d) => d.value === value)?.label ?? value;
}
