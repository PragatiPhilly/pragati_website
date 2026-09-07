/**
 * CSV export — the treasurer's copy.
 *
 * Pure and dependency-free, so it runs in the browser and the file never round
 * trips to a server. Money is written in DOLLARS with two decimals (not cents),
 * because the person opening this is opening it in Excel, not in a debugger.
 *
 * Sections mirror the screen: what it adds up to, what drives it, what each
 * guest is worth, and every line with its actual beside it.
 */
import type { EngineResult } from "./engine";
import { adultFoodCents } from "./engine";
import { COST_HEADS, REVENUE_HEADS, SEGMENT_LABEL, type ProjectionModel } from "./types";

const cell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: (string | number | null | undefined)[]) => cells.map(cell).join(",");
/** Cents → a plain number Excel will treat as money. */
const $ = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);

export function toCsv(model: ProjectionModel, result: EngineResult, scenarioName: string): string {
  const out: string[] = [];
  const mods = model.modifiers;
  const modified =
    mods.attendancePct !== 100 || mods.pricePct !== 100 || mods.costPct !== 100 || mods.sponsorshipPct !== 100;

  out.push(row("Pragati — budget projection"));
  out.push(row("Scenario", scenarioName));
  out.push(row("Year", model.year));
  out.push(row("Exported", new Date().toISOString().slice(0, 10)));
  if (modified) {
    out.push(
      row(
        "What-if modifiers applied",
        `attendance ${mods.attendancePct}%, prices ${mods.pricePct}%, costs ${mods.costPct}%, sponsorship ${mods.sponsorshipPct}%`
      )
    );
  }
  out.push("");

  out.push(row("SUMMARY"));
  out.push(row("Total revenue", $(result.totalRevenueCents)));
  out.push(row("Total expenses", $(result.totalExpenseCents)));
  out.push(row("Profit / loss", $(result.profitCents)));
  out.push(row("Cash carried in", $(model.carryInCents)));
  out.push(row("Cash after carry-in", $(result.cashAfterCarryInCents)));
  out.push(row("Confirmed revenue", $(result.confirmedRevenueCents)));
  out.push(row("Unconfirmed revenue", $(result.unconfirmedRevenueCents)));
  out.push(row("Fixed cost", $(result.fixedCostCents)));
  out.push(row("Food cost (driven by attendance)", $(result.variableCostCents)));
  out.push(row("Guests", result.totalHeads));
  out.push(row("Contribution per guest", $(result.contributionPerHeadCents)));
  out.push(
    row("Break-even guests", result.breakEven.reachable ? result.breakEven.heads : "unreachable at these prices")
  );
  out.push("");

  out.push(row("HEAD TOTALS"));
  out.push(row("Side", "Head", "Amount"));
  for (const h of REVENUE_HEADS) {
    out.push(row("Revenue", h.label, $(result.revenueByHead[h.key as keyof typeof result.revenueByHead] ?? 0)));
  }
  for (const h of COST_HEADS) {
    out.push(row("Cost", h.label, $(result.costByHead[h.key as keyof typeof result.costByHead] ?? 0)));
  }
  out.push("");

  out.push(row("DRIVERS"));
  out.push(
    row(
      "Day",
      "Included",
      "With food",
      "Without food",
      "Kids",
      "Price with food",
      "Price without food",
      "Price kids",
      "Adult food / head",
      "Kid food / head"
    )
  );
  for (const d of model.days) {
    out.push(
      row(
        d.label,
        d.enabled ? "yes" : "no",
        d.attendance.withFood,
        d.attendance.withoutFood,
        d.attendance.kids,
        $(d.price.withFood),
        $(d.price.withoutFood),
        $(d.price.kids),
        $(adultFoodCents(d)),
        $(d.foodCost.kid)
      )
    );
  }
  out.push(row("Food buffer %", model.buffers.foodPct));
  out.push(row("No-food uplift %", model.buffers.nonFoodUpliftPct));
  out.push("");

  out.push(row("CONTRIBUTION MARGIN PER GUEST"));
  out.push(row("Day", "Segment", "Price", "Food cost", "Margin", "Guests", "Total contribution"));
  for (const m of result.margins) {
    out.push(
      row(
        m.dayLabel,
        SEGMENT_LABEL[m.segment],
        $(m.priceCents),
        $(m.foodCents),
        $(m.marginCents),
        m.heads,
        $(m.marginCents * m.heads)
      )
    );
  }
  out.push("");

  for (const [title, lines, side] of [
    ["REVENUE LINES", model.revenueLines, "revenue"],
    ["COST LINES", model.costLines, "cost"],
  ] as const) {
    out.push(row(title));
    out.push(row("Head", "Line", "Projected", "Confidence", "Actual", "Variance", "Tables", "Note"));
    const heads = side === "cost" ? COST_HEADS : REVENUE_HEADS;
    for (const h of heads) {
      for (const l of lines.filter((x) => x.head === h.key)) {
        // A cost coming in UNDER is favourable; revenue coming in OVER is.
        const projected = l.computed
          ? side === "cost"
            ? result.computedFoodCostCents
            : result.ticketRevenueCents
          : l.amountCents;
        const variance =
          l.actualCents === null || l.actualCents === undefined
            ? null
            : side === "cost"
              ? projected - l.actualCents
              : l.actualCents - projected;
        out.push(
          row(
            h.label,
            l.label + (l.computed ? " (driven by attendance)" : ""),
            $(projected),
            l.confidence,
            $(l.actualCents),
            $(variance),
            l.tables ?? "",
            l.note ?? ""
          )
        );
      }
    }
    out.push("");
  }

  return out.join("\n");
}

/** Filename that sorts sensibly in a folder full of these. */
export function csvFilename(model: ProjectionModel, scenarioName: string): string {
  const slug = scenarioName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `pragati-projection-${model.year}-${slug || "scenario"}-${new Date().toISOString().slice(0, 10)}.csv`;
}
