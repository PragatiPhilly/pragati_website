/** Ported from the approved prototype (pragati.html). */
export default function SaraswatiScene({ className }: { className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: SVG }} />;
}

const SVG = `<svg viewBox="0 0 460 540" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sHaloGrad"><stop offset="0" stop-color="#FBF6EC" stop-opacity="0.85"/><stop offset="0.6" stop-color="#FEF6D9" stop-opacity="0.4"/><stop offset="1" stop-color="#FBF6EC" stop-opacity="0"/></radialGradient>
    <linearGradient id="sLotusGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBF6EC"/><stop offset="0.5" stop-color="#E8A4B8"/><stop offset="1" stop-color="#C8889D"/>
    </linearGradient>
    <linearGradient id="sSareeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBF6EC"/><stop offset="1" stop-color="#F0E0B8"/>
    </linearGradient>
  </defs>

  <!-- soft sky / morning halo behind -->
  <ellipse cx="230" cy="270" rx="220" ry="220" fill="url(#sHaloGrad)"/>

  <!-- sun rays radiating behind Saraswati -->
  <g stroke="#F6C95E" stroke-width="1.5" opacity="0.5" transform="translate(230 280)">
    <line x1="0" y1="-200" x2="0" y2="-160"/>
    <line x1="100" y1="-173" x2="80" y2="-138" transform="rotate(0)"/>
    <line x1="173" y1="-100" x2="138" y2="-80"/>
    <line x1="200" y1="0" x2="160" y2="0"/>
    <line x1="173" y1="100" x2="138" y2="80"/>
    <line x1="-100" y1="-173" x2="-80" y2="-138"/>
    <line x1="-173" y1="-100" x2="-138" y2="-80"/>
    <line x1="-200" y1="0" x2="-160" y2="0"/>
    <line x1="-173" y1="100" x2="-138" y2="80"/>
  </g>

  <!-- WATER at base where swans paddle -->
  <ellipse cx="230" cy="510" rx="200" ry="14" fill="#BFDFEA" opacity="0.7"/>
  <ellipse cx="230" cy="505" rx="180" ry="10" fill="#BFDFEA" opacity="0.5"/>
  <path d="M40 510 Q80 506 120 510 Q160 514 200 510 Q240 506 280 510 Q320 514 360 510 Q400 506 420 510" stroke="#FBF6EC" stroke-width="0.8" fill="none" opacity="0.7"/>

  <!-- LARGE LOTUS THRONE -->
  <g>
    <!-- back petals -->
    <ellipse cx="180" cy="445" rx="36" ry="14" fill="url(#sLotusGrad)" transform="rotate(-20 180 445)"/>
    <ellipse cx="280" cy="445" rx="36" ry="14" fill="url(#sLotusGrad)" transform="rotate(20 280 445)"/>
    <ellipse cx="135" cy="450" rx="32" ry="12" fill="url(#sLotusGrad)" transform="rotate(-35 135 450)"/>
    <ellipse cx="325" cy="450" rx="32" ry="12" fill="url(#sLotusGrad)" transform="rotate(35 325 450)"/>
    <!-- front petals -->
    <ellipse cx="200" cy="465" rx="38" ry="14" fill="#FBF6EC" transform="rotate(-10 200 465)"/>
    <ellipse cx="260" cy="465" rx="38" ry="14" fill="#FBF6EC" transform="rotate(10 260 465)"/>
    <!-- center base petals -->
    <ellipse cx="230" cy="470" rx="80" ry="18" fill="#FBF6EC"/>
    <ellipse cx="230" cy="475" rx="60" ry="10" fill="#E8A4B8" opacity="0.5"/>
  </g>

  <!-- MAA SARASWATI body (white saree) -->
  <path d="M195 470 Q195 380 230 380 Q265 380 265 470 Z" fill="url(#sSareeGrad)"/>
  <!-- saree gold trim -->
  <path d="M195 462 Q230 472 265 462" stroke="#E8A93C" stroke-width="2.5" fill="none"/>
  <path d="M200 446 Q230 454 260 446" stroke="#C8961A" stroke-width="1.4" fill="none" opacity="0.7"/>
  <!-- delicate dots on saree -->
  <g fill="#C8961A" opacity="0.5">
    <circle cx="210" cy="420" r="1.4"/>
    <circle cx="230" cy="430" r="1.4"/>
    <circle cx="250" cy="420" r="1.4"/>
    <circle cx="215" cy="445" r="1.2"/>
    <circle cx="245" cy="445" r="1.2"/>
  </g>
  <!-- waist belt -->
  <ellipse cx="230" cy="415" rx="34" ry="3" fill="#E8A93C"/>
  <!-- shoulders / upper body -->
  <path d="M214 380 Q230 372 246 380 L248 392 Q230 395 212 392 Z" fill="url(#sSareeGrad)"/>
  <path d="M212 386 Q230 394 248 386" stroke="#E8A93C" stroke-width="1.5" fill="none"/>

  <!-- ARMS (4) — holding veena across lap, book in one, beads in another -->
  <g stroke="#f4c89e" stroke-width="11" fill="none" stroke-linecap="round">
    <!-- two front arms holding veena across lap -->
    <path d="M210 405 Q190 420 175 415"/>
    <path d="M250 405 Q270 420 285 415"/>
    <!-- back arm right holds book up -->
    <path d="M255 385 Q290 365 310 340"/>
    <!-- back arm left holds prayer beads -->
    <path d="M205 385 Q170 365 150 340"/>
  </g>

  <!-- VEENA across the lap (the prominent instrument) -->
  <g>
    <!-- veena body (rounded gourd) -->
    <ellipse cx="170" cy="425" rx="22" ry="14" fill="#a87726"/>
    <ellipse cx="170" cy="423" rx="22" ry="14" fill="#E8A93C"/>
    <ellipse cx="170" cy="420" rx="17" ry="10" fill="#a87726"/>
    <!-- second gourd on other end -->
    <ellipse cx="290" cy="425" rx="20" ry="12" fill="#a87726"/>
    <ellipse cx="290" cy="423" rx="20" ry="12" fill="#E8A93C"/>
    <!-- neck of veena -->
    <rect x="186" y="420" width="100" height="6" fill="#8b5a2b"/>
    <rect x="186" y="418" width="100" height="2" fill="#C8961A"/>
    <!-- frets -->
    <g stroke="#C8961A" stroke-width="0.8">
      <line x1="200" y1="418" x2="200" y2="426"/>
      <line x1="218" y1="418" x2="218" y2="426"/>
      <line x1="236" y1="418" x2="236" y2="426"/>
      <line x1="254" y1="418" x2="254" y2="426"/>
      <line x1="272" y1="418" x2="272" y2="426"/>
    </g>
    <!-- strings (subtle) -->
    <g stroke="#FBF6EC" stroke-width="0.5" opacity="0.7">
      <line x1="188" y1="419" x2="284" y2="419"/>
      <line x1="188" y1="421" x2="284" y2="421"/>
      <line x1="188" y1="423" x2="284" y2="423"/>
      <line x1="188" y1="425" x2="284" y2="425"/>
    </g>
    <!-- decorative top on right gourd -->
    <circle cx="290" cy="412" r="3" fill="#C8102E"/>
  </g>

  <!-- BOOK in upper-right hand -->
  <g transform="translate(305 335) rotate(-15)">
    <rect x="-12" y="-9" width="24" height="18" rx="1.5" fill="#C8961A"/>
    <rect x="-10" y="-7" width="20" height="14" fill="#FBF6EC"/>
    <line x1="0" y1="-7" x2="0" y2="7" stroke="#C8961A" stroke-width="0.8"/>
    <line x1="-7" y1="-4" x2="-3" y2="-4" stroke="#3B5876" stroke-width="0.4"/>
    <line x1="-7" y1="-1" x2="-3" y2="-1" stroke="#3B5876" stroke-width="0.4"/>
    <line x1="3" y1="-4" x2="7" y2="-4" stroke="#3B5876" stroke-width="0.4"/>
    <line x1="3" y1="-1" x2="7" y2="-1" stroke="#3B5876" stroke-width="0.4"/>
  </g>

  <!-- prayer beads in upper-left hand -->
  <g transform="translate(150 340)">
    <circle cx="0" cy="0" r="2" fill="#8b5a2b"/>
    <circle cx="-5" cy="3" r="2" fill="#8b5a2b"/>
    <circle cx="-9" cy="8" r="2" fill="#8b5a2b"/>
    <circle cx="-10" cy="14" r="2" fill="#8b5a2b"/>
    <circle cx="-7" cy="19" r="2" fill="#8b5a2b"/>
    <circle cx="-2" cy="22" r="2" fill="#8b5a2b"/>
    <circle cx="4" cy="22" r="2.5" fill="#C8102E"/>
    <line x1="0" y1="0" x2="-7" y2="19" stroke="#8b5a2b" stroke-width="0.5"/>
  </g>

  <!-- HEAD -->
  <circle cx="230" cy="350" r="25" fill="#f4c89e"/>
  <!-- chubby cheek blush -->
  <circle cx="217" cy="358" r="4" fill="#e88a8a" opacity="0.55"/>
  <circle cx="243" cy="358" r="4" fill="#e88a8a" opacity="0.55"/>
  <!-- crown (white with pink lotus) -->
  <path d="M208 336 L212 322 L218 332 L222 314 L228 330 L230 308 L232 330 L238 314 L242 332 L248 322 L252 336 Z" fill="#FBF6EC"/>
  <circle cx="230" cy="316" r="3" fill="#E8A4B8"/>
  <circle cx="230" cy="316" r="1.2" fill="#C8102E"/>
  <!-- hair flowing -->
  <path d="M208 352 Q200 380 208 405 Q214 392 212 352 Z" fill="#1a0a14"/>
  <path d="M252 352 Q260 380 252 405 Q246 392 248 352 Z" fill="#1a0a14"/>
  <!-- white flower in hair -->
  <circle cx="218" cy="330" r="3" fill="#FBF6EC"/>
  <circle cx="218" cy="330" r="1.2" fill="#E8A93C"/>
  <!-- BIG anime eyes -->
  <ellipse cx="220" cy="350" rx="4" ry="5" fill="#fff"/>
  <ellipse cx="240" cy="350" rx="4" ry="5" fill="#fff"/>
  <ellipse cx="220" cy="351" rx="2.5" ry="3.5" fill="#3B5876"/>
  <ellipse cx="240" cy="351" rx="2.5" ry="3.5" fill="#3B5876"/>
  <circle cx="221" cy="349" r="1.2" fill="#fff"/>
  <circle cx="241" cy="349" r="1.2" fill="#fff"/>
  <!-- eyebrows -->
  <path d="M215 342 Q220 339 225 342" stroke="#1a0a14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <path d="M235 342 Q240 339 245 342" stroke="#1a0a14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <!-- bindi -->
  <circle cx="230" cy="336" r="2" fill="#C8102E"/>
  <!-- nose -->
  <ellipse cx="230" cy="358" rx="1.4" ry="2" fill="#e0aa7a" opacity="0.5"/>
  <!-- gentle smile -->
  <path d="M223 366 Q230 370 237 366" stroke="#8e0a20" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <ellipse cx="230" cy="368" rx="2.5" ry="1.2" fill="#C8102E" opacity="0.5"/>
  <!-- earrings -->
  <circle cx="205" cy="355" r="2" fill="#E8A93C"/>
  <circle cx="205" cy="361" r="1.5" fill="#E8A4B8"/>
  <circle cx="255" cy="355" r="2" fill="#E8A93C"/>
  <circle cx="255" cy="361" r="1.5" fill="#E8A4B8"/>

  <!-- TWO SWANS at the base -->
  <!-- swan left -->
  <g transform="translate(80 490)">
    <ellipse cx="0" cy="6" rx="22" ry="9" fill="#FBF6EC"/>
    <path d="M16 4 Q22 -8 14 -10 Q12 -2 16 4" fill="#FBF6EC"/>
    <path d="M16 -8 L22 -12" stroke="#E8A93C" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="16" cy="-7" r="0.8" fill="#1a0a14"/>
    <path d="M-15 8 Q-10 4 -5 8 Q0 4 5 8" stroke="#E8A93C" stroke-width="0.8" fill="none"/>
    <!-- ripple under swan -->
    <ellipse cx="0" cy="16" rx="20" ry="2" fill="#FBF6EC" opacity="0.4"/>
  </g>
  <!-- swan right (facing inward) -->
  <g transform="translate(380 490) scale(-1 1)">
    <ellipse cx="0" cy="6" rx="22" ry="9" fill="#FBF6EC"/>
    <path d="M16 4 Q22 -8 14 -10 Q12 -2 16 4" fill="#FBF6EC"/>
    <path d="M16 -8 L22 -12" stroke="#E8A93C" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="16" cy="-7" r="0.8" fill="#1a0a14"/>
    <path d="M-15 8 Q-10 4 -5 8 Q0 4 5 8" stroke="#E8A93C" stroke-width="0.8" fill="none"/>
    <ellipse cx="0" cy="16" rx="20" ry="2" fill="#FBF6EC" opacity="0.4"/>
  </g>

  <!-- lotus pads floating around -->
  <ellipse cx="50" cy="510" rx="14" ry="6" fill="#9CC76C"/>
  <ellipse cx="50" cy="508" rx="12" ry="5" fill="#5C8A3A" opacity="0.7"/>
  <ellipse cx="420" cy="510" rx="14" ry="6" fill="#9CC76C"/>
  <ellipse cx="420" cy="508" rx="12" ry="5" fill="#5C8A3A" opacity="0.7"/>
  <ellipse cx="120" cy="525" rx="10" ry="4" fill="#9CC76C"/>
  <ellipse cx="350" cy="525" rx="10" ry="4" fill="#9CC76C"/>

  <!-- floating books around her — small animated -->
  <g>
    <g transform="translate(95 280)">
      <rect x="-12" y="-9" width="24" height="18" rx="1.5" fill="#E85F2C"/>
      <rect x="-10" y="-7" width="20" height="14" fill="#FBF6EC"/>
      <animateTransform attributeName="transform" type="translate" values="95,280; 100,270; 95,280" dur="6s" repeatCount="indefinite"/>
    </g>
    <g transform="translate(365 280)">
      <rect x="-12" y="-9" width="24" height="18" rx="1.5" fill="#9CC76C"/>
      <rect x="-10" y="-7" width="20" height="14" fill="#FBF6EC"/>
      <animateTransform attributeName="transform" type="translate" values="365,280; 360,270; 365,280" dur="6s" begin="2s" repeatCount="indefinite"/>
    </g>
    <g transform="translate(60 380)">
      <rect x="-10" y="-7" width="20" height="14" rx="1.5" fill="#C8961A"/>
      <rect x="-8" y="-5" width="16" height="10" fill="#FBF6EC"/>
      <animateTransform attributeName="transform" type="translate" values="60,380; 65,370; 60,380" dur="7s" begin="1s" repeatCount="indefinite"/>
    </g>
    <g transform="translate(400 380)">
      <rect x="-10" y="-7" width="20" height="14" rx="1.5" fill="#3B5876"/>
      <rect x="-8" y="-5" width="16" height="10" fill="#FBF6EC"/>
      <animateTransform attributeName="transform" type="translate" values="400,380; 395,370; 400,380" dur="7s" begin="3s" repeatCount="indefinite"/>
    </g>
  </g>

  <!-- chibi schoolgirl (yellow saree) and schoolboy figures small at base -->
  <!-- schoolgirl bottom-left -->
  <g transform="translate(40 520)">
    <path d="M-8 8 Q-8 -5 0 -5 Q8 -5 8 8 Z" fill="#F6C95E"/>
    <circle cx="0" cy="-9" r="6" fill="#f4c89e"/>
    <circle cx="-3" cy="-4" r="3" fill="#e88a8a" opacity="0.5"/>
    <circle cx="3" cy="-4" r="3" fill="#e88a8a" opacity="0.5"/>
    <circle cx="0" cy="-14" r="4" fill="#1a0a14"/>
    <circle cx="-1.5" cy="-9" r="0.8" fill="#0a0a14"/>
    <circle cx="1.5" cy="-9" r="0.8" fill="#0a0a14"/>
    <circle cx="0" cy="-12" r="0.8" fill="#C8102E"/>
    <path d="M-1.5 -6 Q0 -5 1.5 -6" stroke="#8e0a20" stroke-width="0.5" fill="none"/>
    <!-- book in hand -->
    <rect x="-12" y="0" width="6" height="4" fill="#E85F2C"/>
  </g>
  <!-- schoolboy bottom-right -->
  <g transform="translate(420 520)">
    <path d="M-8 8 Q-8 -5 0 -5 Q8 -5 8 8 Z" fill="#FBF6EC"/>
    <circle cx="0" cy="-9" r="6" fill="#f4c89e"/>
    <circle cx="-3" cy="-4" r="3" fill="#e88a8a" opacity="0.5"/>
    <circle cx="3" cy="-4" r="3" fill="#e88a8a" opacity="0.5"/>
    <path d="M-5 -13 Q0 -16 5 -13" fill="#1a0a14"/>
    <circle cx="-1.5" cy="-9" r="0.8" fill="#0a0a14"/>
    <circle cx="1.5" cy="-9" r="0.8" fill="#0a0a14"/>
    <circle cx="0" cy="-12" r="0.8" fill="#C8102E"/>
    <path d="M-1.5 -6 Q0 -5 1.5 -6" stroke="#8e0a20" stroke-width="0.5" fill="none"/>
    <!-- pen -->
    <line x1="8" y1="2" x2="14" y2="-2" stroke="#3B5876" stroke-width="1.2"/>
  </g>
</svg>


`;
