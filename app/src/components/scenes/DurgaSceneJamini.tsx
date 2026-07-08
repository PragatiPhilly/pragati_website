/**
 * Maa Durga with her children — after Jamini Roy's maternal Durga paintings.
 * Mustard field, maroon patterned border, round golden faces with enormous
 * fish eyes, flat saris with white-dot borders. Baby Ganesh sits on her lap;
 * Lakshmi and Saraswati flank with lotus stalks; little Kartik at her knee.
 * Gentle motion: breathing, swaying garland, flickering diyas.
 */

const INK = "#2e1a0e";
const SKIN = "#e8b84a";
const RED = "#b5402a";
const MAROON = "#5a2014";
const FRAME = "#4a1c12";
const MUSTARD = "#d9a33c";
const MUSTARD_SOFT = "#e0af4e";
const GOLD = "#e9c25d";
const CHALK = "#f5ecd8";
const GREEN = "#3f6b4a";
const BLUE = "#3a5a8c";

/** Round Jamini face — golden, huge fish eyes, fan crown. */
function JFace({
  cx, cy, r, thirdEye = false, crownColor = GOLD,
}: { cx: number; cy: number; r: number; thirdEye?: boolean; crownColor?: string }) {
  const eyeY = cy - r * 0.02;
  const eye = (s: number) => {
    const inX = cx + s * r * 0.1;
    const outX = cx + s * r * 0.78;
    const h = r * 0.3;
    return (
      <g key={s}>
        {/* white of eye — big fish shape */}
        <path
          d={`M ${inX} ${eyeY + h * 0.15} Q ${(inX + outX) / 2} ${eyeY - h} ${outX} ${eyeY - h * 0.15}
             Q ${(inX + outX) / 2} ${eyeY + h * 0.75} ${inX} ${eyeY + h * 0.15} Z`}
          fill="#fdf8ec"
          stroke={INK}
          strokeWidth={r * 0.075}
          strokeLinejoin="round"
        />
        {/* big pupil with a sparkle */}
        <circle cx={(inX + outX) / 2 + s * r * 0.02} cy={eyeY - h * 0.08} r={r * 0.14} fill={INK} />
        <circle cx={(inX + outX) / 2 + s * r * 0.02 + r * 0.045} cy={eyeY - h * 0.08 - r * 0.05} r={r * 0.045} fill="#fff" opacity="0.95" />
        {/* kajal sweep past the temple */}
        <path d={`M ${outX} ${eyeY - h * 0.15} Q ${outX + s * r * 0.22} ${eyeY - h * 0.4} ${outX + s * r * 0.3} ${eyeY - h * 0.7}`} stroke={INK} strokeWidth={r * 0.06} fill="none" strokeLinecap="round" />
        {/* thick curved brow */}
        <path d={`M ${inX + s * r * 0.02} ${eyeY - h * 1.35} Q ${(inX + outX) / 2} ${eyeY - h * 2.2} ${outX} ${eyeY - h * 1.2}`} stroke={INK} strokeWidth={r * 0.065} fill="none" strokeLinecap="round" />
      </g>
    );
  };

  return (
    <g>
      {/* full dark hair behind, framing the face on all sides */}
      <ellipse cx={cx} cy={cy - r * 0.08} rx={r * 1.18} ry={r * 1.22} fill={INK} />
      {/* face — soft and round, tucked into the hair */}
      <ellipse cx={cx} cy={cy + r * 0.04} rx={r} ry={r * 1.0} fill={SKIN} stroke={INK} strokeWidth={r * 0.05} />
      {/* rosy cheeks */}
      <ellipse cx={cx - r * 0.52} cy={cy + r * 0.36} rx={r * 0.17} ry={r * 0.11} fill="#d98a90" opacity="0.4" />
      <ellipse cx={cx + r * 0.52} cy={cy + r * 0.36} rx={r * 0.17} ry={r * 0.11} fill="#d98a90" opacity="0.4" />
      {/* center-parted hairline */}
      <path d={`M ${cx - r * 0.94} ${cy - r * 0.3} Q ${cx - r * 0.4} ${cy - r * 0.86} ${cx} ${cy - r * 0.62} Q ${cx + r * 0.4} ${cy - r * 0.86} ${cx + r * 0.94} ${cy - r * 0.3} Q ${cx + r * 0.85} ${cy - r * 0.95} ${cx} ${cy - r * 1.0} Q ${cx - r * 0.85} ${cy - r * 0.95} ${cx - r * 0.94} ${cy - r * 0.3} Z`} fill={INK} />
      {/* fan crown — seated on the hair */}
      <g>
        <path
          d={`M ${cx - r * 0.8} ${cy - r * 0.86} Q ${cx} ${cy - r * 2.0} ${cx + r * 0.8} ${cy - r * 0.86} Z`}
          fill={crownColor}
          stroke={INK}
          strokeWidth={r * 0.055}
          strokeLinejoin="round"
        />
        {/* scallop dots along the crown edge */}
        {Array.from({ length: 7 }).map((_, i) => {
          const t = (i + 0.5) / 7;
          const a = Math.PI * (1 - t);
          const px = cx + Math.cos(a) * r * 0.68;
          const py = cy - r * 0.9 - Math.sin(a) * r * 0.72;
          return <circle key={i} cx={px} cy={py} r={r * 0.07} fill={CHALK} stroke={INK} strokeWidth={r * 0.025} />;
        })}
        <circle cx={cx} cy={cy - r * 1.26} r={r * 0.1} fill={RED} stroke={INK} strokeWidth={r * 0.03} />
      </g>
      {eye(-1)}
      {eye(1)}
      {/* third eye / bindi */}
      {thirdEye ? (
        <g>
          <path d={`M ${cx} ${cy - r * 0.62} Q ${cx + r * 0.09} ${cy - r * 0.44} ${cx} ${cy - r * 0.26} Q ${cx - r * 0.09} ${cy - r * 0.44} ${cx} ${cy - r * 0.62} Z`} fill="#fdf8ec" stroke={INK} strokeWidth={r * 0.04} />
          <circle cx={cx} cy={cy - r * 0.44} r={r * 0.06} fill={INK} />
        </g>
      ) : (
        <circle cx={cx} cy={cy - r * 0.42} r={r * 0.08} fill={RED} stroke={INK} strokeWidth={r * 0.025} />
      )}
      {/* little nose */}
      <path d={`M ${cx} ${cy + r * 0.02} L ${cx - r * 0.05} ${cy + r * 0.32} Q ${cx} ${cy + r * 0.4} ${cx + r * 0.05} ${cy + r * 0.32} Z`} fill="none" stroke={INK} strokeWidth={r * 0.045} strokeLinejoin="round" />
      {/* small smiling lips */}
      <path d={`M ${cx - r * 0.16} ${cy + r * 0.56} Q ${cx} ${cy + r * 0.68} ${cx + r * 0.16} ${cy + r * 0.56}`} stroke={INK} strokeWidth={r * 0.05} fill="none" strokeLinecap="round" />
      <path d={`M ${cx - r * 0.12} ${cy + r * 0.6} Q ${cx} ${cy + r * 0.7} ${cx + r * 0.12} ${cy + r * 0.6}`} stroke={RED} strokeWidth={r * 0.06} fill="none" strokeLinecap="round" />
      {/* big round earrings hanging from the hair */}
      <circle cx={cx - r * 1.16} cy={cy + r * 0.42} r={r * 0.15} fill={GOLD} stroke={INK} strokeWidth={r * 0.04} />
      <circle cx={cx + r * 1.16} cy={cy + r * 0.42} r={r * 0.15} fill={GOLD} stroke={INK} strokeWidth={r * 0.04} />
    </g>
  );
}

