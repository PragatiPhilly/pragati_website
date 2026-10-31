/**
 * The event switcher at the top of the money / people tabs (spec/19).
 * Opens on the current event; picking a past event loads that event's data on
 * every tab that shows this bar, with an amber "archive view" banner.
 */
import { getLens, lensOptions } from "@/lib/seasons";
import EventLensPicker from "./EventLensPicker";

export default async function EventLens({ note }: { note?: string }) {
  const lens = await getLens();
  if (!lens) return null;
  const options = await lensOptions();
  if (options.length < 2 && lens.isCurrent) return null;
  return <EventLensPicker current={{ id: lens.event.id, name: lens.event.name, isCurrent: lens.isCurrent }} options={options} note={note} />;
}
