import Reveal from "@/components/site/Reveal";
import { site } from "@/config/site";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Reveal>
        <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black mb-8">About Pragati</h1>
      </Reveal>
      <Reveal delay={0.08}>
        <div className="prose-lg leading-relaxed flex flex-col gap-5" style={{ color: "var(--ink-soft)" }}>
          <p>
            {site.fullName} is a volunteer-run 501(c)(3) nonprofit that has brought the warmth of Bengali
            culture to the Philadelphia region for a generation — Durga Pujo, Kali Pujo, Saraswati Pujo,
            summer picnics, and an annual magazine written by our own community.
          </p>
          <p>
            Pragati means <em>progress</em>. We carry traditions forward: kids reciting Tagore beside grandparents,
            first-time visitors welcomed with a plate of khichuri bhog, and a dhaak that can be heard across the venue.
          </p>
          <p>
            Everything is organized by members, funded by memberships, tickets, sponsors, and donations. Come for
            the pujo, stay for the adda.
          </p>
        </div>
      </Reveal>
      <Reveal delay={0.16}>
        <div className="festive-card mt-10 p-6">
          <p className="font-semibold mb-1">Get in touch</p>
          <p style={{ color: "var(--ink-soft)" }} className="text-sm">
            <a className="underline underline-offset-4" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> · {site.address}
          </p>
        </div>
      </Reveal>
    </div>
  );
}
