"use client";

/**
 * The shift banner.
 *
 * No tender can be taken outside an open till, so this is the first thing the
 * desk shows and the thing it refuses to let you past. It stays visible all
 * evening because "how much should be in this drawer" is a question that gets
 * asked at the worst possible moment.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openShiftAction, recordDropAction } from "./actions";
import { parseAmountToCents } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type ShiftView = {
  id: string;
  station: string;
  openedByEmail: string | null;
  openingFloatCents: number;
  dropsCents: number;
  cashTakenCents: number;
} | null;

export default function ShiftBanner({
  shift,
  defaultStation,
  canClose,
}: {
  shift: ShiftView;
  defaultStation: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [dropForm, setDropForm] = useState(false);
  const [station, setStation] = useState(defaultStation);
  const [float, setFloat] = useState("200");
  const [dropAmount, setDropAmount] = useState("");
  const [dropTo, setDropTo] = useState("");

  if (!shift) {
    return (
      <div className="desk-shift desk-shift--closed">
        <span>
          <b>No till is open.</b> Open one before taking any money — every payment is stamped with the drawer it
          belongs to.
        </span>
        <span className="spacer" />
        {!openForm ? (
          <button className="btn-secondary" onClick={() => setOpenForm(true)}>
            Open a till
          </button>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="desk-field">
              Station
              <input value={station} onChange={(e) => setStation(e.target.value)} style={{ width: 120 }} />
            </label>
            <label className="desk-field">
              Opening float
              <input
                value={float}
                inputMode="decimal"
                onChange={(e) => setFloat(e.target.value)}
                style={{ width: 110 }}
              />
            </label>
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const cents = parseAmountToCents(float);
                  if (cents === null) return setError("Type the float as a number, e.g. 200");
                  const res = await openShiftAction({ station, openingFloatCents: cents });
                  if (!res.ok) setError(res.error);
                  else {
                    setError("");
                    setOpenForm(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Opening…" : "Open"}
            </button>
          </div>
        )}
        {error && <span className="desk-error">{error}</span>}
      </div>
    );
  }

  const expected = shift.openingFloatCents + shift.cashTakenCents - shift.dropsCents;

  return (
    <div className="desk-shift">
      <span>
        <b>{shift.station}</b> open · {shift.openedByEmail ?? "unknown"}
      </span>
      <span>
        float {money(shift.openingFloatCents)} · cash taken {money(shift.cashTakenCents)}
        {shift.dropsCents > 0 ? ` · drops ${money(shift.dropsCents)}` : ""}
      </span>
      <span>
        <b>drawer should hold {money(expected)}</b>
      </span>
      <span className="spacer" />
      {!dropForm ? (
        <button className="text-xs underline underline-offset-4" onClick={() => setDropForm(true)}>
          Record a cash drop
        </button>
      ) : (
        <span className="flex flex-wrap items-end gap-2">
          <label className="desk-field">
            Amount
            <input value={dropAmount} inputMode="decimal" onChange={(e) => setDropAmount(e.target.value)} style={{ width: 100 }} />
          </label>
          <label className="desk-field">
            Handed to
            <input value={dropTo} onChange={(e) => setDropTo(e.target.value)} style={{ width: 150 }} />
          </label>
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const cents = parseAmountToCents(dropAmount);
                if (cents === null || cents <= 0) return setError("Type the amount handed over.");
                const res = await recordDropAction(shift.id, cents, dropTo);
                if (!res.ok) setError(res.error);
                else {
                  setError("");
                  setDropForm(false);
                  setDropAmount("");
                  setDropTo("");
                  router.refresh();
                }
              })
            }
          >
            Save
          </button>
        </span>
      )}
      {canClose && (
        <a className="text-xs underline underline-offset-4" href={`/admin/desk/shifts`}>
          Close-out →
        </a>
      )}
      {error && <span className="desk-error">{error}</span>}
    </div>
  );
}
