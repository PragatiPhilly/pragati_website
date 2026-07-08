"use client";

import { useTransition } from "react";
import { setActiveEventAction } from "./actions";

export default function SetActiveButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn-secondary !py-2 !px-4 text-xs"
      disabled={pending}
      onClick={() => startTransition(() => setActiveEventAction(slug))}
    >
      {pending ? "…" : "Make active (theme + homepage)"}
    </button>
  );
}
