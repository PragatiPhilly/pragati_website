import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import FamilyManager from "./FamilyManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "My family" };

export default async function FamilyPage() {
  const session = await getSession();
  if (!session?.memberId) redirect("/login?next=/m/family");
  const db = getDb();
  const family = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.memberId, session.memberId));

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-2">My family</h1>
      <p className="mb-8" style={{ color: "var(--ink-soft)" }}>
        These people appear pre-loaded when you register for events — with the right ticket type and food preference.
      </p>
      <FamilyManager
        family={family.map((f) => ({
          id: f.id,
          firstName: f.firstName,
          lastName: f.lastName ?? "",
          relationship: f.relationship,
          dateOfBirth: f.dateOfBirth,
          foodPref: f.foodPref ?? "non_veg",
          dietaryNotes: f.dietaryNotes ?? "",
        }))}
      />
    </div>
  );
}
