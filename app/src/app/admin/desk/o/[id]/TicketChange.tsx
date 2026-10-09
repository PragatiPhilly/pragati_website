"use client";

/** One pass row on the desk order page, with an inline "Change" form (same-price changes only). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeTicketAction } from "../../online-actions";

export default function TicketChange({
  ticketId,
  firstName,
  lastName,
  food,
  canFood,
  days,
  locked,
  children,
}: {
  ticketId: string;
  firstName: string;
  lastName: string;
  food: string | null;
  canFood: boolean;
  days: { ticketTypeId: string; label: string }[];
  /** e.g. already used at the gate → day can't move */
  locked: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [pref, setPref] = useState(food ?? "");
  const [day, setDay] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await changeTicketAction(ticketId, {
        firstName: first,
        lastName: last,
        foodPref: canFood && (pref === "veg" || pref === "non_veg") ? pref : undefined,
        toTicketTypeId: day || undefined,
      });
      if (!res.ok) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: res.message ?? "Saved ✓" });
        setDay("");
        router.refresh();
      }
    });

  return (
    <div>
      <div className="desk-row">
        {children}
        <button type="button" className="text-xs underline underline-offset-4" onClick={() => setOpen(!open)}>
          {open ? "close" : "change"}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2" style={{ background: "var(--accent-soft)" }}>
          <div className="desk-grid2 pt-3">
            <label className="desk-field">
              First name
              <input value={first} onChange={(e) => setFirst(e.target.value)} />
            </label>
            <label className="desk-field">
              Last name
              <input value={last} onChange={(e) => setLast(e.target.value)} />
            </label>
            {canFood && (
              <label className="desk-field">
                Food
                <select value={pref} onChange={(e) => setPref(e.target.value)}>
                  <option value="non_veg">Non-veg</option>
                  <option value="veg">Veg</option>
                </select>
              </label>
            )}
            {days.length > 0 && !locked && (
              <label className="desk-field">
                Move to another day (same price)
                <select value={day} onChange={(e) => setDay(e.target.value)}>
                  <option value="">— keep this day —</option>
                  {days.map((d) => (
                    <option key={d.ticketTypeId} value={d.ticketTypeId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {locked && days.length > 0 && <p className="desk-note">Already used at the gate, so the day can&apos;t be moved.</p>}
          {!canFood && days.length === 0 && (
            <p className="desk-note">
              Only the name can change on this pass. To add days or change to a different pass, sell a new one with “+ Add more
              people”.
            </p>
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <button type="button" className="btn-primary !py-2 !px-5 text-sm" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save change"}
            </button>
            {msg && <span className={msg.ok ? "desk-ok" : "desk-error"}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
