"use client";

/**
 * Scopes the cream→terracotta scroll gradient (`.home-bg` in globals.css) to
 * the homepage only, by toggling a class on <body>. Other pages keep the
 * default background.
 */
import { useEffect } from "react";

export default function HomeBackground() {
  useEffect(() => {
    document.body.classList.add("home-bg");
    return () => document.body.classList.remove("home-bg");
  }, []);
  return null;
}
