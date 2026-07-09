/**
 * Admin → Magazines. Upload the yearly publication PDF; visitors download it
 * from the magazine section on the homepage (year-picker popup).
 */
import { listMagazines } from "@/lib/magazines";
import MagazineManager from "./MagazineManager";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Magazines" };

export default async function MagazinesPage() {
  await requireSectionAccess("magazines"); // matrix decides who opens this page
  const magazines = await listMagazines();
  const blobConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Magazines</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Upload each year&apos;s Pragati Patrika as a PDF. Visitors pick a year on the homepage and download
        it. Uploading a second PDF for the same year replaces the first.
      </p>

      {!blobConfigured && process.env.VERCEL && (
        <p className="rounded-xl px-4 py-3 mb-6 text-sm font-medium" style={{ background: "rgba(200,16,46,0.1)", color: "var(--sindoor)" }}>
          ⚠ File storage isn&apos;t configured — connect a Blob store to this project in the Vercel dashboard
          (Storage → Blob) so uploads persist.
        </p>
      )}

      <MagazineManager
        magazines={magazines.map((m) => ({
          id: m.id,
          year: m.year,
          title: m.title,
          bytes: m.bytes,
          uploadedAt: m.createdAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }),
        }))}
      />
    </div>
  );
}
