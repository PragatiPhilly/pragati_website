/**
 * Human-readable confirmation numbers: PRG-YYYY-NNNN (tickets), DON-YYYY-NNNN (donations).
 * Sequential per year via the counters table. Spec: 05-payments.md.
 */
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export async function nextConfirmationNumber(prefix: "PRG" | "DON"): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const rows = await db
    .insert(schema.counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({
      target: schema.counters.key,
      set: { value: sql`${schema.counters.value} + 1` },
    })
    .returning({ value: schema.counters.value });
  const n = rows[0].value;
  return `${key}-${String(n).padStart(4, "0")}`;
}

export function makeQrCode(): string {
  return `PRAGATI-TKT-${crypto.randomUUID()}`;
}
