"use client";

/**
 * The cash box: a quiet line, never a wall.
 *
 * The first version of this screen greeted a volunteer with "No till is open"
 * in a warning box before they could do anything. That is two failures at once:
 * "till" is a word they don't have, and blocking the screen before the first
 * task is the wrong order of business. You can search and register a family
 * without one — you only need it at the moment you touch money, and the
 * payment screen asks for it there, in context.
 *
 * What it actually is, in one sentence a volunteer accepts: the money in front
 * of you, counted at the start and counted at the end, so a shortfall belongs
 * to a shift rather than to a person's reputation.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openShiftAction, recordDropAction } from "./actions";
import { parseAmountToCents } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type CashBox = {
  id: string;
  station: string;
  openedByEmail: string | null;
  openingFloatCents: number;
  dropsCents: number;
  cashTakenCents: number;
} | null;

export default function CashBoxStrip({
  box,
  defaultStation,
  canCount,
}: {
  box: CashBox;
  defaultStation: string;
  canCount: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState(false);
  const [drop, setDrop] = useState(false);
  const [station, setStation] = useState(defaultStation);
  const [float, setFloat] = useState("200");
  const [dropAmount, setDropAmount] = useState("");
  const [dropTo, setDropTo] = useState("");

  if (!box) {
    return (
      <div className="cashbox-strip">
        {!form ? (
          <>
            <span>
              💰 <b>Cash box not started.</b>{" "}
              <span>You can register people now — you’ll need this before taking cash.</span>
            </span>
            <span className="spacer" />
            <button className="btn-secondary" onClick={() => setForm(true)}>
              Start the cash box
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-end gap-3 w-full">
            <label className="desk-field">
              Which desk are you on?
              <input value={station} onChange={(e) => setStation(e.target.value)} style={{ width: 130 }} />
            </label>
            <label className="desk-field">
              Change you’re starting with
              <input value={float} inputMode="decimal" onChange={(e) => setFloat(e.target.value)} style={{ width: 130 }} />
            </label>
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const cents = parseAmountToCents(float);
                  if (cents === null) return setError("Type a number, like 200");
                  const res = await openShiftAction({ station, openingFloatCents: cents });
                  if (!res.ok) setError(res.error);
                  else {
                    setError("");
                    setForm(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Starting…" : "Start"}
            </button>
            <button className="text-xs underline underline-offset-4" onClick={() => setForm(false)}>
              not now
            </button>
            {error && <span className="desk-error">{error}</span>}
          </div>
        )}
      </div>
    );
  }

  const shouldHold = box.openingFloatCents + box.cashTakenCents - box.dropsCents;

  return (
    <div className="cashbox-strip on">
      <span>
        💰 <b>{box.station}</b> · started by {box.openedByEmail ?? "someone"}
      </span>
      <span>
        cash taken <b>{money(box.cashTakenCents)}</b> · box should hold <b>{money(shouldHold)}</b>
      </span>
      <span className="spacer" />
      {!drop ? (
        <button className="text-xs underline underline-offset-4" onClick={() => setDrop(true)}>
          I handed cash to the treasurer
        </button>
      ) : (
        <span className="flex flex-wrap items-end gap-2">
          <label className="desk-field">
            How much
            <input value={dropAmount} inputMode="decimal" onChange={(e) => setDropAmount(e.target.value)} style={{ width: 100 }} />
          </label>
          <label className="desk-field">
            To whom
            <input value={dropTo} onChange={(e) => setDropTo(e.target.value)} style={{ width: 140 }} />
          </label>
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const cents = parseAmountToCents(dropAmount);
                if (cents === null || cents <= 0) return setError("Type how much you handed over.");
                const res = await recordDropAction(box.id, cents, dropTo);
                if (!res.ok) setError(res.error);
                else {
                  setError("");
                  setDrop(false);
                  setDropAmount("");
                  setDropTo("");
                  router.refresh();
                }
              })
            }
          >
            Save
          </button>
          <button className="text-xs underline" onClick={() => setDrop(false)}>
            cancel
          </button>
        </span>
      )}
      {canCount && (
        <a className="text-xs underline underline-offset-4" href="/admin/desk/shifts">
          Count it at the end →
        </a>
      )}
      {error && <span className="desk-error">{error}</span>}
    </div>
  );
}
