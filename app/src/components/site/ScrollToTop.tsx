"use client";

import { useEffect, useState } from "react";

export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-40 grid place-items-center rounded-full"
      style={{
        width: 50,
        height: 50,
        background: "var(--sindoor)",
        color: "var(--cream)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(14px)",
        pointerEvents: show ? "auto" : "none",
        transition: "opacity 0.3s ease, transform 0.3s ease, background 0.2s ease",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
