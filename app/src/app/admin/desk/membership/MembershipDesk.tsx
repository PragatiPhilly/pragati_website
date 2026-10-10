"use client";

/**
 * Membership at the desk, one step at a time:
 *   1. Find them (member, someone who booked, or someone new)
 *   2. Take a year's dues — card on Square's page, or Zelle they show you
 *   3. Done: member number and the new end date
 */
import { useEffect, useRef, useState, useTransition } from "react";
import {
  cancelDuesCardAction,
  checkDuesCardAction,
  membershipSearchAction,
  newMemberAction,
  takeDuesAction,
} from "./actions";
import type { DeskGuestHit, DeskMemberHit, DuesResult } from "@/lib/desk/membership";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const newIdem = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const STANDING: Record<DeskMemberHit["standing"], { text: string; cls: string }> = {
  active: { text: "Member", cls: "chip-ok" },
  honour: { text: "Said ‘member’ — dues not paid", cls: "chip-warn" },
  expired: { text: "Expired", cls: "chip-stop" },
  not_paid: { text: "Dues not paid", cls: "chip-stop" },
};

function standingLine(m: DeskMemberHit): string {
  if (m.standing === "active" && m.expiresAt) return `Valid until ${day(m.expiresAt)}`;
  if (m.standing === "honour") return "Ticked “I’m a member” when booking — never paid dues";
  if (m.standing === "expired" && m.expiresAt) return `Ended ${day(m.expiresAt)}`;
  return "Signed up but never paid";
}

type Step =
  | { s: "find" }
  | { s: "new"; prefill: { firstName: string; lastName: string; email: string; phone: string } }
  | { s: "pay"; member: DeskMemberHit; note?: string }
  | { s: "card"; member: DeskMemberHit; dues: DuesResult }
  | { s: "done"; member: DeskMemberHit; dues: DuesResult };

export default function MembershipDesk({
  priceCents,
  cardFeeCents,
  zelleTo,
  zelleName,
}: {
  priceCents: number;
  cardFeeCents: number;
  zelleTo: string;
  zelleName: string;
}) {
  const [step, setStep] = useState<Step>({ s: "find" });
  const reset = () => setStep({ s: "find" });

  return (
    <div className="flex flex-col gap-5">
      {step.s === "find" && (
        <Finder
          onMember={(m) => setStep({ s: "pay", member: m })}
          onNew={(prefill) => setStep({ s: "new", prefill })}
        />
      )}
      {step.s === "new" && (
        <NewMember
          prefill={step.prefill}
          onBack={reset}
          onReady={(m, existed) =>
            setStep({
              s: "pay",
              member: m,
              note: existed ? "That email already has an account — we’ve picked it up rather than making a second one." : undefined,
            })
          }
        />
      )}
      {step.s === "pay" && (
        <TakeDues
          member={step.member}
          note={step.note}
          priceCents={priceCents}
          cardFeeCents={cardFeeCents}
          zelleTo={zelleTo}
          zelleName={zelleName}
          onBack={reset}
          onCard={(dues) => setStep({ s: "card", member: step.member, dues })}
          onDone={(dues) => setStep({ s: "done", member: step.member, dues })}
        />
      )}
      {step.s === "card" && (
        <CardWait
          member={step.member}
          dues={step.dues}
          onDone={(dues) => setStep({ s: "done", member: step.member, dues })}
          onCancelled={() => setStep({ s: "pay", member: step.member, note: "Card page cancelled. Try again, or take Zelle." })}
        />
      )}
      {step.s === "done" && <Done member={step.member} dues={step.dues} onNext={reset} />}
    </div>
  );
}

// ── 1. find ─────────────────────────────────────────────────────────────────

function splitName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { firstName: first ?? "", lastName: rest.join(" ") };
}

