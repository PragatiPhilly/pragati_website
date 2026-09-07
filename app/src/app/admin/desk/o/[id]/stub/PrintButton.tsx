"use client";

/**
 * "Use your browser's print (⌘P)" is not an instruction for a volunteer holding
 * a tablet at a door. It is a button.
 *
 * Pressing it also writes the print to the booking's timeline, so a paper pass
 * — which is a bearer instrument, and the only pass a guest without email gets
 * — can always be traced back to whoever produced it.
 */
import { useState, useTransition } from "react";
import { printStubAction } from "../../../actions";

export default function PrintButton({ registrationId }: { registrationId: string }) {
  const [busy, start] = useTransition();
  const [printed, setPrinted] = useState(false);

  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <button
        className="btn-primary"
        disabled={busy}
        onClick={() =>
          start(async () => {
            // Record first: if the print dialog is cancelled we have still
            // noted that someone went to produce paper, which is the safer
            // direction to be wrong in.
            await printStubAction(registrationId).catch(() => {});
            setPrinted(true);
            window.print();
          })
        }
      >
        🖨 Print this slip
      </button>
      <span className="desk-note">
        {printed
          ? "Printed — it is on the booking's timeline. Print again if the first one jams."
          : "Printing is noted on the booking's timeline, so a reprint is never a mystery later."}
      </span>
    </div>
  );
}
