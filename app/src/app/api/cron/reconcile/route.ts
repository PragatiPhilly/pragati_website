import { NextResponse } from "next/server";
import { reconcileWithSquare } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The nightly audit: ask Square what it took, compare against our ledger, and
 * file anything that disagrees into admin → Reconciliation for a person to
 * decide on. An email goes to the management address when there is something new.
 *
 * THIS ENDPOINT CANNOT CHANGE A PAYMENT RECORD. It only ever writes questions.
 * Corrections are applied by a named admin pressing Approve, which re-checks
 * Square at that moment. Scheduled in vercel.json; safe to hit by hand.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  try {
    const report = await reconcileWithSquare({ days });
    return NextResponse.json({
      ok: true,
      readOnly: true,
      windowDays: days,
      squarePayments: report.squarePayments,
      newFindings: report.newFindings,
      falseNegatives: report.falseNegatives,
      falsePositives: report.falsePositives,
      amountMismatches: report.amountMismatches,
      orphans: report.orphans,
      checkedAt: report.checkedAt,
    });
  } catch (e) {
    // A failed audit must be loud: returning 200 here would recreate the exact
    // "silent success" failure mode this whole endpoint exists to prevent.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
