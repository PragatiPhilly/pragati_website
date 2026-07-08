import type { Metadata } from "next";
import Reveal from "@/components/site/Reveal";
import ContactForm from "./ContactForm";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach the Pragati team — questions, membership, events, sponsorship and more.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto">
          <p className="font-[family-name:var(--font-bangla)] text-2xl mb-2" style={{ color: "var(--sindoor)" }}>
            আমাদের সাথে যোগাযোগ করুন
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black">
            Get in touch
          </h1>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Questions about membership, events, sponsorship, volunteering, or anything else? Send the
            Pragati team a note and we&apos;ll get back to you.
          </p>
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-[1.4fr_0.9fr] gap-8 mt-10 items-start">
        <Reveal delay={0.08}>
          <ContactForm />
        </Reveal>

        <Reveal delay={0.16}>
          <div className="grid gap-4">
            <div className="festive-card p-6" style={{ boxShadow: "var(--shadow)" }}>
              <h3 className="font-[family-name:var(--font-display)] font-bold mb-3">Reach us directly</h3>
              <div className="grid gap-3 text-sm">
                <a href={`mailto:${site.contactEmail}`} className="flex items-center gap-3 hover:opacity-75">
                  <span>✉️</span>
                  <span className="underline underline-offset-4">{site.contactEmail}</span>
                </a>
                <a href={`tel:${site.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-3 hover:opacity-75">
                  <span>📞</span>
                  <span>{site.phone}</span>
                </a>
                <div className="flex items-start gap-3">
                  <span>📍</span>
                  <span style={{ color: "var(--ink-soft)" }}>{site.address}</span>
                </div>
              </div>
            </div>
            <div
              className="rounded-2xl p-6 text-sm"
              style={{ background: "var(--accent-soft)", color: "var(--ink)" }}
            >
              <p className="font-[family-name:var(--font-bangla)] text-lg mb-1" style={{ color: "var(--sindoor)" }}>
                সবাইকে স্বাগত 🙏
              </p>
              <p style={{ color: "var(--ink-soft)" }}>
                Whether you&apos;re a lifelong member or new to Bengali Philadelphia, our door — and our
                courtyard — is always open to you.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
