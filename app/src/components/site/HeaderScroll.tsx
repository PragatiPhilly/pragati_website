"use client";

/**
 * Marks the page as "scrolled" so the sticky header can condense + frost as the
 * user scrolls down (see `.site-header` rules in globals.css). Toggles a data
 * attribute on <html> — CSS does the animation.
 */
import { useEffect } from "react";

export default function HeaderScroll() {
  useEffect(() => {
    const onScroll = () => {
      document.documentElement.setAttribute("data-scrolled", window.scrollY > 16 ? "1" : "0");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
