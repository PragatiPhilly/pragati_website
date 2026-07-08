"use client";

/**
 * Backup & disaster-recovery controls on the registrations page.
 * - "Email backup now" — any admin; sends the same CSV the nightly job sends.
 * - "Restore from backup CSV" — SUPER ADMIN only; upload a backup email's
 *   attachment to re-populate a fresh/rebuilt database. Skip-existing, so
 *   it never clobbers live rows.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendBackupNowAction } from "./backup-actions";

type RestoreResult = {
  regsInserted: number;
  regsSkipped: number;
  ticketsInserted: number;
  ticketsSkipped: number;
  eventsCreated: string[];
  errors: string[];
};

export default function BackupControls({ isSuper, backupEmail }: { isSuper: boolean; backupEmail: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const sendNow = () =>
    startTransition(async () => {
      const r = await sendBackupNowAction();
      setSent(`✓ Backup sent to ${r.to} — ${r.regCount} registrations, ${r.ticketCount} tickets`);
    });

  const restore = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setRestoreMsg({ ok: false, text: "Choose a backup CSV first." });
    if (!confirm("Restore registrations from this CSV? Existing rows are never modified — only missing ones are added.")) return;
    setBusy(true);
    setRestoreMsg(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await fetch("/api/admin/registrations/restore", { method: "POST", body: form });
      const data = (await res.json()) as RestoreResult & { error?: string };
      if (!res.ok) {
        setRestoreMsg({ ok: false, text: data.error ?? "Restore failed." });
      } else {
        const bits = [
          `${data.regsInserted} registrations restored`,
          `${data.ticketsInserted} tickets restored`,
          data.regsSkipped + data.ticketsSkipped > 0
            ? `${data.regsSkipped + data.ticketsSkipped} rows already existed (skipped)`
            : "",
          data.eventsCreated.length > 0 ? `events recreated: ${data.eventsCreated.join(", ")}` : "",
          data.errors.length > 0 ? `⚠ ${data.errors.length} rows failed: ${data.errors.slice(0, 3).join(" · ")}` : "",
        ].filter(Boolean);
        setRestoreMsg({ ok: data.errors.length === 0, text: `✓ ${bits.join(" · ")}` });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setRestoreMsg({ ok: false, text: "Restore failed — check your connection and try again." });
    }
    setBusy(false);
  };

  return (
    <div className="festive-card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold">🛟 Daily backup</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Every night at 11 PM ET the full dataset — registrations, members, donations, settings — is
            emailed as CSVs to <strong>{backupEmail}</strong> (change in Settings).
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-secondary !py-2 !px-4 text-xs" disabled={pending} onClick={sendNow}>
            {pending ? "Sending…" : "📧 Email backup now"}
          </button>
          {isSuper && (
            <button
              className="btn-secondary !py-2 !px-4 text-xs"
              onClick={() => setOpen(!open)}
            >
              ⤴ Restore from backup CSV
            </button>
          )}
        </div>
      </div>

      {sent && (
        <p className="text-xs font-semibold mt-3" style={{ color: "var(--leaf-deep)" }}>
          {sent}
        </p>
      )}

      {isSuper && open && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            Database lost? Upload the CSV from the most recent backup email. Only <strong>missing</strong>{" "}
            registrations and tickets are added — nothing existing is touched, so it's safe to run more
            than once. Restored passes keep their original QR codes and check-in status.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-xs" />
            <button className="btn-primary !py-2 !px-5 text-xs" disabled={busy} onClick={restore}>
              {busy ? "Restoring…" : "Restore now"}
            </button>
          </div>
          {restoreMsg && (
            <p className="text-xs font-semibold mt-3" style={{ color: restoreMsg.ok ? "var(--leaf-deep)" : "var(--sindoor)" }}>
              {restoreMsg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
