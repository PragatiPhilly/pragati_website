"use client";

/**
 * Scan desk — one screen for every scan the event runs.
 *
 * Modes (chips at the top):
 *   · Entry check-in — always available. A scanned QR checks in instantly;
 *     a re-scan is flagged with a big red banner.
 *   · One chip per OPEN food window (set up in Admin → Scan setup). A scanned
 *     QR is served instantly and the screen flashes the food color code
 *     (veg / non-veg / kid); a re-scan inside the same window is flagged.
 */
import { useCallback, useState, useTransition } from "react";
import {
  lookupTicketsAction,
  checkInTicketAction,
  checkInAllAction,
  undoCheckInAction,
  entryScanAction,
  type CheckinTicket,
} from "./actions";
import {
  mealLookupAction,
  serveTicketAction,
  type MealLookupTicket,
  type ScanSessionInfo,
} from "../scans/actions";
import QrScanner from "./QrScanner";
import ScanResult, { type ScanVerdict } from "./ScanResult";

type Colors = { veg: string; non_veg: string; kid: string };

type Banner = ScanVerdict;

const FOOD_LABEL: Record<string, string> = {
  veg: "🥬 VEG",
  non_veg: "🐟 NON-VEG",
  kid: "🍚 KID'S MEAL",
  none: "no food",
};

/** Big single word for the food takeover — no emoji, readable at arm's length. */
const FOOD_WORD: Record<string, string> = {
  veg: "VEG",
  non_veg: "NON-VEG",
  kid: "KID'S MEAL",
  none: "NO MEAL",
};

