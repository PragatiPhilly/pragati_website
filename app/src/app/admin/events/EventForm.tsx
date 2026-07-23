"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEventAction, type EventInput, type TicketTypeInput, type PromoInput } from "./save-actions";
import { buildEventDays } from "@/lib/event-days";

const emptyTicket = (dayKeys: string[] = []): TicketTypeInput => ({
  name: "",
  ageBand: "adult",
  dayKeys,
  checkInStart: null,
  withFood: true,
  priceMember: 0,
  priceNonmember: 0,
  capacity: null,
});

const emptyPromo = (): PromoInput => ({
  code: "",
  discountType: "percent",
  discountValue: 10,
  maxUsesTotal: null,
  validUntil: null,
});

export default function EventForm({ initial }: { initial: EventInput }) {
  const router = useRouter();
  const [ev, setEv] = useState<EventInput>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<EventInput>) => setEv((e) => ({ ...e, ...patch }));
  const eventDays = buildEventDays(ev.startsAt, ev.endsAt);

  const setTicket = (i: number, patch: Partial<TicketTypeInput>) =>
    set({ ticketTypes: ev.ticketTypes.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setPromo = (i: number, patch: Partial<PromoInput>) =>
    set({ promoCodes: ev.promoCodes.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const save = async (status?: "draft" | "published") => {
    setBusy(true);
    setError("");
    const res = await saveEventAction({ ...ev, status: status ?? ev.status });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Save failed");
    router.push("/admin/events");
  };

  return (
    <div className="grid gap-6 max-w-3xl">
      {/* basics */}
      <div className="festive-card p-6 grid gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Basics</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            placeholder="Event name"
            value={ev.name}
            onChange={(e) => {
              const name = e.target.value;
              set({
                name,
                slug: initial.id ? ev.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
              });
            }}
          />
          <input className="input font-[family-name:var(--font-bangla)]" placeholder="Bengali name (optional)" value={ev.nameBengali} onChange={(e) => set({ nameBengali: e.target.value })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            URL slug
            <input className="input mt-1 font-mono text-sm" value={ev.slug} onChange={(e) => set({ slug: e.target.value })} />
          </label>
          <label className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            Theme (drives site look when active)
            <select className="input mt-1" value={ev.theme} onChange={(e) => set({ theme: e.target.value })}>
              <option value="durga">Durga</option>
              <option value="kali">Kali</option>
              <option value="saraswati">Saraswati</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>
        <textarea className="input min-h-24" placeholder="Description (shown on the event page)" value={ev.description} onChange={(e) => set({ description: e.target.value })} />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            Starts
            <input type="datetime-local" className="input mt-1" value={ev.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </label>
          <label className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            Ends
            <input type="datetime-local" className="input mt-1" value={ev.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Event days (for the day-picker in registration) are generated automatically from this date range.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Venue name" value={ev.venueName} onChange={(e) => set({ venueName: e.target.value })} />
          <input className="input" placeholder="Venue address" value={ev.venueAddress} onChange={(e) => set({ venueAddress: e.target.value })} />
          <input className="input" placeholder="Google Maps link" value={ev.venueMapUrl} onChange={(e) => set({ venueMapUrl: e.target.value })} />
        </div>
      </div>

      {/* ticket types */}
      <div className="festive-card p-6 grid gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Ticket types</h2>
        <p className="text-xs -mt-2" style={{ color: "var(--ink-soft)" }}>
          One row per pass. Tick exactly the days it covers — a single day, any two-day combo, or every day — and set its
          member / non-member price. Use <strong>Duplicate</strong> to copy a row and just change the days or price.
        </p>
        {ev.ticketTypes.map((t, i) => {
          const summary = `${t.dayKeys.length ? t.dayKeys.map((k) => k.toUpperCase()).join(" · ") : "Every day"} · ${t.withFood ? "with food" : "no food"} · $${t.priceMember || 0}${t.priceNonmember < 0 ? " members only" : ` / $${t.priceNonmember || 0}`}`;
          return (
            <div key={i} className="hairline rounded-2xl overflow-hidden">
              {/* header strip: index · name preview · row actions */}
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "var(--accent-soft)" }}>
                <span
                  className="grid place-items-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                  style={{ background: "var(--sindoor)", color: "var(--cream)" }}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-semibold truncate flex-1" style={{ color: "var(--ink)" }}>
                  {t.name?.trim() || "Untitled pass"}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold px-2 py-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
                  onClick={() => set({ ticketTypes: [...ev.ticketTypes.slice(0, i + 1), { ...t, id: undefined, name: t.name ? `${t.name} (copy)` : "" }, ...ev.ticketTypes.slice(i + 1)] })}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold px-2 py-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
                  style={{ color: "var(--sindoor)" }}
                  onClick={() => set({ ticketTypes: ev.ticketTypes.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>

              {/* body */}
              <div className="p-4 grid gap-4">
                <div className="grid sm:grid-cols-[2fr_1fr] gap-3">
                  <label className="text-xs font-semibold grid gap-1" style={{ color: "var(--ink-soft)" }}>
                    Pass name
                    <input className="input" placeholder='e.g. "Adult · Fri & Sat · with food"' value={t.name} onChange={(e) => setTicket(i, { name: e.target.value })} />
                  </label>
                  <label className="text-xs font-semibold grid gap-1" style={{ color: "var(--ink-soft)" }}>
                    Who it&apos;s for
                    <select className="input" value={t.ageBand} onChange={(e) => setTicket(i, { ageBand: e.target.value })}>
                      <option value="adult">Adult</option>
                      <option value="child_5_12">Kid 5–12</option>
                      <option value="child_under_5">Under 5</option>
                      <option value="senior">Senior</option>
                      <option value="all">Everyone</option>
                    </select>
                  </label>
                </div>

                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>Days this pass covers</p>
                  {eventDays.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {eventDays.map((d) => {
                        const on = t.dayKeys.includes(d.key);
                        return (
                          <button
                            type="button"
                            key={d.key}
                            onClick={() => setTicket(i, { dayKeys: on ? t.dayKeys.filter((k) => k !== d.key) : [...t.dayKeys, d.key] })}
                            className="text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors"
                            style={{ background: on ? "var(--sindoor)" : "transparent", color: on ? "var(--cream)" : "var(--ink-soft)", borderColor: on ? "var(--sindoor)" : "var(--line)" }}
                          >
                            {d.label.split(",")[0]}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      Set the event start &amp; end dates above, then pick the days for this pass.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="text-xs font-semibold grid gap-1" style={{ color: "var(--ink-soft)" }}>
                    Member $
                    <input type="number" min={0} step="0.01" className="input" value={t.priceMember} onChange={(e) => setTicket(i, { priceMember: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label className="text-xs font-semibold grid gap-1" style={{ color: "var(--ink-soft)" }}>
                    Non-member $
                    <input type="number" min={-1} step="0.01" className="input" value={t.priceNonmember} onChange={(e) => setTicket(i, { priceNonmember: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label className="text-xs font-semibold grid gap-1" style={{ color: "var(--ink-soft)" }}>
                    Capacity
                    <input type="number" min={0} className="input" placeholder="∞" value={t.capacity ?? ""} onChange={(e) => setTicket(i, { capacity: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
                  </label>
                  <label className="text-xs font-semibold grid gap-1" style={{ color: "var(--ink-soft)" }}>
                    Check-in opens
                    <input type="time" className="input" value={t.checkInStart ?? ""} onChange={(e) => setTicket(i, { checkInStart: e.target.value || null })} />
                    <span className="font-normal opacity-70">blank = any time</span>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" checked={t.withFood} onChange={(e) => setTicket(i, { withFood: e.target.checked })} className="accent-[var(--sindoor)] w-4 h-4" />
                    Includes food
                  </label>
                  <span className="text-[11px] font-medium rounded-full px-2.5 py-1" style={{ background: "var(--accent-soft)", color: "var(--ink-soft)" }}>
                    {summary}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" className="btn-secondary !py-2 w-fit text-sm" onClick={() => set({ ticketTypes: [...ev.ticketTypes, emptyTicket(eventDays.map((d) => d.key))] })}>
          + Add ticket type
        </button>
      </div>

      {/* promo codes */}
      <div className="festive-card p-6 grid gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Promo codes</h2>
        {ev.promoCodes.map((p, i) => (
          <div key={i} className="grid sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
            <input className="input uppercase font-mono text-sm" placeholder="CODE" value={p.code} onChange={(e) => setPromo(i, { code: e.target.value.toUpperCase() })} />
            <select className="input" value={p.discountType} onChange={(e) => setPromo(i, { discountType: e.target.value as PromoInput["discountType"] })}>
              <option value="percent">% off</option>
              <option value="fixed_amount_cents">$ off</option>
            </select>
            <input type="number" min={0} className="input" placeholder="Value" value={p.discountValue} onChange={(e) => setPromo(i, { discountValue: parseFloat(e.target.value) || 0 })} />
            <input type="date" className="input" value={p.validUntil ?? ""} onChange={(e) => setPromo(i, { validUntil: e.target.value || null })} />
            <button type="button" className="text-xs underline opacity-60 hover:opacity-100 pb-3" onClick={() => set({ promoCodes: ev.promoCodes.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary !py-2 w-fit text-sm" onClick={() => set({ promoCodes: [...ev.promoCodes, emptyPromo()] })}>
          + Add promo code
        </button>
      </div>

      {error && (
        <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => save("published")}>
          {busy ? "Saving…" : "Save & publish"}
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => save("draft")}>
          Save as draft
        </button>
      </div>
    </div>
  );
}
