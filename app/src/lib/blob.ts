/**
 * Vercel Blob helpers that work with BOTH public and private stores.
 *
 * Vercel rejects `access:"public"` on a private store (and `access:"private"`
 * on a public one), and a private store's blob URLs are NOT publicly fetchable.
 * A single hard-coded access mode therefore breaks on whichever store the
 * project happens to have — which is exactly the "Cannot use public access on a
 * private store" error seen on photo + magazine uploads.
 *
 * These helpers:
 *   • try the remembered access mode first, fall back to the other on a
 *     mismatch, and cache whichever succeeds (so later uploads skip the probe);
 *   • expose a streaming reader so private-store files can be served through our
 *     own routes instead of redirecting a browser to an unreachable public URL.
 */
import { getConfig, setConfig } from "@/lib/system-config";

export type BlobAccess = "public" | "private";

export function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Store access mode ("public" | "private"), learned + cached on first upload. */
export async function getBlobAccess(): Promise<BlobAccess> {
  return (await getConfig<BlobAccess | undefined>("blob_access")) === "private" ? "private" : "public";
}

/** Blob store origin (e.g. https://xyz.public.blob.vercel-storage.com). */
export async function getBlobBaseUrl(): Promise<string | null> {
  return (await getConfig<string | undefined>("blob_base_url")) || null;
}

function isAccessMismatch(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /access on a (private|public) store/i.test(msg);
}

export type PutResult = { url: string; pathname: string; access: BlobAccess };

/** Upload a blob, transparently handling a public OR private store. */
export async function putBlob(
  pathname: string,
  body: Buffer,
  opts: { contentType: string; addRandomSuffix?: boolean; cacheControlMaxAge?: number },
): Promise<PutResult> {
  const { put } = await import("@vercel/blob");
  const remembered = await getBlobAccess();
  const order: BlobAccess[] = remembered === "private" ? ["private", "public"] : ["public", "private"];
  let lastErr: unknown;
  for (const access of order) {
    try {
      const res = await put(pathname, body, {
        access,
        contentType: opts.contentType,
        addRandomSuffix: opts.addRandomSuffix ?? false,
        cacheControlMaxAge: opts.cacheControlMaxAge,
      });
      if (access !== remembered) await setConfig("blob_access", access);
      const origin = new URL(res.url).origin;
      if ((await getConfig<string | undefined>("blob_base_url")) !== origin) await setConfig("blob_base_url", origin);
      return { url: res.url, pathname: res.pathname, access };
    } catch (e) {
      lastErr = e;
      if (!isAccessMismatch(e)) throw e; // a real failure — surface it, don't mask
    }
  }
  throw lastErr;
}

/** Stream a stored blob's bytes (needed to serve files from a private store). */
export async function getBlobStream(
  pathname: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null> {
  const { get } = await import("@vercel/blob");
  const res = await get(pathname, { access: await getBlobAccess() });
  if (!res || res.statusCode !== 200) return null;
  return { stream: res.stream, contentType: res.blob.contentType, size: res.blob.size };
}

/** Delete blobs by pathname (store-agnostic; best-effort). */
export async function delBlobs(pathnames: string[]): Promise<void> {
  if (!pathnames.length) return;
  const { del } = await import("@vercel/blob");
  await del(pathnames).catch(() => {});
}
