/**
 * OFFLINE GATE SHEET — the event-day fail-safe.
 *
 * Downloads a single self-contained HTML file with every paid attendee
 * embedded in it: search, food color codes, and tap-to-mark check-in that
 * persists in the browser (localStorage). It needs NO server, NO database,
 * NO internet once downloaded — if the app or DB dies mid-event, the gate
 * keeps moving from this file on any phone or laptop.
 *
 * Download it fresh on event morning (Admin → Scan desk or Scan setup).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { getActiveEvent } from "@/lib/queries/events";
import { getConfig } from "@/lib/system-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !["admin", "super_admin", "volunteer"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const event = await getActiveEvent();
  const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.status, "paid"));
  const regById = new Map(regs.map((r) => [r.id, r]));
  const tickets = (await db.select().from(schema.tickets)).filter((t) => regById.has(t.registrationId));

  const colors = {
    veg: await getConfig<string>("food_color_veg"),
    non_veg: await getConfig<string>("food_color_non_veg"),
    kid: await getConfig<string>("food_color_kid"),
  };

  const rows = tickets
    .map((t) => {
      const r = regById.get(t.registrationId)!;
      return {
        n: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(), // name
        c: r.confirmationNumber, // conf
        b: r.buyerName, // buyer
        p: r.buyerPhone ?? "", // phone
        d: t.dayKey ?? "all", // day
        f: t.foodPref ?? "none", // food
        q: t.qrCode.slice(-8), // QR tail for spot-matching against a shown pass
        in: t.checkedInAt ? t.checkedInAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) : "",
      };
    })
    .sort((a, b) => a.n.localeCompare(b.n));

  const generated = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  // </script>-safe JSON embedding
  const data = JSON.stringify({ event: event?.name ?? "Pragati event", generated, colors, rows }).replaceAll("<", "\\u003c");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gate sheet — ${(event?.name ?? "Pragati").replaceAll("<", "")}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#faf5ec;color:#2a2438}
  header{position:sticky;top:0;background:#c8102e;color:#fff;padding:12px 16px;z-index:2}
  header h1{margin:0;font-size:17px}header p{margin:2px 0 8px;font-size:12px;opacity:.9}
  input{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:0;border-radius:10px}
  .counts{padding:8px 16px;font-size:13px;color:#6b5d55;display:flex;gap:14px;flex-wrap:wrap}
  ul{list-style:none;margin:0;padding:0 10px 60px}
  li{background:#fff;margin:6px 0;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);cursor:pointer}
  li.done{opacity:.45}li.done .nm{text-decoration:line-through}
  .dot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
  .nm{font-weight:700;font-size:15px}.meta{font-size:11.5px;color:#6b5d55}
  .tick{margin-left:auto;font-size:22px;color:#3e7c3a;min-width:28px;text-align:center}
  .warn{background:#fdeaea;color:#8f1d1d;padding:10px 16px;font-size:12.5px}
</style></head><body>
<header><h1>🎟 Offline gate sheet</h1><p id=sub></p><input id=q placeholder="Search name, phone, or PRG-…" autofocus></header>
<div class=warn>⚠ Emergency backup — use only if the online scan desk is down. Marks are saved on THIS device only. Snapshot taken: <b id=gen></b>; anyone who registered after that is not on this list (check their confirmation email).</div>
<div class=counts><span id=cin></span><span id=ctot></span></div>
<ul id=list></ul>
<script>
const D=${data};
const K="pragati-gate-"+D.generated;
let marks={};try{marks=JSON.parse(localStorage.getItem(K)||"{}")}catch(e){}
const save=()=>{try{localStorage.setItem(K,JSON.stringify(marks))}catch(e){}};
document.getElementById("sub").textContent=D.event+" — "+D.rows.length+" paid attendees";
document.getElementById("gen").textContent=D.generated+" ET";
const FOOD={veg:"VEG",non_veg:"NON-VEG",kid:"KID",none:"no food"};
const list=document.getElementById("list");
function render(f){
  f=(f||"").toLowerCase();const dg=f.replace(/\\D/g,"");
  list.innerHTML="";let inN=0;
  D.rows.forEach((r,i)=>{
    const pre=r.in?1:0;const marked=marks[i]||pre;if(marked)inN++;
    if(f&&!(r.n.toLowerCase().includes(f)||r.b.toLowerCase().includes(f)||r.c.toLowerCase().includes(f)||(dg.length>3&&r.p.replace(/\\D/g,"").includes(dg))))return;
    const li=document.createElement("li");if(marked)li.className="done";
    li.innerHTML='<span class=dot style="background:'+(D.colors[r.f]||"#999")+'"></span><span><span class=nm></span><br><span class=meta></span></span><span class=tick>'+(marked?"✓":"")+"</span>";
    li.querySelector(".nm").textContent=r.n;
    li.querySelector(".meta").textContent=r.c+" · "+r.b+(r.p?" · "+r.p:"")+" · "+(r.d==="all"?"all days":r.d)+" · "+(FOOD[r.f]||r.f)+" · QR…"+r.q+(r.in?" · was in at "+r.in:"");
    li.onclick=()=>{marks[i]=!(marks[i]||pre)?1:0;if(pre&&!marks[i])marks[i]=0;save();render(document.getElementById("q").value)};
    list.appendChild(li);
  });
  document.getElementById("cin").textContent="✓ in: "+inN;
  document.getElementById("ctot").textContent="total: "+D.rows.length;
}
document.getElementById("q").oninput=e=>render(e.target.value);
render("");
</script></body></html>`;

  await db.insert(schema.auditLog).values({
    userId: session.userId,
    action: "gate_sheet_downloaded",
    entityType: "tickets",
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="pragati-gate-sheet-${new Date().toISOString().slice(0, 10)}.html"`,
    },
  });
}
