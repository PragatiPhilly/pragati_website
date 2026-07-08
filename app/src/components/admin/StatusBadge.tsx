export default function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    paid: { bg: "rgba(92,138,58,0.15)", fg: "var(--leaf-deep)" },
    active: { bg: "rgba(92,138,58,0.15)", fg: "var(--leaf-deep)" },
    pending_zelle_verification: { bg: "rgba(232,169,60,0.2)", fg: "var(--terracotta-deep)" },
    pending_payment: { bg: "var(--accent-soft)", fg: "var(--ink-soft)" },
    inactive: { bg: "rgba(0,0,0,0.07)", fg: "var(--ink-soft)" },
    cancelled: { bg: "rgba(0,0,0,0.07)", fg: "var(--ink-soft)" },
    cancelled_no_payment: { bg: "rgba(0,0,0,0.07)", fg: "var(--ink-soft)" },
  };
  const s = styles[status] ?? styles.pending_payment;
  return (
    <span
      className="text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
