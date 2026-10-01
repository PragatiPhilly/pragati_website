import type { Caterer } from "@/lib/caterer";
import styles from "./CatererSign.module.css";

/**
 * The caterer's signboard, hung on a brass nail under the menu heading —
 * a wooden frame around the logo, two jute strings, a slow sway.
 * Pure CSS (no client JS); still for anyone who prefers reduced motion.
 */
export default function CatererSign({ caterer }: { caterer: Caterer }) {
  const board = (
    <>
      <span className={styles.plate}>
        <span className={styles.bn}>হেঁশেলের দায়িত্বে</span>
        <span className={styles.dot} aria-hidden>
          ·
        </span>
        <span className={styles.en}>Pujo kitchen by</span>
      </span>
      <span className={styles.slate}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={caterer.logo.src}
          alt={caterer.name}
          width={caterer.logo.width}
          height={caterer.logo.height}
          loading="lazy"
          decoding="async"
        />
      </span>
    </>
  );

  return (
    <div className={styles.wrap}>
      <span className={styles.nail} aria-hidden />
      <div className={styles.hanger}>
        <svg className={styles.strings} viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden>
          <path d="M150 4 L18 42" />
          <path d="M150 4 L282 42" />
        </svg>
        {caterer.url ? (
          <a
            className={styles.board}
            href={caterer.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Pujo kitchen by ${caterer.name} (opens their website in a new tab)`}
          >
            {board}
          </a>
        ) : (
          <div className={styles.board} role="img" aria-label={`Pujo kitchen by ${caterer.name}`}>
            {board}
          </div>
        )}
      </div>
    </div>
  );
}