/** Seated, rounded body with white-dot sari border. */
function JBody({
  cx, top, w, h, color,
}: { cx: number; top: number; w: number; h: number; color: string }) {
  const outline = `M ${cx - w * 0.24} ${top + 8}
    Q ${cx} ${top - 8} ${cx + w * 0.24} ${top + 8}
    C ${cx + w * 0.46} ${top + h * 0.22} ${cx + w * 0.6} ${top + h * 0.55} ${cx + w * 0.5} ${top + h}
    L ${cx - w * 0.5} ${top + h}
    C ${cx - w * 0.6} ${top + h * 0.55} ${cx - w * 0.46} ${top + h * 0.22} ${cx - w * 0.24} ${top + 8} Z`;
  return (
    <g>
      <path d={outline} fill={color} stroke={INK} strokeWidth="3.4" strokeLinejoin="round" />
      {/* white dot border following the sides (Jamini signature) */}
      {Array.from({ length: 7 }).map((_, i) => {
        const t = 0.2 + (i / 6) * 0.75;
        const x = cx - w * (0.44 + 0.13 * Math.pow(t, 1.6)) * (t < 1 ? 1 : 1);
        void x;
        const lx = cx - w * (0.44 + (0.5 - 0.44) * t) + w * 0.055;
        const rx = cx + w * (0.44 + (0.5 - 0.44) * t) - w * 0.055;
        const y = top + h * (0.12 + 0.85 * t);
        return (
          <g key={i}>
            <circle cx={lx} cy={y} r="3.2" fill={CHALK} />
            <circle cx={rx} cy={y} r="3.2" fill={CHALK} />
          </g>
        );
      })}
      {/* hem */}
      <path d={`M ${cx - w * 0.5} ${top + h} L ${cx + w * 0.5} ${top + h}`} stroke={CHALK} strokeWidth="7" />
      <path d={`M ${cx - w * 0.5} ${top + h} L ${cx + w * 0.5} ${top + h}`} stroke={INK} strokeWidth="7" strokeDasharray="2.5 8" />
      {/* necklace */}
      <path d={`M ${cx - w * 0.14} ${top + h * 0.05} Q ${cx} ${top + h * 0.17} ${cx + w * 0.14} ${top + h * 0.05}`} stroke={GOLD} strokeWidth="5" fill="none" />
      <circle cx={cx} cy={top + h * 0.15} r="3.4" fill={RED} stroke={INK} strokeWidth="1.2" />
    </g>
  );
}

