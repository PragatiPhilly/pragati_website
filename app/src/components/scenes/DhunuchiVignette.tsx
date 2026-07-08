/** Ported from the approved prototype (pragati.html). */
export default function DhunuchiVignette({ className }: { className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: SVG }} />;
}

const SVG = `<svg viewBox="0 0 200 260" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="170" rx="80" ry="50" fill="#E8A93C" opacity="0.12"/>
  <path d="M55 250 Q60 160 100 160 Q140 160 145 250 Z" fill="#C8102E"/>
  <path d="M55 244 Q100 254 145 244" stroke="#E8A93C" stroke-width="2.5" fill="none"/>
  <ellipse cx="100" cy="165" rx="20" ry="3" fill="#E8A93C"/>
  <path d="M82 160 Q100 150 118 160 Q124 168 100 170 Q76 168 82 160 Z" fill="#8e0a20"/>
  <path d="M85 158 Q60 130 40 90" stroke="#f4c89e" stroke-width="9" fill="none" stroke-linecap="round"/>
  <path d="M115 158 Q140 130 160 90" stroke="#f4c89e" stroke-width="9" fill="none" stroke-linecap="round"/>
  <rect x="95" y="125" width="10" height="10" fill="#f4c89e"/>
  <ellipse cx="100" cy="115" rx="14" ry="17" fill="#f4c89e"/>
  <circle cx="100" cy="92" r="9" fill="#1a0a14"/>
  <circle cx="92" cy="89" r="3" fill="#E8A93C"/><circle cx="92" cy="89" r="1.2" fill="#C8102E"/>
  <circle cx="100" cy="106" r="2" fill="#C8102E"/>
  <ellipse cx="94" cy="115" rx="2" ry="1.4" fill="#fff"/><ellipse cx="106" cy="115" rx="2" ry="1.4" fill="#fff"/>
  <circle cx="94" cy="115" r="0.9" fill="#0a0a14"/><circle cx="106" cy="115" r="0.9" fill="#0a0a14"/>
  <path d="M95 125 Q100 128 105 125" stroke="#8e0a20" stroke-width="1" fill="none" stroke-linecap="round"/>
  <g>
    <path d="M22 92 Q40 70 58 92 Q52 102 40 102 Q28 102 22 92 Z" fill="#8e0a20"/>
    <ellipse cx="40" cy="89" rx="17" ry="3.5" fill="#E8A93C"/>
    <circle cx="40" cy="87" r="6" fill="#F6C95E"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite"/></circle>
    <g>
      <circle class="smoke" cx="40" cy="80" r="4" fill="#fff" opacity="0.45"/>
      <circle class="smoke d2" cx="36" cy="74" r="3.5" fill="#fff" opacity="0.35"/>
      <circle class="smoke d3" cx="44" cy="68" r="3" fill="#fff" opacity="0.3"/>
    </g>
  </g>
  <g>
    <path d="M142 92 Q160 70 178 92 Q172 102 160 102 Q148 102 142 92 Z" fill="#8e0a20"/>
    <ellipse cx="160" cy="89" rx="17" ry="3.5" fill="#E8A93C"/>
    <circle cx="160" cy="87" r="6" fill="#F6C95E"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" begin="0.6s" repeatCount="indefinite"/></circle>
    <g>
      <circle class="smoke" cx="160" cy="80" r="4" fill="#fff" opacity="0.45"/>
      <circle class="smoke d2" cx="156" cy="74" r="3.5" fill="#fff" opacity="0.35"/>
      <circle class="smoke d3" cx="164" cy="68" r="3" fill="#fff" opacity="0.3"/>
    </g>
  </g>
</svg>


`;
