import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "pragati_session";

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAdmin = pathname.startsWith("/admin");
  const needsAuth = needsAdmin || pathname.startsWith("/m");
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  const loginUrl = new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url);
  if (!token) return NextResponse.redirect(loginUrl);

  try {
    // Same rule as lib/auth/session.ts: never fall back to the dev secret in
    // production — a known secret would let anyone forge an admin session.
    if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
      return NextResponse.redirect(loginUrl);
    }
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-do-not-use");
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string;
    if (needsAdmin) {
      const fullAdmin = role === "admin" || role === "super_admin";
      // volunteers may use ONLY the check-in desk
      const volunteerAllowed = role === "volunteer" && pathname.startsWith("/admin/checkin");
      if (!fullAdmin && !volunteerAllowed) {
        return NextResponse.redirect(new URL(role === "volunteer" ? "/admin/checkin" : "/", req.url));
      }
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/m/:path*"],
};
