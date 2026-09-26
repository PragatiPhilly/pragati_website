/**
 * Plain-English labels for a ticket, shared by the public ticket views
 * (Find my tickets, print, the QR page). Display only — nothing here changes
 * what a ticket is or how it scans.
 */

/** "18:00" → "6:00 PM" (event-local clock time as stored on the ticket type). */
export function fmtClock(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const d = new Date(`2000-01-01T${hhmm}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Stored food preference → what a guest reads. */
export function foodLabel(pref: string | null | undefined): string {
  switch (pref) {
    case 'veg':
      return 'Veg meal';
    case 'non_veg':
      return 'Non-veg meal';
    case 'kid':
      return "Kid's meal";
    default:
      return 'No meal';
  }
}

/** "sat" → "Saturday, Oct 10" using the event's own day labels. */
export function dayLabel(dayKey: string | null | undefined, days: { key: string; label?: string }[]): string {
  if (!dayKey || dayKey === 'all') return 'All days';
  return days.find((d) => d.key === dayKey)?.label ?? dayKey.toUpperCase();
}

/** One line describing a ticket, e.g. "Saturday, Oct 10 · 🎶 Concert · no meal · entry from 6:00 PM". */
export function ticketDetail(
  t: { dayKey: string | null; foodPref: string | null },
  type: { ageBand: string; checkInStart?: string | null } | undefined,
  days: { key: string; label?: string }[],
): string {
  const parts = [dayLabel(t.dayKey, days)];
  const concert = type?.ageBand === 'concert';
  if (concert) parts.push('🎶 Concert', 'no meal');
  else parts.push(foodLabel(t.foodPref));
  const time = fmtClock(type?.checkInStart);
  if (time) parts.push(`entry from ${time}`);
  return parts.join(' · ');
}
