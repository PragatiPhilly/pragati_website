import Countdown from '@/components/site/Countdown';

/**
 * Labelled frame around the homepage <Countdown>. Presentation only — the
 * ticking logic and its target (event.startsAt) live untouched in Countdown.
 * Exists so visitors don't mistake the timer for a registration deadline.
 */

const PUJO_THEMES = new Set(['durga', 'kali', 'saraswati']);
const TZ = 'America/New_York';

function dayLabel(d: Date) {
  return d.toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Tiny dhaak with two tapping sticks (sticks still under reduced motion). */
function Dhaak() {
  return (
    <svg
      viewBox="0 0 30 22"
      width="22"
      height="16"
      aria-hidden
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line className="pc-stick-l" x1="10" y1="7" x2="4" y2="1.5" />
      <line className="pc-stick-r" x1="20" y1="7" x2="26" y2="1.5" />
      <ellipse cx="15" cy="9" rx="9" ry="2.6" />
      <path d="M6 9v8.2c0 1.5 4 2.7 9 2.7s9-1.2 9-2.7V9" />
      <path d="M6.5 11.5l3 5.5 3-5.5 2.5 5.5 3-5.5 2.5 5.5 3-5.5" strokeWidth="1" />
    </svg>
  );
}

export default function PujoCountdown({
  name,
  theme,
  startsAt,
  endsAt,
  now,
  className = '',
}: {
  name: string;
  theme?: string | null;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  className?: string;
}) {
  const isPujo = PUJO_THEMES.has(theme ?? '');
  const started = startsAt.getTime() <= now.getTime();
  const begins = dayLabel(startsAt);
  const ends = dayLabel(endsAt);

  const tab = started
    ? isPujo
      ? 'Pujo is here'
      : 'Happening now'
    : `Countdown to ${name}`;

  return (
    <div
      className={`festive-card pujo-countdown relative px-6 md:px-9 pt-7 pb-4 text-center ${className}`}
      role="group"
      aria-label={started ? `${name} is on now` : `Countdown to ${name}, begins ${begins}`}
    >
      {/* ribbon tab sitting on the card's top edge */}
      <div className="pc-tab absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.22em]">
        <Dhaak />
        <span>{tab}</span>
      </div>

      {started ? (
        <>
          {isPujo && (
            <p
              className="font-[family-name:var(--font-bangla)] text-lg md:text-xl leading-snug"
              style={{ color: 'var(--accent)' }}
              lang="bn"
            >
              ঢাকে কাঠি পড়েছে!
            </p>
          )}
          <p className="font-[family-name:var(--font-serif)] text-xl md:text-2xl font-semibold mt-1">
            {isPujo ? 'The dhaak is playing — come join us' : `${name} is on — come join us`}
          </p>
          <p className="pc-foot mt-2 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
            through {ends}
          </p>
        </>
      ) : (
        <>
          {isPujo && (
            <p
              className="font-[family-name:var(--font-bangla)] text-base md:text-lg leading-snug mb-1.5"
              style={{ color: 'var(--accent)' }}
              lang="bn"
            >
              ঢাকে কাঠি পড়তে আর মাত্র
            </p>
          )}
          <div className="flex justify-center">
            <Countdown target={startsAt.toISOString()} />
          </div>
          <p className="pc-foot mt-2.5 text-[12px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            {isPujo ? (
              <>
                till the first beat of the dhaak <span aria-hidden>·</span>{' '}
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                  Pujo begins {begins}
                </span>
              </>
            ) : (
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                Begins {begins}
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
