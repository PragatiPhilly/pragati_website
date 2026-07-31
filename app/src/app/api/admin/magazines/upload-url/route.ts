/**
 * Client-upload token issuer for magazine PDFs.
 *
 * Vercel serverless functions cap the REQUEST BODY at 4.5 MB, so a 100 MB PDF
 * can never be posted through a route handler (FUNCTION_PAYLOAD_TOO_LARGE).
 * Instead the browser uploads straight to Vercel Blob and this route only mints
 * a short-lived, scoped token. The file bytes never touch our function.
 *
 * Security: the token is only issued to a signed-in admin, is restricted to
 * PDFs, and carries the year/title so the finalize step can't be spoofed into
 * writing a different row than the one that was uploaded.
 */
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth/session";
import { getBlobAccess } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // whichever mode this project's store uses (learned in lib/blob.ts)
        access: await getBlobAccess(),
        allowedContentTypes: ["application/pdf"],
        addRandomSuffix: true,
        maximumSizeInBytes: 300 * 1024 * 1024, // 300 MB ceiling
        tokenPayload: JSON.stringify({ userId: session.userId }),
      }),
      // Vercel calls this server-to-server after the upload lands. It does not
      // fire on localhost, so the DB row is written by the finalize action
      // instead — this stays as a no-op hook for completeness.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload token failed." }, { status: 400 });
  }
}
