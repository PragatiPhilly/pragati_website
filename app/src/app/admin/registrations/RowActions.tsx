"use client";

import { useState, useTransition } from "react";
import { resendTicketsAction, deleteRegistrationAction, markPaidCashAction, updateBuyerEmailAction } from "./actions";

export default function RowActions({
  registrationId,
  conf,
  status,
  passesHref,
}: {
  registrationId: string;
  conf: string;
  status: string;
  passesHref: string;
}) {
  const [confirming, setConfirming] = useState<null | "delete" | "cash">(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const paid = status === "paid";
  const flash = (msg: string, sticky = false) => {
    setNote(msg);
    if (!sticky) setTimeout(() => setNote(""), 4000);
  };

  if (note) {
    return <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--leaf-deep)" }}>{note}</span>;
  }

  if (confirming) {
    const isDelete = confirming === "delete";
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs" style={{ color: isDelete ? "var(--sindoor)" : "var(--ink-soft)" }}>
          {isDelete ? `Delete ${conf} permanently?` : `Received payment at the counter for ${conf}?`}
        </span>
        <button
          className="btn-primary !py-1.5 !px-3 text-xs"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = isDelete ? await deleteRegistrationAction(registrationId) : await markPaidCashAction(registrationId);
              flash(res.message, isDelete);
              setConfirming(null);
            })
          }
        >
          {pending ? "…" : "Yes, confirm"}
        </button>
        <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setConfirming(null)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      {paid && (
        <>
          <a href={passesHref} className="btn-secondary !py-1.5 !px-3 text-xs whitespace-nowrap">
            🎟 Passes
          </a>
          <button
            className="btn-secondary !py-1.5 !px-3 text-xs whitespace-nowrap"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await resendTicketsAction(registrationId);
                flash(res.message);
              })
            }
          >
            {pending ? "…" : "✉ Resend"}
          </button>
        </>
      )}
      {(status === "pending_payment" || status === "pending_zelle_verification") && (
        <button className="btn-primary !py-1.5 !px-3 text-xs whitespace-nowrap" onClick={() => setConfirming("cash")}>
          💵 Mark paid
        </button>
      )}
      <button
        className="btn-secondary !py-1.5 !px-3 text-xs whitespace-nowrap"
        disabled={pending}
        onClick={() => {
          const newEmail = window.prompt(`New email for ${conf}? (tickets will be resent if paid)`);
          if (!newEmail) return;
          startTransition(async () => {
            const res = await updateBuyerEmailAction(registrationId, newEmail);
            flash(res.message);
          });
        }}
      >
        ✎ Email
      </button>
      <button
        className="!py-1.5 !px-3 text-xs rounded-full font-semibold"
        style={{ color: "var(--sindoor)", border: "1.5px solid var(--line)" }}
        onClick={() => setConfirming("delete")}
      >
        Delete
      </button>
    </div>
  );
}
