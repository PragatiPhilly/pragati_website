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
}: {
  event: BuilderEvent;
  presetName?: string;
  parentRegistrationId?: string | null;
  parentLabel?: string | null;
}) {
  const router = useRouter();
  const allDays = useMemo(() => event.days.map((d) => d.key), [event.days]);
  // One key for the life of this screen: a double-tapped Create returns the
  // same order instead of a second one.
  const idem = useRef(crypto.randomUUID());

  const [buyerName, setBuyerName] = useState(presetName);
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
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
          guardianRef: r.guardianRef,
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
  const gaps: string[] = [];
  if (!buyerEmail.trim()) gaps.push("no email — tickets can't be sent yet");
  if (!buyerPhone.trim()) gaps.push("no phone");
  const minorsWithoutGuardian = rows.filter(
    (r) => isMinor(r) && r.firstName.trim() && !r.guardianTicketId && !r.guardianRef && adults.length !== 1
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
          {parentRegistrationId ? "Add to an existing order" : "New walk-in"}
        </h1>
        <p className="desk-note">
          {parentLabel ? (
            <>
              Adding to <strong>{parentLabel}</strong>. Only the new people are priced; the original passes are not
              touched.
            </>
          ) : (
            <>
              Only a first name and one adult are required. Anything you don&apos;t have becomes a follow-up — never a
              made-up email.
            </>
          )}
        </p>
      </div>

      {/* ── who is paying ─────────────────────────────────────────────── */}
      <div className="festive-card p-4 flex flex-col gap-3">
        <div className="desk-grid2">
          <label className="desk-field">
            Name (required)
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Who's paying" />
          </label>
          <label className="desk-field">
            Mobile (optional)
            <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} inputMode="tel" />
          </label>
          <label className="desk-field">
            Email (optional)
            <input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} inputMode="email" />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="desk-field" style={{ flex: 1, minWidth: 200 }}>
            Member? Look them up on the roster
            <input
              value={memberQ}
              placeholder="Name, member number or phone"
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
              member pricing · {memberLabel}
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
                  {m.active ? "active" : "not active"}
                </span>
              </button>
            ))}
          </div>
        )}
        {gaps.length > 0 && (
          <p className="desk-note">
            {gaps.map((g) => (
              <span key={g} className="desk-chip chip-warn mr-2">
                {g}
              </span>
            ))}
          </p>
        )}
      </div>

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
                    Age (optional — chased later if blank)
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
                  <p className="desk-field mb-1">Days</p>
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

              {r.kind !== "concert" && event.foodIsAChoice && (
                <div className="kind-row items-center">
                  <button className="kind-btn" aria-pressed={r.withFood} onClick={() => update(r.ref, { withFood: true })}>
                    With food
                  </button>
                  <button
                    className="kind-btn"
                    aria-pressed={!r.withFood}
                    onClick={() => update(r.ref, { withFood: false, foodPref: "none" })}
                  >
                    No food
                  </button>
                  {r.withFood && r.kind !== "youth" && r.kind !== "under5" && (
                    <>
                      <button
                        className="kind-btn"
                        aria-pressed={r.foodPref === "veg"}
                        onClick={() => update(r.ref, { foodPref: "veg" })}
                      >
                        Veg
                      </button>
                      <button
                        className="kind-btn"
                        aria-pressed={r.foodPref === "non_veg"}
                        onClick={() => update(r.ref, { foodPref: "non_veg" })}
                      >
                        Non-veg
                      </button>
                    </>
                  )}
                </div>
              )}

              {minor && (
                <GuardianPicker
                  row={r}
                  adults={adults}
                  onPickInParty={(ref) => update(r.ref, { guardianRef: ref, guardianTicketId: null, guardianLabel: null })}
                  onPickTicket={(ticketId, label) =>
                    update(r.ref, { guardianTicketId: ticketId, guardianRef: null, guardianLabel: label })
                  }
                />
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="desk-note">Add at least one person with the buttons above.</p>}
      </div>

      <label className="desk-field">
        Note (optional — anything the treasurer should know)
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
          {quote?.passes ?? 0} pass{(quote?.passes ?? 0) === 1 ? "" : "es"}
          {pending ? " · pricing…" : ""}
        </span>
        <span className="grow" />
        <button className="btn-primary" disabled={saving || people.length === 0 || !buyerName.trim()} onClick={submit}>
          {saving ? "Opening…" : "Open order →"}
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
          {minorsWithoutGuardian.map((r) => r.firstName).join(", ")} needs an adult attached. A minor never enters on
          their own pass.
          <label className="flex items-center gap-2 mt-2 text-xs font-normal">
            <input type="checkbox" checked={overrideGuardian} onChange={(e) => setOverrideGuardian(e.target.checked)} />
            Admin override — let them in anyway, flagged at the gate
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
              Admin override — go past capacity (recorded on the order)
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Pick the adult a minor is coming with — in this party, or already inside. */
function GuardianPicker({
  row,
  adults,
  onPickInParty,
  onPickTicket,
}: {
  row: Row;
  adults: Row[];
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
            {a.firstName || "(unnamed adult)"}
          </button>
        ))}
        {adults.length === 0 && <span className="desk-note">No adult in this party yet.</span>}
      </div>
      <label className="desk-field">
        …or someone already registered (they may be inside already)
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
