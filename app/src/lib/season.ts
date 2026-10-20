/**
 * Server side of thank-you mode — reads config / the active event.
 * The rules themselves are in season-model.ts. Spec: spec/16-post-event-mode.md
 */
import { cache } from "react";
import { getConfig, getAllConfig } from "@/lib/system-config";
import { getActiveEvent } from "@/lib/queries/events";
import { buildRecap, eventHasEnded, parsePostEventMode, type PostEventMode, type Recap } from "@/lib/season-model";

export * from "@/lib/season-model";

export async function getPostEventMode(): Promise<PostEventMode> {
  return parsePostEventMode(await getConfig<string>("post_event_mode"));
}

export async function getRecap(event: Parameters<typeof buildRecap>[1]): Promise<Recap> {
  return buildRecap(await getAllConfig(), event);
}

/**
 * Is there anything a visitor could register for right now? Drives the
 * "Register for the next event" links in the mobile menu and footer.
 * Cached per request — Header and Footer both ask.
 */
export const publicRegistrationOpen = cache(async (): Promise<boolean> => {
  try {
    const [paused, active] = await Promise.all([
      getConfig<string>("registration_paused"),
      getActiveEvent(),
    ]);
    return (
      paused !== "yes" && !!active && active.status === "published" && !eventHasEnded(active)
    );
  } catch {
    // never let a nav link take a page down — fall back to showing it
    return true;
  }
});
