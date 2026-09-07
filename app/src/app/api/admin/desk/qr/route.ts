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

  // A payment link may arrive RELATIVE — the dev Square simulator returns
  // "/pay/square-simulator?…", and a self-hosted payment page would too. A
  // relative path is useless in a QR code (a phone camera has no idea what it
  // is relative to), so resolve it against this request's own origin. Before
  // this, such a link silently produced a broken image on the one screen where
  // a guest is standing there waiting to scan something.
  let url: URL;
  try {
    url = new URL(raw, req.nextUrl.origin);
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
