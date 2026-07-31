"use client";

/**
 * The conversational registration experience.
 * One question at a time, answers shape the next step, smooth motion.
 * Modes: guest (default), member (prefilled family), day-of kiosk (?mode=dayof).
 *
 * NOTE: all presentational pieces (Card, H, Sub, NextBtn) live at MODULE scope.
 * Defining them inside the component gives them a new identity on every
 * render, which remounts the subtree on each keystroke (flicker + replayed
 * animations). Keep them out here.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { submitRegistration, validatePromoAction } from "./actions";
import { formatCents, cardProcessingFeeCents } from "@/lib/pricing";
import { sameDaySet } from "@/lib/event-days";
import { isEmail } from "@/lib/validation";
import JourneyScene from "@/components/register/JourneyScene";
import PhoneInput from "@/components/site/PhoneInput";

// ── types passed from the server ──
export type FlowEvent = {
  id: string;
  name: string;
  nameBengali: string | null;
  slug: string;
  days: { key: string; label: string; date: string }[];
  ticketTypes: {
    id: string;
    name: string;
    ageBand: string;
    dayKeys: string[] | null;
    withFood: boolean;
    checkInStart: string | null;
    priceMemberCents: number;
    priceNonmemberCents: number;
  }[];
};

export type FlowMemberContext = {
  isActiveMember: boolean;
  primaryName: string;
  email: string;
  phone: string;
  family: {
    firstName: string;
    lastName: string;
    relationship: string;
    dateOfBirth: string | null;
    foodPref: "veg" | "non_veg" | "kid";
    isMember: boolean;
  }[];
};

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  isKid: boolean;
  age?: number;
  isMemberFlagged: boolean;
  days: string[];
  withFood: boolean;
  foodPref: "veg" | "non_veg" | "kid" | "none";
  concertOnly: boolean;
  isStudent: boolean;
  student?: { eduEmail: string; university: string; city: string; gradYear: string };
};

type StepId = "welcome" | "you" | "party" | "days" | "food" | "extras" | "membership" | "donate" | "review" | "pay" | "done";

const spring = { type: "spring", stiffness: 260, damping: 26 } as const;

const STEP_TITLES: Record<StepId, string> = {
  welcome: "স্বাগতম",
  you: "তুমি",
  party: "পরিবার",
  days: "দিন",
  food: "ভোগ",
  extras: "বাড়তি",
  membership: "সদস্যপদ",
  donate: "দান",
  review: "দেখে নিন",
  pay: "টাকা",
  done: "শেষ",
};

function ageFromDob(dob: string | null): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

/** ── stable presentational pieces (module scope!) ── */

function Card({
  k, direction, accent = false, onBack, children,
}: { k: string; direction: number; accent?: boolean; onBack?: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      key={k}
      custom={direction}
      initial={{ opacity: 0, x: direction * 70, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: direction * -70, scale: 0.97 }}
      transition={spring}
      className="festive-card overflow-hidden w-full relative"
      style={accent ? { boxShadow: "var(--shadow)" } : undefined}
    >
      {/* festive accent bar */}
      <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, var(--marigold) 0%, var(--sindoor) 50%, var(--terracotta) 100%)" }} />
      {/* always-visible back button */}
      {onBack && (
        <button
          aria-label="Go back a step"
          onClick={onBack}
          className="absolute top-5 left-5 md:top-6 md:left-6 inline-flex items-center gap-1.5 rounded-full pl-3 pr-4 py-2 text-sm font-semibold transition-all hover:-translate-x-0.5"
          style={{ background: "var(--accent-soft)", color: "var(--sindoor)", border: "1.5px solid var(--line)" }}
        >
          ← Back
        </button>
      )}
      <div className={`p-7 md:p-11 ${onBack ? "pt-16 md:pt-16" : ""}`}>{children}</div>
    </motion.div>
  );
}

