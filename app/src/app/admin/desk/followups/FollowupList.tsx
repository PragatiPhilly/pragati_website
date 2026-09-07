"use client";

/**
 * Everything the desk couldn't finish on the night.
 *
 * The first version listed one row per problem: nine rows for three families,
 * each with its own note box, its own Done, its own Drop it, its own link back.
 * It scanned as a wall, the chips collided with the labels beside them, and —
 * worse — it split the work the wrong way. Nobody chases a "missing email".
 * They ring RATUL, and while they have him they get his email, his phone and
 * his daughter's age in the same call.
 *
 * So the card is the family, and the problems live inside it. One phone number
 * to dial, one email box to fill, one "all sorted" when the call ends.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkResolveAction, fillEmailAndSendAction, resolveFollowupAction } from "../actions";
import { FOLLOWUP_LABEL, type FollowupKind } from "@/lib/desk/constants";

export type FollowupRow = {
  id: string;
  kind: FollowupKind;
  detail: string | null;
  createdAt: string;
  registrationId: string | null;
  conf: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  assignedToEmail: string | null;
  status: string;
};

type Group = {
  key: string;
  name: string;
  conf: string | null;
  phone: string | null;
  registrationId: string | null;
  items: FollowupRow[];
};

/** One card per family, oldest problem first inside it. */
function group(rows: FollowupRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = r.registrationId ?? `loose:${r.id}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: r.buyerName ?? "Someone",
        conf: r.conf,
        phone: r.buyerPhone,
        registrationId: r.registrationId,
        items: [],
      };
      map.set(key, g);
    }
    g.items.push(r);
    // A phone number on any row is a phone number for the family.
    if (!g.phone && r.buyerPhone) g.phone = r.buyerPhone;
  }
  return [...map.values()];
}

export default function FollowupList({ rows }: { rows: FollowupRow[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [email, setEmail] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      setError("");
      setOk("");
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else {
        setOk(res.message ?? "Done ✓");
        router.refresh();
      }
    });

  if (rows.length === 0)
    return <p className="desk-note">Nothing to chase. Everything the desk started has been finished off.</p>;

  const groups = group(rows);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const needsEmail = g.items.find((i) => i.kind === "missing_email");
        return (
          <div key={g.key} className="festive-card followup-card">
            <div className="fu-head">
              <span className="fu-who">
                <strong>{g.name}</strong>
                {g.conf && <span className="fu-conf">{g.conf}</span>}
              </span>
              {g.phone ? (
                <a className="fu-phone" href={`tel:${g.phone.replace(/[^\d+]/g, "")}`}>
                  ☎ {g.phone}
                </a>
              ) : (
                <span className="desk-note">no phone number either</span>
              )}
              {g.registrationId && (
                <a className="text-xs underline underline-offset-4" href={`/admin/desk/o/${g.registrationId}`}>
                  open booking
                </a>
              )}
            </div>

            <ul className="fu-items">
              {g.items.map((f) => (
                <li key={f.id}>
                  <span className="desk-chip chip-warn">{FOLLOWUP_LABEL[f.kind] ?? f.kind}</span>
                  <span className="grow">{f.detail}</span>
                  <button
                    className="fu-tick"
                    disabled={busy}
                    title="This one is sorted"
                    onClick={() => act(() => resolveFollowupAction(f.id, note[g.key] ?? ""))}
                  >
                    ✓ sorted
                  </button>
                  <button
                    className="text-xs underline underline-offset-4"
                    disabled={busy}
                    title="We are never going to get this"
                    onClick={() => act(() => resolveFollowupAction(f.id, note[g.key] ?? "", true))}
                  >
                    give up
                  </button>
                </li>
              ))}
            </ul>

            {/* The email is the one thing that DOES something when you type it:
                the family's passes go out the moment it lands. So it gets a real
                field on the card, not a link to another screen. */}
            {needsEmail && needsEmail.registrationId && (
              <div className="fu-email">
                <label className="desk-field grow">
                  Their email — their passes go out as soon as you save it
                  <input
                    value={email[g.key] ?? ""}
                    inputMode="email"
                    placeholder="name@example.com"
                    onChange={(e) => setEmail({ ...email, [g.key]: e.target.value })}
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={busy || !(email[g.key] ?? "").includes("@")}
                  onClick={() => act(() => fillEmailAndSendAction(needsEmail.registrationId!, email[g.key] ?? ""))}
                >
                  Save &amp; send their passes
                </button>
              </div>
            )}

            <div className="fu-foot">
              <label className="desk-field grow">
                What happened? (optional — saved against whatever you tick)
                <input
                  value={note[g.key] ?? ""}
                  placeholder="Rang them, got the email"
                  onChange={(e) => setNote({ ...note, [g.key]: e.target.value })}
                />
              </label>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => act(() => bulkResolveAction(g.items.map((i) => i.id), note[g.key] ?? "All sorted"))}
              >
                All sorted for {g.name.split(" ")[0]}
              </button>
            </div>
          </div>
        );
      })}

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
