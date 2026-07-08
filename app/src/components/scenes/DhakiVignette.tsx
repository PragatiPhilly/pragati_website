/** Ported from the approved prototype (pragati.html). */
export default function DhakiVignette({ className }: { className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: SVG }} />;
}

const SVG = `<svg viewBox="0 0 200 260" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="160" rx="90" ry="60" fill="#E8A93C" opacity="0.1"/>
  <ellipse cx="100" cy="55" rx="18" ry="22" fill="#f4c89e"/>
  <path d="M78 48 Q100 25 122 48 L118 54 L82 54 Z" fill="#FBF6EC"/>
  <ellipse cx="100" cy="48" rx="22" ry="3" fill="#E8A93C"/>
  <line x1="80" y1="54" x2="120" y2="54" stroke="#C8102E" stroke-width="1.5"/>
  <ellipse cx="92" cy="58" rx="2" ry="1.4" fill="#fff"/><ellipse cx="108" cy="58" rx="2" ry="1.4" fill="#fff"/>
  <circle cx="92" cy="58" r="1" fill="#0a0a14"/><circle cx="108" cy="58" r="1" fill="#0a0a14"/>
  <path d="M91 68 Q100 72 109 68" stroke="#1a0a14" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <rect x="94" y="77" width="12" height="10" fill="#f4c89e"/>
  <path d="M70 90 Q100 82 130 90 L130 155 Q100 162 70 155 Z" fill="#E8A93C"/>
  <path d="M72 110 Q55 130 50 158" stroke="#f4c89e" stroke-width="9" fill="none" stroke-linecap="round"/>
  <path d="M128 110 Q145 130 150 158" stroke="#f4c89e" stroke-width="9" fill="none" stroke-linecap="round"/>
  <path d="M85 90 L50 175" stroke="#8e0a20" stroke-width="1.5"/>
  <path d="M115 90 L150 175" stroke="#8e0a20" stroke-width="1.5"/>
  <ellipse cx="100" cy="172" rx="55" ry="11" fill="#F6C95E"/>
  <rect x="45" y="172" width="110" height="38" fill="#E8A93C"/>
  <ellipse cx="100" cy="210" rx="55" ry="11" fill="#8e0a20"/>
  <ellipse cx="100" cy="172" rx="55" ry="6" fill="#E8A93C"/>
  <g>
    <path d="M60 168 Q55 150 60 138" stroke="#FBF6EC" stroke-width="1.2" fill="none"/>
    <circle cx="60" cy="140" r="3" fill="#FBF6EC"/>
    <path d="M100 168 Q95 148 102 134" stroke="#FBF6EC" stroke-width="1.2" fill="none"/>
    <circle cx="101" cy="136" r="3.5" fill="#FBF6EC"/>
    <path d="M140 168 Q145 150 140 138" stroke="#FBF6EC" stroke-width="1.2" fill="none"/>
    <circle cx="140" cy="140" r="3" fill="#FBF6EC"/>
  </g>
  <g class="stick-l" style="transform-origin: 50px 158px;">
    <line x1="50" y1="158" x2="40" y2="135" stroke="#FBF6EC" stroke-width="3" stroke-linecap="round"/>
    <circle cx="40" cy="133" r="3.5" fill="#FBF6EC"/>
  </g>
  <g class="stick-r" style="transform-origin: 150px 158px;">
    <line x1="150" y1="158" x2="160" y2="135" stroke="#FBF6EC" stroke-width="3" stroke-linecap="round"/>
    <circle cx="160" cy="133" r="3.5" fill="#FBF6EC"/>
  </g>
</svg>


`;