function H({ big, children }: { big?: boolean; children: React.ReactNode }) {
  return (
    <h2 className={`font-[family-name:var(--font-display)] font-black leading-tight mb-2.5 ${big ? "text-4xl md:text-5xl" : "text-3xl md:text-[40px]"}`}>
      {children}
    </h2>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-8 text-[17px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
      {children}
    </p>
  );
}

function NextBtn({ label = "Continue →", onClick, disabled, big }: { label?: string; onClick: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <button className={`btn-primary mt-9 w-full ${big ? "text-xl !py-5" : "text-lg !py-4"}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

function PersonRow({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="hairline rounded-2xl p-5" style={{ background: "var(--bg-soft)" }}>
      <p className="font-semibold text-lg mb-3">{title}</p>
      {children}
    </motion.div>
  );
}

/** ── live price panel (desktop side rail + mobile bottom sheet) ── */

type QuoteLine = { person: Person | null; label: string; typeName: string; price: number; memberPricing: boolean };

type OrderData = {
  lines: QuoteLine[];
  promoApplied: boolean;
  promoCode: string;
  promoDiscount: number;
  membershipCents: number;
  donationCents: number;
  donationLabel?: string;
  total: number;
  cardFee: number;
  passes: FlowEvent["ticketTypes"];
};

function passPrice(t: FlowEvent["ticketTypes"][number]): string {
  const m = t.priceMemberCents;
  const n = t.priceNonmemberCents;
  if (m === 0 && n <= 0) return "Free";
  if (n < 0) return `${formatCents(m)} · members`;
  return `${formatCents(n)} / ${formatCents(m)}★`;
}

/** Drop the leading category token ("Adult : …") — the group header carries it. */
function shortPassName(name: string): string {
  return name.replace(/^(Adult|Youth[^:·-]*|Kid[^:·-]*|Little[^:·-]*|Under\s*5|Concert)\s*[:·\-—]\s*/i, "").trim() || name;
}

const PASS_GROUPS: { keys: string[]; label: string }[] = [
  { keys: ["adult"], label: "Adult" },
  { keys: ["child_5_18", "child_5_12"], label: "Youth 5–18" },
  { keys: ["student"], label: "Student" },
  { keys: ["child_under_5"], label: "Under 5" },
  { keys: ["concert"], label: "Concert" },
  { keys: ["addon"], label: "Extras" },
];

function OrderLines({ lines, promoApplied, promoCode, promoDiscount, membershipCents, donationCents, donationLabel = "Donation" }: OrderData) {
  return (
    <div className="divide-y" style={{ borderColor: "var(--line)" }}>
      {lines.length === 0 ? (
        <p className="text-sm py-2.5" style={{ color: "var(--ink-soft)" }}>
          Add people and pick days to see prices build up here.
        </p>
      ) : (
        lines.map((l) => (
          <div key={l.person ? `${l.person.id}-${l.label}` : `addon-${l.typeName}`} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {l.person ? `${l.person.isStudent ? "🎓" : l.person.isKid ? "🧒" : "🧑"} ${l.person.firstName}` : `🎫 ${l.typeName}`}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>
                {l.person
                  ? `${l.label}${l.person.concertOnly ? " · concert" : l.person.isStudent ? (l.person.withFood ? " · student · food" : " · student") : l.person.isKid ? ((l.person.age ?? 6) < 5 ? " · under 5 · free" : " · youth · meal incl.") : l.person.withFood ? " · with food" : " · no food"}`
                  : `Add-on ${l.label}`}
                {l.memberPricing && " · member"}
              </p>
            </div>
            <p className="text-sm font-bold whitespace-nowrap">{l.price === 0 ? "Free" : formatCents(l.price)}</p>
          </div>
        ))
      )}
      {promoApplied && (
        <div className="flex items-center justify-between py-2 text-sm font-semibold" style={{ color: "var(--leaf-deep)" }}>
          <span>Promo {promoCode}</span>
          <span>−{formatCents(promoDiscount)}</span>
        </div>
      )}
      {membershipCents > 0 && (
        <div className="flex items-center justify-between py-2 text-sm">
          <span>🌟 Membership · 1 year</span>
          <span className="font-semibold">{formatCents(membershipCents)}</span>
        </div>
      )}
      {donationCents > 0 && (
        <div className="flex items-center justify-between py-2 text-sm">
          <span>🙏 {donationLabel}</span>
          <span className="font-semibold">{formatCents(donationCents)}</span>
        </div>
      )}
    </div>
  );
}

function PassList({ passes }: { passes: FlowEvent["ticketTypes"] }) {
  if (passes.length === 0) return null;
  const known = new Set(PASS_GROUPS.flatMap((g) => g.keys));
  const groups = [
    ...PASS_GROUPS.map((g) => ({ label: g.label, items: passes.filter((t) => g.keys.includes(t.ageBand)) })),
    { label: "Other", items: passes.filter((t) => !known.has(t.ageBand)) },
  ].filter((g) => g.items.length > 0);
  const priceOf = (t: FlowEvent["ticketTypes"][number]) => (t.priceNonmemberCents >= 0 ? t.priceNonmemberCents : t.priceMemberCents);
  const range = (items: FlowEvent["ticketTypes"]) => {
    const p = items.map(priceOf);
    const lo = Math.min(...p);
    const hi = Math.max(...p);
    return lo === hi ? formatCents(lo) : `${formatCents(lo)} – ${formatCents(hi)}`;
  };
  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
      <p className="text-sm font-black mb-2">Passes at a glance</p>
      <div className="grid gap-1.5">
        {groups.map((g) => (
          <div key={g.label} className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--terracotta)" }}>{g.label}</span>
            <span className="text-xs font-semibold whitespace-nowrap">{range(g.items)}</span>
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="text-xs font-semibold cursor-pointer select-none" style={{ color: "var(--sindoor)" }}>See every price</summary>
        <p className="text-[10px] mt-1.5 mb-2" style={{ color: "var(--ink-soft)" }}>guest / member★</p>
        <div className="grid gap-2.5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--terracotta)" }}>{g.label}</p>
              <div className="grid gap-0.5">
                {g.items.map((t) => (
                  <div key={t.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate" style={{ color: "var(--ink-soft)" }}>{shortPassName(t.name)}</span>
                    <span className="whitespace-nowrap">{passPrice(t)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function TotalRow({ total, cardFee }: { total: number; cardFee: number }) {
  return (
    <>
      <div className="flex items-baseline justify-between mt-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
        <span className="font-bold">Total</span>
        <motion.span
          key={total}
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          className="font-[family-name:var(--font-display)] text-2xl font-black"
          style={{ color: "var(--sindoor)" }}
        >
          {formatCents(total)}
        </motion.span>
      </div>
      {total > 0 && (
        <p className="text-[11px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
          +{formatCents(cardFee)} card processing fee.
        </p>
      )}
    </>
  );
}

function DesktopOrderRail(props: OrderData) {
  return (
    <aside className="hidden lg:block sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
      <div className="festive-card p-5">
        <p className="font-[family-name:var(--font-display)] text-lg font-black mb-3">Your order</p>
        <OrderLines {...props} />
        <TotalRow total={props.total} cardFee={props.cardFee} />
        <PassList passes={props.passes} />
      </div>
    </aside>
  );
}

function MobileOrderBar(props: OrderData) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-40">
      {open && (
        <div className="mx-auto max-w-3xl px-4">
          <div className="festive-card p-4 mb-2 max-h-[55vh] overflow-auto" style={{ boxShadow: "var(--shadow)" }}>
            <OrderLines {...props} />
            <TotalRow total={props.total} cardFee={props.cardFee} />
            <PassList passes={props.passes} />
          </div>
        </div>
      )}
      <div className="border-t" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-sm font-semibold inline-flex items-center gap-1.5"
            style={{ color: "var(--sindoor)" }}
          >
            {open ? "Hide breakdown ▾" : "View breakdown ▴"}
          </button>
          <div className="text-right leading-none">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Total so far</p>
            <p className="font-[family-name:var(--font-display)] text-xl font-black mt-0.5" style={{ color: "var(--sindoor)" }}>
              {formatCents(props.total)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── availability engine: every selection must resolve to a real, created pass ──
type FlowTT = FlowEvent["ticketTypes"][number];
type FlowDay = FlowEvent["days"][number];

const BAND_LABEL: Record<string, string> = {
  adult: "adult",
  student: "student",
  child_5_18: "youth (5–18)",
  child_5_12: "youth",
  child_under_5: "under-5",
};
const picksFood = (band: string) => band === "adult" || band === "student";

function personBand(p: { isStudent: boolean; isKid: boolean; age?: number }): string {
  // A "kid" aged 18+ is an adult — never let an adult ride on youth pricing.
  const kid = p.isKid && (p.age === undefined || p.age < 18);
  return p.isStudent ? "student" : kid ? ((p.age ?? 6) < 5 ? "child_under_5" : "child_5_18") : "adult";
}

/** Day passes (not concert/add-on) that serve a given band. */
function bandDayPasses(tts: FlowTT[], band: string): FlowTT[] {
  return tts.filter((t) => {
    if (t.ageBand === "concert" || t.ageBand === "addon") return false;
    return t.ageBand === band || t.ageBand === "all" || (band === "child_5_18" && t.ageBand === "child_5_12");
  });
}

/** Does a real pass cover exactly these days + this food choice for the band? */
function matchDayPass(passes: FlowTT[], days: string[], withFood: boolean, band: string): { type: FlowTT; exact: boolean } | null {
  if (days.length === 0) return null;
  const cands = passes.filter((t) => (picksFood(band) ? t.withFood === withFood : true));
  const exact = cands.find((t) => Array.isArray(t.dayKeys) && sameDaySet(t.dayKeys as string[], days));
  if (exact) return { type: exact, exact: true };
  const perday = cands.find((t) => t.dayKeys == null);
  if (perday) return { type: perday, exact: false };
  return null;
}

function comboLabelOf(days: string[], eventDays: FlowDay[], dayCount: number): string {
  if (days.length >= dayCount) return "All days";
  return days.map((k) => eventDays.find((d) => d.key === k)?.label.split(",")[0] ?? k.toUpperCase()).join(" + ");
}

/** The day-combos an admin actually created passes for (for quick-fix + messaging). */
function availableCombos(passes: FlowTT[], eventDays: FlowDay[], dayCount: number): { key: string; days: string[]; label: string }[] {
  const out = new Map<string, string[]>();
  for (const t of passes) {
    if (Array.isArray(t.dayKeys) && t.dayKeys.length) {
      const key = [...(t.dayKeys as string[])].sort().join(",");
      if (!out.has(key)) out.set(key, t.dayKeys as string[]);
    } else if (t.dayKeys == null) {
      for (const d of eventDays) if (!out.has(d.key)) out.set(d.key, [d.key]);
    }
  }
  return [...out.values()]
    .sort((a, b) => b.length - a.length)
    .map((days) => ({ key: [...days].sort().join(","), days, label: comboLabelOf(days, eventDays, dayCount) }));
}

/** Which food options exist for a band on these days. */
function foodAvail(passes: FlowTT[], days: string[]): { withFood: boolean; noFood: boolean } {
  const matching = passes.filter((t) => (Array.isArray(t.dayKeys) && sameDaySet(t.dayKeys as string[], days)) || t.dayKeys == null);
  return { withFood: matching.some((t) => t.withFood), noFood: matching.some((t) => !t.withFood) };
}

/** A valid default selection for a band — never lands on a non-existent combo. */
function defaultSelection(passes: FlowTT[], eventDayKeys: string[]): { days: string[]; withFood: boolean } {
  if (passes.length === 0) return { days: eventDayKeys, withFood: true }; // no pass → will be flagged
  const isAll = (t: FlowTT) => Array.isArray(t.dayKeys) && sameDaySet(t.dayKeys as string[], eventDayKeys);
  if (passes.some(isAll)) return { days: eventDayKeys, withFood: passes.some((t) => isAll(t) && t.withFood) };
  if (passes.some((t) => t.dayKeys == null)) return { days: eventDayKeys, withFood: passes.some((t) => t.dayKeys == null && t.withFood) };
  const first = passes.find((t) => Array.isArray(t.dayKeys) && (t.dayKeys as string[]).length) ?? passes[0];
  const days = Array.isArray(first?.dayKeys) ? (first!.dayKeys as string[]) : eventDayKeys;
  return { days, withFood: passes.some((t) => Array.isArray(t.dayKeys) && sameDaySet(t.dayKeys as string[], days) && t.withFood) };
}

export default function RegisterFlow({
  event,
  member,
  dayOfMode,
  discountMode,
  idleResetSeconds = 90,
  squareEnabled = true,
  zelleEnabled = true,
  membershipPriceCents = 3500,
  concertDay = null,
  memberMode = "honor",
  donateLineLabel = "Donation",
  donateLineLabelLong = "Donation to Pragati",
  donateTitle = "Add a little extra? 🙏",
  donateIntro = "Pragati is a volunteer-run 501(c)(3) nonprofit. A small donation on top of your tickets helps keep the pujo, the bhog, and the culture thriving — and it's tax-deductible. Totally optional.",
}: {
  event: FlowEvent;
  member: FlowMemberContext | null;
  dayOfMode: boolean;
  discountMode: "per_adult" | "whole_family";
  idleResetSeconds?: number;
  squareEnabled?: boolean;
  zelleEnabled?: boolean;
  membershipPriceCents?: number;
  concertDay?: string | null;
  memberMode?: "honor" | "verify";
  donateTitle?: string;
  donateIntro?: string;
  donateLineLabel?: string;
  donateLineLabelLong?: string;
}) {
  const router = useRouter();
  const dayCount = Math.max(event.days.length, 1);

  // ── concert passes (ageBand "concert"): sold via their own opt-in, food-free ──
  const concertPasses = useMemo(() => event.ticketTypes.filter((t) => t.ageBand === "concert"), [event.ticketTypes]);
  const concertDays = useMemo(
    () =>
      event.days
        .map((d) => {
          const pass = concertPasses.find((t) => t.dayKeys == null || (t.dayKeys ?? []).includes(d.key));
          return pass ? { key: d.key, label: d.label, passName: pass.name, time: pass.checkInStart ?? null } : null;
        })
        .filter((x): x is { key: string; label: string; passName: string; time: string | null } => x !== null),
    [event.days, concertPasses]
  );
  const concertDayKeys = useMemo(() => concertDays.map((d) => d.key), [concertDays]);
  const hasConcert = concertDays.length > 0;
  // arriving from a poster "buy concert" link — start everyone in concert mode for that day
  const initialConcertDay = concertDay && concertDayKeys.includes(concertDay) ? concertDay : null;

  // ── add-on / extra passes (ageBand "addon"): lunch, dinner, parking… ──
  const addonPasses = useMemo(() => event.ticketTypes.filter((t) => t.ageBand === "addon"), [event.ticketTypes]);
  const hasAddons = addonPasses.length > 0;

  // ── student passes (ageBand "student"): edu ID required, own price ──
  const hasStudent = useMemo(() => event.ticketTypes.some((t) => t.ageBand === "student"), [event.ticketTypes]);
  const todayKey = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return event.days.find((d) => d.date === today)?.key ?? event.days[0]?.key ?? "all";
  }, [event.days]);

  const isMemberPurchase = !!member?.isActiveMember;
  // Honor-system "I'm already a member" — only when NOT signed in as a member,
  // not the day-of kiosk, and the site is in "honor" mode (the backdoor).
  const canDeclareMember = !isMemberPurchase && !dayOfMode && memberMode === "honor";

  // ── state ──
  const [step, setStep] = useState<StepId>(member || dayOfMode || initialConcertDay ? "you" : "welcome");
  const [direction, setDirection] = useState(1);
  const [buyerName, setBuyerName] = useState(member?.primaryName ?? "");
  const [buyerEmail, setBuyerEmail] = useState(member?.email ?? "");
  const [buyerPhone, setBuyerPhone] = useState(member?.phone ?? "");
  const [people, setPeople] = useState<Person[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<{ state: "idle" | "checking" | "applied" | "invalid"; discountCents: number; note: string }>({ state: "idle", discountCents: 0, note: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneConf, setDoneConf] = useState("");
  const [doneTotal, setDoneTotal] = useState(0);
  const [wantsMembership, setWantsMembership] = useState(false);
  const [selfDeclaredMember, setSelfDeclaredMember] = useState(false);
  // True once they pick "Yes, I'm a member" at the welcome fork. Guests who pick
  // "I'm new here" never see the member checkbox (it would just confuse them).
  const [enteredAsMember, setEnteredAsMember] = useState(false);
  // The "become a member for $X" upsell is always offered to guests, EXCEPT
  // once they've claimed existing membership (the two are mutually exclusive).
  const canJoinMembership = !isMemberPurchase && !dayOfMode && !selfDeclaredMember;
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [donationCents, setDonationCents] = useState(0);
  const [selfIsStudent, setSelfIsStudent] = useState(false);
  const [selfStudent, setSelfStudent] = useState({ eduEmail: "", university: "", city: "", gradYear: "" });

  // add-person mini-form
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<"adult" | "kid" | "student" | null>(null);
  const [draftAge, setDraftAge] = useState("");
  const [draftStudent, setDraftStudent] = useState({ eduEmail: "", university: "", city: "", gradYear: "" });

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = member || dayOfMode ? [] : ["welcome"];
    const daysStep: StepId[] = dayOfMode || dayCount === 1 ? [] : (["days"] as StepId[]);
    const extrasStep: StepId[] = hasAddons ? (["extras"] as StepId[]) : [];
    const joinStep: StepId[] = canJoinMembership ? (["membership"] as StepId[]) : [];
    const donateStep: StepId[] = dayOfMode ? [] : (["donate"] as StepId[]);
    return [...base, "you", "party", ...daysStep, "food", ...extrasStep, ...joinStep, ...donateStep, "review", "pay"];
  }, [member, dayOfMode, dayCount, canJoinMembership, hasAddons]);
  const stepIndex = steps.indexOf(step);

  const go = (next: StepId, dir = 1) => {
    setDirection(dir);
    setError("");
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goNext = () => go(steps[Math.min(stepIndex + 1, steps.length - 1)], 1);
  const goBack = () => (stepIndex > 0 ? go(steps[stepIndex - 1], -1) : undefined);

  // day-of kiosk: reset for the next family after inactivity
  useEffect(() => {
    if (!dayOfMode) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.location.reload(), idleResetSeconds * 1000);
    };
    arm();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, arm));
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, arm));
    };
  }, [dayOfMode, idleResetSeconds]);

  // Keep each person's food choice valid for what their pass actually offers
  // (e.g., a student pass that's food-included can't be "no food").
  useEffect(() => {
    setPeople((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (p.concertOnly || p.isKid) return p;
        const fa = foodAvail(bandDayPasses(event.ticketTypes, personBand(p)), p.days);
        if (p.withFood && !fa.withFood && fa.noFood) {
          changed = true;
          return { ...p, withFood: false, foodPref: "none" as const };
        }
        if (!p.withFood && !fa.noFood && fa.withFood) {
          changed = true;
          return { ...p, withFood: true, foodPref: (p.foodPref === "none" ? "non_veg" : p.foodPref) as Person["foodPref"] };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [people, event.ticketTypes]);

  // ── pricing mirror (display only — server re-prices authoritatively) ──
  const quote = useMemo(() => {
    // Joining now OR claiming existing membership → whole-household member pricing.
    const householdMemberPricing = wantsMembership || selfDeclaredMember;
    const lines: { person: Person | null; label: string; typeName: string; price: number; memberPricing: boolean }[] = [];
    const issues: { person: Person; band: string; reason: string; combos: { key: string; days: string[]; label: string }[]; food: { withFood: boolean; noFood: boolean } }[] = [];
    for (const p of people) {
      // Concert-only person: one concert-pass line per chosen concert day, no food.
      if (p.concertOnly) {
        for (const dayKey of p.days) {
          const pass = concertPasses.find((t) => t.dayKeys == null || (t.dayKeys ?? []).includes(dayKey));
          if (!pass) continue;
          const memberPricing = householdMemberPricing || (isMemberPurchase && (p.isMemberFlagged || discountMode === "whole_family"));
          const unit = memberPricing ? pass.priceMemberCents : pass.priceNonmemberCents;
          const dLabel = event.days.find((d) => d.key === dayKey)?.label ?? dayKey.toUpperCase();
          lines.push({ person: p, label: `🎶 ${dLabel}`, typeName: pass.name, price: unit < 0 ? 0 : unit, memberPricing });
        }
        continue;
      }
      const band = personBand(p);
      const passes = bandDayPasses(event.ticketTypes, band);
      const label = comboLabelOf(p.days, event.days, dayCount);
      const m = matchDayPass(passes, p.days, p.withFood, band);
      if (!m) {
        // Under-5 is the ONLY category that's automatically free with no pass.
        if (p.isKid && (p.age ?? 6) < 5) {
          lines.push({ person: p, label, typeName: "Under 5", price: 0, memberPricing: false });
        } else {
          // No real pass matches — flag it instead of silently charging $0.
          issues.push({
            person: p,
            band,
            reason:
              passes.length === 0
                ? `No ${BAND_LABEL[band] ?? band} pass exists for this event yet.`
                : `No ${BAND_LABEL[band] ?? band} pass covers ${label || "these days"}${picksFood(band) ? ` (${p.withFood ? "with food" : "no food"})` : ""}.`,
            combos: availableCombos(passes, event.days, dayCount),
            food: foodAvail(passes, p.days),
          });
        }
        continue;
      }
      const { type, exact } = m;
      const memberPricing = householdMemberPricing || (isMemberPurchase && (p.isKid || discountMode === "whole_family" || p.isMemberFlagged));
      const unit = memberPricing ? type.priceMemberCents : type.priceNonmemberCents;
      const units = exact ? 1 : p.days.length;
      lines.push({ person: p, label, typeName: type.name, price: (unit < 0 ? 0 : unit) * units, memberPricing });
    }
    // Add-on / extra passes — quantity × price, member pricing for members.
    for (const t of addonPasses) {
      const qty = addonQty[t.id] ?? 0;
      if (qty <= 0) continue;
      const memberPricing = householdMemberPricing || isMemberPurchase;
      const unit = memberPricing ? t.priceMemberCents : t.priceNonmemberCents;
      lines.push({ person: null, label: `×${qty}`, typeName: t.name, price: (unit < 0 ? 0 : unit) * qty, memberPricing });
    }
    const subtotal = lines.reduce((s, l) => s + l.price, 0);
    return { lines, subtotal, issues };
  }, [people, event.ticketTypes, event.days, concertPasses, addonPasses, addonQty, dayCount, isMemberPurchase, discountMode, wantsMembership, selfDeclaredMember]);

  const firstName = buyerName.trim().split(" ")[0] || "friend";
  const membershipCents = wantsMembership ? membershipPriceCents : 0;
  const total = Math.max(0, quote.subtotal - promo.discountCents) + membershipCents + donationCents;
  const cardFee = cardProcessingFeeCents(total);
  const cardTotal = total + cardFee;

  // Availability guards — a selection must resolve to a real, created pass.
  const eventDayKeys = event.days.map((d) => d.key);
  const defaultsFor = (band: string) => defaultSelection(bandDayPasses(event.ticketTypes, band), eventDayKeys);
  const hasIssues = quote.issues.length > 0;
  const issueByPerson = new Map(quote.issues.map((i) => [i.person.id, i]));
  // Day-combo validity (food-agnostic) — drives the days-step warnings/blocking.
  const bandDayOk = (p: Person) => {
    if (p.concertOnly || p.days.length === 0) return true;
    if (p.isKid && (p.age ?? 6) < 5) return true; // under-5 is always fine (free)
    const bp = bandDayPasses(event.ticketTypes, personBand(p));
    return bp.some((t) => (Array.isArray(t.dayKeys) && sameDaySet(t.dayKeys as string[], p.days)) || t.dayKeys == null);
  };
  const combosFor = (p: Person) => availableCombos(bandDayPasses(event.ticketTypes, personBand(p)), event.days, dayCount);
  const daysStepBlocked = people.some((p) => p.days.length === 0 || !bandDayOk(p));
  // Food availability for a person given their current days.
  const foodFor = (p: Person) => foodAvail(bandDayPasses(event.ticketTypes, personBand(p)), p.days);

  // Live price panel — shown on the selection/checkout steps so the running
  // total is never a surprise. Hidden on the intro, "you", and done screens.
  const showPanel = step !== "welcome" && step !== "you" && step !== "done";
  const orderData: OrderData = {
    lines: quote.lines,
    promoApplied: promo.state === "applied",
    promoCode,
    promoDiscount: promo.discountCents,
    membershipCents,
    donationCents,
    donationLabel: donateLineLabel,
    total,
    cardFee,
    passes: event.ticketTypes,
  };

  // Add or refresh "self" (the buyer) — respects the "I'm a student" choice and
  // keeps any day/food tweaks the buyer already made if their category is unchanged.
  const ensureSelfInParty = () => {
    const [fn, ...rest] = buyerName.trim().split(" ");
    const selfStudent2 = !initialConcertDay && selfIsStudent;
    const band = selfStudent2 ? "student" : "adult";
    const def = initialConcertDay
      ? { days: [initialConcertDay], withFood: false }
      : dayOfMode
        ? { days: [todayKey], withFood: true }
        : defaultsFor(band);
    const built: Person = {
      id: "self",
      firstName: fn,
      lastName: rest.join(" "),
      isKid: false,
      isMemberFlagged: isMemberPurchase,
      days: def.days,
      withFood: initialConcertDay ? false : def.withFood,
      foodPref: initialConcertDay ? "none" : def.withFood ? "non_veg" : "none",
      concertOnly: !!initialConcertDay,
      isStudent: selfStudent2,
      student: selfStudent2 ? { ...selfStudent } : undefined,
    };
    setPeople((prev) => {
      const existing = prev.find((p) => p.id === "self");
      const others = prev.filter((p) => p.id !== "self");
      // preserve the buyer's earlier day/food/concert tweaks when category didn't change
      const merged: Person =
        existing && existing.isStudent === built.isStudent
          ? { ...built, days: existing.days, withFood: existing.withFood, foodPref: existing.foodPref, concertOnly: existing.concertOnly }
          : built;
      return [merged, ...others];
    });
  };

  // Flip one person (or everyone) between a full pujo pass and a concert-only ticket.
  const applyConcert = (p: Person, on: boolean): Person => {
    if (on) return { ...p, concertOnly: true, days: concertDayKeys, withFood: false, foodPref: "none" };
    const def = defaultsFor(personBand({ isStudent: p.isStudent, isKid: p.isKid, age: p.age }));
    return {
      ...p,
      concertOnly: false,
      days: def.days,
      withFood: p.isKid ? true : def.withFood,
      foodPref: p.isKid ? "kid" : def.withFood ? "non_veg" : "none",
    };
  };
  const togglePersonConcert = (id: string, on: boolean) =>
    setPeople((prev) => prev.map((p) => (p.id === id ? applyConcert(p, on) : p)));
  const setAllConcert = (on: boolean) => setPeople((prev) => prev.map((p) => applyConcert(p, on)));

  const addDraft = () => {
    if (!draftName.trim() || !draftKind) return;
    const [fn, ...rest] = draftName.trim().split(" ");

    // Enforce that a "kid" is actually under 18 — 18+ is an adult, always.
    let effKind: "adult" | "kid" | "student" = draftKind;
    let kidAge: number | undefined;
    if (draftKind === "kid") {
      const a = parseInt(draftAge, 10);
      if (!draftAge.trim() || Number.isNaN(a)) return setError("Please enter the child's age.");
      if (a < 0 || a > 120) return setError("Please enter a valid age.");
      if (a >= 18) {
        effKind = "adult"; // switch the category — no adult on youth pricing
        setError(`${fn} is 18 or older, so we've added them as an adult.`);
      } else {
        kidAge = a;
        setError("");
      }
    } else {
      setError("");
    }

    const isKidP = effKind === "kid";
    const isStudentP = effKind === "student";
    const band = personBand({ isStudent: isStudentP, isKid: isKidP, age: kidAge });
    const def = initialConcertDay
      ? { days: [initialConcertDay], withFood: false }
      : dayOfMode
        ? { days: [todayKey], withFood: true }
        : defaultsFor(band);
    setPeople((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        firstName: fn,
        lastName: rest.join(" "),
        isKid: isKidP,
        age: kidAge,
        isMemberFlagged: false,
        days: def.days,
        withFood: initialConcertDay ? false : def.withFood,
        foodPref: initialConcertDay ? "none" : isKidP ? "kid" : def.withFood ? "non_veg" : "none",
        concertOnly: !!initialConcertDay,
        isStudent: isStudentP,
        student: isStudentP ? { ...draftStudent } : undefined,
      },
    ]);
    setDraftName("");
    setDraftKind(null);
    setDraftAge("");
    setDraftStudent({ eduEmail: "", university: "", city: "", gradYear: "" });
  };

  const toggleFamily = (f: FlowMemberContext["family"][number]) => {
    const key = `fam-${f.firstName}-${f.lastName}`;
    setPeople((prev) => {
      if (prev.some((p) => p.id === key)) return prev.filter((p) => p.id !== key);
      const age = ageFromDob(f.dateOfBirth);
      const isKid = f.relationship === "child" && (age === undefined || age < 18);
      const def = initialConcertDay
        ? { days: [initialConcertDay], withFood: false }
        : dayOfMode
          ? { days: [todayKey], withFood: true }
          : defaultsFor(personBand({ isStudent: false, isKid, age }));
      return [
        ...prev,
        {
          id: key,
          firstName: f.firstName,
          lastName: f.lastName,
          isKid,
          age,
          isMemberFlagged: f.isMember,
          days: def.days,
          withFood: initialConcertDay ? false : def.withFood,
          foodPref: initialConcertDay ? "none" : isKid ? "kid" : def.withFood ? f.foodPref : "none",
          concertOnly: !!initialConcertDay,
          isStudent: false,
        },
      ];
    });
  };

  const updatePerson = (id: string, patch: Partial<Person>) =>
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const submit = async (paymentMethod: "square" | "zelle" | "offline") => {
    if (hasIssues) {
      setError("Some passes don't match what's offered for this event — please fix the highlighted people before paying.");
      go("days", -1);
      return;
    }
    setBusy(true);
    setError("");
    const res = await submitRegistration({
      eventId: event.id,
      buyerName,
      buyerEmail,
      buyerPhone,
      paymentMethod,
      promoCode: promo.state === "applied" ? promoCode : undefined,
      source: dayOfMode ? "day_of_kiosk" : "web",
      wantsMembership,
      selfDeclaredMember,
      attendees: people.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName || undefined,
        isKid: p.isKid,
        age: p.age,
        isMemberFlagged: p.isMemberFlagged,
        days: p.days,
        withFood: p.concertOnly ? false : p.withFood,
        foodPref: p.concertOnly ? "none" : p.isKid ? "kid" : p.withFood ? p.foodPref : "none",
        concertOnly: p.concertOnly,
        isStudent: p.isStudent,
        student: p.student,
      })),
      addons: addonPasses.map((t) => ({ ticketTypeId: t.id, qty: addonQty[t.id] ?? 0 })).filter((a) => a.qty > 0),
      donationCents,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.kind === "square_redirect") return router.push(res.url);
    if (res.kind === "zelle") return router.push(`/checkout/zelle/${res.conf}`);
    setDoneConf(res.conf);
    setDoneTotal(res.totalCents);
    setDirection(1);
    setStep("done");
  };

  return (
    <div className="relative">
      {/* soft festive backdrop */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 400px at 80% -5%, var(--marigold-pale) 0%, transparent 55%), radial-gradient(700px 380px at 5% 105%, var(--accent-soft) 0%, transparent 60%)",
        }}
      />
      <span className="petal-drop" style={{ left: "8%", animationDelay: "1s" }} aria-hidden />
      <span className="petal-drop pale" style={{ left: "88%", animationDelay: "5s" }} aria-hidden />

      <div className={`mx-auto max-w-3xl px-5 py-8 md:py-10 ${showPanel ? "lg:max-w-[1280px] lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:items-start" : ""}`}>
        <div className={`min-w-0 ${showPanel ? "pb-24 lg:pb-0" : ""}`}>
        {/* the Pujo Journey — your family walks to the pandal as you answer */}
        <JourneyScene step={step} people={people.map((p) => ({ isKid: p.isKid }))} />
        {step !== "done" && (
          <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] mb-6" style={{ color: "var(--ink-soft)" }}>
            Step {stepIndex + 1} of {steps.length} ·{" "}
            <span className="font-[family-name:var(--font-bangla)] normal-case tracking-normal text-sm" style={{ color: "var(--terracotta)" }}>
              {STEP_TITLES[step]}
            </span>{" "}
            · {event.name} {dayOfMode && "· walk-in"}
          </p>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          {/* ── WELCOME ── */}
          {step === "welcome" && (
            <Card k="welcome" direction={direction}>
              <H>Namaskar! 🙏</H>
              <Sub>Let&apos;s get you to {event.name}. First — are you a Pragati member?</Sub>
              <div className="grid gap-4">
                <button
                  className="choice-chip !p-5"
                  onClick={() => {
                    // Honor mode: no sign-in — just note the claim and continue to
                    // the same details page as everyone else (member pricing applies,
                    // and we save them as a member once they pay).
                    if (memberMode === "honor") {
                      setSelfDeclaredMember(true);
                      setEnteredAsMember(true);
                      goNext();
                    } else {
                      // Verify mode: real accounts — sign in to load family + pricing.
                      router.push(`/login?next=/register?event=${event.slug}`);
                    }
                  }}
                >
                  <span className="text-2xl">🪔</span>
                  <span>
                    <strong className="text-lg">Yes, I&apos;m a member</strong>
                    <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                      {memberMode === "honor"
                        ? "No sign-in needed — you'll get member pricing on the next step"
                        : "Sign in — your family and member pricing load automatically"}
                    </span>
                  </span>
                </button>
                <button
                  className="choice-chip !p-5"
                  onClick={() => {
                    setSelfDeclaredMember(false);
                    setEnteredAsMember(false);
                    goNext();
                  }}
                >
                  <span className="text-2xl">✨</span>
                  <span>
                    <strong className="text-lg">I&apos;m new here</strong>
                    <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                      No account needed — register as a guest in 2 minutes
                    </span>
                  </span>
                </button>
              </div>
            </Card>
          )}

          {/* ── YOU ── */}
          {step === "you" && (
            <Card k="you" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H big={dayOfMode}>
                {member ? `Welcome back${member.primaryName ? `, ${member.primaryName.split(" ")[0]}` : ""}! 🪔` : dayOfMode ? "Welcome! 🙏" : "Lovely — let's start with you."}
              </H>
              <Sub>{member ? "Confirm your details and we'll move on." : "Who should the tickets go to?"}</Sub>
              <div className="grid gap-4">
                <input className={`input ${dayOfMode ? "text-lg !py-4" : "!py-3.5"}`} placeholder="Your full name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} autoFocus />
                <input
                  className={`input ${dayOfMode ? "text-lg !py-4" : "!py-3.5"}`}
                  type="email"
                  placeholder={selfIsStudent ? "Email for tickets (optional — we'll use your .edu)" : "Email (required) — your tickets land here"}
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                />
                <PhoneInput className={`input ${dayOfMode ? "text-lg !py-4" : "!py-3.5"}`} onChange={setBuyerPhone} />
              </div>

              {hasStudent && !isMemberPurchase && !dayOfMode && (
                <>
                  <label className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer" style={{ background: "var(--accent-soft)" }}>
                    <input type="checkbox" className="accent-[var(--sindoor)] w-4 h-4 mt-0.5" checked={selfIsStudent} onChange={(e) => setSelfIsStudent(e.target.checked)} />
                    <span className="text-sm">
                      <strong>🎓 I&apos;m a student</strong> — register yourself at the student rate (bring your student ID to the gate)
                    </span>
                  </label>
                  {selfIsStudent && (
                    <div className="mt-3 grid sm:grid-cols-2 gap-3">
                      <input className="input !py-3" type="email" placeholder="School email (.edu) — required" value={selfStudent.eduEmail} onChange={(e) => setSelfStudent((s) => ({ ...s, eduEmail: e.target.value }))} />
                      <input className="input !py-3" placeholder="University / college" value={selfStudent.university} onChange={(e) => setSelfStudent((s) => ({ ...s, university: e.target.value }))} />
                      <input className="input !py-3" placeholder="City" value={selfStudent.city} onChange={(e) => setSelfStudent((s) => ({ ...s, city: e.target.value }))} />
                      <input className="input !py-3" type="text" inputMode="numeric" maxLength={4} placeholder="Expected grad year (e.g. 2027)" value={selfStudent.gradYear} onChange={(e) => setSelfStudent((s) => ({ ...s, gradYear: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                    </div>
                  )}
                </>
              )}

              {canDeclareMember && enteredAsMember && (
                <>
                  <label className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer" style={{ background: "var(--accent-soft)" }}>
                    <input type="checkbox" className="accent-[var(--sindoor)] w-4 h-4 mt-0.5" checked={selfDeclaredMember} onChange={(e) => setSelfDeclaredMember(e.target.checked)} />
                    <span className="text-sm">
                      <strong>🌟 I&apos;m already a Pragati member</strong> — your household gets member pricing. No sign-in needed; just your name and email above.
                    </span>
                  </label>
                  {selfDeclaredMember && (
                    <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                      If your membership has lapsed, please renew now.
                    </p>
                  )}
                </>
              )}

              {member && !member.isActiveMember && (
                <p className="mt-4 text-sm rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)" }}>
                  Your membership isn&apos;t active yet, so non-member pricing applies for now.
                </p>
              )}
              {error && (
                <p className="mt-4 text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
                  {error}
                </p>
              )}
              <NextBtn
                big={dayOfMode}
                onClick={() => {
                  if (!buyerName.trim()) return setError("Please enter your name to continue.");
                  if (selfIsStudent) {
                    if (!isEmail(selfStudent.eduEmail)) return setError("Please enter your school (.edu) email — it's required for the student rate.");
                  } else if (!isEmail(buyerEmail)) {
                    return setError("Please enter a valid email so we can send your tickets.");
                  }
                  // Student with no separate contact email → tickets go to the .edu address.
                  if (selfIsStudent && !isEmail(buyerEmail)) setBuyerEmail(selfStudent.eduEmail);
                  setError("");
                  ensureSelfInParty();
                  goNext();
                }}
              />
            </Card>
          )}

          {/* ── PARTY ── */}
          {step === "party" && (
            <Card k="party" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H big={dayOfMode}>Who&apos;s coming, {firstName}?</H>
              <Sub>You&apos;re in. Bringing family or friends? Add them — or continue solo.</Sub>

              <div className="flex flex-wrap gap-2.5 mb-7">
                <AnimatePresence>
                  {people.map((p) => (
                    <motion.span
                      key={p.id}
                      layout
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={spring}
                      className="inline-flex items-center gap-2 rounded-full px-4.5 py-2.5 text-[15px] font-semibold"
                      style={{ background: "var(--accent-soft)", color: "var(--ink)", border: "1.5px solid var(--line)", padding: "0.6rem 1.1rem" }}
                    >
                      {p.isStudent ? "🎓" : p.isKid ? "🧒" : "🧑"} {p.firstName}
                      {p.isKid && p.age !== undefined && <span style={{ color: "var(--ink-soft)" }}>({p.age})</span>}
                      {p.id !== "self" && (
                        <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}>
                          ✕
                        </button>
                      )}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>

              {member && member.family.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-semibold mb-2.5">Your family — tap to add:</p>
                  <div className="flex flex-wrap gap-2.5">
                    {member.family.map((f) => {
                      const key = `fam-${f.firstName}-${f.lastName}`;
                      const selected = people.some((p) => p.id === key);
                      return (
                        <button key={key} className="choice-chip !py-3 !px-5" data-selected={selected} onClick={() => toggleFamily(f)}>
                          {f.relationship === "child" ? "🧒" : "🧑"} {f.firstName} {selected && "✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="hairline rounded-2xl p-5" style={{ background: "var(--bg-soft)" }}>
                {!draftKind ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-semibold mr-1">+ Add someone:</p>
                    <button className="choice-chip !py-3 !px-5" onClick={() => setDraftKind("adult")}>
                      🧑 An adult
                    </button>
                    <button className="choice-chip !py-3 !px-5" onClick={() => setDraftKind("kid")}>
                      🧒 A kid
                    </button>
                    {hasStudent && (
                      <button className="choice-chip !py-3 !px-5" onClick={() => setDraftKind("student")}>
                        🎓 A student
                      </button>
                    )}
                  </div>
                ) : draftKind === "student" ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3">
                    <p className="font-semibold">
                      🎓 Student pass{" "}
                      <span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>
                        — discounted rate · bring your student ID to the gate
                      </span>
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input className="input !py-3" placeholder="Student's name" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
                      <input className="input !py-3" type="email" placeholder="School email (.edu)" value={draftStudent.eduEmail} onChange={(e) => setDraftStudent((s) => ({ ...s, eduEmail: e.target.value }))} />
                      <input className="input !py-3" placeholder="University / college" value={draftStudent.university} onChange={(e) => setDraftStudent((s) => ({ ...s, university: e.target.value }))} />
                      <input className="input !py-3" placeholder="City" value={draftStudent.city} onChange={(e) => setDraftStudent((s) => ({ ...s, city: e.target.value }))} />
                      <input className="input !py-3" type="text" inputMode="numeric" maxLength={4} placeholder="Expected grad year (e.g. 2027)" value={draftStudent.gradYear} onChange={(e) => setDraftStudent((s) => ({ ...s, gradYear: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                    </div>
                    {draftName.trim() && !isEmail(draftStudent.eduEmail) && (
                      <p className="text-xs font-medium" style={{ color: "var(--sindoor)" }}>A school (.edu) email is required to add a student.</p>
                    )}
                    <div className="flex gap-3 items-center">
                      <button className="btn-primary !py-3 !px-6 text-sm" onClick={addDraft} disabled={!draftName.trim() || !isEmail(draftStudent.eduEmail)}>
                        Add student ✓
                      </button>
                      <button className="text-sm opacity-60 hover:opacity-100" onClick={() => setDraftKind(null)}>
                        cancel
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-3 items-center">
                    <input className="input flex-1 min-w-44 !py-3" placeholder={draftKind === "kid" ? "Kid's name" : "Their name"} value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && addDraft()} />
                    {draftKind === "kid" && (
                      <input className="input w-24 !py-3" type="text" inputMode="numeric" maxLength={2} placeholder="Age" value={draftAge} onChange={(e) => setDraftAge(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                    )}
                    <button className="btn-primary !py-3 !px-6 text-sm" onClick={addDraft} disabled={!draftName.trim()}>
                      Add ✓
                    </button>
                    <button className="text-sm opacity-60 hover:opacity-100" onClick={() => setDraftKind(null)}>
                      cancel
                    </button>
                  </motion.div>
                )}
              </div>

              {error && (
                <p className="mt-5 text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
                  {error}
                </p>
              )}
              <NextBtn
                big={dayOfMode}
                label={people.length > 1 ? `Continue with ${people.length} people →` : "It's just me — continue →"}
                onClick={() => {
                  // Guard against the common slip: typed a name but never clicked "Add".
                  if (draftKind && draftName.trim()) {
                    const ok = window.confirm(
                      `You started adding "${draftName.trim()}" but haven't tapped "Add" yet — they won't be included. Continue without them?`
                    );
                    if (!ok) return;
                  }
                  goNext();
                }}
              />
            </Card>
          )}

          {/* ── DAYS ── */}
          {step === "days" && (
            <Card k="days" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H>Which days?</H>
              <Sub>Everyone can have their own plan — grandma can do Sunday only{hasConcert ? ", or come just for a concert" : ""}.</Sub>
              <div className="grid gap-2.5 mb-6">
                <button
                  className="choice-chip w-full justify-center !py-4 text-lg"
                  data-selected={people.length > 0 && people.every((p) => !p.concertOnly && p.days.length === dayCount)}
                  onClick={() => setAllConcert(false)}
                >
                  🎉 Everyone, all {dayCount} days
                </button>
                {hasConcert && (
                  <button
                    className="choice-chip w-full justify-center !py-3.5"
                    data-selected={people.length > 0 && people.every((p) => p.concertOnly)}
                    onClick={() => setAllConcert(true)}
                  >
                    🎶 Everyone&apos;s here just for the concert
                  </button>
                )}
              </div>
              <div className="grid gap-4">
                {people.map((p) => {
                  const options = (p.concertOnly ? concertDays : event.days) as { key: string; label: string }[];
                  return (
                    <PersonRow key={p.id} title={<>{p.isStudent ? "🎓" : p.isKid ? "🧒" : "🧑"} {p.firstName}</>}>
                      {hasConcert && (
                        <label className="flex items-center gap-2 mb-3 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-[var(--sindoor)] w-4 h-4"
                            checked={p.concertOnly}
                            onChange={(e) => togglePersonConcert(p.id, e.target.checked)}
                          />
                          🎶 Concert only (no pujo pass, no meal)
                        </label>
                      )}
                      <div className="flex flex-wrap gap-2.5">
                        {options.map((d) => (
                          <button
                            key={d.key}
                            className="choice-chip !py-2.5 !px-4 text-sm"
                            data-selected={p.days.includes(d.key)}
                            onClick={() =>
                              updatePerson(p.id, {
                                days: p.days.includes(d.key) ? p.days.filter((x) => x !== d.key) : [...p.days, d.key],
                              })
                            }
                          >
                            {p.concertOnly ? `🎶 ${d.label}` : d.label}
                          </button>
                        ))}
                      </div>
                      {!p.concertOnly && p.days.length > 0 && !bandDayOk(p) && (
                        <div className="mt-3 rounded-xl px-3.5 py-3 text-sm" style={{ background: "rgba(200,16,46,0.07)", border: "1px solid rgba(200,16,46,0.25)" }}>
                          <p className="font-semibold" style={{ color: "var(--sindoor)" }}>
                            ⚠️ There&apos;s no {BAND_LABEL[personBand(p)] ?? "matching"} pass for {p.firstName}&apos;s day selection.
                          </p>
                          {combosFor(p).length > 0 ? (
                            <>
                              <p className="text-xs mt-1.5 mb-2" style={{ color: "var(--ink-soft)" }}>Tap an available option:</p>
                              <div className="flex flex-wrap gap-2">
                                {combosFor(p).map((c) => (
                                  <button key={c.key} className="choice-chip !py-2 !px-3.5 text-xs" onClick={() => updatePerson(p.id, { days: c.days })}>
                                    {c.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                              No {BAND_LABEL[personBand(p)] ?? "such"} passes are offered — please remove this person.
                            </p>
                          )}
                        </div>
                      )}
                    </PersonRow>
                  );
                })}
              </div>
              {daysStepBlocked && (
                <p className="mt-4 text-sm font-medium" style={{ color: "var(--sindoor)" }}>
                  Pick a valid pass for everyone above to continue.
                </p>
              )}
              <NextBtn disabled={daysStepBlocked} onClick={goNext} />
            </Card>
          )}

          {/* ── FOOD ── */}
          {step === "food" && (
            <Card k="food" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H big={dayOfMode}>Now, the important part — food. 🍛</H>
              <Sub>Bhog is half the reason we all come. Kids get the kid&apos;s meal automatically.</Sub>
              <div className="grid gap-4">
                {people.map((p) => {
                  const fa = p.concertOnly || p.isKid ? { withFood: true, noFood: true } : foodFor(p);
                  return (
                    <PersonRow key={p.id} title={<>{p.isStudent ? "🎓" : p.isKid ? "🧒" : "🧑"} {p.firstName}</>}>
                      {p.concertOnly ? (
                        <p style={{ color: "var(--ink-soft)" }}>🎶 Concert ticket — no meal</p>
                      ) : p.isKid ? (
                        <p style={{ color: "var(--ink-soft)" }}>Kid&apos;s meal included 🍚</p>
                      ) : (
                        <div className="flex flex-wrap gap-2.5">
                          {fa.withFood && (
                            <>
                              <button className="choice-chip !py-2.5 !px-4 text-sm" data-selected={p.withFood && p.foodPref === "non_veg"} onClick={() => updatePerson(p.id, { withFood: true, foodPref: "non_veg" })}>
                                🐟 With food · non-veg
                              </button>
                              <button className="choice-chip !py-2.5 !px-4 text-sm" data-selected={p.withFood && p.foodPref === "veg"} onClick={() => updatePerson(p.id, { withFood: true, foodPref: "veg" })}>
                                🥬 With food · veg
                              </button>
                            </>
                          )}
                          {fa.noFood && (
                            <button className="choice-chip !py-2.5 !px-4 text-sm" data-selected={!p.withFood} onClick={() => updatePerson(p.id, { withFood: false, foodPref: "none" })}>
                              🚫 No food
                            </button>
                          )}
                          {fa.withFood && !fa.noFood && (
                            <p className="text-xs w-full mt-0.5" style={{ color: "var(--ink-soft)" }}>
                              This pass includes food — pick veg or non-veg.
                            </p>
                          )}
                          {!fa.withFood && fa.noFood && (
                            <p className="text-xs w-full mt-0.5" style={{ color: "var(--ink-soft)" }}>
                              This pass doesn&apos;t include a meal.
                            </p>
                          )}
                        </div>
                      )}
                    </PersonRow>
                  );
                })}
              </div>
              <NextBtn big={dayOfMode} onClick={goNext} />
            </Card>
          )}

          {/* ── EXTRAS / ADD-ONS ── */}
          {step === "extras" && (
            <Card k="extras" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H big={dayOfMode}>Anything extra? 🎫</H>
              <Sub>Add lunch, dinner, or other passes — each comes with its own QR code. Skip if you don&apos;t need any.</Sub>
              <div className="grid gap-3">
                {addonPasses.map((t) => {
                  const qty = addonQty[t.id] ?? 0;
                  const price = wantsMembership || isMemberPurchase ? t.priceMemberCents : t.priceNonmemberCents;
                  const setQ = (n: number) => setAddonQty((m) => ({ ...m, [t.id]: Math.max(0, n) }));
                  const time = t.checkInStart
                    ? new Date(`2000-01-01T${t.checkInStart}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    : null;
                  return (
                    <div key={t.id} className="hairline rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--bg-soft)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                          {formatCents(price < 0 ? t.priceMemberCents : price)}
                          {time ? ` · ${time}` : ""}
                          {t.withFood ? " · includes food" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          aria-label={`Remove one ${t.name}`}
                          className="w-9 h-9 rounded-full font-bold text-lg leading-none"
                          style={{ border: "1.5px solid var(--line)", opacity: qty === 0 ? 0.4 : 1 }}
                          onClick={() => setQ(qty - 1)}
                          disabled={qty === 0}
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
                        <button
                          type="button"
                          aria-label={`Add one ${t.name}`}
                          className="w-9 h-9 rounded-full font-bold text-lg leading-none"
                          style={{ background: "var(--sindoor)", color: "var(--cream)" }}
                          onClick={() => setQ(qty + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <NextBtn big={dayOfMode} label="Continue →" onClick={goNext} />
            </Card>
          )}

          {/* ── BECOME A MEMBER ── */}
          {step === "membership" && (
            <Card k="membership" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H>Want to join the Pragati family? 🪔</H>
              <Sub>
                You&apos;re booking as a guest. Become a member for {formatCents(membershipPriceCents)}/year and your whole
                family gets member pricing on this order — and on every event all year. One membership covers the family.
              </Sub>
              <div className="grid gap-3">
                <button className="choice-chip !p-5" data-selected={wantsMembership} onClick={() => { setWantsMembership(true); goNext(); }}>
                  <span className="text-2xl">🌟</span>
                  <span>
                    <strong className="text-lg">Yes — make us members (+{formatCents(membershipPriceCents)}/year)</strong>
                    <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                      Member prices apply to everyone on this order · welcome email with your member ID
                    </span>
                  </span>
                </button>
                <button className="choice-chip !p-5" data-selected={!wantsMembership} onClick={() => { setWantsMembership(false); goNext(); }}>
                  <span className="text-2xl">🎟</span>
                  <span>
                    <strong className="text-lg">No thanks — just the tickets</strong>
                    <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                      You can always join later
                    </span>
                  </span>
                </button>
              </div>
            </Card>
          )}

          {/* ── DONATION ── */}
          {step === "donate" && (
            <Card k="donate" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H>{donateTitle}</H>
              <Sub>{donateIntro}</Sub>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1000, 2500, 5000, 10000].map((amt) => (
                  <button
                    key={amt}
                    className="choice-chip justify-center !py-4 text-lg"
                    data-selected={donationCents === amt}
                    onClick={() => setDonationCents(donationCents === amt ? 0 : amt)}
                  >
                    {formatCents(amt)}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <label className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>
                  Or a custom amount $
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input !py-3 max-w-40"
                  placeholder="0"
                  value={donationCents ? String(donationCents / 100) : ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    setDonationCents(Math.max(0, Math.round((parseFloat(v) || 0) * 100)));
                  }}
                />
                {donationCents > 0 && (
                  <button type="button" className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100" onClick={() => setDonationCents(0)}>
                    clear
                  </button>
                )}
              </div>
              <NextBtn
                label={donationCents > 0 ? `Add ${formatCents(donationCents)} & continue →` : "No thanks — continue →"}
                onClick={goNext}
              />
            </Card>
          )}

          {/* ── REVIEW ── */}
          {step === "review" && (
            <Card k="review" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H>Here&apos;s your order, {firstName}.</H>
              <Sub>Check everything over — you can go back and change anything.</Sub>
              <div className="hairline rounded-2xl divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
                {quote.lines.map((l, i) => (
                  <motion.div key={l.person ? `${l.person.id}-${l.label}` : `addon-${l.typeName}`} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderColor: "var(--line)" }}>
                    <div>
                      <p className="font-semibold text-[17px]">
                        {l.person ? `${l.person.isStudent ? "🎓" : l.person.isKid ? "🧒" : "🧑"} ${l.person.firstName} ${l.person.lastName}` : `🎫 ${l.typeName} ${l.label}`}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        {l.person
                          ? `${l.label} · ${l.person.concertOnly ? "concert · no meal" : l.person.isStudent ? (l.person.withFood ? `student · food: ${l.person.foodPref.replace("_", "-")}` : "student · no food") : l.person.isKid ? ((l.person.age ?? 6) < 5 ? "under 5 · free" : "youth · meal included") : l.person.withFood ? `food: ${l.person.foodPref.replace("_", "-")}` : "no food"}`
                          : "Add-on pass"}
                        {l.memberPricing && (
                          <span className="ml-1.5 font-semibold" style={{ color: "var(--leaf-deep)" }}>
                            member price ✓
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="font-[family-name:var(--font-display)] text-lg font-bold">{l.price === 0 ? "Free" : formatCents(l.price)}</p>
                  </motion.div>
                ))}
                {promo.state === "applied" && (
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <p className="text-sm font-semibold" style={{ color: "var(--leaf-deep)" }}>
                      Promo {promoCode} · {promo.note}
                    </p>
                    <p className="font-semibold" style={{ color: "var(--leaf-deep)" }}>
                      −{formatCents(promo.discountCents)}
                    </p>
                  </div>
                )}
                {wantsMembership && (
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <p className="text-sm font-semibold">🌟 Pragati membership — 1 year (whole family)</p>
                    <p className="font-semibold">{formatCents(membershipCents)}</p>
                  </div>
                )}
                {donationCents > 0 && (
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <p className="text-sm font-semibold">🙏 {donateLineLabelLong}</p>
                    <p className="font-semibold">{formatCents(donationCents)}</p>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-5" style={{ background: "var(--accent-soft)" }}>
                  <p className="font-bold text-lg">Total</p>
                  <motion.p
                    key={total}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                    className="font-[family-name:var(--font-display)] text-3xl font-black"
                    style={{ color: "var(--sindoor)" }}
                  >
                    {formatCents(total)}
                  </motion.p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <input
                  className="input flex-1 uppercase !py-3"
                  placeholder="Promo code (optional)"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromo({ state: "idle", discountCents: 0, note: "" });
                  }}
                />
                <button
                  className="btn-secondary !py-3 !px-6 text-sm"
                  disabled={!promoCode || promo.state === "checking"}
                  onClick={async () => {
                    setPromo({ state: "checking", discountCents: 0, note: "" });
                    const res = await validatePromoAction(event.id, promoCode, quote.subtotal);
                    if (res.valid) setPromo({ state: "applied", discountCents: res.discountCents, note: res.description });
                    else setPromo({ state: "invalid", discountCents: 0, note: res.message });
                  }}
                >
                  {promo.state === "checking" ? "…" : "Apply"}
                </button>
              </div>
              {promo.state === "invalid" && (
                <p className="text-sm mt-2 font-medium" style={{ color: "var(--sindoor)" }}>
                  {promo.note}
                </p>
              )}
              {hasIssues && (
                <p className="mt-4 text-sm font-medium" style={{ color: "var(--sindoor)" }}>
                  Some passes don&apos;t match what&apos;s offered — go back and fix the highlighted people first.
                </p>
              )}
              <NextBtn label="Looks right — choose payment →" disabled={hasIssues} onClick={goNext} />
            </Card>
          )}

          {/* ── PAY ── */}
          {step === "pay" && (
            <Card k="pay" direction={direction} onBack={stepIndex > 0 ? goBack : undefined}>
              <H big={dayOfMode}>How would you like to pay?</H>
              <Sub>
                Total: <strong style={{ color: "var(--sindoor)" }}>{formatCents(total)}</strong>
                {promo.state === "applied" && <> · promo <strong>{promoCode}</strong> ✓</>} · tickets to {buyerEmail}
              </Sub>
              <div className="grid gap-4">
                {!dayOfMode && squareEnabled && (
                  <button className="choice-chip !p-5" disabled={busy} onClick={() => submit("square")}>
                    <span className="text-2xl">💳</span>
                    <span>
                      <strong className="text-lg">Card (Square)</strong>
                      <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        Instant — tickets emailed in seconds
                      </span>
                      {total > 0 && (
                        <span className="block text-sm mt-1">
                          Processing fee <strong style={{ color: "var(--sindoor)" }}>{formatCents(cardFee)}</strong> · Total{" "}
                          <strong>{formatCents(cardTotal)}</strong>
                        </span>
                      )}
                    </span>
                  </button>
                )}
                {zelleEnabled && (
                  <button className="choice-chip !p-5" disabled={busy} onClick={() => submit("zelle")}>
                    <span className="text-2xl">🏦</span>
                    <span>
                      <strong className="text-lg">Zelle</strong>
                      <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        Bank transfer — tickets emailed once payment is verified (~24h)
                      </span>
                    </span>
                  </button>
                )}
                {dayOfMode && (
                  <button className="choice-chip !p-5" disabled={busy} onClick={() => submit("offline")}>
                    <span className="text-2xl">💵</span>
                    <span>
                      <strong className="text-lg">Pay at the counter</strong>
                      <span className="block text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        Cash or card at the registration desk — show your confirmation
                      </span>
                    </span>
                  </button>
                )}
              </div>
              {busy && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <span className="inline-block w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--sindoor)", borderTopColor: "transparent" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
                    Setting things up…
                  </p>
                </div>
              )}
              {error && (
                <p className="mt-5 text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
                  {error}
                </p>
              )}
            </Card>
          )}

          {/* ── DONE (offline / kiosk) ── */}
          {step === "done" && (
            <Card k="done" direction={direction} accent>
              <motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={spring} className="text-center">
                <p className="text-6xl mb-4">🪔</p>
                <H big={dayOfMode}>You&apos;re in, {firstName}!</H>
                <Sub>Show this at the counter to pay and collect your wristbands.</Sub>
                <div className="rounded-2xl py-7 px-4 mb-4" style={{ background: "var(--accent-soft)" }}>
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
                    Confirmation
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black" style={{ color: "var(--sindoor)" }}>
                    {doneConf}
                  </p>
                  <p className="mt-2 font-semibold text-lg">Due at counter: {formatCents(doneTotal)}</p>
                </div>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  A copy is on its way to {buyerEmail}.
                </p>
                {dayOfMode && (
                  <button className="btn-secondary mt-8 text-lg" onClick={() => window.location.reload()}>
                    Register the next family →
                  </button>
                )}
              </motion.div>
            </Card>
          )}
        </AnimatePresence>
        </div>
        {showPanel && <DesktopOrderRail {...orderData} />}
      </div>
      {showPanel && <MobileOrderBar {...orderData} />}
    </div>
  );
}