export default function CheckinForm({
  openSessions,
  colors,
  isAdmin,
}: {
  openSessions: ScanSessionInfo[];
  colors: Colors;
  isAdmin: boolean;
}) {
  const [mode, setMode] = useState<string>("entry"); // "entry" | session id
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<CheckinTicket[] | null>(null);
  const [mealTickets, setMealTickets] = useState<MealLookupTicket[] | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const session = openSessions.find((s) => s.id === mode) ?? null;

  const foodColor = (food: string) =>
    food === "veg" ? colors.veg : food === "non_veg" ? colors.non_veg : food === "kid" ? colors.kid : "var(--ink-soft)";

  const switchMode = (m: string) => {
    setMode(m);
    setTickets(null);
    setMealTickets(null);
    setBanner(null);
    setQuery("");
  };

  // ── entry mode ────────────────────────────────────────────────
  const refreshEntry = (q: string) =>
    startTransition(async () => {
      setTickets(await lookupTicketsAction(q));
    });

  const entryScan = (value: string) =>
    startTransition(async () => {
      const r = await entryScanAction(value);
      if (r.kind === "checked_in") {
        setBanner({
          tone: "ok",
          color: "#1E6B2A",
          name: r.attendee,
          line1: r.partyTotal > 1 ? `${r.partyIn} of ${r.partyTotal} in this party` : "Welcome in!",
          line2: `${r.passName} · ${r.day} · ${r.conf}`,
          needsId: r.isStudent,
          timed: r.isConcert,
        });
        setTickets(null);
      } else if (r.kind === "duplicate") {
        setBanner({
          tone: "dup",
          name: `ALREADY CHECKED IN`,
          line1: `${r.attendee} — scanned at ${r.checkedInAt}`,
          line2: `If they haven't entered, check photo ID against ${r.conf}.`,
        });
        setTickets(null);
      } else if (r.kind === "invalid") {
        setBanner({ tone: "bad", name: "NOT VALID", line1: r.reason });
        setTickets(null);
      } else {
        setBanner(null);
        setTickets(await lookupTicketsAction(value));
      }
    });

  // ── meal mode ─────────────────────────────────────────────────
  const refreshMeal = (q: string) =>
    startTransition(async () => {
      if (session) setMealTickets(await mealLookupAction(session.id, q));
    });

  const serve = (ticketId: string, refreshQ?: string) =>
    startTransition(async () => {
      if (!session) return;
      const r = await serveTicketAction(session.id, ticketId);
      if (r.kind === "served") {
        setBanner({
          tone: "ok",
          color: foodColor(r.food),
          foodWord: FOOD_WORD[r.food] ?? r.food.toUpperCase(),
          name: r.attendee,
          line1: `${r.sessionLabel} · ${r.count} served`,
        });
        setSessionCount(r.count);
      } else if (r.kind === "duplicate") {
        setBanner({
          tone: "dup",
          name: "ALREADY SERVED",
          line1: `${r.attendee} — ${r.sessionLabel} at ${r.scannedAt}`,
          line2: r.conf,
        });
      } else {
        setBanner({ tone: "bad", name: "NOT VALID", line1: r.reason });
      }
      if (refreshQ) setMealTickets(await mealLookupAction(session.id, refreshQ));
      else setMealTickets(null);
    });

  const mealScan = (value: string) =>
    startTransition(async () => {
      if (!session) return;
      const results = await mealLookupAction(session.id, value);
      if (results.length === 1) {
        const t = results[0];
        if (t.servedAt) {
          setBanner({
            tone: "dup",
            name: "ALREADY SERVED",
            line1: `${t.attendee} — ${session.label} at ${t.servedAt}`,
            line2: t.conf,
          });
          setMealTickets(null);
        } else if (!t.eligible) {
          setBanner({ tone: "bad", name: "NOT VALID HERE", line1: t.reason ?? "" });
          setMealTickets(null);
        } else {
          await serve(t.id);
        }
      } else {
        setBanner(null);
        setMealTickets(results);
      }
    });

  const handleScan = useCallback(
    (value: string) => {
      setQuery(value);
      if (session) mealScan(value);
      else entryScan(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.id]
  );

  const search = () => {
    setBanner(null);
    if (session) refreshMeal(query.trim());
    else refreshEntry(query.trim());
  };

  const notIn = (tickets ?? []).filter((t) => !t.checkedInAt);

  return (
    <div>
      {/* ── mode chips ─────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button
          className="rounded-full px-4 py-2 text-sm font-bold transition-colors"
          style={
            mode === "entry"
              ? { background: "var(--sindoor)", color: "var(--cream)" }
              : { background: "var(--accent-soft)", color: "var(--ink)" }
          }
          onClick={() => switchMode("entry")}
        >
          🎟 Entry check-in
        </button>
        {openSessions.map((s) => (
          <button
            key={s.id}
            className="rounded-full px-4 py-2 text-sm font-bold transition-colors"
            style={
              mode === s.id
                ? { background: "var(--leaf-deep)", color: "var(--cream)" }
                : { background: "var(--accent-soft)", color: "var(--ink)" }
            }
            onClick={() => switchMode(s.id)}
          >
            🍛 {s.label}
            <span className="ml-1.5 opacity-80">· {sessionCount !== null && mode === s.id ? sessionCount : s.total}</span>
          </button>
        ))}
        {openSessions.length === 0 && isAdmin && (
          <a href="/admin/scans" className="text-xs self-center underline underline-offset-4 opacity-70 hover:opacity-100">
            + set up food scans
          </a>
        )}
      </div>

      {/* ── the verdict, full-bleed (see ScanResult) ───────────── */}
      <ScanResult verdict={banner} onDismiss={() => setBanner(null)} />

      <QrScanner onScan={handleScan} />

      <div className="flex gap-3">
        <input
          className="input flex-1"
          placeholder={
            session
              ? `Scan or search — serving ${session.label}`
              : "Name, phone, email, PRG-2026-0001 or scanned code"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          autoFocus
        />
        <button className="btn-primary !px-6" onClick={search} disabled={pending || !query.trim()}>
          {pending ? "…" : "Find"}
        </button>
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
        No ticket, no phone, no email? Just search their <strong>name</strong> or <strong>phone number</strong>.
      </p>

      {/* ── meal-mode list ─────────────────────────────────────── */}
      {session && mealTickets !== null && (
        <div className="mt-6 grid gap-3">
          {mealTickets.length === 0 && (
            <p className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
              Nothing found — check spelling, or try the buyer&apos;s phone number. (Only paid registrations appear.)
            </p>
          )}
          {mealTickets.map((t) => (
            <div key={t.id} className="festive-card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ background: foodColor(t.food) }}
                  title={FOOD_LABEL[t.food]}
                />
                <div>
                  <p className="font-semibold">
                    {t.attendee} {t.isKid && "🧒"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t.conf} · {t.day === "all" ? "all days" : t.day} · {FOOD_LABEL[t.food] ?? t.food}
                  </p>
                </div>
              </div>
              {t.servedAt ? (
                <span className="text-sm font-bold" style={{ color: "#8f1d1d" }}>
                  ⛔ served at {t.servedAt}
                </span>
              ) : !t.eligible ? (
                <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                  {t.reason}
                </span>
              ) : (
                <button
                  className="btn-primary !py-2 !px-5 text-sm"
                  disabled={pending}
                  onClick={() => serve(t.id, query.trim())}
                >
                  Serve →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── entry-mode list (unchanged behavior) ───────────────── */}
      {!session && tickets !== null && (
        <div className="mt-6 grid gap-3">
          {tickets.length === 0 && (
            <p className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
              Nothing found — check spelling, or try the buyer&apos;s phone number. (Only paid registrations appear.)
            </p>
          )}

          {notIn.length > 1 && (
            <button
              className="btn-primary w-full !py-3.5"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await checkInAllAction(notIn.map((t) => t.id));
                  await refreshEntry(query.trim());
                })
              }
            >
              ✓✓ Check in all {notIn.length} — whole party
            </button>
          )}

          {tickets.map((t) => (
            <div key={t.id} className="festive-card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold">
                  {t.attendee} {t.isKid && "🧒"}
                </p>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t.conf} · booked by {t.buyer} · {t.day === "all" ? "all days" : t.day} · food: {t.food ?? "—"}
                </p>
              </div>
              {t.checkedInAt ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: "var(--leaf-deep)" }}>
                    ✓ in at {t.checkedInAt}
                  </span>
                  <button
                    className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await undoCheckInAction(t.id);
                        await refreshEntry(query.trim());
                      })
                    }
                  >
                    undo
                  </button>
                </div>
              ) : (
                <button
                  className="btn-primary !py-2 !px-5 text-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await checkInTicketAction(t.id);
                      await refreshEntry(query.trim());
                    })
                  }
                >
                  Check in →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
