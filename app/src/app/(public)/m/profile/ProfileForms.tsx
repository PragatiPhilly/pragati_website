"use client";

import { useActionState } from "react";
import { updateProfileAction, changePasswordAction, type FormState } from "../actions";

export default function ProfileForms({
  member,
  email,
}: {
  member: { familyName: string; phone: string; addressLine1: string; city: string; state: string; zip: string };
  email: string;
}) {
  const [pState, pAction, pPending] = useActionState<FormState, FormData>(updateProfileAction, undefined);
  const [wState, wAction, wPending] = useActionState<FormState, FormData>(changePasswordAction, undefined);

  return (
    <div className="grid gap-6 max-w-xl">
      <form action={pAction} className="festive-card p-6 grid gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Contact details</h2>
        <p className="text-sm -mt-2" style={{ color: "var(--ink-soft)" }}>Signed in as {email}</p>
        <input name="familyName" defaultValue={member.familyName} placeholder="Family name" className="input" />
        <input name="phone" defaultValue={member.phone} placeholder="Phone" className="input" />
        <input name="addressLine1" defaultValue={member.addressLine1} placeholder="Address" className="input" />
        <div className="grid grid-cols-3 gap-3">
          <input name="city" defaultValue={member.city} placeholder="City" className="input" />
          <input name="state" defaultValue={member.state} placeholder="State" className="input" />
          <input name="zip" defaultValue={member.zip} placeholder="ZIP" className="input" />
        </div>
        {pState?.ok && <p className="text-sm font-medium" style={{ color: "var(--leaf-deep)" }}>Saved ✓</p>}
        <button className="btn-primary !py-2.5 w-fit" disabled={pPending}>{pPending ? "Saving…" : "Save changes"}</button>
      </form>

      <form action={wAction} className="festive-card p-6 grid gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Change password</h2>
        <input name="current" type="password" required placeholder="Current password" className="input" />
        <input name="next" type="password" required minLength={8} placeholder="New password (8+ characters)" className="input" />
        {wState?.error && (
          <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
            {wState.error}
          </p>
        )}
        {wState?.ok && <p className="text-sm font-medium" style={{ color: "var(--leaf-deep)" }}>Password updated ✓</p>}
        <button className="btn-primary !py-2.5 w-fit" disabled={wPending}>{wPending ? "Updating…" : "Update password"}</button>
      </form>
    </div>
  );
}
