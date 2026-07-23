import Link from "next/link";
import { getActiveEvent, listPublishedEvents, getConcertPasses } from "@/lib/queries/events";
import { getConfig } from "@/lib/system-config";
import Countdown from "@/components/site/Countdown";
import Reveal from "@/components/site/Reveal";
import AlponaDivider from "@/components/site/AlponaDivider";
import AlponaSpine from "@/components/site/AlponaSpine";
import ScrollParallax from "@/components/site/ScrollParallax";
import CountUp from "@/components/site/CountUp";
import HeroParallax from "@/components/site/HeroParallax";
import KaliScene from "@/components/scenes/KaliScene";
import SaraswatiScene from "@/components/scenes/SaraswatiScene";
import DhunuchiVignette from "@/components/scenes/DhunuchiVignette";
import DhakiVignette from "@/components/scenes/DhakiVignette";
import DoshomiVignette from "@/components/scenes/DoshomiVignette";
import KolaBou from "@/components/scenes/KolaBou";
import RegisterPreview from "@/components/site/RegisterPreview";
import ScrollLink from "@/components/site/ScrollLink";
import Daypart from "@/components/site/Daypart";
import PetalTrail from "@/components/site/PetalTrail";
import ScrollToTop from "@/components/site/ScrollToTop";
import PhotoCarousel from "@/components/site/PhotoCarousel";
import PhotoSlideshow from "@/components/site/PhotoSlideshow";
import PosterPanels from "@/components/site/PosterPanels";
import { getCarouselImages, getSlideshowImages, getPosterImages, type MediaImage } from "@/lib/media/queries";
import { listMagazines } from "@/lib/magazines";
import MagazineShelf from "@/components/site/MagazineShelf";
import { formatCents } from "@/lib/pricing";
import { site } from "@/config/site";

function toPhoto(m: MediaImage) {
  return {
    fileBase: m.fileBase,
    width: m.width,
    height: m.height,
    variants: m.variants,
    blurDataUrl: m.blurDataUrl,
  };
}

export const dynamic = "force-dynamic";

const CARD_GRADIENTS = ["img-durga", "img-kali", "img-saraswati", "img-boishakhi", "img-summer"];

function Eyebrow({ bn, en, center = false }: { bn: string; en: string; center?: boolean }) {
  return (
    <div className="section-eyebrow" style={center ? { justifyContent: "center", width: "100%" } : undefined}>
      <span className="bar" />
      <span className="bn-tag">{bn}</span> · {en}
      {center && <span className="bar" />}
    </div>
  );
}

