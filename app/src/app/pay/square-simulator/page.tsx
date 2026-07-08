import { notFound } from "next/navigation";
import { formatCents } from "@/lib/pricing";
import SimulatorForm from "./SimulatorForm";

export const metadata = { title: "Square Sandbox Checkout" };

/**
 * TEST MODE ONLY — plays the role of Square's hosted payment page.
 * Uses the same redirect → webhook → success dance as real Square,
 * so the whole payment path is exercised end-to-end.
 * Hard-404s when PAYMENTS_MODE=live so it can never appear in production.
 */
export default async function SquareSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; conf?: string; amount?: string; desc?: string }>;
}) {
  if ((process.env.PAYMENTS_MODE ?? "test") === "live") notFound();
  const { ref, conf, amount, desc } = await searchParams;
  const amountCents = parseInt(amount ?? "0", 10);

  return (
    <div className="min-h-screen grid place-items-center px-5 py-10" style={{ background: "#f6f7f9" }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8" style={{ color: "#1a1a1a" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-7 h-7 rounded-md bg-black text-white grid place-items-center font-black text-sm">□</span>
          <p className="font-bold">Square</p>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">
            Sandbox
          </span>
        </div>
        <p className="text-xs text-neutral-500 mb-6">Simulated hosted checkout — no real money moves.</p>
        <p className="text-sm text-neutral-600">{desc}</p>
        <p className="text-3xl font-bold mt-1 mb-6">{formatCents(amountCents)}</p>
        <SimulatorForm refId={ref ?? ""} conf={conf ?? ""} />
      </div>
    </div>
  );
}
