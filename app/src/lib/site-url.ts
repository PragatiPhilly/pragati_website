/**
 * The site's base URL with any trailing slash(es) stripped, so building
 * `siteUrl("/path")` never yields a double slash.
 *
 * This matters beyond looks: the Square webhook signature is computed over the
 * EXACT notification URL. A trailing slash in NEXT_PUBLIC_SITE_URL makes our
 * URL `https://host//api/webhooks/square` while Square signs over the single-
 * slash URL you registered — the signatures then never match and every webhook
 * is rejected, so payments never get marked paid. Always build URLs through
 * this helper.
 */
export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  if (!path) return base;
  return base + (path.startsWith("/") ? path : `/${path}`);
}
