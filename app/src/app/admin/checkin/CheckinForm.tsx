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
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  lookupTicketsAction,
  checkInTicketAction,
  checkInAllAction,
  undoCheckInAction,
  entryScanAction,
  type CheckinTicket,
} from "./actions";
import type { ScanSessionInfo } from "../scans/actions";
import QrScanner from "./QrScanner";
import ScanResult, { type ScanVerdict } from "./ScanResult";
import FoodLine, { type FoodLineHandle } from "./FoodLine";
import { foodPrefLabel, type PlateColors } from "@/lib/food";

type Colors = PlateColors;

/**
 * "Station" — what THIS phone is doing (gate, or one meal window). Remembered in
 * a cookie so a volunteer on an iPhone, who scans with the camera app, lands on
 * the right screen: /t/<code> sends a signed-in staff phone whose station is a
 * meal window straight to that family's plates here (spec/18). Giving still
 * takes a tap, so landing there is never an action by itself.
 */
const STATION_COOKIE = "pragati_station";
function setStation(v: string) {
  try {
    document.cookie = `${STATION_COOKIE}=${encodeURIComponent(v)}; path=/; max-age=${12 * 3600}; samesite=lax`;
  } catch {
    /* a convenience only */
  }
}

type Banner = ScanVerdict;

export default function CheckinForm({
  openSessions,
  colors,
  isAdmin,
  initialMode,
  initialQuery,
}: {
  openSessions: ScanSessionInfo[];
  colors: Colors;
  isAdmin: boolean;
  /** "entry" or an open meal window id (?w=) */
  initialMode?: string;
  /** look this up in the food line on arrival (?q=) */
  initialQuery?: string;
}) {
  const router = useRouter();
  const startMode = initialMode && openSessions.some((s) => s.id === initialMode) ? initialMode : "entry";
  const [mode, setMode] = useState<string>(startMode); // "entry" | session id
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<CheckinTicket[] | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [pending, startTransition] = useTransition();
  const food = useRef<FoodLineHandle>(null);

  const session = openSessions.find((s) => s.id === mode) ?? null;

  const switchMode = (m: string) => {
    setMode(m);
    setStation(m === "entry" ? "gate" : `food:${m}`);
    setTickets(null);
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
        const outside = r.party?.outside ?? [];
        setBanner({
          tone: "ok",
          color: "#1E6B2A",
          name: r.attendee,
          line1:
            outside.length > 0
              ? `is in · ${outside.length} more on this booking still outside`
              : r.partyTotal > 1
                ? `${r.partyIn} of ${r.partyTotal} in — whole party is in`
                : "Welcome in!",
          line2: `${r.passName} · ${r.day} · ${r.conf}`,
          needsId: r.isStudent,
          notes: r.notes,
          timed: r.isConcert,
          party: r.party ? { conf: r.party.conf, outside, plates: r.party.plates } : undefined,
        });
        setTickets(null);
      } else if (r.kind === "duplicate") {
        const outside = r.party?.outside ?? [];
        setBanner({
          tone: outside.length > 0 ? "partial" : "dup",
          name: outside.length > 0 ? `${r.attendee.split(" ")[0]} IS ALREADY IN` : "ALREADY CHECKED IN",
          line1:
            outside.length > 0
              ? `Scanned at ${r.checkedInAt} · ${outside.length} on this booking still outside`
              : `${r.attendee} — scanned at ${r.checkedInAt}`,
          line2: outside.length > 0 ? r.conf : `If they haven't entered, check photo ID against ${r.conf}.`,
          party: r.party && outside.length > 0 ? { conf: r.party.conf, outside, plates: r.party.plates } : undefined,
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

  /** "Check in all 3 others" from the verdict screen. */
  const checkInOthers = (ids: string[], names: string[]) =>
    startTransition(async () => {
      await checkInAllAction(ids);
      setBanner({
        tone: "ok",
        color: "#1E6B2A",
        name: ids.length === 1 ? `${names[0]} is in too` : `${ids.length} more checked in`,
        line1: "Whole party is in ✓",
        line2: names.join(", "),
      });
    });

  /** "Pick who" — drop to the booking's list with a button per person. */
  const pickFromParty = (conf: string) => {
    setBanner(null);
    setQuery(conf);
    refreshEntry(conf);
  };

  const handleScan = useCallback(
    (value: string) => {
      setQuery(value);
      if (session) food.current?.lookup(value);
      else entryScan(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.id]
  );

  const search = () => {
    setBanner(null);
    const q = query.trim();
    if (session) food.current?.lookup(q);
    // A pass code typed or sent by a handheld scanner (it "types" the code and
    // presses Enter) is a scan, not a search — same as the camera.
    else if (/PRAGATI-TKT-|\/t\//i.test(q)) entryScan(q);
    else refreshEntry(q);
  };

  // Arrived from /t/<code> on a station phone, or a link with ?q= / ?scan=.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (startMode !== "entry") setStation(`food:${startMode}`);
    if (initialQuery) {
      setQuery(initialQuery);
      if (startMode !== "entry") food.current?.lookup(initialQuery);
      else refreshEntry(initialQuery);
    }
    if (initialQuery) router.replace(startMode === "entry" ? "/admin/checkin" : `/admin/checkin?w=${startMode}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only tickets valid TODAY go into "check in all" — a family's Sunday tickets
  // must not be burned on Saturday.
  const notIn = (tickets ?? []).filter((t) => !t.checkedInAt && !t.notToday);

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
            <span className="ml-1.5 opacity-80">· {s.total}</span>
          </button>
        ))}
        {openSessions.length === 0 && isAdmin && (
          <a href="/admin/scans" className="text-xs self-center underline underline-offset-4 opacity-70 hover:opacity-100">
            + set up food scans
          </a>
        )}
      </div>

      {/* ── the verdict, full-bleed (see ScanResult) ───────────── */}
      <ScanResult
        verdict={banner}
        onDismiss={() => setBanner(null)}
        busy={pending}
        onCheckInOthers={checkInOthers}
        onPick={pickFromParty}
      />

      {session && (
        <FoodLine ref={food} sessionId={session.id} sessionLabel={session.label} colors={colors} isAdmin={isAdmin} />
      )}
      {session && (
        <div className="rounded-2xl px-4 py-3 mb-4 font-bold text-white text-center" style={{ background: "var(--leaf-deep)" }}>
          🍛 This phone is serving <span className="underline underline-offset-4">{session.label}</span>. Scan any pass — the whole family shows.
        </div>
      )}

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
                  {t.conf} · booked by {t.buyer} · {t.day === "all" ? "all days" : t.day} · {foodPrefLabel(t.food)}
                </p>
                {t.notToday ? (
                  <p className="text-xs font-bold mt-1" style={{ color: "#8a5a00" }}>
                    Not for today — this pass is for {t.notToday}
                  </p>
                ) : null}
                {t.owesCents ? (
                  <p className="text-xs font-bold mt-1" style={{ color: "var(--sindoor)" }}>
                    Owes ${(t.owesCents / 100).toFixed(2)} — send them to the walk-in desk
                  </p>
                ) : null}
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
                  className={`${t.notToday ? "btn-secondary" : "btn-primary"} !py-2 !px-5 text-sm`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await checkInTicketAction(t.id);
                      await refreshEntry(query.trim());
                    })
                  }
                >
                  {t.notToday ? "Check in anyway →" : "Check in →"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
