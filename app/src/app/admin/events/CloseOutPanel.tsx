"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeOutAndSwitchAction } from "./actions";

/**
 * "Close <current> and make <next> current" — the one button (spec/19).
 * Says exactly what will happen before it happens; nothing is deleted.
 */
export default function CloseOutPanel({
  current,
  next,
}: {
  current: { name: string; regs: number; collected: string } | null;
  next: { id: string; name: string; when: string; published: boolean; passes: number };
}) {
  const router = useRouter();
  const [publish, setPublish] = useState(true);
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const go = () =>
    start(async () => {
      const r = await closeOutAndSwitchAction(next.id, publish);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      // This panel disappears once the switch is done (there is no "next" event
      // any more), so the confirmation travels with the page instead.
      const text = `${r.result.archived ? `${r.result.archived} is archived — ${r.result.tagged.donations} donation(s) and ${r.result.tagged.payments} dues/other payment(s) filed under it, final numbers frozen below. ` : ""}${r.result.nowCurrent} is now the current event${r.result.published ? " and online registration is open" : " (still a draft — publish it to open registration)"}.`;
      router.push(`/admin/events?done=${encodeURIComponent(text)}`);
      router.refresh();
    });

  return (
    <div className="festive-card p-6 mb-6" style={{ borderColor: "var(--sindoor)", borderWidth: 2 }}>
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--sindoor)" }}>
        Start the next event
      </p>
      <p className="font-[family-name:var(--font-display)] text-2xl font-black mt-1">
        {current ? `Close ${current.name} → make ${next.name} current` : `Make ${next.name} current`}
      </p>
      <ul className="text-sm mt-3 grid gap-1.5" style={{ color: "var(--ink-soft)" }}>
        {current && (
          <li>
            📦 <strong style={{ color: "var(--ink)" }}>{current.name}</strong> is kept, not deleted — {current.regs} registrations, {current.collected} collected. Its final
            numbers are frozen as a summary here, and every tab can load it again from the event switcher.
          </li>
        )}
        {current && <li>🗂 Donations and membership dues that came in during {current.name} are filed under it.</li>}
        <li>
          🌱 Dashboard, Registrations, Payments, Donations, Kitchen and Food line start fresh for <strong style={{ color: "var(--ink)" }}>{next.name}</strong> ({next.when}
          {next.passes ? ` · ${next.passes} passes` : " · no passes yet — add them first"}).
        </li>
        <li>🏠 The homepage features {next.name}; {current?.name ?? "the old event"} shows as a past event. Members are not affected.</li>
      </ul>
      {!next.published && (
        <label className="flex items-center gap-2 text-sm mt-4 font-semibold">
          <input type="checkbox" className="w-5 h-5" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          Publish {next.name} and open online registration now
        </label>
      )}
      <label className="flex items-center gap-2 text-sm mt-2">
        <input type="checkbox" className="w-5 h-5" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        I&apos;ve checked {next.name}&apos;s date, venue and prices
      </label>
      <button className="btn-primary mt-4 !py-3 !px-6" disabled={pending || !sure || next.passes === 0} onClick={go}>
        {pending ? "Working…" : current ? `Close ${current.name} & start ${next.name}` : `Start ${next.name}`}
      </button>
      {msg && (
        <p className="mt-3 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: msg.ok ? "rgba(92,138,58,0.15)" : "rgba(200,16,46,0.1)", color: msg.ok ? "var(--leaf-deep)" : "var(--sindoor)" }} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
