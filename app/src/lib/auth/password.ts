/**
 * Password hashing with Node's built-in scrypt — no native deps, portable.
 * Format: scrypt$N$salt$hash (hex)
 */
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const N = 16384;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N }).toString("hex");
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [, nStr, salt, hash] = stored.split("$");
    const candidate = scryptSync(password, salt, 64, { N: parseInt(nStr, 10) });
    return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}