/** Arm as a soft outlined curve ending in a little hand. */
function Arm({ x1, y1, x2, y2, bend = 0, w = 9 }: { x1: number; y1: number; x2: number; y2: number; bend?: number; w?: number }) {
  const mx = (x1 + x2) / 2 + bend;
  const my = (y1 + y2) / 2 + 14;
  return (
    <g>
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} stroke={INK} strokeWidth={w + 4.5} fill="none" strokeLinecap="round" />
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} stroke={SKIN} strokeWidth={w} fill="none" strokeLinecap="round" />
      <circle cx={x2} cy={y2} r={w * 0.72} fill={SKIN} stroke={INK} strokeWidth="2.2" />
    </g>
  );
}

/** Lotus on a tall stalk, as in the painting. */
function LotusStalk({ x, base, h, sway = false }: { x: number; base: number; h: number; sway?: boolean }) {
  return (
    <g className={sway ? "leaf-sway" : undefined}>
      <path d={`M ${x} ${base} q ${-6} ${-h * 0.5} 2 ${-h}`} stroke={GREEN} strokeWidth="4" fill="none" />
      <path d={`M ${x} ${base} q ${-6} ${-h * 0.5} 2 ${-h}`} stroke={INK} strokeWidth="1.2" fill="none" opacity="0.5" />
      <g transform={`translate(${x + 2} ${base - h})`} stroke={INK} strokeWidth="2">
        <path d="M0 0 Q-9 -13 0 -21 Q9 -13 0 0 Z" fill="#d98a90" />
        <path d="M-3 -3 Q-16 -9 -12 -20 Q-3 -14 -3 -3 Z" fill={CHALK} />
        <path d="M3 -3 Q16 -9 12 -20 Q3 -14 3 -3 Z" fill={CHALK} />
      </g>
    </g>
  );
}

