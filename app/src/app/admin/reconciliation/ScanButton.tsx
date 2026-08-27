"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scanNow } from "./actions";

export default function ScanButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const router = useRouter();

  return (
    <div className="scan">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await scanNow(30);
            setOk(r.ok);
            setMsg(r.message);
            router.refresh();
          })
        }
      >
        {pending ? "Checking Square…" : "Check against Square now"}
      </button>
      {msg && <p className={ok ? "res ok" : "res bad"}>{msg}</p>}
    </div>
  );
}
