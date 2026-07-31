import Link from "next/link";
import { site } from "@/config/site";
import { getDonationMode, DONATION_COPY } from "@/lib/donation-mode";

export default async function Footer() {
  const donationLabel = DONATION_COPY[await getDonationMode()].navLabel;
  const nav = site.nav.map((n) => (n.href === "/donate" ? { ...n, label: donationLabel } : n));
  return (
    <footer className="mt-24 border-t" style={{ borderColor: "var(--line)" }}>
      {/* village pond with floating diyas */}
      <div className="pond" aria-hidden>
        <span className="floating-diya-pond" style={{ top: "58%", animationDelay: "0s" }} />
        <span className="floating-diya-pond" style={{ top: "74%", animationDelay: "7s" }} />
        <span className="floating-diya-pond" style={{ top: "48%", animationDelay: "14s" }} />
      </div>
      <div className="garland" />
      <div className="mx-auto max-w-6xl px-5 py-12 grid gap-8 md:grid-cols-3 text-sm">
        <div>
          <p className="font-[family-name:var(--font-bangla)] text-3xl mb-2" style={{ color: "var(--sindoor)" }}>
            প্রগতি
          </p>
          <p style={{ color: "var(--ink-soft)" }}>{site.fullName}</p>
          <p style={{ color: "var(--ink-soft)" }}>{site.address}</p>
        </div>
        <div className="flex flex-col gap-2">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:opacity-70 transition-opacity w-fit">
              {n.label}
            </Link>
          ))}
          <Link href="/register" className="hover:opacity-70 transition-opacity w-fit">
            Register for the next event
          </Link>
          {/* Discreet: members with accounts, gate volunteers, and admins. */}
          <Link href="/login" className="hover:opacity-70 transition-opacity w-fit mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
            Sign in
          </Link>
        </div>
        <div style={{ color: "var(--ink-soft)" }}>
          <p className="mb-2">
            Questions? <a className="underline underline-offset-4" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          </p>
          <p className="text-xs leading-relaxed">
            Data handling: we store only what's needed to run events and memberships — never sold, never shared.
            Pragati is a 501(c)(3) nonprofit. Donations are tax-deductible.
          </p>
        </div>
      </div>
    </footer>
  );
}
