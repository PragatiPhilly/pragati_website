"use server";

/**
 * Admin → Pujo schedule → Save. Writes the whole schedule (timings + switches)
 * as one system_config row. The flyer is NOT taken from the browser: it is
 * changed only by its own upload / remove route, so a stale form can never undo
 * a flyer someone just uploaded. Spec: spec/15-pujo-schedule.md
 */
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { getPujoSchedule, savePujoSchedule } from "@/lib/pujo-schedule/server";
import { HHMM, RITE_KINDS, dayParts, isDate, sanitizeSchedule, toMin } from "@/lib/pujo-schedule/model";

export type RiteInput = { t: string; end: string; name: string; bn: string; kind: string; note: string };
export type DayInput = { date: string; en: string; bn: string; rites: RiteInput[] };
export type ScheduleInput = {
  enabled: boolean;
  hideAfter: string;
  showFlyer: boolean;
  allowDownload: boolean;
  days: DayInput[];
};

const KINDS = new Set(RITE_KINDS.map((k) => k.value as string));

/** Plain-English problems, in the order an admin would fix them. */
function validate(input: ScheduleInput): string[] {
  const errors: string[] = [];
  if (input.hideAfter && !isDate(input.hideAfter)) errors.push("“Take it down after” is not a real date.");
  if (!Array.isArray(input.days) || input.days.length === 0) {
    errors.push("Add at least one day.");
    return errors;
  }
  if (input.days.length > 10) errors.push("Ten days at most.");
  const seen = new Set<string>();
  input.days.forEach((d, di) => {
    const label = isDate(d.date) ? (() => { const p = dayParts(d.date); return `${p.dow} ${p.dd} ${p.mon}`; })() : `Day ${di + 1}`;
    if (!isDate(d.date)) errors.push(`${label}: pick a date.`);
    else if (seen.has(d.date)) errors.push(`${label} is listed twice — merge the two days.`);
    seen.add(d.date);
    if (!d.rites?.length) errors.push(`${label}: add at least one ritual, or remove the day.`);
    if ((d.rites?.length ?? 0) > 40) errors.push(`${label}: forty rituals at most.`);
    (d.rites ?? []).forEach((r, ri) => {
      const row = `${label}, row ${ri + 1}${r.name?.trim() ? ` (${r.name.trim()})` : ""}`;
      if (!HHMM.test(r.t ?? "")) errors.push(`${row}: pick a start time.`);
      if (!r.name?.trim()) errors.push(`${row}: give the ritual a name.`);
      if (r.end && !HHMM.test(r.end)) errors.push(`${row}: the “until” time isn’t valid.`);
      if (r.end && HHMM.test(r.end) && HHMM.test(r.t ?? "") && toMin(r.end) <= toMin(r.t)) errors.push(`${row}: “until” must be after the start.`);
      if (!KINDS.has(r.kind)) errors.push(`${row}: choose a type.`);
    });
  });
  return errors;
}

export async function savePujoScheduleAction(input: ScheduleInput): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return { ok: false, errors: ["Your session has ended — please sign in again."] };
  }
  const errors = validate(input);
  if (errors.length) return { ok: false, errors };

  try {
    const current = await getPujoSchedule();
    const next = sanitizeSchedule({
      v: 1,
      enabled: input.enabled === true,
      hideAfter: input.hideAfter,
      showFlyer: input.showFlyer !== false,
      allowDownload: input.allowDownload !== false,
      flyer: current.flyer,
      days: input.days,
    });
    await savePujoSchedule(next, session.userId);
    await getDb().insert(schema.auditLog).values({
      userId: session.userId,
      action: "pujo_schedule_saved",
      entityType: "system_config",
      entityId: "pujo_schedule",
      changes: {
        enabled: next.enabled,
        hideAfter: next.hideAfter,
        days: next.days.map((d) => `${d.date} · ${d.rites.length} rituals`),
      },
    });
    revalidatePath("/");
    revalidatePath("/admin/pujo-schedule");
    return { ok: true };
  } catch (e) {
    console.error("[pujo-schedule] save failed:", e);
    return { ok: false, errors: ["Couldn’t save just now — please try again in a moment."] };
  }
}
