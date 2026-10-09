"use client";

import { useState, useTransition } from "react";
import { setEventPassesOnlineAction, setPassOnlineOpenAction } from "./actions";

/**
 * One pass's "sold online?" switch. Closing it only stops the public website
 * from selling it — the walk-in desk keeps selling it, and tickets already
 * sold are untouched.
 */
export function PassOnlineSwitch({ id, name, open }: { id: string; name: string; open: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label={`${name}: ${open ? "open" : "closed"} for online registration`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const res = await setPassOnlineOpenAction(id, !open);
            if (!res.ok) setError(res.error ?? "Could not change it — try again.");
          })
        }
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
        style={
          open
            ? { background: "rgba(46,125,50,0.12)", color: "var(--leaf-deep)", border: "1px solid rgba(46,125,50,0.35)" }
            : { background: "rgba(200,16,46,0.08)", color: "var(--sindoor)", border: "1px solid rgba(200,16,46,0.35)" }
        }
      >
        <span
          aria-hidden
          className="relative inline-block w-7 h-4 rounded-full transition-colors"
          style={{ background: open ? "var(--leaf-deep)" : "rgba(0,0,0,0.25)" }}
        >
          <span
            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
            style={{ left: open ? "14px" : "2px" }}
          />
        </span>
        {pending ? "Saving…" : open ? "Open online" : "Closed online"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--sindoor)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Bulk shortcuts for one event's passes. */
export function EventOnlineShortcuts({ eventId, openCount, total }: { eventId: string; openCount: number; total: number }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const run = (mode: "close_all_but_concert" | "close_all" | "open_all", question: string) => {
    if (!window.confirm(question)) return;
    start(async () => {
      const res = await setEventPassesOnlineAction(eventId, mode);
      setNote(res.ok ? `Done — ${res.changed} pass${res.changed === 1 ? "" : "es"} changed.` : "Could not change them — try again.");
    });
  };
  return (
    <div className="mt-4 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2.5" style={{ background: "var(--bg-soft, rgba(0,0,0,0.03))", border: "1px solid var(--line)" }}>
      <p className="text-sm w-full">
        <strong>Online registration:</strong> {openCount} of {total} passes open.{" "}
        <span style={{ color: "var(--ink-soft)" }}>Closed passes can still be sold at the walk-in desk.</span>
      </p>
      <button
        type="button"
        className="btn-secondary !py-1.5 !px-3.5 text-xs"
        disabled={pending}
        onClick={() =>
          run("close_all_but_concert", "Close ONLINE registration for every pass except concert passes?\n\nThe walk-in desk can still sell them. You can reopen any pass later.")
        }
      >
        Close all except concert
      </button>
      <button
        type="button"
        className="btn-secondary !py-1.5 !px-3.5 text-xs"
        disabled={pending}
        onClick={() => run("close_all", "Close ONLINE registration for every pass of this event?\n\nThe walk-in desk can still sell them.")}
      >
        Close all
      </button>
      <button
        type="button"
        className="btn-secondary !py-1.5 !px-3.5 text-xs"
        disabled={pending}
        onClick={() => run("open_all", "Reopen ONLINE registration for every pass of this event?")}
      >
        Reopen all
      </button>
      {(pending || note) && (
        <span className="text-xs w-full" style={{ color: "var(--ink-soft)" }} aria-live="polite">
          {pending ? "Saving…" : note}
        </span>
      )}
    </div>
  );
}
