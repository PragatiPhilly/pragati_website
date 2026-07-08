/** Kola bou (banana bride) — ported from the approved prototype. */
export default function KolaBou({ flip = false, className }: { flip?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 120 280" xmlns="http://www.w3.org/2000/svg" className={className} style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      {/* pot */}
      <ellipse cx="60" cy="270" rx="32" ry="6" fill="#5a3a1e" />
      <path d="M30 250 Q30 270 60 274 Q90 270 90 250 Z" fill="#8B5A2B" />
      <ellipse cx="60" cy="250" rx="30" ry="5" fill="#A8754A" />
      {/* red saree wrap */}
      <rect x="48" y="160" width="24" height="92" fill="#C8102E" />
      <path d="M48 245 Q60 252 72 245" stroke="#E8A93C" strokeWidth="2" fill="none" />
      <path d="M48 230 Q60 234 72 230" stroke="#E8A93C" strokeWidth="1.2" fill="none" />
      <rect x="46" y="160" width="28" height="6" fill="#E8A93C" />
      {/* stem */}
      <rect x="56" y="80" width="8" height="80" fill="#7BA05B" />
      {/* banana leaves */}
      <g>
        <ellipse className="banana-leaf" cx="58" cy="60" rx="44" ry="20" fill="#7BA05B" transform="rotate(-20 58 60)" />
        <ellipse className="banana-leaf d2" cx="62" cy="50" rx="44" ry="18" fill="#4D7340" transform="rotate(15 62 50)" />
        <ellipse className="banana-leaf d3" cx="60" cy="40" rx="40" ry="16" fill="#7BA05B" transform="rotate(-5 60 40)" />
        <line x1="14" y1="60" x2="102" y2="60" stroke="#4D7340" strokeWidth="0.6" opacity="0.6" transform="rotate(-20 58 60)" />
      </g>
      {/* banana bunch */}
      <g>
        <ellipse cx="74" cy="100" rx="3" ry="8" fill="#F6C95E" transform="rotate(15 74 100)" />
        <ellipse cx="78" cy="105" rx="3" ry="8" fill="#F6C95E" transform="rotate(15 78 105)" />
        <ellipse cx="82" cy="110" rx="3" ry="8" fill="#E8A93C" transform="rotate(20 82 110)" />
      </g>
      {/* marigolds at base */}
      <circle cx="34" cy="270" r="5" fill="#E8A93C" />
      <circle cx="34" cy="270" r="2.5" fill="#C8102E" />
      <circle cx="86" cy="270" r="5" fill="#E8A93C" />
      <circle cx="86" cy="270" r="2.5" fill="#C8102E" />
    </svg>
  );
}
