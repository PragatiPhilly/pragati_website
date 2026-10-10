/**
 * Where Square sends someone after paying membership dues at the walk-in desk.
 * Deliberately reads nothing: the guest may be on their own phone (not signed
 * in) or on the desk tablet (signed in as a volunteer). The desk confirms the
 * payment with Square itself.
 */
export const metadata = { title: "Thank you" };

export default function MembershipDonePage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <p className="text-6xl mb-5">🪔</p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-3">Thank you!</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Your membership payment went through. Please show this screen at the desk — the volunteer will confirm it and
        your membership email will follow.
      </p>
    </div>
  );
}
