/**
 * The caterer shown on the signboard over the homepage Pujo menu.
 * Admin → Settings ("Pujo menu — caterer") turns it on/off and names it;
 * Admin → Photos ("Caterer logo") picks the logo. Never throws — the
 * homepage must render even if config or media can't be read.
 */
import { getConfig } from "@/lib/system-config";
import { getCatererLogo } from "@/lib/media/queries";

export type Caterer = {
  name: string;
  url: string | null;
  logo: { src: string; width: number; height: number };
};

const BUNDLED_LOGO = { src: "/brand/caterer-logo.jpg", width: 825, height: 207 };

export async function getCaterer(): Promise<Caterer | null> {
  try {
    if ((await getConfig<string>("caterer_enabled")) !== "yes") return null;
    const name = ((await getConfig<string>("caterer_name")) ?? "").trim() || "Our caterer";
    const rawUrl = ((await getConfig<string>("caterer_url")) ?? "").trim();
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : null;

    const img = await getCatererLogo();
    // smallest variant that is still sharp at ~2× the board's width
    const w = img ? (img.variants.find((v) => v >= 640) ?? img.variants[img.variants.length - 1]) : undefined;
    const logo =
      img && w
        ? { src: `/media/${img.fileBase}-${w}.webp`, width: img.width, height: img.height }
        : BUNDLED_LOGO;
    return { name, url, logo };
  } catch {
    return null;
  }
}
