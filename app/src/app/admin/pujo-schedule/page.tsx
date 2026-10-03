/**
 * Admin → Content → Pujo schedule. The "Pujo, hour by hour" terracotta wall on
 * the homepage: show/hide, the flyer, and every day's timings.
 * Spec: spec/15-pujo-schedule.md
 */
import { requireSectionAccess } from "@/lib/auth/access";
import { getPujoSchedule } from "@/lib/pujo-schedule/server";
import { BUNDLED_FLYER, publicFlyer } from "@/lib/pujo-schedule/model";
import ScheduleEditor, { type AdminFlyer } from "./ScheduleEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pujo schedule" };

export default async function PujoSchedulePage() {
  await requireSectionAccess("pujo_schedule");
  const s = await getPujoSchedule();
  const pub = s.flyer ? publicFlyer({ ...s, showFlyer: true, allowDownload: true }) : null;
  const flyer: AdminFlyer | null =
    s.flyer && pub
      ? {
          src: pub.src,
          width: s.flyer.width,
          height: s.flyer.height,
          name: s.flyer.name,
          bytes: s.flyer.bytes,
          bundled: s.flyer.display === BUNDLED_FLYER.display,
        }
      : null;

  return (
    <ScheduleEditor
      initial={{
        enabled: s.enabled,
        hideAfter: s.hideAfter,
        showFlyer: s.showFlyer,
        allowDownload: s.allowDownload,
        days: s.days.map((d) => ({
          date: d.date,
          en: d.en,
          bn: d.bn,
          rites: d.rites.map((r) => ({ t: r.t, end: r.end ?? "", name: r.name, bn: r.bn ?? "", kind: r.kind, note: r.note ?? "" })),
        })),
      }}
      flyer={flyer}
      storageMissing={!process.env.BLOB_READ_WRITE_TOKEN && !!process.env.VERCEL}
      nowISO={new Date().toISOString()}
    />
  );
}
