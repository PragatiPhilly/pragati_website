import EventForm from "../EventForm";
import { requireSectionAccess } from "@/lib/auth/access";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireSectionAccess("events");
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-8">New event</h1>
      <EventForm
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
            { name: "Adult · with food", ageBand: "adult", fullPass: true, withFood: true, priceMember: 0, priceNonmember: 0, capacity: null },
          ],
          promoCodes: [],
        }}
      />
    </div>
  );
}
