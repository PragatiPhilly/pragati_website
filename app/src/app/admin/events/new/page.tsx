import EventForm from "../EventForm";
import { requireSectionAccess } from "@/lib/auth/access";
import { suggestHomeBoxFor } from "@/lib/home-box-server";

export const dynamic = "force-dynamic";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireSectionAccess("events");
  const suggestedBox = await suggestHomeBoxFor(null);
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-8">New event</h1>
      <EventForm
        suggestedBox={suggestedBox}
        initial={{
          name: "",
          nameBengali: "",
          slug: "",
          theme: "none",
          description: "",
          startsAt: "",
          endsAt: "",
          venueName: "",
          venueAddress: "",
          venueMapUrl: "",
          status: "draft",
          ticketTypes: [
            { name: "Adult · with food", ageBand: "adult", dayKeys: [], checkInStart: null, withFood: true, priceMember: 0, priceNonmember: 0, capacity: null },
          ],
          promoCodes: [],
        }}
      />
    </div>
  );
}
