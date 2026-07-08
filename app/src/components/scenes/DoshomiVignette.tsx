/** Ported from the approved prototype (pragati.html). */
export default function DoshomiVignette({ className }: { className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: SVG }} />;
}

const SVG = `<svg viewBox="0 0 320 260" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="160" cy="150" rx="160" ry="90" fill="#C8102E" opacity="0.1"/>
  <g>
    <path d="M30 255 Q40 155 88 155 Q136 155 146 255 Z" fill="#C8102E"/>
    <path d="M30 248 Q88 260 146 248" stroke="#E8A93C" stroke-width="3" fill="none"/>
    <ellipse cx="88" cy="160" rx="24" ry="3.5" fill="#E8A93C"/>
    <path d="M68 158 Q88 144 108 158 Q116 166 88 170 Q60 166 68 158 Z" fill="#8e0a20"/>
    <path d="M70 165 Q60 188 90 200" stroke="#f4c89e" stroke-width="13" fill="none" stroke-linecap="round"/>
    <ellipse cx="92" cy="202" rx="14" ry="7" fill="#f4c89e"/>
    <path d="M108 158 Q160 130 200 100" stroke="#f4c89e" stroke-width="13" fill="none" stroke-linecap="round"/>
    <ellipse cx="200" cy="100" rx="10" ry="8" fill="#f4c89e"/>
    <circle cx="210" cy="86" r="3.5" fill="#C8102E"/>
    <circle cx="205" cy="82" r="3.5" fill="#C8102E"/>
    <rect x="82" y="128" width="12" height="14" fill="#f4c89e"/>
    <ellipse cx="88" cy="115" rx="17" ry="21" fill="#f4c89e"/>
    <circle cx="88" cy="86" r="9" fill="#1a0a14"/>
    <circle cx="78" cy="84" r="3.5" fill="#E8A93C"/>
    <rect x="86" y="90" width="4" height="13" fill="#C8102E"/>
    <circle cx="88" cy="105" r="2" fill="#C8102E"/>
    <ellipse cx="82" cy="115" rx="2.2" ry="1.5" fill="#fff"/><ellipse cx="94" cy="115" rx="2.2" ry="1.5" fill="#fff"/>
    <circle cx="82" cy="115" r="1.1" fill="#0a0a14"/><circle cx="94" cy="115" r="1.1" fill="#0a0a14"/>
    <path d="M83 125 Q88 128 93 125" stroke="#8e0a20" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>
  <g>
    <path d="M180 255 Q190 155 232 155 Q274 155 284 255 Z" fill="#C8102E"/>
    <path d="M180 248 Q232 260 284 248" stroke="#E8A93C" stroke-width="3" fill="none"/>
    <ellipse cx="232" cy="160" rx="24" ry="3.5" fill="#E8A93C"/>
    <path d="M212 158 Q232 144 252 158 Q260 166 232 170 Q204 166 212 158 Z" fill="#8e0a20"/>
    <path d="M220 168 Q200 188 130 200" stroke="#f4c89e" stroke-width="13" fill="none" stroke-linecap="round"/>
    <ellipse cx="128" cy="200" rx="14" ry="7" fill="#f4c89e"/>
    <rect x="226" y="128" width="12" height="14" fill="#f4c89e"/>
    <ellipse cx="232" cy="110" rx="17" ry="21" fill="#f4c89e"/>
    <circle cx="232" cy="81" r="9" fill="#1a0a14"/>
    <circle cx="222" cy="79" r="3.5" fill="#E8A93C"/>
    <rect x="228" y="85" width="8" height="15" fill="#C8102E"/>
    <ellipse cx="232" cy="100" rx="6" ry="3" fill="#C8102E"/>
    <circle cx="232" cy="102" r="2.5" fill="#C8102E"/>
    <ellipse cx="220" cy="116" rx="3.5" ry="2.5" fill="#C8102E" opacity="0.6"/>
    <ellipse cx="244" cy="116" rx="3.5" ry="2.5" fill="#C8102E" opacity="0.6"/>
    <path d="M223 113 Q227 110 231 113" stroke="#0a0a14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M233 113 Q237 110 241 113" stroke="#0a0a14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M223 124 Q232 130 241 124" stroke="#8e0a20" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </g>
  <g>
    <ellipse cx="110" cy="200" rx="32" ry="7" fill="#E8A93C"/>
    <ellipse cx="110" cy="194" rx="22" ry="5" fill="#C8102E"/>
    <ellipse cx="110" cy="191" rx="16" ry="4" fill="#8e0a20"/>
  </g>
  <g fill="#C8102E">
    <circle cx="110" cy="180" r="4">
      <animate attributeName="cy" values="185;120;185" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.7;0;0.7" dur="3s" repeatCount="indefinite"/>
    </circle>
    <circle cx="100" cy="180" r="3">
      <animate attributeName="cy" values="185;110;185" dur="3.4s" begin="0.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.6;0;0.6" dur="3.4s" begin="0.5s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>


`;
