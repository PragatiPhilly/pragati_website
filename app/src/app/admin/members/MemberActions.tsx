"use client";

import { useActionState, useState, useTransition } from "react";
import { activateMemberAction, deactivateMemberAction, type MemberActionState } from "./actions";

/**
 * Activation opens a short form instead of firing immediately, because flipping
 * a member to active is a financial event: it has to say how much was paid and
 * how, so the money lands in the ledger and the Payments log stays truthful.
 */
export default function MemberActions({
  memberId,
  status,
  duesCents,
  paidLabel,
}: {
  memberId: string;
  status: string;
  duesCents: number;
  paidLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, action, submitting] = useActionState<MemberActionState, FormData>(activateMemberAction, undefined);

  if (status === "active") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          className="btn-secondary !py-1.5 !px-4 text-xs"
          disabled={pending}
          onClick={() => startTransition(() => deactivateMemberAction(memberId))}
        >
          {pending ? "…" : "Mark inactive"}
        </button>
        {paidLabel && (
          <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {paidLabel}
          </span>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <button className="btn-primary !py-1.5 !px-4 text-xs" onClick={() => setOpen(true)}>
          Record dues &amp; activate →
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-2 justify-items-end min-w-[15rem]">
      <input type="hidden" name="memberId" value={memberId} />
      <div className="flex gap-2 w-full">
        <label className="grid gap-1 flex-1">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Amount</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={(duesCents / 100).toFixed(2)}
            className="input !py-1.5 text-xs"
          />
        </label>
        <label className="grid gap-1 flex-1">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Method</span>
          <select name="method" defaultValue="zelle" className="input !py-1.5 text-xs">
            <option value="zelle">Zelle</option>
            <option value="offline">Cash / cheque</option>
            <option value="square">Card</option>
            <option value="comped">Comped</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1 w-full">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Reference (optional)</span>
        <input name="reference" placeholder="Zelle memo, cheque no…" className="input !py-1.5 text-xs" />
      </label>
      {state?.error && (
        <p className="text-[11px] w-full" style={{ color: "var(--sindoor)" }}>{state.error}</p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn-primary !py-1.5 !px-4 text-xs" disabled={submitting}>
          {submitting ? "Saving…" : "Activate ✓"}
        </button>
      </div>
    </form>
  );
}
