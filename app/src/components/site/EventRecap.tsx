import CountUp from '@/components/site/CountUp';
import type { Recap } from '@/lib/season-model';

/**
 * The thank-you card that takes the countdown's place once an event is over
 * (thank-you mode — spec/16-post-event-mode.md). Same frame as PujoCountdown
 * so the homepage layout doesn't shift; words and numbers come from Settings.
 */
export default function EventRecap({
  recap,
  dates,
  className = '',
}: {
  recap: Recap;
  /** e.g. "Oct 9–11 · Greater Philadelphia Expo Center" */
  dates?: string;
  className?: string;
}) {
  const cols =
    recap.stats.length >= 4
      ? 'grid-cols-2 md:grid-cols-4'
      : recap.stats.length === 3
        ? 'grid-cols-3'
        : recap.stats.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-1';
  return (
    <div
      className={`festive-card pujo-countdown relative px-6 md:px-9 pt-7 pb-4 text-center ${className}`}
      role="group"
      aria-label={recap.title}
    >
      <div className="pc-tab absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.22em]">
        <span aria-hidden>🪔</span>
        <span>{recap.kicker}</span>
      </div>

      {recap.titleBn && (
        <p
          className="font-[family-name:var(--font-bangla)] text-lg md:text-xl leading-snug"
          style={{ color: 'var(--accent)' }}
          lang="bn"
        >
          {recap.titleBn}
        </p>
      )}
      <p className="font-[family-name:var(--font-serif)] text-xl md:text-2xl font-semibold mt-1">
        {recap.title}
      </p>

      {recap.stats.length > 0 && (
        <dl className={`grid ${cols} gap-x-6 gap-y-3 mt-4`}>
          {recap.stats.map((s) => (
            <div key={s.label + s.text} className="min-w-[5.5rem]">
              <dt className="sr-only">{s.label}</dt>
              <dd
                className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black leading-none"
                style={{ color: 'var(--sindoor)' }}
              >
                {s.n === null ? (
                  s.text
                ) : (
                  <>
                    {s.prefix}
                    <CountUp to={s.n} suffix={s.suffix} />
                  </>
                )}
              </dd>
              <dd
                className="text-[11px] uppercase tracking-[0.14em] font-semibold mt-1.5"
                style={{ color: 'var(--ink-soft)' }}
                aria-hidden
              >
                {s.label}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {dates && (
        <p className="pc-foot mt-3 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          {dates}
        </p>
      )}
    </div>
  );
}
