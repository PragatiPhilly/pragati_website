'use client';

/**
 * Pujo Nirghonto — the terracotta temple wall (homepage).
 *
 * A curved Bengal-temple roof over a brick wall; one carved row per day, one
 * plaque per ritual. A lit niche says what is happening at the mandap now and
 * what is next (Philadelphia time, re-checked every 30 s).
 *
 * Light: on a computer the mouse is a lamp and every plaque's shadow falls away
 * from it; on a phone/iPad a tap glides the light to that plaque. All of it is
 * transform-only and driven by one requestAnimationFrame loop that stops as soon
 * as the light settles — React never re-renders on pointer moves.
 *
 * "Remind me" puts the ritual in the visitor's own calendar (Apple / Google /
 * .ics) — nothing is stored and nothing is sent. Spec: spec/15-pujo-schedule.md
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ICON_PATHS,
  dayParts,
  etParts,
  flatten,
  fmtTime,
  googleCalendarUrl,
  iconFor,
  inWords,
  nextWhen,
  statusAt,
  timeLabel,
  type FlatRite,
  type PublicFlyer,
  type ScheduleDay,
} from '@/lib/pujo-schedule/model';

type Props = {
  days: ScheduleDay[];
  flyer: PublicFlyer | null;
  /** server's "now", so the first client render matches the HTML exactly */
  nowISO: string;
  venue: string | null;
  pageUrl: string;
};

type Sheet = { ids: string[]; detail: number | null };
type Platform = 'apple' | 'android' | 'other';

const REMINDED_KEY = 'pragati.pujo.reminded';

/** "both" reads better than "all 2". */
const allOf = (n: number) => (n === 2 ? 'both' : `all ${n}`);

