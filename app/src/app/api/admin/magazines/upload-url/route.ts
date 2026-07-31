/**
 * Client-upload token issuer for magazine PDFs.
 *
 * Vercel serverless functions cap the REQUEST BODY at 4.5 MB, so a large PDF
 * can never be posted through a route handler (FUNCTION_PAYLOAD_TOO_LARGE).
 * Instead the browser uploads straight to Vercel Blob and this route only mints
 * a short-lived, scoped token. The file bytes never touch our function.
 *
 * IMPORTANT: this endpoint is hit by TWO different callers —
 *   1. the browser, asking for an upload token  → must be a signed-in admin
 *   2. Vercel Blob itself, server-to-server, reporting the upload finished
 *      → has NO cookies, so it must NOT be blocked by the session check.
 *      `handleUpload` verifies that callback's own signature.
 * Guarding the whole route with a session check silently 401s the callback and
 * the upload appears to hang forever.
 */
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth/session";
import { getBlobAccess } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Only the browser's token request needs a logged-in admin. The completion
  // callback from Blob is authenticated by its signature inside handleUpload().
  if ((body as { type?: string }).type === "blob.generate-client-token") {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
  }

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // must match what the client passes, and what the store actually is
        access: await getBlobAccess(),
        allowedContentTypes: ["application/pdf", "application/octet-stream"],
        addRandomSuffix: true,
        maximumSizeInBytes: 300 * 1024 * 1024,
      }),
      // The DB row is written by finalizeMagazineUploadAction (this callback
      // never fires on localhost, so it can't be the only path).
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    console.error("magazine upload-url failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload token failed." }, { status: 400 });
  }
}