export default function DurgaSceneJamini({ className }: { className?: string }) {
  return (
    <div className={`relative rounded-[2rem] overflow-hidden select-none ${className ?? ""}`} style={{ boxShadow: "var(--shadow)" }}>
      <svg viewBox="0 0 900 640" className="block w-full h-auto" role="img" aria-label="Maa Durga holding baby Ganesh, with Lakshmi, Saraswati and Kartik — in the Jamini Roy style">
        {/* ── mustard field ── */}
        <rect width="900" height="640" fill={MUSTARD} />
        <ellipse cx="220" cy="140" rx="190" ry="90" fill={MUSTARD_SOFT} opacity="0.55" />
        <ellipse cx="700" cy="480" rx="200" ry="100" fill="#d09a34" opacity="0.5" />

        {/* ── maroon frame with white pattern (like the painting's border) ── */}
        <rect x="0" y="0" width="900" height="640" fill="none" stroke={FRAME} strokeWidth="44" />
        {/* white diamond dashes on the frame */}
        {Array.from({ length: 30 }).map((_, i) => (
          <rect key={`t${i}`} x={34 + i * 28.5} y={7} width="11" height="8" fill={CHALK} transform={`rotate(45 ${39 + i * 28.5} 11)`} opacity="0.9" />
        ))}
        {Array.from({ length: 30 }).map((_, i) => (
          <rect key={`b${i}`} x={34 + i * 28.5} y={625} width="11" height="8" fill={CHALK} transform={`rotate(45 ${39 + i * 28.5} 629)`} opacity="0.9" />
        ))}
        {Array.from({ length: 21 }).map((_, i) => (
          <g key={`s${i}`} opacity="0.9">
            <rect x={7} y={34 + i * 28.5} width="8" height="11" fill={CHALK} transform={`rotate(45 11 ${39 + i * 28.5})`} />
            <rect x={885} y={34 + i * 28.5} width="8" height="11" fill={CHALK} transform={`rotate(45 889 ${39 + i * 28.5})`} />
          </g>
        ))}
        <rect x="30" y="30" width="840" height="580" fill="none" stroke={GOLD} strokeWidth="3" />

        <g className="scene-breath">
          {/* ── swaying marigold garland across the top ── */}
          <g className="garland-sway">
            <path d="M 60 78 Q 450 148 840 78" fill="none" stroke={GREEN} strokeWidth="4.5" />
            {Array.from({ length: 19 }).map((_, i) => {
              const t = (i + 0.5) / 19;
              const x = 60 + t * 780;
              const y = 78 + Math.sin(Math.PI * t) * 68;
              return (
                <g key={i}>
                  <circle cx={x} cy={y + 7} r="8.5" fill={GOLD} stroke={INK} strokeWidth="1.8" />
                  <circle cx={x} cy={y + 7} r="3" fill={RED} />
                </g>
              );
            })}
            {/* hanging mango leaves between marigolds */}
            {Array.from({ length: 9 }).map((_, i) => {
              const t = (i + 1) / 10;
              const x = 60 + t * 780;
              const y = 78 + Math.sin(Math.PI * t) * 68;
              return <path key={i} d={`M ${x} ${y + 14} q -4 10 0 18 q 4 -8 0 -18`} fill={GREEN} stroke={INK} strokeWidth="1" />;
            })}
          </g>

          {/* ── maroon ground the family sits on ── */}
          <rect x="52" y="520" width="796" height="90" fill={MAROON} stroke={INK} strokeWidth="2.5" />
          {Array.from({ length: 27 }).map((_, i) => (
            <circle key={i} cx={72 + i * 29.5} cy={531} r="3" fill={CHALK} opacity="0.85" />
          ))}

          {/* ══ LAKSHMI (left, green — as in the painting) ══ */}
          <g>
            <LotusStalk x={214} base={520} h={150} sway />
            <JBody cx={280} top={392} w={150} h={128} color={GREEN} />
            <Arm x1={252} y1={432} x2={236} y2={492} bend={-10} w={8} />
            <Arm x1={308} y1={432} x2={318} y2={490} bend={10} w={8} />
            <JFace cx={280} cy={366} r={34} />
            {/* owl companion */}
            <g transform="translate(200 508)" stroke={INK} strokeWidth="2">
              <ellipse cx="0" cy="0" rx="12" ry="15" fill={CHALK} />
              <circle cx="-5" cy="-5" r="4" fill="#fff" />
              <circle cx="5" cy="-5" r="4" fill="#fff" />
              <circle cx="-5" cy="-5" r="1.8" fill={INK} />
              <circle cx="5" cy="-5" r="1.8" fill={INK} />
              <path d="M-2 -1 L0 2 L2 -1" fill={GOLD} />
              <path d="M-12 -11 L-7 -14 M12 -11 L7 -14" strokeLinecap="round" />
            </g>
          </g>

          {/* ══ SARASWATI (right, blue — as in the painting) ══ */}
          <g>
            <LotusStalk x={688} base={520} h={150} sway />
            <JBody cx={620} top={392} w={150} h={128} color={BLUE} />
            <Arm x1={592} y1={432} x2={582} y2={490} bend={-10} w={8} />
            <Arm x1={648} y1={432} x2={664} y2={492} bend={10} w={8} />
            <JFace cx={620} cy={366} r={34} />
            {/* swan companion */}
            <g transform="translate(700 510)" stroke={INK} strokeWidth="2">
              <path d="M-12 5 Q-14 -5 -2 -5 Q3 -5 3 -12 Q3 -19 10 -17 Q15 -15 12 -9 L7 -5 Q16 -2 11 7 Q0 12 -12 5 Z" fill={CHALK} />
              <path d="M10 -16 L16 -13" strokeLinecap="round" stroke={GOLD} strokeWidth="3.4" />
              <circle cx="9" cy="-14" r="1.3" fill={INK} />
            </g>
          </g>

          {/* ══ DURGA (center) with baby Ganesh on her lap ══ */}
          <g>
            {/* upper arms — trishul & lotus */}
            <Arm x1={415} y1={378} x2={352} y2={310} bend={-16} />
            <Arm x1={485} y1={378} x2={548} y2={310} bend={16} />
            {/* trishul in her right (viewer left keeps lotus) */}
            <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
              <line x1="548" y1="336" x2="548" y2="248" stroke={INK} strokeWidth="7.5" strokeLinecap="round" />
              <line x1="548" y1="336" x2="548" y2="248" stroke={GOLD} strokeWidth="4" strokeLinecap="round" />
              <path d="M 535 254 Q 533 232 541 224 L 543 252 Z" fill={GOLD} />
              <path d="M 545 252 L 548 218 L 551 252 Z" fill={GOLD} />
              <path d="M 561 254 Q 563 232 555 224 L 553 252 Z" fill={GOLD} />
            </g>
            {/* lotus in upper left hand */}
            <g transform="translate(352 300)" stroke={INK} strokeWidth="2">
              <path d="M0 0 Q-9 -13 0 -21 Q9 -13 0 0 Z" fill="#d98a90" />
              <path d="M-3 -3 Q-16 -9 -12 -20 Q-3 -14 -3 -3 Z" fill={CHALK} />
              <path d="M3 -3 Q16 -9 12 -20 Q3 -14 3 -3 Z" fill={CHALK} />
            </g>

            <JBody cx={450} top={330} w={190} h={190} color={RED} />
            {/* lower arms embracing the baby */}
            <Arm x1={408} y1={398} x2={412} y2={478} bend={-22} w={10} />
            <Arm x1={492} y1={398} x2={488} y2={478} bend={22} w={10} />
            <JFace cx={450} cy={300} r={42} thirdEye />

            {/* ── baby Ganesh, cross-legged on her lap ── */}
            <g>
              {/* little body in chalk dhoti */}
              <path d="M 420 490 Q 418 462 450 458 Q 482 462 480 490 Q 466 500 450 500 Q 434 500 420 490 Z" fill={CHALK} stroke={INK} strokeWidth="2.8" />
              {/* crossed legs */}
              <path d="M 424 492 Q 450 504 476 492" fill="none" stroke={INK} strokeWidth="2.4" />
              {/* tiny arms holding a laddu */}
              <path d="M 428 470 Q 438 480 448 476" fill="none" stroke={INK} strokeWidth="7.5" strokeLinecap="round" />
              <path d="M 428 470 Q 438 480 448 476" fill="none" stroke={SKIN} strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="451" cy="476" r="5" fill={GOLD} stroke={INK} strokeWidth="1.6" />
              {/* big soft ears */}
              <ellipse cx="424" cy="432" rx="13" ry="16" fill={SKIN} stroke={INK} strokeWidth="2.2" />
              <ellipse cx="476" cy="432" rx="13" ry="16" fill={SKIN} stroke={INK} strokeWidth="2.2" />
              <ellipse cx="425" cy="433" rx="7" ry="10" fill="#d98a90" opacity="0.6" />
              <ellipse cx="475" cy="433" rx="7" ry="10" fill="#d98a90" opacity="0.6" />
              {/* round head */}
              <circle cx="450" cy="430" r="21" fill={SKIN} stroke={INK} strokeWidth="2.6" />
              {/* tiny fish eyes */}
              <path d="M 434 426 Q 440 420 447 426 Q 440 430 434 426 Z" fill="#fdf8ec" stroke={INK} strokeWidth="1.6" />
              <circle cx="441" cy="425" r="2.6" fill={INK} />
              <path d="M 453 426 Q 460 420 466 426 Q 459 430 453 426 Z" fill="#fdf8ec" stroke={INK} strokeWidth="1.6" />
              <circle cx="459" cy="425" r="2.6" fill={INK} />
              {/* slim little trunk curling toward the laddu */}
              <path d="M 450 440 q 2 8 -3 12 q -5 4 -2 8" fill="none" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
              <path d="M 450 440 q 2 8 -3 12 q -5 4 -2 8" fill="none" stroke={SKIN} strokeWidth="3.8" strokeLinecap="round" />
              {/* tiny gold crown */}
              <path d="M 436 414 Q 450 402 464 414 L 461 408 Q 450 398 439 408 Z" fill={GOLD} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
            </g>
          </g>

          {/* ══ little Kartik standing at Maa's knee ══ */}
          <g>
            {/* peacock feather */}
            <path d="M 549 462 q 10 -20 4 -34" fill="none" stroke={GREEN} strokeWidth="2.6" />
            <ellipse cx="554" cy="424" rx="6" ry="9" fill={GREEN} stroke={INK} strokeWidth="1.4" />
            <ellipse cx="554" cy="426" rx="3.4" ry="5" fill={BLUE} />
            <circle cx="554" cy="427" r="1.7" fill={GOLD} />
            <JBody cx={538} top={464} w={58} h={56} color={"#7a4a8c"} />
            <JFace cx={538} cy={450} r={15} />
          </g>

          {/* ══ chalk-white folk lion at her other knee ══ */}
          <g transform="translate(354 0)" stroke={INK} strokeWidth="2.2">
            <path d="M -36 520 Q -38 496 -14 492 L 22 492 Q 42 495 43 508 Q 44 520 34 520 Z" fill={CHALK} />
            <circle cx="0" cy="503" r="2" fill={INK} stroke="none" />
            <circle cx="12" cy="509" r="2" fill={INK} stroke="none" />
            <path d="M -20 504 Q -34 502 -30 490 Q -38 484 -28 478 Q -30 468 -18 472 Q -14 462 -4 470 Q 6 466 4 478 Q 12 484 4 492 Q 8 502 -6 502 Q -12 507 -20 504 Z" fill={GOLD} />
            <circle cx="-12" cy="487" r="9.5" fill={CHALK} />
            <path d="M -18 485 Q -13 480 -7 485 Q -12 489 -18 485 Z" fill="#fff" strokeWidth="1.4" />
            <circle cx="-12" cy="484" r="1.8" fill={INK} />
            <path d="M -15 492 Q -12 494 -9 492" fill="none" strokeLinecap="round" strokeWidth="1.4" />
            <path d="M 42 510 q 12 -6 10 -18 q 6 9 -1 20 q 6 1 3 6" fill="none" strokeWidth="2.4" strokeLinecap="round" />
          </g>

          {/* chalk fish pair on the ground (as in the painting) */}
          {[190, 690].map((x, i) => (
            <g key={x} transform={`translate(${x} 570) ${i === 1 ? "scale(-1,1)" : ""}`} stroke={INK} strokeWidth="1.8">
              <path d="M -18 0 Q -6 -9 8 -4 Q 14 -2 18 2 L 12 6 Q -2 10 -12 4 Q -16 2 -18 0 Z" fill={CHALK} />
              <path d="M 18 2 L 26 -3 L 25 7 Z" fill={CHALK} />
              <circle cx="-9" cy="0" r="1.6" fill={INK} />
              <path d="M -2 -2 Q 2 0 -2 3 M 4 -3 Q 8 0 4 4" fill="none" strokeWidth="1.2" opacity="0.7" />
            </g>
          ))}

          {/* ── diyas along the ground ── */}
          {[120, 260, 450, 640, 780].map((x, i) => (
            <g key={x}>
              <path d={`M ${x - 13} 588 Q ${x} 598 ${x + 13} 588 L ${x + 10} 579 L ${x - 10} 579 Z`} fill={RED} stroke={INK} strokeWidth="2" />
              <g className={`flame ${i % 3 === 1 ? "f2" : i % 3 === 2 ? "f3" : ""}`}>
                <path d={`M ${x} 560 C ${x + 6} 568 ${x + 5} 576 ${x} 579 C ${x - 5} 576 ${x - 6} 568 ${x} 560`} fill={GOLD} stroke={INK} strokeWidth="1.6" />
                <circle cx={x} cy={572} r="2.2" fill={CHALK} />
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
