import { describe, it, expect } from "vitest";
import { verifySquareSignature, signSquareWebhook } from "../src/lib/payments/square";

const url = "https://example.org/api/webhooks/square";

describe("Square webhook signature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event_id: "evt-1", type: "payment.updated" });
    const sig = signSquareWebhook(body, url);
    expect(verifySquareSignature(body, sig, url)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const body = JSON.stringify({ event_id: "evt-1", amount: 100 });
    const sig = signSquareWebhook(body, url);
    const tampered = JSON.stringify({ event_id: "evt-1", amount: 99999 });
    expect(verifySquareSignature(tampered, sig, url)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifySquareSignature("{}", null, url)).toBe(false);
  });

  it("rejects a signature for a different URL", () => {
    const body = "{}";
    const sig = signSquareWebhook(body, "https://evil.example.com/hook");
    expect(verifySquareSignature(body, sig, url)).toBe(false);
  });
});
