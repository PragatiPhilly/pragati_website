"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkInTicketAction } from "@/app/admin/checkin/actions";

export default function ScanCheckInButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  if (state === "done") {
    return (
      <div className="mt-6 rounded-2xl px-5 py-4 text-center" style={{ background: "rgba(92,138,58,0.15)" }}>
        <p className="text-lg font-black" style={{ color: "var(--leaf-deep)" }}>
          ✅ Checked in — welcome! 🪔
        </p>
      </div>
    );
  }

  return (
    <button
      className="btn-primary w-full mt-6 text-xl !py-5"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        await checkInTicketAction(ticketId);
        setState("done");
        setTimeout(() => router.refresh(), 900);
      }}
    >
      {state === "busy" ? "Checking in…" : "✓ Check in now"}
    </button>
  );
}
