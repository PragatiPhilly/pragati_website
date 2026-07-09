import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { listAllMedia } from "@/lib/media/queries";
import MediaLibrary from "./MediaLibrary";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  await requireSectionAccess("media");
  const session = await getSession();
  const isAdmin = session && (session.role === "admin" || session.role === "super_admin");
  if (!isAdmin) {
    return (
      <div className="max-w-md">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Photos</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          Only admins and super-admins can manage photos.
        </p>
      </div>
    );
  }

  const db = getDb();
  const images = await listAllMedia();
  const events = await db
    .select({ slug: schema.events.slug, name: schema.events.name })
    .from(schema.events)
    .orderBy(asc(schema.events.startsAt));

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">
          <span className="font-[family-name:var(--font-bangla)] block text-lg font-normal" style={{ color: "var(--terracotta)" }}>
            ছবির ভাণ্ডার
          </span>
          Photos
        </h1>
        <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--ink-soft)" }}>
          Upload past-event photos, then <strong>assign</strong> each one to the homepage carousel, the
          community slideshow, or an event page. Big photos are auto-optimised into fast, right-sized
          versions — the same image can appear in more than one place.
        </p>
      </div>

      <MediaLibrary initialImages={images} events={events} />
    </div>
  );
}
