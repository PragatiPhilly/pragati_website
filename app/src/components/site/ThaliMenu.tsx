'use client';

/**
 * Kolapata Thali — the Pujo menu served on a banana leaf.
 *
 * - Five meals on a rail; plays through them on its own while in view and
 *   stops for good the moment someone taps anything.
 * - Dishes are real photos in steel bowls. Dishes shared between two plates
 *   glide to their new place (framer-motion layout); new ones drop in on a
 *   spring, old ones are cleared off to the side.
 * - The centre dish is highlighted with a soft golden glow and a slow alpona
 *   ring, with steam rising (all CSS, transform/opacity only).
 * - Veg / non-veg flips only the dishes that change; Kids swaps the menu.
 * - Honours prefers-reduced-motion (no autoplay, no tilt, fades only).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import { PUJO_MENU, dishPhoto, plateFor, starOf, type Dish } from '@/lib/pujo-menu';

const MEALS = PUJO_MENU.meals;
const AUTOPLAY_MS = 6500;
const SPRING = { type: 'spring' as const, stiffness: 240, damping: 20, mass: 0.9 };

/**
 * Where the dishes sit (in % of the leaf). Small plates get a composed layout;
 * bigger ones sit on an arc that leaves the bottom clear for the centre label.
 * Returns the centre dish's spot first, then one spot per side dish.
 */
function layout(n: number): { star: [number, number]; ring: [number, number][] } {
  if (n === 0) return { star: [50, 48], ring: [] };
  if (n === 1) return { star: [40, 48], ring: [[77, 50]] };
  if (n === 2) return { star: [50, 46], ring: [[19, 52], [81, 52]] };
  if (n === 3) return { star: [50, 50], ring: [[19, 56], [50, 15], [81, 56]] };
  const a0 = Math.PI * 0.68;
  const span = Math.PI * 1.64;
  return {
    star: [50, 50],
    ring: Array.from({ length: n }, (_, i) => {
      const a = a0 + (i / (n - 1)) * span;
      return [50 + 39 * Math.cos(a), 50 + 36 * Math.sin(a)] as [number, number];
    }),
  };
}

type Mode = 'meal' | 'plate';
type Ctx = { mode: Mode; reduce: boolean };

const bowl: Variants = {
  enter: ({ mode, reduce }: Ctx) =>
    reduce
      ? { opacity: 0 }
      : mode === 'plate'
        ? { opacity: 0, rotateY: 90, scale: 0.9, transformPerspective: 600 }
        : { opacity: 0, y: -80, scale: 1.3, rotate: -24 },
  rest: ({ reduce, i }: Ctx & { i: number }) => ({
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    rotate: 0,
    rotateY: 0,
    transition: reduce ? { duration: 0.25 } : { ...SPRING, delay: 0.12 + i * 0.07 },
  }),
  exit: ({ mode, reduce }: Ctx) =>
    reduce
      ? { opacity: 0, transition: { duration: 0.15 } }
      : mode === 'plate'
        ? { opacity: 0, rotateY: -90, scale: 0.9, transformPerspective: 600, transition: { duration: 0.26, ease: 'easeIn' } }
        : { opacity: 0, x: 110, y: -36, rotate: 38, scale: 0.5, transition: { duration: 0.36, ease: [0.5, 0, 0.75, 0] } },
};

const landing: Variants = {
  enter: { opacity: 0, scale: 0.35 },
  rest: ({ reduce, i }: Ctx & { i: number }) => ({
    opacity: 1,
    scale: 1,
    transition: reduce ? { duration: 0.25 } : { ...SPRING, delay: 0.12 + i * 0.07 },
  }),
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

function Sun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </svg>
  );
}
function Moon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
    </svg>
  );
}
function FoodMark({ plate }: { plate: Dish['plate'] }) {
  const nv = plate === 'nv';
  return <span className={`food-mark${nv ? ' nv' : ''}`} role="img" aria-label={nv ? 'Non-veg' : 'Veg'} />;
}

