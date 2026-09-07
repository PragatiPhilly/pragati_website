"use client";

/**
 * The desk's front door: one field.
 *
 * Search FIRST, always. The family who bought online in July is exactly who
 * turns up at the door wanting to add a child, and creating a second unrelated
 * order for them is the mistake this box exists to prevent. Name, phone, email,
 * PRG number, or a scanned pass code all land here.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAction } from "./actions";
import type { DeskSearchHit } from "@/lib/desk/orders";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function DeskSearch({ autoFocus = true }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DeskSearchHit[] | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await searchAction(q);
        if (res.ok) {
          setHits(res.data ?? []);
          setError("");
        } else setError(res.error);
      });
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="desk-search">
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a name or phone number…"
          aria-label="Find a family"
        />

      </div>

      {error && <p className="desk-error">{error}</p>}

      {hits !== null && (
        <div className="flex flex-col gap-2">
          {pending && <p className="desk-note">Looking…</p>}
          {hits.length === 0 && !pending && (
            <p className="desk-note">
              Nobody found with that name. Check the spelling, try their phone number, or register them as a new
              family below.
            </p>
          )}
          {hits.map((h) => (
            <button key={h.id} className="desk-hit" onClick={() => router.push(`/admin/desk/o/${h.id}`)}>
              <span className="who">{h.buyerName}</span>
              <span className="conf">{h.conf}</span>
              {h.deskState === "voided" ? (
                <span className="desk-chip chip-stop">cancelled</span>
              ) : h.balanceCents > 0 ? (
                <span className="desk-chip chip-stop">owes {money(h.balanceCents)}</span>
              ) : (
                <span className="desk-chip chip-ok">paid</span>
              )}
              <span className="desk-chip chip-mute">
                {h.passes} {h.passes === 1 ? "pass" : "passes"}
                {h.checkedIn > 0 ? ` · ${h.checkedIn} already in` : ""}
              </span>
              {h.source !== "desk" && <span className="desk-chip chip-mute">booked online</span>}
              <span className="grow" />
              <span className="desk-note">{h.buyerPhone ?? h.buyerEmail ?? "no contact"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
