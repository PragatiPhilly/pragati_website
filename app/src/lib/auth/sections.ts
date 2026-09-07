/**
 * The admin section catalogue and its nav grouping.
 *
 * Deliberately a SEPARATE, DEPENDENCY-FREE module rather than part of
 * access.ts. Client components (the sidebar, the roles matrix) need this data,
 * and access.ts imports the session and the database — importing a value from
 * it in a "use client" file drags `fs`, `net` and `tls` into the browser bundle
 * and the page dies at runtime while `tsc` and `next build` both stay silent.
 *
 * Rule: pure data and pure functions here; anything that touches the request or
 * the database stays in access.ts.
 */
export type SectionKey =
  | "dashboard" | "payments" | "reconciliation" | "zelle" | "registrations" | "donations" | "members" | "events"
  | "checkin" | "scans" | "kitchen" | "desk" | "desk_money" | "media" | "magazines" | "messages" | "emails"
  | "email_preview" | "roles" | "audit" | "settings";

/**
 * Nav groups.
 *
 * A flat list stopped working somewhere around a dozen sections — you cannot
 * scan nineteen equally-weighted links, you can only hunt through them. Grouping
 * by the QUESTION someone arrived with ("did the money come in?", "who is
 * coming?", "it's event day") beats grouping by which database table a page
 * happens to read.
 *
 * `defaultOpen: false` marks the groups nobody opens on a normal day. They still
 * expand on click and are remembered per person — the point is only that the
 * sidebar fits on a laptop screen the first time you see it.
 */
export type NavGroupKey = "money" | "people" | "eventday" | "content" | "comms" | "system";

export type NavGroup = { key: NavGroupKey; label: string; defaultOpen: boolean };

export const NAV_GROUPS: NavGroup[] = [
  { key: "money", label: "Money", defaultOpen: true },
  { key: "people", label: "People", defaultOpen: true },
  { key: "eventday", label: "Event day", defaultOpen: true },
  { key: "comms", label: "Communication", defaultOpen: false },
  { key: "content", label: "Content", defaultOpen: false },
  { key: "system", label: "System", defaultOpen: false },
];

/** `group` omitted = pinned above the groups (currently just the dashboard). */
export type Section = { key: SectionKey; label: string; href: string; icon: string; group?: NavGroupKey };

/** Every admin section, in nav order. */
export const SECTIONS: Section[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", icon: "◫" },

  { key: "payments", label: "Payments", href: "/admin/payments", icon: "💰", group: "money" },
  { key: "reconciliation", label: "Reconciliation", href: "/admin/reconciliation", icon: "⚖️", group: "money" },
  { key: "zelle", label: "Zelle queue", href: "/admin/payments/pending-zelle", icon: "⏳", group: "money" },
  { key: "donations", label: "Donations", href: "/admin/donations", icon: "🎁", group: "money" },
  // Money the desk took that is NOT in the org account yet — cash in a drawer,
  // an undeposited cheque, a Zelle sitting in someone's personal account.
  { key: "desk_money", label: "Money to bank", href: "/admin/desk/treasury", icon: "🏦", group: "money" },

  { key: "registrations", label: "Registrations", href: "/admin/registrations", icon: "🎟", group: "people" },
  { key: "members", label: "Members", href: "/admin/members", icon: "👪", group: "people" },

  { key: "events", label: "Events", href: "/admin/events", icon: "📅", group: "eventday" },
  { key: "checkin", label: "Scan desk", href: "/admin/checkin", icon: "✅", group: "eventday" },
  { key: "desk", label: "Walk-in desk", href: "/admin/desk", icon: "🧾", group: "eventday" },
  { key: "scans", label: "Scan setup", href: "/admin/scans", icon: "📲", group: "eventday" },
  { key: "kitchen", label: "Kitchen", href: "/admin/kitchen", icon: "🍛", group: "eventday" },

  { key: "messages", label: "Messages", href: "/admin/messages", icon: "✉", group: "comms" },
  { key: "emails", label: "Email log", href: "/admin/emails", icon: "📧", group: "comms" },
  { key: "email_preview", label: "Email previews", href: "/admin/emails/preview", icon: "🔍", group: "comms" },

  { key: "media", label: "Photos", href: "/admin/media", icon: "🖼", group: "content" },
  { key: "magazines", label: "Magazines", href: "/admin/magazines", icon: "📖", group: "content" },

  { key: "roles", label: "Roles & access", href: "/admin/roles", icon: "🔑", group: "system" },
  { key: "audit", label: "Audit log", href: "/admin/audit", icon: "📜", group: "system" },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: "⚙", group: "system" },
];

/** Sections in `list`, arranged into their groups. Empty groups are dropped. */
export function groupSections(list: Section[]): { group: NavGroup; items: Section[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: list.filter((s) => s.group === group.key),
  })).filter((g) => g.items.length > 0);
}
