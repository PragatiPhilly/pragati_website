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
import { getConfig } from '@/lib/system-config';

export type DonationMode = 'generic' | 'pujo';

export async function getDonationMode(): Promise<DonationMode> {
  return (await getConfig<string>('donation_mode')) === 'pujo'
    ? 'pujo'
    : 'generic';
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
    /** Short line-item label — order rail, email breakdown. */
    lineLabel: string;
    /** Long line-item label — registration review step. */
    lineLabelLong: string;
    /** Noun used in receipts/confirmations ("donation" / "Pujo sponsorship"). */
    receiptNoun: string;
    /** Homepage giving section. */
    homeTitle: string;
    homeIntro: string;
    homeCta: string;
    /** <title> for the giving page. */
    metaTitle: string;
  }
> = {
  generic: {
    navLabel: 'Donate',
    pageBengali: 'আপনার আশীর্বাদে',
    pageTitle: 'Donate to Pragati',
    pageIntro:
      'Pragati is a 501(c)(3) nonprofit — donations are tax-deductible and go straight to pujo, prasad, and programs.',
    regTitle: 'Add a little extra? 🙏',
    regIntro:
      "Pragati is a volunteer-run 501(c)(3) nonprofit. A small donation on top of your tickets helps keep the pujo, the bhog, and the culture thriving — and it's tax-deductible. Totally optional.",
    lineLabel: 'Donation',
    lineLabelLong: 'Donation to Pragati',
    receiptNoun: 'donation',
    homeTitle: 'Keep the dhaak beating.',
    homeIntro:
      "Pragati runs on the generosity of this community. Every donation goes straight to pujo, prasad and programs — and it's tax-deductible.",
    homeCta: 'Donate to Pragati',
    metaTitle: 'Donate',
  },
  pujo: {
    navLabel: 'Pujo Sponsorship',
    pageBengali: 'পূজার সহযোগিতায়',
    pageTitle: 'Pujo Sponsorship',
    pageIntro:
      "Sponsor this year's Durga Pujo. Your gift — toward the bhog, dakshina for onjoli, flowers and alpona, or wherever it's needed most — is tax-deductible and keeps every ritual and every plate of prasad flowing.",
    regTitle: 'Sponsor the Pujo? 🙏',
    regIntro:
      'Add a Pujo sponsorship on top of your tickets — toward the bhog, the dakshina for onjoli, the flowers and garland, and the extras that make the pujo. Completely optional.',
    lineLabel: 'Pujo Sponsorship',
    lineLabelLong: 'Pujo Sponsorship',
    receiptNoun: 'Pujo sponsorship',
    homeTitle: "Sponsor this year's Pujo.",
    homeIntro:
      "Every ritual, every plate of bhog, every garland — carried by this community. Sponsor the pujo and it's tax-deductible.",
    homeCta: 'Sponsor the Pujo',
    metaTitle: 'Pujo Sponsorship',
  },
};

/** What a Pujo-mode gift can be earmarked for (donation page only). */
export const PUJO_DESIGNATIONS: { value: string; label: string }[] = [
  { value: 'where_needed', label: "🪔 Where it's needed most" },
  { value: 'bhog', label: '🍲 Bhog & prasad' },
  { value: 'dakshina', label: '🙏 Dakshina for Onjoli' },
  { value: 'alpona', label: '🎨 Garland & decorations' },
  { value: 'pushpanjali', label: '🌸 Pushpanjali flowers' },
];

export function pujoDesignationLabel(
  value?: string | null,
): string | undefined {
  if (!value) return undefined;
  return PUJO_DESIGNATIONS.find((d) => d.value === value)?.label ?? value;
}