export default async function HomePage() {
  const [active, events, membershipPrice, carouselImages, slideshowImages, posterImages, magazines] = await Promise.all([
    getActiveEvent(),
    listPublishedEvents(),
    getConfig<number>("membership_annual_price_cents"),
    getCarouselImages(),
    getSlideshowImages(),
    getPosterImages(),
    listMagazines(),
  ]);
  const carouselPhotos = carouselImages.map(toPhoto);
  const slideshowPhotos = slideshowImages.map(toPhoto);
  const posterPhotos = posterImages.map(toPhoto);
  // Concert passes drive the poster "Buy tickets" buttons (deep-link to a
  // concert-only checkout for that day). Empty → the posters stay "coming soon".
  const concertPasses = active ? await getConcertPasses(active.id) : [];
  const concertBuy = (dayKey: string) => {
    const pass = concertPasses.find((c) => Array.isArray(c.dayKeys) && (c.dayKeys as string[]).includes(dayKey));
    if (!pass || !active) return null;
    const price = pass.priceNonmemberCents >= 0 ? pass.priceNonmemberCents : pass.priceMemberCents;
    return { href: `/register?event=${active.slug}&concert=${dayKey}`, price };
  };
  const now = new Date();
  const upcoming = events.filter((e) => e.endsAt > now);
  const featured = active && active.status === "published" ? active : upcoming[0];
  const others = upcoming.filter((e) => e.id !== featured?.id).slice(0, 4);
  const theme = active?.theme ?? "durga";

  return (
    <div className="relative">
      <ScrollParallax />
      <AlponaSpine />
      <Daypart />
      <PetalTrail targetId="hero" />
      <ScrollToTop />

      {/* ══════════ HERO — compact, countdown floats on the seam below ══════════ */}
      <section id="hero" className="relative overflow-hidden">
        <div className="daypart-overlay" aria-hidden />
        <div className="daypart-stars" aria-hidden />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(1200px 500px at 70% -10%, var(--marigold-pale) 0%, transparent 60%), radial-gradient(800px 400px at 10% 110%, var(--accent-soft) 0%, transparent 60%)",
          }}
        />
        {/* ambient life */}
        <div className="hero-sun" aria-hidden />
        <div className="hero-cloud c1" aria-hidden />
        <div className="hero-cloud c2" aria-hidden />
        <div className="hero-cloud c3" aria-hidden />
        {[
          { top: "20%", left: "8%", d: "0s", s: 8 },
          { top: "62%", left: "12%", d: "1.2s", s: 6 },
          { top: "30%", left: "24%", d: "2.4s", s: 10 },
          { top: "72%", left: "18%", d: "3.6s", s: 8 },
          { top: "12%", left: "40%", d: "1.8s", s: 6 },
          { top: "42%", left: "6%", d: "2.8s", s: 7 },
        ].map((p, i) => (
          <span key={i} className="diya-dot" style={{ top: p.top, left: p.left, animationDelay: p.d, width: p.s, height: p.s }} aria-hidden />
        ))}
        {[
          { left: "10%", d: "0s", cls: "" },
          { left: "25%", d: "3s", cls: "red" },
          { left: "45%", d: "6s", cls: "pale" },
          { left: "65%", d: "2s", cls: "" },
          { left: "85%", d: "7s", cls: "red" },
        ].map((p, i) => (
          <span key={i} className={`petal-drop ${p.cls}`} style={{ left: p.left, animationDelay: p.d }} aria-hidden />
        ))}
        {theme === "durga" && (
          <>
            <div className="kolabou left">
              <KolaBou />
            </div>
            <div className="kolabou right">
              <KolaBou flip />
            </div>
          </>
        )}

        <div className="mx-auto w-full max-w-6xl px-5 pt-5 pb-12 md:pt-6 md:pb-16 grid md:grid-cols-[1fr_1.12fr] gap-8 items-center relative z-[2]">
          <div>
            <Reveal>
              <p
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] px-4 py-2 rounded-full mb-4"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--sindoor)" }} />
                <span className="font-[family-name:var(--font-bangla)] normal-case tracking-normal text-sm">১৯৭২ থেকে</span>
                · Since {site.foundedYear} · a 501(c)(3) non-profit
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="font-[family-name:var(--font-display)] text-5xl md:text-[56px] font-black leading-[1.04] tracking-tight">
                <span className="font-[family-name:var(--font-bangla)] block text-xl md:text-2xl font-normal mb-3" style={{ color: "var(--terracotta)" }}>
                  আলো জ্বেলে যাও, ঐতিহ্যে ভাসো
                </span>
                Where the <span style={{ color: "var(--sindoor)" }}>dhaak</span> beats,
                <br />
                and home <em className="not-italic" style={{ color: "var(--terracotta)" }}>comes alive</em>.
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 text-lg max-w-xl leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                Three days of light. A thousand familiar faces. Bengali Philadelphia, lit up like a village
                courtyard at Pujo — Pragati has been bringing this home since {site.foundedYear}.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8 flex flex-col sm:flex-row sm:flex-nowrap gap-4 sm:items-center">
                <Link href="/register" className="btn-primary sm:whitespace-nowrap !px-7">
                  Register for {featured ? featured.name : "the next event"} →
                </Link>
                <ScrollLink to="lineup" className="btn-secondary sm:whitespace-nowrap">
                  See this year&apos;s lineup
                </ScrollLink>
              </div>
            </Reveal>
            {/* mobile countdown (desktop version floats between sections) */}
            {featured && (
              <Reveal delay={0.34} className="md:hidden">
                <div className="mt-8 festive-card inline-block px-6 py-3">
                  <Countdown target={featured.startsAt.toISOString()} />
                </div>
              </Reveal>
            )}
          </div>

          <Reveal delay={0.2}>
            {theme === "kali" ? (
              <KaliScene className="vignette max-w-md mx-auto" />
            ) : theme === "saraswati" ? (
              <SaraswatiScene className="vignette max-w-md mx-auto" />
            ) : (
              <HeroParallax />
            )}
            {featured && (
              <div className="text-center mt-5">
                <p className="text-[11px] uppercase tracking-[0.3em] font-semibold" style={{ color: "var(--terracotta)" }}>
                  Next celebration
                </p>
                <p className="font-[family-name:var(--font-bangla)] text-xl mt-1" style={{ color: "var(--sindoor)" }}>
                  {featured.nameBengali}
                </p>
                <p className="font-[family-name:var(--font-serif)] text-2xl font-semibold leading-tight">{featured.name}</p>
              </div>
            )}
          </Reveal>
        </div>

      </section>

      {/* countdown — centered on the seam between hero and lineup */}
      {featured && (
        <div className="hidden md:flex justify-center relative z-20 -mt-12">
          <div className="festive-card px-9 py-4" style={{ boxShadow: "var(--shadow)" }}>
            <Countdown target={featured.startsAt.toISOString()} />
          </div>
        </div>
      )}

      {/* ══════════ THIS YEAR'S LINEUP — star nights ══════════ */}
      <section id="lineup" className="mx-auto max-w-6xl px-5 pt-16 pb-12 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-12">
            <Eyebrow bn="উৎসবের মঞ্চ" en="Pujo weekend · live on stage" center />
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-5xl font-black leading-tight">
              <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal mb-2" style={{ color: "var(--terracotta)" }}>
                এই বছরের চমক
              </span>
              Two nights. Two <em style={{ color: "var(--sindoor)" }}>legends</em>.
            </h2>
          </div>
        </Reveal>
        {posterPhotos.length > 0 ? (
          <>
            <PosterPanels photos={posterPhotos} />
            {concertPasses.length > 0 && active && (
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {concertPasses.map((c) => {
                  const day = Array.isArray(c.dayKeys) ? (c.dayKeys as string[])[0] : undefined;
                  const price = c.priceNonmemberCents >= 0 ? c.priceNonmemberCents : c.priceMemberCents;
                  return (
                    <Link
                      key={c.id}
                      href={`/register?event=${active.slug}&concert=${day ?? ""}`}
                      className="btn-primary !py-2.5 !px-6 text-sm"
                      title={`Buy · ${formatCents(price)}`}
                    >
                      🎟 {c.name} · {formatCents(price)}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        ) : (
        <div className="grid md:grid-cols-2 gap-7 items-stretch">
          {[
            {
              src: "/lineup/anjan-dutt.jpg",
              alt: "Pragati presents Anjan Dutt & The Electric Band — the only East Coast stop this year",
              date: "Sat, Oct 10, 2026 · 6:30 PM",
              venue: "Greater Philadelphia Expo Center",
              accent: "#e9c25d",
              bg: "#14100a",
              dayKey: "sat",
            },
            {
              src: "/lineup/bhoomi.jpg",
              alt: "Pragati presents Bhoomi — মাটির গান, মনের টান — Music of the Soil & Soul",
              date: "Sun, Oct 11, 2026 · 6:30 PM",
              venue: "Greater Philadelphia Expo Center",
              accent: "#9fc6e4",
              bg: "#080e1c",
              dayKey: "sun",
            },
          ].map((p, i) => {
            const buy = concertBuy(p.dayKey);
            return (
            <Reveal key={p.src} delay={i * 0.1}>
              <div
                className="group rounded-[26px] overflow-hidden flex flex-col h-full hover:-translate-y-1.5 transition-transform duration-300"
                style={{ background: p.bg, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
              >
                <div className="relative overflow-hidden aspect-[4/5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    alt={p.alt}
                    className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 text-center text-xs" style={{ color: p.accent }}>
                  <div className="rounded-xl py-3 px-2 flex flex-col justify-center" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${p.accent}40` }}>
                    <p className="font-black text-sm">{p.date}</p>
                    <p className="mt-0.5 opacity-80">{p.venue}</p>
                  </div>
                  {buy ? (
                    <Link
                      href={buy.href}
                      title={`Buy tickets · ${formatCents(buy.price)}`}
                      className="rounded-xl py-3 px-2 flex flex-col justify-center transition-transform hover:scale-[1.04]"
                      style={{ background: p.accent, color: p.bg }}
                    >
                      <p className="font-black text-sm">🎟 Buy tickets</p>
                      <p className="mt-0.5 font-black">{formatCents(buy.price)}</p>
                    </Link>
                  ) : (
                    <div className="rounded-xl py-3 px-2 flex flex-col justify-center" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${p.accent}40` }}>
                      <p className="font-black text-sm">🎟 Tickets coming soon</p>
                      <p className="mt-0.5 opacity-80">stay tuned</p>
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
            );
          })}
        </div>
        )}
      </section>

      <AlponaDivider variant="lotus" />

      {/* ══════════ MISSION ══════════ */}
      <section className="mx-auto max-w-6xl px-5 py-10 grid md:grid-cols-[1fr_1.1fr] gap-14 items-center">
        <Reveal>
          {slideshowPhotos.length > 0 ? (
            <PhotoSlideshow photos={slideshowPhotos} />
          ) : (
            <div
              className="relative rounded-[28px] overflow-hidden aspect-[4/5] grid place-items-center p-8"
              style={{ background: "linear-gradient(165deg, var(--bg-soft) 0%, var(--marigold-pale) 100%)", boxShadow: "var(--shadow)" }}
            >
              <div className="marigold-string" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/pragati-square.png"
                alt="Pragati"
                className="w-full max-w-[240px] rounded-2xl"
                style={{ boxShadow: "0 14px 34px rgba(0,0,0,0.28)" }}
              />
              <div
                className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-bold tracking-wide rounded-full px-4 py-2 whitespace-nowrap"
                style={{ background: "var(--card)", color: "var(--terracotta)", boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}
              >
                <span className="font-[family-name:var(--font-bangla)]">প্রতিষ্ঠা ১৯৭২</span> · Est. {site.foundedYear}
              </div>
            </div>
          )}
        </Reveal>
        <Reveal delay={0.12}>
          <Eyebrow bn="গ্রামের বাড়ি · আমাদের লক্ষ্য" en="Our mission" />
          <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-[42px] font-black leading-tight">
            <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal mb-2" style={{ color: "var(--terracotta)" }}>
              আমাদের লক্ষ্য, আমাদের পরিবার
            </span>
            A community built on <em style={{ color: "var(--sindoor)" }}>culture</em>, compassion, and continuity.
          </h2>
          <blockquote className="my-6 pl-5 py-1 border-l-[3px]" style={{ borderColor: "var(--marigold)" }}>
            <p className="font-[family-name:var(--font-bangla)] text-lg" style={{ color: "var(--sindoor)" }}>
              &ldquo;যেখানে দশভুজার আশীর্বাদ, সেখানেই আমাদের বাড়ি।&rdquo;
            </p>
            <p className="font-[family-name:var(--font-serif)] italic mt-1" style={{ color: "var(--ink-soft)" }}>
              &ldquo;Where Maa Durga&apos;s blessing dwells, there we make our home.&rdquo;
            </p>
          </blockquote>
          <p className="leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Formed in {site.foundedYear}, Pragati is among the oldest Bengali organizations on the East Coast —
            dedicated to honouring our shared heritage while welcoming every neighbour, friend, and stranger into
            the warmth of a Bengali household.
          </p>
          <div className="flex gap-10 mt-8 flex-wrap">
            {[
              { n: 54, label: "Years celebrating", bn: "৫৪ বছর" },
              { n: 80, label: "Founding families", bn: "আশি পরিবার" },
              { n: 200, label: "Active members", bn: "দুইশো সদস্য" },
            ].map((s) => (
              <div key={s.label}>
                <CountUp to={s.n} className="font-[family-name:var(--font-display)] text-4xl font-black block" />
                <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.label}</span>
                <span className="font-[family-name:var(--font-bangla)] block text-sm" style={{ color: "var(--terracotta)" }}>{s.bn}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <AlponaDivider variant="flower" />

      {/* ══════════ REGISTER — the major section ══════════ */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <Reveal>
          <div
            className="rounded-[32px] overflow-hidden relative grid lg:grid-cols-[1.1fr_0.9fr] gap-10 p-9 md:p-14"
            style={{ background: "linear-gradient(140deg, var(--sindoor) 0%, var(--sindoor-deep) 60%, #4a0510 100%)", boxShadow: "var(--shadow)" }}
          >
            {/* floating petals inside the band */}
            <span className="petal-drop pale" style={{ left: "12%", animationDelay: "1s" }} aria-hidden />
            <span className="petal-drop pale" style={{ left: "70%", animationDelay: "5s" }} aria-hidden />
            <div className="relative z-[2]">
              <p className="font-[family-name:var(--font-bangla)] text-2xl md:text-3xl mb-3" style={{ color: "var(--marigold-bright)" }}>
                এসো, মায়ের আঙিনায় 🪔
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-5xl font-black leading-tight" style={{ color: "var(--cream)" }}>
                You&apos;re invited home.
              </h2>
              <p className="font-[family-name:var(--font-bangla)] mt-6 text-xl leading-relaxed max-w-lg" style={{ color: "var(--marigold-pale)" }}>
                ঢাকের তালে, ভোগের গন্ধে, হাজার চেনা মুখের ভিড়ে —
                আপনার জন্য জায়গা রাখা আছে। আসছেন তো?
              </p>
              <p className="mt-3 text-lg leading-relaxed max-w-lg" style={{ color: "var(--marigold-pale)" }}>
                The dhaak, the bhog, a thousand familiar faces — your seat at the pujo
                is waiting. Just tell us who&apos;s coming.
              </p>
              <div className="mt-9 flex flex-wrap gap-4 items-center">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2.5 rounded-full px-9 py-4 text-lg font-bold transition-transform hover:-translate-y-0.5"
                  style={{ background: "var(--cream)", color: "var(--sindoor)", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}
                >
                  <span className="font-[family-name:var(--font-bangla)] font-normal">নাম লেখান</span> · Register →
                </Link>
              </div>
            </div>

            {/* looping anonymous preview */}
            <div className="relative z-[2] hidden lg:block">
              <RegisterPreview />
            </div>
          </div>
        </Reveal>
      </section>

      <AlponaDivider variant="arrows" />

      {/* ══════════ EVENTS ══════════ */}
      <section id="events" className="mx-auto max-w-6xl px-5 py-10">
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-10">
            <div>
              <Eyebrow bn="অষ্টমী সন্ধ্যা · ধুনুচি নাচ" en="Ashtami evening" />
              <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-[42px] font-black leading-tight">
                <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal mb-1" style={{ color: "var(--terracotta)" }}>
                  উৎসবের রাত
                </span>
                Festivals, food, music — <em style={{ color: "var(--sindoor)" }}>together</em>.
              </h2>
            </div>
            <div className="flex items-center gap-5">
              <DhunuchiVignette className="vignette w-24 hidden sm:block" />
              <Link href="/events" className="btn-primary !py-2.5 !px-6 text-sm">
                Full calendar →
              </Link>
            </div>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-5 md:grid-rows-2">
          {featured && (
            <Reveal className="md:row-span-2 md:col-span-2">
              <Link href={`/events/${featured.slug}`} className="event-card h-full min-h-[420px] block">
                {featured.theme === "durga" ? (
                  <div
                    className="img"
                    style={{ backgroundImage: "url(/about/pandal-patachitra.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                ) : (
                  <div className={`img ${featured.theme === "kali" ? "img-kali" : featured.theme === "saraswati" ? "img-saraswati" : "img-durga"}`} />
                )}
                <div className="overlay" />
                <div className="arrow-circle">↗</div>
                <div className="relative z-[2] p-7 w-full">
                  <span className="chip">★ Featured</span>
                  <h3 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black" style={{ color: "#FBF6EC", textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
                    {featured.nameBengali && (
                      <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal" style={{ color: "var(--marigold-pale)" }}>
                        {featured.nameBengali}
                      </span>
                    )}
                    {featured.name}
                  </h3>
                  <p className="mt-2 text-sm" style={{ color: "rgba(251,246,236,0.92)", textShadow: "0 1px 10px rgba(0,0,0,0.55)" }}>
                    {featured.startsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })}–
                    {featured.endsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", day: "numeric" })} · {featured.venueName}
                  </p>
                </div>
              </Link>
            </Reveal>
          )}
          {others.map((e, i) => (
            <Reveal key={e.id} delay={0.08 * (i + 1)}>
              <Link href={`/events/${e.slug}`} className="event-card h-full block">
                <div className={`img ${e.theme === "kali" ? "img-kali" : e.theme === "saraswati" ? "img-saraswati" : CARD_GRADIENTS[(i + 3) % CARD_GRADIENTS.length]}`} />
                <div className="overlay" />
                <div className="arrow-circle">↗</div>
                <div className="relative z-[2] p-5 w-full">
                  <span className="chip">{e.theme !== "none" ? "Pujo" : "Community"}</span>
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-bold" style={{ color: "#FBF6EC" }}>
                    {e.nameBengali && (
                      <span className="font-[family-name:var(--font-bangla)] block text-sm font-normal" style={{ color: "var(--marigold-pale)" }}>
                        {e.nameBengali}
                      </span>
                    )}
                    {e.name}
                  </h3>
                  <p className="mt-1 text-xs" style={{ color: "rgba(251,246,236,0.8)" }}>
                    {e.startsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
          {/* coming-soon tablets for pujos not yet published */}
          {[
            { theme: "kali", img: "img-kali", bn: "কালী পূজা ২০২৬", name: "Kali Pujo 2026", chip: "Sacred night" },
            { theme: "saraswati", img: "img-saraswati", bn: "সরস্বতী পূজা ২০২৭", name: "Saraswati Pujo 2027", chip: "Vasant Panchami" },
          ]
            .filter((t) => featured?.theme !== t.theme && !others.some((e) => e.theme === t.theme))
            .map((t, i) => (
              <Reveal key={t.theme} delay={0.1 + i * 0.08}>
                <div className="event-card h-full min-h-[200px]" style={{ cursor: "default" }}>
                  <div className={`img ${t.img}`} />
                  <div className="overlay" />
                  <div className="relative z-[2] p-5 w-full">
                    <span className="chip">{t.chip}</span>
                    <h3 className="font-[family-name:var(--font-display)] text-xl font-bold" style={{ color: "#FBF6EC" }}>
                      <span className="font-[family-name:var(--font-bangla)] block text-sm font-normal" style={{ color: "var(--marigold-pale)" }}>
                        {t.bn}
                      </span>
                      {t.name}
                    </h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--marigold-bright)" }}>
                      Coming soon
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
        </div>
      </section>

      {/* ══════════ STATS STRIP ══════════ */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <Reveal>
            <DhakiVignette className="vignette w-28 mx-auto mb-4" />
            <Eyebrow bn="নবমী রাত · শেষ আরতি" en="Navami night" center />
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black">
              <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal mb-1" style={{ color: "var(--terracotta)" }}>
                প্রগতি, সংখ্যায়
              </span>
              Pragati by the numbers
            </h2>
            <div className="beat-row mt-5">
              <span /><span /><span /><span /><span />
            </div>
          </Reveal>
          {carouselPhotos.length > 0 && (
            <Reveal delay={0.1}>
              <PhotoCarousel photos={carouselPhotos} />
            </Reveal>
          )}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-5 ${carouselPhotos.length > 0 ? "mt-10" : "mt-12"}`}>
            {[
              { n: 54, label: "Years of community", bn: "৫৪ বছর" },
              { n: 80, label: "Founding families", bn: "আশি পরিবার" },
              { n: 200, label: "Active members", bn: "দুইশো সদস্য" },
              { n: 12, label: "Annual events", bn: "বারো উৎসব" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08}>
                <div className="festive-card p-7">
                  <CountUp to={s.n} className="font-[family-name:var(--font-display)] text-5xl font-black block" />
                  <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>{s.label}</p>
                  <p className="font-[family-name:var(--font-bangla)] text-sm" style={{ color: "var(--terracotta)" }}>{s.bn}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Executive Committee — shown within the numbers section */}
          <Reveal delay={0.1}>
            <div className="mt-16">
              <Eyebrow bn="কার্যকরী সমিতি" en="Executive Committee 2026–2027" center />
              <h3 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-black mt-1 mb-6">
                The hands behind <em style={{ color: "var(--sindoor)" }}>Pragati</em>
              </h3>
              <div className="rounded-[24px] overflow-hidden max-w-4xl mx-auto" style={{ boxShadow: "var(--shadow)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/about/committee-2026.jpg"
                  alt="Pragati Executive Committee 2026–2027 members"
                  className="w-full h-auto block"
                />
              </div>
              <div className="mt-6">
                <Link href="/about" className="btn-secondary">
                  Meet the committee →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════ MAGAZINE ══════════ */}
      <section className="mx-auto max-w-6xl px-5 py-20 grid md:grid-cols-[auto_1fr] gap-16 items-center">
        <Reveal>
          <MagazineShelf magazines={magazines.map((m) => ({ year: m.year, title: m.title }))} />
        </Reveal>
        <Reveal delay={0.12}>
          <Eyebrow bn="পত্রিকা" en="Yearly publication" />
          <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-[42px] font-black leading-tight">
            <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal mb-1" style={{ color: "var(--terracotta)" }}>
              প্রগতি পত্রিকা
            </span>
            Voices of our community, in <em style={{ color: "var(--sindoor)" }}>print</em>.
          </h2>
          <p className="mt-5 leading-relaxed max-w-xl" style={{ color: "var(--ink-soft)" }}>
            Every year, Pragati publishes a curated magazine of essays, poetry, recipes, art, and reflections
            from our members — preserving Bengali voices across generations and oceans.{" "}
            {magazines.length > 0
              ? "Tap a cover to browse the archive and download any year."
              : "Pick up your copy at the Pujo counter."}
          </p>
        </Reveal>
      </section>

      {/* ══════════ SHLOKA BREAKER ══════════ */}
      <Reveal>
        <div className="shloka">
          <p className="bn-quote">&ldquo;আসছে বছর আবার হবে&rdquo;</p>
          <p className="translit">Aschhe bochhor abar hobe — next year, again, we will meet</p>
          <div className="ornament">
            <div className="line" />✦<div className="line" />
          </div>
        </div>
      </Reveal>

      {/* ══════════ MEMBERSHIP ══════════ */}
      <section className="relative overflow-hidden py-16">
        {["5%", "20%", "35%", "55%", "70%", "85%"].map((left, i) => (
          <span key={left} className="speck" style={{ left, animationDelay: `${i * 1.1}s` }} aria-hidden />
        ))}
        <div className="mx-auto max-w-6xl px-5 grid md:grid-cols-[1.1fr_0.9fr] gap-14 items-center relative z-[2]">
          <Reveal>
            <DoshomiVignette className="vignette w-40 mb-5" />
            <Eyebrow bn="দশমী · সিঁদুর খেলা" en="Doshomi · sindoor khela" />
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-[44px] font-black leading-tight">
              <span className="font-[family-name:var(--font-bangla)] block text-xl font-normal mb-2" style={{ color: "var(--terracotta)" }}>
                প্রগতি পরিবারের অংশ হোন
              </span>
              Become part of <em style={{ color: "var(--sindoor)" }}>home</em> — away from home.
            </h2>
            <p className="mt-5 text-lg leading-relaxed max-w-lg" style={{ color: "var(--ink-soft)" }}>
              Pragati&apos;s annual membership unlocks member pricing on every event, our yearly magazine, the
              summer picnic, eligibility for Executive Committee positions, and a real sense of belonging.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="festive-card relative p-8" style={{ boxShadow: "var(--shadow)" }}>
              <span
                className="absolute -top-3 right-6 text-[11px] font-bold uppercase tracking-wider rounded-full px-4 py-1.5"
                style={{ background: "var(--marigold)", color: "var(--sindoor-deep)" }}
              >
                Most loved
              </span>
              <p className="font-[family-name:var(--font-display)] text-6xl font-black" style={{ color: "var(--sindoor)" }}>
                {formatCents(membershipPrice)}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                <span className="font-[family-name:var(--font-bangla)]">প্রতি পরিবার, প্রতি বছর</span> · per family · per year
              </p>
              <ul className="mt-6 grid gap-2.5 text-sm">
                {[
                  "Member pricing on every event — up to 30% off",
                  "Free annual Pragati magazine",
                  "Free summer picnic for the family",
                  "Seasonal social event participation",
                  "Eligibility for Executive Committee positions",
                  "Recognition on our website & magazine",
                ].map((b) => (
                  <li key={b} className="flex gap-3 items-start">
                    <span className="font-bold" style={{ color: "var(--leaf-deep)" }}>✓</span>
                    {b}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="btn-primary w-full mt-7 justify-center">
                Become a member →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════ DONATE ══════════ */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <div
            className="rounded-3xl p-10 md:p-14 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, var(--terracotta) 0%, var(--sindoor) 100%)", boxShadow: "var(--shadow)" }}
          >
            <p className="font-[family-name:var(--font-bangla)] text-2xl mb-3 opacity-90" style={{ color: "var(--cream)" }}>
              আপনার আশীর্বাদে
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold" style={{ color: "var(--cream)" }}>
              Keep the dhaak beating.
            </h2>
            <p className="mt-3 max-w-xl mx-auto" style={{ color: "var(--marigold-pale)" }}>
              Pragati runs on the generosity of this community. Every donation goes straight to pujo, prasad and
              programs — and it&apos;s tax-deductible.
            </p>
            <Link
              href="/donate"
              className="inline-block mt-7 rounded-full px-8 py-3 font-semibold transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--cream)", color: "var(--sindoor)" }}
            >
              Donate to Pragati
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
