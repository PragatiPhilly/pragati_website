"use client";

import { useState, useTransition } from "react";
import { markZellePaidAction, cancelZelleAction } from "./actions";

export default function ZelleQueueRow(props: {
  kind: "registration" | "donation";
  id: string;
  conf: string;
  who: string;
  amount: string;
  sentClicked: string;
  created: string;
}) {
  const [confirming, setConfirming] = useState<"paid" | "cancel" | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-t" style={{ borderColor: "var(--line)" }}>
      <td className="px-4 py-3 font-mono text-xs font-bold">{props.conf}</td>
      <td className="px-4 py-3">{props.who}</td>
      <td className="px-4 py-3 font-semibold">{props.amount}</td>
      <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>{props.sentClicked}</td>
      <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>{props.created}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          {confirming === null ? (
            <>
              <button className="btn-primary !py-1.5 !px-4 text-xs" onClick={() => setConfirming("paid")}>
                Mark paid
              </button>
              <button className="btn-secondary !py-1.5 !px-4 text-xs" onClick={() => setConfirming("cancel")}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="text-xs self-center mr-1" style={{ color: "var(--ink-soft)" }}>
                {confirming === "paid" ? `Verified ${props.amount} in the bank?` : "Cancel this order?"}
              </span>
              <button
                className="btn-primary !py-1.5 !px-4 text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if (confirming === "paid") await markZellePaidAction(props.kind, props.id);
                    else await cancelZelleAction(props.kind, props.id);
                  })
                }
              >
                {pending ? "…" : "Yes, confirm"}
              </button>
              <button className="btn-secondary !py-1.5 !px-4 text-xs" onClick={() => setConfirming(null)}>
                Back
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
