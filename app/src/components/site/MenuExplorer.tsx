'use client';

/**
 * "What's cooking" — the full Pujo menu on the event page, day by day.
 * Lunch cards glow like afternoon, dinner cards like night. Every dish has
 * its photo, Bangla name and one line on what it is.
 */
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PUJO_MENU, dishPhoto, plateFor, todayET, type Dish } from '@/lib/pujo-menu';

const DAYS = [
  { key: 'fri', label: 'Friday', date: '2026-10-09', n: 9 },
  { key: 'sat', label: 'Saturday', date: '2026-10-10', n: 10 },
  { key: 'sun', label: 'Sunday', date: '2026-10-11', n: 11 },
] as const;

function Mark({ plate }: { plate: Dish['plate'] }) {
  const nv = plate === 'nv';
  return <span className={`food-mark${nv ? ' nv' : ''}`} role="img" aria-label={nv ? 'Non-veg' : 'Veg'} />;
}

function Seg<T extends string>({
  label,
  group,
  value,
  options,
  onChange,
}: {
  label: string;
  group: string;
  value: T;
  options: { v: T; text: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="thali-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {value === o.v && (
            <motion.span layoutId={`mx-${group}`} className="thali-seg__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          )}
          <span className="relative">{o.text}</span>
        </button>
      ))}
    </div>
  );
}

export default function MenuExplorer() {
  const reduce = !!useReducedMotion();
  const today = todayET();
  const [day, setDay] = useState<(typeof DAYS)[number]['key']>(DAYS.find((d) => d.date === today)?.key ?? 'fri');
  const [veg, setVeg] = useState(false);
  const [kids, setKids] = useState(false);
  const meals = PUJO_MENU.meals.filter((m) => m.dayKey === day);

  return (
    <div className="pmx">
      <div className="pmx-bar">
        <h2>
          <span className="bn">কী রান্না হচ্ছে</span>
          What&apos;s cooking
        </h2>
        <div className="pmx-controls">
          <Seg
            label="Plate"
            group="plate"
            value={veg ? 'veg' : 'nv'}
            onChange={(v) => setVeg(v === 'veg')}
            options={[
              { v: 'nv', text: <><Mark plate="nv" /> Non-veg</> },
              { v: 'veg', text: <><Mark plate="veg" /> Veg</> },
            ]}
          />
          <Seg
            label="Menu"
            group="age"
            value={kids ? 'kids' : 'adults'}
            onChange={(v) => setKids(v === 'kids')}
            options={[
              { v: 'adults', text: 'Adults' },
              { v: 'kids', text: 'Kids' },
            ]}
          />
        </div>
      </div>

      <div className="pmx-days" role="tablist" aria-label="Day">
        {DAYS.map((d) => {
          const on = d.key === day;
          const ms = PUJO_MENU.meals.filter((m) => m.dayKey === d.key).map((m) => m.meal);
          return (
            <button key={d.key} type="button" role="tab" aria-selected={on} className="pmx-day" onClick={() => setDay(d.key)}>
              {on && <motion.span layoutId="pmx-day" className="pmx-day__on" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <span className="relative">
                <span className="w">{d.label}</span>
                <span className="n">Oct {d.n}</span>
                <span className="m">{ms.join(' · ')}</span>
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${day}-${veg}-${kids}`}
          className="pmx-meals"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {meals.map((m, mi) => {
            const lunch = m.meal === 'Lunch';
            const list = plateFor(m, veg, kids);
            return (
              <article key={m.id} className={`pmx-meal ${lunch ? 'lunch' : 'dinner'}`}>
                <header>
                  <div>
                    <h3>
                      {m.meal}
                      {kids ? ' · Kids' : ''}
                    </h3>
                    <span className="bn">{lunch ? 'দুপুরের খাবার' : 'রাতের খাবার'}</span>
                  </div>
                  <span className="pmx-meal__sky" aria-hidden />
                </header>
                <ul>
                  {list.map((x, i) => (
                    <motion.li
                      key={x.slug}
                      initial={reduce ? false : { opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduce ? 0 : 0.08 + mi * 0.08 + i * 0.04, duration: 0.3 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={dishPhoto(x.slug)} alt="" loading="lazy" />
                      <div>
                        <p className="nm">
                          <Mark plate={x.plate} />
                          <span>{x.name}</span>
                          {x.special && <span className="only">Pujo special</span>}
                        </p>
                        {x.bn && <p className="bn">{x.bn}</p>}
                        {x.about && <p className="ds">{x.about}</p>}
                      </div>
                    </motion.li>
                  ))}
                </ul>
                <footer>
                  {kids
                    ? 'Kids plates come with Youth passes (5–18).'
                    : `Included with a 🍛 "With food" pass for ${m.day}.`}
                </footer>
              </article>
            );
          })}
        </motion.div>
      </AnimatePresence>

      <div className="pmx-note">
        <span><Mark plate="veg" /> Veg</span>
        <span><Mark plate="nv" /> Non-veg</span>
        <span>Single lunches and dinners can be added under Extras.</span>
        <a href={PUJO_MENU.poster} target="_blank" rel="noreferrer">
          Open the menu poster
        </a>
      </div>
    </div>
  );
}
