/**
 * Branded HTML email kit.
 *
 * Email clients are ~2005 HTML: no flexbox/grid, no <style> in Gmail's mobile
 * app, no external CSS. So everything here is tables + inline styles, and every
 * template also ships a plain-text body (see templates.ts) as the fallback.
 *
 * Palette mirrors the site: sindoor red, marigold, terracotta, cream.
 */

export const C = {
  sindoor: "#B3402A",
  sindoorDeep: "#8F2718",
  marigold: "#F2A63B",
  marigoldPale: "#FFD88A",
  terracotta: "#C2622F",
  leaf: "#3E7C3A",
  ink: "#2B211C",
  inkSoft: "#6B5D54",
  cream: "#FFFCF5",
  accentSoft: "#FBEEDC",
  line: "#EADFCB",
  white: "#FFFFFF",
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Outer shell: festive header bar, white content card, muted footer. */
export function shell(p: {
  orgName: string;
  preheader: string; // inbox preview line
  eyebrow?: string;
  title: string;
  body: string; // pre-built HTML blocks
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(p.title)}</title></head>
<body style="margin:0;padding:0;background:${C.accentSoft};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.accentSoft};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- header -->
  <tr><td style="background:${C.sindoor};border-radius:16px 16px 0 0;padding:22px 28px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-family:${FONT};color:${C.white};font-size:22px;font-weight:800;letter-spacing:.5px;">
        প্রগতি <span style="font-size:13px;font-weight:600;opacity:.9;letter-spacing:2px;">PRAGATI</span>
      </td>
      <td align="right" style="font-family:${FONT};color:${C.marigoldPale};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">
        Since 1972
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:${C.marigold};line-height:4px;font-size:0;">&nbsp;</td></tr>

  <!-- content -->
  <tr><td style="background:${C.cream};padding:32px 28px;">
    ${p.eyebrow ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.terracotta};">${esc(p.eyebrow)}</p>` : ""}
    <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:27px;line-height:1.25;color:${C.ink};font-weight:700;">${esc(p.title)}</h1>
    ${p.body}
  </td></tr>

  <!-- footer -->
  <tr><td style="background:${C.cream};border-radius:0 0 16px 16px;border-top:1px solid ${C.line};padding:20px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.inkSoft};">
    <p style="margin:0 0 4px;font-weight:700;color:${C.ink};">${esc(p.orgName)}</p>
    <p style="margin:0;">A 501(c)(3) nonprofit · Greater Philadelphia</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/**
 * Operational shell — for internal mail (backups, alerts, form submissions).
 * Deliberately unlike the festive member-facing shell: slate header, monospace
 * data, no warmth. You should be able to tell at a glance in a crowded inbox
 * whether an email is for a member or for you.
 */
export function systemShell(p: {
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  tone?: "neutral" | "alert";
}): string {
  const bar = p.tone === "alert" ? C.sindoor : "#3B4654";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(p.title)}</title></head>
<body style="margin:0;padding:0;background:#EEF1F4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <tr><td style="background:${bar};border-radius:12px 12px 0 0;padding:16px 24px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-family:${MONO};color:#fff;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">
        Pragati · ${esc(p.eyebrow)}
      </td>
      <td align="right" style="font-family:${MONO};color:rgba(255,255,255,.65);font-size:11px;">system</td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;padding:26px 24px;border-left:1px solid #D9DFE6;border-right:1px solid #D9DFE6;">
    <h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:1.3;color:#1B2430;font-weight:800;">${esc(p.title)}</h1>
    ${p.body}
  </td></tr>

  <tr><td style="background:#F7F9FB;border-radius:0 0 12px 12px;border:1px solid #D9DFE6;border-top:0;padding:14px 24px;font-family:${MONO};font-size:11px;color:#6B7784;">
    Automated message from the Pragati website. No reply needed.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Monospace key/value rows — for operational detail. */
export function dataRows(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #E3E8ED;border-radius:8px;">
  ${rows
    .map(
      ([k, v], i) =>
        `<tr style="background:${i % 2 ? "#F7F9FB" : "#fff"};">
      <td style="padding:9px 12px;font-family:${MONO};font-size:12px;color:#6B7784;width:38%;white-space:nowrap;">${esc(k)}</td>
      <td style="padding:9px 12px;font-family:${MONO};font-size:12px;color:#1B2430;font-weight:700;">${esc(v)}</td>
    </tr>`
    )
    .join("")}
</table>`;
}

/** Big glanceable counts — the "did the backup actually capture things?" check. */
export function statRow(stats: { label: string; value: string | number }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
  ${stats
    .map(
      (s) =>
        `<td align="center" style="padding:12px 6px;background:#F2F6F9;border:1px solid #E3E8ED;border-radius:8px;font-family:${FONT};">
      <div style="font-size:24px;font-weight:800;color:#1B2430;line-height:1;">${esc(String(s.value))}</div>
      <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#6B7784;margin-top:4px;">${esc(s.label)}</div>
    </td><td style="width:8px;">&nbsp;</td>`
    )
    .join("")}
</tr></table>`;
}

/** Attached-file manifest with a one-line purpose for each. */
export function fileList(files: { name: string; note: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
  ${files
    .map(
      (f) =>
        `<tr><td style="padding:9px 12px;border-left:3px solid ${C.marigold};background:#FFFDF7;font-family:${FONT};">
      <div style="font-family:${MONO};font-size:12px;font-weight:700;color:#1B2430;">📎 ${esc(f.name)}</div>
      <div style="font-size:12px;color:#6B7784;margin-top:2px;line-height:1.5;">${esc(f.note)}</div>
    </td></tr><tr><td style="height:6px;"></td></tr>`
    )
    .join("")}
</table>`;
}

/** Quoted free text (a contact-form message, for example). */
export function quote(text: string): string {
  return `<div style="margin:0 0 18px;padding:14px 16px;background:#F7F9FB;border-left:4px solid #9AA7B4;border-radius:6px;font-family:${FONT};font-size:14px;line-height:1.65;color:#1B2430;white-space:pre-wrap;">${esc(text)}</div>`;
}

export function para(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.ink};">${html}</p>`;
}

export function small(html: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.inkSoft};">${html}</p>`;
}

/**
 * A loud, unmissable statement block. Used for the things people MUST read:
 * timed check-in on concert passes, and "bring your student ID".
 */
export function alertBlock(p: { tone: "warn" | "info" | "good"; icon: string; title: string; body: string }): string {
  const bg = p.tone === "warn" ? "#FFF4E2" : p.tone === "good" ? "#EFF7EE" : C.accentSoft;
  const bar = p.tone === "warn" ? C.marigold : p.tone === "good" ? C.leaf : C.terracotta;
  const titleColor = p.tone === "warn" ? C.sindoorDeep : p.tone === "good" ? "#2F6B2B" : C.sindoor;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:${bg};border-left:5px solid ${bar};border-radius:10px;">
  <tr><td style="padding:14px 16px;font-family:${FONT};">
    <p style="margin:0 0 4px;font-size:14px;font-weight:800;color:${titleColor};letter-spacing:.3px;">${p.icon} ${esc(p.title)}</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${C.ink};">${p.body}</p>
  </td></tr></table>`;
}

/** Big confirmation-number plaque. */
export function confBox(conf: string, label = "Confirmation number"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${C.accentSoft};border-radius:12px;">
  <tr><td align="center" style="padding:16px;font-family:${FONT};">
    <p style="margin:0 0 2px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">${esc(label)}</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:700;color:${C.sindoor};letter-spacing:1px;">${esc(conf)}</p>
  </td></tr></table>`;
}

/** One attendee's pass, as a card with its own button. */
export function ticketCard(t: {
  name: string;
  type: string;
  meta?: string;
  price: string;
  passUrl: string;
  note?: string;
  badge?: string;
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:${C.white};border:1px solid ${C.line};border-radius:12px;">
  <tr><td style="padding:14px 16px;font-family:${FONT};">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:16px;font-weight:700;color:${C.ink};">🎟 ${esc(t.name)}</td>
      <td align="right" style="font-size:15px;font-weight:700;color:${C.ink};white-space:nowrap;">${esc(t.price)}</td>
    </tr></table>
    <p style="margin:3px 0 0;font-size:13px;color:${C.inkSoft};">${esc(t.type)}${t.meta ? ` · ${esc(t.meta)}` : ""}</p>
    ${t.badge ? `<p style="margin:8px 0 0;display:inline-block;background:${C.sindoor};color:${C.white};font-size:11px;font-weight:800;letter-spacing:1px;padding:4px 9px;border-radius:99px;">${esc(t.badge)}</p>` : ""}
    ${t.note ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;color:${C.sindoorDeep};">⏰ ${esc(t.note)}</p>` : ""}
    <p style="margin:12px 0 0;"><a href="${t.passUrl}" style="font-family:${FONT};font-size:13px;font-weight:700;color:${C.sindoor};text-decoration:none;border:1.5px solid ${C.sindoor};border-radius:99px;padding:8px 16px;display:inline-block;">Open this pass →</a></p>
  </td></tr></table>`;
}

/** Money breakdown. rows: [label, value, emphasise?] */
export function summaryTable(rows: [string, string, boolean?][]): string {
  const body = rows
    .map(
      ([label, value, strong]) =>
        `<tr>
        <td style="padding:7px 0;font-family:${FONT};font-size:14px;color:${strong ? C.ink : C.inkSoft};font-weight:${strong ? 800 : 400};${strong ? `border-top:2px solid ${C.line};` : ""}">${esc(label)}</td>
        <td align="right" style="padding:7px 0;font-family:${FONT};font-size:14px;color:${C.ink};font-weight:${strong ? 800 : 600};${strong ? `border-top:2px solid ${C.line};` : ""}">${esc(value)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">${body}</table>`;
}

export function button(label: string, url: string, variant: "solid" | "ghost" = "solid"): string {
  const style =
    variant === "solid"
      ? `background:${C.sindoor};color:${C.white};border:2px solid ${C.sindoor};`
      : `background:${C.white};color:${C.sindoor};border:2px solid ${C.sindoor};`;
  return `<a href="${url}" style="font-family:${FONT};display:inline-block;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:99px;${style}">${esc(label)}</a>`;
}

/** Two buttons side by side, stacking safely on mobile. */
export function buttonRow(buttons: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr>${buttons
    .map((b) => `<td style="padding:0 8px 8px 0;">${b}</td>`)
    .join("")}</tr></table>`;
}

export function divider(): string {
  return `<div style="height:1px;background:${C.line};margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>`;
}

export function sectionLabel(text: string): string {
  return `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${C.terracotta};">${esc(text)}</p>`;
}
