/**
 * Click-audit crawler: visits every internal link reachable from key entry
 * pages (as guest, member, and admin) and reports any that don't resolve.
 * Usage: node scripts/crawl-audit.mjs <baseUrl> <memberToken> <adminToken>
 */
const [base, memberToken, adminToken] = process.argv.slice(2);

const contexts = [
  { name: "guest", cookie: "" },
  { name: "member", cookie: `pragati_session=${memberToken}` },
  { name: "admin", cookie: `pragati_session=${adminToken}` },
];

const seeds = {
  guest: ["/", "/events", "/about", "/donate", "/lookup", "/login", "/signup", "/register", "/register?mode=dayof"],
  member: ["/", "/m", "/m/family", "/m/tickets", "/m/profile", "/register"],
  admin: ["/admin", "/admin/payments/pending-zelle", "/admin/registrations", "/admin/donations", "/admin/members", "/admin/events", "/admin/events/new", "/admin/checkin", "/admin/emails", "/admin/audit", "/admin/settings"],
};

const hrefRe = /href="(\/[^"#][^"]*)"/g;
const bad = [];
const okCounts = {};

for (const ctx of contexts) {
  const seen = new Set();
  const queue = [...seeds[ctx.name]];
  let checked = 0;
  while (queue.length && checked < 120) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    checked++;
    let res;
    try {
      res = await fetch(base + path, { headers: ctx.cookie ? { cookie: ctx.cookie } : {}, redirect: "manual" });
    } catch (e) {
      bad.push(`[${ctx.name}] ${path} → FETCH ERROR ${e.message}`);
      continue;
    }
    const status = res.status;
    const redirect = res.headers.get("location") ?? "";
    if (status >= 400) {
      bad.push(`[${ctx.name}] ${path} → ${status}`);
      continue;
    }
    if (status >= 300) {
      // auth redirects to /login are expected for guests on protected pages
      if (!(redirect.includes("/login") || redirect === "/" || redirect.startsWith("/?"))) {
        bad.push(`[${ctx.name}] ${path} → ${status} ${redirect} (unexpected)`);
      }
      continue;
    }
    // crawl further links from HTML pages
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) {
      const html = await res.text();
      for (const m of html.matchAll(hrefRe)) {
        const href = m[1].split("#")[0];
        if (!href || seen.has(href)) continue;
        if (href.startsWith("/api/qr/") || href.startsWith("/_next")) continue;
        queue.push(href);
      }
    }
  }
  okCounts[ctx.name] = checked;
}

console.log("checked:", JSON.stringify(okCounts));
if (bad.length) {
  console.log("PROBLEMS:");
  for (const b of bad) console.log(" ", b);
  process.exit(1);
} else {
  console.log("ALL LINKS OK");
}
