/**
 * Which festival look the public site wears — Spec: spec/17-kali-theme.md
 *
 *   site_theme = auto       → follow the active event's theme (Admin → Events)
 *              = durga | kali | saraswati → force that look, whatever the
 *                active event is (e.g. switch to Kali now, before the Kali
 *                Pujo event itself has been created)
 *
 * Staff screens (admin, print, the gate page) always stay on the light palette
 * — see `data-force-light` in styles/globals.css.
 */
import { cache } from "react";
import { site, type ThemeName } from "@/config/site";
import { getConfig } from "@/lib/system-config";
import { getActiveEvent } from "@/lib/queries/events";

export const THEMES: readonly ThemeName[] = site.themes;

export function isTheme(v: unknown): v is ThemeName {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

/** Pure rule, unit-tested: a forced setting wins, else the event, else Durga. */
export function resolveTheme(setting: unknown, eventTheme: unknown): ThemeName {
  const s = String(setting ?? "").trim().toLowerCase();
  if (isTheme(s)) return s;
  if (isTheme(eventTheme)) return eventTheme;
  return site.defaultTheme;
}

/** The theme for this request (cached — layout and pages both ask). */
export const getSiteTheme = cache(async (): Promise<ThemeName> => {
  try {
    const [setting, event] = await Promise.all([getConfig<string>("site_theme"), getActiveEvent()]);
    return resolveTheme(setting, event?.theme);
  } catch {
    return site.defaultTheme;
  }
});
