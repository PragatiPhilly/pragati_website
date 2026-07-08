import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import ProfileForms from "./ProfileForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.memberId) redirect("/login?next=/m/profile");
  const db = getDb();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, session.memberId));
  if (!m) redirect("/login?next=/m/profile"); // stale session (account removed / db reset)

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-8">Profile</h1>
      <ProfileForms
        member={{
          familyName: m.familyName,
          phone: m.phone ?? "",
          addressLine1: m.addressLine1 ?? "",
          city: m.city ?? "",
          state: m.state ?? "",
          zip: m.zip ?? "",
        }}
        email={session.email}
      />
    </div>
  );
}
