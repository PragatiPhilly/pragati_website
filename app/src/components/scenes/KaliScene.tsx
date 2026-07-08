/** Ported from the approved prototype (pragati.html). */
export default function KaliScene({ className }: { className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: SVG }} />;
}

const SVG = `<svg viewBox="0 0 460 540" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="kArchGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0e3a"/><stop offset="1" stop-color="#050818"/></linearGradient>
    <radialGradient id="kHaloGrad"><stop offset="0" stop-color="#C8102E" stop-opacity="0.7"/><stop offset="1" stop-color="#C8102E" stop-opacity="0"/></radialGradient>
  </defs>
  <!-- yantra background -->
  <g stroke="#C8102E" stroke-width="1" fill="none" opacity="0.4" transform="translate(230 280)">
    <circle r="180"/><circle r="150"/><circle r="120"/>
    <polygon points="0,-150 130,75 -130,75" />
    <polygon points="0,150 -130,-75 130,-75" />
    <circle r="20" fill="#C8102E" opacity="0.7"/>
  </g>
  <!-- halo behind Kali -->
  <circle cx="230" cy="280" r="130" fill="url(#kHaloGrad)"/>
  <!-- SHIVA at the feet (white, lying down) -->
  <g>
    <ellipse cx="230" cy="510" rx="140" ry="14" fill="#FBF6EC" opacity="0.85"/>
    <ellipse cx="230" cy="500" rx="120" ry="8" fill="#FBF6EC" opacity="0.6"/>
    <!-- shiva's face -->
    <circle cx="100" cy="500" r="14" fill="#f4c89e"/>
    <circle cx="100" cy="496" r="1" fill="#0a0a14"/>
    <circle cx="106" cy="494" r="1" fill="#0a0a14"/>
    <path d="M102 504 Q105 506 108 504" stroke="#8e0a20" stroke-width="0.8" fill="none"/>
    <!-- crescent moon on shiva's head -->
    <path d="M88 490 Q92 484 96 490" stroke="#F6C95E" stroke-width="1.5" fill="none"/>
    <!-- third eye on shiva -->
    <ellipse cx="103" cy="491" rx="2" ry="0.8" fill="#C8102E"/>
  </g>
  <!-- MAA KALI body (dark blue-black) -->
  <path d="M195 490 Q195 380 230 380 Q265 380 265 490 Z" fill="#1a1a30"/>
  <!-- gold belt -->
  <ellipse cx="230" cy="420" rx="34" ry="3.5" fill="#E8A93C"/>
  <!-- arms (4) -->
  <g stroke="#3a3a5a" stroke-width="9" stroke-linecap="round" fill="none">
    <path d="M205 395 Q175 370 150 340"/>
    <path d="M255 395 Q285 370 310 340"/>
    <path d="M200 410 Q160 405 130 410"/>
    <path d="M260 410 Q300 405 330 410"/>
  </g>
  <!-- weapons -->
  <!-- kharga (sword) in upper-right hand -->
  <line x1="310" y1="340" x2="335" y2="305" stroke="#C0C0C8" stroke-width="3" stroke-linecap="round"/>
  <rect x="305" y="335" width="14" height="3" fill="#E8A93C"/>
  <!-- severed head (stylized small) in left hand -->
  <circle cx="125" cy="410" r="9" fill="#5a3a3a"/>
  <circle cx="123" cy="410" r="1.5" fill="#fff"/><circle cx="127" cy="410" r="1.5" fill="#fff"/>
  <!-- trishul in upper-left hand -->
  <line x1="150" y1="340" x2="148" y2="310" stroke="#E8A93C" stroke-width="2.5"/>
  <path d="M142 310 L148 290 L154 310" stroke="#E8A93C" stroke-width="2" fill="#F6C95E"/>
  <!-- abhaya mudra (right lower hand, palm out) -->
  <circle cx="330" cy="410" r="6" fill="#1a1a30"/>
  <!-- HEAD (dark) -->
  <circle cx="230" cy="350" r="26" fill="#2a2a40"/>
  <!-- chubby cheeks (kept cute) -->
  <circle cx="216" cy="358" r="4" fill="#5a3a4a" opacity="0.6"/>
  <circle cx="244" cy="358" r="4" fill="#5a3a4a" opacity="0.6"/>
  <!-- wild hair flowing -->
  <path d="M204 340 Q186 360 196 395 Q200 380 210 365 Z" fill="#0a0a14"/>
  <path d="M256 340 Q274 360 264 395 Q260 380 250 365 Z" fill="#0a0a14"/>
  <path d="M210 330 Q190 320 184 304 Q200 320 218 326 Z" fill="#0a0a14"/>
  <path d="M250 330 Q270 320 276 304 Q260 320 242 326 Z" fill="#0a0a14"/>
  <!-- 3 eyes -->
  <ellipse cx="219" cy="350" rx="4" ry="5" fill="#fff"/>
  <ellipse cx="241" cy="350" rx="4" ry="5" fill="#fff"/>
  <ellipse cx="230" cy="338" rx="3.5" ry="2" fill="#fff"/>
  <ellipse cx="219" cy="351" rx="2.5" ry="3.5" fill="#0a0a14"/>
  <ellipse cx="241" cy="351" rx="2.5" ry="3.5" fill="#0a0a14"/>
  <ellipse cx="230" cy="338" rx="2" ry="1.2" fill="#C8102E"/>
  <!-- eyebrows fierce -->
  <path d="M212 342 Q219 339 226 342" stroke="#0a0a14" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M234 342 Q241 339 248 342" stroke="#0a0a14" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <!-- mouth with RED TONGUE OUT -->
  <path d="M220 365 Q230 368 240 365" stroke="#0a0a14" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <ellipse cx="230" cy="372" rx="6" ry="9" fill="#C8102E"/>
  <ellipse cx="230" cy="375" rx="3" ry="6" fill="#8e0a20"/>
  <!-- fangs -->
  <path d="M225 365 L226 372 L227 365 Z" fill="#fff"/>
  <path d="M233 365 L234 372 L235 365 Z" fill="#fff"/>
  <!-- bindi -->
  <circle cx="230" cy="328" r="2.5" fill="#C8102E"/>
  <!-- crown -->
  <path d="M204 328 L210 312 L216 322 L222 304 L228 320 L230 296 L232 320 L238 304 L244 322 L250 312 L256 328 Z" fill="#E8A93C"/>
  <circle cx="230" cy="302" r="3" fill="#C8102E"/>
  <!-- SKULL GARLAND (stylized cute small skulls around the neck) -->
  <g>
    <g transform="translate(196 408)"><ellipse rx="5" ry="5" fill="#FBF6EC"/><circle cx="-1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><circle cx="1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><path d="M-2 2 L0 4 L2 2" stroke="#0a0a14" stroke-width="0.5" fill="none"/></g>
    <g transform="translate(212 414)"><ellipse rx="5" ry="5" fill="#FBF6EC"/><circle cx="-1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><circle cx="1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><path d="M-2 2 L0 4 L2 2" stroke="#0a0a14" stroke-width="0.5" fill="none"/></g>
    <g transform="translate(230 416)"><ellipse rx="5" ry="5" fill="#FBF6EC"/><circle cx="-1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><circle cx="1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><path d="M-2 2 L0 4 L2 2" stroke="#0a0a14" stroke-width="0.5" fill="none"/></g>
    <g transform="translate(248 414)"><ellipse rx="5" ry="5" fill="#FBF6EC"/><circle cx="-1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><circle cx="1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><path d="M-2 2 L0 4 L2 2" stroke="#0a0a14" stroke-width="0.5" fill="none"/></g>
    <g transform="translate(264 408)"><ellipse rx="5" ry="5" fill="#FBF6EC"/><circle cx="-1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><circle cx="1.5" cy="-0.5" r="0.8" fill="#0a0a14"/><path d="M-2 2 L0 4 L2 2" stroke="#0a0a14" stroke-width="0.5" fill="none"/></g>
    <path d="M196 408 Q230 416 264 408" stroke="#8e0a20" stroke-width="0.8" fill="none"/>
  </g>
  <!-- jhumka earrings -->
  <circle cx="205" cy="358" r="2" fill="#E8A93C"/><circle cx="205" cy="365" r="1.8" fill="#C8102E"/>
  <circle cx="255" cy="358" r="2" fill="#E8A93C"/><circle cx="255" cy="365" r="1.8" fill="#C8102E"/>
</svg>


`;
