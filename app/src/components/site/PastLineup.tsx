import MediaImg, { type PhotoData } from './MediaImg';

/**
 * The lineup once the festival is over (thank-you mode, spec/16 + 17): the
 * two full-height concert posters shrink to a compact "who played" strip —
 * a small poster thumbnail (tap to see it full size) beside the artist and
 * the night they played.
 */
export type PastAct = {
  artist?: string;
  when?: string;
  /** static poster in /public … */
  src?: string;
  /** … or one from the Media Library */
  photo?: PhotoData;
};

export default function PastLineup({ acts }: { acts: PastAct[] }) {
  if (acts.length === 0) return null;
  return (
    <ul
      className={`grid gap-4 mx-auto ${acts.length > 1 ? 'sm:grid-cols-2 max-w-3xl' : 'max-w-md'}`}
    >
      {acts.map((a, i) => (
        <li
          key={a.src ?? a.photo?.fileBase ?? i}
          className="festive-card past-act flex items-center gap-4 p-3 pr-5"
        >
          <a
            href={a.src ?? undefined}
            target={a.src ? '_blank' : undefined}
            rel="noreferrer"
            className="past-act-thumb relative shrink-0 w-[76px] h-[114px] rounded-xl overflow-hidden"
            style={{ background: '#14100a', boxShadow: '0 8px 22px rgba(0,0,0,0.3)' }}
            aria-label={a.artist ? `${a.artist} poster (opens full size)` : 'Event poster'}
          >
            {a.photo ? (
              <MediaImg photo={a.photo} fit="cover" sizes="76px" alt={a.artist ?? 'Event poster'} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.src}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            )}
          </a>
          <div className="min-w-0">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: 'var(--accent)' }}
            >
              ★ Performed live
            </p>
            {a.artist && (
              <p className="font-[family-name:var(--font-display)] text-lg font-bold leading-snug mt-0.5">
                {a.artist}
              </p>
            )}
            {a.when && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                {a.when}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
