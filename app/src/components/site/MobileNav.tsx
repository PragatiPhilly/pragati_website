"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

export default function MobileNav({
  nav,
  signedIn,
  isAdmin,
}: {
  nav: readonly { label: string; href: string }[];
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        aria-label="Menu"
        className="w-10 h-10 grid place-items-center rounded-xl hairline"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="grid gap-1.5">
          <span className="block w-5 h-0.5 rounded transition-transform" style={{ background: "var(--ink)", transform: open ? "translateY(4px) rotate(45deg)" : "none" }} />
          <span className="block w-5 h-0.5 rounded transition-opacity" style={{ background: "var(--ink)", opacity: open ? 0 : 1 }} />
          <span className="block w-5 h-0.5 rounded transition-transform" style={{ background: "var(--ink)", transform: open ? "translateY(-4px) rotate(-45deg)" : "none" }} />
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-16 border-b shadow-xl"
            style={{ background: "var(--card)", borderColor: "var(--line)" }}
          >
            <div className="px-5 py-4 grid gap-1">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-xl px-4 py-3 font-medium hover:bg-[var(--accent-soft)] transition-colors" onClick={() => setOpen(false)}>
                  {n.label}
                </Link>
              ))}
              <Link href="/register" className="rounded-xl px-4 py-3 font-medium hover:bg-[var(--accent-soft)] transition-colors" onClick={() => setOpen(false)}>
                Register for the next event
              </Link>
              {signedIn ? (
                <Link href={isAdmin ? "/admin" : "/m"} className="rounded-xl px-4 py-3 font-semibold hover:bg-[var(--accent-soft)] transition-colors" style={{ color: "var(--sindoor)" }} onClick={() => setOpen(false)}>
                  {isAdmin ? "Admin" : "My Pragati"}
                </Link>
              ) : (
                <>
                  <Link href="/login" className="rounded-xl px-4 py-3 font-medium hover:bg-[var(--accent-soft)] transition-colors" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                  <Link href="/signup" className="rounded-xl px-4 py-3 font-semibold hover:bg-[var(--accent-soft)] transition-colors" style={{ color: "var(--sindoor)" }} onClick={() => setOpen(false)}>
                    Become a member
                  </Link>
                </>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
