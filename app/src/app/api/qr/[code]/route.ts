/**
 * Renders a ticket QR code as PNG.
 * The QR encodes a URL (/t/<code>) so ANY phone camera can scan it and land
 * on the live ticket page — where admins get one-tap check-in.
 * The code itself is the auth token (unguessable UUID).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema } from "@/db/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getDb();
  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.qrCode, code));
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const png = await QRCode.toBuffer(`${base}/t/${code}`, {
    width: 480,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2A2438", light: "#FFFFFF" },
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
