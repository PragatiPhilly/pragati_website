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

/**
 * Gate for the "who are the tickets for" step of the registration flow.
 *
 * This lives here, apart from the component, because that flow advances with a
 * plain button rather than submitting a <form>. Nothing native validates it —
 * the step is the ONLY client-side guard, and when phone was missing from this
 * list a buyer could skip it entirely and only be stopped by the server at the
 * very last step. Returns an error message, or null when the step may proceed.
 */
export function buyerStepError(input: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  selfIsStudent: boolean;
  studentEduEmail: string;
}): string | null {
  if (!input.buyerName.trim()) return "Please enter your name to continue.";
  if (input.selfIsStudent) {
    if (!isEmail(input.studentEduEmail)) {
      return "Please enter your school (.edu) email — it's required for the student rate.";
    }
  } else if (!isEmail(input.buyerEmail)) {
    return "Please enter a valid email so we can send your tickets.";
  }
  if (!isPhone(input.buyerPhone, true)) {
    return "Please add a mobile number — we may need to reach you about your tickets.";
  }
  return null;
}

/** Keep only digits + a single decimal point (for money amounts). */
export function amountOnly(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
}
