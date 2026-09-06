/**
 * QR for an arbitrary URL, rendered by us.
 *
 * The desk shows a Square payment link as a QR so the guest pays on their own
 * phone rather than handing a card to a volunteer. That QR must not come from a
 * third-party image service: a venue with bad wi-fi and a blocked domain would
 * silently show a broken image at exactly the moment somebody is trying to pay.
 * Same `qrcode` dependency the ticket QRs already use.
 *
 * Staff only, and it will only encode Square payment links — this endpoint is
 * not a general-purpose QR generator for anything an attacker fancies.
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireSectionAccess } from "@/lib/auth/access";

const ALLOWED_HOSTS = [/(^|\.)squareup\.com$/i, /(^|\.)square\.link$/i, /(^|\.)squareupsandbox\.com$/i];

export async function GET(req: NextRequest) {
  await requireSectionAccess("desk");
  const raw = req.nextUrl.searchParams.get("data") ?? "";
  if (!raw) return NextResponse.json({ error: "Missing data" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Not a URL" }, { status: 400 });
  }
  const sameOrigin = url.host === req.nextUrl.host;
  if (!sameOrigin && !ALLOWED_HOSTS.some((re) => re.test(url.hostname)))
    return NextResponse.json({ error: "That host isn't allowed here" }, { status: 400 });

  const png = await QRCode.toBuffer(url.toString(), {
    width: 420,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2A2438", light: "#FFFFFF" },
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
