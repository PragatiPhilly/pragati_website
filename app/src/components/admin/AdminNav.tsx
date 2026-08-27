"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroupKey } from "@/lib/auth/sections";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: string;
  /** Number worth interrupting someone for — pending Zelle, open findings. */
  badge?: number;
};

export type NavGroupView = {
  key: NavGroupKey;
  label: string;
  defaultOpen: boolean;
  items: NavItem[];
};

const STORAGE_KEY = "pragati.admin.nav.open";

/**
 * Admin sidebar.
 *
 * Three things it has to do that a flat list of links did not:
 *
 *  1. GROUP. Nineteen equally-weighted links can only be hunted through. The
 *     groups are named for the question you arrived with — "Money", "Event day" —
 *     not for the tables the pages read.
 *
 *  2. STAY SHORT. Groups collapse, the choice is remembered per person, and the
 *     group holding the current page is always open. Low-traffic groups start
 *     closed so the whole thing fits on a laptop the first time you see it.
 *     A collapsed group still shows its badge total, so nothing urgent hides.
 *
 *  3. WORK ON A PHONE. The scan desk and kitchen screens are used standing up at
 *     the venue. Below `lg` this is a drawer behind a header button, not a
 *     240px column eating half the screen.
 */
export default function AdminNav({
  pinned,
  groups,
  footer,
}: {
  pinned: NavItem[];
  groups: NavGroupView[];
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean> | null>(null);
  const [drawer, setDrawer] = useState(false);

  // Longest matching href wins, so /admin/payments/pending-zelle highlights the
  // Zelle queue rather than Payments, and /admin only matches itself.
  const activeHref = [...pinned, ...groups.flatMap((g) => g.items)]
    .map((i) => i.href)
    .filter((href) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)))
    .sort((a, b) => b.length - a.length)[0];

  const activeGroup = groups.find((g) => g.items.some((i) => i.href === activeHref))?.key;

  useEffect(() => {
    let stored: Record<string, boolean> = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      /* first visit, or storage unavailable — fall back to the defaults */
    }
    setOpen(Object.fromEntries(groups.map((g) => [g.key, stored[g.key] ?? g.defaultOpen])));
    // groups are static per render of the server layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = { ...(prev ?? {}), [key]: !(prev ?? {})[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* the nav still works, it just won't be remembered */
      }
      return next;
    });
  };

  // Before hydration `open` is null; fall back to the defaults so the first
  // paint is the same shape as what comes after it.
  const isOpen = (g: NavGroupView) => (g.key === activeGroup ? true : (open?.[g.key] ?? g.defaultOpen));

  useEffect(() => setDrawer(false), [pathname]);

  // With every group expanded the list is taller than a laptop screen, so the
  // page you are actually on can start out scrolled past. Bring it into view.
  useEffect(() => {
    if (!activeHref) return;
    document
      .querySelector(`.adminnav-link[href="${CSS.escape(activeHref)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeHref, open]);

  const link = (i: NavItem) => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={i.href === activeHref ? "page" : undefined}
      className={`adminnav-link${i.href === activeHref ? " is-active" : ""}`}
    >
      <span className="adminnav-icon" aria-hidden="true">
        {i.icon}
      </span>
      <span className="adminnav-label">{i.label}</span>
      {i.badge ? <span className="adminnav-badge">{i.badge}</span> : null}
    </Link>
  );

  return (
    <>
      {/* mobile header */}
      <div className="adminnav-topbar">
        <button
          className="adminnav-burger"
          onClick={() => setDrawer((d) => !d)}
          aria-expanded={drawer}
          aria-controls="admin-nav"
        >
          <span aria-hidden="true">{drawer ? "✕" : "☰"}</span>
          <span>Menu</span>
        </button>
        <Link href="/" className="adminnav-brand">
          <span className="adminnav-bangla">প্রগতি</span>
          <span>Admin</span>
        </Link>
      </div>

      {drawer && <button className="adminnav-scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}

      <aside id="admin-nav" className={`adminnav${drawer ? " is-open" : ""}`}>
        <Link href="/" className="adminnav-header">
          <span className="adminnav-bangla">প্রগতি</span>
          <span className="adminnav-title">Admin</span>
        </Link>

        <nav className="adminnav-scroll">
          {pinned.length > 0 && <div className="adminnav-pinned">{pinned.map(link)}</div>}

          {groups.map((g) => {
            const expanded = isOpen(g);
            const hidden = g.items.reduce((n, i) => n + (i.badge ?? 0), 0);
            return (
              <section key={g.key} className="adminnav-group">
                <button
                  className="adminnav-grouphead"
                  onClick={() => toggle(g.key)}
                  aria-expanded={expanded}
                  disabled={g.key === activeGroup}
                >
                  <span className="adminnav-chevron" aria-hidden="true">
                    {expanded ? "▾" : "▸"}
                  </span>
                  <span>{g.label}</span>
                  {!expanded && hidden > 0 && <span className="adminnav-badge adminnav-badge--group">{hidden}</span>}
                </button>
                {expanded && <div className="adminnav-items">{g.items.map(link)}</div>}
              </section>
            );
          })}
        </nav>

        <div className="adminnav-footer">{footer}</div>
      </aside>
    </>
  );
}
