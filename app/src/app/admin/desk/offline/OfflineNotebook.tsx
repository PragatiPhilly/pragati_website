"use client";

/**
 * Everything here works with no connection once the page has loaded: entries
 * live in this tablet's browser storage until they sync. Nothing is lost if the
 * sync fails — the entry stays, with the reason, and can be retried.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { importOfflineEntryAction } from "../online-actions";

type Pass = { id: string; name: string; band: string; withFood: boolean; priceCents: number };
type Person = { name: string; ticketTypeId: string; age: string; foodPref: "veg" | "non_veg" };
type Entry = {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  people: { name: string; ticketTypeId: string; age?: number; foodPref: "veg" | "non_veg" | "kid" | "none" }[];
  payment: "cash" | "zelle_org" | "unpaid";
  amountCents: number;
  note?: string;
  takenBy: string;
  sync?: { state: "done" | "error"; conf?: string; message?: string; at: string };
};

const KEY = "pragati-offline-walkins-v1";
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const load = (): Entry[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
const save = (list: Entry[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function OfflineNotebook({ passes, takenBy, eventName }: { passes: Pass[]; takenBy: string; eventName: string }) {
  // Most walk-ins are adults eating with us — start there, not on whatever pass is listed first.
  const defaultPass = (passes.find((p) => p.band === "adult" && p.withFood) ?? passes[0])?.id ?? "";
  const [online, setOnline] = useState(true);
  const [list, setList] = useState<Entry[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [buyerName, setBuyerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [people, setPeople] = useState<Person[]>([{ name: "", ticketTypeId: defaultPass, age: "", foodPref: "non_veg" }]);
  const [payment, setPayment] = useState<Entry["payment"]>("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setList(load());
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const passOf = (id: string) => passes.find((p) => p.id === id);
  const total = useMemo(() => people.reduce((n, p) => n + (passOf(p.ticketTypeId)?.priceCents ?? 0), 0), [people]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = list.filter((e) => e.sync?.state !== "done");

  const syncAll = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    let cur = load();
    for (const e of cur.filter((x) => x.sync?.state !== "done")) {
      try {
        const r = await importOfflineEntryAction(e);
        cur = load().map((x) =>
          x.id === e.id
            ? {
                ...x,
                sync: r.ok
                  ? { state: "done" as const, conf: r.data?.conf, message: r.data?.notes.join(" "), at: new Date().toISOString() }
                  : { state: "error" as const, message: r.error, at: new Date().toISOString() },
              }
            : x
        );
      } catch {
        // still offline / server unreachable — leave it pending
        break;
      }
      save(cur);
      setList(cur);
    }
    setSyncing(false);
  }, [syncing]);

  useEffect(() => {
    if (!online || pending.length === 0) return;
    const t = setTimeout(syncAll, 1500);
    return () => clearTimeout(t);
  }, [online, pending.length, syncAll]);

  const add = () => {
    setMsg("");
    if (!buyerName.trim()) return setMsg("Write the family name.");
    if (people.some((p) => !p.name.trim() || !p.ticketTypeId)) return setMsg("Every person needs a name and a pass.");
    const entry: Entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      buyerName: buyerName.trim(),
      buyerPhone: phone.trim() || undefined,
      buyerEmail: email.trim() || undefined,
      people: people.map((p) => {
        const pass = passOf(p.ticketTypeId);
        const kid = pass?.band.startsWith("child");
        return {
          name: p.name.trim(),
          ticketTypeId: p.ticketTypeId,
          age: p.age ? Number(p.age) : undefined,
          foodPref: !pass?.withFood || pass.band === "concert" ? "none" : kid ? "kid" : p.foodPref,
        };
      }),
      payment,
      amountCents: payment === "unpaid" ? 0 : Math.round(Number(amount || (total / 100).toFixed(2)) * 100),
      note: note.trim() || undefined,
      takenBy,
    };
    const next = [entry, ...load()];
    setStorageOk(save(next));
    setList(next);
    setBuyerName("");
    setPhone("");
    setEmail("");
    setPeople([{ name: "", ticketTypeId: defaultPass, age: "", foodPref: "non_veg" }]);
    setAmount("");
    setNote("");
    setMsg(`Saved on this tablet ✓ ${online ? "Syncing…" : "It will sync when the Wi-Fi is back."}`);
  };

  const downloadCsv = () => {
    const rows = [["written", "family", "phone", "email", "people", "payment", "amount", "synced", "booking", "notes"]];
    for (const e of list)
      rows.push([
        e.createdAt,
        e.buyerName,
        e.buyerPhone ?? "",
        e.buyerEmail ?? "",
        e.people.map((p) => `${p.name} (${passOf(p.ticketTypeId)?.name ?? "?"}, ${p.foodPref})`).join("; "),
        e.payment,
        (e.amountCents / 100).toFixed(2),
        e.sync?.state ?? "pending",
        e.sync?.conf ?? "",
        e.sync?.message ?? "",
      ]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `offline-walkins-${new Date().toISOString().slice(0, 16)}.csv`;
    a.click();
  };

  return (
    <div className="desk-shell max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Offline notebook</h1>
        <span className={`desk-chip ${online ? "chip-ok" : "chip-stop"}`}>{online ? "online" : "OFFLINE — saving on this tablet"}</span>
      </div>
      <p className="desk-note">
        {eventName}. For when the Wi-Fi is down: write each walk-in family here. Keep this tab open — entries stay on this tablet and turn
        into normal walk-in bookings automatically when the connection is back. Students: take them at the desk later.
      </p>
      {!storageOk && <p className="desk-error">This browser won&apos;t save entries (private mode?). Write on paper and download the list below.</p>}

      <div className="festive-card p-4 flex flex-col gap-3">
        <div className="desk-grid2">
          <label className="desk-field">
            Family name (who is paying)
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </label>
          <label className="desk-field">
            Phone
            <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="desk-field">
            Email (optional)
            <input value={email} inputMode="email" onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        {people.map((p, i) => {
          const pass = passOf(p.ticketTypeId);
          const adultFood = pass?.withFood && !pass.band.startsWith("child") && pass.band !== "concert";
          return (
            <div key={i} className="desk-grid2" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <label className="desk-field">
                Person {i + 1} name
                <input value={p.name} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              </label>
              <label className="desk-field">
                Pass
                <select value={p.ticketTypeId} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, ticketTypeId: e.target.value } : x)))}>
                  {passes.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name} — {money(ps.priceCents)}
                    </option>
                  ))}
                </select>
              </label>
              {pass?.band.startsWith("child") && (
                <label className="desk-field">
                  Age
                  <input value={p.age} inputMode="numeric" onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, age: e.target.value.replace(/\D/g, "").slice(0, 2) } : x)))} />
                </label>
              )}
              {adultFood && (
                <label className="desk-field">
                  Food
                  <select value={p.foodPref} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, foodPref: e.target.value as Person["foodPref"] } : x)))}>
                    <option value="non_veg">Non-veg</option>
                    <option value="veg">Veg</option>
                  </select>
                </label>
              )}
              {people.length > 1 && (
                <button type="button" className="text-xs underline self-end" onClick={() => setPeople(people.filter((_, j) => j !== i))}>
                  remove
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn-secondary self-start"
          onClick={() => setPeople([...people, { name: "", ticketTypeId: defaultPass, age: "", foodPref: "non_veg" }])}
        >
          + Another person
        </button>

        <div className="kind-row">
          {(
            [
              ["cash", "💵 Paid cash"],
              ["zelle_org", "📱 Zelle to Pragati"],
              ["unpaid", "Not paid yet"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="kind-btn" aria-pressed={payment === k} onClick={() => setPayment(k)}>
              {label}
            </button>
          ))}
        </div>
        {payment !== "unpaid" && (
          <label className="desk-field">
            Amount received (price written down: {money(total)})
            <input value={amount} inputMode="decimal" placeholder={(total / 100).toFixed(2)} onChange={(e) => setAmount(e.target.value)} />
          </label>
        )}
        <label className="desk-field">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" className="btn-primary" onClick={add}>
          Save this family
        </button>
        {msg && <p className="desk-note">{msg}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">
          On this tablet ({list.length}) · {pending.length} waiting to sync
        </h2>
        <button type="button" className="btn-secondary" disabled={!online || syncing || pending.length === 0} onClick={syncAll}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        <button type="button" className="btn-secondary" disabled={list.length === 0} onClick={downloadCsv}>
          Download list (CSV)
        </button>
      </div>
      <div className="festive-card overflow-hidden">
        {list.length === 0 && <p className="desk-note p-4">Nothing written down yet.</p>}
        {list.map((e) => (
          <div key={e.id} className="desk-row">
            <span className="grow">
              <strong>{e.buyerName}</strong>
              <span className="desk-note">
                {" "}
                · {e.people.length} {e.people.length === 1 ? "person" : "people"} · {e.payment === "unpaid" ? "not paid" : `${money(e.amountCents)} ${e.payment === "cash" ? "cash" : "Zelle"}`} ·{" "}
                {new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
              {e.sync?.message && <span className="desk-note block">{e.sync.message}</span>}
            </span>
            {e.sync?.state === "done" ? (
              <a className="desk-chip chip-ok" href={`/admin/desk`}>
                synced · {e.sync.conf}
              </a>
            ) : e.sync?.state === "error" ? (
              <span className="desk-chip chip-stop">needs a look</span>
            ) : (
              <span className="desk-chip chip-warn">waiting</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
