"use client";

/**
 * One Register call-to-action, always — never two on screen at once.
 *
 * The page already has real Register buttons (the hero, and the invitation
 * section further down). Rather than adding a competing button, this watches
 * those buttons with an IntersectionObserver and only surfaces a floating pill
 * when NONE of them are in view. Scroll to the top or to the invitation and it
 * quietly retracts.
 *
 * Why this scales across every screen: it keys off what's actually visible in
 * the viewport, not CSS breakpoints. A tall desktop showing the hero keeps the
 * pill hidden; a small phone that scrolls past it in 200px shows it — with no
 * per-device rules to maintain. The pill itself is full-width above the thumb on
 * narrow screens and a compact corner pill from `sm` up.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export default function FloatingRegister({ label = "Register", note }: { label?: string; note?: string }) {
  const [show, setShow] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll("[data-register-cta]"));
    if (targets.length === 0) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setShow(visible.size === 0);
      },
      // a little margin so the pill doesn't flicker right as a button leaves
      { rootMargin: "-80px 0px -40px 0px", threshold: 0.01 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.94 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed z-40 print:hidden bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Link
            href="/register"
            className="group flex items-center justify-center gap-3 rounded-full px-6 py-4 sm:py-3.5 font-bold shadow-[0_12px_36px_-8px_rgba(143,39,24,0.6)]"
            style={{ background: "var(--sindoor)", color: "var(--cream)" }}
          >
            <span className="text-[15px]">
              {label}
              {note && <span className="hidden sm:inline font-medium opacity-85"> · {note}</span>}
            </span>
            <motion.span
              aria-hidden
              className="text-lg leading-none"
              animate={reduce ? undefined : { x: [0, 5, 0] }}
              transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
            >
              →
            </motion.span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
