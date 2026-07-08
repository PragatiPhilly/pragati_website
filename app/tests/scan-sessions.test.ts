/**
 * Scan-window semantics against a real (in-memory) PGlite DB:
 * - ensureScanTables DDL runs clean (same SQL runs in production Postgres)
 * - a ticket scans AT MOST once per window (unique index, race-safe insert)
 * - the same ticket works again in a different window (lunch ≠ dinner)
 * - magazines are unique per year
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://scan-tests";
process.env.APP_ENV = "test";

import { getDb, schema } from "../src/db/client";
import { ensureScanTables } from "../src/lib/scans/ensure";

let lunchId = "";
let dinnerId = "";
const ticketId = "tkt-1";

beforeAll(async () => {
  await ensureScanTables();
  const db = getDb();

  const [lunch] = await db
    .insert(schema.scanSessions)
    .values({ eventId: "evt-1", kind: "lunch", dayKey: "sat", label: "Sat · Lunch", status: "open" })
    .returning();
  const [dinner] = await db
    .insert(schema.scanSessions)
    .values({ eventId: "evt-1", kind: "dinner", dayKey: "sat", label: "Sat · Dinner", status: "open" })
    .returning();
  lunchId = lunch.id;
  dinnerId = dinner.id;
});

describe("scan windows", () => {
  it("first scan in a window succeeds", async () => {
    const db = getDb();
    const inserted = await db
      .insert(schema.ticketScans)
      .values({ sessionId: lunchId, ticketId, scannedBy: "staff-1" })
      .onConflictDoNothing()
      .returning();
    expect(inserted).toHaveLength(1);
  });

  it("second scan of the same QR in the same window is rejected (duplicate)", async () => {
    const db = getDb();
    const inserted = await db
      .insert(schema.ticketScans)
      .values({ sessionId: lunchId, ticketId, scannedBy: "staff-2" })
      .onConflictDoNothing()
      .returning();
    expect(inserted).toHaveLength(0); // flagged as ALREADY SERVED

    // the original scan record is intact (who + when)
    const [prev] = await db
      .select()
      .from(schema.ticketScans)
      .where(and(eq(schema.ticketScans.sessionId, lunchId), eq(schema.ticketScans.ticketId, ticketId)));
    expect(prev.scannedBy).toBe("staff-1");
  });

  it("the same QR works again in a different window (dinner after lunch)", async () => {
    const db = getDb();
    const inserted = await db
      .insert(schema.ticketScans)
      .values({ sessionId: dinnerId, ticketId, scannedBy: "staff-1" })
      .onConflictDoNothing()
      .returning();
    expect(inserted).toHaveLength(1);
  });

  it("a window is unique per event + meal + day", async () => {
    const db = getDb();
    const dup = await db
      .insert(schema.scanSessions)
      .values({ eventId: "evt-1", kind: "lunch", dayKey: "sat", label: "Sat · Lunch again" })
      .onConflictDoNothing()
      .returning();
    expect(dup).toHaveLength(0);
  });
});

describe("magazines", () => {
  it("one magazine per year — same-year upload must replace, not duplicate", async () => {
    const db = getDb();
    await db
      .insert(schema.magazines)
      .values({ year: 2024, title: "Pragati Patrika · 2024", fileUrl: "/magazines/a.pdf", bytes: 10 });
    await expect(
      db
        .insert(schema.magazines)
        .values({ year: 2024, title: "Second 2024", fileUrl: "/magazines/b.pdf", bytes: 10 })
    ).rejects.toThrow(); // unique index holds
  });
});
