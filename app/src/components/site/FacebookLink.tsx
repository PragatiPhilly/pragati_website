import { site } from "@/config/site";
import styles from "./FacebookLink.module.css";

/**
 * Facebook link — the official logo with a glint of light that sweeps across
 * it every few seconds; on hover it pops and shines again.
 * Pure CSS (no client JS). The logo itself is never recoloured or rotated.
 * Motion is switched off for visitors who ask for reduced motion.
 *
 * `label` adds text beside the icon (used in the mobile menu).
 */
export default function FacebookLink({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={site.facebookUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.link} ${label ? styles.withLabel : ""} ${className}`}
      aria-label={label ? undefined : "Pragati on Facebook (opens in a new tab)"}
      title="Pragati on Facebook"
    >
      <span className={styles.icon} aria-hidden>
        <span className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/facebook.png" alt="" width={34} height={34} />
        </span>
        <span className={styles.glint} />
      </span>
      {label && (
        <span>
          {label} <span aria-hidden>↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      )}
    </a>
  );
}
