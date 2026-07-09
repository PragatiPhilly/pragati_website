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
      // Coarse gate only: any staff role may enter /admin. Which SECTIONS a
      // role can open is decided per-page by requireSectionAccess() using the
      // matrix in Roles & access (the DB isn't reachable from this proxy).
      const isStaff = role === "admin" || role === "super_admin" || role === "volunteer";
      if (!isStaff) {
        return NextResponse.redirect(new URL("/", req.url));
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
