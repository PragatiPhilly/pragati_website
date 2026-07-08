/**
 * Signed JWT session cookies (jose). 30-day sessions.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "pragati_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type SessionUser = {
  userId: string;
  email: string;
  role: "member" | "admin" | "super_admin" | "volunteer";
  memberId?: string;
  name?: string;
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    // Anyone who knows the fallback string could forge an admin session —
    // refuse to run in production without a real secret.
    throw new Error("SESSION_SECRET must be set in production (generate one: openssl rand -base64 32).");
  }
  return new TextEncoder().encode(s ?? "dev-secret-do-not-use");
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await getSession();
  if (!s || (s.role !== "admin" && s.role !== "super_admin")) {
    throw new Error("UNAUTHORIZED");
  }
  return s;
}