function Finder({
  onMember,
  onNew,
}: {
  onMember: (m: DeskMemberHit) => void;
  onNew: (prefill: { firstName: string; lastName: string; email: string; phone: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ members: DeskMemberHit[]; guests: DeskGuestHit[] } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        const r = await membershipSearchAction(q);
        if (r.ok) {
          setRes(r.data ?? { members: [], guests: [] });
          setError("");
        } else setError(r.error);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const looksLikeEmail = q.includes("@");
  return (
    <div className="desk-hero">
      <h2>Who wants to join or renew?</h2>
      <div className="desk-search">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email, phone, member no. or PRG number…"
          aria-label="Find a member or family"
        />
      </div>
      {error && <p className="desk-error">{error}</p>}
      {pending && !res && <p className="desk-note">Searching…</p>}

      {res && (
        <div className="flex flex-col gap-4">
          {res.members.length > 0 && (
            <div>
              <p className="desk-note mb-1">
                <strong>Members</strong> — tap to take this year’s dues
              </p>
              <div className="festive-card overflow-hidden">
                {res.members.map((m) => (
                  <button key={m.memberId} type="button" className="desk-row w-full text-left" onClick={() => onMember(m)}>
                    <span className="grow">
                      <strong>{m.name}</strong> <span className="text-xs opacity-60">{m.number ?? ""}</span>
                      <span className="block text-xs opacity-70">
                        {m.email}
                        {m.phone ? ` · ${m.phone}` : ""} · {standingLine(m)}
                      </span>
                    </span>
                    <span className={`desk-chip ${STANDING[m.standing].cls}`}>{STANDING[m.standing].text}</span>
                    <span className="desk-chip chip-mute">{m.standing === "active" ? "Extend →" : "Pay dues →"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {res.guests.length > 0 && (
            <div>
              <p className="desk-note mb-1">
                <strong>Registered for Pujo, not members yet</strong> — tap to make them a member
              </p>
              <div className="festive-card overflow-hidden">
                {res.guests.map((g) => (
                  <button
                    key={g.registrationId}
                    type="button"
                    className="desk-row w-full text-left"
                    onClick={() => onNew({ ...splitName(g.name), email: g.email, phone: g.phone })}
                  >
                    <span className="grow">
                      <strong>{g.name}</strong> <span className="text-xs opacity-60">{g.conf}</span>
                      <span className="block text-xs opacity-70">
                        {g.email || "no email"}
                        {g.phone ? ` · ${g.phone}` : ""}
                      </span>
                    </span>
                    <span className="desk-chip chip-mute">Make member →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {res.members.length === 0 && res.guests.length === 0 && (
            <p className="desk-note">Nobody matches “{q.trim()}”. Add them as a new member below.</p>
          )}
        </div>
      )}

      <div className="desk-or">or</div>
      <button
        type="button"
        className="big-action"
        onClick={() =>
          onNew(looksLikeEmail ? { firstName: "", lastName: "", email: q.trim(), phone: "" } : { ...splitName(q), email: "", phone: "" })
        }
      >
        + New member
      </button>
      <p className="desk-note" style={{ textAlign: "center", margin: 0 }}>
        Search first — if they’re already a member we extend their year instead of starting a new one.
      </p>
    </div>
  );
}

// ── 1b. someone new ─────────────────────────────────────────────────────────

function NewMember({
  prefill,
  onBack,
  onReady,
}: {
  prefill: { firstName: string; lastName: string; email: string; phone: string };
  onBack: () => void;
  onReady: (m: DeskMemberHit, existed: boolean) => void;
}) {
  const [f, setF] = useState(prefill);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const r = await newMemberAction(f);
      if (r.ok && r.data) onReady(r.data.member, r.data.existed);
      else if (!r.ok) setError(r.error);
    });
  };

  return (
    <form className="festive-card p-5 flex flex-col gap-3" onSubmit={submit}>
      <h2 className="font-[family-name:var(--font-display)] text-xl font-black">New member</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="desk-field">
          <span>First name</span>
          <input value={f.firstName} onChange={set("firstName")} autoComplete="off" required />
        </label>
        <label className="desk-field">
          <span>Last name</span>
          <input value={f.lastName} onChange={set("lastName")} autoComplete="off" required />
        </label>
        <label className="desk-field">
          <span>Email</span>
          <input type="email" value={f.email} onChange={set("email")} autoComplete="off" inputMode="email" required />
        </label>
        <label className="desk-field">
          <span>Phone</span>
          <input type="tel" value={f.phone} onChange={set("phone")} autoComplete="off" inputMode="tel" required />
        </label>
      </div>
      <p className="desk-note m-0">Their membership email (with a link to set a password) goes to this address.</p>
      {error && <p className="desk-error">{error}</p>}
      <div className="action-row">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "One moment…" : "Continue to payment →"}
        </button>
        <button type="button" className="btn-secondary" onClick={onBack} disabled={pending}>
          Back
        </button>
      </div>
    </form>
  );
}

// ── 2. take the dues ────────────────────────────────────────────────────────

function MemberHeader({ m }: { m: DeskMemberHit }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-black leading-tight">{m.name}</h2>
        <p className="desk-note m-0">
          {m.email}
          {m.phone ? ` · ${m.phone}` : ""}
          {m.number ? ` · ${m.number}` : ""}
        </p>
        <p className="desk-note m-0">{standingLine(m)}</p>
      </div>
      <span className={`desk-chip ${STANDING[m.standing].cls}`}>{STANDING[m.standing].text}</span>
    </div>
  );
}

function TakeDues({
  member,
  note,
  priceCents,
  cardFeeCents,
  zelleTo,
  zelleName,
  onBack,
  onCard,
  onDone,
}: {
  member: DeskMemberHit;
  note?: string;
  priceCents: number;
  cardFeeCents: number;
  zelleTo: string;
  zelleName: string;
  onBack: () => void;
  onCard: (d: DuesResult) => void;
  onDone: (d: DuesResult) => void;
}) {
  const [withFee, setWithFee] = useState(true);
  const [seen, setSeen] = useState(false);
  const [sender, setSender] = useState("");
  const [last4, setLast4] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // One key per attempt: a double tap returns the first attempt, never a second year.
  const [cardIdem] = useState(newIdem);
  const [zelleIdem] = useState(newIdem);

  const renewing = member.standing === "active";
  const card = () =>
    start(async () => {
      setError("");
      const r = await takeDuesAction({ memberId: member.memberId, method: "square", idem: cardIdem, withCardFee: withFee });
      if (r.ok && r.data) r.data.status === "paid" ? onDone(r.data) : onCard(r.data);
      else if (!r.ok) setError(r.error);
    });
  const zelle = () =>
    start(async () => {
      setError("");
      const r = await takeDuesAction({
        memberId: member.memberId,
        method: "zelle",
        idem: zelleIdem,
        zelle: { confirmationSeen: seen, senderName: sender, senderLast4: last4 },
      });
      if (r.ok && r.data) onDone(r.data);
      else if (!r.ok) setError(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="festive-card p-5 flex flex-col gap-3">
        <MemberHeader m={member} />
        {note && <p className="desk-ok m-0">{note}</p>}
        <div className="desk-balance">
          <span className="lbl">{renewing ? "One more year" : "One year’s membership"}</span>
          <span className="amount">{money(priceCents)}</span>
          <span className="lbl">
            {renewing ? "New end date" : "Valid until"} <strong>{day(member.nextExpiresAt)}</strong>
          </span>
        </div>
      </div>

      <div className="festive-card p-5 flex flex-col gap-3">
        <h3 className="font-bold text-lg m-0">💳 Card — they type it themselves</h3>
        <p className="desk-note m-0">
          Opens Square’s secure payment page. Hand them the tablet, or let them scan the code with their phone.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withFee} onChange={(e) => setWithFee(e.target.checked)} />
          Add the card fee ({money(cardFeeCents)}) — total <strong>{money(priceCents + (withFee ? cardFeeCents : 0))}</strong>
        </label>
        <button type="button" className="big-action" disabled={pending} onClick={card}>
          {pending ? "Opening…" : `Open card payment — ${money(priceCents + (withFee ? cardFeeCents : 0))}`}
        </button>
      </div>

      <div className="festive-card p-5 flex flex-col gap-3">
        <h3 className="font-bold text-lg m-0">📱 Zelle</h3>
        <p className="desk-note m-0">
          They send <strong>{money(priceCents)}</strong> to <strong>{zelleTo || zelleName}</strong> ({zelleName}) with memo{" "}
          <strong>MEM {member.name}</strong>, then show you the confirmation on their phone.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="desk-field">
            <span>Sent from (name on their Zelle)</span>
            <input value={sender} onChange={(e) => setSender(e.target.value)} autoComplete="off" />
          </label>
          <label className="desk-field">
            <span>Last 4 of their phone / account (optional)</span>
            <input value={last4} onChange={(e) => setLast4(e.target.value)} inputMode="numeric" maxLength={4} autoComplete="off" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-1" />
          <span>
            I’ve <strong>seen the Zelle confirmation</strong> on their phone — {money(priceCents)} sent to {zelleName}.
          </span>
        </label>
        <button type="button" className="btn-primary" disabled={pending || !seen} onClick={zelle}>
          {pending ? "Saving…" : renewing ? "Zelle received — extend membership" : "Zelle received — make them a member"}
        </button>
      </div>

      {error && <p className="desk-error">{error}</p>}
      <button type="button" className="btn-secondary self-start" onClick={onBack} disabled={pending}>
        ← Someone else
      </button>
    </div>
  );
}

// ── 2b. waiting on the card ─────────────────────────────────────────────────

function CardWait({
  member,
  dues,
  onDone,
  onCancelled,
}: {
  member: DeskMemberHit;
  dues: DuesResult;
  onDone: (d: DuesResult) => void;
  onCancelled: () => void;
}) {
  const [msg, setMsg] = useState("Waiting for them to pay on Square’s page…");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const tries = useRef(0);

  const check = (quiet = false) =>
    start(async () => {
      const r = await checkDuesCardAction(dues.paymentId);
      if (!r.ok) {
        if (!quiet) setError(r.error);
        return;
      }
      if (r.data?.settled && r.data.result) onDone(r.data.result);
      else if (!quiet) setMsg(r.data?.message ?? "Not yet.");
    });

  // Check by itself every 6 seconds for 4 minutes, so nobody has to remember to.
  useEffect(() => {
    const id = setInterval(() => {
      tries.current += 1;
      if (tries.current > 40) return clearInterval(id);
      if (document.visibilityState === "visible") check(true);
    }, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dues.paymentId]);

  const cancel = () => {
    if (!window.confirm("Cancel this card payment page? Only do this if they did NOT pay.")) return;
    start(async () => {
      setError("");
      const r = await cancelDuesCardAction(dues.paymentId);
      if (r.ok) onCancelled();
      else setError(r.error);
    });
  };

  const payUrl = dues.payUrl ?? "";
  const qrSrc = payUrl ? `/api/admin/desk/qr?data=${encodeURIComponent(payUrl)}` : "";

  return (
    <div className="festive-card p-5 flex flex-col gap-4">
      <MemberHeader m={member} />
      <div className="desk-balance desk-balance--waiting">
        <span className="lbl">Card payment</span>
        <span className="amount">{money(dues.totalCents)}</span>
        <span className="lbl">{msg}</span>
      </div>

      {payUrl && (
        <div className="flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="Scan to pay by card" width={190} height={190} className="rounded-lg border" />
          <div className="flex flex-col gap-2 grow">
            <p className="desk-note m-0">Let them scan this with their phone camera, or open it on this tablet:</p>
            <a href={payUrl} target="_blank" rel="noreferrer" className="big-action">
              Open card page on this tablet ↗
            </a>
          </div>
        </div>
      )}

      {error && <p className="desk-error">{error}</p>}
      <div className="action-row">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => check(false)}>
          {pending ? "Checking…" : "Check payment"}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={cancel}>
          Card didn’t go through — cancel
        </button>
      </div>
      <p className="desk-note m-0">
        Once Square says it’s paid, this screen moves on by itself. If they paid but it doesn’t move, tap “Check
        payment”.
      </p>
    </div>
  );
}

// ── 3. done ─────────────────────────────────────────────────────────────────

function Done({ member, dues, onNext }: { member: DeskMemberHit; dues: DuesResult; onNext: () => void }) {
  const d = dues.done;
  return (
    <div className="festive-card p-6 flex flex-col gap-3 text-center items-center">
      <p className="text-5xl m-0">🎉</p>
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-black m-0">
        {d?.renewed ? "Membership extended" : "Welcome to Pragati!"}
      </h2>
      <p className="text-lg m-0">
        <strong>{member.name}</strong>
      </p>
      {d && (
        <>
          <p className="m-0">
            Member no. <strong>{d.memberNumber}</strong> · valid until <strong>{day(d.expiresAt)}</strong>
          </p>
          <p className="desk-note m-0">
            {d.emailed ? `Confirmation emailed to ${member.email}.` : "The confirmation email didn’t send — the membership is still done."}
          </p>
        </>
      )}
      <p className="desk-note m-0">
        Already bought tickets? Their member price isn’t applied to tickets they’ve paid for — this is membership only.
      </p>
      <button type="button" className="big-action mt-2" onClick={onNext}>
        Next person
      </button>
    </div>
  );
}
