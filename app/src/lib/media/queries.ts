/**
 * Read helpers for the media library. Every query first ensures the tables
 * exist and degrades to an empty list on any error, so the public site never
 * crashes if the media feature hasn't been used yet.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureMediaTables } from "./ensure";

export type MediaImage = {
  id: string;
  fileBase: string;
  width: number;
  height: number;
  variants: number[];
  blurDataUrl: string;
  bytes: number;
  originalName: string | null;
  inCarousel: boolean;
  inSlideshow: boolean;
  eventSlug: string | null;
  sortOrder: number;
  createdAt: Date;
};

function normalize(rows: (typeof schema.mediaImages.$inferSelect)[]): MediaImage[] {
  return rows.map((r) => ({
    id: r.id,
    fileBase: r.fileBase,
    width: r.width,
    height: r.height,
    variants: (r.variants as number[]) ?? [],
    blurDataUrl: r.blurDataUrl,
    bytes: r.bytes,
    originalName: r.originalName,
    inCarousel: r.inCarousel,
    inSlideshow: r.inSlideshow,
    eventSlug: r.eventSlug,
    sortOrder: r.sortOrder ?? 0,
    createdAt: r.createdAt,
  }));
}

export async function listAllMedia(): Promise<MediaImage[]> {
  try {
    await ensureMediaTables();
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.mediaImages)
      .orderBy(asc(schema.mediaImages.createdAt));
    return normalize(rows);
  } catch {
    return [];
  }
}

export async function getCarouselImages(): Promise<MediaImage[]> {
  try {
    await ensureMediaTables();
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.mediaImages)
      .where(eq(schema.mediaImages.inCarousel, true))
      .orderBy(asc(schema.mediaImages.sortOrder), asc(schema.mediaImages.createdAt));
    return normalize(rows);
  } catch {
    return [];
  }
}

export async function getSlideshowImages(): Promise<MediaImage[]> {
  try {
    await ensureMediaTables();
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.mediaImages)
      .where(eq(schema.mediaImages.inSlideshow, true))
      .orderBy(asc(schema.mediaImages.sortOrder), asc(schema.mediaImages.createdAt));
    return normalize(rows);
  } catch {
    return [];
  }
}

export async function getEventImage(slug: string): Promise<MediaImage | null> {
  try {
    await ensureMediaTables();
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.mediaImages)
      .where(and(eq(schema.mediaImages.eventSlug, slug)))
      .orderBy(asc(schema.mediaImages.createdAt))
      .limit(1);
    return normalize(rows)[0] ?? null;
  } catch {
    return null;
  }
}
