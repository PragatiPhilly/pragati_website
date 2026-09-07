"use client";

/**
 * The party builder — one screen, not a wizard.
 *
 * The web flow can afford six steps because the buyer is on their sofa. At a
 * door with a queue behind them, every step is a person still standing there,
 * so everything is on one screen and only two things are actually required: a
 * first name, and one adult. Anything else that is missing becomes a follow-up
 * chip, visible, and chased later — never a placeholder written into a real
 * field.
 *
 * The running total comes from the SERVER (quoteAction), not from a client-side
 * mirror of the pricing rules. A desk that shows a number the server then
 * disagrees with is worse than a desk that is half a second slower.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrderAction, guardianSearchAction, memberLookupAction, quoteAction } from "../actions";
import { PERSON_KIND_LABEL, parseAmountToCents, type PersonKind } from "@/lib/desk/constants";
import type { DeskPerson } from "@/lib/desk/party";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type BuilderEvent = {
  id: string;
  name: string;
  days: { key: string; label: string }[];
  kinds: Record<PersonKind, boolean>;
  foodIsAChoice: boolean;
};

type Row = {
  ref: string;
  firstName: string;
  lastName: string;
  kind: PersonKind;
  age: string;
  days: string[];
  withFood: boolean;
  foodPref: "veg" | "non_veg" | "kid" | "none";
  guardianRef: string | null;
  guardianTicketId: string | null;
  guardianLabel: string | null;
  eduEmail: string;
  university: string;
};

const newRow = (kind: PersonKind, allDays: string[]): Row => ({
  ref: crypto.randomUUID(),
  firstName: "",
  lastName: "",
  kind,
  age: "",
  days: [...allDays],
  withFood: kind !== "concert",
  foodPref: kind === "youth" || kind === "under5" ? "kid" : kind === "concert" ? "none" : "non_veg",
  guardianRef: null,
  guardianTicketId: null,
  guardianLabel: null,
  eduEmail: "",
  university: "",
});

const isMinor = (r: Row) => {
  if (r.kind !== "youth" && r.kind !== "under5") return false;
  const n = Number(r.age);
  if (r.age && Number.isFinite(n) && n >= 18) return false;
  return true;
};

export default function PartyBuilder({
  event,
  presetName = "",
  parentRegistrationId = null,
  parentLabel = null,
  parentBuyer = null,
  parentAdults = [],
}: {
  event: BuilderEvent;
  presetName?: string;
  parentRegistrationId?: string | null;
  parentLabel?: string | null;
  parentBuyer?: { name: string; phone: string; email: string } | null;
  /** Adults already on the booking being amended — the usual guardian. */
  parentAdults?: { ticketId: string; label: string }[];
}) {
  const router = useRouter();
  const allDays = useMemo(() => event.days.map((d) => d.key), [event.days]);
  // One key for the life of this screen: a double-tapped Create returns the
  // same order instead of a second one.
  const idem = useRef(crypto.randomUUID());

  const [buyerName, setBuyerName] = useState(parentBuyer?.name || presetName);
  const [buyerPhone, setBuyerPhone] = useState(parentBuyer?.phone ?? "");
  const [buyerEmail, setBuyerEmail] = useState(parentBuyer?.email ?? "");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>(() => (event.kinds.adult ? [newRow("adult", allDays)] : []));
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState<string | null>(null);
  const [memberQ, setMemberQ] = useState("");
  const [memberHits, setMemberHits] = useState<{ memberId: string; label: string; active: boolean }[]>([]);
  const [overrideGuardian, setOverrideGuardian] = useState(false);
  const [overrideCapacity, setOverrideCapacity] = useState(false);

  const [quote, setQuote] = useState<{ dueCents: number; passes: number; problems: { firstName: string; why: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);

  const people: DeskPerson[] = useMemo(
    () =>
      rows
        .filter((r) => r.firstName.trim())
        .map((r) => ({
          ref: r.ref,
          firstName: r.firstName.trim(),
          lastName: r.lastName.trim() || undefined,
          kind: r.kind,
          age: r.age === "" ? undefined : Number(r.age),
          days: r.days,
          withFood: r.kind === "concert" ? false : r.withFood,
          foodPref: r.kind === "concert" ? "none" : r.withFood ? r.foodPref : "none",
          guardianRef: r.guardianRef === "__pick__" ? null : r.guardianRef,
          guardianTicketId: r.guardianTicketId,
          student:
            r.kind === "student"
              ? { eduEmail: r.eduEmail, university: r.university, city: "", gradYear: "" }
              : undefined,
        })),
    [rows]
  );

  // Live quote, debounced.
  useEffect(() => {
    if (people.length === 0) {
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      start(async () => {
        const res = await quoteAction({ people, isMemberPurchase: !!memberId, eventId: event.id });
        if (res.ok && res.data) setQuote(res.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [people, memberId, event.id]);

  const update = (ref: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.ref === ref ? { ...r, ...patch } : r)));
  const remove = (ref: string) => setRows((prev) => prev.filter((r) => r.ref !== ref));

  const adults = rows.filter((r) => !isMinor(r) && r.firstName.trim());
  // Only mention what's missing once they've actually started — an empty form
  // greeting you with two warnings is just noise.
  const gaps: string[] = [];
  if (buyerName.trim()) {
    if (!buyerEmail.trim()) gaps.push("No email — we'll ask for it later");
    if (!buyerPhone.trim()) gaps.push("No phone — we'll ask for it later");
  }
  const minorsWithoutGuardian = rows.filter(
    (r) =>
      isMinor(r) &&
      r.firstName.trim() &&
      !r.guardianTicketId &&
      (!r.guardianRef || r.guardianRef === "__pick__") &&
      adults.length !== 1
  );

  const submit = () =>
    start(async () => {
      setError("");
      setSaving(true);
      const res = await createOrderAction({
        idempotencyKey: idem.current,
        eventId: event.id,
        buyerName,
        buyerEmail: buyerEmail.trim() || undefined,
        buyerPhone: buyerPhone.trim() || undefined,
        memberId,
        isMemberPurchase: !!memberId,
        people,
        note: note.trim() || undefined,
        parentRegistrationId,
        overrideGuardian,
        overrideCapacity,
      });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      router.push(`/admin/desk/o/${res.data!.registrationId}`);
    });

  return (
    <div className="desk-shell max-w-3xl">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">
          {parentRegistrationId ? "Add more people" : "Register a family"}
        </h1>
        <p className="desk-note">
          {parentLabel ? (
            <>
              Adding to <strong>{parentLabel}</strong>. You only pay for the new people — their existing passes stay
              exactly as they are.
            </>
          ) : (
            <>
              Only a name is required. If you don’t have their email or phone, leave it blank — we’ll chase
              it later. Never make one up.
            </>
          )}
        </p>
      </div>

      {/* ── who is paying ───────────────────────────────────────────────
          On an amendment this is already answered, so it folds away. The
          volunteer's job here is "add the kid", not "retype the dad". */}
      {/* A <details> with no <summary> gets a browser-drawn "Details" marker,
          so the two cases are two elements rather than one with a conditional
          child. Registering a family opens on this block; amending folds it. */}
      <BuyerShell folded={!!parentRegistrationId} summary={buyerName || "—"}>
        <div className="desk-grid2">
          <label className="desk-field">
            Name (required)
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Who's paying?" />
          </label>
          <label className="desk-field">
            Phone (optional)
            <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} inputMode="tel" />
          </label>
          <label className="desk-field">
            Email (optional)
            <input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} inputMode="email" />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="desk-field" style={{ flex: 1, minWidth: 200 }}>
            Are they a Pragati member? Search the list to give them member prices
            <input
              value={memberQ}
              placeholder="Their name or member number"
              onChange={(e) => {
                setMemberQ(e.target.value);
                const q = e.target.value;
                if (q.trim().length < 2) return setMemberHits([]);
                start(async () => {
                  const res = await memberLookupAction(q);
                  if (res.ok) setMemberHits(res.data ?? []);
                });
              }}
            />
          </label>
          {memberId && (
            <span className="desk-chip chip-ok">
              member prices · {memberLabel}
              <button
                className="ml-1 underline"
                onClick={() => {
                  setMemberId(null);
                  setMemberLabel(null);
                }}
              >
                clear
              </button>
            </span>
          )}
        </div>
        {memberHits.length > 0 && !memberId && (
          <div className="flex flex-col gap-1">
            {memberHits.map((m) => (
              <button
                key={m.memberId}
                className="desk-hit"
                onClick={() => {
                  setMemberId(m.memberId);
                  setMemberLabel(m.label);
                  setMemberHits([]);
                  setMemberQ("");
                }}
              >
                <span className="grow">{m.label}</span>
                <span className={`desk-chip ${m.active ? "chip-ok" : "chip-warn"}`}>
                  {m.active ? "member" : "lapsed"}
                </span>
              </button>
            ))}
          </div>
        )}
        {gaps.length > 0 && (
          <p className="desk-note">
            {gaps.map((g) => (
              <span key={g} className="desk-chip chip-mute mr-2">
                {g}
              </span>
            ))}
          </p>
        )}
      </BuyerShell>

      {/* ── the party ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PERSON_KIND_LABEL) as PersonKind[])
          .filter((k) => event.kinds[k])
          .map((k) => (
            <button key={k} className="kind-btn" onClick={() => setRows((p) => [...p, newRow(k, allDays)])}>
              + {PERSON_KIND_LABEL[k]}
            </button>
          ))}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const minor = isMinor(r);
          const needsGuardianPick = minor && !r.guardianTicketId && !r.guardianRef && adults.length !== 1;
          return (
            <div key={r.ref} className={`person-card ${needsGuardianPick ? "has-problem" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="desk-chip chip-mute">{PERSON_KIND_LABEL[r.kind]}</span>
                <span className="grow" />
                <button className="text-xs underline underline-offset-4" onClick={() => remove(r.ref)}>
                  remove
                </button>
              </div>

              <div className="desk-grid2">
                <label className="desk-field">
                  First name
                  <input value={r.firstName} onChange={(e) => update(r.ref, { firstName: e.target.value })} />
                </label>
                <label className="desk-field">
                  Last name (optional)
                  <input value={r.lastName} onChange={(e) => update(r.ref, { lastName: e.target.value })} />
                </label>
                {(r.kind === "youth" || r.kind === "under5") && (
                  <label className="desk-field">
                    How old are they? (optional)
                    <input
                      value={r.age}
                      inputMode="numeric"
                      onChange={(e) => update(r.ref, { age: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    />
                  </label>
                )}
                {r.kind === "student" && (
                  <>
                    <label className="desk-field">
                      School email
                      <input value={r.eduEmail} onChange={(e) => update(r.ref, { eduEmail: e.target.value })} />
                    </label>
                    <label className="desk-field">
                      University
                      <input value={r.university} onChange={(e) => update(r.ref, { university: e.target.value })} />
                    </label>
                  </>
                )}
              </div>

              {event.days.length > 1 && (
                <div>
                  <p className="desk-field mb-1">Which days are they coming?</p>
                  <div className="kind-row">
                    {event.days.map((d) => (
                      <button
                        key={d.key}
                        className="day-btn"
                        aria-pressed={r.days.includes(d.key)}
                        onClick={() =>
                          update(r.ref, {
                            days: r.days.includes(d.key) ? r.days.filter((x) => x !== d.key) : [...r.days, d.key],
                          })
                        }
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Food used to be four identical buttons in one row: "Eating with
                  us / No food / Veg / Non-veg". Two different questions wearing
                  the same clothes — with two of the four lit, it read as a
                  random pattern rather than a choice. It is one question at the
                  desk ("veg, non-veg, or not eating?"), so it is one row of
                  mutually exclusive answers here. A child's plate isn't a
                  choice, so their row keeps the simple yes/no. */}
              {r.kind !== "concert" && event.foodIsAChoice && (
                <div>
                  <p className="desk-field mb-1">Are they eating with us?</p>
                  <div className="kind-row items-center">
                    {r.kind === "youth" || r.kind === "under5" ? (
                      <>
                        <button
                          className="kind-btn"
                          aria-pressed={r.withFood}
                          onClick={() => update(r.ref, { withFood: true, foodPref: "kid" })}
                        >
                          Yes, a kid&rsquo;s plate
                        </button>
                        <button
                          className="kind-btn"
                          aria-pressed={!r.withFood}
                          onClick={() => update(r.ref, { withFood: false, foodPref: "none" })}
                        >
                          Not eating
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="kind-btn"
                          aria-pressed={r.withFood && r.foodPref === "veg"}
                          onClick={() => update(r.ref, { withFood: true, foodPref: "veg" })}
                        >
                          Veg
                        </button>
                        <button
                          className="kind-btn"
                          aria-pressed={r.withFood && r.foodPref === "non_veg"}
                          onClick={() => update(r.ref, { withFood: true, foodPref: "non_veg" })}
                        >
                          Non-veg
                        </button>
                        <button
                          className="kind-btn"
                          aria-pressed={!r.withFood}
                          onClick={() => update(r.ref, { withFood: false, foodPref: "none" })}
                        >
                          Not eating
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {minor && adults.length === 1 && !r.guardianTicketId && (
                <p className="desk-note">
                  Coming with <strong>{adults[0].firstName}</strong>.{" "}
                  <button
                    className="underline underline-offset-4"
                    onClick={() => update(r.ref, { guardianRef: "__pick__" })}
                  >
                    someone else?
                  </button>
                </p>
              )}
              {minor && (adults.length !== 1 || r.guardianRef === "__pick__" || r.guardianTicketId) && (
                <GuardianPicker
                  row={r}
                  adults={adults}
                  parentAdults={parentAdults}
                  onPickInParty={(ref) => update(r.ref, { guardianRef: ref, guardianTicketId: null, guardianLabel: null })}
                  onPickTicket={(ticketId, label) =>
                    update(r.ref, { guardianTicketId: ticketId, guardianRef: null, guardianLabel: label })
                  }
                />
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="desk-note">Tap a button above to add each person who’s coming.</p>
        )}
      </div>

      <label className="desk-field">
        Anything worth noting? (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {/* ── total + create ────────────────────────────────────────────── */}
      <div className={`desk-balance ${quote && quote.dueCents > 0 ? "desk-balance--owed" : ""}`}>
        <span>
          <span className="lbl">Total</span>
          <br />
          <span className="amount">{money(quote?.dueCents ?? 0)}</span>
        </span>
        <span className="desk-note">
          {/* A price of $0.00 next to three lit-up day buttons reads as broken.
              Nothing is priced until a person has a first name, so say that
              plainly rather than showing a total nobody can explain. */}
          {people.length === 0 ? (
            <span className="hint-need">Type a first name to see the price</span>
          ) : (
            <>
              {quote?.passes ?? 0} {(quote?.passes ?? 0) === 1 ? "pass" : "passes"}
              {pending ? " · working it out…" : ""}
            </>
          )}
        </span>
        <span className="grow" />
        <button className="btn-primary" disabled={saving || people.length === 0 || !buyerName.trim()} onClick={submit}>
          {saving ? "Saving…" : "Save and take payment →"}
        </button>
      </div>

      {quote?.problems?.length ? (
        <div className="desk-error">
          {quote.problems.map((p) => (
            <div key={p.firstName + p.why}>{p.why}</div>
          ))}
        </div>
      ) : null}

      {minorsWithoutGuardian.length > 0 && (
        <div className="desk-error">
          Which adult is {minorsWithoutGuardian.map((r) => r.firstName).join(", ")} coming with? A child can’t
          have a pass on their own.
          <label className="flex items-center gap-2 mt-2 text-xs font-normal">
            <input type="checkbox" checked={overrideGuardian} onChange={(e) => setOverrideGuardian(e.target.checked)} />
            Admin only: let them in anyway (the gate will be told)
          </label>
        </div>
      )}

      {error && (
        <div className="desk-error">
          {error}
          {/capacity|sold out|left for/i.test(error) && (
            <label className="flex items-center gap-2 mt-2 text-xs font-normal">
              <input
                type="checkbox"
                checked={overrideCapacity}
                onChange={(e) => setOverrideCapacity(e.target.checked)}
              />
              Admin only: sell it anyway, past the limit
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The "who is paying" card.
 *
 * Registering a family: a plain open card, because it is the first thing to
 * fill in. Adding to an existing booking: a folded one, because the answer is
 * already printed at the top of the screen and retyping it is how an addition
 * ends up under a slightly different name from the family it belongs to.
 */
function BuyerShell({
  folded,
  summary,
  children,
}: {
  folded: boolean;
  summary: string;
  children: React.ReactNode;
}) {
  if (!folded) return <div className="festive-card p-4 flex flex-col gap-3">{children}</div>;
  return (
    <details className="festive-card p-4 flex flex-col gap-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Paying: <strong>{summary}</strong>
        <span className="desk-note"> — tap if this addition is going on someone else</span>
      </summary>
      <div className="flex flex-col gap-3 mt-3">{children}</div>
    </details>
  );
}

/** Pick the adult a minor is coming with — in this party, or already inside. */
function GuardianPicker({
  row,
  adults,
  parentAdults,
  onPickInParty,
  onPickTicket,
}: {
  row: Row;
  adults: Row[];
  parentAdults: { ticketId: string; label: string }[];
  onPickInParty: (ref: string) => void;
  onPickTicket: (ticketId: string, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ ticketId: string; name: string; conf: string; checkedInAt: Date | null }[]>([]);
  const [, start] = useTransition();

  if (row.guardianTicketId)
    return (
      <p className="desk-note">
        Guardian: <strong>{row.guardianLabel}</strong>{" "}
        <button className="underline" onClick={() => onPickInParty("")}>
          change
        </button>
      </p>
    );

  return (
    <div className="flex flex-col gap-2">
      <p className="desk-field">Who is this child coming with?</p>
      <div className="kind-row">
        {adults.map((a) => (
          <button
            key={a.ref}
            className="kind-btn"
            aria-pressed={row.guardianRef === a.ref}
            onClick={() => onPickInParty(a.ref)}
          >
            {a.firstName || "(type their name first)"}
          </button>
        ))}
        {/* On an amendment the adult is already on the booking at the top of
            this screen. Offering them as a tap is the difference between "add
            the kid" and "type the dad's name into a search box to find the
            booking you are literally looking at". */}
        {parentAdults.map((a) => (
          <button
            key={a.ticketId}
            className="kind-btn"
            aria-pressed={row.guardianTicketId === a.ticketId}
            onClick={() => onPickTicket(a.ticketId, a.label)}
          >
            {a.label} <span className="text-xs opacity-70">· already booked</span>
          </button>
        ))}
        {adults.length === 0 && parentAdults.length === 0 && (
          <span className="desk-note">No adult added yet — add one above.</span>
        )}
      </div>
      <label className="desk-field">
        …or an adult who’s already registered (they may be inside already)
        <input
          value={q}
          placeholder="Name or PRG number"
          onChange={(e) => {
            setQ(e.target.value);
            const v = e.target.value;
            if (v.trim().length < 2) return setHits([]);
            start(async () => {
              const res = await guardianSearchAction(v);
              if (res.ok) setHits((res.data as typeof hits) ?? []);
            });
          }}
        />
      </label>
      {hits.map((h) => (
        <button
          key={h.ticketId}
          className="desk-hit"
          onClick={() => onPickTicket(h.ticketId, `${h.name} (${h.conf})`)}
        >
          <span className="grow">
            <strong>{h.name}</strong> <span className="text-xs opacity-60">{h.conf}</span>
          </span>
          {h.checkedInAt && <span className="desk-chip chip-ok">checked in</span>}
        </button>
      ))}
    </div>
  );
}

export { parseAmountToCents };
