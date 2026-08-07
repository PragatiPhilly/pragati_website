/**
 * The registration flow's first step advances with a plain button, not a form
 * submit — so `required` on the inputs never fires and this function is the ONLY
 * client-side guard. Phone was missing from it once, which let a buyer skip the
 * field entirely and reach step 9 before the server rejected them. These tests
 * exist so that can't happen again.
 */
import { describe, it, expect } from "vitest";
import { buyerStepError, isPhone } from "../src/lib/validation";

const ok = {
  buyerName: "Sayantan Kundu",
  buyerEmail: "sayantan@example.com",
  buyerPhone: "+1 5551234567",
  selfIsStudent: false,
  studentEduEmail: "",
};

describe("registration buyer step", () => {
  it("lets a complete entry through", () => {
    expect(buyerStepError(ok)).toBeNull();
  });

  it("blocks a missing phone — the bug that let people skip the field", () => {
    expect(buyerStepError({ ...ok, buyerPhone: "" })).toMatch(/mobile number/i);
  });

  it("blocks a phone that is only whitespace or punctuation", () => {
    for (const bad of ["   ", "+1", "()-", "12"]) {
      expect(buyerStepError({ ...ok, buyerPhone: bad })).toMatch(/mobile number/i);
    }
  });

  it("blocks a missing name and a bad email", () => {
    expect(buyerStepError({ ...ok, buyerName: "  " })).toMatch(/name/i);
    expect(buyerStepError({ ...ok, buyerEmail: "nope" })).toMatch(/email/i);
  });

  it("still requires a phone on the student path", () => {
    const student = { ...ok, selfIsStudent: true, studentEduEmail: "me@uni.edu", buyerEmail: "", buyerPhone: "" };
    expect(buyerStepError(student)).toMatch(/mobile number/i);
    expect(buyerStepError({ ...student, buyerPhone: "+1 5551234567" })).toBeNull();
  });

  it("requires the .edu address before it gets as far as the phone", () => {
    const student = { ...ok, selfIsStudent: true, studentEduEmail: "not-an-email", buyerPhone: "" };
    expect(buyerStepError(student)).toMatch(/school/i);
  });

  it("accepts international numbers — members are not all US-based", () => {
    for (const good of ["+91 9876543210", "+880 1712345678", "+44 7911123456"]) {
      expect(buyerStepError({ ...ok, buyerPhone: good })).toBeNull();
      expect(isPhone(good, true)).toBe(true);
    }
  });
});
