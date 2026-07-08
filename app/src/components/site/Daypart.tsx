"use client";

/** Sets data-daypart on <html> from the visitor's local clock, so the site
 *  lives with the day: dawn alpona light, golden day, aarti dusk, deep night. */
import { useEffect } from "react";

export default function Daypart() {
  useEffect(() => {
    const apply = () => {
      const h = new Date().getHours();
      const part = h >= 5 && h < 9 ? "dawn" : h >= 9 && h < 16 ? "day" : h >= 16 && h < 20 ? "dusk" : "night";
      document.documentElement.setAttribute("data-daypart", part);
    };
    apply();
    const t = setInterval(apply, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return null;
}
