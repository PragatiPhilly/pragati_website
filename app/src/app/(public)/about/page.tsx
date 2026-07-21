import Reveal from "@/components/site/Reveal";
import { site } from "@/config/site";

export const metadata = { title: "About" };

const MISSION = [
  "Preserve and promote the language, arts, traditions, and cultural heritage of Bengal.",
  "Organize high-quality cultural, religious, educational, and recreational events throughout the year.",
  "Build a welcoming and inclusive community where families and individuals of all ages feel connected.",
  "Encourage leadership, volunteerism, and active participation among youth and adults alike.",
  "Support charitable, educational, and community initiatives that positively impact society.",
  "Strengthen cultural understanding and friendship within the diverse communities of the Greater Philadelphia region.",
];

export default function AboutPage() {
  return (
    <div>
      {/* ── header photo ── */}
      <section className="relative w-full overflow-hidden" style={{ height: "clamp(220px, 40vw, 440px)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/about/pandal-patachitra.jpg"
          alt="Pragati Durga Pujo pandal"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(20,6,10,0.72), rgba(0,0,0,0.2) 55%, rgba(0,0,0,0.25))" }}
          aria-hidden
        />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-center px-5">
          <p className="font-[family-name:var(--font-bangla)] text-2xl md:text-3xl" style={{ color: "var(--marigold-pale)" }}>
            আমাদের কথা
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-6xl font-black" style={{ color: "var(--cream)" }}>
            About Pragati
          </h1>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 py-14">
        <Reveal>
          <div className="prose-lg leading-relaxed flex flex-col gap-5" style={{ color: "var(--ink-soft)" }}>
            <p>
              Founded in 1972, Pragati is one of the oldest and most respected Bengali cultural organizations on the
              East Coast of the United States. For more than five decades, Pragati has served as a home away from home
              for the Bengali community across Greater Philadelphia, bringing together families from Pennsylvania, New
              Jersey, and Delaware to celebrate the rich heritage, traditions, language, and spirit of Bengal.
            </p>
            <p>
              As a registered non-profit organization, Pragati is dedicated to preserving and promoting Bengali culture
              while fostering friendship, inclusion, and community engagement. Our organization welcomes people of all
              backgrounds who wish to experience the warmth of Bengali traditions and participate in our vibrant
              cultural celebrations.
            </p>
            <p>
              Throughout the year, Pragati organizes a diverse calendar of cultural, religious, educational, and social
              events, including Durga Puja, Kali Puja, Saraswati Puja, Bengali New Year (Poila Boishakh), family
              picnics, sports tournaments, literary events, music and dance performances, youth programs, and
              charitable initiatives. These events provide opportunities for generations to come together, celebrate
              their heritage, and create lasting memories.
            </p>
            <p>
              Our commitment extends beyond cultural celebrations. Pragati actively supports educational, healthcare,
              and community service initiatives while encouraging volunteerism, leadership development, and youth
              participation. We believe that preserving our heritage goes hand in hand with giving back to the
              community and creating meaningful connections across cultures.
            </p>
            <p>
              Over the past 50 years, Pragati has evolved into more than an organization—it is a family. Many members
              have grown up celebrating festivals together, forging lifelong friendships, and passing Bengali
              traditions on to future generations. Whether you are a long-time resident of the Delaware Valley, a
              newcomer to the area, or someone interested in Bengali culture, Pragati welcomes you with open arms.
            </p>
            <p>
              Together, we continue to celebrate our shared heritage while embracing the future with the values that
              define our name—<em>Pragati</em>, meaning Progress.
            </p>
          </div>
        </Reveal>

        {/* ── Vision ── */}
        <Reveal delay={0.06}>
          <div className="festive-card mt-12 p-7" style={{ borderLeft: "4px solid var(--marigold)" }}>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-black mb-2">Our Vision</h2>
            <p className="leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              To be the premier Bengali cultural organization in the Greater Philadelphia region, inspiring future
              generations to celebrate, preserve, and share the rich heritage of Bengal while fostering an inclusive,
              vibrant, and compassionate community.
            </p>
          </div>
        </Reveal>

        {/* ── Mission ── */}
        <Reveal delay={0.06}>
          <div className="mt-10">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-black mb-4">Our Mission</h2>
            <ul className="grid gap-3">
              {MISSION.map((m) => (
                <li key={m} className="flex gap-3 items-start leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                  <span className="font-bold shrink-0" style={{ color: "var(--sindoor)" }}>
                    ✦
                  </span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* ── Join Us ── */}
        <Reveal delay={0.06}>
          <div
            className="mt-12 rounded-3xl p-8 text-center"
            style={{ background: "linear-gradient(135deg, var(--terracotta) 0%, var(--sindoor) 100%)" }}
          >
            <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-black" style={{ color: "var(--cream)" }}>
              Join Us
            </h2>
            <p className="mt-3 leading-relaxed max-w-xl mx-auto" style={{ color: "var(--marigold-pale)" }}>
              Whether you&apos;re looking to celebrate your roots, volunteer, showcase your talents, or simply meet new
              friends, Pragati offers a place where everyone belongs. Together, we honor our past, celebrate the
              present, and build a stronger future for generations to come.
            </p>
          </div>
        </Reveal>
      </div>

      {/* ── Executive Committee ── */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <Reveal>
          <div className="text-center mb-8">
            <p className="font-[family-name:var(--font-bangla)] text-xl" style={{ color: "var(--terracotta)" }}>
              কার্যকরী সমিতি
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black">
              Executive Committee 2026–2027
            </h2>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/about/committee-2026.jpg"
              alt="Pragati Executive Committee 2026–2027 members"
              className="w-full h-auto block"
            />
          </div>
        </Reveal>
      </section>

      {/* ── Contact ── */}
      <div className="mx-auto max-w-3xl px-5 pb-16">
        <Reveal>
          <div className="festive-card p-6">
            <p className="font-semibold mb-1">Get in touch</p>
            <p style={{ color: "var(--ink-soft)" }} className="text-sm">
              <a className="underline underline-offset-4" href={`mailto:${site.contactEmail}`}>
                {site.contactEmail}
              </a>{" "}
              · {site.address}
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
