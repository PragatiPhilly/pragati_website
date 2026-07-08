/**
 * The Pujo Pass — an elegant keepsake ticket for a paid registration.
 * Shown on the lookup page; prints beautifully via the print page.
 */
import { site } from "@/config/site";

export default function PujoPass({
  eventName,
  eventBengali,
  buyerName,
  conf,
  daysLabel,
  attendees,
  printHref,
}: {
  eventName: string;
  eventBengali?: string | null;
  buyerName: string;
  conf: string;
  daysLabel: string;
  attendees: { name: string; qr: string; detail: string }[];
  printHref: string;
}) {
  return (
    <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
      {/* header band */}
      <div className="px-7 py-5 relative overflow-hidden" style={{ background: "linear-gradient(120deg, var(--sindoor) 0%, var(--sindoor-deep) 100%)" }}>
        <div
          className="absolute inset-x-0 bottom-0 h-2 opacity-60"
          style={{ backgroundImage: "radial-gradient(circle at 5px 2px, var(--marigold) 3px, transparent 3.5px)", backgroundSize: "14px 8px", backgroundRepeat: "repeat-x" }}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--marigold-pale)" }}>
              {site.name} · Pujo Pass
            </p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-black leading-tight" style={{ color: "var(--cream)" }}>
              {eventBengali && (
                <span className="font-[family-name:var(--font-bangla)] font-normal text-lg mr-2" style={{ color: "var(--marigold-bright)" }}>
                  {eventBengali}
                </span>
              )}
              {eventName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--marigold-pale)" }}>
              Confirmation
            </p>
            <p className="font-mono text-xl font-bold" style={{ color: "var(--cream)" }}>
              {conf}
            </p>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="p-7" style={{ background: "var(--card)" }}>
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-5">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            In the name of <strong style={{ color: "var(--ink)" }}>{buyerName}</strong> · {daysLabel}
          </p>
          <a href={printHref} className="btn-primary !py-2 !px-5 text-xs">
            🖨 Print / save the pass
          </a>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {attendees.map((a) => (
            <div key={a.qr} className="flex items-center gap-3.5 rounded-2xl p-3.5 hairline" style={{ background: "var(--bg-soft)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/qr/${a.qr}?v=2`} alt={`Entry QR for ${a.name}`} className="w-20 h-20 shrink-0 rounded-lg bg-white p-1" />
              <div className="min-w-0">
                <p className="font-semibold truncate">{a.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                  {a.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[11px] text-center" style={{ color: "var(--ink-soft)" }}>
          Show a QR at the gate — each admits one person. {site.tagline} 🪔
        </p>
      </div>
    </div>
  );
}