/** Steam: three soft, blurred wisps — transform/opacity only, so it stays smooth on slow phones. */
function Steam({ at }: { at: [number, number] }) {
  return (
    <span className="thali-steam" style={{ left: `${at[0]}%`, top: `${at[1]}%` }} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  group,
}: {
  label: string;
  value: T;
  options: { v: T; text: React.ReactNode }[];
  onChange: (v: T) => void;
  group: string;
}) {
  return (
    <div className="thali-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {value === o.v && (
            <motion.span layoutId={`seg-${group}`} className="thali-seg__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          )}
          <span className="relative">{o.text}</span>
        </button>
      ))}
    </div>
  );
}

export default function ThaliMenu({ ticketsHref }: { ticketsHref: string }) {
  const reduce = !!useReducedMotion();
  const [cur, setCur] = useState(0);
  const [veg, setVeg] = useState(false);
  const [kids, setKids] = useState(false);
  const [auto, setAuto] = useState(true);
  const [mode, setMode] = useState<Mode>('meal');
  const [poster, setPoster] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const seen = useInView(root, { once: true, amount: 0.3 });
  const inView = useInView(root, { amount: 0.35 });

  // The leaf is "laid on the table" as you scroll to it, then eases back.
  const { scrollYProgress } = useScroll({ target: tableRef, offset: ['start end', 'end start'] });
  const tilt = useSpring(useTransform(scrollYProgress, [0, 0.42, 1], [18, 0, -7]), { stiffness: 110, damping: 22 });
  const lift = useSpring(useTransform(scrollYProgress, [0, 0.4], [0.9, 1]), { stiffness: 110, damping: 22 });

  const meal = MEALS[cur];
  const list = useMemo(() => plateFor(meal, veg, kids), [meal, veg, kids]);
  const star = starOf(list);
  const rest = list.filter((x) => x !== star);
  const spots = layout(rest.length);
  const roomy = rest.length <= 2;
  const keyOf = (x: Dish) => `${kids ? 'k' : 'a'}-${x.slug}`;
  const ctx: Ctx = { mode, reduce };

  // Autoplay while visible, until the first interaction.
  useEffect(() => {
    if (!auto || !inView || reduce) return;
    const t = setTimeout(() => {
      setMode('meal');
      setCur((c) => (c + 1) % MEALS.length);
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [auto, inView, reduce, cur]);

  // Warm the cache for the next meal's photos.
  useEffect(() => {
    const next = MEALS[(cur + 1) % MEALS.length];
    for (const x of plateFor(next, veg, kids)) {
      const im = new Image();
      im.src = dishPhoto(x.slug);
    }
  }, [cur, veg, kids]);

  useEffect(() => {
    if (!poster) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPoster(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [poster]);

  const pickMeal = (i: number) => {
    setAuto(false);
    setMode('meal');
    setCur(i);
  };
  const pickPlate = (v: 'nv' | 'veg') => {
    setAuto(false);
    setMode('plate');
    setVeg(v === 'veg');
  };
  const pickAge = (v: 'adults' | 'kids') => {
    setAuto(false);
    setMode('meal');
    setKids(v === 'kids');
  };

  const running = auto && inView && !reduce;

  // Hover highlight (bowl <-> list row) is done on the DOM directly, so hovering
  // never re-renders the menu or makes framer-motion re-measure the layout.
  const markHot = (slug: string | null) => {
    const r = root.current;
    if (!r) return;
    r.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
    if (slug) r.querySelectorAll(`[data-slug="${slug}"]`).forEach((el) => el.classList.add('is-hot'));
  };
  const heading = `${meal.day} · ${meal.meal}${kids ? ' · Kids' : ''}`;

  const renderBowl = (x: Dish, i: number, at: [number, number], isStar: boolean) => (
    // labels go above bowls in the top half so they never slide under the centre dish
    <motion.button
      key={keyOf(x)}
      type="button"
      layout="position"
      custom={{ ...ctx, i }}
      variants={bowl}
      initial="enter"
      animate="rest"
      exit="exit"
      transition={{ layout: { type: 'spring', stiffness: 170, damping: 24 } }}
      className={`thali-bowl${isStar ? ' is-star' : ''}${!isStar && at[1] < 42 ? ' tag-up' : ''}${roomy ? ' roomy' : ''}`}
      style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
      data-slug={x.slug}
      aria-label={x.name}
      onPointerEnter={() => markHot(x.slug)}
      onPointerLeave={() => markHot(null)}
      onFocus={() => markHot(x.slug)}
      onBlur={() => markHot(null)}
      onClick={() => setAuto(false)}
    >
      <motion.span className="thali-bowl__shadow-wrap" custom={{ ...ctx, i }} variants={landing}>
        <span className="thali-bowl__shadow" />
      </motion.span>
      {/* the lift on hover is plain CSS on this inner body — same feel for every bowl */}
      <span className="thali-bowl__body">
        <span className="thali-bowl__rim" />
        <span className="thali-bowl__food">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dishPhoto(x.slug)} alt="" draggable={false} style={{ animationDelay: `-${(x.slug.length * 7) % 60}s` }} />
        </span>
      </span>
      <span className="thali-bowl__tag">{x.name.replace(' (boneless)', '')}</span>
      {x.about && (
        <span className="thali-bowl__card" role="tooltip">
          <b>{x.name}</b>
          {x.bn && <span className="bn">{x.bn}</span>}
          <span>{x.about}</span>
        </span>
      )}
    </motion.button>
  );

  return (
    <div ref={root} className={`thali${inView ? '' : ' is-idle'}`} aria-label="Durga Pujo menu">
      {/* meal rail */}
      <div className="thali-rail" role="tablist" aria-label="Meals">
        {MEALS.map((m, i) => {
          const on = i === cur;
          const night = m.meal === 'Dinner';
          return (
            <button key={m.id} type="button" role="tab" aria-selected={on} className="thali-stop" onClick={() => pickMeal(i)}>
              <span className={`thali-orb${night ? ' night' : ''}`}>
                {on && (
                  <motion.span
                    layoutId="thali-bead"
                    className={`thali-orb__bead${night ? ' night' : ''}`}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                {on && running && (
                  <svg key={`p${cur}`} className="thali-orb__ring" viewBox="0 0 50 50" aria-hidden>
                    <circle cx="25" cy="25" r="23" style={{ animationDuration: `${AUTOPLAY_MS}ms` }} />
                  </svg>
                )}
                <span className="relative">{night ? <Moon /> : <Sun />}</span>
              </span>
              <span className="thali-stop__txt">
                <span className="t1">
                  {m.short} · {m.meal}
                </span>
                <span className="t2">{m.day}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* the leaf */}
      <div className="thali-stage" ref={tableRef}>
        <motion.div className="thali-table" style={reduce ? undefined : { rotateX: tilt, scale: lift }}>
          <svg className="thali-leaf" viewBox="0 0 1000 740" aria-hidden>
            <defs>
              <linearGradient id="thali-lg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4c8a2f" />
                <stop offset=".45" stopColor="#6fa844" />
                <stop offset="1" stopColor="#3f7626" />
              </linearGradient>
              <linearGradient id="thali-sh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".22" />
                <stop offset=".5" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity=".12" />
              </linearGradient>
              <pattern id="thali-veins" width="22" height="740" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
                <line x1="11" y1="0" x2="11" y2="740" stroke="#2f5c1b" strokeOpacity=".22" strokeWidth="1.4" />
              </pattern>
              <clipPath id="thali-clip">
                <path d="M70 150 C 60 95 110 60 170 62 L 860 48 C 925 46 960 92 955 150 L 972 560 C 978 640 930 690 860 688 L 150 700 C 88 702 40 660 44 600 Z" />
              </clipPath>
            </defs>
            <g clipPath="url(#thali-clip)">
              <rect width="1000" height="740" fill="url(#thali-lg)" />
              <rect width="1000" height="740" fill="url(#thali-veins)" />
              <rect width="1000" height="740" fill="url(#thali-sh)" />
              <path d="M20 300 C 300 285 700 280 990 292" stroke="#d7e8a6" strokeOpacity=".75" strokeWidth="10" fill="none" />
              <path d="M20 300 C 300 285 700 280 990 292" stroke="#8fb85a" strokeWidth="3" fill="none" />
            </g>
            <path
              d="M70 150 C 60 95 110 60 170 62 L 860 48 C 925 46 960 92 955 150 L 972 560 C 978 640 930 690 860 688 L 150 700 C 88 702 40 660 44 600 Z"
              fill="none"
              stroke="#2f5c1b"
              strokeOpacity=".35"
              strokeWidth="3"
            />
          </svg>

          <div className="thali-bowls">
            {seen && (
              <AnimatePresence mode="popLayout" custom={ctx}>
                {renderBowl(star, 0, spots.star, true)}
                {rest.map((x, i) => renderBowl(x, i + 1, spots.ring[i], false))}
              </AnimatePresence>
            )}
            {seen && !reduce && <Steam key={`steam-${keyOf(star)}`} at={spots.star} />}
          </div>
        </motion.div>
      </div>

      {/* the panel */}
      <div className="thali-panel" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={heading}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="thali-panel__bn">{kids ? `${meal.bn} · ছোটদের` : meal.bn}</span>
            <h3 className="thali-panel__title">{heading}</h3>
          </motion.div>
        </AnimatePresence>

        <div className="thali-controls">
          <Seg
            label="Plate"
            group="plate"
            value={veg ? 'veg' : 'nv'}
            onChange={pickPlate}
            options={[
              { v: 'nv', text: <><FoodMark plate="nv" /> Non-veg</> },
              { v: 'veg', text: <><FoodMark plate="veg" /> Veg</> },
            ]}
          />
          <Seg
            label="Menu"
            group="age"
            value={kids ? 'kids' : 'adults'}
            onChange={pickAge}
            options={[
              { v: 'adults', text: 'Adults' },
              { v: 'kids', text: 'Kids' },
            ]}
          />
        </div>

        <ul className="thali-list">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((x, i) => (
              <motion.li
                key={keyOf(x)}
                layout="position"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0, transition: { delay: reduce ? 0 : 0.05 + i * 0.035, duration: 0.3 } }}
                exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
                data-slug={x.slug}
                onPointerEnter={() => markHot(x.slug)}
                onPointerLeave={() => markHot(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dishPhoto(x.slug)} alt="" loading="lazy" />
                <FoodMark plate={x.plate} />
                <span className="nm">{x.name}</span>
                {x.bn && <span className="bn">{x.bn}</span>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="thali-actions">
          <button type="button" className="btn-primary !py-2.5 !px-6 text-sm" onClick={() => setPoster(true)}>
            See the menu poster
          </button>
          <a href={ticketsHref} className="btn-secondary !py-2.5 !px-6 text-sm">
            Passes with food →
          </a>
        </div>
      </div>

      <AnimatePresence>
        {poster && (
          <motion.div
            className="thali-poster"
            role="dialog"
            aria-modal="true"
            aria-label="Durga Pujo 2026 menu poster"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPoster(false)}
          >
            <motion.img
              src={PUJO_MENU.poster}
              alt="A Taste of Bengal: Durga Puja 2026 menu for October 9 to 11, with the kids menu"
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            />
            <button type="button" className="thali-poster__close" onClick={() => setPoster(false)} autoFocus>
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