/** A fault in this section must never take the homepage down with it. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error('[pujo-schedule] section hidden after an error:', e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function PujoSchedule(props: Props) {
  return (
    <Boundary>
      <Wall {...props} />
    </Boundary>
  );
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} className="pnw-ico-shadow" />
      <path d={d} className="pnw-ico-line" />
    </svg>
  );
}

function Diya({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 40" aria-hidden="true">
      <path d="M3 22c0 7 9 12 21 12s21-5 21-12c-6 2.5-13 3.6-21 3.6S9 24.5 3 22z" fill="#b5531f" stroke="#2a0c03" strokeWidth="1.2" />
      <path d="M6 23.6c5 1.6 11 2.4 18 2.4s13-.8 18-2.4" stroke="#f0a36a" strokeWidth="1" fill="none" opacity=".6" />
      <g className="pnw-flame">
        <path d="M24 20c-3.6 0-5.4-3.6-3.1-7L24 5l3.1 8c2.3 3.4.5 7-3.1 7z" fill="#ffc847" />
        <path d="M24 19c-1.6 0-2.4-1.7-1.4-3.3L24 11l1.4 4.7c1 1.6.2 3.3-1.4 3.3z" fill="#fff6c8" />
      </g>
    </svg>
  );
}

function Bell() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function useModalLock(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
}

function Wall({ days, flyer, nowISO, venue, pageUrl }: Props) {
  const rites = useMemo(() => flatten(days), [days]);
  const [now, setNow] = useState(() => new Date(nowISO));
  const at = etParts(now);
  const st = statusAt(rites, days, at);

  const [sel, setSel] = useState(-1);
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const shownDay = chosenDay ?? st.day;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [flyerOpen, setFlyerOpen] = useState(false);
  const [reminded, setReminded] = useState<string[]>([]);
  const [platform, setPlatform] = useState<Platform>('other');
  const [inApp, setInApp] = useState(false);
  const [toast, setToast] = useState('');
  const [anim, setAnim] = useState<'none' | 'wait' | 'in'>('none');

  const wallRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const lampRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<() => void>(() => {});
  const sunRef = useRef(0.5);

  // where the "sun" sits when no lamp is in play: across the wall with the hour
  sunRef.current = st.phase === 'during' ? 0.1 + Math.max(0, Math.min(1, (at.minutes - 360) / (1140 - 360))) * 0.8 : 0.5;

  // live clock + the visitor's device, after hydration
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    const ua = navigator.userAgent;
    const apple = /iPhone|iPad|iPod|Macintosh/.test(ua);
    setPlatform(/Android/i.test(ua) ? 'android' : apple ? 'apple' : 'other');
    setInApp(/FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|; wv\)/i.test(ua));
    try {
      const raw = localStorage.getItem(REMINDED_KEY);
      if (raw) setReminded(JSON.parse(raw));
    } catch {
      /* private mode: reminders just aren't remembered */
    }
    return () => clearInterval(t);
  }, []);

  // entrance (only if the wall starts below the fold) + pause animations when off screen
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = wall.getBoundingClientRect();
    if (!reduce && r.top > window.innerHeight) setAnim('wait');
    const io = new IntersectionObserver(
      ([en]) => {
        wall.toggleAttribute('data-idle', !en.isIntersecting);
        if (en.isIntersecting) setAnim((a) => (a === 'wait' ? 'in' : a));
      },
      { threshold: 0.04 },
    );
    io.observe(wall);
    return () => io.disconnect();
  }, []);

  // the lamp
  useEffect(() => {
    const wall = wallRef.current;
    const light = lightRef.current;
    const glow = glowRef.current;
    const lamp = lampRef.current;
    if (!wall || !light || !glow || !lamp) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let size = { w: wall.clientWidth, h: wall.clientHeight };
    let plaques: { el: HTMLElement; x: number; y: number }[] = [];
    const measure = () => {
      const wr = wall.getBoundingClientRect();
      size = { w: wr.width, h: wr.height };
      plaques = [];
      wall.querySelectorAll<HTMLElement>('.pnw-pw').forEach((pw) => {
        const q = pw.getBoundingClientRect();
        const sh = pw.querySelector<HTMLElement>('.pnw-shadow');
        if (q.width && sh) plaques.push({ el: sh, x: q.left - wr.left + q.width / 2, y: q.top - wr.top + q.height / 2 });
      });
    };
    const rest = () => ({ x: size.w * sunRef.current, y: Math.min(size.h * 0.14, 170) });
    measure();
    let cur = rest();
    let target = { ...cur };
    let raf = 0;
    const paint = () => {
      const t = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`;
      light.style.transform = t;
      glow.style.transform = t;
      for (const p of plaques) {
        const dx = p.x - cur.x;
        const dy = p.y - cur.y;
        const d = Math.hypot(dx, dy) || 1;
        const len = Math.min(15, 4 + d / 65);
        p.el.style.transform = `translate3d(${((dx / d) * len).toFixed(1)}px, ${((dy / d) * len).toFixed(1)}px, 0)`;
      }
    };
    const step = () => {
      cur = { x: cur.x + (target.x - cur.x) * 0.2, y: cur.y + (target.y - cur.y) * 0.2 };
      if (Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) < 0.6) {
        cur = { ...target };
        paint();
        raf = 0;
        return;
      }
      paint();
      raf = requestAnimationFrame(step);
    };
    const goTo = (x: number, y: number) => {
      target = { x, y };
      if (reduce) {
        cur = { ...target };
        paint();
      } else if (!raf) raf = requestAnimationFrame(step);
    };
    // a slow sweep of light across the wall the first time it is drawn
    if (!reduce) {
      cur = { x: -120, y: rest().y };
      paint();
      goTo(rest().x, rest().y);
    } else paint();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || reduce) return;
      const wr = wall.getBoundingClientRect();
      const x = e.clientX - wr.left;
      const y = e.clientY - wr.top;
      lamp.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      wall.setAttribute('data-lamp', '');
      goTo(x, y);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      wall.removeAttribute('data-lamp');
      const r = rest();
      goTo(r.x, r.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const pw = (e.target as HTMLElement | null)?.closest?.('.pnw-pw');
      if (!pw) return;
      const wr = wall.getBoundingClientRect();
      const q = pw.getBoundingClientRect();
      goTo(q.left - wr.left + q.width / 2, q.top - wr.top - 40);
    };
    wall.addEventListener('pointermove', onMove, { passive: true });
    wall.addEventListener('pointerleave', onLeave);
    wall.addEventListener('pointerdown', onDown, { passive: true });
    const ro = new ResizeObserver(() => {
      measure();
      if (!wall.hasAttribute('data-lamp')) {
        const r = rest();
        target = r;
        cur = { ...r };
      }
      paint();
    });
    ro.observe(wall);
    measureRef.current = () => {
      measure();
      paint();
    };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wall.removeEventListener('pointermove', onMove);
      wall.removeEventListener('pointerleave', onLeave);
      wall.removeEventListener('pointerdown', onDown);
    };
  }, []);

  // a different day's plaques are showing (phone / iPad) → re-measure their shadows
  useEffect(() => {
    measureRef.current();
  }, [shownDay]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const markReminded = useCallback((ids: string[], msg: string, close = true) => {
    setReminded((prev) => {
      const next = Array.from(new Set([...prev, ...ids]));
      try {
        localStorage.setItem(REMINDED_KEY, JSON.stringify(next));
      } catch {
        /* fine */
      }
      return next;
    });
    if (close) {
      setSheet(null);
      setToast(msg);
    }
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const closeFlyer = useCallback(() => setFlyerOpen(false), []);

  const pick = (i: number) => {
    setSel((s) => (s === i ? -1 : i));
    if (window.matchMedia('(max-width: 1079px)').matches) setSheet({ ids: [rites[i].id], detail: i });
  };

  // ── what the niche says ──
  const upcomingAnjali = rites.filter((r, i) => r.kind === 'anjali' && !st.past[i] && i !== st.now);
  type Col = { kBn: string; kEn: string; title: string; bn?: string; sub: string };
  let colA: Col;
  let colB: Col | null = null;
  let remindIds: string[] = [];
  if (sel >= 0) {
    const r = rites[sel];
    const p = dayParts(r.date);
    colA = { kBn: '', kEn: `${p.dow} ${p.dd} ${p.mon} · ${timeLabel(r)}`, title: r.name, bn: r.bn, sub: r.note ?? '' };
    remindIds = st.past[sel] || sel === st.now ? [] : [r.id];
  } else if (st.phase === 'before') {
    const r = rites[0];
    const p = dayParts(r.date);
    colA = {
      kBn: 'বোধন',
      kEn: st.daysTo === 1 ? 'Pujo begins tomorrow' : `Pujo begins in ${st.daysTo} days`,
      title: r.name,
      bn: r.bn,
      sub: `${p.dow} ${p.dd} ${p.mon} · ${timeLabel(r)}`,
    };
    if (upcomingAnjali.length) {
      colB = {
        kBn: 'পুষ্পাঞ্জলি',
        kEn: 'Pushpanjali',
        title: upcomingAnjali.map((x) => `${dayParts(x.date).short} ${fmtTime(x.t).replace(':00', '')}`).join(' · '),
        sub: 'Offer flowers with the mantra. Come a few minutes early.',
      };
      remindIds = upcomingAnjali.map((x) => x.id);
    } else remindIds = [r.id];
  } else if (st.phase === 'after') {
    colA = { kBn: 'শুভ বিজয়া', kEn: 'Shubho Bijoya', title: 'Ashche bochor abar hobe', bn: 'আসছে বছর আবার হবে', sub: 'This year’s Pujo is over. See you at the next one.' };
  } else if (st.now >= 0) {
    const r = rites[st.now];
    colA = { kBn: 'এখন মণ্ডপে', kEn: 'Now at the mandap', title: r.name, bn: r.bn, sub: r.end ? `Until ${fmtTime(r.end)}` : `Began at ${fmtTime(r.t)}` };
    if (st.next >= 0) {
      const q = rites[st.next];
      colB = { kBn: 'এরপর', kEn: 'Next', title: q.name, sub: nextWhen(st, rites, at) };
      remindIds = [q.id];
    }
  } else {
    const r = rites[st.next];
    colA = { kBn: 'এরপর', kEn: 'Up next', title: r.name, bn: r.bn, sub: nextWhen(st, rites, at) };
    remindIds = [r.id];
  }
  const isReminded = (ids: string[]) => ids.length > 0 && ids.every((id) => reminded.includes(id));
  const anjaliIds = upcomingAnjali.map((r) => r.id);

  const sheetRites = sheet ? rites.filter((r) => sheet.ids.includes(r.id)) : [];
  const detail = sheet?.detail != null ? rites[sheet.detail] : null;

  return (
    <section
      id="schedule"
      ref={wallRef}
      className="pnw"
      data-anim={anim}
      aria-labelledby="pnw-title"
    >
      <span className="pnw-light" ref={lightRef} aria-hidden="true" />
      <span className="pnw-glow" ref={glowRef} aria-hidden="true" />
      <svg className="pnw-roof" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pnw-roofg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a0e04" />
            <stop offset="1" stopColor="#4f1d0a" />
          </linearGradient>
          <pattern id="pnw-tiles" width="22" height="12" patternUnits="userSpaceOnUse">
            <rect x="9" width="4" height="12" fill="#000" fillOpacity=".3" />
            <rect x="13" width="1.5" height="12" fill="#e29a63" fillOpacity=".14" />
          </pattern>
          <linearGradient id="pnw-bandg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cf7440" />
            <stop offset=".5" stopColor="#a5491f" />
            <stop offset="1" stopColor="#6a2810" />
          </linearGradient>
        </defs>
        <path d="M0 70Q720 -30 1440 70L1440 110Q720 10 0 110Z" fill="url(#pnw-roofg)" />
        <path d="M0 70Q720 -30 1440 70L1440 110Q720 10 0 110Z" fill="url(#pnw-tiles)" />
        <path d="M0 110Q720 10 1440 110L1440 140Q720 40 0 140Z" fill="url(#pnw-bandg)" />
        <path d="M0 70Q720 -30 1440 70" className="pnw-roof-edge" />
        <path d="M0 110Q720 10 1440 110" className="pnw-roof-line" />
        <path d="M0 140Q720 40 1440 140" className="pnw-roof-line pnw-roof-line--deep" />
        <path d="M0 125Q720 25 1440 125" className="pnw-rosette pnw-rosette--a" />
        <path d="M0 125Q720 25 1440 125" className="pnw-rosette pnw-rosette--b" />
        <path d="M0 125Q720 25 1440 125" className="pnw-rosette pnw-rosette--c" />
      </svg>

      <div className="pnw-inner">
        <header className="pnw-head">
          <div className="pnw-eyebrow">
            <span className="bar" />
            <span className="bn">পুজোর নির্ঘণ্ট</span>
            <span>· Durga Puja {days[0]?.date.slice(0, 4)}</span>
            <span className="bar" />
          </div>
          <h2 id="pnw-title" className="pnw-h">
            The Pujo, <em>hour by hour</em>
          </h2>
        </header>

        <div className={`pnw-niche${colB ? '' : ' is-single'}`}>
          <Diya className="pnw-ndiya" />
          <div className="pnw-ncol">
            <span className="pnw-kick">
              {colA.kBn && <span className="bn">{colA.kBn}</span>}
              <span className="en">{colA.kEn}</span>
            </span>
            <span className="pnw-nt">
              {colA.title}
              {colA.bn && <span className="bn">{colA.bn}</span>}
            </span>
            {colA.sub && <span className="pnw-ns">{colA.sub}</span>}
          </div>
          {colB && (
            <div className="pnw-ncol pnw-ncol--b">
              <span className="pnw-kick">
                <span className="bn">{colB.kBn}</span>
                <span className="en">{colB.kEn}</span>
              </span>
              <span className={`pnw-nt${st.phase === 'before' ? ' pnw-nt--sm' : ''}`}>{colB.title}</span>
              <span className="pnw-ns">{colB.sub}</span>
            </div>
          )}
          {(remindIds.length > 0 || sel >= 0) && (
            <div className="pnw-nbtns">
              {remindIds.length > 0 && (
                <button
                  type="button"
                  className={`pnw-btn pnw-btn--solid${isReminded(remindIds) ? ' is-done' : ''}`}
                  onClick={() => setSheet({ ids: remindIds, detail: null })}
                >
                  {isReminded(remindIds) ? <Check /> : <Bell />}
                  {isReminded(remindIds) ? 'In your calendar' : remindIds.length > 1 ? `Remind me of ${allOf(remindIds.length)}` : 'Remind me'}
                </button>
              )}
              {sel >= 0 && (
                <button type="button" className="pnw-x" onClick={() => setSel(-1)} aria-label="Back to what is happening now">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pnw-days" role="group" aria-label="Choose a day">
          {days.map((d, di) => {
            const p = dayParts(d.date);
            return (
              <button
                key={d.date}
                type="button"
                className="pnw-day"
                aria-pressed={di === shownDay}
                onClick={() => {
                  setChosenDay(di);
                  setSel(-1);
                }}
              >
                <span className="dd">{p.dd}</span>
                <span className="dw">
                  {p.short} · {p.mon}
                </span>
                <span className="b">{d.bn}</span>
                {st.phase === 'during' && st.day === di && <span className="pnw-today">Today</span>}
              </button>
            );
          })}
        </div>

        <div className="pnw-rows">
          {days.map((d, di) => {
            const p = dayParts(d.date);
            const list = rites.filter((r) => r.day === di);
            return (
              <div
                key={d.date}
                className={`pnw-row${di === shownDay ? ' is-active' : ''}${list.length > 6 ? ' is-many' : ''}`}
                data-n={Math.min(list.length, 3)}
              >
                <div className="pnw-pillar" aria-hidden="true">
                  <span className="dd">{p.dd}</span>
                  <span className="dw">
                    {p.short} · {p.mon}
                  </span>
                  <span className="b">{d.bn}</span>
                </div>
                <ul className="pnw-plaques" aria-label={`${p.dow} ${p.dd} ${p.mon}${d.en ? ` — ${d.en}` : ''}`}>
                  {list.map((r) => {
                    const i = rites.indexOf(r);
                    const isNow = st.phase === 'during' && st.now === i;
                    const isNext = st.phase === 'during' && st.next === i;
                    const isPast = st.past[i] && !isNow;
                    const badge = isNow ? 'Now' : isNext ? `Next · ${r.date === at.date ? inWords(st.nextIn).replace('in ', '') : 'tomorrow'}` : '';
                    return (
                      <li key={r.id} className="pnw-pw" style={{ '--i': i } as CSSProperties}>
                        <span className="pnw-shadow" aria-hidden="true" />
                        <button
                          type="button"
                          className={`pnw-plaque${isNow ? ' is-now' : ''}${isPast ? ' is-past' : ''}${sel === i ? ' is-sel' : ''}`}
                          onClick={() => pick(i)}
                          aria-pressed={sel === i}
                          aria-label={`${p.dow} ${timeLabel(r)}, ${r.name}${isNow ? ', happening now' : isPast ? ', finished' : ''}`}
                        >
                          {r.kind === 'anjali' && (
                            <svg className="pnw-garland" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                              <path d="M4 3Q50 31 96 3" className="g1" />
                              <path d="M4 3Q50 31 96 3" className="g2" />
                              <path d="M4 3Q50 31 96 3" className="g3" />
                            </svg>
                          )}
                          <Icon d={ICON_PATHS[iconFor(r)]} className="pnw-ico" />
                          <span className="pnw-txt">
                            <span className="pnw-time">{timeLabel(r)}</span>
                            <span className="pnw-name">{r.name}</span>
                            {r.bn && (
                              <span className="pnw-bn" lang="bn">
                                {r.bn}
                              </span>
                            )}
                          </span>
                          {badge && <span className={`pnw-badge${isNow ? ' is-now' : ''}`}>{badge}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="pnw-foot">
          <span className="pnw-hint">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f6c25e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 14c0 4 4.5 6 10 6s10-2 10-6c-3 1.2-6.2 1.8-10 1.8S5 15.2 2 14z" />
              <path d="M12 12.5c-2 0-3-2-1.7-3.9L12 4.5l1.7 4.1c1.3 1.9.3 3.9-1.7 3.9z" />
            </svg>
            <span className="pnw-hint--mouse">Move your lamp across the wall · click a plaque for details</span>
            <span className="pnw-hint--touch">Tap a plaque for details and a reminder</span>
          </span>
          <div className="pnw-actions">
            {anjaliIds.length > 0 && st.phase !== 'after' && (
              <button
                type="button"
                className={`pnw-btn pnw-btn--ghost pnw-btn--wide${isReminded(anjaliIds) ? ' is-done' : ''}`}
                onClick={() => setSheet({ ids: anjaliIds, detail: null })}
              >
                {isReminded(anjaliIds) ? <Check /> : <Bell />}
                {isReminded(anjaliIds)
                  ? 'Pushpanjali in your calendar'
                  : anjaliIds.length > 1
                    ? `Remind me of ${allOf(anjaliIds.length)} Pushpanjalis`
                    : 'Remind me of the Pushpanjali'}
              </button>
            )}
            {flyer?.src && (
              <button
                type="button"
                className="pnw-btn pnw-btn--solid"
                onClick={() => setFlyerOpen(true)}
                onPointerEnter={() => {
                  const im = new Image();
                  im.src = flyer.src;
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M9 8h6M9 12h6M9 16h4" />
                </svg>
                See the full flyer
              </button>
            )}
            {flyer?.download && (
              <a className="pnw-btn pnw-btn--ghost" href={flyer.download} download={flyer.fileName}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                </svg>
                Download
              </a>
            )}
          </div>
        </div>
        <div className="pnw-toast" role="status" aria-live="polite">
          {toast}
        </div>
      </div>

      <span className="pnw-lamp" ref={lampRef} aria-hidden="true">
        <Diya />
      </span>

      {sheet && sheetRites.length > 0 && (
        <RemindSheet
          rites={sheetRites}
          detail={detail}
          platform={platform}
          inApp={inApp}
          venue={venue}
          pageUrl={pageUrl}
          canRemind={!detail || !(st.past[sheet.detail ?? -1] || sheet.detail === st.now)}
          onDone={markReminded}
          onClose={closeSheet}
        />
      )}
      {flyerOpen && flyer?.src && <FlyerViewer flyer={flyer} onClose={closeFlyer} />}
    </section>
  );
}

// ── "Remind me" ─────────────────────────────────────────────────────────────

function RemindSheet({
  rites,
  detail,
  platform,
  inApp,
  venue,
  pageUrl,
  canRemind,
  onDone,
  onClose,
}: {
  rites: FlatRite[];
  detail: FlatRite | null;
  platform: Platform;
  inApp: boolean;
  venue: string | null;
  pageUrl: string;
  canRemind: boolean;
  onDone: (ids: string[], msg: string, close?: boolean) => void;
  onClose: () => void;
}) {
  const [added, setAdded] = useState<string[]>([]);
  useModalLock(true, onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  const ids = rites.map((r) => r.id);
  const ics = `/api/pujo-schedule/calendar?ids=${ids.join(',')}`;
  const many = rites.length > 1;
  const details = (r: FlatRite) => [r.note, `All timings: ${pageUrl}`].filter(Boolean).join('\n\n');
  const head = detail ?? rites[0];
  const hp = dayParts(head.date);

  const apple = (
    <a key="apple" className="pnw-opt" href={ics} onClick={() => onDone(ids, 'Opening your calendar…')}>
      <span className="pnw-opt-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        </svg>
      </span>
      <span className="pnw-opt-txt">
        <b>Apple Calendar</b>
        <span>iPhone, iPad or Mac · alerts you 30 min before</span>
      </span>
    </a>
  );
  const google = many ? (
    <div key="google" className="pnw-opt pnw-opt--multi">
      <span className="pnw-opt-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5h6" />
        </svg>
      </span>
      <span className="pnw-opt-txt">
        <b>Google Calendar</b>
        <span>Google adds one at a time:</span>
        <span className="pnw-opt-links">
          {rites.map((r) => (
            <a
              key={r.id}
              href={googleCalendarUrl(r, { location: venue, details: details(r) })}
              target="_blank"
              rel="noopener noreferrer"
              className={added.includes(r.id) ? 'is-done' : ''}
              onClick={() => {
                setAdded((a) => [...a, r.id]);
                onDone([r.id], '', false);
              }}
            >
              {added.includes(r.id) ? '✓ ' : ''}
              {dayParts(r.date).short} {fmtTime(r.t)}
            </a>
          ))}
        </span>
      </span>
    </div>
  ) : (
    <a
      key="google"
      className="pnw-opt"
      href={googleCalendarUrl(rites[0], { location: venue, details: details(rites[0]) })}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onDone(ids, 'Google Calendar opened in a new tab — tap Save there')}
    >
      <span className="pnw-opt-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5h6" />
        </svg>
      </span>
      <span className="pnw-opt-txt">
        <b>Google Calendar</b>
        <span>{platform === 'android' ? 'Android phones · uses your usual reminder' : 'Gmail and Android · uses your usual reminder'}</span>
      </span>
    </a>
  );
  const other = (
    <a key="other" className="pnw-opt" href={`${ics}&dl=1`} download onClick={() => onDone(ids, 'Calendar file downloaded — open it to add')}>
      <span className="pnw-opt-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      </span>
      <span className="pnw-opt-txt">
        <b>{platform === 'android' ? 'Another calendar app' : platform === 'apple' ? 'Outlook or another calendar' : 'Outlook or Apple Calendar'}</b>
        <span>Downloads a calendar file (.ics) · alerts 30 min before</span>
      </span>
    </a>
  );
  const options = platform === 'apple' ? [apple, google, other] : [google, other];

  return createPortal(
    <div className="pnw-modal pnw-modal--sheet" onClick={onClose}>
      <div className="pnw-sheet" role="dialog" aria-modal="true" aria-labelledby="pnw-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="pnw-sheet-head">
          <span className="pnw-sheet-kick">{detail ? `${hp.dow} ${hp.dd} ${hp.mon} · ${timeLabel(detail)}` : 'Remind me'}</span>
          <h3 id="pnw-sheet-title">{many ? `${rites.length === 2 ? 'Both' : `All ${rites.length}`} Pushpanjalis` : head.name}</h3>
          {!many && head.bn && (
            <span className="pnw-sheet-bn" lang="bn">
              {head.bn}
            </span>
          )}
          {detail?.note && <p className="pnw-sheet-note">{detail.note}</p>}
          {!detail && !many && (
            <p className="pnw-sheet-note">
              {hp.dow} {hp.dd} {hp.mon} · {timeLabel(head)}
            </p>
          )}
          {many && (
            <ul className="pnw-sheet-list">
              {rites.map((r) => {
                const p = dayParts(r.date);
                return (
                  <li key={r.id}>
                    <b>
                      {p.short} {p.dd} {p.mon} · {timeLabel(r)}
                    </b>{' '}
                    {r.name}
                  </li>
                );
              })}
            </ul>
          )}
          <button ref={closeRef} type="button" className="pnw-sheet-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {canRemind ? (
          <>
            <p className="pnw-sheet-sub">Add it to your calendar and your phone will remind you:</p>
            <div className="pnw-opts">{options}</div>
            {inApp && (
              <p className="pnw-sheet-fine">
                Opened this page from Facebook, Instagram or WhatsApp? If nothing happens, open it in Safari or Chrome first.
              </p>
            )}
            <p className="pnw-sheet-fine">Nothing is saved on our side — the reminder lives in your own calendar.</p>
          </>
        ) : (
          <p className="pnw-sheet-sub">This one has already begun.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── the flyer ───────────────────────────────────────────────────────────────

function FlyerViewer({ flyer, onClose }: { flyer: PublicFlyer; onClose: () => void }) {
  useModalLock(true, onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  return createPortal(
    <div className="pnw-modal pnw-modal--flyer" onClick={onClose}>
      <div className="pnw-flyer" role="dialog" aria-modal="true" aria-label="The Pujo Nirghonto flyer" onClick={(e) => e.stopPropagation()}>
        <div className="pnw-flyer-frame" style={{ aspectRatio: `${flyer.width} / ${flyer.height}`, '--r': flyer.width / flyer.height } as CSSProperties}>
          {!loaded && <span className="pnw-flyer-wait">Loading the flyer…</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={flyer.src}
            width={flyer.width}
            height={flyer.height}
            alt="The committee’s Pujo Nirghonto flyer with every ritual and its time"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={loaded ? 'is-loaded' : ''}
          />
        </div>
        <div className="pnw-flyer-acts">
          {flyer.download && (
            <a className="pnw-btn pnw-btn--solid" href={flyer.download} download={flyer.fileName}>
              Download the flyer
            </a>
          )}
          <a className="pnw-btn pnw-btn--ghost" href={flyer.src} target="_blank" rel="noopener noreferrer">
            Open full size
          </a>
          <button ref={closeRef} type="button" className="pnw-btn pnw-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
