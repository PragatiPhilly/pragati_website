/**
 * Static site configuration.
 * Runtime-editable settings live in the `system_config` DB table
 * (see src/config/defaults.ts) and are managed from Admin → Settings.
 */
export const site = {
  name: "Pragati",
  fullName: "Pragati — Bengali Association of Greater Philadelphia",
  tagline: "A home for Bengali culture in Greater Philadelphia",
  taglineBengali: "প্রগতি",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  contactEmail: "pragati.management@gmail.com",
  address: "127 Lotus Lane, Malvern, PA 19355",
  phone: "610.570.2756",
  foundedYear: 1972,
  nav: [
    { label: "Events", bn: "উৎসব", href: "/events" },
    { label: "About", bn: "আমরা", href: "/about" },
    { label: "Donate", bn: "দান", href: "/donate" },
    { label: "Find my tickets", bn: "টিকিট", href: "/lookup" },
    { label: "Contact", bn: "যোগাযোগ", href: "/contact" },
  ],
  themes: ["durga", "kali", "saraswati"] as const,
  defaultTheme: "durga" as const,
} as const;

export type ThemeName = (typeof site.themes)[number];
