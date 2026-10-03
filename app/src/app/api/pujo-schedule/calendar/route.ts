/**
 * "Remind me" → a calendar file.
 *
 *   GET /api/pujo-schedule/calendar?ids=20261010-1400[,20261011-1040…][&dl=1]
 *
 * Served inline as text/calendar so iPhone/iPad Safari shows its native
 * "Add to Calendar" sheet and a Mac opens it in Calendar; `dl=1` forces a
 * download (Outlook, Windows, Android calendar apps). Each event carries a
 * 30-minute alert. Nothing about the visitor is stored. Spec: 15-pujo-schedule.md
 */
import { getPujoSchedule, venueLine } from "@/lib/pujo-schedule/server";
import { flatten } from "@/lib/pujo-schedule/model";
import { buildIcs } from "@/lib/pujo-schedule/ics";
import { getActiveEvent } from "@/lib/queries/events";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = (msg: string) =>
  new Response(msg, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d{8}-\d{4}(-\d{1,2})?$/.test(x))
    .slice(0, 20);
  if (ids.length === 0) return notFound("No ritual chosen.");

  const s = await getPujoSchedule();
  if (!s.enabled) return notFound("The Pujo schedule isn't published right now.");
  const all = flatten(s.days);
  const picked = all.filter((r) => ids.includes(r.id));
  if (picked.length === 0) return notFound("That ritual isn't on the schedule any more — please reload the page.");

  let location: string | null = null;
  try {
    location = venueLine(await getActiveEvent());
  } catch {
    /* a calendar entry without a place is still useful */
  }

  const body = buildIcs(picked, { location, pageUrl: siteUrl("/#schedule") });
  const slug = picked.length === 1 ? picked[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "pushpanjali";
  const disposition = url.searchParams.get("dl") === "1" ? "attachment" : "inline";
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${disposition}; filename="pragati-${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
