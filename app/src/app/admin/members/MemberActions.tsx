"use client";

import { useTransition } from "react";
import { setMemberStatusAction } from "./actions";

export default function MemberActions({ memberId, status }: { memberId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex justify-end gap-2">
      {status !== "active" && (
        <button
          className="btn-primary !py-1.5 !px-4 text-xs"
          disabled={pending}
          onClick={() => startTransition(() => setMemberStatusAction(memberId, "active"))}
        >
          {pending ? "…" : "Activate ✓"}
        </button>
      )}
      {status === "active" && (
        <button
          className="btn-secondary !py-1.5 !px-4 text-xs"
          disabled={pending}
          onClick={() => startTransition(() => setMemberStatusAction(memberId, "inactive"))}
        >
          {pending ? "…" : "Mark inactive"}
        </button>
      )}
    </div>
  );
}
