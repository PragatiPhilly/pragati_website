/**
 * Shared, dependency-free field validators — usable on BOTH the client (instant
 * feedback) and the server (authoritative). Keep these in sync with any zod
 * schemas so the two never disagree.
 */

/** Practical email check: something@something.tld (no spaces). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}

/** Just the digits of a phone number (drops +, spaces, dashes, parentheses). */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Valid if empty-and-optional, or 7–15 digits (the E.164 range, incl. country code). */
export function isPhone(value: string | null | undefined, required = false): boolean {
  const raw = (value ?? "").trim();
  if (!raw) return !required;
  const d = phoneDigits(raw);
  return d.length >= 7 && d.length <= 15;
}

/** A non-empty, reasonable-length human name. */
export function isName(value: string | null | undefined): boolean {
  const t = (value ?? "").trim();
  return t.length >= 1 && t.length <= 120;
}

/** Keep only digits, capped to `max` characters (for age, year, etc.). */
export function digitsOnly(value: string, max = 4): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** Keep only digits + a single decimal point (for money amounts). */
export function amountOnly(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
}
