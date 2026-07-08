/** Ported from the approved prototype (pragati.html). */
export default function KalashVignette({ className }: { className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: SVG }} />;
}

const SVG = `  <defs>
    <radialGradient id="kHalo"><stop offset="0" stop-color="#F6C95E" stop-opacity="0.6"/><stop offset="1" stop-color="#F6C95E" stop-opacity="0"/></radialGradient>
    <linearGradient id="potGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6C95E"/><stop offset="0.5" stop-color="#E8A93C"/><stop offset="1" stop-color="#a87726"/></linearGradient>
  </defs>
  <circle cx="200" cy="280" r="190" fill="url(#kHalo)"/>
  <!-- floor / mud surface -->
  <ellipse cx="200" cy="450" rx="170" ry="14" fill="#A8754A"/>
  <ellipse cx="200" cy="445" rx="160" ry="10" fill="#D9B580"/>
  <!-- alpona on floor under pot -->
  <g stroke="#C8102E" stroke-width="1.4" fill="none" opacity="0.7">
    <ellipse cx="200" cy="448" rx="80" ry="12"/>
    <ellipse cx="200" cy="448" rx="55" ry="8"/>
    <path d="M120 448 L130 444 L130 452 Z M280 448 L270 444 L270 452 Z"/>
  </g>
  <!-- pot body -->
  <path d="M130 440 Q120 350 200 320 Q280 350 270 440 Z" fill="url(#potGrad)"/>
  <!-- pot neck -->
  <rect x="178" y="290" width="44" height="35" fill="url(#potGrad)"/>
  <!-- pot rim -->
  <ellipse cx="200" cy="290" rx="35" ry="6" fill="#a87726"/>
  <ellipse cx="200" cy="287" rx="35" ry="6" fill="#FBF6EC"/>
  <ellipse cx="200" cy="285" rx="30" ry="4" fill="#F6C95E"/>
  <!-- decorative bands on pot -->
  <path d="M140 400 Q200 410 260 400" stroke="#a87726" stroke-width="1.5" fill="none"/>
  <path d="M148 380 Q200 388 252 380" stroke="#a87726" stroke-width="1" fill="none"/>
  <path d="M155 360 Q200 368 245 360" stroke="#a87726" stroke-width="1" fill="none"/>
  <!-- swastika decoration on front -->
  <g stroke="#8e0a20" stroke-width="1.5" fill="none" opacity="0.7">
    <path d="M195 395 L195 400 L205 400 L205 395 M195 405 L205 405 L205 410 L195 410"/>
  </g>
  <!-- MANGO LEAVES coming out of the neck (5 leaves fanning) -->
  <g>
    <path d="M200 285 Q170 250 160 220 Q170 240 195 285 Z" fill="#7BA05B"/>
    <path d="M195 285 Q170 250 160 220" stroke="#4D7340" stroke-width="0.6" fill="none"/>
    <path d="M200 285 Q230 250 240 220 Q230 240 205 285 Z" fill="#7BA05B"/>
    <path d="M205 285 Q230 250 240 220" stroke="#4D7340" stroke-width="0.6" fill="none"/>
    <path d="M200 285 Q185 240 175 200 Q190 230 197 285 Z" fill="#4D7340"/>
    <path d="M200 285 Q215 240 225 200 Q210 230 203 285 Z" fill="#4D7340"/>
    <path d="M200 285 Q200 240 200 200 Q200 240 200 285 Z" fill="#7BA05B"/>
  </g>
  <!-- COCONUT on top -->
  <ellipse cx="200" cy="190" rx="22" ry="26" fill="#8B5A2B"/>
  <ellipse cx="200" cy="188" rx="20" ry="24" fill="#A8754A"/>
  <!-- coconut hair tufts -->
  <path d="M188 170 Q190 165 192 170 M196 168 L196 162 M200 165 L200 158 M204 168 L204 162 M208 170 Q210 165 212 170" stroke="#4D2E15" stroke-width="0.8" fill="none"/>
  <!-- sindoor mark on coconut -->
  <circle cx="200" cy="195" r="3" fill="#C8102E"/>
  <!-- marigolds at base of pot -->
  <g>
    <circle cx="115" cy="455" r="8" fill="#E8A93C"/><circle cx="115" cy="455" r="3" fill="#C8102E"/>
    <circle cx="135" cy="460" r="7" fill="#C8102E"/><circle cx="135" cy="460" r="3" fill="#E8A93C"/>
    <circle cx="265" cy="460" r="7" fill="#C8102E"/><circle cx="265" cy="460" r="3" fill="#E8A93C"/>
    <circle cx="285" cy="455" r="8" fill="#E8A93C"/><circle cx="285" cy="455" r="3" fill="#C8102E"/>
  </g>
  <!-- bel-pata leaves -->
  <ellipse cx="155" cy="465" rx="6" ry="3" fill="#1B5E3A" transform="rotate(-20 155 465)"/>
  <ellipse cx="245" cy="465" rx="6" ry="3" fill="#1B5E3A" transform="rotate(20 245 465)"/>
  <!-- falling petals -->
  <ellipse cx="80" cy="0" rx="3.5" ry="7" fill="#E8A93C">
    <animate attributeName="cy" values="-20;600" dur="6s" begin="0s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="6s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="320" cy="0" rx="3.5" ry="7" fill="#C8102E">
    <animate attributeName="cy" values="-20;600" dur="7s" begin="1s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="7s" begin="1s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="120" cy="0" rx="3" ry="6" fill="#F6C95E">
    <animate attributeName="cy" values="-20;600" dur="5.5s" begin="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="5.5s" begin="2s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="280" cy="0" rx="3" ry="6" fill="#E8A93C">
    <animate attributeName="cy" values="-20;600" dur="6.4s" begin="3s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="6.4s" begin="3s" repeatCount="indefinite"/>
  </ellipse>
</svg>


`;
