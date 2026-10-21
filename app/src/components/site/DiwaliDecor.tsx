/**
 * Diwali dressing for the Kali Pujo hero (spec/17) — pure SVG + CSS, no JS:
 *  - StringLights: festoon bulbs swagging across the top, twinkling in a chase
 *  - Kandils:      two akash-kandil paper lanterns swaying on their strings
 *  - DiyaRow:      a row of clay diyas along the bottom, each flame alive
 *  - Rangoli:      a slow-turning rangoli mandala behind the hero photo
 * Animations live in styles/kali.css and stop for prefers-reduced-motion.
 */

const BULB = ["#ffd98a", "#ff5a73", "#7cf0b0", "#fff3c4", "#ff9b3d", "#c7a6ff"];

/** Points along three sagging swags (quadratic curves) across 1200 units. */
function swagPoints(perSwag: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const swags = 3, w = 1200 / swags;
  for (let s = 0; s < swags; s++) {
    // same curve as the drawn wire: M x0 4  Q cx 96  x1 4
    const x0 = s * w, x1 = x0 + w, cx = x0 + w / 2;
    for (let i = 1; i < perSwag; i++) {
      const t = i / perSwag;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * 4 + 2 * (1 - t) * t * 96 + t * t * 4;
      out.push({ x, y });
    }
  }
  return out;
}

export function StringLights() {
  const pts = swagPoints(13);
  return (
    <svg className="diwali-lights" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden>
      {[0, 1, 2].map((s) => (
        <path
          key={s}
          d={`M${s * 400} 4 Q${s * 400 + 200} 96 ${s * 400 + 400} 4`}
          fill="none"
          stroke="rgba(246,201,94,0.35)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {pts.map((p, i) => (
        <circle
          key={i}
          className="diwali-bulb"
          cx={p.x}
          cy={p.y + 3}
          r="3.2"
          fill={BULB[i % BULB.length]}
          style={{ animationDelay: `${(i % 12) * 0.18}s`, color: BULB[i % BULB.length] }}
        />
      ))}
    </svg>
  );
}

function Kandil({ hue }: { hue: "red" | "gold" }) {
  const body = hue === "red" ? "#d4102e" : "#e8a93c";
  const glow = hue === "red" ? "#ff8a5c" : "#fff3c4";
  return (
    <svg viewBox="0 0 60 150" width="60" height="150">
      <line x1="30" y1="0" x2="30" y2="40" stroke="rgba(246,201,94,0.55)" strokeWidth="1.2" />
      <g className="kandil-glow">
        <polygon points="30,40 50,58 50,84 30,102 10,84 10,58" fill={body} />
        <polygon points="30,48 43,60 43,82 30,94 17,82 17,60" fill={glow} opacity="0.9" />
        <polygon points="30,40 50,58 30,62 10,58" fill="#fff" opacity="0.18" />
        <line x1="30" y1="40" x2="30" y2="102" stroke="#8e0a20" strokeWidth="0.8" opacity="0.6" />
      </g>
      {[16, 24, 30, 36, 44].map((x, i) => (
        <line key={x} x1={x} y1="98" x2={x} y2={126 + (i % 2) * 8} stroke={body} strokeWidth="1.4" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function Kandils() {
  return (
    <>
      <div className="diwali-kandil left" aria-hidden>
        <Kandil hue="red" />
      </div>
      <div className="diwali-kandil right" aria-hidden>
        <Kandil hue="gold" />
      </div>
    </>
  );
}

function Diya({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 64 48" width="44" height="33">
      <ellipse cx="32" cy="42" rx="22" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M6 28 C10 44 54 44 58 28 Z" fill="#b5532c" />
      <path d="M6 28 C14 33 50 33 58 28 C50 30 14 30 6 28 Z" fill="#e8834a" />
      <path d="M58 28 L63 25" stroke="#b5532c" strokeWidth="3" strokeLinecap="round" />
      <circle cx="18" cy="35" r="1.6" fill="#f6c95e" />
      <circle cx="32" cy="37" r="1.6" fill="#f6c95e" />
      <circle cx="46" cy="35" r="1.6" fill="#f6c95e" />
      <g className="diya-flame-k" style={{ animationDelay: `${(i * 0.37) % 1.6}s` }}>
        <ellipse cx="60" cy="16" rx="9" ry="12" fill="rgba(255,190,90,0.35)" />
        <path d="M60 24 C54 18 57 10 60 3 C63 10 66 18 60 24 Z" fill="#ffb347" />
        <path d="M60 23 C57 19 58 14 60 9 C62 14 63 19 60 23 Z" fill="#fff3c4" />
      </g>
    </svg>
  );
}

export function DiyaRow({ count = 9 }: { count?: number }) {
  return (
    <div className="diwali-diyas" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="diwali-diya">
          <Diya i={i} />
        </span>
      ))}
    </div>
  );
}

export function Rangoli() {
  const petals = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg className="diwali-rangoli" viewBox="-100 -100 200 200" aria-hidden>
      <circle r="96" fill="none" stroke="rgba(246,201,94,0.35)" strokeWidth="1" strokeDasharray="2 5" />
      <circle r="84" fill="none" stroke="rgba(224,40,74,0.4)" strokeWidth="1.2" />
      {petals.map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d="M0 -82 C10 -66 10 -50 0 -40 C-10 -50 -10 -66 0 -82 Z"
          fill="none"
          stroke={a % 45 === 0 ? "rgba(246,201,94,0.55)" : "rgba(224,40,74,0.45)"}
          strokeWidth="1.2"
        />
      ))}
      {petals.map((a) => (
        <circle key={`d${a}`} transform={`rotate(${a + 11.25})`} cx="0" cy="-60" r="2.4" fill="rgba(246,201,94,0.6)" />
      ))}
      <circle r="34" fill="none" stroke="rgba(246,201,94,0.4)" strokeWidth="1" />
    </svg>
  );
}
